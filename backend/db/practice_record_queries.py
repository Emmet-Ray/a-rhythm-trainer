"""练习档案的分页、筛选和统计；隐藏表结构、排序及历史查询约定。"""

from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import select, func, case
from sqlalchemy.orm import Session
from .practice_records import PracticeRecord, PracticeAttempt, record_fields, attempt_fields, find_record

R, A = PracticeRecord, PracticeAttempt
# 击拍按完成时间、听写按开始时间筛选；同一表达式用于列表、排序与统计。
attempt_time = func.coalesce(A.started_at, A.completed_at)


def _summary(session, row):
    total, passed, completed, independent, viewed = session.execute(select(
        func.count(A.id), func.sum(case((A.passed.is_(True), 1), else_=0)),
        func.sum(case((A.completed_at.is_not(None), 1), else_=0)),
        func.sum(case((A.completed_at.is_not(None) & A.viewed_answer.is_(False), 1), else_=0)),
        func.sum(case((A.viewed_answer.is_(True), 1), else_=0)),
    ).where(A.record_id == row.id)).one()
    return {**record_fields(row), "attemptCount": total, "passedCount": passed or 0,
            "completedCount": completed or 0, "independentCount": independent or 0, "viewedAnswerCount": viewed or 0}


def _attempt_page(session, row, page, size):
    meta = _summary(session, row)
    pages = max(1, (meta["attemptCount"] + size - 1) // size)
    page = min(page, pages)
    items = session.scalars(select(A).where(A.record_id == row.id)
        .order_by(func.julianday(attempt_time).desc(), A.id.desc()).offset((page - 1) * size).limit(size)).all()
    return {"record": meta, "attempts": [attempt_fields(item, row.mode) for item in reversed(items)],
            "page": page, "pages": pages, "total": meta["attemptCount"], "pageSize": size}


def record_totals(session: Session) -> dict:
    return {"recordCount": session.scalar(select(func.count()).select_from(R)),
            "attemptCount": session.scalar(select(func.count()).select_from(A))}


def list_record_archives(session: Session, *, mode: str, page: int, page_size: int,
                        after: datetime | None, before: datetime, tz: ZoneInfo) -> dict:
    """同一筛选用于列表和全量尝试统计；详情与各档案摘要保持全部历史口径。"""
    conditions = [func.julianday(attempt_time) <= func.julianday(before.isoformat())]
    if after is not None:
        conditions.append(func.julianday(attempt_time) >= func.julianday(after.isoformat()))
    if mode != "all":
        conditions.append(R.mode == mode)
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
    return {"records": [_summary(session, row) for row in rows], "page": page, "pages": pages,
            "total": total, "pageSize": page_size,
            "overview": {"count": count, "days": days, "tappingCount": tapping or 0,
                "passedCount": passed or 0, "passRate": int((passed or 0) / tapping * 100 + .5) if tapping else None,
                "dictationCount": dictation or 0, "completedCount": completed or 0, "independentCount": independent or 0}}


def lookup_record_history(session: Session, target: dict) -> dict | None:
    row = find_record(session, target, target["exercise"], target["mode"])
    if row is None:
        return None
    result = _attempt_page(session, row, 1, 20)
    result["attemptIds"] = list(session.scalars(select(A.id).where(A.record_id == row.id)))
    return result


def query_record_progress(session: Session, targets: list[dict]) -> list[dict | None]:
    return [_summary(session, row) if (row := find_record(session, target, target["exercise"], target["mode"])) else None
            for target in targets]


def read_record_archive(session: Session, record_id: str, *, page: int, page_size: int) -> dict:
    row = session.get(R, record_id)
    if row is None:
        raise LookupError("这条练习记录已被删除")
    return _attempt_page(session, row, page, page_size)
