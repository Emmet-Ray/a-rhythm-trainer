"""短信登录编排；不提供 HTTP 路由、Cookie 或自动重试。

数据库短事务在线程中执行，每次独立创建并关闭 Session；网络等待期间不持有事务。
取消、进程崩溃或提交失败可能留下 sending/verifying，按请求有效期保守阻止重试。
不记录手机号、验证码和会话凭证；公开接入前仍需 IP 限流、预算及请求来源保护。
"""

import asyncio
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from db.sessions import create_login_session
from db.sms_logins import (
    claim_sms_verification, finish_sms_send, finish_sms_verification,
    reserve_sms_login, VerificationAttempt,
)
from db.users import get_or_create_user
from sms_auth import SmsAuth, SmsSendRejected, SmsServiceError


class LoginRequestBlocked(RuntimeError):
    """当前手机号处于冷却或处理中，不能发送新验证码。"""


class LoginRequestUnavailable(RuntimeError):
    """请求不存在、已过期、处理中、已消费或已耗尽核验机会。"""


class InvalidVerificationCode(ValueError):
    """验证码格式错误或未通过核验。"""


@dataclass(frozen=True)
class LoginResult:
    user_id: int
    token: str = field(repr=False)
    expires_at: datetime


class Auth:
    """将短信认证变成本站登录，调用方只需要发送验证码和提交核验。

    engine、sms 由应用显式注入，不在导入时读取配置。session_lifetime 为可信后端
    策略，不接受客户端指定；短信冷却、有效期和机会数沿用 db.sms_logins 默认值。
    clock 默认真实 UTC 时间，测试可注入含时区的时钟；每个事务重新取时。
    返回 LoginResult 前已经提交成功，token 仅供后续 HTTP 层设置安全 Cookie。
    """

    def __init__(
        self, engine: Engine, sms: SmsAuth, *, session_lifetime: timedelta,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ):
        if not isinstance(session_lifetime, timedelta) or session_lifetime <= timedelta(0):
            raise ValueError("会话有效期必须是正的 timedelta。")
        self._engine = engine
        self._sms = sms
        self._session_lifetime = session_lifetime
        self._clock = clock

    async def request_code(self, phone_number: str) -> str:
        """发送并返回请求 ID；被限制时不调用供应商，发送成功不等于手机送达。"""
        request_id = await self._transaction(reserve_sms_login, phone_number)
        if request_id is None:
            raise LoginRequestBlocked("暂时不能重新发送验证码，请稍后再试。")
        try:
            await self._sms.send_code(phone_number)
        except SmsSendRejected:
            await self._transaction(finish_sms_send, request_id, "rejected")
            raise
        except Exception:
            await self._transaction(finish_sms_send, request_id, "unknown")
            raise SmsServiceError("短信发送结果无法确认，请稍后再试。") from None
        accepted = await self._transaction(finish_sms_send, request_id, "accepted")
        if not accepted:
            raise LoginRequestUnavailable("短信请求已失效，请重新申请。")
        return request_id

    async def login(self, request_id: str, code: str) -> LoginResult:
        """用请求绑定的手机号核验；格式错误不扣机会，正常未通过会扣一次机会。

        不接收另一个手机号，不信任前端的核验结果。请求只能成功登录一次。
        服务异常终止本次请求；不把超时当作验证码错误，不自动重放核验。
        """
        if not isinstance(code, str) or re.fullmatch(r"[0-9]{6}", code) is None:
            raise InvalidVerificationCode("验证码必须是 6 位数字字符串。")
        attempt = await self._transaction(claim_sms_verification, request_id)
        if attempt is None:
            raise LoginRequestUnavailable("短信请求不可用于核验，请稍后重试或重新申请。")
        try:
            passed = await self._sms.verify_code(attempt.phone_number, code)
            if type(passed) is not bool:
                raise SmsServiceError("无法识别核验结果。")
        except Exception:
            await self._transaction(finish_sms_verification, attempt, "unknown")
            raise SmsServiceError("短信核验结果无法确认，请稍后重新申请。") from None
        if not passed:
            await self._transaction(finish_sms_verification, attempt, "incorrect")
            raise InvalidVerificationCode("验证码错误或已过期。")
        return await self._transaction(self._complete_login, attempt)

    def _complete_login(
        self, session: Session, attempt: VerificationAttempt, *, now: datetime,
    ) -> LoginResult:
        # 消费和创建会话必须一起提交；任何失败都回滚，不能返回半完成的登录。
        phone = finish_sms_verification(session, attempt, "passed", now=now)
        if phone is None:
            raise LoginRequestUnavailable("短信请求已失效，请重新申请。")
        user = get_or_create_user(session, phone)
        token = create_login_session(
            session, user.id, lifetime=self._session_lifetime, now=now,
        )
        return LoginResult(user.id, token, now.astimezone(UTC) + self._session_lifetime)

    async def _transaction(self, operation, *args):
        def run():
            with Session(self._engine) as session, session.begin():
                result = operation(session, *args, now=self._clock())
            return result

        # SQLite 锁等待也不能阻塞异步事件循环；Session 不跨线程共享。
        return await asyncio.to_thread(run)
