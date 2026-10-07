"""对话轮次及其内容校验、持久化格式和模型/UI 消息转换。"""
import base64
import binascii
from io import BytesIO
import warnings

from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_ai import BinaryContent
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4
from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from assistant.context import PageContext

MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGES = 3


class MessageImage(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    data: str = Field(max_length=4 * ((MAX_IMAGE_BYTES + 2) // 3))
    media_type: str

    @model_validator(mode='after')
    def validate_image(self):
        try:
            content = base64.b64decode(self.data, validate=True)
            if not content or len(content) > MAX_IMAGE_BYTES:
                raise ValueError()
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(BytesIO(content)) as image:
                    expected = {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp'}.get(image.format)
                    if not expected or expected != self.media_type or image.width * image.height > 16_000_000 or getattr(image, 'n_frames', 1) != 1:
                        raise ValueError()
                    image.verify()
                # JPEG 的 verify() 不解码像素；重新打开并加载，拒绝头部完整但内容截断的图片。
                with Image.open(BytesIO(content)) as image:
                    image.load()
        except (ValueError, binascii.Error, OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
            raise ValueError('请选择不超过 2 MB、1600 万像素的 PNG、JPEG 或静态 WebP 图片') from error
        return self

    def content(self) -> BinaryContent:
        return BinaryContent(data=base64.b64decode(self.data), media_type=self.media_type)

    def ui_part(self) -> dict:
        return {'type': 'file', 'mediaType': self.media_type, 'url': f'data:{self.media_type};base64,{self.data}'}


@dataclass
class Turn:
    user_id: str
    text: str
    page_context: PageContext | None
    assistant_id: str = field(default_factory=lambda: uuid4().hex)
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    messages: list[ModelMessage] = field(default_factory=list)
    images: list[MessageImage] = field(default_factory=list)

    def user_message(self) -> ModelRequest:
        content = [self.text, *[image.content() for image in self.images]] if self.images else self.text
        return ModelRequest(parts=[UserPromptPart(content)], metadata={
            "page_context": self.page_context.model_dump() if self.page_context else None,
        })

    def ui_messages(self) -> list[dict]:
        parts = [{"type": "text", "text": self.text}] if self.text else []
        parts.extend(image.ui_part() for image in self.images)
        user = {"id": self.user_id, "role": "user", "parts": parts,
                "metadata": {"created_at": self.created_at,
                             "page_context": self.page_context.model_dump() if self.page_context else None}}
        # SDK 按模型步骤导出；浏览器按一轮回复呈现。合并 parts 保留 text/tool/step 的顺序和稳定 id。
        messages = VercelAIAdapter.dump_messages(self.messages, sdk_version=7)
        parts = []
        for message in messages:
            if message.role == "assistant":
                parts.extend([{"type": "step-start"}, *[
                    part.model_dump(mode="json", by_alias=True, exclude_none=True) for part in message.parts if part.type != "reasoning"
                ]])
        return [user, *([{"id": self.assistant_id, "role": "assistant", "parts": parts,
                         "metadata": {"created_at": self.created_at}}] if parts else [])]


class SavedTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str
    text: str
    page_context: PageContext | None
    assistant_id: str
    created_at: str
    images: list[MessageImage] = Field(default_factory=list, max_length=MAX_IMAGES)


