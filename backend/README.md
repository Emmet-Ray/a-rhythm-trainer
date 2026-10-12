# 后端运行与维护

后端面向本地单人实例，题库和练习记录使用 SQLite，助手会话使用 JSONL。模块与业务规则见 [架构说明](../docs/ARCHITECTURE.md)。

## 本地运行

从仓库根目录执行：

```sh
cd backend
uv sync --locked
uv run --locked uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Python 版本与依赖以 [pyproject.toml](pyproject.toml)、`uv.lock` 为准。
启动自动创建或升级数据库，不要求模型配置。需要环境文件时显式使用 `uv run --locked --env-file .env ...`。
模型连接通过「设置 → 模型服务」管理，更新即时生效；助手内选择本次会话使用的模型。
ChatGPT 订阅授权要求从本机 HTTP loopback 来源打开网站，授权回调由前端代理转发到后端。

| 环境变量 | 默认值与用途 |
| --- | --- |
| `DATABASE_URL` | `sqlite:///./data/rhythm_trainer.db`；相对启动目录的 SQLite 文件 |
| `AI_SESSIONS_DIR` | `data/assistant-sessions`；助手会话目录 |
| `AI_CONNECTIONS_FILE` | 会话目录的父目录下 `model-connections.json`；模型连接与凭证 |
| `ALLOWED_ORIGINS` | 浏览器来源白名单，完整地址以逗号分隔；默认 localhost/127.0.0.1 的 5173、8000、8080 端口 |

非空 `ALLOWED_ORIGINS` 优先于兼容配置 `AI_ALLOWED_ORIGINS`，详见 [settings.py](settings.py)。
只启动一个 worker；会话目录的排他锁会拒绝第二个后端进程。

## 数据与备份

Docker 将数据库、会话和连接配置保存在 `backend-data` 卷的 `/var/lib/rhythm-trainer`；预设题库由独立 `content/` 目录提供。

备份时停止后端，复制 SQLite、会话目录和连接配置；自定义数据路径须分别备份。连接文件包含凭证，会话可能包含图片、工具结果和页面快照。
恢复时放回相同配置路径，再启动兼容版本。更新容器应保留数据卷；`docker compose down -v` 会删除该卷。
浏览器外观与精度偏好、未保存草稿不包含在后端备份中。

数据库升级前会为已有版本创建同目录 `数据库文件名.before-版本号.bak`，不覆盖已有备份，实现见 [db/initialize.py](db/initialize.py)。
历史迁移保留；旧账号清理等迁移无法完整降级恢复，回退需使用对应备份。升级后刷新前端，避免旧页面继续使用旧保存协议。

会话按检查点追加，不逐 token 写盘。未写完的尾行会截断，完整记录损坏则保留文件并报错；恢复未结束轮次时标记中断，不自动请求模型。
升级模型 SDK 后应验证旧会话兼容性。

## 接口与联调

运行后可访问 `/docs` 和 `/openapi.json`；路径、请求字段及参数约束以路由源码和生成的 API 说明为准。

| 接口族 | 源码入口 |
| --- | --- |
| 健康检查 | [main.py](main.py)；`/api/health` 只表示 API 可响应 |
| 自定义题库 | [api/custom_exercises.py](api/custom_exercises.py) |
| 练习记录与本地数据管理 | [api/local_data.py](api/local_data.py) |
| 助手会话、消息与模型选择 | [api/assistant.py](api/assistant.py) |
| 模型连接与授权回调 | [api/model_connections.py](api/model_connections.py) |

题库与记录写请求要求有效 Origin；助手允许无 Origin 的非浏览器请求，浏览器来源必须匹配白名单。
来源校验不是身份认证。本项目没有用户登录或用量隔离，开放访问会共用实例数据和模型额度。
数据接口的错误与缓存策略见 [api/http_policy.py](api/http_policy.py)。

记录首次创建重试会归并同题档案，尝试使用稳定 ID；已删除档案或尝试的更新返回 404，不自动重新创建。
迟到的首次创建可能在清空后建立档案；极端超时下不严格检测同一尝试的新旧更新顺序。题目创建响应丢失时先检查题库，避免重复新建。

## 助手会话契约

前端提交新输入与本次快照，后端持有正式历史；同一会话运行期间的新消息或删除请求返回 409。
运行中的回答持有启动时的模型，模型选择变化用于后续请求。
模型和凭证由连接模块准备，生成工具只返回练习，不直接修改编辑器或题库。

流由 Pydantic AI 的 Vercel adapter 编码，前端用 AI SDK 接收；不维护另一套 SSE 编码或解析器。
应用通过 transient 数据事件确认持久化：`data-turn-accepted` 在用户输入落盘后发出，`data-turn-completed` 在最终检查点完成并释放运行占用后发出。
正常完成依靠确认收尾；缺少确认、停止或异常断流时查询正式会话，避免自动重发产生重复输入。
失败或取消保留已完成步骤和工具结果，丢弃未完成模型消息。供应商推理内容保留在模型历史，UI 不展示。

本次 `page_context` 省略或为 null 表示当前未知，不继承历史快照；模型输入区分 current 与 historical。
快照是只读信息，不授权工具修改页面。听写的生成工具历史可能含标准答案，因此快照裁剪之外仍需模型遵守保密规则。

图片随消息持久化；类型、数量、大小及像素限制见 [assistant/messages.py](assistant/messages.py) 和 `ChatInput`。
模型图片能力取自供应商目录，明确不支持时禁止含图请求；缺失能力信息时允许尝试，目录实现见 [assistant/connections.py](assistant/connections.py)。
运行超时、调用次数和错误处理以 [assistant/sessions.py](assistant/sessions.py)、[assistant/model.py](assistant/model.py) 为准。

## 开发与测试

在 `backend/` 执行 `uv run --locked --no-env-file pytest`。
测试使用临时数据库、会话目录和模拟上游，不读取日常数据或调用真实模型。浏览器联调见 [前端说明](../frontend/README.md#浏览器回归)。
表结构修改新增 Alembic 迁移并验证升级；模型或协议变化验证中断恢复与历史兼容。真实模型效果需要单独试用。
