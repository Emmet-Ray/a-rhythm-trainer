# 后端

## 新版 AI 助手：后端内存会话与流式问答

当前实现 DeepSeek Responses API 的多轮问答与工具循环，会话历史保存在后端内存；前端可携带页面快照，模型可调用工具生成节奏练习。前端已支持候选谱面卡片，并可由用户应用到当前自定义练习草稿。
`api/assistant.py` 处理本站 HTTP/SSE；`assistant/sessions.py` 管理历史并订阅 Agent 消息；
`agent/agent.py` 管理消息状态、运行占用、停止与订阅；`agent/loop.py` 负责模型与工具循环；`assistant/records.py` 定义会话记录，`assistant/context.py` 将历史及其关联快照投影为 Agent 消息；`agent/model.py` 隔离模型服务的请求与事件。
`TextModel` 是模型调用边界，后续提供方通过适配器加入。配置中的提供方目前只接受
`deepseek`，不表示其他 API 或订阅认证已实现。

在本地 `backend/.env` 追加配置，不覆盖已有设置或提交密钥：

```dotenv
AI_PROVIDER=deepseek
AI_MODEL=deepseek-flash
AI_API_KEY=填写自己的密钥
```

从 `backend/` 启动并显式加载配置：

```sh
uv sync --locked
uv run --locked --env-file .env uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

也可以通过终端验证后端。以下请求会调用真实模型并产生费用：

```sh
# 先创建会话，从返回 JSON 中取得 id
curl -X POST http://127.0.0.1:8000/api/assistant/sessions

