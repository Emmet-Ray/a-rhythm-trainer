import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BarlineType, Beam, Formatter, Renderer, Tuplet, Voice } from "vexflow";

import {
  rhythmEventToDurationInQuarterNotes,
  expandRhythmElements,
  TICKS_PER_QUARTER,
  type RhythmElement,
  type RhythmEvent,
  type RhythmExercise,
} from "./RhythmModel";
import { createRhythmStave, rhythmEventToVexFlowStaveNote } from "./RhythmNotation";
import { getBeatBeamGroups } from "./RhythmScoreLayout";
import { createCountInTimeline } from "./RhythmTiming";
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
 * 判断小节的记谱是否一致，不修改输入；三连音保留组边界并比较组内音符。
 * 空白答案不通过；其余按数量、顺序、kind、noteValue 和 dots 比较。
 * dots 省略等同于 0，不接受仅总时值相同的不同写法。
 * expected 应为已校验的标准小节；本函数不负责拍数校验或三连音组展开。
 */
// eslint-disable-next-line react-refresh/only-export-components -- 与听写组件同文件维护，导出纯函数供测试；修改此导出时可能触发完整刷新。
export function isMeasureAnswerCorrect(
  answer: readonly RhythmElement[],
  expected: readonly RhythmElement[],
): boolean {
  if (answer.length === 0 || answer.length !== expected.length) return false;

  return answer.every((event, index) => {
    const target = expected[index];
    if (event.kind === "triplet" || target.kind === "triplet") {
      return event.kind === "triplet" && target.kind === "triplet"
        && event.notes.length === 3 && target.notes.length === 3
        && isMeasureAnswerCorrect(event.notes, target.notes);
    }
    return event.kind === target.kind
      && event.noteValue === target.noteValue
      && (event.dots ?? 0) === (target.dots ?? 0);
  });
}

type RhythmDictationProps = {
  exercise: RhythmExercise;
  bpm: number;
};

/** 题目与草稿共用的播放时间线。未填满/空小节保留完整时长，不修改或补写草稿。 */
// eslint-disable-next-line react-refresh/only-export-components -- 与听写播放器共置，导出纯函数供测试。
export function createDictationPlaybackTimeline(
  measures: readonly (readonly RhythmElement[])[],
  timeSignature: RhythmExercise["timeSignature"],
  bpm: number,
) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("BPM 必须为正数。");
  const beatMs = 60000 / bpm;
  const measureTicks = timeSignature.beats * (4 / timeSignature.beatType) * TICKS_PER_QUARTER;
  const notes: { startOffsetMs: number; endOffsetMs: number }[] = [];
  measures.forEach((elements, index) => {
    const expanded = expandRhythmElements(elements);
    if (expanded.durationTicks > measureTicks) throw new Error(`第 ${index + 1} 小节超出允许的拍数。`);
    expanded.events.forEach(({ event, startTick, durationTicks }) => {
      if (event.kind !== "note") return;
      const start = index * measureTicks + startTick;
      notes.push({
        startOffsetMs: start / TICKS_PER_QUARTER * beatMs,
        endOffsetMs: (start + durationTicks) / TICKS_PER_QUARTER * beatMs,
      });
    });
  });
  return {
    notes,
    durationMs: measures.length * measureTicks / TICKS_PER_QUARTER * beatMs,
    ...createCountInTimeline(timeSignature, bpm),
  };
}

type MeasureVerdict = "unchecked" | "correct" | "incorrect";

// 输入按钮与题目支持检查共用这一列表，避免出现题目可验证却无法填写的情况。
const answerEventOptions = [
  { kind: "note", noteValue: "whole", label: "全音符" },
  { kind: "note", noteValue: "half", label: "二分音符" },
  { kind: "note", noteValue: "quarter", label: "四分音符" },
  { kind: "note", noteValue: "eighth", label: "八分音符" },
  { kind: "note", noteValue: "sixteenth", label: "十六分音符" },
  { kind: "rest", noteValue: "whole", label: "全休止符" },
  { kind: "rest", noteValue: "half", label: "二分休止符" },
  { kind: "rest", noteValue: "quarter", label: "四分休止符" },
  { kind: "rest", noteValue: "eighth", label: "八分休止符" },
  { kind: "rest", noteValue: "sixteenth", label: "十六分休止符" },
] as const;

