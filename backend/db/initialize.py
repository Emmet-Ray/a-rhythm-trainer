"""启动时升级实例数据；升级前为已有 SQLite 文件留一份备份。"""

from pathlib import Path
import sqlite3
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text


def initialize_database(engine):
    with engine.connect() as connection:
        current = (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            if inspect(connection).has_table("alembic_version")
            else None
        )
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    if current == ScriptDirectory.from_config(config).get_current_head():
        return
    database = Path(engine.url.database)
    if current:
        backup = database.with_name(database.name + f".before-{current}.bak")
        if not backup.exists():
            with (
                sqlite3.connect(database) as source,
                sqlite3.connect(backup) as destination,
            ):
                source.backup(destination)
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
