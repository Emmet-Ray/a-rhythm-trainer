import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from db import database


@pytest.fixture
def engine(tmp_path):
    engine = database.create_database_engine(f"sqlite:///{tmp_path / 'test.db'}")
    yield engine
    engine.dispose()


def test_import_does_not_read_config_or_create_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DATABASE_URL", "invalid")
    # 独立进程验证导入，避免 reload 重建 Base，破坏其他测试已注册的模型。
    backend_path = str(Path(__file__).resolve().parents[1])
    monkeypatch.setenv("PYTHONPATH", backend_path)
    subprocess.run([sys.executable, "-c", "import db.database; import db.users; import db.sessions; import db.sms_logins"], check=True)
    assert list(tmp_path.iterdir()) == []


def test_env_relative_path_and_lazy_connection(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./data/test.db")
    engine = database.create_database_engine()
    try:
        assert not (tmp_path / "data/test.db").exists()
        # 引擎创建后改变工作目录，不应改变数据库位置。
        monkeypatch.chdir(tmp_path / "data")
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT 1")) == 1
            assert connection.scalar(text("SELECT count(*) FROM sqlite_master WHERE type='table'")) == 0
        assert (tmp_path / "data/test.db").is_file()
    finally:
        engine.dispose()


def test_committed_data_survives_new_engine(tmp_path):
    url = f"sqlite:///{tmp_path / 'persist.db'}"
    first = database.create_database_engine(url)
    try:
        with first.begin() as connection:
            connection.execute(text("CREATE TABLE sample (value TEXT NOT NULL)"))
            connection.execute(text("INSERT INTO sample VALUES (:value)"), {"value": "节奏练习"})
    finally:
        first.dispose()
    second = database.create_database_engine(url)
    try:
        with second.connect() as connection:
            assert connection.scalar(text("SELECT value FROM sample")) == "节奏练习"
    finally:
        second.dispose()


def test_failed_transaction_rolls_back(engine):
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE sample (value TEXT)"))
    with pytest.raises(RuntimeError):
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO sample VALUES ('discard')"))
            raise RuntimeError("cancel transaction")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM sample")) == 0


def test_foreign_keys_and_timeout_on_each_connection(engine):
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE parent (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))"))
    # 同时取两条连接，验证设置不是只对第一条连接生效。
    with engine.connect() as first, engine.connect() as second:
        for connection in (first, second):
            assert connection.scalar(text("PRAGMA foreign_keys")) == 1
            assert connection.scalar(text("PRAGMA busy_timeout")) == 5000
    for _ in range(2):
        with pytest.raises(IntegrityError):
            with engine.begin() as connection:
                connection.execute(text("INSERT INTO child VALUES (999)"))
        engine.dispose()


@pytest.mark.parametrize("value", [
    "", "  ", "invalid", "sqlite://", "sqlite:///:memory:",
    "postgresql://user:secret@localhost/app", "sqlite:///test.db?timeout=0",
    "sqlite+aiosqlite:///test.db", "sqlite://host/test.db",
])
def test_invalid_config_has_no_filesystem_side_effects(value, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    with pytest.raises(ValueError) as error:
        database.create_database_engine(value)
    assert "secret" not in str(error.value)
    assert list(tmp_path.iterdir()) == []


def test_missing_env(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValueError, match="DATABASE_URL"):
        database.create_database_engine()
