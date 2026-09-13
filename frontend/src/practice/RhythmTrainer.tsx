import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RhythmExercise } from "../rhythm/RhythmModel";
import RhythmScore from "../rhythm/notation/RhythmScore";
import {
  createExerciseTimeline,
  collectExpiredTargets,
  judgePractice,
  getPlaybackPosition,
  getTargetTimingWindow,
  summarizePractice,
  type PlaybackPosition,
  type TimingEvent,
  type TimingWindows,
} from "../rhythm/RhythmTiming";
import {
  createPracticeClock,
  createMetronome,
  type Metronome,
  scheduleCountIn,
  scheduleTapSound,
  playTapSound,
  prepareTapSound,
  prepareMetronomeSound,
  type PracticeClock,
} from "../rhythm/RhythmAudio";

type PlaybackMode = "practice" | "listen";

type PlaybackState = Omit<PlaybackPosition, "phase"> & {
  phase: "idle" | PlaybackPosition["phase"];
};
const IDLE_PLAYBACK: PlaybackState = {
  phase: "idle",
  countInBeat: 0,
  playingBeatIndex: 0,
};

export type RhythmTrainerProps = {
  exercise: RhythmExercise;
  bpm: number;
  timingWindows?: TimingWindows;
  /** 默认一小节的预备拍；显式传入 0 可关闭。 */
  countInBeatCount?: number;
  metronomeEnabled?: boolean;
};

const DEFAULT_TIMING_WINDOWS: TimingWindows = {
  perfectMs: 50,
  hitMs: 150,
};

function formatTimingEvent(timingEvent: TimingEvent): string {
  if (timingEvent.kind === "miss") {
    return "漏拍";
  }

  if (timingEvent.kind === "wrongTap") {
    return "误敲";
  }

  const absoluteErrorMs = Math.abs(timingEvent.errorMs).toFixed(0);
  if (timingEvent.grade === "perfect") {
    return `完美（误差 ${absoluteErrorMs}ms）`;
  }

  if (timingEvent.grade === "early") {
    return `快了 ${absoluteErrorMs}ms`;
  }

  return `慢了 ${absoluteErrorMs}ms`;
}

/**
 * 展示并运行一份节奏练习，内部管理击拍/试听、声音与判定。
 * 当前先支持本轮配置保持不变；播放中变更配置的停止/清理规则将在下一步接入。
 */
