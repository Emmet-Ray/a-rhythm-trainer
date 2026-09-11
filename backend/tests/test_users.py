from datetime import UTC, datetime, timedelta
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.database import create_database_engine
from db.users import User


@pytest.fixture
def migration_config():
    return Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))


@pytest.fixture
def migrated_db(tmp_path, monkeypatch, migration_config):
    # 真实执行迁移，但只指向临时数据库；不读 .env、不操作正式用户。
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'users.db'}")
    command.upgrade(migration_config, "head")
    engine = create_database_engine()
    yield engine
    engine.dispose()


def test_upgrade_version_and_model_match(migrated_db, migration_config):
    assert "users" in inspect(migrated_db).get_table_names()
    with migrated_db.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0001_create_users"
    # 自动生成迁移时不应再发现 User 模型与迁移结果不一致。
    command.check(migration_config)


def test_user_round_trip_and_utc_default(migrated_db):
    before = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    with Session(migrated_db) as session:
        user = User(phone_number="13800000000")
        session.add(user)
        session.commit()
        user_id = user.id
        assert isinstance(user_id, int)
    migrated_db.dispose()
    with Session(migrated_db) as session:
        user = session.scalar(select(User).where(User.phone_number == "13800000000"))
        assert user.id == user_id
        assert user.created_at.tzinfo is None
        assert before <= user.created_at <= datetime.now(UTC).replace(tzinfo=None)


def test_duplicate_phone_rejected_and_original_kept(migrated_db):
    with Session(migrated_db) as session:
        original = User(phone_number="13800000000")
        session.add(original)
        session.commit()
        original_id = original.id
        session.add(User(phone_number="13800000000"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        assert [user.id for user in session.scalars(select(User))] == [original_id]


@pytest.mark.parametrize("statement", [
    "INSERT INTO users (phone_number) VALUES (NULL)",
    "INSERT INTO users (phone_number, created_at) VALUES ('13800000000', NULL)",
])
def test_required_fields_enforced_by_database(migrated_db, statement):
    with pytest.raises(IntegrityError):
        with migrated_db.begin() as connection:
            connection.execute(text(statement))


def test_deleted_user_id_is_not_reused(migrated_db):
    with Session(migrated_db) as session:
        old = User(phone_number="13800000000")
        session.add(old)
        session.commit()
        old_id = old.id
        session.delete(old)
        session.commit()
        new = User(phone_number="13900000000")
        session.add(new)
        session.commit()
        assert new.id > old_id


def test_repeated_upgrade_preserves_data(migrated_db, migration_config):
    with Session(migrated_db) as session:
        session.add(User(phone_number="13800000000"))
        session.commit()
    command.upgrade(migration_config, "head")
    with Session(migrated_db) as session:
        assert session.scalar(select(User.phone_number)) == "13800000000"


def test_downgrade_and_reupgrade_temporary_database(migrated_db, migration_config):
    command.downgrade(migration_config, "base")
    assert "users" not in inspect(migrated_db).get_table_names()
    command.upgrade(migration_config, "head")
    assert "users" in inspect(migrated_db).get_table_names()


def test_offline_sql_needs_no_database(migration_config, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    output = StringIO()
    migration_config.output_buffer = output
    command.upgrade(migration_config, "head", sql=True)
    assert "CREATE TABLE users" in output.getvalue()
    assert list(tmp_path.iterdir()) == []
