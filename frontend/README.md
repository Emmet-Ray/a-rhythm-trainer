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
| 助手跨路由挂载和响应式布局 | `assistant-resize.js`、`responsive-feedback.js`、`conversation-switch.js` |
| 声音设置、试听、保存恢复与失败重试 | `sound-settings.js` |
| 击拍小节选择、局部练习与记录 | `tapping-range.js` |
| 击拍尾音重叠、停止与离页清理 | `tap-feedback.js` |
| 操作／设置布局、听写小节导航与参考答案 | `practice-layout.js` |
| 编辑保存与生成题目 | `editor-feedback.js`、`edit-generated-exercise.js`、`random-settings.js` |
| 图片、流与发送确认 | `assistant-images.js`、`assistant-stream.js`、`assistant-confirmation.js` |
| 导航和浮层动效 | `page-motion.js`、`navigation-repeat.js`、`surface-motion.js` |

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
