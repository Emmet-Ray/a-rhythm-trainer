import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { RhythmEditor, canEditRhythmElements, type RhythmEditorHandle } from "./RhythmEditor";
import { RhythmDraftScore } from "../rhythm/notation/RhythmDraftScore";

import {
  expandRhythmElements,
  TICKS_PER_QUARTER,
  type RhythmElement,
  type RhythmExercise,
} from "../rhythm/RhythmModel";
import { createCountInTimeline } from "../rhythm/RhythmTiming";
import {
  createPracticeClock,
  createMetronome,
  prepareTapSound,
  prepareMetronomeSound,
  scheduleCountIn,
  scheduleTapSound,
  type Metronome,
} from "../rhythm/RhythmAudio";

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
      return (
        event.kind === "triplet" &&
        target.kind === "triplet" &&
        event.notes.length === 3 &&
        target.notes.length === 3 &&
        isMeasureAnswerCorrect(event.notes, target.notes)
      );
    }
    return (
      event.kind === target.kind &&
      event.noteValue === target.noteValue &&
      (event.dots ?? 0) === (target.dots ?? 0)
    );
  });
}

type RhythmDictationProps = {
  exercise: RhythmExercise | null;
  bpm: number;
  metronomeEnabled?: boolean;
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
  const measureTicks =
    timeSignature.beats * (4 / timeSignature.beatType) * TICKS_PER_QUARTER;
  const notes: { startOffsetMs: number; endOffsetMs: number }[] = [];
  measures.forEach((elements, index) => {
    const expanded = expandRhythmElements(elements);
    if (expanded.durationTicks > measureTicks)
      throw new Error(`第 ${index + 1} 小节超出允许的拍数。`);
    expanded.events.forEach(({ event, startTick, durationTicks }) => {
      if (event.kind !== "note") return;
      const start = index * measureTicks + startTick;
      notes.push({
        startOffsetMs: (start / TICKS_PER_QUARTER) * beatMs,
        endOffsetMs: ((start + durationTicks) / TICKS_PER_QUARTER) * beatMs,
      });
    });
  });
  return {
    notes,
    durationMs: ((measures.length * measureTicks) / TICKS_PER_QUARTER) * beatMs,
    ...createCountInTimeline(timeSignature, bpm),
  };
}

type MeasureVerdict = "unchecked" | "correct" | "incorrect";

