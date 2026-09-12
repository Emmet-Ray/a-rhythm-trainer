"""当前账号的自定义练习接口；不接收归属信息，不导入浏览器本地内容。"""

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from api.dependencies import AuthenticatedUser, DatabaseEngine
from api.http_policy import SessionApiRoute
from db.custom_exercises import (
    CustomExercise, create_custom_exercise, get_custom_exercise, list_custom_exercises,
)


router = APIRouter(prefix="/api/custom-exercises", tags=["custom-exercises"], route_class=SessionApiRoute)
Mode = Literal["tapping", "dictation"]


class CreateExerciseBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str
    mode: Mode
    # 这里只验证外层类型；保存时统一调用 domain.rhythm 校验节奏，避免规则漂移。
    exercise: dict


class ExerciseSummary(BaseModel):
    id: str
    name: str
    mode: Mode
    created_at: datetime


class ExerciseResponse(ExerciseSummary):
    exercise: dict


class ExercisePage(BaseModel):
    items: list[ExerciseSummary]
    limit: int
    offset: int


def _summary(item: CustomExercise) -> ExerciseSummary:
    # SQLite 返回无时区的 UTC，不能按机器本地时间解释；API 明确输出 UTC。
    return ExerciseSummary(
        id=item.id, name=item.name, mode=item.mode,
        created_at=item.created_at.replace(tzinfo=UTC),
    )


def _detail(item: CustomExercise) -> ExerciseResponse:
    return ExerciseResponse(**_summary(item).model_dump(), exercise=item.exercise)


@router.post("", status_code=201, response_model=ExerciseResponse)
def save_exercise(body: CreateExerciseBody, user: AuthenticatedUser, engine: DatabaseEngine):
    with Session(engine) as session, session.begin():
        try:
            item = create_custom_exercise(
                session, user.id, name=body.name, mode=body.mode, exercise=body.exercise,
            )
        except ValueError as error:
            # 存取模块的校验消息是固定说明，不含提交内容；不捕获数据库错误。
            raise HTTPException(422, str(error)) from None
        result = _detail(item)
    # 离开 begin 块即已提交；提交失败不会返回 201 或成功响应体。
    return result


@router.get("", response_model=ExercisePage)
def list_exercises(
    user: AuthenticatedUser, engine: DatabaseEngine, mode: Mode,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    with Session(engine) as session:
        items = list_custom_exercises(session, user.id, mode, limit=limit, offset=offset)
        return ExercisePage(items=[_summary(item) for item in items], limit=limit, offset=offset)


@router.get("/{exercise_id}", response_model=ExerciseResponse)
def read_exercise(exercise_id: str, user: AuthenticatedUser, engine: DatabaseEngine):
    with Session(engine) as session:
        item = get_custom_exercise(session, user.id, exercise_id)
        if item is None:
            raise HTTPException(404, "练习不存在。")
        return _detail(item)
