"""登录前的短信请求状态，不保存验证码，不调用供应商，不创建用户或会话。

发送：reserve → 提交 → 调用短信服务 → finish_send → 提交。
核验：claim → 提交 → 调用核验服务 → finish_verification → 提交。
成功消费、获取/创建用户、创建会话应在同一个最终事务中完成。
外部调用期间不得持有数据库事务；本模块不自动提交或回滚。状态操作优先作为
新短事务的首个数据库操作，避免 SQLite 先读后写升级锁；锁超时等数据库错误仍抛出。

每个手机号只保留当前请求，用途固定为登录。sending/ready/verifying 是过程状态，
used/failed 是终态；过期由 expires_at 判断，无需后台任务修改状态。
崩溃遗留的 sending/verifying 不自动重试，到期后可申请新请求。
此处只有手机号冷却和单请求尝试上限，不替代 IP 限流、总预算或长期反滥用限制。
"""

import re
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy import CheckConstraint, DateTime, Integer, String, UniqueConstraint, case, or_, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Mapped, Session, mapped_column

from .database import Base


class SmsLoginRequest(Base):
    __tablename__ = "sms_login_requests"
    __table_args__ = (
        UniqueConstraint("request_id", name="uq_sms_login_requests_request_id"),
        CheckConstraint("status IN ('sending', 'ready', 'verifying', 'used', 'failed')", name="ck_sms_login_requests_status"),
        CheckConstraint("attempts >= 0 AND attempts <= max_attempts AND max_attempts > 0", name="ck_sms_login_requests_attempts"),
        CheckConstraint("expires_at > created_at AND next_send_at >= created_at", name="ck_sms_login_requests_times"),
    )

    phone_number: Mapped[str] = mapped_column(String(11), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(43), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    next_send_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False)


@dataclass(frozen=True)
class VerificationAttempt:
    """仅供服务端使用的核验领取结果；不能从前端提交的数据构造。

    number 作为本请求内的尝试版本，防止旧核验结果完成后来的新尝试。
    用这里绑定的 phone_number 调用供应商，不能另取客户端传来的手机号。
    """

    request_id: str = field(repr=False)
    phone_number: str = field(repr=False)
    number: int


def reserve_sms_login(
    session: Session, phone_number: str, *, now: datetime | None = None,
    cooldown: timedelta = timedelta(seconds=60),
    lifetime: timedelta = timedelta(minutes=5), max_attempts: int = 5,
) -> str | None:
    """原子预留一次发送；被冷却/未过期的处理中请求阻止时返回 None。

    输入限 11 位大陆手机号，不自动去空格或国家码，避免同号多种形式绕过限制。
    成功返回随机 request_id；先提交再调用发送服务。冷却从预留时计时，失败不退款。
    替换立即作废旧 ID，即使新发送失败也不恢复旧请求。有效期从预留时算起，
    配置不能长于供应商验证码有效期；默认与现有短信服务的 300 秒一致。
    限制参数只能来自可信后端配置，不能接受前端指定。
    """
    if not isinstance(phone_number, str) or re.fullmatch(r"1[3-9][0-9]{9}", phone_number) is None:
        raise ValueError("请提供 11 位中国大陆手机号，不含国家码或空格。")
    if any(not isinstance(value, timedelta) or value <= timedelta(0) for value in (cooldown, lifetime)):
        raise ValueError("发送冷却和请求有效期必须是正的 timedelta。")
    if type(max_attempts) is not int or max_attempts < 1:
        raise ValueError("核验次数上限必须是正整数。")
    current = _utc_now(now)
    try:
        expires_at, next_send_at = current + lifetime, current + cooldown
    except OverflowError:
        raise ValueError("短信登录请求的时间范围超出支持范围。") from None
    values = dict(
        request_id=secrets.token_urlsafe(32), status="sending", created_at=current,
        expires_at=expires_at, next_send_at=next_send_at,
        attempts=0, max_attempts=max_attempts,
    )
    stmt = insert(SmsLoginRequest).values(phone_number=phone_number, **values)
    # 先写后读，由唯一手机号上的条件 upsert 仲裁两个并发发送请求。
    stmt = stmt.on_conflict_do_update(
        index_elements=[SmsLoginRequest.phone_number], set_=values,
        where=(SmsLoginRequest.next_send_at <= current) & or_(
            SmsLoginRequest.expires_at <= current,
            SmsLoginRequest.status.not_in(("sending", "verifying")),
        ),
    ).returning(SmsLoginRequest.request_id)
    return session.execute(stmt).scalar_one_or_none()


