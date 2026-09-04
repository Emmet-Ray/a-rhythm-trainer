import { useEffect, useRef, useState } from "react";

import type { RhythmExercise } from "./RhythmModel";
import { noteValueToDurationInQuarterNotes } from "./RhythmModel";
import RhythmScore from "./RhythmScore";
import {
  createTargetTapTimeline,
  evaluateExpiredTarget,
  evaluateTap,
  getTargetTimingWindow,
  type TimingEvent,
  type TimingWindows,
} from "./RhythmTiming";
import "./App.css";

type PlaybackPhase = "idle" | "countIn" | "playing" | "finished";

// 临时写死的常量
const BPM = 60;
const BEAT_DURATION_MS = 60000 / BPM;
const COUNT_IN_BEAT_COUNT = 1; // todo: 实际上这里的预备拍数应该跟当前的节拍类型挂钩吗？比如4/4拍就4拍，2/4拍就2拍？
const COUNT_IN_DURATION_MS = COUNT_IN_BEAT_COUNT * BEAT_DURATION_MS;
const TIMING_WINDOWS = {
  perfectMs: 50,
  hitMs: 150,
} satisfies TimingWindows;

const exercise: RhythmExercise = {
  timeSignature: {
    beats: 4,
    beatType: 4,
  },
  events: [
    { kind: "note", noteValue: "quarter" },
    { kind: "note", noteValue: "quarter" },
    { kind: "note", noteValue: "quarter" },
    { kind: "note", noteValue: "eighth" },
    { kind: "note", noteValue: "eighth" },
  ],
};
const targetTapTimeline = createTargetTapTimeline(exercise, BPM);
console.log("target tap time: ", targetTapTimeline);

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

