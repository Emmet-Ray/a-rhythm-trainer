"""持久化记录的结构与基本业务不变量；不依赖模型或账号。"""

from copy import deepcopy
from datetime import datetime
import math
from domain.rhythm import parse_rhythm_exercise, parse_rhythm_elements


def _validate_records(records):
    def require(condition):
        if not condition:
            raise ValueError("练习记录格式无效")

    def count(value):
        require(type(value) is int and 0 <= value <= 9007199254740991)

    def number(value):
        require(type(value) in (int, float) and math.isfinite(value))

    def date(value):
        require(isinstance(value, str))
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        require(parsed.tzinfo is not None)
        return parsed

    require(isinstance(records, list))
    ids = set()
    keys = set()
    import json

    for record in records:
        require(isinstance(record, dict))
        for field in ("id", "exerciseId", "title"):
            require(isinstance(record.get(field), str) and bool(record[field].strip()))
        require(record["id"] not in ids)
        ids.add(record["id"])
        require(record.get("source") in ("preset", "random", "custom", "ai"))
        require(record.get("mode") in ("tapping", "dictation"))
        exercise = parse_rhythm_exercise(record.get("exercise"))
        for measure in exercise["measures"]:
            for element in measure["elements"]:
                for event in (
                    element["notes"] if element["kind"] == "triplet" else [element]
                ):
                    if event.get("dots") == 0:
                        event.pop("dots")
        key = (
            record["source"],
            record["exerciseId"],
            record["mode"],
            json.dumps(exercise, sort_keys=True),
        )
        require(key not in keys)
        keys.add(key)
        date(record.get("startedAt"))
        date(record.get("updatedAt"))
        require(
            isinstance(record.get("attempts"), list) and len(record["attempts"]) > 0
        )
        attempts = set()
        for attempt in record["attempts"]:
            require(
                isinstance(attempt, dict)
                and isinstance(attempt.get("id"), str)
                and bool(attempt["id"])
            )
            require(attempt["id"] not in attempts)
            attempts.add(attempt["id"])
            if record["mode"] == "tapping":
                date(attempt.get("completedAt"))
                number(attempt.get("bpm"))
                require(attempt["bpm"] > 0)
                if "metronomeEnabled" in attempt:
                    require(type(attempt["metronomeEnabled"]) is bool)
                windows = attempt.get("timingWindows", {})
                number(windows.get("perfectMs"))
                number(windows.get("hitMs"))
                require(
                    0 <= windows["perfectMs"] <= windows["hitMs"]
                    and windows["hitMs"] > 0
                )
                for field in ("targetCount", "hitCount", "missCount", "wrongTapCount"):
                    count(attempt.get(field))
                require(
                    attempt["hitCount"] + attempt["missCount"] == attempt["targetCount"]
                )
                require(type(attempt.get("passed")) is bool)
                require(
                    not attempt["passed"]
                    or (attempt["missCount"] == 0 and attempt["wrongTapCount"] == 0)
                )
                if "details" in attempt:
                    details = attempt["details"]
                    require(
                        isinstance(details, dict)
                        and type(details.get("stopped")) is bool
                        and isinstance(details.get("timingEvents"), list)
                    )
                    expanded = [
                        event
                        for measure in exercise["measures"]
                        for element in measure["elements"]
                        for event in (
                            element["notes"]
                            if element["kind"] == "triplet"
                            else [element]
                        )
                    ]
                    targets = [
                        index
                        for index, event in enumerate(expanded)
                        if event["kind"] == "note"
                    ]
                    seen = set()
                    hits = misses = wrong = 0
                    for event in details["timingEvents"]:
                        require(event.get("kind") in ("hit", "miss", "wrongTap"))
                        if event["kind"] != "wrongTap":
                            count(event.get("targetIndex"))
                            count(event.get("eventIndex"))
                            target = event["targetIndex"]
                            require(
                                target < len(targets)
                                and target not in seen
                                and targets[target] == event["eventIndex"]
                            )
                            seen.add(target)
                        hits += event["kind"] == "hit"
                        misses += event["kind"] == "miss"
                        wrong += event["kind"] == "wrongTap"
                        if event["kind"] != "miss":
                            number(event.get("tapOffsetMs"))
                        if event["kind"] == "hit":
                            require(event.get("grade") in ("perfect", "early", "late"))
                            number(event.get("errorMs"))
                    require(len(seen) == len(targets) == attempt["targetCount"])
                    require(
                        (hits, misses, wrong)
                        == (
                            attempt["hitCount"],
                            attempt["missCount"],
                            attempt["wrongTapCount"],
                        )
                    )
                    require(
                        attempt["passed"]
                        == (not details["stopped"] and misses == 0 and wrong == 0)
                    )
            else:
                require("completedAt" in attempt)
                started = date(attempt.get("startedAt"))
                completed = attempt.get("completedAt")
                if completed is not None:
                    require(date(completed) >= started)
                require(type(attempt.get("viewedAnswer")) is bool)
                measures = attempt.get("measures")
                require(
                    isinstance(measures, list)
                    and len(measures) == len(exercise["measures"])
                )
                for measure in measures:
                    count(measure.get("questionPlayCount"))
                    count(measure.get("verificationCount"))
                    require(
                        measure.get("verdict") in ("unchecked", "correct", "incorrect")
                    )
                    require(
                        measure["verdict"] == "unchecked"
                        or measure["verificationCount"] > 0
                    )
                require(
                    (completed is not None)
                    == all(m["verdict"] == "correct" for m in measures)
                )
                if "playbackSettings" in attempt:
                    require(isinstance(attempt["playbackSettings"], list))
                    for setting in attempt["playbackSettings"]:
                        number(setting.get("bpm"))
                        require(setting["bpm"] > 0)
                        require(type(setting.get("metronomeEnabled")) is bool)
                        count(setting.get("count"))
                        require(setting["count"] > 0)
                if "answerMeasures" in attempt:
                    require(
                        isinstance(attempt["answerMeasures"], list)
                        and len(attempt["answerMeasures"]) == len(measures)
                    )
                    for measure in attempt["answerMeasures"]:
                        parse_rhythm_elements(measure)
    return deepcopy(records)


def validate_records(records):
    """拒绝客户端无法解析的记录，统一转换格式错误并保留原数据。"""
    try:
        return _validate_records(records)
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
        raise ValueError("练习记录格式无效") from None
