"""按题目档案与尝试保存历史；谱面归并和事务由本模块负责。"""

from datetime import datetime
from copy import deepcopy
from sqlalchemy import JSON, String, Boolean, ForeignKey, Index, CheckConstraint, select, update
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base
from domain.practice_records import validate_records
from domain.rhythm import parse_rhythm_exercise


class PracticeRecord(Base):
    __tablename__ = "practice_records"
    __table_args__ = (
        CheckConstraint("mode IN ('tapping', 'dictation')"),
        CheckConstraint("source IN ('preset', 'random', 'custom', 'ai')"),
        Index("ix_practice_records_identity", "source", "exercise_id", "mode"),
        Index("ix_practice_records_updated", "updated_at", "id"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    exercise_id: Mapped[str] = mapped_column(String, nullable=False)
    mode: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    exercise: Mapped[dict] = mapped_column(JSON, nullable=False)
    started_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"
    __table_args__ = (
        Index("ix_practice_attempts_record_time", "record_id", "started_at", "completed_at", "id"),
        Index("ix_practice_attempts_completed", "completed_at"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    record_id: Mapped[str] = mapped_column(ForeignKey("practice_records.id", ondelete="CASCADE"), nullable=False)
    started_at: Mapped[str | None] = mapped_column(String)
    completed_at: Mapped[str | None] = mapped_column(String)
    passed: Mapped[bool | None] = mapped_column(Boolean)
    viewed_answer: Mapped[bool | None] = mapped_column(Boolean)
    details: Mapped[dict] = mapped_column(JSON, nullable=False)


def score_identity(exercise):
    """比较合法的规范化谱面；无附点的两种写法视为相同，不另存指纹。"""
    score = parse_rhythm_exercise(exercise)
    for measure in score["measures"]:
        for element in measure["elements"]:
            for event in element["notes"] if element["kind"] == "triplet" else [element]:
                if event.get("dots") == 0:
                    event.pop("dots")
    return score


def find_record(session, context, exercise, mode):
    score = score_identity(exercise)
    candidates = session.scalars(select(PracticeRecord).where(
        PracticeRecord.source == context["source"], PracticeRecord.exercise_id == context["exerciseId"],
        PracticeRecord.mode == mode))
    return next((row for row in candidates if score_identity(row.exercise) == score), None)


def record_fields(row):
    return {"id": row.id, "source": row.source, "exerciseId": row.exercise_id,
            "mode": row.mode, "title": row.title, "exercise": row.exercise,
            "startedAt": row.started_at, "updatedAt": row.updated_at}


def attempt_fields(row, mode):
    fields = {**deepcopy(row.details), "id": row.id, "completedAt": row.completed_at}
    if mode == "tapping":
        fields["passed"] = row.passed
        if row.started_at is not None:
            fields["startedAt"] = row.started_at
    else:
        fields.update(startedAt=row.started_at, viewedAnswer=row.viewed_answer)
    return fields


def attempt_values(attempt):
    return {"started_at": attempt.get("startedAt"), "completed_at": attempt.get("completedAt"),
            "passed": attempt.get("passed"), "viewed_answer": attempt.get("viewedAnswer"),
            "details": {k: v for k, v in attempt.items() if k not in
                        ("id", "startedAt", "completedAt", "passed", "viewedAnswer")}}


def lock_records(session):
    # SQLite 在读后升级写事务可能冲突；先取得写锁，保证谱面比较与创建原子执行
    session.execute(update(PracticeRecord).where(PracticeRecord.id == "").values(title=PracticeRecord.title))


def create_record(session, value):
    """首次保存原子创建/复用档案并插入尝试；重试已有尝试不覆盖后来更新。"""
    value = validate_records([value])[0]
    lock_records(session)
    row = find_record(session, value, value["exercise"], value["mode"])
    by_id = session.get(PracticeRecord, value["id"])
    if by_id is not None and by_id is not row:
        raise ValueError("档案 ID 已用于其他题目")
    if row is None:
        row = PracticeRecord(id=value["id"], source=value["source"], exercise_id=value["exerciseId"],
                             mode=value["mode"], title=value["title"], exercise=value["exercise"],
                             started_at=value["startedAt"], updated_at=value["updatedAt"])
        session.add(row)
        session.flush()
    for attempt in value["attempts"]:
        save_attempt(session, row, attempt, value["updatedAt"], value["title"], create=True)
    return row


def save_attempt(session, row, attempt, updated_at, title, *, create):
    """创建和更新分离；更新不存在的尝试拒绝写入，固定 ID 的创建重试无副作用。"""
    validate_records([{**record_fields(row), "title": title, "updatedAt": updated_at, "attempts": [attempt]}])
    existing = session.get(PracticeAttempt, attempt["id"])
    if existing is not None and existing.record_id != row.id:
        raise ValueError("尝试 ID 已用于其他档案")
    if create and existing is not None:
        return existing
    if not create and existing is None:
        raise LookupError("这次练习记录已被删除，请重新进入练习")
    if existing is None:
        existing = PracticeAttempt(id=attempt["id"], record_id=row.id, **attempt_values(attempt))
        session.add(existing)
    else:
        for key, value in attempt_values(attempt).items():
            setattr(existing, key, value)
    row.title = title
    if datetime.fromisoformat(updated_at.replace("Z", "+00:00")) > datetime.fromisoformat(row.updated_at.replace("Z", "+00:00")):
        row.updated_at = updated_at
    session.flush()
    return existing
