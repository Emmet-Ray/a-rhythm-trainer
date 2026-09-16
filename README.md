# 节奏训练

## Docker 启动

安装 Docker Engine 与 Compose 插件（或 Docker Desktop），在仓库根目录执行：

```sh
docker compose up
```

打开 <http://localhost:8080>。默认关闭账号功能，无需配置短信服务，可使用预设、随机和浏览器本地自定义练习。

- [前端](frontend/README.md)：React 网站与节奏训练组件。
- [后端](backend/README.md)：FastAPI 最小骨架及本地启动说明。
- [前后端联调](联调.md)：本地服务启动、代理与请求验证。
- [预设题库](content/README.md)：独立内容编辑、校验、发布与回退。
