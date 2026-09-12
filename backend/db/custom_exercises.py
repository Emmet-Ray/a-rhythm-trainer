"""账号下的完整自定义练习；不处理 HTTP、不读取登录状态、不自动提交事务。

调用方必须从已认证会话取得 user_id，不能采用请求体中的用户 ID。
本模块提供新建及用户范围内的查询，暂无更新、删除或本地数据导入。
节奏内容整体保存为 JSON；将来更新时应重新校验并整体赋值，不原地修改嵌套 JSON。
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, String, select, text
from sqlalchemy.orm import Mapped, Session, mapped_column

from .database import Base
from .users import User


MAX_NAME_LENGTH = 100
MAX_MEASURES = 64
# 与前端相同的音乐时间单位：四分音符 24 tick，三连音中每音 8 tick。
_NOTE_TICKS = {"whole": 96, "half": 48, "quarter": 24, "eighth": 12, "sixteenth": 6}


class CustomExercise(Base):
    __tablename__ = "custom_exercises"
    __table_args__ = (
        CheckConstraint("length(trim(name)) BETWEEN 1 AND 100", name="ck_custom_exercises_name"),
        CheckConstraint("mode IN ('tapping', 'dictation')", name="ck_custom_exercises_mode"),
        # JSON 列不会自行检查内容；数据库防住非 JSON/非对象，业务校验负责节奏合法性。
        CheckConstraint(
            "CASE WHEN json_valid(exercise) THEN json_type(exercise) = 'object' ELSE 0 END",
            name="ck_custom_exercises_json_object",
        ),
        Index("ix_custom_exercises_user_mode_created_id", "user_id", "mode", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(43), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id, ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    mode: Mapped[str] = mapped_column(String(10), nullable=False)
    exercise: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=False)
    # 和 users 表保持一致：无 tzinfo 的 UTC；输出 API 时须显式标注时区。
    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


def create_custom_exercise(
    session: Session, user_id: int, *, name: str, mode: str, exercise: object,
) -> CustomExercise:
    """校验后新建独立快照；同名不覆盖，ID/创建时间由后端生成。

    名称去除首尾空白，限 1–100 字符；题目限 1–64 小节，每小节完整四拍。
    拒绝额外字段及尚未支持的节奏；不会修改调用方的输入。
    flush 后返回 ORM 对象，不 commit/rollback/关闭 Session；提交成功才可通知用户。
    """
    _require_user(user_id)
    _require_mode(mode)
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= MAX_NAME_LENGTH:
        raise ValueError("练习名称须为 1–100 个字符。")
    normalized = _parse_exercise(exercise)
    item = CustomExercise(
        id=f"custom-{uuid4()}", user_id=user_id, name=name.strip(), mode=mode, exercise=normalized,
    )
    session.add(item)
    session.flush()
    return item


def list_custom_exercises(
    session: Session, user_id: int, mode: str, *, limit: int = 50, offset: int = 0,
) -> list[CustomExercise]:
    """只列出指定用户和模式的练习，按创建时间、ID 降序分页。

    每页默认 50 条，最多 100 条；offset 为非负整数。无结果返回空列表，数据库错误
    仍抛出，不能伪装成空题库。查询不 flush 调用方未保存的对象，不提交事务。
    """
    _require_user(user_id)
    _require_mode(mode)
    if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or offset < 0:
        raise ValueError("分页须满足 limit 为 1–100 的整数，offset 为非负整数。")
    with session.no_autoflush:
        return list(session.scalars(select(CustomExercise).where(
            CustomExercise.user_id == user_id, CustomExercise.mode == mode,
        ).order_by(CustomExercise.created_at.desc(), CustomExercise.id.desc()).limit(limit).offset(offset)))


def get_custom_exercise(session: Session, user_id: int, exercise_id: str) -> CustomExercise | None:
    """按当前用户与 ID 一起查询；不存在或属于其他用户均返回 None，不泄露归属。

    返回 ORM 对象供当前 Session 内使用；不 flush、不提交，数据库错误仍抛出。
    """
    _require_user(user_id)
    if not isinstance(exercise_id, str) or not exercise_id:
        return None
    with session.no_autoflush:
        return session.scalar(select(CustomExercise).where(
            CustomExercise.user_id == user_id, CustomExercise.id == exercise_id,
        ))


def _require_user(user_id):
    if type(user_id) is not int or user_id <= 0:
        raise ValueError("必须提供有效的当前用户 ID。")


def _require_mode(mode):
    if mode not in ("tapping", "dictation"):
        raise ValueError("练习模式仅支持 tapping 或 dictation。")


def _object(value, required, optional=()):
    if not isinstance(value, dict) or not set(required) <= value.keys() or value.keys() - set(required) - set(optional):
        raise ValueError("练习结构存在缺失、额外字段或错误的对象类型。")
    return value


def _event(value, *, triplet=False):
    event = _object(value, ("kind", "noteValue"), ("dots",))
    kind, note_value, dots = event["kind"], event["noteValue"], event.get("dots", 0)
    if kind not in ("note", "rest") or not isinstance(note_value, str) or note_value not in _NOTE_TICKS:
        raise ValueError("不支持的音符或休止符类型。")
    if type(dots) is not int or dots not in (0, 1):
        raise ValueError("附点数只支持 0 或 1。")
    if triplet and (kind != "note" or note_value != "eighth" or dots != 0):
        raise ValueError("小三连只能包含三个无附点八分音符。")
    copied = {"kind": kind, "noteValue": note_value}
    if "dots" in event:
        copied["dots"] = dots
    ticks = 8 if triplet else _NOTE_TICKS[note_value] * (3 if dots else 2) // 2
    return copied, ticks


def _parse_exercise(value):
    exercise = _object(value, ("timeSignature", "measures"))
    signature = _object(exercise["timeSignature"], ("beats", "beatType"))
    if any(type(signature[key]) is not int or signature[key] != 4 for key in ("beats", "beatType")):
        raise ValueError("目前只支持 4/4 拍。")
    measures = exercise["measures"]
    if not isinstance(measures, list) or not 1 <= len(measures) <= MAX_MEASURES:
        raise ValueError("练习须包含 1–64 个小节。")
    result = []
    for index, measure in enumerate(measures, 1):
        try:
            elements = _object(measure, ("elements",))["elements"]
            # 最短普通音符为十六分音符，合法四拍最多 16 个顶层元素。
            if not isinstance(elements, list) or not 1 <= len(elements) <= 16:
                raise ValueError("小节须包含 1–16 个节奏元素。")
            copied, total = [], 0
            for element in elements:
                if isinstance(element, dict) and element.get("kind") == "triplet":
                    notes = _object(element, ("kind", "notes"))["notes"]
                    if not isinstance(notes, list) or len(notes) != 3:
                        raise ValueError("小三连必须恰好包含三个音符。")
                    copied.append({"kind": "triplet", "notes": [_event(note, triplet=True)[0] for note in notes]})
                    total += 24
                else:
                    event, ticks = _event(element)
                    copied.append(event)
                    total += ticks
            if total != 96:
                raise ValueError("小节必须恰好四拍。")
            result.append({"elements": copied})
        except ValueError as error:
            raise ValueError(f"第 {index} 小节：{error}") from None
    return {"timeSignature": {"beats": 4, "beatType": 4}, "measures": result}
