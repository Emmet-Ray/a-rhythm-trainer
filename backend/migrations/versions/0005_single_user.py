"""新增实例数据表；旧账号表留作迁移来源，不删除原数据。"""

from alembic import op
import sqlalchemy as sa

revision = "0005_single_user"
down_revision = "0004_create_custom_exercises"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "instance_exercises",
        sa.Column("id", sa.String(43), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("mode", sa.String(10), nullable=False),
        sa.Column("exercise", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "length(trim(name)) BETWEEN 1 AND 100", name="ck_custom_exercises_name"
        ),
        sa.CheckConstraint(
            "mode IN ('tapping', 'dictation')", name="ck_custom_exercises_mode"
        ),
        sa.CheckConstraint(
            "CASE WHEN json_valid(exercise) THEN json_type(exercise) = 'object' ELSE 0 END",
            name="ck_custom_exercises_json_object",
        ),
    )
    op.create_index(
        "ix_instance_exercises_mode_created_id",
        "instance_exercises",
        ["mode", "created_at", "id"],
    )
    op.create_table(
        "instance_documents",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
    )
    op.bulk_insert(
        sa.table(
            "instance_documents",
            sa.column("key", sa.String()),
            sa.column("revision", sa.Integer()),
            sa.column("value", sa.JSON()),
        ),
        [{"key": "records", "revision": 0, "value": {"version": 3, "records": []}}],
    )
    op.create_table("legacy_imports", sa.Column("key", sa.String(), primary_key=True))


def downgrade():
    op.drop_table("legacy_imports")
    op.drop_table("instance_documents")
    op.drop_table("instance_exercises")
