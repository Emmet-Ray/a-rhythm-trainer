import { useCallback, useMemo, type ReactNode, type SetStateAction } from "react";
import PracticeSettings, { type PracticeSettingsValue } from "./PracticeSettings";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import RhythmTrainer from "./RhythmTrainer";
import { RhythmDictation } from "./RhythmDictation";
import { useVisitState } from "../navigation/usePageNavigation";
import { createDictationState, dictationBinding, restoreDictation, type DictationSnapshot, type DictationState } from "./DictationState";

/** 设置始终存在；exercise 为 null 时显示不可操作的训练区。
 * exerciseKey 标识本轮题目；恢复时核对题目内容与编号，不恢复音频、轮次及遮罩。
 * recoveryScope 隔离来源及账号；设置独立于换题，仍由 PracticeSettings 管理输入过程。
 */
export default function PracticeWorkspace({
  exercise,
  mode,
  exerciseKey = 0,
  extraActions,
  recoveryScope = mode,
}: {
  exercise: RhythmExercise | null;
  exerciseKey?: string | number;
  mode: "tapping" | "dictation";
  recoveryScope?: string;
  /** 可选操作栏扩展；busy 包含音频准备、预备拍和播放，调用方据此禁止换题。 */
  extraActions?: (busy: boolean) => ReactNode;
}) {
  const [settings, rememberSettings] = useVisitState<PracticeSettingsValue>(`practice:${recoveryScope}:settings`, { bpm: 60, metronomeEnabled: true });
  const [snapshot, setSnapshot] = useVisitState<DictationSnapshot | null>(`practice:${recoveryScope}:dictation`, null);
  const binding = useMemo(() => dictationBinding(exerciseKey, exercise), [exerciseKey, exercise]);
  const empty = useMemo(() => createDictationState(exercise), [exercise]);
  const state = restoreDictation(snapshot, binding, empty);
  const update = useCallback((next: SetStateAction<DictationState>) => {
    setSnapshot(previous => {
      const current = restoreDictation(previous, binding, empty);
      return { binding, state: typeof next === "function" ? next(current) : next };
    });
  }, [binding, empty, setSnapshot]);
  return (
    <PracticeSettings layout="sidebar" initialValue={settings} onChange={rememberSettings}>
      {({ bpm, metronomeEnabled }, settingsPanel) => (
        <section aria-label={mode === "dictation" ? "节奏听写区" : "击拍训练区"}>
          {mode === "dictation" ? (
            // BPM 改变只重建听写内部播放器，保留草稿、验证结果和参考答案状态。
            <RhythmDictation key={binding} session={{ state, onChange: update }} exercise={exercise} bpm={bpm} metronomeEnabled={metronomeEnabled} extraActions={extraActions} settingsPanel={settingsPanel} />
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
