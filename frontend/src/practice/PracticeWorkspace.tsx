import type { ReactNode } from "react";
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
  extraActions,
}: {
  exercise: RhythmExercise | null;
  exerciseKey?: string | number;
  mode: "tapping" | "dictation";
  /** 可选操作栏扩展；busy 包含音频准备、预备拍和播放，调用方据此禁止换题。 */
  extraActions?: (busy: boolean) => ReactNode;
}) {
  return (
    <PracticeSettings layout={mode === "tapping" ? "sidebar" : "stacked"}>
      {({ bpm, metronomeEnabled }, settingsPanel) => (
        <section aria-label={mode === "dictation" ? "节奏听写区" : "击拍训练区"}>
          {mode === "dictation" ? (
            // BPM 改变只重建听写内部播放器，保留草稿、验证结果和参考答案状态。
            <RhythmDictation key={exerciseKey} exercise={exercise} bpm={bpm} metronomeEnabled={metronomeEnabled} extraActions={extraActions} />
          ) : (
            // 换题重建；调速由训练组件原地停止旧轮次，保留谱面。
            <RhythmTrainer
              key={exerciseKey}
              exercise={exercise}
              bpm={bpm}
              metronomeEnabled={metronomeEnabled}
              settingsPanel={settingsPanel}
              extraActions={extraActions}
            />
          )}
        </section>
      )}
    </PracticeSettings>
  );
}
