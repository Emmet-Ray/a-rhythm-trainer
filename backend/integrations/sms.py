"""短信身份验证边界；不创建用户、会话，也不提供 HTTP 路由。"""

import json
import os
import re
from dataclasses import dataclass, field

from alibabacloud_dypnsapi20170525.client import Client
from alibabacloud_dypnsapi20170525 import models
from alibabacloud_tea_openapi.models import Config
from alibabacloud_tea_util.models import RuntimeOptions


class SmsConfigurationError(ValueError):
    """本地配置不完整；消息只包含配置项名称，不包含配置值。"""


class SmsServiceError(RuntimeError):
    """短信服务异常，不等同于验证码错误；不携带 SDK 原始响应。"""


class SmsSendRejected(SmsServiceError):
    """服务明确拒绝发送；其他服务异常均保守视为结果不确定。"""


@dataclass(frozen=True)
class SmsSettings:
    access_key_id: str = field(repr=False)
    access_key_secret: str = field(repr=False)
    sign_name: str
    template_code: str
    scheme_name: str = ""

    def __post_init__(self):
        for name in ("access_key_id", "access_key_secret", "sign_name", "template_code"):
            value = getattr(self, name)
            if not isinstance(value, str) or not value.strip():
                raise SmsConfigurationError(f"短信配置缺少 {name}。")
        if not isinstance(self.scheme_name, str) or len(self.scheme_name) > 20:
            raise SmsConfigurationError("短信 scheme_name 必须是不超过 20 字符的字符串。")

    @classmethod
    def from_env(cls):
        """显式调用时读取进程环境；不自动读取 .env，不在导入时加载凭证。"""
        def required(name):
            value = os.environ.get(name, "").strip()
            if not value:
                raise SmsConfigurationError(f"请配置后端环境变量 {name}。")
            return value

        return cls(
            access_key_id=required("ALIBABA_CLOUD_ACCESS_KEY_ID"),
            access_key_secret=required("ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
            sign_name=required("SMS_SIGN_NAME"),
            template_code=required("SMS_TEMPLATE_CODE"),
            scheme_name=os.environ.get("SMS_SCHEME_NAME", "").strip(),
        )


def _phone_number(phone: str) -> str:
    # 第一版仅接收中国大陆本地格式，不猜测或截断国家码。
    if not isinstance(phone, str) or not re.fullmatch(r"1[3-9][0-9]{9}", phone):
        raise ValueError("请提供 11 位中国大陆手机号，不含国家码或空格。")
    return phone


def _runtime() -> RuntimeOptions:
    # 超时无法判断是否已提交；不自动重试，避免重复发送或重复核验。
    return RuntimeOptions(connect_timeout=5000, read_timeout=10000, autoretry=False)


class SmsAuth:
    """登录专用短信认证，SDK 和服务商字段均封装在此。

    send_code 正常返回仅代表服务接受发送请求，不保证手机送达。
    verify_code 返回 bool；错误/过期统一为未通过，服务异常抛 SmsServiceError。
    调用方还需实现登录挑战消费、限流和会话；不能直接作为公开登录接口。
    """

    def __init__(self, settings: SmsSettings):
        self._settings = settings
        self._client = Client(Config(
            access_key_id=settings.access_key_id,
            access_key_secret=settings.access_key_secret,
            endpoint="dypnsapi.aliyuncs.com",
            protocol="https",
        ))

    async def send_code(self, phone: str) -> None:
        request = models.SendSmsVerifyCodeRequest(
            phone_number=_phone_number(phone), country_code="86",
            scheme_name=self._settings.scheme_name or None,
            sign_name=self._settings.sign_name,
            template_code=self._settings.template_code,
            template_param=json.dumps({"code": "##code##", "min": "5"}),
            code_type=1, code_length=6, valid_time=300,
            interval=60, duplicate_policy=1, return_verify_code=False, auto_retry=0,
        )
        try:
            response = await self._client.send_sms_verify_code_with_options_async(request, _runtime())
            body = response.body
            accepted = body is not None and body.code == "OK" and body.success is True
        except Exception:
            # 不透传可能含手机号、验证码或凭证的 SDK 错误信息。
            raise SmsServiceError("短信服务调用失败，发送结果无法确认，请稍后再试。") from None
        if not accepted:
            if body is not None and isinstance(body.code, str) and body.code and body.success is False:
                raise SmsSendRejected("短信发送请求未被接受，请稍后重试或检查服务配置。")
            raise SmsServiceError("短信发送结果无法确认，请稍后再试。")

    async def verify_code(self, phone: str, code: str) -> bool:
        phone = _phone_number(phone)
        if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6}", code):
            raise ValueError("验证码必须是 6 位数字字符串。")
        request = models.CheckSmsVerifyCodeRequest(
            phone_number=phone, country_code="86", verify_code=code,
            scheme_name=self._settings.scheme_name or None,
        )
        try:
            response = await self._client.check_sms_verify_code_with_options_async(request, _runtime())
            body = response.body
            if body is None or body.code != "OK" or body.success is not True or body.model is None:
                raise ValueError("Invalid provider response")
            result = body.model.verify_result
        except Exception:
            raise SmsServiceError("短信核验服务暂不可用，请稍后再试。") from None
        if result == "PASS":
            return True
        if result == "UNKNOWN":
            return False
        # 未知枚举或缺失字段不是正常的验证失败，更不能默认放行。
        raise SmsServiceError("短信核验服务返回了无法识别的结果。")
