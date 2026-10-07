"""题库管理与按档案、尝试查询和保存练习历史。"""

from datetime import datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, delete, func, case
from sqlalchemy.orm import Session
from api.dependencies import DatabaseEngine
from api.http_policy import LocalApiRoute
from db.practice_records import (PracticeRecord, PracticeAttempt, record_fields, attempt_fields,
                                 create_record, save_attempt, find_record, lock_records)
from db.custom_exercises import CustomExercise

router = APIRouter(prefix="/api/local-data", route_class=LocalApiRoute)
R, A = PracticeRecord, PracticeAttempt
attempt_time = func.coalesce(A.started_at, A.completed_at)


class AttemptBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attempt: dict
    updatedAt: str
    title: str = Field(min_length=1)


class HistoryQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["preset", "custom", "random", "ai"]
    exerciseId: str = Field(min_length=1)
    mode: Literal["tapping", "dictation"]
    exercise: dict


class ProgressQuery(BaseModel):
    targets: list[HistoryQuery] = Field(max_length=50)


def summary(session, row):
    total, passed, completed, independent, viewed = session.execute(select(
        func.count(A.id), func.sum(case((A.passed.is_(True), 1), else_=0)),
        func.sum(case((A.completed_at.is_not(None), 1), else_=0)),
        func.sum(case((A.completed_at.is_not(None) & A.viewed_answer.is_(False), 1), else_=0)),
        func.sum(case((A.viewed_answer.is_(True), 1), else_=0)),
    ).where(A.record_id == row.id)).one()
    return {**record_fields(row), "attemptCount": total, "passedCount": passed or 0,
            "completedCount": completed or 0, "independentCount": independent or 0, "viewedAnswerCount": viewed or 0}


