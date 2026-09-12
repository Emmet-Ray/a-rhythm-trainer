"""本站用户身份；只有通过手机号验证后才能由登录流程创建用户。"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, select, text
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Mapped, Session, mapped_column

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


def get_or_create_user(session: Session, phone_number: str) -> User:
    """获取或创建已验证手机号对应的用户，不提交、不回滚、不关闭 session。

    输入必须是已规范化且通过验证的手机号；本函数不验证号码归属。
    短信核验完成后，在新的短事务中优先调用本函数，避免 SQLite 先读后写
    升级锁的竞争。手机号冲突只复用原账号，不更新其 ID 或创建时间。
    其他数据库错误（包括锁超时）原样抛出，由调用方回滚/处理整个事务。
    """
    # 先写后读：数据库唯一约束仲裁并发创建，不用查询结果推断能否插入。
    # 仅忽略手机号唯一冲突，不能用宽泛的 OR IGNORE 掩盖其他约束错误。
    session.execute(
        insert(User)
        .values(phone_number=phone_number)
        .on_conflict_do_nothing(index_elements=[User.phone_number])
    )
    return session.scalars(
        select(User).where(User.phone_number == phone_number)
    ).one()
