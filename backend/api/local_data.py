"""本地实例的记录持久化与题库管理。"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update, delete
from sqlalchemy.orm import Session
from api.dependencies import DatabaseEngine
from api.http_policy import LocalApiRoute
from db.practice_records import Document, RecordOperation
from db.custom_exercises import CustomExercise
from domain.practice_records import validate_records

router = APIRouter(prefix="/api/local-data", route_class=LocalApiRoute)


class RecordsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    records: list[dict]
    operation_id: str = Field(min_length=1, max_length=100)


@router.get("/records")
def read_records(engine: DatabaseEngine):
    with Session(engine) as session:
        row = session.get(Document, "records")
        return {"revision": row.revision, "records": row.value["records"]}


@router.put("/records")
def write_records(body: RecordsBody, engine: DatabaseEngine):
    try:
        records = validate_records(body.records)
    except ValueError:
        raise HTTPException(422, "练习记录格式无效") from None
    with Session(engine) as session, session.begin():
        session.execute(
            update(Document)
            .where(Document.key == "records")
            .values(revision=Document.revision)
        )
        if session.get(RecordOperation, body.operation_id) is not None:
            row = session.get(Document, "records")
            return {"revision": row.revision, "records": row.value["records"]}
        result = session.execute(
            update(Document)
            .where(Document.key == "records", Document.revision == body.revision)
            .values(
                revision=body.revision + 1, value={"version": 3, "records": records}
            )
        )
        if result.rowcount != 1:
            raise HTTPException(409, "练习记录已更新，请重新读取后保存")
        session.add(RecordOperation(operation_id=body.operation_id))
    return {"revision": body.revision + 1, "records": records}


@router.get("/exercises")
def exercise_summary(engine: DatabaseEngine):
    with Session(engine) as session:
        items = list(session.scalars(select(CustomExercise)))
        return {
            "total": len(items),
            "tapping": sum(x.mode == "tapping" for x in items),
            "dictation": sum(x.mode == "dictation" for x in items),
        }


@router.delete("/exercises")
def clear_exercises(engine: DatabaseEngine):
    with Session(engine) as session, session.begin():
        session.execute(delete(CustomExercise))
    return {"ok": True}
