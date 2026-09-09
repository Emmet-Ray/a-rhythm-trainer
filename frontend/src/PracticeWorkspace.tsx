import { useState } from "react";
import type { RhythmExercise } from "./RhythmModel";
import RhythmTrainer from "./RhythmTrainer";
import { RhythmDictation } from "./RhythmDictation";

const MIN_BPM = 40;
const MAX_BPM = 240;

/** 设置始终存在；exercise 为 null 时显示不可操作的训练区。
 * exerciseKey 标识本轮题目，仅重建训练状态；重建整个工作区才会重置设置。
 */
export default function PracticeWorkspace({
  exercise,
  mode,
  exerciseKey = 0,
}: {
  exercise: RhythmExercise | null;
  exerciseKey?: string | number;
  mode: "tapping" | "dictation";
}) {
  const [bpm, setBpm] = useState(60);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [bpmInput, setBpmInput] = useState("60");
  const [hasBpmError, setHasBpmError] = useState(false);
  // 未应用状态由草稿与生效值直接得出，不另存一份状态。
  const hasPendingBpm = Number(bpmInput) !== bpm;

  return (
    <>
      <section className="practice-settings" aria-label="练习设置">
        <form
          className="tempo-settings"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const nextBpm = Number(bpmInput);
            if (
              !Number.isInteger(nextBpm) ||
              nextBpm < MIN_BPM ||
              nextBpm > MAX_BPM
            ) {
              setHasBpmError(true);
              return;
            }
            setHasBpmError(false);
            setBpm(nextBpm);
            setBpmInput(String(nextBpm));
          }}
        >
          <label htmlFor="bpm-input">
            速度 <span className="unit">BPM</span>
          </label>
          <input
            id="bpm-input"
            type="number"
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            required
            value={bpmInput}
            aria-invalid={hasBpmError || undefined}
            aria-describedby={
              hasBpmError
                ? "bpm-error"
                : hasPendingBpm
                  ? "bpm-pending"
                  : undefined
            }
            onChange={(event) => {
              setBpmInput(event.target.value);
              setHasBpmError(false);
            }}
          />
          <button type="submit">应用速度</button>
          {hasPendingBpm && !hasBpmError && (
            <span id="bpm-pending" className="bpm-pending">
              未应用
            </span>
          )}
          {hasBpmError && (
            <p id="bpm-error" className="bpm-error" role="alert">
              请输入 {MIN_BPM}–{MAX_BPM} 之间的整数。
            </p>
          )}
        </form>
        <label className="metronome-toggle">
          <input type="checkbox" checked={metronomeEnabled} onChange={event => setMetronomeEnabled(event.target.checked)} />
          节拍器
        </label>
      </section>
      <section className={mode === "tapping" ? "training-workspace" : undefined} aria-label={mode === "dictation" ? "节奏听写区" : "击拍训练区"}>
        {mode === "dictation" ? (
          // BPM 改变只重建听写内部播放器，保留草稿、验证结果和参考答案状态。
          <RhythmDictation key={exerciseKey} exercise={exercise} bpm={bpm} metronomeEnabled={metronomeEnabled} />
        ) : (
          // 只在生效配置改变时重建训练；编辑速度输入、应用相同速度不打断。
          <RhythmTrainer
            key={`${exerciseKey}:${bpm}`}
            exercise={exercise}
            bpm={bpm}
            metronomeEnabled={metronomeEnabled}
          />
        )}
      </section>
    </>
  );
}
