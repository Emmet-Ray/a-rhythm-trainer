import { useEffect, useRef, useState } from "react";
import { Formatter, Renderer, Stave } from "vexflow";

import { rhythmEventToDurationInQuarterNotes, type RhythmEvent } from "./RhythmModel";
import { rhythmEventToVexFlowStaveNote } from "./RhythmNotation";

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
  // 当前答题谱表固定为 4/4，拍数以四分音符为单位。
  const measureBeats = 4;
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const [addNoteMessage, setAddNoteMessage] = useState("");
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

    const usedBeats = answerMeasures[selectedMeasureIndex].reduce(
      (total, event) => total + rhythmEventToDurationInQuarterNotes(event),
      0,
    );
    const excessBeats = usedBeats + rhythmEventToDurationInQuarterNotes(newEvent) - measureBeats;
    if (excessBeats > 0) {
      setAddNoteMessage("添加这个音符会超出当前小节允许的拍数。");
      return;
    }

    setAddNoteMessage("");
    setAnswerMeasures((previous) =>
      previous.map((events, index) =>
        index === selectedMeasureIndex ? [...events, newEvent] : events,
      ),
    );
  }

  function removeLastNote() {
    setAddNoteMessage("");
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
        style={{ display: "flex", flexWrap: "wrap", gap: 12 }}
      >
        {answerMeasures.map((events, measureIndex) => {
          const isSelected = selectedMeasureIndex === measureIndex;

          return (
            <button
              key={measureIndex}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                setSelectedMeasureIndex(measureIndex);
                setAddNoteMessage("");
              }}
              style={{
                width: 328,
                minHeight: 180,
                padding: 12,
                border: `2px solid ${isSelected ? "#646cff" : "#ccc"}`,
                backgroundColor: isSelected ? "#f0efff" : "transparent",
                color: "inherit",
              }}
            >
              <span>小节 {measureIndex + 1}</span>

              <RhythmAnswerMeasure events={events} />
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
      <p role="status">{addNoteMessage}</p>
    </div>
  );
}

type RhythmAnswerMeasureProps = {
  events: readonly RhythmEvent[];
};

// 原样显示答案草稿，不自动补休止符；填写拍数限制由上层处理。
function RhythmAnswerMeasure({ events }: RhythmAnswerMeasureProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // VexFlow 要求 div 容器；生成 SVG 后放入 span，保持外层按钮的合法内容结构。
    const drawingContainer = document.createElement("div");
    const renderer = new Renderer(drawingContainer, Renderer.Backends.SVG);
    renderer.resize(300, 140);
    const context = renderer.getContext();
    const stave = new Stave(10, 20, 280);
    stave.addClef("treble").addTimeSignature("4/4");
    stave.setContext(context).draw();

    if (events.length > 0) {
      const notes = events.map(rhythmEventToVexFlowStaveNote);
      // FormatAndDraw 使用宽松的 Voice，不要求草稿满足完整小节时值。
      Formatter.FormatAndDraw(context, stave, notes);
    }
    container.replaceChildren(...drawingContainer.childNodes);

    // 同时兼容卸载与开发模式的 Effect 重建，避免留下重复 SVG。
    return () => container.replaceChildren();
  }, [events]);

  return <span ref={containerRef} aria-hidden="true" style={{ display: "block" }} />;
}
