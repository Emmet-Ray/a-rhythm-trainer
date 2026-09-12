"""迁移使用与业务相同的连接配置；只在显式运行 Alembic 时执行。"""

from logging.config import fileConfig

from alembic import context

from db.database import Base, create_database_engine
from db.users import User  # noqa: F401 -- 注册用户表到 Base.metadata，供自动差异检查。
from db.sessions import LoginSession  # noqa: F401 -- 注册登录会话表。
from db.sms_logins import SmsLoginRequest  # noqa: F401 -- 注册登录前短信请求表。


config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

if context.is_offline_mode():
    # 只生成 SQLite SQL，不连接数据库，也不需要实际配置或创建数据目录。
    context.configure(
        dialect_name="sqlite", target_metadata=Base.metadata,
        literal_binds=True, render_as_batch=True, compare_type=True,
        transactional_ddl=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_database_engine()
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection, target_metadata=Base.metadata,
                render_as_batch=True, compare_type=True,
                # db/database.py 已启用非旧式事务模式，DDL 也可以参与事务。
                transactional_ddl=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()
