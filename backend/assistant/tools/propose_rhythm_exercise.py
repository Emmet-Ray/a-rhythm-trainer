"""候选节奏练习：工具参数、校验后的生成结果与工具实现。"""

from pydantic import ValidationError
from pydantic_ai import ModelRetry, Tool

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from domain.rhythm import parse_rhythm_exercise


class ExerciseProposal(BaseModel):
    """模型提供的候选内容。音乐规则复用领域解析器，ID 和时间不接受外部输入。"""

    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=100, description="简短的练习名称，不附加拍号、小节数或候选等状态标签。")
    mode: Literal["tapping", "dictation"] = Field(default="tapping", description="用户要求出听写题时必须为 dictation，默认隐藏谱面；其他练习为 tapping。听写标题和说明只能给通用信息，不得透露自行选用的时值、附点、休止、三连音、数量或所在小节等答案线索。")
    description: str = Field(min_length=1, max_length=1000)
    exercise: dict = Field(description=(
        '格式为 {timeSignature: {beats: 4, beatType: 4}, measures: [{elements: [...]}]}。'
        '每小节恰好四拍。普通元素为 {kind: "note" 或 "rest", '
        'noteValue: "whole"、"half"、"quarter"、"eighth" 或 "sixteenth", dots: 0 或 1（可省略）}。'
        '小三连为 {kind: "triplet", notes: 三个无附点 eighth 音符}。'
    ))

    @field_validator("exercise")
    @classmethod
    def validate_exercise(cls, value: dict) -> dict:
        return parse_rhythm_exercise(value)


@dataclass(frozen=True, init=False)
class GeneratedExercise:
    """一份生成结果，独立于训练方式和编辑目标；作为工具结果返回，由会话订阅统一记录。

    构造时校验未可信输入，通过 snapshot() 向外提供独立副本。
    """

    title: str
    mode: Literal["tapping", "dictation"]
    description: str
    _exercise: dict = field(repr=False)
    id: str
    created_at: datetime

    def __init__(self, value: object):
        """非法候选抛出 ValidationError；成功后才分配 ID 和 UTC 时间。

        不把程序异常转成校验失败。工具执行层负责将校验错误交回模型。
        """
        proposal = ExerciseProposal.model_validate(value)
        object.__setattr__(self, "title", proposal.title)
        object.__setattr__(self, "mode", proposal.mode)
        object.__setattr__(self, "description", proposal.description)
        object.__setattr__(self, "_exercise", proposal.exercise)
        object.__setattr__(self, "id", uuid4().hex)
        object.__setattr__(self, "created_at", datetime.now(UTC))

    def snapshot(self) -> dict:
        """返回可序列化的完整记录；修改返回值不影响原练习。"""
        return {
            "id": self.id,
            "title": self.title,
            "mode": self.mode,
            "description": self.description,
            "exercise": deepcopy(self._exercise),
            "created_at": self.created_at.isoformat(),
        }


def create_propose_rhythm_exercise_tool() -> Tool:
    async def execute(**parameters) -> dict:
        try:
            exercise = GeneratedExercise(parameters)
        except ValidationError as error:
            raise ModelRetry("；".join(item["msg"] for item in error.errors(include_input=False))) from error
        return {"generated_exercise": exercise.snapshot()}

    return Tool.from_schema(
        function=execute,
        name="propose_rhythm_exercise",
        description="生成一份可试听和练习的完整 4/4 节奏练习；每小节必须恰好四拍。不会自动应用或保存到题库。",
        json_schema=ExerciseProposal.model_json_schema(),
        sequential=True,
    )
