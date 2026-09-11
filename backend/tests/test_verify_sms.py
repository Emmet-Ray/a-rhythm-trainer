from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

import verify_sms
from sms_auth import SmsConfigurationError, SmsServiceError


@pytest.fixture
def terminal(monkeypatch):
    service = SimpleNamespace(send_code=AsyncMock(), verify_code=AsyncMock(return_value=True))
    settings = Mock()
    factory = Mock(return_value=service)
    monkeypatch.setattr(verify_sms.SmsSettings, "from_env", settings)
    monkeypatch.setattr(verify_sms, "SmsAuth", factory)
    monkeypatch.setattr(verify_sms.sys.stdin, "isatty", lambda: True)
    prompt = Mock(side_effect=["13800000000", "012345"])
    monkeypatch.setattr("builtins.input", prompt)
    return service, settings, factory, prompt


@pytest.mark.parametrize("passed", [True, False])
def test_single_send_and_verification(terminal, capsys, passed):
    service, _, _, _ = terminal
    service.verify_code.return_value = passed
    assert verify_sms.main() == (0 if passed else 1)
    service.send_code.assert_awaited_once_with("13800000000")
    service.verify_code.assert_awaited_once_with("13800000000", "012345")
    output = capsys.readouterr().out
    assert ("核验通过" if passed else "核验未通过") in output
    assert "13800000000" not in output
    assert "012345" not in output


def test_cancel_phone_input_never_constructs_service(terminal):
    terminal[3].side_effect = EOFError()
    assert verify_sms.main() == 130
    terminal[2].assert_not_called()


def test_missing_configuration_stops_before_prompt(terminal, monkeypatch):
    terminal[1].side_effect = SmsConfigurationError("请配置后端环境变量 SMS_SIGN_NAME。")
    prompt = Mock()
    monkeypatch.setattr("builtins.input", prompt)
    assert verify_sms.main() == 1
    prompt.assert_not_called()
    terminal[2].assert_not_called()


def test_send_failure_does_not_retry_or_verify(terminal):
    terminal[0].send_code.side_effect = SmsServiceError("发送结果无法确认。")
    assert verify_sms.main() == 1
    terminal[0].send_code.assert_awaited_once()
    terminal[0].verify_code.assert_not_awaited()
    assert terminal[3].call_count == 1


@pytest.mark.parametrize("error", [EOFError(), KeyboardInterrupt()])
def test_interrupted_code_input_does_not_verify(terminal, error):
    terminal[3].side_effect = ["13800000000", error]
    assert verify_sms.main() == 130
    terminal[0].send_code.assert_awaited_once()
    terminal[0].verify_code.assert_not_awaited()


def test_noninteractive_input_rejected_before_config(terminal, monkeypatch):
    monkeypatch.setattr(verify_sms.sys.stdin, "isatty", lambda: False)
    assert verify_sms.main() == 1
    terminal[1].assert_not_called()
    terminal[2].assert_not_called()


def test_unexpected_error_not_printed(terminal, capsys):
    terminal[2].side_effect = RuntimeError("secret-key")
    assert verify_sms.main() == 1
    assert "secret-key" not in capsys.readouterr().out
