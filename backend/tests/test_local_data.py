"""单人实例迁移与写入：临时库、无真实数据或模型调用。"""

import json
import sqlite3

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import text, inspect

from main import create_app
from db.database import create_database_engine
from db.initialize import initialize_database
from test_custom_exercises import exercise

ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture
def client():
    with TestClient(create_app(), headers=ORIGIN) as value:
        yield value


def record():
    return {
        "id": "record-1",
        "exerciseId": "old",
        "title": "旧练习",
        "source": "custom",
        "mode": "dictation",
        "exercise": exercise(),
        "startedAt": "2026-10-01T00:00:00Z",
        "updatedAt": "2026-10-01T00:00:00Z",
        "attempts": [
            {
                "id": "answer-1",
                "startedAt": "2026-10-01T00:00:00Z",
                "completedAt": None,
                "viewedAnswer": False,
                "measures": [
                    {
                        "questionPlayCount": 1,
                        "verificationCount": 0,
                        "verdict": "unchecked",
                    }
                ],
            }
        ],
    }


def test_record_compare_and_swap_and_lost_response_retry(client):
    body = {"revision": 0, "records": [record()], "operation_id": "save-1"}
    first = client.put("/api/local-data/records", json=body)
    assert first.status_code == 200, first.text
    assert (
        client.put(
            "/api/local-data/records", json={**body, "operation_id": "other"}
        ).status_code
        == 409
    )
    assert client.put("/api/local-data/records", json=body).json() == first.json()
    assert (
        client.put(
            "/api/local-data/records",
            json={"revision": 1, "records": [], "operation_id": "delete"},
        ).status_code
        == 200
    )
    # A lost success response retried after deletion must never restore the record.
    assert client.put("/api/local-data/records", json=body).json()["records"] == []


@pytest.mark.parametrize(
    "change",
    [
        lambda r: r["attempts"][0].update(measures=[None]),
        lambda r: r["attempts"][0].update(
            answerMeasures=[[{"kind": "note", "noteValue": "bad"}]]
        ),
        lambda r: r["attempts"][0].update(playbackSettings=[None]),
        lambda r: r["attempts"][0].update(completedAt="2026-10-02T00:00:00Z"),
    ],
)
def test_invalid_record_rejected_without_overwrite(client, change):
    item = record()
    change(item)
    response = client.put(
        "/api/local-data/records",
        json={"revision": 0, "records": [item], "operation_id": "bad"},
    )
    assert response.status_code == 422, response.text
    assert client.get("/api/local-data/records").json() == {
        "revision": 0,
        "records": [],
    }


def test_upgrade_preserves_records_and_retry_ledger(
    tmp_path, monkeypatch, migration_config
):
    database = tmp_path / "instance.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database}")
    command.upgrade(migration_config, "0005_single_user")
    engine = create_database_engine()
    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE instance_documents SET revision=1, value=:value WHERE key='records'"
            ),
            {"value": json.dumps({"version": 3, "records": [record()]})},
        )
        connection.execute(
            text(
                "INSERT INTO legacy_imports (key) VALUES ('write:save-1'), ('account:1'), ('browser:old')"
            )
        )
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO users (id,phone_number) VALUES (1,'13800000000')")
        )
        connection.execute(
            text(
                "INSERT INTO custom_exercises (id,user_id,name,mode,exercise) VALUES ('old',1,'旧题','dictation',:exercise)"
            ),
            {"exercise": json.dumps(exercise())},
        )
        connection.execute(
            text(
                "INSERT INTO instance_exercises (id,name,mode,exercise) VALUES ('old','旧题','dictation',:exercise)"
            ),
            {"exercise": json.dumps(exercise())},
        )
    # 先验证 0006 自身可回退，清理迁移之后不再支持恢复旧账号数据
    command.upgrade(migration_config, "0006_record_operations")
    command.downgrade(migration_config, "0005_single_user")
    initialize_database(engine)
    backup = database.with_name(database.name + ".before-0005_single_user.bak")
    with sqlite3.connect(backup) as connection:
        assert (
            connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
            == "0005_single_user"
        )
    for restart in range(2):
        with TestClient(create_app(), headers=ORIGIN) as client:
            result = client.put(
                "/api/local-data/records",
                json={"revision": 0, "records": [], "operation_id": "save-1"},
            )
            assert (
                client.get("/api/custom-exercises/old").json()["exercise"] == exercise()
            )
            assert result.status_code == 200
            assert result.json() == {"revision": 1, "records": [record()]}
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT operation_id FROM record_operations")
        ).scalars().all() == ["save-1"]
        assert not {
            "users",
            "login_sessions",
            "sms_login_requests",
            "custom_exercises",
            "legacy_imports",
        } & set(inspect(connection).get_table_names())
    with pytest.raises(RuntimeError, match="不能通过降级恢复"):
        command.downgrade(migration_config, "0006_record_operations")
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT operation_id FROM record_operations")
        ).scalars().all() == ["save-1"]
    engine.dispose()


@pytest.mark.parametrize(
    "method,path",
    [
        ("post", "/import"),
        ("get", "/legacy-accounts"),
        ("post", "/legacy-accounts/1"),
        ("get", "/legacy-sessions"),
        ("post", "/legacy-sessions/old"),
    ],
)
def test_temporary_import_routes_removed(client, method, path):
    assert getattr(client, method)("/api/local-data" + path).status_code == 404
