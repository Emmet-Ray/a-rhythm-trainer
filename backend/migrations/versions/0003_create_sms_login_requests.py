"""增加登录前的短信请求状态，每个手机号只保留当前请求。

Revision ID: 0003_create_sms_login_requests
Revises: 0002_create_login_sessions
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_create_sms_login_requests"
down_revision = "0002_create_login_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sms_login_requests",
        sa.Column("phone_number", sa.String(11), primary_key=True, nullable=False),
        sa.Column("request_id", sa.String(43), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("next_send_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.UniqueConstraint("request_id", name="uq_sms_login_requests_request_id"),
        sa.CheckConstraint("status IN ('sending', 'ready', 'verifying', 'used', 'failed')", name="ck_sms_login_requests_status"),
        sa.CheckConstraint("attempts >= 0 AND attempts <= max_attempts AND max_attempts > 0", name="ck_sms_login_requests_attempts"),
        sa.CheckConstraint("expires_at > created_at AND next_send_at >= created_at", name="ck_sms_login_requests_times"),
    )


def downgrade() -> None:
    # 删除登录请求和冷却信息，不删除用户或已有登录会话。
    op.drop_table("sms_login_requests")
