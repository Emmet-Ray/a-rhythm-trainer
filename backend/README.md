# 后端

Python 3.12+、FastAPI，使用 uv 管理独立依赖和虚拟环境。
目前对外只有健康检查；短信认证模块、SQLite 连接、用户模型和建表迁移已实现，但还没有用户登录流程、短信 HTTP 接口或登录会话。前端已配置本地 `/api` 代理，见 [前后端联调说明](../联调.md)。

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

## 数据库连接

第一版使用 SQLite 文件数据库，通过 SQLAlchemy 和 Python 标准库 `sqlite3` 访问，无需安装数据库服务器。业务表通过下面的 Alembic 命令显式创建，不在连接或启动 FastAPI 时自动创建，也尚未接入 HTTP 请求。

在本地 `.env` 中添加以下配置（已有文件时只补充这一项，不覆盖短信配置）：

```dotenv
DATABASE_URL=sqlite:///./data/rhythm_trainer.db
```

从 `backend/` 运行时，数据位于 `backend/data/rhythm_trainer.db`。`data/` 已忽略，不提交 Git。线上使用持久化目录的绝对路径，例如 `sqlite:////var/lib/rhythm-trainer/rhythm_trainer.db`；不要将本地测试库覆盖到线上。

`db.database.create_database_engine()` 显式读取进程环境中的 `DATABASE_URL`；也可传入地址，用于隔离测试。它会准备父目录，但直到首次连接才打开或创建数据库文件。导入模块不会读取配置或创建文件；健康检查仍不依赖数据库。仅支持普通 SQLite 文件地址，不支持内存库、网络数据库或 URL 查询参数。

使用示例（在已加载配置的 Python 进程中执行）：

```python
from sqlalchemy import text
from db.database import create_database_engine

engine = create_database_engine()
try:
    with engine.connect() as connection:
        print(connection.scalar(text("SELECT 1")))
finally:
    engine.dispose()
```

可从 `backend/` 执行 `uv run --locked --env-file .env python`，进入交互环境后运行上面的示例；这会创建配置所指向的数据库文件，但不会建表。

连接行为：

- 每条连接启用外键约束，并设置 5 秒锁等待时间；超时仍会报错，不会无限等待。
- 使用 Python 3.12+ 的非旧式事务模式。写入使用 `with engine.begin()`：正常退出提交，异常退出回滚；仅使用 `connect()` 不会自动提交写入。
- 引擎可复用，不要每条查询重建；调用方在使用结束时释放连接，应用结束时释放引擎。
- 这是同步连接入口，后续接 HTTP 时不能直接在 `async def` 中执行阻塞数据库操作。

事务和外键配置依据 [SQLAlchemy SQLite 文档](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html)。目前未配置 WAL 或备份流程；上线前仍需落实持久化与备份恢复。

## 用户表与数据库迁移

`db/users.py` 中的 `User` 是 Python 对用户表的描述；`migrations/versions/0001_create_users.py` 才是实际建表操作。`db.database.Base` 提供共享的模型 metadata，`migrations/env.py` 复用现有连接配置，不另存数据库地址。

目录职责：`db/` 放连接配置和表模型，`migrations/` 放表结构变更历史，`data/` 放不提交 Git 的实际数据库文件。登录和短信等业务流程不放进 `db/`；移动 Python 模块不会改变数据库路径或迁移版本。

| 字段 | 约定 |
| --- | --- |
| `id` | 自动生成的整数主键，删除账号后不复用旧 ID |
| `phone_number` | 非空、唯一的手机号字符串；首次登录前必须经过验证 |
| `created_at` | 非空，由数据库默认生成 UTC 创建时间 |

SQLite 读取 `created_at` 时返回不带 `tzinfo` 的 datetime，项目约定它代表 UTC，不是本地时间。以后通过 API 输出时需明确标注 UTC。`String(11)` 不是 SQLite 的手机号格式校验；号码规范化和有效性验证属于后续登录入口，本步只保证数据库的非空与唯一约束。

在 `backend/` 下执行（会修改 `.env` 中 `DATABASE_URL` 指向的数据库，请先确认目标）：

```sh
uv sync --locked
uv run --locked --env-file .env alembic upgrade head
uv run --locked --env-file .env alembic current
```

首次升级创建 `users` 和 Alembic 版本记录表；当前版本为 `0001_create_users`。再次执行 `upgrade head` 不会重复建表或清空已有用户。仅拉取代码或启动 FastAPI 不会执行迁移。

后续修改模型后，可以生成候选迁移并检查模型一致性：

```sh
uv run --locked --env-file .env alembic revision --autogenerate -m "describe change"
# 必须阅读、检查生成的迁移脚本，再执行 upgrade head。
uv run --locked --env-file .env alembic upgrade head
uv run --locked --env-file .env alembic check
```

模型和迁移脚本均提交 Git，不提交真实数据库。已应用的历史迁移不要随模型修改，应新增迁移。SQLite 表结构修改使用 Alembic batch 模式生成候选操作；自动生成并不保证迁移完全正确，仍需审查。第一份迁移的 downgrade 会删除用户表和所有用户数据，不应随意用于已有数据的库，测试只在临时库验证回退。

仅预览首次建表 SQL、不访问数据库时可执行 `uv run --locked --no-env-file alembic upgrade head --sql`。迁移机制参考 [Alembic 官方教程](https://alembic.sqlalchemy.org/en/latest/tutorial.html)。

当前没有对外注册入口，也没有“根据手机号获取或创建用户”的业务函数；后续只能在短信核验通过后创建用户，不能把前端传来的手机号直接当作可信身份。

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

HTTP 测试使用内存中的测试客户端；数据库测试只使用临时目录中的文件，验证连接、提交后重新打开、回滚、外键和配置边界。用户测试真实执行迁移，验证建表、模型一致性、用户读写、UTC 时间、唯一/非空约束、升级幂等和回退重建。不读取真实 `.env` 或操作正式数据库，不启动监听端口，也不调用短信服务。
后续按实际业务增加模块，暂不预建空的用户、认证和数据库目录。
