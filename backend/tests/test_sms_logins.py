from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from threading import Barrier

import pytest
from alembic import command
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.sessions import LoginSession, create_login_session
from db.sms_logins import (
    SmsLoginRequest, claim_sms_verification, finish_sms_send,
    finish_sms_verification, reserve_sms_login,
)
from db.users import User, get_or_create_user


NOW = datetime(2026, 9, 12, 12, tzinfo=UTC)
PHONE = "13800000000"


def call(engine, function, *args, **kwargs):
    # 模拟请求各阶段：短事务先提交，外部操作不占用数据库事务。
    with Session(engine) as session, session.begin():
        return function(session, *args, now=kwargs.pop("now", NOW), **kwargs)


@pytest.fixture
def ready(migrated_db):
    request_id = call(migrated_db, reserve_sms_login, PHONE)
    assert call(migrated_db, finish_sms_send, request_id, "accepted")
    return request_id


def test_reserve_send_and_phone_binding(migrated_db):
    request_id = call(migrated_db, reserve_sms_login, PHONE)
    assert len(request_id) == 43
    assert call(migrated_db, claim_sms_verification, request_id) is None
    assert call(migrated_db, finish_sms_send, request_id, "accepted")
    assert not call(migrated_db, finish_sms_send, request_id, "accepted")
    attempt = call(migrated_db, claim_sms_verification, request_id)
    assert attempt.phone_number == PHONE and attempt.number == 1
    assert PHONE not in repr(attempt) and request_id not in repr(attempt)
    assert call(migrated_db, claim_sms_verification, request_id) is None
    assert call(migrated_db, reserve_sms_login, "13900000000") is not None
    assert "code" not in {column["name"] for column in inspect(migrated_db).get_columns("sms_login_requests")}


def test_cooldown_boundary_replacement_invalidates_old_id(migrated_db, ready):
    assert call(migrated_db, reserve_sms_login, PHONE, now=NOW + timedelta(seconds=59)) is None
    new = call(migrated_db, reserve_sms_login, PHONE, now=NOW + timedelta(seconds=60))
    assert new and new != ready
    assert call(migrated_db, claim_sms_verification, ready) is None
    assert not call(migrated_db, finish_sms_send, ready, "accepted")
    with Session(migrated_db) as session:
        assert len(session.scalars(select(SmsLoginRequest)).all()) == 1


@pytest.mark.parametrize("in_verification", [False, True])
def test_inflight_request_blocks_resend_until_expiry(migrated_db, in_verification):
    request_id = call(migrated_db, reserve_sms_login, PHONE)
    attempt = None
    if in_verification:
        call(migrated_db, finish_sms_send, request_id, "accepted")
        attempt = call(migrated_db, claim_sms_verification, request_id)
    assert call(migrated_db, reserve_sms_login, PHONE, now=NOW + timedelta(minutes=2)) is None
    new = call(migrated_db, reserve_sms_login, PHONE, now=NOW + timedelta(minutes=5))
    assert new != request_id
    if attempt:
        assert call(migrated_db, finish_sms_verification, attempt, "passed") is None
    else:
        assert not call(migrated_db, finish_sms_send, request_id, "accepted")


@pytest.mark.parametrize("outcome, allowed_at", [("rejected", 60), ("unknown", 300)])
def test_send_failure_preserves_limit(migrated_db, outcome, allowed_at):
    request_id = call(migrated_db, reserve_sms_login, PHONE)
    assert call(migrated_db, finish_sms_send, request_id, outcome)
    assert call(migrated_db, claim_sms_verification, request_id) is None
    assert call(migrated_db, reserve_sms_login, PHONE, now=NOW + timedelta(seconds=allowed_at - 1)) is None
    assert call(migrated_db, reserve_sms_login, PHONE, now=NOW + timedelta(seconds=allowed_at))


