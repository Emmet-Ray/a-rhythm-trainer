"""生成练习输入边界；无需模型、HTTP 或数据库。"""

from copy import deepcopy
from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from assistant.tools.propose_rhythm_exercise import GeneratedExercise


def candidate():
    return {
        "title": "  四分音符入门  ",
        "description": "  练习稳定击拍。  ",
        "exercise": {
            "timeSignature": {"beats": 4, "beatType": 4},
            "measures": [{"elements": [{"kind": "note", "noteValue": "quarter"} for _ in range(4)]}],
        },
    }


def test_valid_record_has_backend_identity_time_and_normalized_text():
    before = datetime.now(UTC)
    record = GeneratedExercise(candidate())
    assert UUID(record.id).version == 4
    assert before <= record.created_at <= datetime.now(UTC)
    assert record.created_at.tzinfo == UTC
    assert record.title == "四分音符入门"
    assert record.description == "练习稳定击拍。"
    assert GeneratedExercise(candidate()).id != record.id
    assert record.snapshot()["created_at"] == record.created_at.isoformat()


@pytest.mark.parametrize("patch", [
    {"title": " "}, {"title": 123}, {"title": "题" * 101},
    {"description": ""}, {"description": "说" * 1001},
    {"id": "model-chosen"}, {"created_at": "2026-01-01"},
    {"mode": "tapping"}, {"exercise": []},
])
def test_invalid_outer_fields_rejected(patch):
    with pytest.raises(ValidationError):
        GeneratedExercise({**candidate(), **patch})


@pytest.mark.parametrize("value", [None, [], {}, {"title": "练习"}])
def test_missing_or_non_object_input_rejected(value):
    with pytest.raises(ValidationError):
        GeneratedExercise(value)


@pytest.mark.parametrize("count", [3, 5])
def test_underfull_and_overfull_measure_report_location(count):
    value = candidate()
    value["exercise"]["measures"].append({"elements": [{"kind": "note", "noteValue": "quarter"}] * count})
    with pytest.raises(ValidationError, match="第 2 小节：小节必须恰好四拍"):
        GeneratedExercise(value)


def test_domain_rules_support_dots_rests_and_triplets():
    value = candidate()
    value["exercise"]["measures"][0]["elements"] = [
        {"kind": "rest", "noteValue": "quarter", "dots": 1},
        {"kind": "note", "noteValue": "eighth"},
        {"kind": "triplet", "notes": [{"kind": "note", "noteValue": "eighth"}] * 3},
        {"kind": "note", "noteValue": "quarter"},
    ]
    assert GeneratedExercise(value).snapshot()["exercise"] == value["exercise"]


def test_input_and_display_snapshot_cannot_change_record():
    value = candidate()
    original = deepcopy(value)
    record = GeneratedExercise(value)
    assert value == original
    value["exercise"]["measures"].clear()
    displayed = record.snapshot()
    displayed["exercise"]["measures"][0]["elements"].clear()
    assert record.snapshot()["exercise"] == original["exercise"]

