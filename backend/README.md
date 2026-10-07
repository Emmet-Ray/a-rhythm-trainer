# 后端

## 新版 AI 助手：JSONL 会话持久化与流式问答

当前支持 DeepSeek API Key 和 ChatGPT 订阅授权，多轮问答与工具循环由 Pydantic AI 负责，`VercelAIAdapter` 输出 AI SDK UI 消息流

- `api/assistant.py` 负责 HTTP 边界，`assistant/sessions.py` 持有会话历史与运行状态
- `assistant/connections.py` 管理凭证持久化、模型目录缓存和请求客户端生命周期
- `assistant/providers/` 收纳对等的服务接入模块，统一提供模型目录读取与模型创建
- `assistant/providers/deepseek.py` 负责 DeepSeek API；`assistant/providers/chatgpt.py` 负责 ChatGPT 订阅授权与协议适配
- 接入模块不直接读写配置文件，也不持有会话历史
- `assistant/model.py` 定义模型选择与错误契约，检查流完整性并处理跨服务历史
- `assistant/context.py` 集中维护助手指令，并校验、投影页面与练习活动上下文

启动后在「设置 → 模型服务」配置连接，在助手输入框中选择模型，无需模型环境变量
凭证默认保存在 `backend/data/model-connections.json`，会话历史按会话保存在 JSONL 文件中
连接配置的文件锁仅用于本地读写，远端目录请求与令牌刷新使用独立服务锁
会话选择是每次请求的依据，最近选择仅作为新对话默认值

一次请求由 API 层协调：读取会话选择 → 连接模块准备凭证 → 对应接入模块创建模型 → 会话运行回答和工具循环 → 连接模块释放客户端
新增服务时，在 `providers/` 实现目录与模型创建并登记服务名称，再按认证方式补充连接配置入口；会话和工具逻辑继续使用 Pydantic AI 模型接口

从 `backend/` 启动：

```sh
uv sync --locked
uv run --locked uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

也可以通过终端验证后端。以下请求会调用真实模型并产生费用：

```sh
# 先在界面配置连接并选择模型，再创建会话，从返回 JSON 中取得 id
curl -X POST http://127.0.0.1:8000/api/assistant/sessions

