from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from alembic import command
from sqlalchemy import delete, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.custom_exercises import CustomExercise, create_custom_exercise, get_custom_exercise, list_custom_exercises
from db.users import User, get_or_create_user


def note(value="quarter", **extra):
    return {"kind": "note", "noteValue": value, **extra}


def triplet():
    return {"kind": "triplet", "notes": [note("eighth") for _ in range(3)]}


def exercise(*elements):
    return {"timeSignature": {"beats": 4, "beatType": 4}, "measures": [{"elements": list(elements or [note("whole")])}]}


@pytest.fixture
def owners(migrated_db):
    with Session(migrated_db) as session, session.begin():
        return [get_or_create_user(session, phone).id for phone in ("13800000000", "13900000000")]


def create(session, user, content=None, **changes):
    values = {"name": " 测试练习 ", "mode": "tapping", "exercise": content if content is not None else exercise()}
    values.update(changes)
    return create_custom_exercise(session, user, **values)


def test_round_trip_snapshot_and_json_text(migrated_db, owners):
    content = exercise(note("quarter", dots=1), note("eighth"), triplet(), note())
    original = deepcopy(content)
    before = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    with Session(migrated_db) as session, session.begin():
        saved = create(session, owners[0], content)
        item_id = saved.id
        assert saved.name == "测试练习"
        assert UUID(item_id.removeprefix("custom-")).version == 4
        assert before <= saved.created_at <= datetime.now(UTC).replace(tzinfo=None)
        assert content == original
        content["measures"][0]["elements"][2]["notes"][0]["noteValue"] = "whole"
        assert saved.exercise == original
    migrated_db.dispose()
    with Session(migrated_db) as session:
        assert get_custom_exercise(session, owners[0], item_id).exercise == original
        assert session.scalar(text("SELECT typeof(exercise) FROM custom_exercises")) == "text"


def test_owner_mode_scope_same_name_and_pagination(migrated_db, owners):
    with Session(migrated_db) as session, session.begin():
        first = create(session, owners[0])
        second = create(session, owners[0])
        first.created_at = second.created_at = datetime(2026, 1, 1)
        other_mode = create(session, owners[0], mode="dictation")
        foreign = create(session, owners[1])
        ids = sorted([first.id, second.id], reverse=True)
        foreign_id, dictation_id = foreign.id, other_mode.id
    with Session(migrated_db) as session:
        assert [item.id for item in list_custom_exercises(session, owners[0], "tapping")] == ids
        assert [item.id for item in list_custom_exercises(session, owners[0], "tapping", limit=1, offset=1)] == ids[1:]
        assert [item.id for item in list_custom_exercises(session, owners[0], "dictation")] == [dictation_id]
        assert list_custom_exercises(session, owners[1], "dictation") == []
        # 即使同一 Session 已加载别人的记录，也不能通过主键缓存绕过用户条件。
        assert get_custom_exercise(session, owners[1], foreign_id) is not None
        assert get_custom_exercise(session, owners[0], foreign_id) is None
        assert get_custom_exercise(session, owners[0], "missing") is None


def test_no_implicit_commit_and_no_query_autoflush(migrated_db, owners):
    with Session(migrated_db) as session:
        item_id = create(session, owners[0]).id
    with Session(migrated_db) as session:
        assert get_custom_exercise(session, owners[0], item_id) is None
        session.add(CustomExercise(id="invalid-pending"))
        assert list_custom_exercises(session, owners[0], "tapping") == []
        assert get_custom_exercise(session, owners[0], item_id) is None


def test_invalid_rhythm_is_rejected_before_write(migrated_db, owners):
    with Session(migrated_db) as session:
        with pytest.raises(ValueError):
            create(session, owners[0], exercise(note()))
        assert session.scalars(select(CustomExercise)).all() == []


@pytest.mark.parametrize("changes", [{"name": " "}, {"name": "a" * 101}, {"name": None}, {"mode": "geometry"}])
def test_invalid_metadata(migrated_db, owners, changes):
    with Session(migrated_db) as session:
        with pytest.raises(ValueError):
            create(session, owners[0], **changes)


def test_none_content_rejected(migrated_db, owners):
    with Session(migrated_db) as session:
        with pytest.raises(ValueError):
            create_custom_exercise(session, owners[0], name="test", mode="tapping", exercise=None)


def test_limits_and_user_ids(migrated_db, owners):
    with Session(migrated_db) as session:
        create(session, owners[0], {**exercise(), "measures": exercise()["measures"] * 64}, name="a" * 100)
        for user in (True, 0, -1, "1", None):
            with pytest.raises(ValueError):
                create(session, user)
        for paging in ({"limit": 0}, {"limit": 101}, {"limit": True}, {"offset": -1}, {"offset": 0.5}):
            with pytest.raises(ValueError):
                list_custom_exercises(session, owners[0], "tapping", **paging)


@pytest.mark.parametrize("field,value", [
    ("name", ""), ("name", "x" * 101), ("mode", "geometry"),
    ("exercise", "not-json"), ("exercise", "[]"), ("exercise", "null"),
    ("exercise", None), ("user_id", 999999),
])
def test_database_constraints(migrated_db, owners, field, value):
    with Session(migrated_db) as session, session.begin():
        item_id = create(session, owners[0]).id
    with pytest.raises(IntegrityError):
        with migrated_db.begin() as connection:
            # 字段来自固定测试参数，不来自用户输入。
            connection.execute(text(f"UPDATE custom_exercises SET {field} = :value WHERE id = :id"), {"value": value, "id": item_id})


def test_user_delete_restricted(migrated_db, owners):
    with Session(migrated_db) as session, session.begin():
        item_id = create(session, owners[0]).id
    with pytest.raises(IntegrityError):
        with Session(migrated_db) as session, session.begin():
            session.execute(delete(User).where(User.id == owners[0]))
    with Session(migrated_db) as session:
        assert get_custom_exercise(session, owners[0], item_id) is not None


def test_migration_repeat_and_downgrade(migrated_db, owners, migration_config):
    with Session(migrated_db) as session, session.begin():
        item_id = create(session, owners[0]).id
    command.upgrade(migration_config, "head")
    command.check(migration_config)
    with Session(migrated_db) as session:
        assert get_custom_exercise(session, owners[0], item_id) is not None
    indexes = inspect(migrated_db).get_indexes("custom_exercises")
    assert indexes[0]["column_names"] == ["user_id", "mode", "created_at", "id"]
    command.downgrade(migration_config, "0003_create_sms_login_requests")
    assert "custom_exercises" not in inspect(migrated_db).get_table_names()
    with Session(migrated_db) as session:
        assert session.scalars(select(User.id)).all() == owners
    command.upgrade(migration_config, "head")
