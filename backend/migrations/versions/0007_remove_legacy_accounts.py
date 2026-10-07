"""删除已退役的账号数据和临时导入日志；实例业务数据保持原样。"""

from alembic import op

revision = "0007_remove_legacy_accounts"
down_revision = "0006_record_operations"
branch_labels = None
depends_on = None


def upgrade():
    # 先删除引用 users 的子表，保留实例题库、记录和保存去重标记
    for table in (
        "login_sessions",
        "sms_login_requests",
        "custom_exercises",
        "legacy_imports",
        "users",
    ):
        op.drop_table(table)


def downgrade():
    raise RuntimeError(
        "旧账号数据已删除，不能通过降级恢复；如需回退，请恢复升级前的完整数据库备份"
    )
