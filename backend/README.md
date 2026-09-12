# 后端

Python 3.12+、FastAPI，使用 uv 管理依赖，SQLite 存储数据，SQLAlchemy 访问数据库，Alembic 管理表结构迁移。

当前对外只有健康检查；已实现短信验证码、用户存取、服务端会话，以及短信登录请求的手机号冷却、核验次数限制和一次性消费。尚未接通登录流程、Cookie 或前端；公开接入前仍需补齐 IP 限流、发送预算和请求来源等保护。

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

当前启动服务和访问健康检查不需要数据库配置或短信密钥，也不会自动建表、发送短信。

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

项目不会自动加载 `.env`。使用文件配置时，在命令中显式指定 `uv run --locked --env-file .env …`。数据库命令只需要 `DATABASE_URL`，不需要短信密钥。

密钥仅保留在后端，使用具有必要权限的 RAM 凭证；不写入前端、日志或 Git。短信发送会产生费用，结果不明时不要立即重复发送。

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
- [db/](db/)：数据库连接、用户、会话和短信登录请求；函数契约与事务顺序见对应 docstring。
- [migrations/](migrations/)：表结构变更历史；[alembic.ini](alembic.ini) 为迁移工具配置。
- [sms_auth.py](sms_auth.py)：阿里云号码认证服务接入。
- [tests/](tests/)：后端测试。

`data/` 为运行时数据目录，不提交 Git；`uv.lock` 和迁移脚本应提交。

前后端代理和联调步骤见 [联调说明](../联调.md)。
