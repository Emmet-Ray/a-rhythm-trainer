"""完整节奏的结构解析和音乐规则；与前端 RhythmModel 的支持范围保持一致。"""

MAX_MEASURES = 64
TICKS_PER_QUARTER = 24


def measure_ticks(signature):
    """解析支持的拍号并返回小节容量，完整题目与作答校验共用。"""
    signature = _object(signature, ("beats", "beatType"))
    if (type(signature["beats"]) is not int or signature["beats"] not in (2, 3, 4)
            or type(signature["beatType"]) is not int or signature["beatType"] != 4):
        raise ValueError("目前只支持 2/4、3/4、4/4 拍。")
    return signature["beats"] * TICKS_PER_QUARTER

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
    """解析完整 2/4、3/4、4/4 节奏并返回独立副本；非法输入抛出 ValueError。

    限 1–64 小节，每小节填满拍号指定的容量；支持现有音符、休止符、单附点和小三连。
    拒绝额外字段，不修改输入；不依赖 HTTP、数据库或外部服务。
    """
    exercise = _object(value, ("timeSignature", "measures"))
    signature = _object(exercise["timeSignature"], ("beats", "beatType"))
    capacity = measure_ticks(signature)
    measures = exercise["measures"]
    if not isinstance(measures, list) or not 1 <= len(measures) <= MAX_MEASURES:
        raise ValueError("练习须包含 1–64 个小节。")
    result = []
    for index, measure in enumerate(measures, 1):
        try:
            elements = _object(measure, ("elements",))["elements"]
            # 最短普通音符为十六分音符，每拍最多四个顶层元素。
            if not isinstance(elements, list) or not 1 <= len(elements) <= signature["beats"] * 4:
                raise ValueError(f"小节须包含 1–{signature['beats'] * 4} 个节奏元素。")
            copied, total = parse_rhythm_elements(elements, signature)
            if total != capacity:
                raise ValueError(f"小节必须恰好 {signature['beats']} 拍。")
            result.append({"elements": copied})
        except ValueError as error:
            raise ValueError(f"第 {index} 小节：{error}") from None
    return {"timeSignature": dict(signature), "measures": result}


def parse_rhythm_elements(elements, signature):
    """校验一小节草稿（允许空白和欠拍），返回元素副本与 tick 总长。"""
    capacity = measure_ticks(signature)
    if not isinstance(elements, list) or len(elements) > signature["beats"] * 4:
        raise ValueError("小节节奏元素无效")
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
    if total > capacity:
        raise ValueError(f"小节不能超过 {signature['beats']} 拍")
    return copied, total


def score_identity(exercise):
    """比较合法的规范化谱面；无附点的两种写法视为相同，不另存指纹。"""
    score = parse_rhythm_exercise(exercise)
    for measure in score["measures"]:
        for element in measure["elements"]:
            for event in element["notes"] if element["kind"] == "triplet" else [element]:
                if event.get("dots") == 0:
                    event.pop("dots")
    return score