# 将 SESSION_ID 替换为刚返回的 id；后续输入继续使用同一 id
curl -N http://127.0.0.1:8000/api/assistant/sessions/SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -d '{"message_id":"question-1","text":"请解释四分音符和八分音符的时值关系。"}'
```

接口约定：

| 接口 | 用途 |
| --- | --- |
| `POST /api/assistant/sessions` | 创建会话，返回 201 和 `{id, messages, is_running, last_run_status}` |
| `GET /api/assistant/sessions` | 分页查询本地历史对话 |
| `PUT /api/assistant/sessions/{id}/model` | 保存后续消息使用的模型；`selection_notice` 非空表示会话已切换，但默认值保存失败 |
| `DELETE /api/assistant/sessions/{id}` | 删除对话；正在生成时返回 409 |
| `PUT /api/assistant/sessions/{id}/cards/{exercise_id}` | 保存卡片 BPM 与已查看答案状态；已查看不可撤回 |
| `GET /api/assistant/sessions/{id}` | 获取会话记录（含每次用户输入的快照）与运行状态，不包含正在生成的片段 |
| `POST /api/assistant/sessions/{id}/messages` | 提交 `{message_id, text, page_context?}`，后端补齐历史，返回 SSE |

同一会话正在运行时，新提交返回 409 且不追加消息；不同会话可以独立运行。
未知 ID 返回 404。所有对话归当前本地实例所有，清除 Cookie 或更换浏览器仍可从历史列表恢复。
支持历史列表、恢复和删除；尚无自动过期机制。

会话文件默认位于 `backend/data/assistant-sessions/<owner>/<session-id>.jsonl`（从 backend 启动），可通过 `AI_SESSIONS_DIR` 指定。Docker Compose 已接入现有持久卷。只支持单 worker，同一目录的第二个进程会拒绝启动。备份整个目录即可；文件包含对话、模型工具记录和提交的页面／练习活动上下文，应按私人数据保管。

每个文件首行为版本与归属信息，随后追加用户输入、轮次检查点和卡片状态；不逐 token 写盘。恢复时将未结束轮次标记为中断，不自动请求模型。未写完的尾行会截断，完整记录损坏则保留文件并报错。SDK 原生历史也会保存，升级 SDK 时需验证旧文件兼容性。
旧的单次 `/api/assistant/chat` 路由已由会话接口替代。

每次提交携带新的 `message_id`，重复 ID 返回 409。前端只提交新问题和快照，不上传聊天历史；
后端按轮次保留用户输入及 Pydantic AI 原生模型消息。失败或取消保留已完成步骤和工具结果，
丢弃未完成的模型消息。模型历史包含工具调用所需的推理信息，界面不返回推理内容。
不自动重发 HTTP 请求；工具参数校验失败允许模型修正（最多 2 次），整轮最多 9 次模型请求、8 次工具调用。
完整结果保存后即使客户端断连，也不会回滚；可通过 GET 查询最终历史。
`last_run_status` 为 null（尚未运行）、running、completed、failed 或 cancelled。
`is_running` 持续到响应清理结束才变为 false，不以文字生成结束作为释放时机。

### 本次页面上下文

在 `/docs` 中向同一会话连续提交，例如第一次：

```json
{
  "message_id": "question-1",
  "text": "当前草稿有几个小节？",
  "page_context": {
    "page": "custom_exercise_editor",
    "description": "自定义练习编辑页",
    "state": {"measure_count": 2}
  }
}
```

后续提交使用新的 `message_id`。第二次将 `measure_count` 改为 3，问题改为“现在呢？”，确认回答使用新快照。
第三次提交 `{"message_id":"question-3","text":"当前草稿有几个小节？","page_context":null}`，模型应说明缺少当前信息，
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

### 会话与流协议

创建、查询返回 `{id, messages, is_running, last_run_status}`。`messages` 使用 AI SDK `UIMessage`：

- 用户消息：稳定 `id`、`role: user`、文字 `parts`；`metadata` 保存接受时间 `created_at` 和 `page_context`。
- 助手消息：每轮一个稳定 `id`，按顺序包含 `step-start`、`text` 和 `tool-propose_rhythm_exercise` parts。
- 工具成功结果位于 `part.output.generated_exercise`，通过 `toolCallId` 标识。一个回复可以包含多个工具与文字步骤。

GET 和实时流使用相同消息 ID 与工具调用 ID，前端同步后能保留卡片的小节、速度等操作状态。
时间由后端在接受本轮时生成，查询不会重新生成；只作为界面元数据，不作为模型输入或记录排序依据。
页面快照与会话一同持久化。查询还返回标题、创建／更新时间和 `card_states`。

流使用 [AI SDK UI Message Stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)，
由 Pydantic AI 的 Vercel UI adapter 编码，响应带 `x-vercel-ai-ui-message-stream: v1`。
文字通过 `text-start` / `text-delta` / `text-end` 传输，工具结果通过 `tool-output-available` 提供，
整轮以 `finish` 和 `[DONE]` 结束，流内错误使用 `error`。不再维护自定义 SSE 事件或前端解析器。

上游必须确认完整响应才可执行工具；异常断流不能作为成功。单轮最多 120 秒，单次网络等待 30 秒，
OpenAI 客户端关闭自动重试。取消或断连会关闭上游连接，不保证供应商立即停止计费。
未配置返回 503，非法输入返回 422；流开始后的异常只返回固定说明，不输出供应商响应和凭证。
输入接受非空 `text`（最多 4000 字符）、`message_id`（最多 100 字符）及可选 `page_context`；
模型和凭证由后端配置，前端不能指定地址、密钥或替换服务端历史。

助手不额外要求登录；部署者提供共用的模型凭证。助手接口允许反向代理连接，浏览器 Origin 必须匹配 `ALLOWED_ORIGINS`（逗号分隔的完整地址，不含路径、通配符）。本地开发默认允许 localhost / 127.0.0.1 的 5173、8000、8080 端口；自定义域名或端口需显式配置。无 Origin 的非浏览器请求允许访问，因此来源校验不是身份认证，也不能限制额度消耗。

`GET /api/assistant/status` 只读取已保存的连接状态，返回 `ready`、`unconfigured` 或 `invalid` 及提示，不调用模型、不返回凭证
在设置页配置或更新连接后即时生效，不需要重启后端

Docker Compose 的根目录 `.env` 只用于端口、绑定地址和允许来源等部署配置
模型连接通过设置页管理，默认保存在 `backend-data` 卷的 `/var/lib/rhythm-trainer/model-connections.json`
本机与 Docker 默认使用各自的数据目录，重建容器保留数据卷即可保留连接
Compose 默认允许 localhost / 127.0.0.1 的 `HTTP_PORT`，域名部署需设置 `ALLOWED_ORIGINS=https://你的域名`
默认只绑定本机，开放给其他访客后会共用部署者的模型额度


