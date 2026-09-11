"""SQLite 连接配置；不在导入时读取环境、创建数据库或建表。"""

import os
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """业务表共享的模型基类；metadata 供 Alembic 比较表结构，不自动建表。"""


def create_database_engine(database_url: str | None = None) -> Engine:
    """创建同步 SQLite 文件库引擎；省略地址时读取 DATABASE_URL。

    相对文件路径在调用时按当前工作目录固定为绝对路径，自动创建父目录。
    首次连接才打开或创建数据库文件，不建表。调用方负责事务及最终 dispose()。
    第一版只支持 sqlite/sqlite+pysqlite 文件地址，不接受内存库或 URL 查询参数。
    """
    value = database_url if database_url is not None else os.environ.get("DATABASE_URL", "")
    if not isinstance(value, str) or not value.strip():
        raise ValueError("请配置后端环境变量 DATABASE_URL。")
    try:
        url = make_url(value.strip())
    except ArgumentError:
        raise ValueError("DATABASE_URL 格式错误，请使用 sqlite:///./data/rhythm_trainer.db。") from None
    if (
        url.drivername not in ("sqlite", "sqlite+pysqlite")
        or url.database in (None, "", ":memory:")
        or url.host is not None or url.port is not None
        or url.username is not None or url.password is not None or url.query
    ):
        raise ValueError("DATABASE_URL 必须是 SQLite 文件地址，不含账号、主机或查询参数。")

    path = Path(url.database).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        url.set(database=str(path)),
        # Python 3.12+ 的事务模式，避免 SQLite 旧模式下部分语句自动提交。
        connect_args={"autocommit": False, "timeout": 5.0},
        hide_parameters=True,
    )

    @event.listens_for(engine, "connect")
    def configure_connection(connection: sqlite3.Connection, _record) -> None:
        # 外键开关在事务内无效，因此每条新连接先临时退出事务再设置。
        connection.autocommit = True
        try:
            cursor = connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
            finally:
                cursor.close()
        finally:
            connection.autocommit = False

    return engine