function RhythmTrainer({
  exercise,
  bpm,
  timingWindows = DEFAULT_TIMING_WINDOWS,
  countInBeatCount,
  metronomeEnabled = true,
}: RhythmTrainerProps) {
  const { perfectMs, hitMs } = timingWindows;
  // 按数值稳定判定配置，避免父组件传入等值新对象时重建回调和时间线。
  const effectiveTimingWindows = useMemo(
    () => ({ perfectMs, hitMs }),
    [perfectMs, hitMs],
  );
  const timeline = useMemo(
    () =>
      createExerciseTimeline(
        exercise,
        bpm,
        countInBeatCount,
        effectiveTimingWindows,
      ),
    [exercise, bpm, countInBeatCount, effectiveTimingWindows],
  );
  const targetTapTimeline = timeline.targetTaps;

  const [mode, setMode] = useState<PlaybackMode>("practice");
  const [playback, setPlayback] = useState<PlaybackState>(IDLE_PLAYBACK);
  const { phase, countInBeat, playingBeatIndex } = playback;
  const [timingEvents, setTimingEvents] = useState<TimingEvent[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const clockRef = useRef<PracticeClock | null>(null);
  const finishedRef = useRef(false);
  // 不捕获某一轮的时钟；状态变化只使当前轮的输入映射换段。
  const resetInputTime = useCallback(() => clockRef.current?.resetInputTime(), []);
  const metronomeRef = useRef<Metronome | null>(null);
  const metronomeEnabledRef = useRef(metronomeEnabled);
  useEffect(() => {
    metronomeEnabledRef.current = metronomeEnabled;
    metronomeRef.current?.setEnabled(metronomeEnabled);
  }, [metronomeEnabled]);
  // 仅缓存画面补漏进度；原始敲击才是判定依据，迟到输入到达时从头重算。
  const nextTargetIndexRef = useRef(0);
  const tapOffsetsRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scheduledSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const startingRef = useRef(false);
  const startRequestRef = useRef(0);

  const isRunning = phase === "countIn" || phase === "playing";
  const activeEventIndex =
    mode === "listen" && phase === "playing" ? playingBeatIndex : null;
  const latestTimingEvent = timingEvents.at(-1) ?? null;
  // 在状态更新后的渲染中结算，包含结束帧补上的漏拍；不另存结果 state。
  const result =
    mode === "practice" && phase === "finished"
      ? summarizePractice(targetTapTimeline.length, timingEvents)
      : null;

  const stopScheduledSounds = useCallback(() => {
    metronomeRef.current?.dispose();
    metronomeRef.current = null;
    for (const source of scheduledSourcesRef.current) {
      source.stop();
    }
    scheduledSourcesRef.current = [];
  }, []);

  // RAF 只增量补漏，不每帧重放全部输入；下一次敲击会替换这些暂定记录。
  const recordExpiredTargets = useCallback((nowMs: number) => {
    if (mode !== "practice") return;

    const misses = collectExpiredTargets(
      targetTapTimeline,
      nextTargetIndexRef.current,
      nowMs,
      effectiveTimingWindows,
    );
    if (misses.length > 0) {
      nextTargetIndexRef.current += misses.length;
      setTimingEvents((previous) => [...previous, ...misses]);
    }
  }, [mode, targetTapTimeline, effectiveTimingWindows]);

  let beatText: string | null = null;
  if (isStarting) {
    beatText = "准备中";
  } else if (phase === "countIn") {
    beatText = countInBeat < 0 ? "准备中" : `预备拍：${countInBeat + 1}`;
  } else if (mode === "listen" && phase === "playing") {
    beatText = "试听中";
  } else if (mode === "listen" && phase === "finished") {
    beatText = "试听结束";
  }

  useEffect(() => {
    if (!isRunning) return;
    let frameId: number;

    function update() {
      const clock = clockRef.current;
      if (clock === null) return;

      // RAF 只负责唤醒。忽略它提供的时间戳，唯一时间来源是音频时钟。
      const nowMs = clock.nowMs();
      recordExpiredTargets(nowMs);
      const position = getPlaybackPosition(timeline, nowMs);

      // 时间每帧变化，但只有显示的阶段或音符变化时才更新 state。
      setPlayback((previous) =>
        previous.phase === position.phase &&
        previous.countInBeat === position.countInBeat &&
        previous.playingBeatIndex === position.playingBeatIndex
          ? previous
          : position,
      );

      if (position.phase === "finished") {
        metronomeRef.current?.dispose();
        metronomeRef.current = null;
        // 保留本轮时钟，接受发生在终点前、却在结束帧之后才送达的输入。
        // 只修正结果，不重启播放。手动停止、新一轮和卸载仍立即废弃旧时钟。
        finishedRef.current = true;
        return;
      }
      frameId = window.requestAnimationFrame(update);
    }
    frameId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frameId);
  }, [isRunning, recordExpiredTargets, timeline]);

  useEffect(() => {
    // 结束时清理音频资源
    return () => {
      startRequestRef.current += 1;
      clockRef.current = null;
      stopScheduledSounds();
      const context = audioContextRef.current;
      audioContextRef.current = null;
      context?.removeEventListener("statechange", resetInputTime);
      if (context && context.state !== "closed") void context.close();
    };
  }, [stopScheduledSounds, resetInputTime]);

  async function handlePlay(requestedMode: PlaybackMode) {
    if (clockRef.current !== null && !finishedRef.current) {
      stopScheduledSounds();
      clockRef.current = null;
      nextTargetIndexRef.current = 0;
      setPlayback(IDLE_PLAYBACK);
      setTimingEvents([]);
      return;
    }
    // resume 是异步的；在等待期间阻止重复开始。
    if (startingRef.current) return;
    clockRef.current = null;
    finishedRef.current = false;
    startingRef.current = true;
    setIsStarting(true);
    setAudioError(null);
    const request = ++startRequestRef.current;

    try {
      if (audioContextRef.current === null) {
        audioContextRef.current = new AudioContext();
        audioContextRef.current.addEventListener("statechange", resetInputTime);
      }
      const context = audioContextRef.current;
      await Promise.all([context.resume(), prepareTapSound(context), prepareMetronomeSound(context)]);
      if (request !== startRequestRef.current) return;

      stopScheduledSounds();
      const clock = createPracticeClock(context, timeline.countInDurationMs);
      clockRef.current = clock;
      metronomeRef.current = createMetronome(context, clock, bpm, exercise.timeSignature.beats, timeline.eventEndOffsetsMs.at(-1) ?? 0);
      metronomeRef.current.setEnabled(metronomeEnabledRef.current);
      setMode(requestedMode);

      timeline.countInOffsetsMs.forEach((offsetMs, index) => {
        scheduleCountIn(
          context,
          clock.audioTimeAt(offsetMs),
          index === 0,
          scheduledSourcesRef.current,
        );
      });

      // 试听提前安排全部音符，与预备拍共用声源列表，停止时一起取消。
      // 使用请求参数，因为 setMode 不会改变本次函数执行中读到的 mode。
      if (requestedMode === "listen") {
        timeline.targetTaps.forEach((target) => {
          scheduleTapSound(
            context,
            clock.audioTimeAt(target.offsetMs),
            clock.audioTimeAt(timeline.eventEndOffsetsMs[target.eventIndex]),
            scheduledSourcesRef.current,
          );
        });
      }

      nextTargetIndexRef.current = 0;
      tapOffsetsRef.current = [];
      setTimingEvents([]);
      setPlayback(getPlaybackPosition(timeline, clock.nowMs()));
    } catch (error) {
      if (request !== startRequestRef.current) return;
      stopScheduledSounds();
      clockRef.current = null;
      setPlayback(IDLE_PLAYBACK);
      setAudioError(
        error instanceof Error ? error.message : "无法启动音频，请重试。",
      );
    } finally {
      if (request === startRequestRef.current) {
        startingRef.current = false;
        setIsStarting(false);
      }
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) return;
      // 外层配置控件和按钮保留自己的键盘行为，不把操作控件误记为击拍。
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          event.target.closest("input, select, textarea, button"))
      ) return;
      const clock = clockRef.current;
      const audioContext = audioContextRef.current;
      if (clock === null || audioContext === null) return;
      if (audioContext.state != "running") return;

      event.preventDefault();
      if (mode !== "practice") return;

      const tapOffsetMs = clock.inputTimeMs(event.timeStamp);
      if (tapOffsetMs === null) return;

      if (tapOffsetMs >= timeline.finishOffsetMs) {
        return;
      }

      if (tapOffsetMs < 0) {
        // 按发生顺序判断首次提前敲击，不能用 RAF 已推进的画面游标拒绝旧事件。
        const firstTarget = targetTapTimeline[0];
        if (
          firstTarget === undefined ||
          tapOffsetsRef.current.some(time => time < 0 && time <= tapOffsetMs)
        ) return;
        const { opensAtMs } = getTargetTimingWindow(
          firstTarget,
          effectiveTimingWindows,
        );
        if (tapOffsetMs < opensAtMs) return;
      }

      // 先立即发声，再重算判定；回放原始输入绝不触发声音。
      // 自然结束后补交的旧输入只纠正结果，不能在结束后再补响。
      const nowMs = clock.nowMs();
      if (!finishedRef.current && nowMs < timeline.finishOffsetMs) {
        playTapSound(audioContext, scheduledSourcesRef.current);
      }
      tapOffsetsRef.current.push(tapOffsetMs);
      const judgement = judgePractice(
        timeline,
        tapOffsetsRef.current,
        nowMs,
        effectiveTimingWindows,
      );

      nextTargetIndexRef.current = judgement.nextTargetIndex;
      setTimingEvents(judgement.events);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mode,
    timeline,
    targetTapTimeline,
    effectiveTimingWindows,
  ]);

  return (
    <div className="rhythm-trainer design-system">
      <RhythmScore
        exercise={exercise}
        activeEventIndex={activeEventIndex}
        timeline={timeline}
        timingEvents={timingEvents}
      />
      <div className="trainer-feedback" data-feedback={audioError ? "error" : result ? (result.passed ? "success" : "error") : isRunning && mode === "practice" && latestTimingEvent ? (latestTimingEvent.kind === "hit" ? "success" : "error") : "neutral"}>
        {beatText !== null && <div>{beatText}</div>}
        {mode === "practice" && isRunning && latestTimingEvent !== null && (
          <div>{formatTimingEvent(latestTimingEvent)}</div>
        )}
        {audioError && <div role="alert">{audioError}</div>}
        {result !== null && (
          <p role="status">{result.passed ? "通过" : "未通过"}</p>
        )}
      </div>

      <div className="trainer-actions">
        {/* 点击开始之后，该按钮变为停止状态，先播放预备拍，用户敲击键盘进行击拍练习 */}
        <button
          type="button"
          data-action={isRunning && mode === "practice" ? "stop" : "start"}
          disabled={isStarting || (isRunning && mode !== "practice")}
          onClick={(event) => {
            event.currentTarget.blur();
            void handlePlay("practice");
          }}
        >
          {isRunning && mode === "practice" ? "停止" : "击拍练习"}
        </button>
        {/* 点击试听之后，该按钮变为停止状态，先播放预备拍，然后系统自动播放击拍，高亮当前击拍音符，播放声音 */}
        <button
          type="button"
          data-action={isRunning && mode === "listen" ? "stop" : "listen"}
          disabled={isStarting || (isRunning && mode !== "listen")}
          onClick={(event) => {
            event.currentTarget.blur();
            void handlePlay("listen");
          }}
        >
          {isRunning && mode === "listen" ? "停止" : "试听"}
        </button>
      </div>
      <p className="keyboard-hint"><kbd>空格</kbd> 键敲击</p>
    </div>
  );
}

/** 未生成时只显示空谱和禁用操作，不建立时间线、键盘监听或音频资源。 */
export default function RhythmTrainerWorkspace(props: Omit<RhythmTrainerProps, "exercise"> & { exercise: RhythmExercise | null }) {
  if (props.exercise) return <RhythmTrainer {...props} exercise={props.exercise} />;
  return (
    <div className="rhythm-trainer design-system">
      <div className="empty-practice-score" role="region" aria-label="空白节奏乐谱">
        <svg width="100%" height="180" aria-hidden="true">
          <line x1="10%" x2="90%" y1="90" y2="90" stroke="currentColor" />
        </svg>
      </div>
      <div className="trainer-feedback" />
      <div className="trainer-actions">
        <button type="button" disabled>击拍练习</button>
        <button type="button" disabled>试听</button>
      </div>
      <p className="keyboard-hint"><kbd>空格</kbd> 键敲击</p>
    </div>
  );
}
