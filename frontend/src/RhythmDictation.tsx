import { useEffect, useMemo, useRef, useState } from "react";
import { BarlineType, Beam, Formatter, Renderer, Stave, Voice } from "vexflow";

import {
  rhythmEventToDurationInQuarterNotes,
  type RhythmEvent,
} from "./RhythmModel";
import { rhythmEventToVexFlowStaveNote } from "./RhythmNotation";
import { getBeatBeamGroups } from "./RhythmScoreLayout";

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
    const excessBeats =
      usedBeats + rhythmEventToDurationInQuarterNotes(newEvent) - measureBeats;
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

      <RhythmAnswerScore
        measures={answerMeasures}
        selectedMeasureIndex={selectedMeasureIndex}
        onSelectMeasure={(index) => {
          setSelectedMeasureIndex(index);
          setAddNoteMessage("");
        }}
      />
      <div
        role="group"
        aria-label="添加音符"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}
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

type RhythmAnswerScoreProps = {
  measures: readonly (readonly RhythmEvent[])[];
  selectedMeasureIndex: number;
  onSelectMeasure: (index: number) => void;
};

// 原样显示答案草稿，不自动补休止符；填写拍数限制由上层处理。
function RhythmAnswerScore({
  measures,
  selectedMeasureIndex,
  onSelectMeasure,
}: RhythmAnswerScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 测量结果同时供绘谱和选择区域使用；切换选中小节不重新排版。
  const score = useMemo(() => {
    let x = 10;
    const preparedMeasures = [];
    for (const [index, events] of measures.entries()) {
      const notes = events.map(rhythmEventToVexFlowStaveNote);
      const beams = getBeatBeamGroups(events).map(
        (indexes) => new Beam(indexes.map((noteIndex) => notes[noteIndex])),
      );
      const stave = new Stave(x, 40, 280);
      if (index === 0) stave.addClef("treble").addTimeSignature("4/4");
      else stave.setBegBarType(BarlineType.NONE);
      if (index === measures.length - 1) stave.setEndBarType(BarlineType.END);

      const voice = new Voice().setStrict(false).addTickables(notes);
      const noteWidth =
        notes.length > 0
          ? new Formatter()
              .joinVoices([voice])
              .preCalculateMinTotalWidth([voice])
          : 0;
      // 谱号、拍号和右边界占用空间；额外留出音符的阅读间距。
      const notationPadding = stave.getNoteStartX() - x + 30;
      const width = Math.ceil(
        Math.max(
          280,
          notationPadding + Math.max(noteWidth + 40, notes.length * 30),
        ),
      );
      stave.setWidth(width);
      const measure = { x, width, stave, notes, beams };
      x += width;
      preparedMeasures.push(measure);
    }
    return { measures: preparedMeasures, width: x + 10, height: 180 };
  }, [measures]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(score.width, score.height);
    const context = renderer.getContext();
    score.measures.forEach(({ stave, notes, beams }) => {
      stave.setContext(context).draw();
      // 宽松排版允许空小节和未填满的小节，不补休止符。
      if (notes.length > 0) Formatter.FormatAndDraw(context, stave, notes);
      beams.forEach((beam) => beam.setContext(context).draw());
    });

    // 同时兼容卸载与开发模式的 Effect 重建，避免留下重复 SVG。
    return () => container.replaceChildren();
  }, [score]);

  return (
    <div style={{ maxWidth: "100%", overflowX: "auto" }}>
      <div
        style={{
          position: "relative",
          width: score.width,
          height: score.height,
        }}
      >
        <div role="group" aria-label="选择答题小节">
          {score.measures.map(({ x, width }, index) => (
            <button
              key={index}
              type="button"
              aria-label={`小节 ${index + 1}`}
              aria-pressed={index === selectedMeasureIndex}
              onClick={() => onSelectMeasure(index)}
              style={{
                position: "absolute",
                left: x,
                top: 10,
                width,
                height: score.height - 20,
                padding: 0,
                border: 0,
                borderRadius: 0,
                outlineOffset: -3,
                backgroundColor:
                  index === selectedMeasureIndex ? "#f0efff" : "transparent",
              }}
            />
          ))}
        </div>
        {/* 谱线画在选择背景上方；点击穿透到按钮，两层一起滚动。 */}
        <div
          className="rhythm-answer-notation"
          ref={containerRef}
          aria-hidden="true"
          style={{ position: "relative", pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}
