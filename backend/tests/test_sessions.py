import hashlib
from datetime import UTC, datetime, timedelta, timezone

import pytest
from alembic import command
from sqlalchemy import delete, event, inspect, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from db.database import create_database_engine
from db.sessions import LoginSession, create_login_session, get_login_session, revoke_login_session
from db.users import User, get_or_create_user


NOW = datetime(2026, 9, 12, 10, tzinfo=UTC)
LIFETIME = timedelta(hours=1)


@pytest.fixture
def account(migrated_db):
    with Session(migrated_db) as session, session.begin():
        return get_or_create_user(session, "13800000000").id


@pytest.fixture
def token(migrated_db, account):
    with Session(migrated_db) as session, session.begin():
        return create_login_session(session, account, lifetime=LIFETIME, now=NOW)


def test_only_hash_persisted_and_read_after_reopen(migrated_db, account, token):
    migrated_db.dispose()
    with Session(migrated_db) as session:
        record = get_login_session(session, token, now=NOW)
        assert record.user_id == account
        assert record.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert record.created_at == NOW.replace(tzinfo=None)
        assert record.expires_at == (NOW + LIFETIME).replace(tzinfo=None)
        stored = session.execute(text("SELECT * FROM login_sessions")).all()
        assert token not in repr(stored)
        assert get_login_session(session, record.token_hash, now=NOW) is None


@pytest.mark.parametrize("offset, valid", [
    (LIFETIME - timedelta(microseconds=1), True),
    (LIFETIME, False), (LIFETIME + timedelta(seconds=1), False),
])
def test_expiry_boundary(migrated_db, token, offset, valid):
    with Session(migrated_db) as session:
        assert (get_login_session(session, token, now=NOW + offset) is not None) is valid
        # 失效只靠时间判断，不需要先清理过期行。
        assert len(session.scalars(select(LoginSession)).all()) == 1


@pytest.mark.parametrize("bad", [None, "", " ", "A" * 43, "A" * 10000, "验证码", "x' OR 1=1 --"])
def test_invalid_or_unknown_tokens(migrated_db, token, bad):
    with Session(migrated_db) as session, session.begin():
        assert get_login_session(session, bad, now=NOW) is None
        revoke_login_session(session, bad)
        assert get_login_session(session, token, now=NOW) is not None


def test_revoke_is_idempotent_and_other_sessions_survive(migrated_db, account, token):
    with Session(migrated_db) as session, session.begin():
        other = create_login_session(session, account, lifetime=LIFETIME, now=NOW)
        assert other != token
        revoke_login_session(session, token)
        revoke_login_session(session, token)
    with Session(migrated_db) as session:
        assert get_login_session(session, token, now=NOW) is None
        assert get_login_session(session, other, now=NOW) is not None


def test_caller_can_rollback_creation_with_new_user(migrated_db):
    with Session(migrated_db) as session:
        user = get_or_create_user(session, "13800000000")
        token = create_login_session(session, user.id, lifetime=LIFETIME, now=NOW)
        session.rollback()
    with Session(migrated_db) as session:
        assert get_login_session(session, token, now=NOW) is None
        assert session.scalars(select(User)).all() == []


def test_revoke_waits_for_caller_commit(migrated_db, token):
    with Session(migrated_db) as session:
        revoke_login_session(session, token)
        session.rollback()
    with Session(migrated_db) as session:
        assert get_login_session(session, token, now=NOW) is not None


def test_lookup_does_not_write_or_renew(migrated_db, token):
    statements = []

    def capture(_connection, _cursor, statement, *_args):
        statements.append(statement)

    event.listen(migrated_db, "before_cursor_execute", capture)
    try:
        with Session(migrated_db) as session:
            session.add(User(phone_number="13900000000"))
            record = get_login_session(session, token, now=NOW + timedelta(minutes=30))
            assert record.expires_at == (NOW + LIFETIME).replace(tzinfo=None)
        assert statements and all(sql.lstrip().upper().startswith("SELECT") for sql in statements)
    finally:
        event.remove(migrated_db, "before_cursor_execute", capture)


