import { useState, useEffect } from "react";

import type { RhythmExercise } from "./RhythmModel";
import { noteValueToDurationInQuarterNotes } from "./RhythmModel";
import RhythmScore from "./RhythmScore";
import "./App.css";

type PlaybackPhase = "idle" | "countIn" | "playing" | "finished";

// 临时写死的常量
const BPM = 60;
const BEAT_DURATION_MS = 60000 / BPM;
const COUNT_IN_BEAT_COUNT = 1; // todo: 实际上这里的预备拍数应该跟当前的节拍类型挂钩吗？比如4/4拍就4拍，2/4拍就2拍？

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

function App() {
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [countInBeat, setCountInBeat] = useState<number>(0);
  const [playingBeatIndex, setPlayingBeatIndex] = useState<number>(0);
  const activeEventIndex = phase === "playing" ? playingBeatIndex : null;

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
      const durationTime =
        BEAT_DURATION_MS *
        noteValueToDurationInQuarterNotes(
          exercise.events[playingBeatIndex].noteValue,
        );
      const timeoutId = window.setTimeout(() => {
        if (playingBeatIndex === exercise.events.length - 1) {
          setPhase("finished");
          setCountInBeat(0);
          setPlayingBeatIndex(0);
        } else {
          setPlayingBeatIndex((prev) => prev + 1);
        }
      }, durationTime);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [phase, countInBeat, playingBeatIndex]);

  function handlePlay() {
    if (phase === "countIn" || phase === "playing") {
      setPhase("idle");
      setCountInBeat(0);
      setPlayingBeatIndex(0);
    } else {
      setPhase("countIn");
      setCountInBeat(0);
    }
  }

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
      <RhythmScore exercise={exercise} activeEventIndex={activeEventIndex} />
      <div>{beatText}</div>

      <div>
        {/* 点击开始之后，该按钮变为停止状态，先播放预备拍，用户敲击键盘进行击拍练习 */}
        <button type="button" onClick={handlePlay}>
          {phase === "countIn" || phase === "playing" ? "停止" : "开始"}
        </button>
        {/* 点击试听之后，该按钮变为停止状态，先播放预备拍，然后系统自动播放击拍，高亮当前击拍音符，播放声音 */}
        <div>试听</div>
      </div>
    </>
  );
}

export default App;
