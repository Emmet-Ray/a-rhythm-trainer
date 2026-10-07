"""带版本号的实例记录文档；比较版本后更新，避免覆盖其他标签页写入。"""

from sqlalchemy import Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


class Document(Base):
    __tablename__ = "instance_documents"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)


class RecordOperation(Base):
    __tablename__ = "record_operations"
    operation_id: Mapped[str] = mapped_column(String, primary_key=True)