# 将 SESSION_ID 替换为刚返回的 id；后续输入继续使用同一 id
curl -N http://127.0.0.1:8000/api/assistant/sessions/SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -d '{"text":"请解释四分音符和八分音符的时值关系。"}'
```

接口约定：

| 接口 | 用途 |
| --- | --- |
| `POST /api/assistant/sessions` | 创建会话，返回 201 和 `{id, entries, is_running, last_run_status}` |
| `GET /api/assistant/sessions/{id}` | 获取会话记录（含每次用户输入的快照）与运行状态，不包含正在生成的片段 |
| `POST /api/assistant/sessions/{id}/messages` | 提交 `{text, page_context?}`，后端补齐历史，返回 SSE |

同一会话正在运行时，新提交返回 409 且不追加消息；不同会话可以独立运行。
未知 ID 返回 404。内存存储属于应用生命周期，仅适用于单 worker；重启后旧 ID 失效。
当前未实现持久化、删除、自动过期或订阅者机制。登录会话与这里的聊天会话是两种独立对象。
旧的单次 `/api/assistant/chat` 路由已由会话接口替代。

消息提交规则借鉴 Pi 的状态归属：接受请求时保存 UserEntry（文字和深复制的页面快照），
完整模型消息（包括工具调用）保存为 AssistantEntry，工具结果保存为 ToolResultEntry。模型收到由这些记录构造的独立消息序列。
文字片段只用于显示；完整回答先记入会话，再发送 `message_completed`。
失败或取消保留用户输入、已完成的模型消息和工具结果，不保存部分回答；下一次请求仍能看到这些历史记录。
当前不提供自动重试或原位重试，用户可发送“请继续回答”，不要自动重复提交原请求。
完整回答提交后即使客户端断连，也不会回滚；可通过 GET 获取最终历史。
`last_run_status` 为 null（尚未运行）、running、completed、failed 或 cancelled。
`is_running` 持续到响应清理结束才变为 false，不以文字生成结束作为释放时机。

### 本次页面上下文

在 `/docs` 中向同一会话连续提交，例如第一次：

```json
{
  "text": "当前草稿有几个小节？",
  "page_context": {
    "page": "custom_exercise_editor",
    "description": "自定义练习编辑页",
    "state": {"measure_count": 2}
  }
}
```

第二次将 `measure_count` 改为 3，问题改为“现在呢？”，确认回答使用新快照。
第三次提交 `{"text":"当前草稿有几个小节？","page_context":null}`，模型应说明缺少当前信息，
不能把旧对话的数字当作现状。也可切换为首页快照验证页面变化。

`page` 为非空页面标识（最多 100 字符），`description` 为非空说明（最多 2000 字符），
`state` 为 JSON 对象。整体快照经 JSON 序列化后最多 64 KiB（UTF-8），超限返回 422，
不截断、不添加用户消息。当前 `state` 是只读问答数据，尚无具体编辑器操作契约或写入授权。

每次请求单独提交快照，省略或 null 表示当前未知，不继承旧值。会话保存每次输入对应的
完整快照；构造模型输入时，在每条用户文字之前插入 JSON 数据消息：

```json
{
  "page_context": {
    "scope": "historical",
    "input_index": 1,
    "snapshot": {
      "page": "custom_exercise_editor",
      "description": "自定义练习编辑页",
      "state": {"measure_count": 2}
    }
  }
}
```

只有本次输入对应的 scope 为 `current`，其余是 `historical`。这些标记在请求时生成，
不固化在存储中。所有历史快照当前都会发送，不做压缩或去重；上下文和内存会随会话增长。
本次 `snapshot: null` 时，历史快照仍可用于回顾，但不能作为当前状态。
页面文字不拼入系统指令；固定系统规则说明时间语义，遵循效果仍需真实问答验证。

创建和查询会话响应的 `messages` 已改名为 `entries`（不再返回旧字段）。例如：

```json
{
  "id": "会话ID",
  "entries": [
    {
      "type": "user",
      "text": "有几个小节？",
      "created_at": "2026-10-03T02:00:00+00:00",
      "page_context": {
        "page": "custom_exercise_editor",
        "description": "自定义练习编辑页",
        "state": {"measure_count": 2}
      }
    },
    {"type": "assistant", "text": "2 小节。", "created_at": "2026-10-03T02:00:05+00:00"}
  ],
  "is_running": false,
  "last_run_status": "completed"
}
```

用户记录始终包含 `page_context`（可以为 null）；两种记录都包含 `created_at`。
`created_at` 由后端生成：用户记录为接受输入时，助手记录为完整回答写入时。
查询返回带 UTC 时区的 ISO 8601 字符串，前端可转成本地时间显示；重复查询不重新生成时间。
时间目前只作为会话元数据，不加入模型输入；不代表页面采集时间，也不作为草稿版本或记录排序依据。
页面快照与聊天一起暂存在后端内存，尚未写入磁盘。发送请求格式和 SSE 事件保持不变。

### 流式事件与验证

事件使用 SSE，每个事件为 `data: {JSON}`，以空行分隔：

| type | 字段与含义 |
| --- | --- |
| `text_delta` | `text`：追加显示的文字片段 |
| `message_completed` | `text`：完整回答，应替换临时文字而非再次追加 |
| `run_completed` | 本次运行成功结束 |
| `run_failed` | `message`：固定错误说明；此前部分文字不代表完整回答 |

终端事件前的意外断流不算成功。单次请求最多等待 120 秒，SDK 单次网络等待超时
30 秒，不自动重试；取消或断连关闭上游连接，不保证供应商立即停止计费。
未配置返回 503，非法输入返回 422；开始流式响应后的失败用 `run_failed` 报告。
输入接受非空 `text`（最多 4000 字符）及可选 `page_context`；模型和凭证由后端配置，前端不能指定地址或密钥。

助手不额外要求登录；部署者提供共用的模型凭证。助手接口允许反向代理连接，浏览器 Origin 必须匹配 `AI_ALLOWED_ORIGINS`（逗号分隔的完整地址，不含路径、通配符）。本地开发默认允许 localhost / 127.0.0.1 的 5173、8000、8080 端口；自定义域名或端口需显式配置。无 Origin 的非浏览器请求允许访问，因此来源校验不是身份认证，也不能限制额度消耗。

`GET /api/assistant/status` 只检查配置，返回 `ready`、`unconfigured` 或 `invalid` 及固定提示，不调用模型、不返回凭证。没有 `AI_API_KEY` 时，首页显示独立配置错误提示，隐藏聊天界面和其他页面的助手入口；配置好后重启后端，再点击“重新检查配置”。Key 是否有效在实际调用时判断。

Docker Compose 使用根目录 `.env`，不读取 `backend/.env`：填写 `AI_API_KEY`，按需设置 `AI_PROVIDER`（目前仅 deepseek）、`AI_MODEL`，运行 `docker compose up -d --build`。更新配置后用 `docker compose up -d backend` 重建容器，单纯 `restart` 不会更新容器环境变量。Compose 默认允许 localhost / 127.0.0.1 的 `HTTP_PORT`；域名部署需设置 `AI_ALLOWED_ORIGINS=https://你的域名`。默认只绑定本机；开放给其他访客后，他们共用部署者的模型额度。不要把真实 Key 提交到仓库。