本地使用额外部署环境变量时，可在启动命令中加上 `--env-file .env` 显式加载 `backend/.env`，项目不会自动加载该文件，模型连接仍由设置页管理
不应通过反向代理或隧道公开；公开部署前需接入身份与用量控制。后端内置的通用
API 文档可能展示本接口，但不会因未配置模型而影响健康检查及其他接口。

验证使用 `uv run --locked --no-env-file pytest tests/test_assistant*.py tests/test_model_connections.py`；测试模拟上游 HTTP，
不读取真实密钥、不调用模型。接口依据 [DeepSeek Responses 文档](https://api-docs.deepseek.com/guides/responses_api/)。

Python 3.12+、FastAPI，使用 uv 管理依赖，SQLite 存储数据，SQLAlchemy 访问数据库，Alembic 管理表结构迁移。

本项目面向本地单人使用，不提供注册、登录、验证码或账号会话接口。题库和练习记录属于当前实例，模型凭证仅配置在后端。

## 本地运行

```sh
cd backend
uv sync --locked
uv run --locked uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

启动时自动创建或升级 SQLite 数据库，不要求模型配置。使用 `.env` 时显式传入 `--env-file .env`，不会自动读取文件。

| 环境变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 默认 `sqlite:///./data/rhythm_trainer.db`，相对 backend 工作目录 |
| `AI_SESSIONS_DIR` | 默认 `data/assistant-sessions`，持久化 JSONL 会话目录 |
| `ALLOWED_ORIGINS` | 浏览器来源白名单，逗号分隔；默认 localhost/127.0.0.1 的 5173、8000、8080 端口 |

兼容原 `AI_ALLOWED_ORIGINS` 配置，优先使用非空 `ALLOWED_ORIGINS`。旧 `AUTH_*`、短信供应商配置已不再使用，可以从本机环境文件中删除。API 仅用于本机单人实例，Origin 校验不是身份认证。

## 数据与备份

题库和练习记录保存在 SQLite，助手对话保存在 `AI_SESSIONS_DIR`。启动时自动升级数据库，升级前生成同目录的 `数据库文件名.before-原版本号.bak`，不覆盖已有备份。保留历史迁移文件；0007 删除旧账号表和临时导入日志，不影响实例题库、记录及会话。该清理不可通过 Alembic 降级恢复旧数据，需要回退时须恢复升级前的完整数据库备份。

外观、击拍精度仍保存在浏览器；未保存的草稿和待重试行为仅在当前页面会话中保留，刷新前先保存或重试。

备份或换电脑时，停止后端后复制完整数据目录，包括 SQLite 文件、备份文件、assistant-sessions ；恢复到相同配置路径再启动。Docker 的对应目录为 `backend-data` 卷挂载的 `/var/lib/rhythm-trainer`，更新容器保留该卷，不执行删除卷的 `down -v`。本次未新增通用文件导入导出界面。

## 接口约定

| 接口 | 用途 |
| --- | --- |
| `GET /api/health` | 服务健康状态 |
| `POST /api/custom-exercises` | 创建实例题目，提交 name/mode/exercise |
| `GET /api/custom-exercises?mode=tapping&limit=50&offset=0` | 分页题目摘要 |
| `GET/PUT/DELETE /api/custom-exercises/{id}` | 读取、修改、删除题目 |
| `GET/POST/DELETE /api/local-data/records` | 分页查询、首次保存和清空练习记录 |
| `GET/DELETE /api/local-data/exercises` | 题库统计和清空 |

题目名称最多 100 字符，1–64 个完整 4/4 小节。创建不接受 user_id、id、created_at，更新保持原 ID、模式和创建时间。

核心业务表只有 `custom_exercises`、`practice_records`、`practice_attempts`。档案保留题目快照，尝试按行保存；没有整份记录文档、去重日志、内容指纹列、保存版本或删除代数。

记录接口：
- `GET /api/local-data/records`：mode、page、page_size、after、before、zone 筛选分页及统计，不返回尝试详情
- `GET /api/local-data/records/summary`：题目记录和尝试总数
- `GET /api/local-data/records/{id}`：按 page/page_size 读取该题的尝试明细
- `POST /api/local-data/records/lookup`、`/progress`：按来源、题目 ID、模式和规范化谱面查询当前题历史/目录完成状态
- `POST /api/local-data/records`：首次保存档案与尝试，同谱面在写事务中归并
- `POST /api/local-data/records/{id}/attempts`：创建新尝试，固定 ID 的重复创建不覆盖已有结果
- `PUT /api/local-data/records/{id}/attempts/{attempt_id}`：更新已有尝试的完整累计值，不自动新建
- `DELETE /api/local-data/records/{id}`、`DELETE /api/local-data/records`：删除档案并级联删除尝试

同一次访问串行保存自己的尝试，重复请求不累加次数。不同访问通过独立尝试 ID 避免互相覆盖。已删除档案/尝试的更新返回 404，前端提示重新进入练习，不自动重新建档。接受的简化边界：迟到的首次创建请求可能在清空后建立档案；极端超时下不严格检测同一尝试的新旧更新顺序。

0009 在事务中保留原档案/尝试 ID、谱面与成绩，逐项核对后移除旧文档表。升级前自动备份；升级后刷新前端页面，避免旧保存协议继续请求。

题库与记录写请求要求有效 Origin，缺失或来源不允许返回 403。非法内容返回 422，数据库错误返回 503，响应设置 no-store。POST 创建题目响应丢失后先检查题库，避免手动重复新建。

## 开发与测试

```sh
uv run --locked --no-env-file pytest
```

测试使用临时数据库、会话目录和模型模拟，不操作真实数据或调用真实模型。表结构修改通过新增 Alembic 迁移完成，保留已应用的历史迁移。0007 后数据库只保留实例业务表及数据库版本信息。

主要模块：`api/custom_exercises.py` 和 `api/local_data.py` 管理接口；`db/` 管理实例表；`domain/rhythm.py` 与 `domain/practice_records.py` 校验数据；`db/initialize.py` 负责启动升级和备份。

### 模块边界与工具调用

```text
assistant/
  sessions.py    会话运行互斥、结果保留与持久化协调
  messages.py    对话轮次、图片内容校验及模型/UI 消息转换
  model.py       公共模型约定、流完整性检查、历史兼容与错误说明
  connections.py 凭证保存、刷新协调、目录缓存与客户端生命周期
  providers/     DeepSeek 与 ChatGPT 的服务接入实现
  context.py     助手指令、页面快照校验与练习活动上下文投影
  tools/propose_rhythm_exercise.py  参数校验、生成练习、Pydantic AI 工具声明
```

通用模型/工具循环使用 Pydantic AI，不再保留自建 `agent/`。
业务工具复用 `domain/rhythm.py` 校验节奏，只返回生成练习，不修改草稿、不保存到题库。
参数错误以 `ModelRetry` 交给模型修正，程序异常终止运行。历史使用 SDK 原生消息；
`ChatSession` 只管理服务端归属和业务生命周期，不维护第二套 Agent 状态机。
`assistant/context.py` 在原生用户消息中插入快照数据，系统规则与页面内容分开。

前端收到成功工具结果便显示练习卡片，后续模型建议继续输出。
卡片可调速试听、进入击拍/听写训练，在编辑页可由用户放入草稿；这些按钮不调用模型。
供应商 reasoning 保留在模型历史用于后续工具轮次，UI 消息和流中不输出。
兼容性测试使用模拟 Responses HTTP，覆盖 reasoning 回传、工具调用、提前断流、错误脱敏和取消。

`assistant/tools/propose_rhythm_exercise.py` 中 `ExerciseProposal` 接收 `title`（去除首尾空白后 1–100 字符）、`description`（1–1000 字符）、`exercise`，拒绝额外字段。节奏复用 `domain.rhythm.parse_rhythm_exercise`：4/4、1–64 小节、每小节恰好四拍及现有音符规则。校验保证结构和时值合法，不评判教学效果。`GeneratedExercise(candidate)` 在校验成功后生成 ID、UTC 时间，`snapshot()` 返回独立副本。

接口与循环测试使用模拟模型及 HTTP transport，不产生 API 费用；真实模型的生成效果还需本机试用。对话历史的数据库存储、并行工具和执行 hooks 尚未实现，对话历史目前保存在本地 JSONL 文件中。

生成工具支持 `mode: tapping | dictation`（默认 tapping）；听写题前端隐藏谱面，模型须避免在标题、说明和回复中提前泄露答案。该字段属于节奏助手业务协议，通用 Agent 循环不参与展示策略。

助手的 `page_context.state.practice` 由前端练习工作区提供，包含当前或刚才练习的身份、本次多轮结果及自动读取的同题历史。历史从本地后端按题查询，助手只引用已加载的最近尝试摘要。模型默认综合本次、关注最新、参考历史；针对性出题沿用 `propose_rhythm_exercise`。新击拍有位置与早晚明细，旧记录标记为仅汇总；中断、不同速度或判定标准需要区分。听写未公开时，当前快照不发送标准答案，回复仍需遵守听写保密规则（生成工具的历史参数可能已含题目，不能只依赖快照裁剪）。

`page_context.state.practice_activity` 随用户消息附带期间更新的尝试摘要；`practice_focus` 指向最近产生结果的题目，优先于底层页面对象用于默认分析和后续出题。活动记录按尝试 ID 更新，不应将听写多次验证或击拍迟到输入修正解释成新轮次。批次编号保存在原有用户快照中，前端通过会话同步确认接收；没有新增模型可调用的浏览器工具。未收到某题成绩不能据此断言未练习、未保存或需要先应用。

图片随用户消息通过 `images: [{data, media_type}]` 提交，`data` 为 Base64，允许纯图片消息
每条消息最多 3 张，每张不超过 2 MiB、1600 万像素，支持 PNG、JPEG 和静态 WebP
图片经过内容校验后内联保存在该轮 JSONL 中，后续检查点不重复保存用户图片，旧日志缺少 `images` 时按空列表恢复
界面使用 AI SDK 的 `file` 消息部分展示，模型请求使用 Pydantic AI `BinaryContent`
模型目录的 `supports_images` 来自当前实测能力集合，新增模型需要验证后更新，含图历史不允许切换到未确认支持图片的模型

模型输出预算沿用供应商默认行为，会话层不统一设置 `max_tokens`；运行超时和调用次数限制独立保留。供应商报告输出达到上限时会返回明确提示，不执行未完成的工具调用，也不自动重试。
