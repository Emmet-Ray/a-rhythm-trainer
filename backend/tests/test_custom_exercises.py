from copy import deepcopy
import pytest
from sqlalchemy.orm import Session
from db.custom_exercises import create_custom_exercise, get_custom_exercise, list_custom_exercises, update_custom_exercise, delete_custom_exercise

def exercise():
    return {"timeSignature": {"beats": 4, "beatType": 4}, "measures": [{"elements": [{"kind": "note", "noteValue": "whole"}]}]}

def test_instance_crud_and_transaction(migrated_db):
    content = exercise()
    with Session(migrated_db) as session, session.begin():
        item = create_custom_exercise(session, name=" 题目 ", mode="tapping", exercise=content)
        identifier = item.id
        assert item.name == "题目"
        content["measures"].clear()
        assert item.exercise == exercise()
    with Session(migrated_db) as session:
        assert get_custom_exercise(session, identifier).exercise == exercise()
        assert len(list_custom_exercises(session, "tapping")) == 1
        assert list_custom_exercises(session, "dictation") == []
        update_custom_exercise(session, identifier, name="修改", exercise=exercise())
        session.rollback()
        assert get_custom_exercise(session, identifier).name == "题目"
        assert delete_custom_exercise(session, identifier)
        session.commit()
        assert get_custom_exercise(session, identifier) is None

@pytest.mark.parametrize("changes", [{"name":""}, {"mode":"invalid"}, {"exercise":{}}, {"exercise":None}])
def test_validation_before_write(migrated_db, changes):
    payload = {"name":"题目", "mode":"tapping", "exercise":exercise(), **changes}
    with Session(migrated_db) as session:
        with pytest.raises(ValueError): create_custom_exercise(session, **payload)
        assert list_custom_exercises(session, "tapping") == []