本地直接启动后端则从 `backend/` 执行 `uv run --locked --env-file .env uvicorn main:app --reload --host 127.0.0.1 --port 8000`，显式加载 `backend/.env`；项目不会自动加载该文件。
不应通过反向代理或隧道公开；公开部署前需接入身份与用量控制。后端内置的通用
API 文档可能展示本接口，但不会因未配置模型而影响健康检查及其他接口。

验证使用 `uv run --locked --no-env-file pytest tests/test_assistant*.py`；测试模拟上游 HTTP，
不读取真实密钥、不调用模型。接口依据 [DeepSeek Responses 文档](https://api-docs.deepseek.com/guides/responses_api/)。

Python 3.12+、FastAPI，使用 uv 管理依赖，SQLite 存储数据，SQLAlchemy 访问数据库，Alembic 管理表结构迁移。

已提供健康检查、短信登录、当前用户查询及退出接口，使用服务端会话和 HttpOnly Cookie，并接入前端登录页面。登录接口默认关闭；公开接入前仍需补齐 IP 限流、短信发送预算等反滥用保护。

账号自定义练习支持新建、编辑、删除、分页列表和单题读取，本地练习不会自动导入。保存上限为名称 100 字符、64 个完整 4/4 小节；所有题目接口都要求有效会话，并强制按用户范围执行。具体约定见下方“接口约定”，参数和响应结构以运行后的 `/docs` 为准。

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
| `PUT /api/custom-exercises/{exercise_id}` | 提交 `name`、`exercise`，覆盖原题并返回 200 和完整题目；ID、模式和创建时间不变 |
| `DELETE /api/custom-exercises/{exercise_id}` | 删除当前账号的原题，提交成功后返回 204，无响应体 |

- 不接受客户端指定 `user_id`、`id` 或 `created_at`；POST 新建一道题目，同名不覆盖；PUT 不接受 `mode`，原题不存在时不会重新创建。
- 完整题目包含 `id`、`name`、`mode`、`exercise`、`created_at`；摘要不含 `exercise`，时间为 UTC，不返回归属用户 ID。
- 列表必填 `mode=tapping` 或 `mode=dictation`，默认每页 50 条、最多 100 条，按创建时间和 ID 降序排列。不返回总数，读取不足一页时结束；并发新增时 offset 分页不保证跨请求快照。
- 未登录返回 401，写请求来源不允许返回 403，不存在或不属于当前账号的题目统一返回 404，非法内容返回 422，数据库异常返回 503，不伪装成空列表。
- 写请求响应丢失不代表操作失败，应先查看账号列表，不自动重发或回退本地保存。删除不可恢复；暂不提供本地题目导入接口。

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

### 模块边界

`agent/` 是通用运行能力，不导入 `assistant/`、`domain/` 或 HTTP API。
`assistant/` 是节奏助手应用，组合 Agent、会话、页面上下文和业务工具。
`domain/rhythm.py` 提供所有题目来源共用的节奏规则，不依赖 AI。

```text
agent/
  agent.py       状态、运行控制、订阅
  loop.py        单次模型与工具循环
  messages.py    分角色的消息协议
  events.py      Agent 运行事件
  tools.py       工具契约和执行器
  model.py       模型接口、模型流事件、当前 DeepSeek 适配器
assistant/
  sessions.py    会话管理、订阅记录、聊天输出事件
  records.py     会话记录及序列化
  context.py     页面快照和历史投影
  system_prompt.py
  tools/propose_rhythm_exercise.py  参数、候选结果、工具实现
```

会话记录独立为 `records.py`，供会话管理和上下文投影共同使用，避免投影依赖会话运行实现。
具体工具的专用类型就近定义，通用工具接口留在 `agent/tools.py`，不建立全项目共用的类型杂物文件。

### 工具调用与 AI 生成练习

助手遵循标准顺序：用户输入 → 模型消息（可包含工具调用）→ 执行工具 → 工具结果消息 → 再次请求模型。`ChatSession` 持有统一的 `entries`，通过 Agent 查询运行状态；没有独立的生成练习列表，也不向工具传入会话保存回调。

- `agent/loop.py`：只接收 Agent 消息，在本次上下文中追加模型消息与工具结果，所有事件统一通过同步 `emit(event)` 通知 Agent；不导入会话类型、不修改会话记录。一次运行最多执行 8 次工具调用。未知工具、非法 JSON、参数校验错误会作为工具结果交回模型修正。程序异常终止运行；取消或异常时为未完成的调用补充失败结果，区分结果未确认和未执行，避免后续历史中出现悬空调用。不自动重试工具。
- `agent/agent.py`：持有独立的消息状态，收到完整消息后先更新状态，再发布 `message_end`。管理互斥、120 秒超时、停止和运行状态；`run(model, messages=...)` 可替换历史投影，不会重新发布旧消息。`_process_event` 是唯一事件入口：先更新状态，再通知订阅者。显示流作为订阅者，通过队列取出文字与运行完成事件；不会再次广播。loop 在独立任务中运行，第一次消费显示流才启动。`stop()` 取消 loop 任务；关闭显示流会取消并等待该任务清理，调用方需等待上下文退出。当前订阅者同步执行，适用于内存记录；未来异步落盘需明确等待与失败策略。
- `agent/messages.py`：分别定义系统、用户、模型、工具结果消息，各角色只携带自己的字段。`ProviderMetadata` 保留适配器私有数据，只有匹配提供方的适配器解释它。工具详情随消息保留，适配器只发送模型所需内容。
- `agent/events.py`：定义文字增量、完整消息、整次运行完成事件。`agent/model.py` 的 `ModelEvent` 只描述单次模型调用；会话层将 Agent 运行事件转换为现有聊天事件，二者不再混用。
- `assistant/sessions.py`：投影历史和当前输入，成功取得 Agent 占用后保存用户记录；订阅 `message_end`，把新模型消息和工具结果包装为会话记录并添加记录时间。用户输入已保存，历史投影也不重发事件，因此不会重复记录。
- `agent/tools.py`：`AgentTool` 定义名称、说明、参数模型及异步函数；`ToolExecutor` 负责查找和参数校验。工具只返回 `ToolResult(content, details, is_error)`。
- `assistant/tools/propose_rhythm_exercise.py`：创建并返回生成练习，不修改草稿、不写题库。完整练习在结果的 `details.generated_exercise` 中；ID 和标题在模型可读的 `content` 中，完整候选内容已在 assistant 工具调用参数中。
- `assistant/records.py`：会话记录及对外快照，包含记录时间；提供方元数据不暴露给界面。
- `assistant/context.py`：校验页面快照，`build_agent_messages` 将记录投影为 Agent 消息；页面编码及其解释规则放在一起。最近用户快照在工具循环内仍标记为 current。
- `assistant/system_prompt.py`：节奏助手身份和行为；具体练习格式在工具参数的 schema 描述中。
- `agent/model.py`：向 DeepSeek Responses 传入工具声明，将调用和结果转换为 `function_call` / `function_call_output`；保留工具调用轮次的原始 response items 以重放 reasoning。只在完整响应后执行工具，不执行流式参数片段。参考 [DeepSeek Responses 文档](https://api-docs.deepseek.com/guides/responses_api/)。

会话查询返回的 `entries` 现在包含 `user`、`assistant`、`tool_result`。工具结果包含调用 ID、工具名称、正文、结构化详情、错误标记和记录时间；普通文字消息格式不变。HTTP SSE 仍发送 `text_delta`、最终的 `message_completed` 和 `run_completed`，工具调用轮次不会提前结束 HTTP 流。前端将成功的练习工具结果显示为谱面卡片，在自定义练习编辑页支持用户点击应用覆盖草稿；不自动保存。卡片支持可调速的整首试听（默认 60 BPM），支持直接进入击拍训练，同时支持听写训练。

`assistant/tools/propose_rhythm_exercise.py` 中 `ExerciseProposal` 接收 `title`（去除首尾空白后 1–100 字符）、`description`（1–1000 字符）、`exercise`，拒绝额外字段。节奏复用 `domain.rhythm.parse_rhythm_exercise`：4/4、1–64 小节、每小节恰好四拍及现有音符规则。校验保证结构和时值合法，不评判教学效果。`GeneratedExercise(candidate)` 在校验成功后生成 ID、UTC 时间，`snapshot()` 返回独立副本。

接口与循环测试使用模拟模型及 HTTP transport，不产生 API 费用；真实模型的生成效果还需本机试用。图片输入、数据库持久化、并行工具和执行 hooks 尚未实现。

生成工具支持 `mode: tapping | dictation`（默认 tapping）；听写题前端隐藏谱面，模型须避免在标题、说明和回复中提前泄露答案。该字段属于节奏助手业务协议，通用 Agent 循环不参与展示策略。
