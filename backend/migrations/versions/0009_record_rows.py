"""将整体记录文档拆为档案和尝试；保留 ID、谱面、时间与详细结果。"""

import json
from alembic import op
import sqlalchemy as sa

revision = "0009_record_rows"
down_revision = "0008_simplify_record_storage"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    raw = connection.execute(sa.text("SELECT value FROM practice_record_store WHERE key='records'")).scalar_one()
    records = (json.loads(raw) if isinstance(raw, str) else raw)["records"]
    op.create_table("practice_records",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("exercise_id", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("exercise", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.CheckConstraint("mode IN ('tapping', 'dictation')"),
        sa.CheckConstraint("source IN ('preset', 'random', 'custom', 'ai')"))
    op.create_index("ix_practice_records_identity", "practice_records", ["source", "exercise_id", "mode"])
    op.create_index("ix_practice_records_updated", "practice_records", ["updated_at", "id"])
    op.create_table("practice_attempts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("record_id", sa.String(), sa.ForeignKey("practice_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.String()), sa.Column("completed_at", sa.String()),
        sa.Column("passed", sa.Boolean()), sa.Column("viewed_answer", sa.Boolean()),
        sa.Column("details", sa.JSON(), nullable=False))
    op.create_index("ix_practice_attempts_record_time", "practice_attempts", ["record_id", "started_at", "completed_at", "id"])
    op.create_index("ix_practice_attempts_completed", "practice_attempts", ["completed_at"])
    record_table = sa.table("practice_records", *[sa.column(name, kind) for name, kind in [
        ("id", sa.String()), ("source", sa.String()), ("exercise_id", sa.String()), ("mode", sa.String()),
        ("title", sa.String()), ("exercise", sa.JSON()), ("started_at", sa.String()), ("updated_at", sa.String())]])
    attempt_table = sa.table("practice_attempts", *[sa.column(name, kind) for name, kind in [
        ("id", sa.String()), ("record_id", sa.String()), ("started_at", sa.String()), ("completed_at", sa.String()),
        ("passed", sa.Boolean()), ("viewed_answer", sa.Boolean()), ("details", sa.JSON())]])
    for record in records:
        connection.execute(record_table.insert(), dict(id=record["id"], source=record["source"], exercise_id=record["exerciseId"],
            mode=record["mode"], title=record["title"], exercise=record["exercise"], started_at=record["startedAt"], updated_at=record["updatedAt"]))
        for attempt in record["attempts"]:
            connection.execute(attempt_table.insert(), dict(id=attempt["id"], record_id=record["id"],
                started_at=attempt.get("startedAt"), completed_at=attempt.get("completedAt"),
                passed=attempt.get("passed"), viewed_answer=attempt.get("viewedAnswer"),
                details={k: v for k, v in attempt.items() if k not in ("id", "startedAt", "completedAt", "passed", "viewedAnswer")}))
    assert connection.scalar(sa.select(sa.func.count()).select_from(record_table)) == len(records)
    assert connection.scalar(sa.select(sa.func.count()).select_from(attempt_table)) == sum(len(r["attempts"]) for r in records)
    # 逐项重建比较，确认内容完整后才删除旧文档
    for record in records:
        row = connection.execute(sa.select(record_table).where(record_table.c.id == record["id"])).mappings().one()
        assert row["exercise"] == record["exercise"]
        recovered = {}
        for attempt in connection.execute(sa.select(attempt_table).where(attempt_table.c.record_id == record["id"])).mappings():
            value = {**attempt["details"], "id": attempt["id"], "completedAt": attempt["completed_at"]}
            if record["mode"] == "tapping":
                value["passed"] = attempt["passed"]
                if attempt["started_at"] is not None:
                    value["startedAt"] = attempt["started_at"]
            else:
                value.update(startedAt=attempt["started_at"], viewedAnswer=attempt["viewed_answer"])
            recovered[value["id"]] = value
        assert recovered == {a["id"]: a for a in record["attempts"]}
    op.drop_table("practice_record_store")


def downgrade():
    raise RuntimeError("记录存储协议已变更，不能通过降级恢复；请恢复升级前数据库备份并使用匹配的应用版本")
