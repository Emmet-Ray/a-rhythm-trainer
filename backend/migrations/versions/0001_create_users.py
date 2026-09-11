"""创建本站用户表。

Revision ID: 0001_create_users
Revises: None
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_create_users"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 历史迁移固定当时的表结构，不导入可能继续变化的 User 模型。
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("phone_number", sa.String(11), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("phone_number", name="uq_users_phone_number"),
        sqlite_autoincrement=True,
    )


def downgrade() -> None:
    # 回退会删除整张用户表及其数据；只能在确认目标并备份后执行。
    op.drop_table("users")
