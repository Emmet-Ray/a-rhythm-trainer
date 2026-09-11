import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from alibabacloud_dypnsapi20170525 import models

from sms_auth import SmsAuth, SmsConfigurationError, SmsServiceError, SmsSettings


@pytest.fixture
def settings():
    return SmsSettings("test-key", "test-secret", "测试签名", "test-template", "login-test")


@pytest.fixture
def sdk(monkeypatch):
    # 替换 SDK 网络边界，所有测试均不能发送真实短信，也不读取本机凭证。
    client = SimpleNamespace(
        send_sms_verify_code_with_options_async=AsyncMock(),
        check_sms_verify_code_with_options_async=AsyncMock(),
    )
    configs = []

    def create(config):
        configs.append(config)
        return client

    monkeypatch.setattr("sms_auth.Client", create)
    return client, configs


def check_response(result="PASS", **changes):
    data = {"Code": "OK", "Success": True, "Model": {"VerifyResult": result}}
    data.update(changes)
    return models.CheckSmsVerifyCodeResponse().from_map({"body": data})


def test_send_parameters_and_no_code_return(settings, sdk):
    client, configs = sdk
    client.send_sms_verify_code_with_options_async.return_value = models.SendSmsVerifyCodeResponse().from_map({
        "body": {"Code": "OK", "Success": True, "Model": {"VerifyCode": "secret-code"}},
    })
    service = SmsAuth(settings)
    assert asyncio.run(service.send_code("13800000000")) is None
    assert configs[0].endpoint == "dypnsapi.aliyuncs.com"
    assert configs[0].protocol == "https"
    request, runtime = client.send_sms_verify_code_with_options_async.call_args.args
    assert request.phone_number == "13800000000"
    assert request.country_code == "86"
    assert request.scheme_name == "login-test"
    assert request.sign_name == settings.sign_name
    assert request.template_code == settings.template_code
    assert json.loads(request.template_param) == {"code": "##code##", "min": "5"}
    assert (request.code_length, request.code_type, request.valid_time) == (6, 1, 300)
    assert (request.interval, request.duplicate_policy, request.auto_retry) == (60, 1, 0)
    assert request.return_verify_code is False
    assert runtime.autoretry is False
    assert (runtime.connect_timeout, runtime.read_timeout) == (5000, 10000)


@pytest.mark.parametrize(("result", "expected"), [("PASS", True), ("UNKNOWN", False)])
def test_verify_result_not_request_success(settings, sdk, result, expected):
    client, _ = sdk
    client.check_sms_verify_code_with_options_async.return_value = check_response(result)
    assert asyncio.run(SmsAuth(settings).verify_code("13800000000", "012345")) is expected
    request, runtime = client.check_sms_verify_code_with_options_async.call_args.args
    assert request.verify_code == "012345"
    assert request.phone_number == "13800000000"
    assert request.country_code == "86"
    assert request.scheme_name == settings.scheme_name
    assert runtime.autoretry is False


@pytest.mark.parametrize("response", [
    None, SimpleNamespace(body=None), check_response("FAIL"), check_response(None),
    check_response(Code="ERROR"), check_response(Success=False), check_response(Model={}),
])
def test_verify_rejects_service_errors_and_malformed_responses(settings, sdk, response):
    sdk[0].check_sms_verify_code_with_options_async.return_value = response
    with pytest.raises(SmsServiceError):
        asyncio.run(SmsAuth(settings).verify_code("13800000000", "123456"))


@pytest.mark.parametrize("body", [None, {"Code": "ERROR", "Success": True}, {"Code": "OK", "Success": False}, {}])
def test_send_rejection(settings, sdk, body):
    sdk[0].send_sms_verify_code_with_options_async.return_value = models.SendSmsVerifyCodeResponse().from_map({"body": body})
    with pytest.raises(SmsServiceError):
        asyncio.run(SmsAuth(settings).send_code("13800000000"))


@pytest.mark.parametrize("operation", ["send", "verify"])
def test_network_failure_is_sanitized_and_not_retried(settings, sdk, operation):
    client, _ = sdk
    mock = client.send_sms_verify_code_with_options_async if operation == "send" else client.check_sms_verify_code_with_options_async
    mock.side_effect = TimeoutError("test-secret 13800000000 123456")
    service = SmsAuth(settings)
    with pytest.raises(SmsServiceError) as error:
        asyncio.run(service.send_code("13800000000") if operation == "send" else service.verify_code("13800000000", "123456"))
    assert "test-secret" not in str(error.value)
    assert "13800000000" not in str(error.value)
    assert "123456" not in str(error.value)
    assert error.value.__suppress_context__ is True
    assert mock.await_count == 1


@pytest.mark.parametrize("phone", ["", "123", "+8613800000000", "13800000000 ", "１３８００００００００", None])
def test_invalid_phone_never_calls_sdk(settings, sdk, phone):
    service = SmsAuth(settings)
    with pytest.raises(ValueError):
        asyncio.run(service.send_code(phone))
    with pytest.raises(ValueError):
        asyncio.run(service.verify_code(phone, "123456"))
    sdk[0].send_sms_verify_code_with_options_async.assert_not_called()
    sdk[0].check_sms_verify_code_with_options_async.assert_not_called()


@pytest.mark.parametrize("code", ["", "12345", "1234567", "１２３４５６", "abcdef", 123456])
def test_invalid_code_never_calls_sdk(settings, sdk, code):
    with pytest.raises(ValueError):
        asyncio.run(SmsAuth(settings).verify_code("13800000000", code))
    sdk[0].check_sms_verify_code_with_options_async.assert_not_called()


def test_settings_from_environment(monkeypatch):
    values = {"ALIBABA_CLOUD_ACCESS_KEY_ID": "test-key", "ALIBABA_CLOUD_ACCESS_KEY_SECRET": "test-secret",
              "SMS_SIGN_NAME": "测试签名", "SMS_TEMPLATE_CODE": "test-template", "SMS_SCHEME_NAME": ""}
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    settings = SmsSettings.from_env()
    assert settings.scheme_name == ""
    assert "test-key" not in repr(settings) and "test-secret" not in repr(settings)
    monkeypatch.setenv("SMS_SCHEME_NAME", "x" * 21)
    with pytest.raises(SmsConfigurationError):
        SmsSettings.from_env()
    monkeypatch.setenv("SMS_SCHEME_NAME", "")
    for key in list(values)[:4]:
        monkeypatch.setenv(key, " ")
        with pytest.raises(SmsConfigurationError, match=key):
            SmsSettings.from_env()
        monkeypatch.setenv(key, values[key])


def test_default_scheme_omitted_consistently(sdk):
    service = SmsAuth(SmsSettings("key", "secret", "sign", "template"))
    sdk[0].send_sms_verify_code_with_options_async.return_value = models.SendSmsVerifyCodeResponse().from_map({"body": {"Code": "OK", "Success": True}})
    sdk[0].check_sms_verify_code_with_options_async.return_value = check_response()
    asyncio.run(service.send_code("13800000000"))
    asyncio.run(service.verify_code("13800000000", "123456"))
    assert sdk[0].send_sms_verify_code_with_options_async.call_args.args[0].scheme_name is None
    assert sdk[0].check_sms_verify_code_with_options_async.call_args.args[0].scheme_name is None
