from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from db.database import create_database_engine


@pytest.fixture
def migration_config():
    return Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))


@pytest.fixture
def migrated_db(tmp_path, monkeypatch, migration_config):
    # 所有业务表测试均真实执行迁移，但只指向本次测试的临时数据库。
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    command.upgrade(migration_config, "head")
    engine = create_database_engine()
    yield engine
    engine.dispose()
