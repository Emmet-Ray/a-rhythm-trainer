import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

import auth
from auth import Auth, InvalidVerificationCode, LoginRequestBlocked, LoginRequestUnavailable
from db.sessions import LoginSession, get_login_session
from db.sms_logins import SmsLoginRequest
from db.users import User
from sms_auth import SmsSendRejected, SmsServiceError


PHONE = "13800138000"
NOW = datetime(2026, 9, 12, tzinfo=UTC)


@pytest.fixture
def setup(migrated_db):
    sms = SimpleNamespace(send_code=AsyncMock(), verify_code=AsyncMock(return_value=True))
    clock = SimpleNamespace(now=NOW)
    service = Auth(migrated_db, sms, session_lifetime=timedelta(days=7), clock=lambda: clock.now)
    return service, sms, clock, migrated_db


def state(engine):
    with Session(engine) as session:
        row = session.get(SmsLoginRequest, PHONE)
        return row.status, row.attempts, row.next_send_at


def test_success_reuses_user_and_cannot_replay(setup):
    service, sms, clock, engine = setup

    async def scenario():
        request_id = await service.request_code(PHONE)
        result = await service.login(request_id, "012345")
        sms.verify_code.assert_awaited_once_with(PHONE, "012345")
        assert result.token not in repr(result)
        assert result.expires_at == NOW + timedelta(days=7)
        with Session(engine) as session:
            assert get_login_session(session, result.token, now=NOW).user_id == result.user_id
        with pytest.raises(LoginRequestUnavailable):
            await service.login(request_id, "012345")
        clock.now += timedelta(seconds=60)
        second = await service.login(await service.request_code(PHONE), "012345")
        assert second.user_id == result.user_id
        assert second.token != result.token
        with Session(engine) as session:
            assert session.scalar(select(func.count()).select_from(User)) == 1
            assert session.scalar(select(func.count()).select_from(LoginSession)) == 2

    asyncio.run(scenario())


def test_wrong_codes_commit_attempts_and_lock_after_five(setup):
    service, sms, _, engine = setup
    sms.verify_code.return_value = False

    async def scenario():
        request_id = await service.request_code(PHONE)
        for number in range(1, 6):
            with pytest.raises(InvalidVerificationCode):
                await service.login(request_id, "000000")
            assert state(engine)[:2] == ("ready" if number < 5 else "failed", number)
        with pytest.raises(LoginRequestUnavailable):
            await service.login(request_id, "000000")
        assert sms.verify_code.await_count == 5

    asyncio.run(scenario())


@pytest.mark.parametrize("error,delay", [(SmsSendRejected("rejected"), 60), (TimeoutError("secret"), 300)])
def test_send_failure_policy(setup, error, delay):
    service, sms, clock, engine = setup
    sms.send_code.side_effect = error

    async def scenario():
        with pytest.raises(SmsServiceError) as caught:
            await service.request_code(PHONE)
        assert "secret" not in str(caught.value)
        assert state(engine) == ("failed", 0, (NOW + timedelta(seconds=delay)).replace(tzinfo=None))
        clock.now += timedelta(seconds=delay - 1)
        with pytest.raises(LoginRequestBlocked):
            await service.request_code(PHONE)
        sms.send_code.assert_awaited_once()
        clock.now += timedelta(seconds=1)
        sms.send_code.side_effect = None
        await service.request_code(PHONE)

    asyncio.run(scenario())


@pytest.mark.parametrize("result", [TimeoutError("secret"), "PASS", None])
def test_uncertain_verification_never_logs_in(setup, result):
    service, sms, _, engine = setup
    if isinstance(result, Exception):
        sms.verify_code.side_effect = result
    else:
        sms.verify_code.return_value = result

    async def scenario():
        request_id = await service.request_code(PHONE)
        with pytest.raises(SmsServiceError) as caught:
            await service.login(request_id, "000000")
        assert "secret" not in str(caught.value)
        assert state(engine)[:2] == ("failed", 1)
        with pytest.raises(LoginRequestUnavailable):
            await service.login(request_id, "000000")
        with Session(engine) as session:
            assert session.scalar(select(func.count()).select_from(User)) == 0

    asyncio.run(scenario())


