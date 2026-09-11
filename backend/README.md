# 后端

Python 3.12+、FastAPI，使用 uv 管理独立依赖和虚拟环境。
目前只有健康检查，不包含数据库、短信或登录。前端已配置本地 `/api` 代理，见 [前后端联调说明](../联调.md)。

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
后续密钥只配置在后端，不放入前端或 Git；目前不需要任何密钥。

## 测试

在 `backend/` 下执行：

```sh
uv run pytest
```

测试使用内存中的测试客户端，不启动监听端口，也不调用短信服务。
后续按实际业务增加模块，暂不预建空的用户、认证和数据库目录。
