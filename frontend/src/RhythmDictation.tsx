import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarlineType, Beam, Formatter, Renderer, Voice } from "vexflow";

import {
  rhythmEventToDurationInQuarterNotes,
  type RhythmEvent,
  type RhythmExercise,
} from "./RhythmModel";
import { createRhythmStave, rhythmEventToVexFlowStaveNote } from "./RhythmNotation";
import { getBeatBeamGroups } from "./RhythmScoreLayout";
import { createExerciseTimeline } from "./RhythmTiming";
import { createPracticeClock, prepareTapSound, scheduleCountIn, scheduleTapSound } from "./RhythmAudio";

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
/**
 * 判断普通音符/休止符小节的记谱是否一致，不修改输入。
 * 空白答案不通过；其余按数量、顺序、kind、noteValue 和 dots 比较。
 * dots 省略等同于 0，不接受仅总时值相同的不同写法。
 * expected 应为已校验的标准小节；本函数不负责拍数校验或三连音组展开。
 */
// eslint-disable-next-line react-refresh/only-export-components -- 与听写组件同文件维护，导出纯函数供测试；修改此导出时可能触发完整刷新。
export function isMeasureAnswerCorrect(
  answer: readonly RhythmEvent[],
  expected: readonly RhythmEvent[],
): boolean {
  if (answer.length === 0 || answer.length !== expected.length) return false;

  return answer.every((event, index) => {
    const target = expected[index];
    return event.kind === target.kind
      && event.noteValue === target.noteValue
      && (event.dots ?? 0) === (target.dots ?? 0);
  });
}

type RhythmDictationProps = {
  exercise: RhythmExercise;
  bpm: number;
};

type MeasureVerdict = "unchecked" | "correct" | "incorrect";

// 输入按钮与题目支持检查共用这一列表，避免出现题目可验证却无法填写的情况。
const answerEventOptions = [
  { kind: "note", noteValue: "whole", label: "全音符" },
  { kind: "note", noteValue: "half", label: "二分音符" },
  { kind: "note", noteValue: "quarter", label: "四分音符" },
  { kind: "note", noteValue: "eighth", label: "八分音符" },
  { kind: "rest", noteValue: "whole", label: "全休止符" },
  { kind: "rest", noteValue: "half", label: "二分休止符" },
  { kind: "rest", noteValue: "quarter", label: "四分休止符" },
  { kind: "rest", noteValue: "eighth", label: "八分休止符" },
] as const;

// 按主题逐步开放附点范围；按钮和标准答案检查遵守相同规则。
function canToggleDot(event: RhythmEvent): boolean {
  return event.kind === "note" && event.noteValue === "quarter";
}

