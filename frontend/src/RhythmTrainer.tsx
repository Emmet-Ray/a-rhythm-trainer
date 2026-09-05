import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RhythmExercise } from "./RhythmModel";
import RhythmScore from "./RhythmScore";
import {
  createExerciseTimeline,
  collectExpiredTargets,
  evaluateTap,
  getPlaybackPosition,
  getTargetTimingWindow,
  type PlaybackPosition,
  type TimingEvent,
  type TimingWindows,
} from "./RhythmTiming";
import {
  createPracticeClock,
  scheduleCountIn,
  scheduleTapSound,
  playTapSound,
  type PracticeClock,
} from "./RhythmAudio";

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
  countInBeatCount?: number;
};

const DEFAULT_TIMING_WINDOWS: TimingWindows = {
  perfectMs: 50,
  hitMs: 150,
};
const DEFAULT_COUNT_IN_BEAT_COUNT = 3;

function formatTimingEvent(timingEvent: TimingEvent | null): string {
  if (timingEvent === null) {
    return "等待敲击";
  }

  if (timingEvent.kind === "miss") {
    return "漏拍";
  }

  const absoluteErrorMs = Math.abs(timingEvent.errorMs).toFixed(0);
  if (timingEvent.kind === "tooEarly") {
    return `太早了 ${absoluteErrorMs}ms`;
  }

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
  countInBeatCount = DEFAULT_COUNT_IN_BEAT_COUNT,
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
  // 匹配游标只供事件处理使用，不直接决定画面；同步推进可避免连续敲击重复命中。
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

  const stopScheduledSounds = useCallback(() => {
    for (const source of scheduledSourcesRef.current) {
      source.stop();
    }
    scheduledSourcesRef.current = [];
  }, []);

  // 更新循环和键盘处理共用这一入口；游标保证每个目标只记一次 miss。
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

  let beatText: string;
  if (phase === "idle") {
    beatText = "尚未开始";
  } else if (phase === "countIn") {
    beatText = countInBeat < 0 ? "准备中" : `预备拍：${countInBeat + 1}`;
  } else if (phase === "playing") {
    beatText = `当前拍：${playingBeatIndex + 1}`;
  } else {
    beatText = "已结束";
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
        // 已先收齐过期目标，不依赖“结束”和“漏拍”两个定时器的先后顺序。
        clockRef.current = null;
        console.log("最终敲击时间: ", [...tapOffsetsRef.current]);
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
      if (context && context.state !== "closed") void context.close();
    };
  }, [stopScheduledSounds]);

  async function handlePlay(requestedMode: PlaybackMode) {
    if (clockRef.current !== null) {
      stopScheduledSounds();
      clockRef.current = null;
      nextTargetIndexRef.current = 0;
      setPlayback(IDLE_PLAYBACK);
      setTimingEvents([]);
      return;
    }
    // resume 是异步的；在等待期间阻止重复开始。
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    setAudioError(null);
    const request = ++startRequestRef.current;

    try {
      const context =
        audioContextRef.current ??
        (audioContextRef.current = new AudioContext());
      await context.resume();
      if (request !== startRequestRef.current) return;

      stopScheduledSounds();
      const clock = createPracticeClock(context, timeline.countInDurationMs);
      clockRef.current = clock;
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

      const tapOffsetMs = clock.nowMs();

      // 补齐漏拍
      recordExpiredTargets(tapOffsetMs);
      if (tapOffsetMs >= timeline.finishOffsetMs) return;

      // 敲击匹配
      if (tapOffsetMs < 0) {
        // 如果是在练习开始之前敲击的，要看是否是在第一个目标的开始窗口之后，如果不是就判定为无效
        const firstTarget = targetTapTimeline[0];
        if (firstTarget === undefined || nextTargetIndexRef.current !== 0)
          return;
        const { opensAtMs } = getTargetTimingWindow(
          firstTarget,
          effectiveTimingWindows,
        );
        if (tapOffsetMs < opensAtMs) return;
      }

      // 敲击与判定
      playTapSound(audioContext);
      tapOffsetsRef.current.push(tapOffsetMs);
      const timingEvent = evaluateTap(
        targetTapTimeline,
        nextTargetIndexRef.current,
        tapOffsetMs,
        effectiveTimingWindows,
      );
      if (timingEvent === null) return;

      if (timingEvent.kind === "hit") nextTargetIndexRef.current += 1;
      setTimingEvents((previous) => [...previous, timingEvent]);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mode,
    recordExpiredTargets,
    timeline.finishOffsetMs,
    targetTapTimeline,
    effectiveTimingWindows,
  ]);

  return (
    <>
      <p>{mode === "practice" ? "击拍练习" : "节奏试听"}</p>
      <div>BPM: {bpm}</div>

      <RhythmScore
        exercise={exercise}
        activeEventIndex={activeEventIndex}
        targetTapTimeline={targetTapTimeline}
        timingEvents={timingEvents}
      />
      <div>{beatText}</div>
      {mode === "practice" && (
        <div>判定：{formatTimingEvent(latestTimingEvent)}</div>
      )}
      {audioError && <div role="alert">{audioError}</div>}

      <div>
        {/* 点击开始之后，该按钮变为停止状态，先播放预备拍，用户敲击键盘进行击拍练习 */}
        <button
          type="button"
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
          disabled={isStarting || (isRunning && mode !== "listen")}
          onClick={(event) => {
            event.currentTarget.blur();
            void handlePlay("listen");
          }}
        >
          {isRunning && mode === "listen" ? "停止" : "试听"}
        </button>
      </div>
    </>
  );
}

export default RhythmTrainer;
