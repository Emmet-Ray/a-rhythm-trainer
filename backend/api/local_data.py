"""题库管理与按档案、尝试查询和保存练习历史。"""

from datetime import datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from api.dependencies import DatabaseEngine
from api.http_policy import LocalApiRoute
from db.practice_records import create_record, write_record_attempt, delete_record_archive, clear_record_archives
from db.practice_record_queries import (record_totals, list_record_archives, lookup_record_history,
                                       query_record_progress, read_record_archive)
from db.custom_exercises import custom_exercise_totals, clear_custom_exercises


router = APIRouter(prefix="/api/local-data", route_class=LocalApiRoute)


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


@router.get("/records/summary")
def records_summary(engine: DatabaseEngine):
    with Session(engine) as session:
        return record_totals(session)


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
    with Session(engine) as session:
        return list_record_archives(session, mode=mode, page=page, page_size=page_size,
                                    after=after, before=before, tz=tz)


@router.post("/records/lookup")
def lookup_record(body: HistoryQuery, engine: DatabaseEngine):
    try:
        with Session(engine) as session:
            return lookup_record_history(session, body.model_dump())
    except ValueError:
        raise HTTPException(422, "题目格式无效") from None


@router.post("/records/progress")
def record_progress(body: ProgressQuery, engine: DatabaseEngine):
    try:
        with Session(engine) as session:
            return query_record_progress(session, [target.model_dump() for target in body.targets])
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
    try:
        with Session(engine) as session:
            return read_record_archive(session, record_id, page=page, page_size=page_size)
    except LookupError as error:
        raise HTTPException(404, str(error)) from None


def write_attempt(record_id, body, engine, *, create):
    try:
        with Session(engine) as session, session.begin():
            write_record_attempt(session, record_id, body.attempt, body.updatedAt, body.title, create=create)
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
        delete_record_archive(session, record_id)
    return {"ok": True}


@router.delete("/records")
def clear_records(engine: DatabaseEngine):
    with Session(engine) as session, session.begin():
        clear_record_archives(session)
    return {"ok": True}


@router.get("/exercises")
def exercise_summary(engine: DatabaseEngine):
    with Session(engine) as session:
        return custom_exercise_totals(session)


@router.delete("/exercises")
def clear_exercises(engine: DatabaseEngine):
    with Session(engine) as session, session.begin():
        clear_custom_exercises(session)
    return {"ok": True}
