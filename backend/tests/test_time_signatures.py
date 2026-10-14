from copy import deepcopy
import pytest
from fastapi.testclient import TestClient
from main import create_app
from domain.rhythm import parse_rhythm_exercise, parse_rhythm_elements
from assistant.tools.propose_rhythm_exercise import GeneratedExercise
from test_local_data import record


def score(beats):
    return {"timeSignature": {"beats": beats, "beatType": 4}, "measures": [
        {"elements": [{"kind": "note", "noteValue": "quarter"}] * beats}]}


@pytest.mark.parametrize("beats", [2, 3, 4])
def test_model_ai_and_draft_capacity(beats):
    content = score(beats)
    assert parse_rhythm_exercise(content) == content
    proposal = GeneratedExercise({"title": "练习", "description": "节奏训练", "exercise": content})
    assert proposal.snapshot()["exercise"] == content
    assert parse_rhythm_elements([], content["timeSignature"]) == ([], 0)
    for count in [beats - 1, beats + 1]:
        invalid = deepcopy(content)
        invalid["measures"][0]["elements"] = [{"kind": "rest", "noteValue": "quarter"}] * count
        with pytest.raises(ValueError):
            parse_rhythm_exercise(invalid)
    with pytest.raises(ValueError):
        parse_rhythm_elements([{"kind": "note", "noteValue": "quarter"}] * (beats + 1), content["timeSignature"])


@pytest.mark.parametrize("beats", [2, 3, 4])
@pytest.mark.parametrize("mode", ["tapping", "dictation"])
def test_save_reopen_edit_and_fixed_meter(beats, mode):
    with TestClient(create_app(), headers={"Origin": "http://localhost:5173"}) as client:
        content = score(beats)
        response = client.post("/api/custom-exercises", json={"name": "题目", "mode": mode, "exercise": content})
        assert response.status_code == 201, response.text
        path = "/api/custom-exercises/" + response.json()["id"]
        assert client.get(path).json()["exercise"] == content
        content["measures"][0]["elements"][0]["kind"] = "rest"
        assert client.put(path, json={"name": "修改", "exercise": content}).status_code == 200
        other = score(2 if beats != 2 else 3)
        assert client.put(path, json={"name": "不应修改", "exercise": other}).status_code == 422
        assert client.get(path).json()["exercise"] == content
        assert client.get(path).json()["name"] == "修改"


@pytest.mark.parametrize("beats", [2, 3, 4])
def test_dictation_record_roundtrip_and_overflow(beats):
    with TestClient(create_app(), headers={"Origin": "http://localhost:5173"}) as client:
        item = record()
        item["exercise"] = score(beats)
        item["attempts"][0]["answerMeasures"] = [[{"kind": "note", "noteValue": "quarter"}]]
        response = client.post("/api/local-data/records", json=item)
        assert response.status_code == 200, response.text
        result = client.get("/api/local-data/records/" + response.json()["id"])
        assert result.status_code == 200
        assert result.json()["record"]["exercise"]["timeSignature"]["beats"] == beats
        item["id"] = "overflow"
        item["attempts"][0]["answerMeasures"][0] *= beats + 1
        assert client.post("/api/local-data/records", json=item).status_code == 422
