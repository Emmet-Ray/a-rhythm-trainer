"""HTTP 环境配置与校验；只在显式调用 from_env 时读取，不在导入时加载。"""

import os
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import urlsplit


SESSION_LIFETIME = timedelta(days=7)


@dataclass(frozen=True)
class AuthHttpSettings:
    allowed_origins: tuple[str, ...]
    secure_cookie: bool = True

    def __post_init__(self):
        if not self.allowed_origins or type(self.secure_cookie) is not bool:
            raise ValueError("请配置登录来源和 Cookie 安全选项。")
        for origin in self.allowed_origins:
            url = urlsplit(origin)
            if (
                url.scheme not in ("http", "https") or not url.hostname
                or url.username is not None or url.password is not None
                or url.path or url.query or url.fragment
                or origin != f"{url.scheme}://{url.netloc}"
                or "*" in origin
            ):
                raise ValueError("登录来源必须是完整的 http(s) origin，不含路径或通配符。")
            try:
                url.port
            except ValueError:
                raise ValueError("登录来源端口无效。") from None
            if self.secure_cookie and url.scheme != "https":
                raise ValueError("安全 Cookie 必须配置 HTTPS 来源。")
            if not self.secure_cookie and url.hostname not in ("localhost", "127.0.0.1", "::1"):
                raise ValueError("关闭安全 Cookie 仅允许本机开发来源。")

    @property
    def cookie_name(self) -> str:
        # 线上 __Host- 前缀要求 Secure、Path=/、无 Domain，阻止子域覆盖凭证。
        return "__Host-rhythm_session" if self.secure_cookie else "rhythm_session"

    @classmethod
    def from_env(cls):
        """未开启时返回 None，健康检查不要求数据库及短信凭证。"""
        enabled = os.environ.get("AUTH_ENABLED", "false")
        if enabled not in ("true", "false"):
            raise ValueError("AUTH_ENABLED 必须为 true 或 false。")
        if enabled == "false":
            return None
        secure = os.environ.get("AUTH_COOKIE_SECURE", "true")
        if secure not in ("true", "false"):
            raise ValueError("AUTH_COOKIE_SECURE 必须为 true 或 false。")
        return cls(
            tuple(value.strip() for value in os.environ.get("AUTH_ALLOWED_ORIGINS", "").split(",") if value.strip()),
            secure == "true",
        )


