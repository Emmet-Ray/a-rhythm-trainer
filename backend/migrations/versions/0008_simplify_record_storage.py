"""明确业务表名，用删除代数代替逐次写入去重日志。"""

from alembic import op
import sqlalchemy as sa

revision = "0008_simplify_record_storage"
down_revision = "0007_remove_legacy_accounts"
branch_labels = None
depends_on = None


def upgrade():
    op.rename_table("instance_exercises", "custom_exercises")
    op.drop_index("ix_instance_exercises_mode_created_id", table_name="custom_exercises")
    op.create_index("ix_custom_exercises_mode_created_id", "custom_exercises", ["mode", "created_at", "id"])
    op.rename_table("instance_documents", "practice_record_store")
    op.add_column("practice_record_store", sa.Column("generation", sa.Integer(), nullable=False, server_default="0"))
    op.drop_table("record_operations")


def downgrade():
    raise RuntimeError("保存协议与去重日志已更新，不能通过降级恢复；请恢复升级前的数据库备份并使用匹配的应用版本")
