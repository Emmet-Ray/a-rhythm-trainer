"""将日常保存的幂等标记从旧导入日志分离，归档数据保持原样。"""

from alembic import op
import sqlalchemy as sa

revision = "0006_record_operations"
down_revision = "0005_single_user"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "record_operations", sa.Column("operation_id", sa.String(), primary_key=True)
    )
    op.execute(
        sa.text(
            "INSERT INTO record_operations (operation_id) SELECT substr(key, 7) FROM legacy_imports WHERE key LIKE 'write:%'"
        )
    )


def downgrade():
    # 保留升级后新增的保存标记，回退后重试也不能重复写入
    op.execute(
        sa.text(
            "INSERT OR IGNORE INTO legacy_imports (key) SELECT 'write:' || operation_id FROM record_operations"
        )
    )
    op.drop_table("record_operations")