def test_missing_user_rejected_and_deleted_user_sessions_removed(migrated_db, account, token):
    with Session(migrated_db) as session:
        with pytest.raises(IntegrityError):
            create_login_session(session, account + 999, lifetime=LIFETIME, now=NOW)
        session.rollback()
        session.execute(delete(User).where(User.id == account))
        session.commit()
    with Session(migrated_db) as session:
        assert get_login_session(session, token, now=NOW) is None
        assert session.scalars(select(LoginSession)).all() == []


@pytest.mark.parametrize("lifetime", [timedelta(0), timedelta(seconds=-1), 3600, None])
def test_invalid_lifetime(migrated_db, account, lifetime):
    with Session(migrated_db) as session:
        with pytest.raises(ValueError, match="有效期"):
            create_login_session(session, account, lifetime=lifetime, now=NOW)
        assert session.scalars(select(LoginSession)).all() == []


def test_clock_timezone_validation_and_normalization(migrated_db, account):
    with Session(migrated_db) as session, session.begin():
        with pytest.raises(ValueError, match="时区"):
            create_login_session(session, account, lifetime=LIFETIME, now=NOW.replace(tzinfo=None))
        token = create_login_session(
            session, account, lifetime=LIFETIME,
            now=NOW.astimezone(timezone(timedelta(hours=8))),
        )
        assert get_login_session(session, token, now=NOW).created_at == NOW.replace(tzinfo=None)


def test_default_clock(migrated_db, account):
    before = datetime.now(UTC).replace(tzinfo=None)
    with Session(migrated_db) as session, session.begin():
        token = create_login_session(session, account, lifetime=LIFETIME)
        record = get_login_session(session, token)
        assert before <= record.created_at <= datetime.now(UTC).replace(tzinfo=None)


def test_database_rejects_invalid_expiry_and_duplicate_hash(migrated_db, account, token):
    with Session(migrated_db) as session:
        record = get_login_session(session, token, now=NOW)
        record.expires_at = record.created_at
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()
    with migrated_db.begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(text(
                "INSERT INTO login_sessions SELECT * FROM login_sessions"
            ))


def test_expired_session_can_be_revoked(migrated_db, token):
    with Session(migrated_db) as session, session.begin():
        assert get_login_session(session, token, now=NOW + LIFETIME) is None
        revoke_login_session(session, token)
    with Session(migrated_db) as session:
        assert session.scalars(select(LoginSession)).all() == []


def test_database_error_is_not_treated_as_invalid_session(migrated_db, token, monkeypatch):
    def unavailable(*_args, **_kwargs):
        raise OperationalError("SELECT", {}, Exception("unavailable"))

    with Session(migrated_db) as session:
        monkeypatch.setattr(session, "scalar", unavailable)
        with pytest.raises(OperationalError):
            get_login_session(session, token, now=NOW)


def test_upgrade_preserves_existing_users_and_downgrade_only_removes_sessions(
    migration_config, tmp_path, monkeypatch,
):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'upgrade.db'}")
    command.upgrade(migration_config, "0001_create_users")
    engine = create_database_engine()
    try:
        with Session(engine) as session, session.begin():
            user_id = get_or_create_user(session, "13800000000").id
        command.upgrade(migration_config, "head")
        with Session(engine) as session, session.begin():
            token = create_login_session(session, user_id, lifetime=LIFETIME, now=NOW)
        command.upgrade(migration_config, "head")
        command.check(migration_config)
        with Session(engine) as session:
            assert get_login_session(session, token, now=NOW).user_id == user_id
        command.downgrade(migration_config, "0001_create_users")
        assert "login_sessions" not in inspect(engine).get_table_names()
        with Session(engine) as session:
            assert session.get(User, user_id).phone_number == "13800000000"
        command.upgrade(migration_config, "head")
    finally:
        engine.dispose()