def attempt_page(session, row, page, size):
    meta = summary(session, row)
    pages = max(1, (meta["attemptCount"] + size - 1) // size)
    page = min(page, pages)
    items = session.scalars(select(A).where(A.record_id == row.id)
        .order_by(func.julianday(attempt_time).desc(), A.id.desc()).offset((page - 1) * size).limit(size)).all()
    return {"record": meta, "attempts": [attempt_fields(item, row.mode) for item in reversed(items)],
            "page": page, "pages": pages, "total": meta["attemptCount"], "pageSize": size}


@router.get("/records/summary")
def records_summary(engine: DatabaseEngine):
    with Session(engine) as session:
        return {"recordCount": session.scalar(select(func.count()).select_from(R)),
                "attemptCount": session.scalar(select(func.count()).select_from(A))}


@router.get("/records")
def list_records(engine: DatabaseEngine, mode: Literal["all", "tapping", "dictation"] = "all",
                 page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
                 after: datetime | None = None, before: datetime | None = None, zone: str = "UTC"):
    try:
        tz = ZoneInfo(zone)
    except ZoneInfoNotFoundError:
        raise HTTPException(422, "时区无效") from None
    before = before or datetime.now(timezone.utc)
    if before.tzinfo is None or (after is not None and after.tzinfo is None):
        raise HTTPException(422, "时间须包含时区")
    conditions = [func.julianday(attempt_time) <= func.julianday(before.isoformat())]
    if after is not None:
        conditions.append(func.julianday(attempt_time) >= func.julianday(after.isoformat()))
    if mode != "all":
        conditions.append(R.mode == mode)
    with Session(engine) as session:
        matching = select(A.record_id.label("record_id"), func.max(func.julianday(attempt_time)).label("latest"))\
            .join(R, A.record_id == R.id).where(*conditions).group_by(A.record_id).subquery()
        total = session.scalar(select(func.count()).select_from(matching))
        pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, pages)
        rows = session.scalars(select(R).join(matching, R.id == matching.c.record_id)
            .order_by(matching.c.latest.desc(), R.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
        count, tapping, passed, dictation, completed, independent = session.execute(select(
            func.count(A.id), func.sum(case((R.mode == "tapping", 1), else_=0)),
            func.sum(case((A.passed.is_(True), 1), else_=0)),
            func.sum(case((R.mode == "dictation", 1), else_=0)),
            func.sum(case(((R.mode == "dictation") & A.completed_at.is_not(None), 1), else_=0)),
            func.sum(case(((R.mode == "dictation") & A.completed_at.is_not(None) & A.viewed_answer.is_(False), 1), else_=0)),
        ).select_from(A).join(R).where(*conditions)).one()
        # 只读时间列计算本地日历日，正确处理历史夏令时，不读取尝试 JSON
        dates = session.scalars(select(attempt_time).select_from(A).join(R).where(*conditions))
        days = len({datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(tz).date() for value in dates})
        return {"records": [summary(session, row) for row in rows], "page": page, "pages": pages,
                "total": total, "pageSize": page_size,
                "overview": {"count": count, "days": days, "tappingCount": tapping or 0,
                    "passedCount": passed or 0, "passRate": int((passed or 0) / tapping * 100 + .5) if tapping else None,
                    "dictationCount": dictation or 0, "completedCount": completed or 0, "independentCount": independent or 0}}


@router.post("/records/lookup")
def lookup_record(body: HistoryQuery, engine: DatabaseEngine):
    try:
        with Session(engine) as session:
            row = find_record(session, body.model_dump(), body.exercise, body.mode)
            if row is None:
                return None
            result = attempt_page(session, row, 1, 20)
            result["attemptIds"] = list(session.scalars(select(A.id).where(A.record_id == row.id)))
            return result
    except ValueError:
        raise HTTPException(422, "题目格式无效") from None


@router.post("/records/progress")
def record_progress(body: ProgressQuery, engine: DatabaseEngine):
    try:
        with Session(engine) as session:
            return [summary(session, row) if (row := find_record(session, target.model_dump(), target.exercise, target.mode)) else None
                    for target in body.targets]
    except ValueError:
        raise HTTPException(422, "题目格式无效") from None


@router.post("/records")
def start_record(body: dict, engine: DatabaseEngine):
    try:
        with Session(engine) as session, session.begin():
            row = create_record(session, body)
            return {"id": row.id}
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@router.get("/records/{record_id}")
def read_record(record_id: str, engine: DatabaseEngine, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)):
    with Session(engine) as session:
        row = session.get(R, record_id)
        if row is None:
            raise HTTPException(404, "这条练习记录已被删除")
        return attempt_page(session, row, page, page_size)


def write_attempt(record_id, body, engine, *, create):
    try:
        with Session(engine) as session, session.begin():
            lock_records(session)
            row = session.get(R, record_id)
            if row is None:
                raise LookupError("这条练习记录已被删除，请重新进入练习")
            save_attempt(session, row, body.attempt, body.updatedAt, body.title, create=create)
        return {"ok": True}
    except LookupError as error:
        raise HTTPException(404, str(error)) from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@router.post("/records/{record_id}/attempts")
def start_attempt(record_id: str, body: AttemptBody, engine: DatabaseEngine):
    return write_attempt(record_id, body, engine, create=True)


@router.put("/records/{record_id}/attempts/{attempt_id}")
def update_attempt(record_id: str, attempt_id: str, body: AttemptBody, engine: DatabaseEngine):
    if body.attempt.get("id") != attempt_id:
        raise HTTPException(422, "尝试 ID 不匹配")
    return write_attempt(record_id, body, engine, create=False)


@router.delete("/records/{record_id}")
def delete_record(record_id: str, engine: DatabaseEngine):
    with Session(engine) as session, session.begin():
        session.execute(delete(R).where(R.id == record_id))
    return {"ok": True}


@router.delete("/records")
def clear_records(engine: DatabaseEngine):
    with Session(engine) as session, session.begin():
        session.execute(delete(R))
    return {"ok": True}


@router.get("/exercises")
def exercise_summary(engine: DatabaseEngine):
    with Session(engine) as session:
        counts = dict(session.execute(select(CustomExercise.mode, func.count()).group_by(CustomExercise.mode)).all())
        return {"total": sum(counts.values()), "tapping": counts.get("tapping", 0), "dictation": counts.get("dictation", 0)}


@router.delete("/exercises")
def clear_exercises(engine: DatabaseEngine):
    with Session(engine) as session, session.begin():
        session.execute(delete(CustomExercise))
    return {"ok": True}
