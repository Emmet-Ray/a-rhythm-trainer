import PracticeSettings from "./PracticeSettings";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import RhythmTrainer from "./RhythmTrainer";
import { RhythmDictation } from "./RhythmDictation";

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
  return (
    <PracticeSettings>
      {({ bpm, metronomeEnabled }) => (
        <section aria-label={mode === "dictation" ? "节奏听写区" : "击拍训练区"}>
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
      )}
    </PracticeSettings>
  );
}
