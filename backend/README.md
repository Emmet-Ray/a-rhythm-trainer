# 后端

Python 3.12+、FastAPI，使用 uv 管理依赖，SQLite 存储数据，SQLAlchemy 访问数据库，Alembic 管理表结构迁移。

已提供健康检查、短信登录、当前用户查询及退出接口，使用服务端会话和 HttpOnly Cookie，并接入前端登录页面。登录接口默认关闭；公开接入前仍需补齐 IP 限流、短信发送预算等反滥用保护。

账号自定义练习已完成数据库表与存取函数，尚未接入 HTTP 和前端，本地练习不会自动导入。保存上限为名称 100 字符、64 个完整 4/4 小节；查询强制按用户范围执行，列表按模式分页。具体约定见 [db/custom_exercises.py](db/custom_exercises.py)。

## 本地运行

从仓库根目录执行：

```sh
cd backend
uv sync --locked
uv run --locked uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

以下命令均从 `backend/` 执行。依赖安装在本目录的 `.venv`，无需全局安装；`--reload` 仅用于开发。

- [健康检查](http://127.0.0.1:8000/api/health)：返回 `{"status":"ok"}`，只检查 API 是否可响应，不检查数据库或短信服务。
- [接口文档](http://127.0.0.1:8000/docs)。

默认启动服务和访问健康检查不需要数据库配置或短信密钥，也不会自动建表、发送短信。开启登录后，启动时检查相关配置，关闭服务时释放数据库引擎。

## 配置

需要数据库或短信模块时，在本机创建未提交的 `.env`，或直接设置进程环境变量。已有 `.env` 时只补充所需项，不覆盖原配置。

| 环境变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | SQLite 文件地址，例如 `sqlite:///./data/rhythm_trainer.db` |
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 短信服务访问密钥 ID |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 短信服务访问密钥 |
| `SMS_SIGN_NAME` | 号码认证服务中可用的赠送签名 |
| `SMS_TEMPLATE_CODE` | 配套赠送模板编号，模板变量为 `code`、`min` |
| `SMS_SCHEME_NAME` | 可选，留空使用默认方案 |
| `AUTH_ENABLED` | 默认 `false`；设为 `true` 开启登录接口，需要数据库及短信配置 |
| `AUTH_ALLOWED_ORIGINS` | 开启后必填，逗号分隔的页面来源，精确包含协议、主机和端口，不含末尾 `/` |
| `AUTH_COOKIE_SECURE` | 默认 `true`，要求 HTTPS 来源；本地 HTTP 开发设为 `false`，仅允许本机来源 |

项目不会自动加载 `.env`。使用文件配置时，在命令中显式指定 `uv run --locked --env-file .env …`。数据库命令只需要 `DATABASE_URL`，不需要短信密钥。

密钥仅保留在后端，使用具有必要权限的 RAM 凭证；不写入前端、日志或 Git。短信发送会产生费用，结果不明时不要立即重复发送。

会话固定有效期为 7 天，不自动续期；Cookie 使用 HttpOnly、SameSite=Lax、Path=/，不设置 Domain。线上使用带 `__Host-` 前缀的 Secure Cookie；本地 HTTP 使用独立名称。所有登录 POST 接口严格检查 Origin，缺失或 `null` 也拒绝；来源检查不能阻止脚本伪造请求，不替代限流和预算。

默认相对地址对应 `backend/data/rhythm_trainer.db`。线上使用持久化目录的绝对地址，例如 `sqlite:////var/lib/rhythm-trainer/rhythm_trainer.db`。不要随代码发布覆盖数据文件，上线前需落实备份和恢复。

## 数据库迁移

先确认 `DATABASE_URL` 指向正确的数据库，再执行：

```sh
uv run --locked --env-file .env alembic upgrade head
uv run --locked --env-file .env alembic current
```

`upgrade head` 应用尚未执行的迁移；`current` 查看数据库当前版本。启动 FastAPI 不会自动执行迁移。

修改模型后，生成候选迁移：

```sh
uv run --locked --env-file .env alembic revision --autogenerate -m "describe change"
```

审查生成的脚本后再执行 `upgrade head`，可用 `alembic check` 检查模型与数据库结构是否一致。已应用的历史迁移不要改写，应新增迁移；回退可能删除表和数据，操作已有数据的库前必须确认目标并备份。

## 测试

```sh
uv run --locked --no-env-file pytest
```

测试使用临时数据库和模拟短信响应，不读取真实 `.env`、不操作正式数据库、不发送短信。

## 代码导航

- [main.py](main.py)：FastAPI 入口。
- [auth.py](auth.py)：发送验证码与完成登录的业务流程，负责事务边界。
- [auth_routes.py](auth_routes.py)：登录路由、参数、Cookie、来源检查和错误响应。
- [db/](db/)：数据库连接、用户、会话和短信登录请求；函数契约与事务顺序见对应 docstring。
- [migrations/](migrations/)：表结构变更历史；[alembic.ini](alembic.ini) 为迁移工具配置。
- [sms_auth.py](sms_auth.py)：阿里云号码认证服务接入。
- [tests/](tests/)：后端测试。

`data/` 为运行时数据目录，不提交 Git；`uv.lock` 和迁移脚本应提交。

前后端代理和联调步骤见 [联调说明](../联调.md)。
