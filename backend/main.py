from fastapi import FastAPI

app = FastAPI(title="Rhythm Trainer API")


@app.get("/api/health")
async def health() -> dict[str, str]:
    """仅检查 API 是否可响应，不代表数据库或外部服务可用。"""
    return {"status": "ok"}