def test_invalid_input_does_not_contact_provider_or_spend_attempt(setup):
    service, sms, _, engine = setup

    async def scenario():
        with pytest.raises(ValueError):
            await service.request_code("invalid")
        sms.send_code.assert_not_awaited()
        request_id = await service.request_code(PHONE)
        with pytest.raises(InvalidVerificationCode):
            await service.login(request_id, "123")
        assert state(engine)[:2] == ("ready", 0)
        with pytest.raises(LoginRequestUnavailable):
            await service.login("unknown", "000000")
        sms.verify_code.assert_not_awaited()

    asyncio.run(scenario())


def test_network_wait_holds_no_write_transaction_and_blocks_concurrent_calls(setup):
    service, sms, _, engine = setup

    async def scenario():
        entered, release = asyncio.Event(), asyncio.Event()

        async def network(*args):
            # 独立连接能写入，证明领取已提交且外部调用期间没有持有写锁。
            with Session(engine) as session, session.begin():
                session.execute(update(SmsLoginRequest).values(status=SmsLoginRequest.status))
            entered.set()
            await release.wait()
            return True

        sms.send_code.side_effect = network
        sending = asyncio.create_task(service.request_code(PHONE))
        await entered.wait()
        with pytest.raises(LoginRequestBlocked):
            await service.request_code(PHONE)
        release.set()
        request_id = await sending
        entered.clear()
        release.clear()
        sms.verify_code.side_effect = network
        verifying = asyncio.create_task(service.login(request_id, "000000"))
        await entered.wait()
        with pytest.raises(LoginRequestUnavailable):
            await service.login(request_id, "000000")
        release.set()
        await verifying
        sms.send_code.assert_awaited_once()
        sms.verify_code.assert_awaited_once()

    asyncio.run(asyncio.wait_for(scenario(), timeout=15))


@pytest.mark.parametrize("stage", ["send", "verify"])
def test_expiry_during_network_call(setup, stage):
    service, sms, clock, engine = setup

    async def late(*args):
        clock.now += timedelta(minutes=5)
        return True

    async def scenario():
        if stage == "send":
            sms.send_code.side_effect = late
            with pytest.raises(LoginRequestUnavailable):
                await service.request_code(PHONE)
        else:
            request_id = await service.request_code(PHONE)
            sms.verify_code.side_effect = late
            with pytest.raises(LoginRequestUnavailable):
                await service.login(request_id, "000000")
        with Session(engine) as session:
            assert session.scalar(select(func.count()).select_from(User)) == 0

    asyncio.run(scenario())


def test_final_transaction_rolls_back_together(setup, monkeypatch):
    service, sms, _, engine = setup

    def fail(*args, **kwargs):
        raise RuntimeError("database failure")

    monkeypatch.setattr(auth, "create_login_session", fail)

    async def scenario():
        request_id = await service.request_code(PHONE)
        with pytest.raises(RuntimeError, match="database failure"):
            await service.login(request_id, "000000")
        assert state(engine)[:2] == ("verifying", 1)
        with Session(engine) as session:
            assert session.scalar(select(func.count()).select_from(User)) == 0
            assert session.scalar(select(func.count()).select_from(LoginSession)) == 0
        with pytest.raises(LoginRequestUnavailable):
            await service.login(request_id, "000000")
        sms.verify_code.assert_awaited_once()

    asyncio.run(scenario())


@pytest.mark.parametrize("stage", ["send", "verify"])
def test_cancelled_network_call_stays_blocked_until_expiry(setup, stage):
    service, sms, clock, engine = setup

    async def scenario():
        entered = asyncio.Event()

        async def network(*args):
            entered.set()
            await asyncio.Event().wait()

        if stage == "send":
            sms.send_code.side_effect = network
            task = asyncio.create_task(service.request_code(PHONE))
        else:
            request_id = await service.request_code(PHONE)
            sms.verify_code.side_effect = network
            task = asyncio.create_task(service.login(request_id, "000000"))
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert state(engine)[0] == ("sending" if stage == "send" else "verifying")
        clock.now += timedelta(seconds=60)
        with pytest.raises(LoginRequestBlocked):
            await service.request_code(PHONE)
        clock.now = NOW + timedelta(minutes=5)
        sms.send_code.side_effect = None
        await service.request_code(PHONE)

    asyncio.run(asyncio.wait_for(scenario(), timeout=15))
