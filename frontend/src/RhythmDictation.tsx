import { useState } from "react";

import type { RhythmEvent } from "./RhythmModel";

{
  /*
    # 交互过程：
    # 初始乐谱空白
    # 1. 用户点击播放按钮，播放音频（可能重复多次）
    # 2. 用户听出来了一些节奏，开始填写
    # 3. 用户点击验证答案（最少听出来一小节可以验证答案）
    # 4. 反馈：正确/有错误
    # 重复1-4，直到所有小节的节奏都被回答正确

    # 核心内容是乐谱交互（写、删、验证），我想的最理想的状态是用户直接在乐谱上写/删
    */
}
export function RhythmDictation() {
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const [answerMeasures, setAnswerMeasures] = useState<RhythmEvent[][]>([
    [
      { kind: "note", noteValue: "quarter" },
      { kind: "note", noteValue: "quarter" },
    ],
    [
      { kind: "note", noteValue: "eighth" },
      { kind: "note", noteValue: "eighth" },
    ],
  ]);

  function addNote(noteValue: "quarter" | "eighth") {
    const newEvent: RhythmEvent = {
      kind: "note",
      noteValue,
    };

    setAnswerMeasures((previous) =>
      previous.map((events, index) =>
        index === selectedMeasureIndex ? [...events, newEvent] : events,
      ),
    );
  }

  function removeLastNote() {
    setAnswerMeasures((previous) =>
      previous.map((events, index) =>
        index === selectedMeasureIndex ? events.slice(0, -1) : events,
      ),
    );
  }

  return (
    <div>
      {/* | 这里是一段乐谱 | 
    | 播放按钮 |    */}

      <div
        role="group"
        aria-label="选择答题小节"
        style={{ display: "flex", gap: 12 }}
      >
        {answerMeasures.map((events, measureIndex) => {
          const isSelected = selectedMeasureIndex === measureIndex;

          return (
            <button
              key={measureIndex}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedMeasureIndex(measureIndex)}
              style={{
                width: 140,
                height: 100,
                border: `2px solid ${isSelected ? "#646cff" : "#ccc"}`,
                backgroundColor: isSelected ? "#f0efff" : "transparent",
                color: "inherit",
              }}
            >
              <span>小节 {measureIndex + 1}</span>

              <span style={{ display: "block", marginTop: 8 }}>
                {events
                  .map((event) => {
                    if (event.noteValue === "quarter") return "四分";
                    if (event.noteValue === "eighth") return "八分";
                    return event.noteValue;
                  })
                  .join(" · ")}
              </span>
            </button>
          );
        })}
      </div>
      <div
        role="group"
        aria-label="添加音符"
        style={{ display: "flex", gap: 12, marginTop: 16 }}
      >
        <button type="button" onClick={() => addNote("quarter")}>
          四分音符
        </button>

        <button type="button" onClick={() => addNote("eighth")}>
          八分音符
        </button>

        <button
          type="button"
          disabled={answerMeasures[selectedMeasureIndex].length === 0}
          onClick={removeLastNote}
        >
          删除末尾
        </button>
      </div>
    </div>
  );
}