// 核心的节奏听写组件
// 一次挂载对应一道题；调用方换题时通过 key 重建，清空答案和交互状态。
export function RhythmDictation({
  exercise,
  bpm,
  metronomeEnabled = true,
}: RhythmDictationProps) {
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const editorRef = useRef<RhythmEditorHandle>(null);
  const [playbackScope, setPlaybackScope] = useState<"all" | "measure">("all");
  const [isReferenceAnswerVisible, setIsReferenceAnswerVisible] =
    useState(false);
  const referenceAnswerId = useId();
  const referenceMeasures = useMemo(
    () => exercise?.measures.map(({ elements }) => elements) ?? [],
    [exercise],
  );
  // 只取标准答案的小节数量，绝不把标准答案的音符复制到草稿。
  const [answerMeasures, setAnswerMeasures] = useState<RhythmElement[][]>(() =>
    exercise?.measures.map(() => []) ?? [],
  );
  const hasSelectedMeasure = answerMeasures[selectedMeasureIndex] !== undefined;
  const [measureVerdicts, setMeasureVerdicts] = useState<MeasureVerdict[]>(() =>
    exercise?.measures.map(() => "unchecked") ?? [],
  );
  // 不把编辑器尚不能作答的题判成用户错误。
  const expectedMeasures = useMemo(
    () =>
      exercise?.measures.map(({ elements }) => {
        if (canEditRhythmElements(elements)) return elements;
        return null;
      }) ?? [],
    [exercise],
  );
  const expectedMeasure = expectedMeasures[selectedMeasureIndex];
  const selectedVerdict = measureVerdicts[selectedMeasureIndex];
  const isComplete =
    measureVerdicts.length > 0 &&
    measureVerdicts.every((verdict) => verdict === "correct");

  function verifySelectedMeasure() {
    if (!hasSelectedMeasure || !expectedMeasure) return;
    editorRef.current?.clearMessage();
    const correct = isMeasureAnswerCorrect(
      answerMeasures[selectedMeasureIndex],
      expectedMeasure,
    );
    setMeasureVerdicts((previous) =>
      previous.map((verdict, index) =>
        index === selectedMeasureIndex
          ? correct
            ? "correct"
            : "incorrect"
          : verdict,
      ),
    );
  }


  return (
    <div className="rhythm-dictation">
      <div className="dictation-playbar">
        {/* 只重建播放器：切换范围/小节取消旧排程，草稿和验证结果仍保留。 */}
        <RhythmDictationPlayback
          metronomeEnabled={metronomeEnabled}
          key={`${bpm}-${playbackScope}-${selectedMeasureIndex}`}
          exercise={
            !exercise || playbackScope === "all"
              ? exercise
              : {
                  ...exercise,
                  measures: exercise.measures.slice(
                    selectedMeasureIndex,
                    selectedMeasureIndex + 1,
                  ),
                }
          }
          bpm={bpm}
          answerMeasures={
            playbackScope === "all"
              ? answerMeasures
              : answerMeasures.slice(
                  selectedMeasureIndex,
                  selectedMeasureIndex + 1,
                )
          }
        />
        <div className="dictation-scope" role="group" aria-label="播放范围">
          <span>范围</span>
          <div className="dictation-scope-options">
            {(["all", "measure"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                aria-pressed={playbackScope === scope}
                disabled={!exercise}
                onClick={() => setPlaybackScope(scope)}
              >
                {scope === "all" ? "整题" : "当前小节"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <RhythmEditor
        ref={editorRef}
        emptyContent={<div className="empty-practice-score" role="status">请先生成题目</div>}
        measures={answerMeasures}
        timeSignature={exercise?.timeSignature ?? { beats: 4, beatType: 4 }}
        selectedMeasureIndex={selectedMeasureIndex}
        onSelectMeasure={setSelectedMeasureIndex}
        onChange={(measureIndex, elements) => {
          setAnswerMeasures((previous) => previous.map((measure, index) =>
            index === measureIndex ? elements : measure,
          ));
          setMeasureVerdicts((previous) => previous.map((verdict, index) =>
            index === measureIndex ? "unchecked" : verdict,
          ));
        }}
      />
      <div className="dictation-verification">
        <div className="dictation-verification-result">
          <button
            className="dictation-verify"
            type="button"
            disabled={!hasSelectedMeasure || !expectedMeasure}
            onClick={verifySelectedMeasure}
          >
            验证当前小节
          </button>
          <span role="status" aria-label="当前小节验证结果">
            {selectedVerdict === "correct"
              ? "正确"
              : selectedVerdict === "incorrect"
                ? "有错误"
                : ""}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={isReferenceAnswerVisible}
          disabled={!exercise}
          aria-controls={referenceAnswerId}
          onClick={() => setIsReferenceAnswerVisible((previous) => !previous)}
        >
          {isReferenceAnswerVisible ? "收起答案" : "查看答案"}
        </button>
      </div>
      {expectedMeasures.some((measure) => measure === null) && (
        <p role="alert">本题包含当前编辑器暂不支持的节奏，暂时无法完成作答。</p>
      )}
      <p
        className="dictation-completion"
        role="status"
        aria-label="整题完成状态"
      >
        {isComplete ? "本题完成" : ""}
      </p>
      <section
        className="dictation-reference"
        id={referenceAnswerId}
        aria-label="参考答案"
        hidden={!isReferenceAnswerVisible}
      >
        {isReferenceAnswerVisible && exercise && (
          <>
            <h3>参考答案</h3>
            <RhythmDraftScore
              measures={referenceMeasures}
              timeSignature={exercise.timeSignature}
            />
          </>
        )}
      </section>
    </div>
  );
}

// 两个入口共用声源和请求序号，互斥播放；每次点击固定一份时间线，不随草稿编辑改变。
function RhythmDictationPlayback({
  exercise,
  bpm,
  answerMeasures,
  metronomeEnabled = true,
}: RhythmDictationProps & {
  answerMeasures: readonly (readonly RhythmElement[])[];
}) {
  const [status, setStatus] = useState<
    "idle" | "starting" | "countIn" | "playing" | "finished"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const metronomeRef = useRef<Metronome | null>(null);
  const metronomeEnabledRef = useRef(metronomeEnabled);
  useEffect(() => {
    metronomeEnabledRef.current = metronomeEnabled;
    metronomeRef.current?.setEnabled(metronomeEnabled);
  }, [metronomeEnabled]);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef<"question" | "answer" | null>(null);
  const [playbackSource, setPlaybackSource] = useState<"question" | "answer">(
    "question",
  );

  const cancelPlayback = useCallback(() => {
    metronomeRef.current?.dispose();
    metronomeRef.current = null;
    // resume 尚未完成时也能取消；旧请求恢复后不得再安排声音。
    requestRef.current += 1;
    activeRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sourcesRef.current.forEach((source) => source.stop());
    sourcesRef.current = [];
  }, []);

  useEffect(
    () => () => {
      cancelPlayback();
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    },
    [cancelPlayback],
  );

  async function togglePlayback(source: "question" | "answer") {
    if (!exercise) return;
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
      const measures =
        source === "question"
          ? exercise.measures.map(({ elements }) => elements)
          : answerMeasures;
      const timeline = createDictationPlaybackTimeline(
        measures,
        exercise.timeSignature,
        bpm,
      );
      const context =
        contextRef.current ?? (contextRef.current = new AudioContext());
      await Promise.all([
        context.resume(),
        prepareTapSound(context),
        prepareMetronomeSound(context),
      ]);
      if (request !== requestRef.current) return;
      const clock = createPracticeClock(context, timeline.countInDurationMs);
      metronomeRef.current = createMetronome(
        context,
        clock,
        bpm,
        exercise.timeSignature.beats,
        timeline.durationMs,
      );
      metronomeRef.current.setEnabled(metronomeEnabledRef.current);
      timeline.countInOffsetsMs.forEach((offset, index) => {
        scheduleCountIn(
          context,
          clock.audioTimeAt(offset),
          index === 0,
          sourcesRef.current,
        );
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

  const isActive =
    status === "starting" || status === "countIn" || status === "playing";
  const text =
    status === "starting"
      ? "准备中"
      : status === "countIn"
        ? "预备拍"
        : status === "playing"
          ? "播放中"
          : status === "finished"
            ? "播放结束"
            : "";
  return (
    <div className="dictation-playback">
      <div className="dictation-playback-buttons">
        <button type="button" disabled={!exercise} onClick={() => void togglePlayback("question")}>
          {isActive && playbackSource === "question" ? "停止题目" : "播放题目"}
        </button>
        <button
          type="button"
          disabled={
            !(isActive && playbackSource === "answer") &&
            answerMeasures.every((elements) => elements.length === 0)
          }
          onClick={() => void togglePlayback("answer")}
        >
          {isActive && playbackSource === "answer"
            ? "停止答案"
            : "播放我的答案"}
        </button>
      </div>
      <span className="dictation-playback-status" role="status">
        {text}
      </span>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
