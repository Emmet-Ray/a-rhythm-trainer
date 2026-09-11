# 后端

Python 3.12+、FastAPI，使用 uv 管理独立依赖和虚拟环境。
目前对外只有健康检查；短信认证模块已实现，但没有开放短信 HTTP 接口，也不包含数据库、用户或登录会话。前端已配置本地 `/api` 代理，见 [前后端联调说明](../联调.md)。

## 本地启动

从仓库根目录执行：

```sh
cd backend
uv sync --locked
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

`main:app` 指向 `main.py` 中的 FastAPI 实例。`--reload` 仅用于开发。
依赖安装在本目录的 `.venv`，不需要全局安装或手动激活。
`uv.lock` 应提交，用于固定依赖版本；`.venv` 不提交。

- 健康检查：<http://127.0.0.1:8000/api/health>，返回 `{"status":"ok"}`。
- 接口文档：<http://127.0.0.1:8000/docs>。
- OpenAPI 描述：<http://127.0.0.1:8000/openapi.json>。

健康检查仅证明后端能够响应请求，不检查尚未接入的服务。
健康检查不需要密钥，短信模块不会在应用启动或导入时读取配置、发送请求。

## 短信验证码模块

`sms_auth.py` 使用阿里云号码认证 SDK（`dypnsapi`，不是普通短信 `dysmsapi`）。
`SmsSettings.from_env()` 显式读取后端进程环境，配置项见 [.env.example](.env.example)。
本项目不自动加载 `.env`；仅复制示例文件不会生效。如使用本地 `.env`，须通过所用运行工具显式加载，且不得提交真实文件。
密钥只保留在后端，建议使用最小权限的 RAM 凭证，仅授予所需发送和核验权限；不得写入 React、日志或 Git。

模块接口（均为异步方法）：

- `SmsAuth(settings).send_code(phone)`：正常返回 `None` 代表请求被接受，不保证运营商送达；拒绝或调用异常抛 `SmsServiceError`。
- `SmsAuth(settings).verify_code(phone, code)`：只有 `Code=OK`、`Success=true` 且 `Model.VerifyResult=PASS` 才返回 `True`；`UNKNOWN` 返回 `False`，不区分错误和过期。未知结果、缺失响应、权限或网络异常抛 `SmsServiceError`。
- 格式错误抛 `ValueError`，缺失配置抛 `SmsConfigurationError`；错误消息不透传服务商原始响应，不包含手机号、验证码或密钥。

第一版接收中国大陆 11 位本地格式手机号（不含 `+86` 或空格），验证码是 6 位数字字符串，保留前导零。使用平台赠送签名及配套模板，模板变量固定为 `code`、`min`；短信由平台生成验证码（`##code##`），有效期 300 秒，文案 5 分钟。重新发送覆盖旧码，服务端间隔参数 60 秒，发送响应不要求返回验证码。发送和核验始终使用同一方案，方案留空即默认方案。

连接/读取超时分别为 5/10 秒；SDK 自动重试及发送接口的运营商失败自动重试均显式关闭。发送超时不能证明短信未发送，不立即自动重发。响应和异常不作原始日志输出。

**此模块不是完整登录系统。** 尚无应用侧 IP/手机号限流、验证码尝试次数限制、发送预算控制、登录挑战的一次性消费、用户创建或会话。不能直接将其暴露为公开接口；不把供应商通过结果视为可以无限重复建立会话的凭证。后续接入登录时需补齐这些保护。

### 本地手动接入验证

不需要启动 FastAPI 或前端。在 `backend/` 下复制 `.env.example` 为 `.env`，在本机填写密钥、签名和模板；已有 `.env` 时直接编辑，不要覆盖。真实配置不得提交，也不要粘贴到聊天中。

```sh
uv run --locked --env-file .env python verify_sms.py
```

这里由 uv 显式加载 `.env`。脚本先检查配置，输入你自己的手机号并回车后便会发送一次真实短信，可能产生费用。随后输入验证码，输出核验是否通过。验证码采用普通输入，会显示在终端中，注意不要将其截图分享；不要把验证码放在命令行参数或管道中。

每次运行最多发送一次、核验一次，不自动重试。发送超时或确认后中止时，短信仍可能已提交，请先检查手机，不要连续重跑。核验通过只证明服务接入可用，不代表本站登录已完成。

普通 `pytest` 只使用模拟 SDK 响应，不读取真实凭证、不访问阿里云；真实发送只由开发者手动确认触发。

官方参考：[发送验证码](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode)、[核验验证码](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-checksmsverifycode)。

## 测试

在 `backend/` 下执行：

```sh
uv run pytest
```

测试使用内存中的测试客户端，不启动监听端口，也不调用短信服务。
后续按实际业务增加模块，暂不预建空的用户、认证和数据库目录。
