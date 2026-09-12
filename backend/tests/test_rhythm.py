"""纯节奏规则测试，不建立数据库或启动 HTTP 应用。"""

from copy import deepcopy

import pytest

from domain.rhythm import parse_rhythm_exercise


def note(value="quarter", **extra):
    return {"kind": "note", "noteValue": value, **extra}


def triplet():
    return {"kind": "triplet", "notes": [note("eighth") for _ in range(3)]}


def exercise(*elements):
    return {"timeSignature": {"beats": 4, "beatType": 4}, "measures": [{"elements": list(elements or [note("whole")])}]}


@pytest.mark.parametrize("value", ["whole", "half", "quarter", "eighth", "sixteenth"])
@pytest.mark.parametrize("kind", ["note", "rest"])
def test_all_note_and_rest_values(value, kind):
    count = {"whole": 1, "half": 2, "quarter": 4, "eighth": 8, "sixteenth": 16}[value]
    parse_rhythm_exercise(exercise(*[note(value, kind=kind) for _ in range(count)]))


def test_dotted_rest_and_offbeat_triplet():
    content = exercise(note("eighth"), triplet(), note("eighth"), note("quarter", kind="rest", dots=1), note("eighth"))
    assert parse_rhythm_exercise(content) == content


@pytest.mark.parametrize("content", [
    {}, [], {"timeSignature": {"beats": 4, "beatType": 4}, "measures": []},
    {**exercise(), "user_id": 1},
    {**exercise(), "timeSignature": {"beats": 4.0, "beatType": 4}},
    {**exercise(), "timeSignature": {"beats": 3, "beatType": 4}},
    {**exercise(), "measures": [{"elements": []}]},
    exercise(note()), exercise(note("whole"), note()),
    exercise(note("whole", dots=True)), exercise(note("whole", dots=2)),
    exercise(note("unknown")), exercise(note("whole", unexpected=1)),
    exercise(note("whole", kind="unknown")), exercise(None),
    exercise({"kind": "triplet", "notes": [note("eighth")] }),
    exercise({"kind": "triplet", "notes": [note("eighth", dots=1)] * 3}, note("half"), note()),
    exercise({"kind": "triplet", "notes": [note("eighth", kind="rest")] * 3}, note("half"), note()),
    exercise({"kind": "triplet", "notes": [triplet()] * 3}, note("half"), note()),
    {**exercise(), "measures": exercise()["measures"] * 65},
])
def test_invalid_content_rejected(content):
    with pytest.raises(ValueError):
        parse_rhythm_exercise(content)



def test_snapshot_is_independent():
    content = exercise(note("quarter", dots=1), note("eighth"), triplet(), note())
    original = deepcopy(content)
    result = parse_rhythm_exercise(content)
    assert content == result == original
    result["measures"][0]["elements"][2]["notes"][0]["noteValue"] = "whole"
    assert content == original


def test_measure_limit_and_none():
    parse_rhythm_exercise({**exercise(), "measures": exercise()["measures"] * 64})
    with pytest.raises(ValueError):
        parse_rhythm_exercise(None)
