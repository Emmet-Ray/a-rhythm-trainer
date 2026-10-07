"""本地实例的浏览器请求来源配置。"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class HttpSettings:
    allowed_origins: tuple[str, ...]

    @classmethod
    def from_env(cls):
        values = (
            os.getenv("ALLOWED_ORIGINS")
            or os.getenv("AI_ALLOWED_ORIGINS")
            or "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080,http://127.0.0.1:8080"
        )
        return cls(tuple(value.strip() for value in values.split(",") if value.strip()))
