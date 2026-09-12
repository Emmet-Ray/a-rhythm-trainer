"""添加服务端登录会话，只保存随机凭证的哈希。

Revision ID: 0002_create_login_sessions
Revises: 0001_create_users
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_create_login_sessions"
down_revision = "0001_create_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "login_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("expires_at > created_at", name="ck_login_sessions_expiry"),
    )
    op.create_index("ix_login_sessions_user_id", "login_sessions", ["user_id"])


def downgrade() -> None:
    # 删除会话将使这些登录失效，但不删除 users 或用户数据。
    op.drop_index("ix_login_sessions_user_id", table_name="login_sessions")
    op.drop_table("login_sessions")
