"""完整节奏的结构解析和音乐规则；与前端 RhythmModel 的支持范围保持一致。"""

MAX_MEASURES = 64
# 与前端相同的音乐时间单位：四分音符 24 tick，三连音中每音 8 tick。
_NOTE_TICKS = {"whole": 96, "half": 48, "quarter": 24, "eighth": 12, "sixteenth": 6}


def _object(value, required, optional=()):
    if not isinstance(value, dict) or not set(required) <= value.keys() or value.keys() - set(required) - set(optional):
        raise ValueError("练习结构存在缺失、额外字段或错误的对象类型。")
    return value


def _event(value, *, triplet=False):
    event = _object(value, ("kind", "noteValue"), ("dots",))
    kind, note_value, dots = event["kind"], event["noteValue"], event.get("dots", 0)
    if kind not in ("note", "rest") or not isinstance(note_value, str) or note_value not in _NOTE_TICKS:
        raise ValueError("不支持的音符或休止符类型。")
    if type(dots) is not int or dots not in (0, 1):
        raise ValueError("附点数只支持 0 或 1。")
    if triplet and (kind != "note" or note_value != "eighth" or dots != 0):
        raise ValueError("小三连只能包含三个无附点八分音符。")
    copied = {"kind": kind, "noteValue": note_value}
    if "dots" in event:
        copied["dots"] = dots
    ticks = 8 if triplet else _NOTE_TICKS[note_value] * (3 if dots else 2) // 2
    return copied, ticks


def parse_rhythm_exercise(value: object) -> dict:
    """解析完整 4/4 节奏并返回独立副本；非法输入抛出 ValueError。

    限 1–64 小节，每小节恰好四拍；支持现有音符、休止符、单附点和小三连。
    拒绝额外字段，不修改输入；不依赖 HTTP、数据库或外部服务。
    """
    exercise = _object(value, ("timeSignature", "measures"))
    signature = _object(exercise["timeSignature"], ("beats", "beatType"))
    if any(type(signature[key]) is not int or signature[key] != 4 for key in ("beats", "beatType")):
        raise ValueError("目前只支持 4/4 拍。")
    measures = exercise["measures"]
    if not isinstance(measures, list) or not 1 <= len(measures) <= MAX_MEASURES:
        raise ValueError("练习须包含 1–64 个小节。")
    result = []
    for index, measure in enumerate(measures, 1):
        try:
            elements = _object(measure, ("elements",))["elements"]
            # 最短普通音符为十六分音符，合法四拍最多 16 个顶层元素。
            if not isinstance(elements, list) or not 1 <= len(elements) <= 16:
                raise ValueError("小节须包含 1–16 个节奏元素。")
            copied, total = [], 0
            for element in elements:
                if isinstance(element, dict) and element.get("kind") == "triplet":
                    notes = _object(element, ("kind", "notes"))["notes"]
                    if not isinstance(notes, list) or len(notes) != 3:
                        raise ValueError("小三连必须恰好包含三个音符。")
                    copied.append({"kind": "triplet", "notes": [_event(note, triplet=True)[0] for note in notes]})
                    total += 24
                else:
                    event, ticks = _event(element)
                    copied.append(event)
                    total += ticks
            if total != 96:
                raise ValueError("小节必须恰好四拍。")
            result.append({"elements": copied})
        except ValueError as error:
            raise ValueError(f"第 {index} 小节：{error}") from None
    return {"timeSignature": {"beats": 4, "beatType": 4}, "measures": result}