def test_max_attempts_and_no_late_result_replay(migrated_db, ready):
    old = None
    for number in range(1, 6):
        attempt = call(migrated_db, claim_sms_verification, ready)
        assert attempt.number == number
        if old:
            assert call(migrated_db, finish_sms_verification, old, "passed") is None
            assert call(migrated_db, finish_sms_verification, old, "incorrect") is None
        assert call(migrated_db, finish_sms_verification, attempt, "incorrect") is None
        old = attempt
    assert call(migrated_db, claim_sms_verification, ready) is None
    assert call(migrated_db, finish_sms_verification, old, "passed") is None
    with Session(migrated_db) as session:
        row = session.get(SmsLoginRequest, PHONE)
        assert (row.status, row.attempts) == ("failed", 5)


def test_last_allowed_attempt_can_succeed_once(migrated_db):
    request_id = call(migrated_db, reserve_sms_login, PHONE, max_attempts=1)
    call(migrated_db, finish_sms_send, request_id, "accepted")
    attempt = call(migrated_db, claim_sms_verification, request_id)
    assert call(migrated_db, finish_sms_verification, attempt, "passed") == PHONE
    assert call(migrated_db, finish_sms_verification, attempt, "passed") is None
    assert call(migrated_db, claim_sms_verification, request_id) is None


def test_unknown_verification_result_is_terminal(migrated_db, ready):
    attempt = call(migrated_db, claim_sms_verification, ready)
    assert call(migrated_db, finish_sms_verification, attempt, "unknown") is None
    assert call(migrated_db, claim_sms_verification, ready) is None
    assert call(migrated_db, finish_sms_verification, attempt, "passed") is None
    assert call(migrated_db, reserve_sms_login, PHONE, now=NOW + timedelta(minutes=2)) is None
    assert call(migrated_db, reserve_sms_login, PHONE, now=NOW + timedelta(minutes=5))


def test_expiry_checked_on_claim_and_completion(migrated_db, ready):
    deadline = NOW + timedelta(minutes=5)
    assert call(migrated_db, claim_sms_verification, ready, now=deadline) is None
    attempt = call(migrated_db, claim_sms_verification, ready, now=deadline - timedelta(microseconds=1))
    assert attempt is not None
    assert call(migrated_db, finish_sms_verification, attempt, "passed", now=deadline) is None


def test_expired_send_cannot_become_ready(migrated_db):
    request_id = call(migrated_db, reserve_sms_login, PHONE)
    assert not call(migrated_db, finish_sms_send, request_id, "accepted", now=NOW + timedelta(minutes=5))


def test_attempt_cannot_change_phone(migrated_db, ready):
    attempt = call(migrated_db, claim_sms_verification, ready)
    assert call(migrated_db, finish_sms_verification, replace(attempt, phone_number="13900000000"), "passed") is None
    assert call(migrated_db, finish_sms_verification, attempt, "passed") == PHONE


def test_reserve_and_claim_follow_caller_transaction(migrated_db):
    with Session(migrated_db) as session:
        reserve_sms_login(session, PHONE, now=NOW)
        session.rollback()
    request_id = call(migrated_db, reserve_sms_login, PHONE)
    call(migrated_db, finish_sms_send, request_id, "accepted")
    with Session(migrated_db) as session:
        claim_sms_verification(session, request_id, now=NOW)
        session.rollback()
    assert call(migrated_db, claim_sms_verification, request_id).number == 1


def test_consume_user_and_session_are_one_transaction(migrated_db, ready):
    attempt = call(migrated_db, claim_sms_verification, ready)
    with Session(migrated_db) as session:
        phone = finish_sms_verification(session, attempt, "passed", now=NOW)
        user = get_or_create_user(session, phone)
        create_login_session(session, user.id, lifetime=timedelta(hours=1), now=NOW)
        session.rollback()
    with Session(migrated_db) as session:
        assert session.get(SmsLoginRequest, PHONE).status == "verifying"
        assert session.scalars(select(User)).all() == []
        assert session.scalars(select(LoginSession)).all() == []
    # 仅重试数据库最终事务，不再次调用供应商；已提交后不能二次消费。
    with Session(migrated_db) as session, session.begin():
        phone = finish_sms_verification(session, attempt, "passed", now=NOW)
        user = get_or_create_user(session, phone)
        create_login_session(session, user.id, lifetime=timedelta(hours=1), now=NOW)
    assert call(migrated_db, finish_sms_verification, attempt, "passed") is None