// 按主题逐步开放附点范围；按钮和标准答案检查遵守相同规则。
function canToggleDot(event: RhythmElement): event is RhythmEvent {
  return event.kind === "note"
    && (event.noteValue === "quarter" || event.noteValue === "eighth");
}

// 一次挂载对应一道题；调用方换题时通过 key 重建，清空答案和交互状态。
export function RhythmDictation({ exercise, bpm }: RhythmDictationProps) {
  const measureBeats = exercise.timeSignature.beats * (4 / exercise.timeSignature.beatType);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const [playbackScope, setPlaybackScope] = useState<"all" | "measure">("all");
  const [addEventMessage, setAddEventMessage] = useState("");
  const [isReferenceAnswerVisible, setIsReferenceAnswerVisible] = useState(false);
  const referenceAnswerId = useId();
  const referenceMeasures = useMemo(() => exercise.measures.map(({ elements }) => elements), [exercise]);
  // 只取标准答案的小节数量，绝不把标准答案的音符复制到草稿。
  const [answerMeasures, setAnswerMeasures] = useState<RhythmElement[][]>(() =>
    exercise.measures.map(() => []),
  );
  const hasSelectedMeasure = answerMeasures[selectedMeasureIndex] !== undefined;
  const lastEvent = answerMeasures[selectedMeasureIndex]?.at(-1);
  const canToggleLastDot = lastEvent !== undefined && canToggleDot(lastEvent);
  const lastHasDot = lastEvent?.kind !== "triplet" && lastEvent?.dots === 1;
  const usedTicks = expandRhythmElements(answerMeasures[selectedMeasureIndex] ?? []).durationTicks;
  const [measureVerdicts, setMeasureVerdicts] = useState<MeasureVerdict[]>(() =>
    exercise.measures.map(() => "unchecked"),
  );
  // 不把编辑器尚不能作答的题判成用户错误。
  const expectedMeasures = useMemo(() => exercise.measures.map(({ elements }) => {
    if (elements.every((event) => event.kind === "triplet"
      ? event.notes.length === 3 && event.notes.every((note) =>
        note.kind === "note" && note.noteValue === "eighth" && (note.dots ?? 0) === 0)
      : (event.kind === "note" || event.kind === "rest")
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

  function addElement(newElement: RhythmElement) {
    if (!hasSelectedMeasure) return;
    const nextElements = [...answerMeasures[selectedMeasureIndex], newElement];
    if (expandRhythmElements(nextElements).durationTicks > measureBeats * TICKS_PER_QUARTER) {
      setAddEventMessage("添加这个符号会超出当前小节允许的拍数。");
      return;
    }

    setAddEventMessage("");
    clearSelectedVerdict();
    setAnswerMeasures((previous) =>
      previous.map((events, index) =>
        index === selectedMeasureIndex ? nextElements : events,
      ),
    );
  }

  function toggleLastDot() {
    if (!lastEvent || !canToggleDot(lastEvent)) return;
    const updatedEvent: RhythmEvent = { ...lastEvent, dots: lastEvent.dots === 1 ? 0 : 1 };
    const usedBeats = usedTicks / TICKS_PER_QUARTER;
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
    <div className="rhythm-dictation">
      <div className="dictation-playbar">
        {/* 只重建播放器：切换范围/小节取消旧排程，草稿和验证结果仍保留。 */}
        <RhythmDictationPlayback
          key={`${bpm}-${playbackScope}-${selectedMeasureIndex}`}
          exercise={playbackScope === "all" ? exercise : {
            ...exercise,
            measures: exercise.measures.slice(selectedMeasureIndex, selectedMeasureIndex + 1),
          }}
          bpm={bpm}
          answerMeasures={playbackScope === "all" ? answerMeasures : answerMeasures.slice(selectedMeasureIndex, selectedMeasureIndex + 1)}
        />
        <div className="dictation-scope" role="group" aria-label="播放范围">
          <span>范围</span>
          <div className="dictation-scope-options">
            {(["all", "measure"] as const).map((scope) => (
              <button key={scope} type="button" aria-pressed={playbackScope === scope} onClick={() => setPlaybackScope(scope)}>
                {scope === "all" ? "整题" : "当前小节"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <RhythmAnswerScore
        measures={answerMeasures}
        timeSignature={exercise.timeSignature}
        selectedMeasureIndex={selectedMeasureIndex}
        onSelectMeasure={(index) => {
          setSelectedMeasureIndex(index);
          setAddEventMessage("");
        }}
      />
      <div className="dictation-editor">
      <p className="dictation-current-measure">当前小节：{selectedMeasureIndex + 1}</p>
      <div
        role="group"
        aria-label="添加音符"
        className="dictation-symbol-row"
      >
        <span className="dictation-row-label">音符</span>
        <div className="dictation-symbol-buttons">
        {answerEventOptions.filter((option) => option.kind === "note").map((option) => (
          <button key={`${option.kind}-${option.noteValue}`} type="button" disabled={!hasSelectedMeasure} onClick={() => addElement({ kind: option.kind, noteValue: option.noteValue })}>
            {option.label}
          </button>
        ))}

        <button type="button" disabled={!hasSelectedMeasure} onClick={() => addElement({
          kind: "triplet",
          notes: [
            { kind: "note", noteValue: "eighth" },
            { kind: "note", noteValue: "eighth" },
            { kind: "note", noteValue: "eighth" },
          ],
        })}>
          小三连
        </button>
        </div>
      </div>

      <div
        role="group"
        aria-label="添加休止符"
        className="dictation-symbol-row"
      >
        <span className="dictation-row-label">休止符</span>
        <div className="dictation-symbol-buttons">
        {answerEventOptions.filter((option) => option.kind === "rest").map((option) => (
          <button key={`${option.kind}-${option.noteValue}`} type="button" disabled={!hasSelectedMeasure} onClick={() => addElement({ kind: option.kind, noteValue: option.noteValue })}>
            {option.label}
          </button>
        ))}
        </div>
      </div>

      <div
        role="group"
        aria-label="修改当前小节末尾"
        className="dictation-edit-actions"
      >
        <button
          type="button"
          disabled={!canToggleLastDot}
          aria-pressed={lastHasDot}
          title="切换当前小节末尾四分或八分音符的附点"
          onClick={toggleLastDot}
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
      <p className="dictation-input-message" role="status">{addEventMessage}</p>
      </div>
      <div className="dictation-verification">
        <div className="dictation-verification-result">
        <button className="dictation-verify" type="button" disabled={!hasSelectedMeasure || !expectedMeasure} onClick={verifySelectedMeasure}>
          验证当前小节
        </button>
        <span role="status" aria-label="当前小节验证结果">
          {selectedVerdict === "correct" ? "正确" : selectedVerdict === "incorrect" ? "有错误" : ""}
        </span>
        </div>
        <button
          type="button"
          aria-expanded={isReferenceAnswerVisible}
          aria-controls={referenceAnswerId}
          onClick={() => setIsReferenceAnswerVisible((previous) => !previous)}
        >
          {isReferenceAnswerVisible ? "收起答案" : "查看答案"}
        </button>
      </div>
      {expectedMeasures.some((measure) => measure === null) && (
        <p role="alert">本题包含当前编辑器暂不支持的节奏，暂时无法完成作答。</p>
      )}
      <p className="dictation-completion" role="status" aria-label="整题完成状态">{isComplete ? "本题完成" : ""}</p>
      <section className="dictation-reference" id={referenceAnswerId} aria-label="参考答案" hidden={!isReferenceAnswerVisible}>
        {isReferenceAnswerVisible && (
          <>
            <h3>参考答案</h3>
            <RhythmAnswerScore measures={referenceMeasures} timeSignature={exercise.timeSignature} />
          </>
        )}
      </section>
    </div>
  );
}

// 两个入口共用声源和请求序号，互斥播放；每次点击固定一份时间线，不随草稿编辑改变。
function RhythmDictationPlayback({ exercise, bpm, answerMeasures }: RhythmDictationProps & {
  answerMeasures: readonly (readonly RhythmElement[])[];
}) {
  const [status, setStatus] = useState<"idle" | "starting" | "countIn" | "playing" | "finished">("idle");
  const [error, setError] = useState<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef<"question" | "answer" | null>(null);
  const [playbackSource, setPlaybackSource] = useState<"question" | "answer">("question");

  const cancelPlayback = useCallback(() => {
    // resume 尚未完成时也能取消；旧请求恢复后不得再安排声音。
    requestRef.current += 1;
    activeRef.current = null;
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

  async function togglePlayback(source: "question" | "answer") {
    if (activeRef.current === source) {
      cancelPlayback();
      setStatus("idle");
      return;
    }
    // 新一轮开始前清理上一轮尚未结束的自然尾音。
    cancelPlayback();
    activeRef.current = source;
    setPlaybackSource(source);
    const request = ++requestRef.current;
    setStatus("starting");
    setError(null);
    try {
      const measures = source === "question" ? exercise.measures.map(({ elements }) => elements) : answerMeasures;
      const timeline = createDictationPlaybackTimeline(measures, exercise.timeSignature, bpm);
      const context = contextRef.current ?? (contextRef.current = new AudioContext());
      await Promise.all([context.resume(), prepareTapSound(context)]);
      if (request !== requestRef.current) return;
      const clock = createPracticeClock(context, timeline.countInDurationMs);
      timeline.countInOffsetsMs.forEach((offset, index) => {
        scheduleCountIn(context, clock.audioTimeAt(offset), index === 0, sourcesRef.current);
      });
      timeline.notes.forEach((note) => {
        scheduleTapSound(
          context,
          clock.audioTimeAt(note.startOffsetMs),
          clock.audioTimeAt(note.endOffsetMs),
          sourcesRef.current,
        );
      });
      // 末尾休止符同样占时，不能以“最后一声播完”作为整题结束。
      const endsAtMs = timeline.durationMs;
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
    <div className="dictation-playback">
      <div className="dictation-playback-buttons">
      <button type="button" onClick={() => void togglePlayback("question")}>
        {isActive && playbackSource === "question" ? "停止题目" : "播放题目"}
      </button>
      <button
        type="button"
        disabled={!(isActive && playbackSource === "answer") && answerMeasures.every((elements) => elements.length === 0)}
        onClick={() => void togglePlayback("answer")}
      >
        {isActive && playbackSource === "answer" ? "停止答案" : "播放我的答案"}
      </button>
      </div>
      <span className="dictation-playback-status" role="status">{text}</span>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

type RhythmAnswerScoreProps = {
  measures: readonly (readonly RhythmElement[])[];
  timeSignature: RhythmExercise["timeSignature"];
  selectedMeasureIndex?: number;
  onSelectMeasure?: (index: number) => void;
};

// 原样显示草稿或参考答案，不自动补休止符；未传选择回调时仅展示谱面。
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
    for (const [index, elements] of measures.entries()) {
      const expanded = expandRhythmElements(elements);
      const notes = expanded.events.map(({ event }) => rhythmEventToVexFlowStaveNote(event));
      // 三连音比例会改变排版时值，必须在测量之前关联，草稿仍保留组结构。
      const tuplets = expanded.tripletGroups.map((indexes) => new Tuplet(
        indexes.map((noteIndex) => notes[noteIndex]),
        { numNotes: 3, notesOccupied: 2, bracketed: false },
      ));
      const beams = getBeatBeamGroups(elements).map(
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
      const measure = { x, width, stave, notes, beams, tuplets };
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
    score.measures.forEach(({ stave, notes, beams, tuplets }) => {
      stave.setContext(context).draw();
      // 宽松排版允许空小节和未填满的小节，不补休止符。
      if (notes.length > 0) Formatter.FormatAndDraw(context, stave, notes);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
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
        {onSelectMeasure && <div role="group" aria-label="选择答题小节">
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
        </div>}
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