// 一次挂载对应一道题；调用方换题时通过 key 重建，清空答案和交互状态。
export function RhythmDictation({ exercise, bpm }: RhythmDictationProps) {
  const measureBeats = exercise.timeSignature.beats * (4 / exercise.timeSignature.beatType);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const [addEventMessage, setAddEventMessage] = useState("");
  // 只取标准答案的小节数量，绝不把标准答案的音符复制到草稿。
  const [answerMeasures, setAnswerMeasures] = useState<RhythmEvent[][]>(() =>
    exercise.measures.map(() => []),
  );
  const hasSelectedMeasure = answerMeasures[selectedMeasureIndex] !== undefined;
  const lastEvent = answerMeasures[selectedMeasureIndex]?.at(-1);
  const canToggleLastDot = lastEvent !== undefined && canToggleDot(lastEvent);
  const [measureVerdicts, setMeasureVerdicts] = useState<MeasureVerdict[]>(() =>
    exercise.measures.map(() => "unchecked"),
  );
  // 不把编辑器尚不能作答的题判成用户错误。
  const expectedMeasures = useMemo(() => exercise.measures.map(({ elements }) => {
    if (elements.every((event): event is RhythmEvent =>
      (event.kind === "note" || event.kind === "rest")
      && answerEventOptions.some((option) => option.kind === event.kind && option.noteValue === event.noteValue)
      && ((event.dots ?? 0) === 0 || (event.dots === 1 && canToggleDot(event))),
    )) return elements;
    return null;
  }), [exercise]);
  const expectedMeasure = expectedMeasures[selectedMeasureIndex];
  const selectedVerdict = measureVerdicts[selectedMeasureIndex];
  const isComplete = measureVerdicts.length > 0
    && measureVerdicts.every((verdict) => verdict === "correct");

  function clearSelectedVerdict() {
    setMeasureVerdicts((previous) => previous.map((verdict, index) =>
      index === selectedMeasureIndex ? "unchecked" : verdict,
    ));
  }

  function verifySelectedMeasure() {
    if (!hasSelectedMeasure || !expectedMeasure) return;
    const correct = isMeasureAnswerCorrect(answerMeasures[selectedMeasureIndex], expectedMeasure);
    setAddEventMessage("");
    setMeasureVerdicts((previous) => previous.map((verdict, index) =>
      index === selectedMeasureIndex ? (correct ? "correct" : "incorrect") : verdict,
    ));
  }

  function addEvent({ kind, noteValue }: (typeof answerEventOptions)[number]) {
    if (!hasSelectedMeasure) return;
    const newEvent: RhythmEvent = {
      kind,
      noteValue,
    };

    const usedBeats = answerMeasures[selectedMeasureIndex].reduce(
      (total, event) => total + rhythmEventToDurationInQuarterNotes(event),
      0,
    );
    const excessBeats =
      usedBeats + rhythmEventToDurationInQuarterNotes(newEvent) - measureBeats;
    if (excessBeats > 0) {
      setAddEventMessage("添加这个符号会超出当前小节允许的拍数。");
      return;
    }

    setAddEventMessage("");
    clearSelectedVerdict();
    setAnswerMeasures((previous) =>
      previous.map((events, index) =>
        index === selectedMeasureIndex ? [...events, newEvent] : events,
      ),
    );
  }

  function toggleLastDot() {
    if (!lastEvent || !canToggleLastDot) return;
    const updatedEvent: RhythmEvent = { ...lastEvent, dots: lastEvent.dots === 1 ? 0 : 1 };
    const usedBeats = answerMeasures[selectedMeasureIndex].reduce(
      (total, event) => total + rhythmEventToDurationInQuarterNotes(event),
      0,
    );
    const updatedBeats = usedBeats - rhythmEventToDurationInQuarterNotes(lastEvent)
      + rhythmEventToDurationInQuarterNotes(updatedEvent);
    if (updatedBeats > measureBeats) {
      setAddEventMessage("添加附点会超出当前小节允许的拍数。");
      return;
    }

    setAddEventMessage("");
    clearSelectedVerdict();
    setAnswerMeasures((previous) => previous.map((events, index) =>
      index === selectedMeasureIndex
        ? [...events.slice(0, -1), updatedEvent]
        : events,
    ));
  }

  function removeLastEvent() {
    if (!hasSelectedMeasure || answerMeasures[selectedMeasureIndex].length === 0) return;
    setAddEventMessage("");
    clearSelectedVerdict();
    setAnswerMeasures((previous) =>
      previous.map((events, index) =>
        index === selectedMeasureIndex ? events.slice(0, -1) : events,
      ),
    );
  }

  return (
    <div>
      <RhythmQuestionPlayback key={bpm} exercise={exercise} bpm={bpm} />

      <RhythmAnswerScore
        measures={answerMeasures}
        timeSignature={exercise.timeSignature}
        selectedMeasureIndex={selectedMeasureIndex}
        onSelectMeasure={(index) => {
          setSelectedMeasureIndex(index);
          setAddEventMessage("");
        }}
      />
      <div
        role="group"
        aria-label="添加音符或休止符"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}
      >
        {answerEventOptions.map((option) => (
          <button key={`${option.kind}-${option.noteValue}`} type="button" disabled={!hasSelectedMeasure} onClick={() => addEvent(option)}>
            {option.label}
          </button>
        ))}

        <button
          type="button"
          disabled={!canToggleLastDot}
          aria-pressed={lastEvent?.dots === 1}
          title="切换当前小节末尾四分音符的附点"
          onClick={toggleLastDot}
          style={lastEvent?.dots === 1 ? { backgroundColor: "#efedff", borderColor: "#6558d3" } : undefined}
        >
          附点
        </button>

        <button
          type="button"
          disabled={!hasSelectedMeasure || answerMeasures[selectedMeasureIndex].length === 0}
          onClick={removeLastEvent}
        >
          删除末尾
        </button>
      </div>
      <p role="status">{addEventMessage}</p>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <button type="button" disabled={!hasSelectedMeasure || !expectedMeasure} onClick={verifySelectedMeasure}>
          验证当前小节
        </button>
        <span role="status" aria-label="当前小节验证结果">
          {selectedVerdict === "correct" ? "正确" : selectedVerdict === "incorrect" ? "有错误" : ""}
        </span>
      </div>
      {expectedMeasures.some((measure) => measure === null) && (
        <p role="alert">本题包含当前编辑器暂不支持的节奏，暂时无法完成作答。</p>
      )}
      <p role="status" aria-label="整题完成状态">{isComplete ? "本题完成" : ""}</p>
    </div>
  );
}