function App() {
  // todo: 现在状态挺多了，而且有的经常会同时更新设置，是不是应该集中一下表示了，现在全是分散的
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [countInBeat, setCountInBeat] = useState<number>(0);
  const [playingBeatIndex, setPlayingBeatIndex] = useState<number>(0);
  const [nextTargetIndex, setNextTargetIndex] = useState(0);
  const [timingEvents, setTimingEvents] = useState<TimingEvent[]>([]);
  const practiceStartTimeRef = useRef<number | null>(null);
  const tapOffsetsRef = useRef<number[]>([]);
  const activeEventIndex = phase === "playing" ? playingBeatIndex : null;
  const latestTimingEvent = timingEvents.at(-1) ?? null;

  let beatText: string;
  if (phase === "idle") {
    beatText = "尚未开始";
  } else if (phase === "countIn") {
    beatText = `预备拍：${countInBeat + 1}`;
  } else if (phase === "playing") {
    beatText = `当前拍：${playingBeatIndex + 1}`;
  } else {
    beatText = "已结束";
  }

  useEffect(() => {
    if (phase === "idle" || phase === "finished") {
      return;
    }
    // 预备拍阶段击拍，
    if (phase === "countIn") {
      const timeoutId = window.setTimeout(() => {
        if (countInBeat === COUNT_IN_BEAT_COUNT - 1) {
          // 预备拍结束之后进入节奏击拍
          setPhase("playing");
          setPlayingBeatIndex(0);
        } else {
          setCountInBeat((prev) => prev + 1);
        }
      }, BEAT_DURATION_MS);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }
    // 按照节奏击拍阶段
    if (phase === "playing") {
      let durationTime =
        BEAT_DURATION_MS *
        noteValueToDurationInQuarterNotes(
          exercise.events[playingBeatIndex].noteValue,
        );
      const isLastEvent = playingBeatIndex === exercise.events.length - 1;
      if (isLastEvent) {
        durationTime = Math.max(durationTime, TIMING_WINDOWS.hitMs + 1);
      }
      const timeoutId = window.setTimeout(() => {
        if (playingBeatIndex === exercise.events.length - 1) {
          practiceStartTimeRef.current = null;
          setPhase("finished");
          setCountInBeat(0);
          setPlayingBeatIndex(0);
          console.log("最终敲击时间: ", [...tapOffsetsRef.current]);
        } else {
          setPlayingBeatIndex((prev) => prev + 1);
        }
      }, durationTime);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [phase, countInBeat, playingBeatIndex]);

  // 当前目标超过命中窗口后，即使用户没有敲击，也会自动判定为 miss。
  useEffect(() => {
    if (phase !== "playing") {
      return;
    }

    const practiceStartTime = practiceStartTimeRef.current;
    const currentTarget = targetTapTimeline[nextTargetIndex];
    if (practiceStartTime === null || currentTarget === undefined) {
      return;
    }

    const { closesAtMs } = getTargetTimingWindow(currentTarget, TIMING_WINDOWS);
    const deadlineTime = practiceStartTime + closesAtMs;
    const delayMs = Math.max(0, Math.ceil(deadlineTime - performance.now()));
    // 上面这一段就是为了获得这个判断多长时间后不敲击就算是miss了，能不能简化一下

    const timeoutId = window.setTimeout(() => {
      const currentTimeMs = performance.now() - practiceStartTime;
      const timingEvent = evaluateExpiredTarget(
        targetTapTimeline,
        nextTargetIndex,
        currentTimeMs,
        TIMING_WINDOWS,
      );

      if (timingEvent === null) {
        return;
      }

      setTimingEvents((previousEvents) => [
        ...previousEvents,
        timingEvent,
      ]);
      setNextTargetIndex((previousIndex) => previousIndex + 1);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [phase, nextTargetIndex]);

  function handlePlay() {
    if (phase === "countIn" || phase === "playing") {
      practiceStartTimeRef.current = null;
      setPhase("idle");
      setCountInBeat(0);
      setPlayingBeatIndex(0);
      setNextTargetIndex(0);
      setTimingEvents([]);
    } else {
      // 在这里设置开始时间是为了在开始前的一个窗口内就可以匹配敲击键盘
      practiceStartTimeRef.current = performance.now() + COUNT_IN_DURATION_MS;

      setPhase("countIn");
      setCountInBeat(0);
      setNextTargetIndex(0);
      setTimingEvents([]);
      tapOffsetsRef.current = [];
    }
  }

  // 监听敲击空格键
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) {
        return;
      }

      const practiceStartTime = practiceStartTimeRef.current;
      if (practiceStartTime === null) {
        return;
      }
      const tapTime = performance.now();
      const tapOffsetMs = tapTime - practiceStartTime;

      // 开始前的一个窗口内可以进行匹配
      if (phase === "countIn") {
        const { opensAtMs } = getTargetTimingWindow(
          targetTapTimeline[0],
          TIMING_WINDOWS,
        );

        if (nextTargetIndex !== 0 || tapOffsetMs < opensAtMs) {
          return;
        }
      }

      event.preventDefault();

      tapOffsetsRef.current.push(tapOffsetMs);

      const timingEvent = evaluateTap(
        targetTapTimeline,
        nextTargetIndex,
        tapOffsetMs,
        TIMING_WINDOWS,
      );

      if (timingEvent === null) {
        return;
      }

      setTimingEvents((previousEvents) => [
        ...previousEvents,
        timingEvent,
      ]);
      if (timingEvent.kind === "hit") {
        setNextTargetIndex((previousIndex) => previousIndex + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [nextTargetIndex, phase]);

  return (
    <>
      <h1>节奏训练器</h1>
      <p>击拍练习</p>
      {/* 这里先是示意的bpm，后面也要调整成动态调整的 */}
      <div>BPM: {BPM}</div>

      {/* 先写死，写成固定的测试节奏

          todo: 这里后面要改成动态的当前练习的节奏片段
          todo：后面要使用具体的五线谱/其他节奏表示符号的库吧，vexflow等等
      */}
      <RhythmScore
        exercise={exercise}
        activeEventIndex={activeEventIndex}
        targetTapTimeline={targetTapTimeline}
        timingEvents={timingEvents}
      />
      <div>{beatText}</div>
      <div>判定：{formatTimingEvent(latestTimingEvent)}</div>

      <div>
        {/* 点击开始之后，该按钮变为停止状态，先播放预备拍，用户敲击键盘进行击拍练习 */}
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.blur();
            handlePlay();
          }}
        >
          {phase === "countIn" || phase === "playing" ? "停止" : "开始"}
        </button>
        {/* 点击试听之后，该按钮变为停止状态，先播放预备拍，然后系统自动播放击拍，高亮当前击拍音符，播放声音 */}
        <div>试听</div>
      </div>
    </>
  );
}

export default App;