def concurrent_calls(engine, function, *args):
    start = Barrier(2)

    def invoke():
        start.wait(timeout=5)
        return call(engine, function, *args)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(invoke) for _ in range(2)]
        return [future.result(timeout=10) for future in futures]


def test_concurrent_reserve_only_one_winner(migrated_db):
    results = concurrent_calls(migrated_db, reserve_sms_login, PHONE)
    assert sum(result is not None for result in results) == 1


def test_concurrent_claim_and_consume_only_one_winner(migrated_db, ready):
    results = concurrent_calls(migrated_db, claim_sms_verification, ready)
    attempts = [result for result in results if result is not None]
    assert len(attempts) == 1 and attempts[0].number == 1
    results = concurrent_calls(migrated_db, finish_sms_verification, attempts[0], "passed")
    assert results.count(PHONE) == 1 and results.count(None) == 1


@pytest.mark.parametrize("phone", ["", " 13800000000", "+8613800000000", "13800000000 ", "１２３４５６７８９０１", None])
def test_phone_format_cannot_bypass_cooldown(migrated_db, phone):
    with Session(migrated_db) as session:
        with pytest.raises(ValueError):
            reserve_sms_login(session, phone, now=NOW)
        assert session.scalars(select(SmsLoginRequest)).all() == []


@pytest.mark.parametrize("settings", [
    {"cooldown": timedelta(0)}, {"lifetime": timedelta(seconds=-1)},
    {"max_attempts": 0}, {"max_attempts": True}, {"now": NOW.replace(tzinfo=None)},
])
def test_invalid_policy_rejected(migrated_db, settings):
    with Session(migrated_db) as session:
        with pytest.raises(ValueError):
            reserve_sms_login(session, PHONE, **settings)


@pytest.mark.parametrize("request_id", [None, "", "x" * 10000, "x" * 43])
def test_invalid_and_unknown_ids(migrated_db, request_id):
    assert call(migrated_db, claim_sms_verification, request_id) is None
    assert not call(migrated_db, finish_sms_send, request_id, "accepted")


def test_restart_preserves_attempts_and_cooldown(migrated_db, ready):
    attempt = call(migrated_db, claim_sms_verification, ready)
    call(migrated_db, finish_sms_verification, attempt, "incorrect")
    migrated_db.dispose()
    assert call(migrated_db, reserve_sms_login, PHONE) is None
    assert call(migrated_db, claim_sms_verification, ready).number == 2


def test_database_state_constraints(migrated_db, ready):
    for assignment in ("status='anything'", "attempts=-1", "attempts=6", "expires_at=created_at"):
        with pytest.raises(IntegrityError):
            with migrated_db.begin() as connection:
                connection.execute(text(f"UPDATE sms_login_requests SET {assignment}"))


def test_migration_preserves_users_and_sessions(migrated_db, migration_config):
    command.downgrade(migration_config, "0002_create_login_sessions")
    with Session(migrated_db) as session, session.begin():
        user = get_or_create_user(session, PHONE)
        create_login_session(session, user.id, lifetime=timedelta(hours=1), now=NOW)
    command.upgrade(migration_config, "head")
    call(migrated_db, reserve_sms_login, PHONE)
    command.upgrade(migration_config, "head")
    command.check(migration_config)
    command.downgrade(migration_config, "0002_create_login_sessions")
    assert "sms_login_requests" not in inspect(migrated_db).get_table_names()
    with Session(migrated_db) as session:
        assert len(session.scalars(select(User)).all()) == 1
        assert len(session.scalars(select(LoginSession)).all()) == 1
    command.upgrade(migration_config, "head")
