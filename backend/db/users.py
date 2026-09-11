"""本站用户身份；只有通过手机号验证后才能由登录流程创建用户。"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("phone_number", name="uq_users_phone_number"),
        # 已删除账号的 ID 不再分配给新账号，避免旧引用指向另一个人。
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone_number: Mapped[str] = mapped_column(String(11), nullable=False)
    # SQLite CURRENT_TIMESTAMP 生成 UTC；DateTime 读取为无 tzinfo 的 UTC 时间。
    # 以后输出 API 时需显式标识 UTC，不能将其当作服务器本地时间。
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