def finish_sms_send(
    session: Session, request_id: str,
    outcome: Literal["accepted", "rejected", "unknown"], *, now: datetime | None = None,
) -> bool:
    """记录服务端发送结果；accepted 只代表供应商接受，不代表送达。

    rejected 是明确拒绝，保留原冷却；unknown 包括超时等不确定结果，禁止核验，
    并至少等到本次有效期结束再重发。旧 ID、重复完成、过期完成均返回 False。
    """
    if outcome not in ("accepted", "rejected", "unknown"):
        raise ValueError("未知的短信发送结果。")
    if not _valid_id(request_id):
        return False
    values = {"status": "ready" if outcome == "accepted" else "failed"}
    if outcome == "unknown":
        values["next_send_at"] = _block_until_expiry()
    result = session.execute(
        update(SmsLoginRequest).where(
            SmsLoginRequest.request_id == request_id,
            SmsLoginRequest.status == "sending",
            SmsLoginRequest.expires_at > _utc_now(now),
        ).values(**values).returning(SmsLoginRequest.request_id),
        execution_options={"synchronize_session": False},
    )
    return result.scalar_one_or_none() is not None


def claim_sms_verification(
    session: Session, request_id: str, *, now: datetime | None = None,
) -> VerificationAttempt | None:
    """原子领取一次核验并扣减机会；只有 ready 且未过期、未达上限才能领取。

    提交领取事务后才能调用供应商，不允许两个并发请求同时核验。
    即使网络中断也不退回次数；没有领取成功的请求不得调用核验服务。
    """
    if not _valid_id(request_id):
        return None
    row = session.execute(
        update(SmsLoginRequest).where(
            SmsLoginRequest.request_id == request_id,
            SmsLoginRequest.status == "ready",
            SmsLoginRequest.expires_at > _utc_now(now),
            SmsLoginRequest.attempts < SmsLoginRequest.max_attempts,
        ).values(status="verifying", attempts=SmsLoginRequest.attempts + 1)
        .returning(SmsLoginRequest.phone_number, SmsLoginRequest.attempts),
        execution_options={"synchronize_session": False},
    ).one_or_none()
    return None if row is None else VerificationAttempt(request_id, row.phone_number, row.attempts)


def finish_sms_verification(
    session: Session, attempt: VerificationAttempt,
    outcome: Literal["passed", "incorrect", "unknown"], *, now: datetime | None = None,
) -> str | None:
    """仅接收可信的供应商核验结果，成功消费时返回绑定的手机号，否则返回 None。

    passed: used；incorrect: 有剩余次数回到 ready，否则 failed；unknown: failed，
    保守禁止重试且至少等到到期再发。尝试版本、ID 和状态共同阻止迟到或重复结果。
    消费成功后，调用方应在同一事务创建用户/会话并提交；若失败则整体回滚。
    验证码已被供应商消费但数据库提交失败时，第一版不自动重放外部调用。
    """
    if outcome not in ("passed", "incorrect", "unknown"):
        raise ValueError("未知的短信核验结果。")
    status = "used" if outcome == "passed" else "failed"
    values = {"status": status}
    if outcome == "incorrect":
        values["status"] = case(
            (SmsLoginRequest.attempts < SmsLoginRequest.max_attempts, "ready"), else_="failed",
        )
    if outcome == "unknown":
        values["next_send_at"] = _block_until_expiry()
    phone = session.execute(
        update(SmsLoginRequest).where(
            SmsLoginRequest.request_id == attempt.request_id,
            SmsLoginRequest.phone_number == attempt.phone_number,
            SmsLoginRequest.attempts == attempt.number,
            SmsLoginRequest.status == "verifying",
            SmsLoginRequest.expires_at > _utc_now(now),
        ).values(**values).returning(SmsLoginRequest.phone_number),
        execution_options={"synchronize_session": False},
    ).scalar_one_or_none()
    return phone if outcome == "passed" else None


def _block_until_expiry():
    return case(
        (SmsLoginRequest.next_send_at < SmsLoginRequest.expires_at, SmsLoginRequest.expires_at),
        else_=SmsLoginRequest.next_send_at,
    )


def _valid_id(request_id: str) -> bool:
    return isinstance(request_id, str) and re.fullmatch(r"[A-Za-z0-9_-]{43}", request_id) is not None


def _utc_now(now: datetime | None) -> datetime:
    value = datetime.now(UTC) if now is None else now
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise ValueError("短信登录请求时间必须包含时区。")
    return value.astimezone(UTC).replace(tzinfo=None)
