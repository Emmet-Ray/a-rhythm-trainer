"""服务端登录会话；不处理 Cookie、短信或 HTTP，不自动提交事务。"""

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, delete, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .database import Base
from .users import User


class LoginSession(Base):
    """与 SQLAlchemy Session 区分；时间按现有约定存为不带 tzinfo 的 UTC。"""

    __tablename__ = "login_sessions"
    __table_args__ = (
        CheckConstraint("expires_at > created_at", name="ck_login_sessions_expiry"),
    )

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey(User.id, ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)


def create_login_session(
    session: Session, user_id: int, *, lifetime: timedelta, now: datetime | None = None,
) -> str:
    """为已认证用户创建独立会话，返回原始凭证；仅在事务提交成功后交给浏览器。

    lifetime 必须为正；now 默认真实 UTC 时间，显式传值须含时区（用于测试）。
    数据库只接收凭证哈希，不存原文；凭证不要写日志或放入 URL。
    不撤销该用户的其他会话，不 commit/rollback/关闭 Session；失败交给调用方处理。
    """
    if not isinstance(lifetime, timedelta) or lifetime <= timedelta(0):
        raise ValueError("会话有效期必须是正的 timedelta。")
    if type(user_id) is not int or user_id <= 0:
        raise ValueError("会话必须关联有效的用户 ID。")
    created_at = _utc_now(now)
    try:
        expires_at = created_at + lifetime
    except OverflowError:
        raise ValueError("会话有效期超出支持的时间范围。") from None
    token = secrets.token_urlsafe(32)
    session.add(LoginSession(
        token_hash=_token_hash(token), user_id=user_id,
        created_at=created_at, expires_at=expires_at,
    ))
    session.flush()
    return token


def get_login_session(
    session: Session, token: str | None, *, now: datetime | None = None,
) -> LoginSession | None:
    """查询未过期的会话；缺失、非法、未知、已过期或已撤销凭证均返回 None。

    到 expires_at 即失效，不续期、不更新访问时间、不清理记录。
    使用请求自己的短事务；读取不会刷新调用方待写入的对象，数据库错误仍抛出。
    返回对象只描述会话，不替代业务中的用户归属授权检查。
    """
    token_hash = _token_hash(token)
    if token_hash is None:
        return None
    with session.no_autoflush:
        return session.scalar(
            select(LoginSession).where(
                LoginSession.token_hash == token_hash,
                LoginSession.expires_at > _utc_now(now),
            ).execution_options(populate_existing=True)
        )


def revoke_login_session(session: Session, token: str | None) -> None:
    """删除此凭证的会话，不影响其他设备；重复或无效撤销无操作。

    不提交事务；调用方提交后，后续请求才会看到撤销结果。
    不能撤回已经通过认证、正在执行的请求。
    """
    token_hash = _token_hash(token)
    if token_hash is not None:
        session.execute(delete(LoginSession).where(LoginSession.token_hash == token_hash))


def _utc_now(now: datetime | None) -> datetime:
    value = datetime.now(UTC) if now is None else now
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise ValueError("会话时间必须包含时区。")
    return value.astimezone(UTC).replace(tzinfo=None)


def _token_hash(token: str | None) -> str | None:
    # 仅接受本模块生成的 32 字节 URL-safe 凭证；不修剪或修正用户输入。
    if not isinstance(token, str) or re.fullmatch(r"[A-Za-z0-9_-]{43}", token) is None:
        return None
    return hashlib.sha256(token.encode("ascii")).hexdigest()
