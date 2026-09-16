# 后端

Python 3.12+、FastAPI，使用 uv 管理依赖，SQLite 存储数据，SQLAlchemy 访问数据库，Alembic 管理表结构迁移。

已提供健康检查、短信登录、当前用户查询及退出接口，使用服务端会话和 HttpOnly Cookie，并接入前端登录页面。登录接口默认关闭；公开接入前仍需补齐 IP 限流、短信发送预算等反滥用保护。

账号自定义练习支持保存、分页列表和单题读取，本地练习不会自动导入。保存上限为名称 100 字符、64 个完整 4/4 小节；三个接口都要求有效会话，并强制按用户范围执行。具体约定见下方“接口约定”，参数和响应结构以运行后的 `/docs` 为准。

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

`AUTH_ENABLED=false` 时，`GET /api/auth/me` 返回 200 和 `{"auth_enabled":false}`，前端允许本地自定义练习，账号设置显示功能未开启且不提供登录表单。账号写入及账号题目接口仍不可用，不绕过鉴权。开启后 `/me` 保持已登录返回 `{"id":用户ID}`、未登录返回 401；服务异常仍返回错误，不能当作功能关闭或游客。身份查询响应不缓存。

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

### 本地开启账号功能

在 `backend/.env` 中补充以下配置，并填写上表中的数据库及短信配置，不覆盖已有密钥：

```dotenv
AUTH_ENABLED=true
AUTH_COOKIE_SECURE=false
AUTH_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Origin 是浏览器页面的协议、主机和端口，不是代理目标。Vite 更换端口后需同步更新并重启后端；通过 `/docs` 测试登录时也需加入它的实际来源。线上使用 HTTPS，保留 `AUTH_COOKIE_SECURE=true`，移除本地来源。

先应用迁移，再显式加载配置启动（从 `backend/` 执行）：

```sh
uv run --locked --env-file .env alembic upgrade head
uv run --locked --env-file .env uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

启动不会发送短信；**手动发送验证码会调用真实短信服务并可能产生费用**，仅使用自己的手机号，不自动重试。Docker 使用根目录 `.env`，不读取 `backend/.env`；迁移命令为在仓库根目录执行 `docker compose run --rm --no-deps backend alembic upgrade head`。

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

## 接口约定

### 登录与会话

| 接口 | 用途 |
| --- | --- |
| `POST /api/auth/sms-code` | 提交 `phone_number`，返回 `request_id`，仅表示接受发送请求 |
| `POST /api/auth/login` | 提交 `request_id` 与 `code`，返回用户 ID，并通过 Set-Cookie 设置会话 |
| `GET /api/auth/me` | 查询身份；账号关闭、游客和已登录的区别见“本地运行” |
| `POST /api/auth/logout` | 撤销会话并清除 Cookie，返回 204，无响应体 |

前端使用同源 `/api/...` 请求，JSON 请求设置 `Content-Type: application/json`，不读取或另存会话 token。命令行调用 POST 时需提供允许的 Origin，并自行管理 Cookie。

登录错误：400 表示验证码错误或请求不可用，401 表示未登录或会话失效，403 表示来源不允许，422 表示参数非法，429 表示发送受限，503 表示服务不可用。账号关闭时，仅 `/me` 返回明确的关闭状态，其他账号接口仍不可用。网络错误或 503 不能解释为游客，退出失败也不能当作退出成功。登录及账号题目响应均设置 `Cache-Control: no-store`。

### 账号自定义练习

| 接口 | 用途 |
| --- | --- |
| `POST /api/custom-exercises` | 提交 `name`、`mode`、`exercise`，事务提交后返回 201 和完整题目 |
| `GET /api/custom-exercises?mode=tapping&limit=50&offset=0` | 返回 `{items, limit, offset}`，items 仅含摘要 |
| `GET /api/custom-exercises/{exercise_id}` | 返回当前账号的一道完整题目 |

- 不接受客户端指定 `user_id`、`id` 或 `created_at`；每次保存新建一道题目，同名不覆盖。
- 完整题目包含 `id`、`name`、`mode`、`exercise`、`created_at`；摘要不含 `exercise`，时间为 UTC，不返回归属用户 ID。
- 列表必填 `mode=tapping` 或 `mode=dictation`，默认每页 50 条、最多 100 条，按创建时间和 ID 降序排列。不返回总数，读取不足一页时结束；并发新增时 offset 分页不保证跨请求快照。
- 未登录返回 401，POST 来源不允许返回 403，不存在或不属于当前账号的题目统一返回 404，非法内容返回 422，数据库异常返回 503，不伪装成空列表。
- 保存响应丢失不代表保存失败，应先查看账号列表，不自动重发或回退本地保存。暂不提供编辑、删除或本地题目导入接口。

接口实现见 [api/auth.py](api/auth.py)、[api/custom_exercises.py](api/custom_exercises.py)，节奏内容校验见 [domain/rhythm.py](domain/rhythm.py)。

## 测试

```sh
uv run --locked --no-env-file pytest
```

测试使用临时数据库和模拟短信响应，不读取真实 `.env`、不操作正式数据库、不发送短信。

## 代码导航

```text
backend/
├── main.py                    # 应用装配、资源生命周期与路由注册
├── settings.py                # HTTP 环境配置与校验
├── api/                       # HTTP 层
│   ├── auth.py                # 登录接口与 Cookie
│   ├── custom_exercises.py    # 自定义练习接口
│   ├── dependencies.py        # 当前用户、数据库等公共依赖
│   └── http_policy.py         # 来源检查、安全错误响应与缓存规则
├── domain/                    # 业务流程与规则，不依赖 HTTP
│   ├── auth.py                # 登录流程与事务编排
│   └── rhythm.py              # 节奏解析与校验
├── integrations/
│   └── sms.py                 # 阿里云短信接入与供应商配置
├── db/                        # 表定义与存取，由调用方提交事务
│   ├── database.py            # 数据库引擎与连接配置
│   ├── users.py               # 用户
│   ├── sessions.py            # 登录会话
│   ├── sms_logins.py          # 短信请求状态与限制
│   └── custom_exercises.py    # 账号自定义练习
├── migrations/                # 数据库表结构迁移
├── alembic.ini                # 迁移工具配置
├── tests/                     # 接口、业务规则、外部服务与持久化测试
├── data/                      # 运行时数据，不提交 Git
├── pyproject.toml             # 项目依赖与测试配置
└── uv.lock                    # 锁定依赖版本
```

登录调用链为 `api/auth.py → domain/auth.py → db/、integrations/sms.py`；练习存取为 `api/custom_exercises.py → db/custom_exercises.py → domain/rhythm.py`。业务简单时不强制增加转发层。

`data/` 为运行时数据目录，不提交 Git；`uv.lock` 和迁移脚本应提交。

前端启动、代理检查与页面验收见 [前端说明](../frontend/README.md#本地开发与联调)。
