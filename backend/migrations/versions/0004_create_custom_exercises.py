"""增加账号所属的完整自定义练习；不导入浏览器本地内容。

Revision ID: 0004_create_custom_exercises
Revises: 0003_create_sms_login_requests
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_create_custom_exercises"
down_revision = "0003_create_sms_login_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "custom_exercises",
        sa.Column("id", sa.String(43), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("mode", sa.String(10), nullable=False),
        sa.Column("exercise", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("length(trim(name)) BETWEEN 1 AND 100", name="ck_custom_exercises_name"),
        sa.CheckConstraint("mode IN ('tapping', 'dictation')", name="ck_custom_exercises_mode"),
        sa.CheckConstraint(
            "CASE WHEN json_valid(exercise) THEN json_type(exercise) = 'object' ELSE 0 END",
            name="ck_custom_exercises_json_object",
        ),
    )
    op.create_index("ix_custom_exercises_user_mode_created_id", "custom_exercises", ["user_id", "mode", "created_at", "id"])


def downgrade() -> None:
    # 回退会删除自定义练习，不影响用户、会话和短信请求。
    op.drop_index("ix_custom_exercises_user_mode_created_id", table_name="custom_exercises")
    op.drop_table("custom_exercises")
