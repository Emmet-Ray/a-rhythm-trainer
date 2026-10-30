# 前端开发与部署

本文负责运行、部署和验证入口。模块与状态见 [架构说明](../docs/ARCHITECTURE.md)，音频判定见 [TIMING](TIMING.md)，通用交互规则见 [DESIGN](DESIGN.md)。

## 本地运行

先按 [后端说明](../backend/README.md#本地运行) 启动后端，再从仓库根目录执行：

```sh
cd frontend
npm ci
npm run dev
```

打开终端显示的地址。开发代理默认连接 `http://127.0.0.1:8000`，可用 `BACKEND_URL` 覆盖。
前端统一请求同源 `/api/...`；模型在「设置 → 模型服务」配置。
ChatGPT 授权回调 `/auth/callback` 也由开发代理转发；自定义前端端口需加入后端允许来源。

代理验证应从前端来源请求 `/api/health`；直接访问后端不能验证代理。配置入口为 [vite.config.ts](vite.config.ts)。

## Docker 开发模式

使用支持 Compose Watch 的新版 Docker Compose，在仓库根目录执行：

```sh
docker compose -f compose.dev.yaml up --build --watch
```

保持此终端运行，打开 <http://localhost:8081>。这是独立的开发配置，不与 `compose.yaml` 叠加。端口可通过 `DEV_HTTP_PORT` 设置，例如 `DEV_HTTP_PORT=8082 docker compose -f compose.dev.yaml up --build --watch`；后续管理命令保持相同端口设置。

Compose Watch 将源码变化同步到容器：前端代码和 `level-packs/` 修改由 Vite 热更新或刷新页面，新增、删除关卡也会更新；后端 Python 修改由 Uvicorn 自动重启进程，正在进行的请求可能中断。题库 `content/` 单独挂载，页面重新获取时读取最新内容。不要省略 `--watch`，否则后续源码修改不会同步。

开发项目名为 `rhythm-trainer-dev`，数据库、助手会话和模型连接保存在独立的 `backend-data` 卷中，不与普通 Docker 实例共享；首次使用需重新配置模型。依赖安装在镜像中，不使用或覆盖本机的 `node_modules`、`.venv`。

| 修改内容 | 操作 |
| --- | --- |
| 前端代码、关卡音乐与背景、后端 Python 代码 | 保存后自动更新 |
| 两端依赖清单、锁文件或 Dockerfile | Watch 自动重建对应服务，等待构建完成 |
| Compose 环境变量、端口或同步配置 | 停止后重新执行开发启动命令 |

查看日志用 `docker compose -f compose.dev.yaml logs -f`。按 Ctrl+C 停止开发进程，或在另一终端执行 `docker compose -f compose.dev.yaml down`；停止保留开发数据卷，添加 `-v` 会删除开发数据。生产运行仍使用根目录 README 中的普通 Docker 命令。

## 本地曲目与公开构建

核心代码可以直接提交与推送；额外曲目单独保存在被忽略的 `level-packs/`。目录与关卡契约见[游戏内容制作](src/game-content/README.md#内置内容与本地曲目包)。没有该目录时，所有命令仍可正常运行。

以下命令在 `frontend/` 执行：

| 命令 | 内容范围与产物 |
| --- | --- |
| `npm run dev` | 自动发现本地曲目，默认完整开发体验 |
| `npm run dev:public` | 只加载内置关卡，检查公开体验 |
| `npm run build` | 检查类型并自动包含已有本地曲目，输出 `dist/`；没有本地目录也能构建 |
| `npm run build:public` | 显式排除本地曲目，输出 `dist/` |
| `npm run preview` | 预览上一次构建的 `dist/` |
| `npm run validate:game` | 校验内置关卡与资源 |
| `npm run validate:game:local` | 检查本地类型并校验内置与本地关卡、图片、音乐和轨道 |

`GAME_LOCAL_CONTENT=0` 强制禁用本地内容，`GAME_LOCAL_CONTENT=1` 显式启用；其他值报错。该开关只从启动进程的环境读取，不从 `.env` 文件读取，保持运行与构建方式明确。改变模式后需重启开发服务器；新增或删除本地关卡后若页面未更新，也应重启。

生产 Docker 与普通构建一致，自动包含已有本地包；修改曲目后执行 `docker compose up -d --build frontend` 重建前端。关卡在构建时确定，给运行中的容器挂载目录不会自动增加关卡。

发布仅含内置关卡的产物时，使用 `build:public` 或不带本地目录的干净检出。Git 仍然忽略本地包：代码推送不会包含它，但在本机正常构建的镜像和 `dist/` 会包含它。

## 检查与构建

以下命令在 `frontend/` 执行；脚本定义见 [package.json](package.json)。

```sh
npm test
npm run lint
npm run validate:architecture
npm run validate:content
npm run build
npm run preview
```

`npm test` 验证领域与应用逻辑；`validate:architecture` 检查模块导入边界；题库校验和发布见 [题库说明](../content/README.md)。
`build` 生成 `dist/`；`preview` 用于检查构建产物。真实声音、焦点和设备延迟需要浏览器或实际试听验证。

## 浏览器回归

[tests/browser/](tests/browser/) 中的脚本按文件开头约定执行。按修改范围选择，模拟模型不能证明真实回答质量。

| 修改范围 | 回归入口 |
| --- | --- |
| 记录、筛选稳定性、活动确认与分析上下文 | `record-filters.js`、`async-surfaces.js`、`custom-mode-switch.js`、`practice-activity.js`、`practice-insight.js`、`page-context.js` |
| 助手跨路由挂载和响应式布局 | `assistant-resize.js`、`responsive-feedback.js`、`conversation-switch.js`、`conversation-actions.js` |
| 声音设置、试听、保存恢复与失败重试 | `sound-settings.js` |
| 击拍小节选择、局部练习与记录 | `tapping-range.js` |
| 击拍尾音重叠、停止与离页清理 | `tap-feedback.js` |
| 操作／设置布局、听写小节导航与参考答案 | `practice-layout.js` |
| 编辑保存与生成题目 | `editor-feedback.js`、`edit-generated-exercise.js`、`random-settings.js`、`time-signatures.js` |
| 图片、流与发送确认 | `assistant-images.js`、`assistant-stream.js`、`assistant-confirmation.js` |
| 游戏内容加载、关卡固定主题与背景时间线 | `game-content.js`、`rhythm-posters.js` |
| 游戏会话、判定、局部练习与结束清理 | `orbit-game.js`、`orbit-early-taps.js`、`orbit-range.js`、`orbit-preview.js` |
| 游戏音乐短段挑战、全部关卡密集两小节混音峰值 | `orbit-music.js`、`practice-music.js` |
| GS 多声部、扩展通道与实际发声 | `multipart-music.js`（短合成谱，不依赖本地曲目） |
| GS 加载失败重试、取消、实际发声、局部试听与 Worklet 清理 | `generaluser-gs.js`（默认短片段，需实际音色文件） |
| 焦点提示、弹层焦点返回与练习快捷键 | `focus-visibility.js`、`practice-shortcut-focus.js`、`dialog-consistency.js` |
| 练习信息架构、目录切换和手机导航 | `practice-navigation.js`、`navigation-repeat.js` |
| 导航和浮层动效 | `page-motion.js`、`navigation-repeat.js`、`surface-motion.js` |

GS 音色加载失败重试、加载取消和离页资源销毁集中由 `generaluser-gs.js` 验证；示范和挑战脚本分别关注各自的交互、判定及播放行为。

常规回归只运行与本次修改相关的入口。游戏通关使用普通、密集、三连音代表场景；所有关卡的节拍与目标由逻辑测试和内容校验覆盖。

`orbit-music.js` 和 `generaluser-gs.js` 默认运行短片段。修改编配、音源或混音时，先打开测试来源的 `/game/glimmer?validation=full-audio`，再执行对应脚本，显式启用完整音频验收：前者录制整曲并截图，后者完整播放当前正式编配并检测峰值。每次运行完整模式前都要重新打开此 URL；脚本后续导航不保留该参数。音色质量仍需实际试听，不能仅由响度断言判断。

表中列出主要入口；曲目和材质专项回归在 `tests/browser/` 按名称查找，执行条件以脚本开头说明为准。

部分脚本会清空或新增数据，必须使用临时后端。可从 `backend/` 在独立终端启动：

```sh
rhythm_test_dir=$(mktemp -d)
DATABASE_URL="sqlite:///$rhythm_test_dir/test.db" \
AI_SESSIONS_DIR="$rhythm_test_dir/assistant-sessions" \
ALLOWED_ORIGINS=http://127.0.0.1:5187 \
uv run --locked --no-env-file uvicorn main:app --host 127.0.0.1 --port 8017
```

另一个终端在 `frontend/` 执行 `BACKEND_URL=http://127.0.0.1:8017 npm run dev -- --port 5187 --strictPort`，打开该来源后运行相关脚本。
运行前核对脚本中的页面地址和接口模拟，固定地址须指向测试来源；助手回归需模拟模型连接、会话和消息接口。

## 部署

Docker 启动见 [项目 README](../README.md#快速启动docker)。手动部署以 [nginx.conf](nginx.conf) 为路由参考：

- 发布 `dist/`，普通页面路径回退到 `index.html`，保证直接打开和刷新子页面可用。
- `/api/` 与 `/auth/callback` 转发后端，SSE 转发超时应覆盖后端整轮超时。
- `/content/preset-exercises.json` 独立提供真实 JSON；题库不在 `dist/`，详见题库发布说明。
- 静态资源、API 与题库不能落入页面回退；开发代理配置不会随构建产物部署。

## 游戏内容维护

关卡内容、可编辑美术源及发布资源的归属见[游戏内容制作](src/game-content/README.md)。修改游戏内容后运行 `npm run validate:game`，并执行上面的前端检查与相关浏览器回归。