// 播放只读取标准答案，不接触草稿、谱面高亮或击拍判定。
function RhythmQuestionPlayback({ exercise, bpm }: RhythmDictationProps) {
  const [status, setStatus] = useState<"idle" | "starting" | "countIn" | "playing" | "finished">("idle");
  const [error, setError] = useState<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef(false);

  const cancelPlayback = useCallback(() => {
    // resume 尚未完成时也能取消；旧请求恢复后不得再安排声音。
    requestRef.current += 1;
    activeRef.current = false;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sourcesRef.current.forEach((source) => source.stop());
    sourcesRef.current = [];
  }, []);

  useEffect(() => () => {
    cancelPlayback();
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }, [cancelPlayback]);

  async function togglePlayback() {
    if (activeRef.current) {
      cancelPlayback();
      setStatus("idle");
      return;
    }
    // 新一轮开始前清理上一轮尚未结束的自然尾音。
    cancelPlayback();
    activeRef.current = true;
    const request = ++requestRef.current;
    setStatus("starting");
    setError(null);
    try {
      // 复用标准答案时间线；这里只取音乐时值，不使用命中窗口或判定结束时间。
      const timeline = createExerciseTimeline(exercise, bpm, 3, { perfectMs: 50, hitMs: 150 });
      const context = contextRef.current ?? (contextRef.current = new AudioContext());
      await Promise.all([context.resume(), prepareTapSound(context)]);
      if (request !== requestRef.current) return;
      const clock = createPracticeClock(context, timeline.countInDurationMs);
      timeline.countInOffsetsMs.forEach((offset, index) => {
        scheduleCountIn(context, clock.audioTimeAt(offset), index === 0, sourcesRef.current);
      });
      timeline.targetTaps.forEach((target) => {
        scheduleTapSound(
          context,
          clock.audioTimeAt(target.offsetMs),
          clock.audioTimeAt(timeline.eventEndOffsetsMs[target.eventIndex]),
          sourcesRef.current,
        );
      });
      // 末尾休止符同样占时，不能以“最后一声播完”作为整题结束。
      const endsAtMs = timeline.eventEndOffsetsMs.at(-1) ?? 0;
      function update() {
        if (request !== requestRef.current) return;
        const nowMs = clock.nowMs();
        if (nowMs >= endsAtMs) {
          // 声音已按各自终点归零，这里收尾，不等待采样的长尾音。
          cancelPlayback();
          setStatus("finished");
          return;
        }
        setStatus(nowMs < 0 ? "countIn" : "playing");
        frameRef.current = requestAnimationFrame(update);
      }
      frameRef.current = requestAnimationFrame(update);
    } catch {
      if (request !== requestRef.current) return;
      cancelPlayback();
      setStatus("idle");
      setError("无法播放声音，请重试。");
    }
  }

  const isActive = status === "starting" || status === "countIn" || status === "playing";
  const text = status === "starting" ? "准备中" : status === "countIn" ? "预备拍"
    : status === "playing" ? "播放中" : status === "finished" ? "播放结束" : "";
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
      <button type="button" onClick={() => void togglePlayback()}>
        {isActive ? "停止" : "播放题目"}
      </button>
      <span role="status">{text}</span>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

type RhythmAnswerScoreProps = {
  measures: readonly (readonly RhythmEvent[])[];
  timeSignature: RhythmExercise["timeSignature"];
  selectedMeasureIndex: number;
  onSelectMeasure: (index: number) => void;
};

// 原样显示答案草稿，不自动补休止符；填写拍数限制由上层处理。
function RhythmAnswerScore({
  measures,
  timeSignature,
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
      const stave = createRhythmStave(x, 40, 280, index === 0);
      if (index === 0) stave.addTimeSignature(`${timeSignature.beats}/${timeSignature.beatType}`);
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
  }, [measures, timeSignature.beats, timeSignature.beatType]);

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
