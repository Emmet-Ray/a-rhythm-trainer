import { useCallback, useContext, useMemo, type SetStateAction } from "react";
import PracticeShortcutHelp from "./PracticeShortcutHelp";
import PracticeSettings, { type PracticeSettingsValue } from "./PracticeSettings";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import RhythmTrainer from "./RhythmTrainer";
import { RhythmDictation } from "./RhythmDictation";
import { useVisitState } from "../navigation/usePageNavigation";
import { createDictationState, dictationBinding, restoreDictation, type DictationSnapshot, type DictationState } from "./DictationState";
import type { ExerciseContext } from "../practice-records/PracticeRecord";
import { RecordAccessContext, recordAccessMessage, type RecordAccess } from "../practice-records/recordAccess";
import { usePracticeRecorder } from "../practice-records/usePracticeRecorder";

type WorkspaceProps = {
  exercise: RhythmExercise | null;
  exerciseKey?: string | number;
  mode: "tapping" | "dictation";
  recoveryScope?: string;
  recordContext?: ExerciseContext;
  onBusyChange?: (busy: boolean) => void;
};

export default function PracticeWorkspace(props: WorkspaceProps) {
  const access = useContext(RecordAccessContext);
  const binding = dictationBinding(props.exerciseKey ?? 0, props.exercise);
  return <WorkspaceSession key={`${access}:${binding}`} {...props} access={access} binding={binding} />;
}

/** 设置始终存在；exercise 为 null 时显示不可操作的训练区。
 * exerciseKey 标识本轮题目；恢复时核对题目内容与编号，不恢复音频、轮次及遮罩。
 * recoveryScope 隔离来源及账号；设置独立于换题，仍由 PracticeSettings 管理输入过程。
 */
function WorkspaceSession({
  exercise,
  mode,
  exerciseKey = 0,
  onBusyChange,
  recoveryScope = mode,
  recordContext,
  access,
  binding,
}: WorkspaceProps & { access: RecordAccess; binding: string }) {
  const [settings, rememberSettings] = useVisitState<PracticeSettingsValue>(`practice:${recoveryScope}:settings`, { bpm: 60, metronomeEnabled: true });
  const [snapshot, setSnapshot] = useVisitState<DictationSnapshot | null>(`practice:${access}:${recoveryScope}:dictation`, null);
  const recorder = usePracticeRecorder({ mode, context: recordContext, exercise, enabled: access === "guest",
    scope: `${access}:${recoveryScope}:${binding}` });
  const empty = useMemo(() => createDictationState(exercise), [exercise]);
  const state = restoreDictation(snapshot, binding, empty);
  const update = useCallback((next: SetStateAction<DictationState>) => {
    setSnapshot(previous => {
      const current = restoreDictation(previous, binding, empty);
      return { binding, state: typeof next === "function" ? next(current) : next };
    });
  }, [binding, empty, setSnapshot]);
  const shortcutHelp = <PracticeShortcutHelp mode={mode} source={recordContext?.source} />;
  return (
    <PracticeSettings layout="sidebar" initialValue={settings} onChange={rememberSettings}>
      {({ bpm, metronomeEnabled }, settingsPanel) => (
        <section aria-label={mode === "dictation" ? "节奏听写区" : "击拍训练区"}>
          {recordContext && recordAccessMessage(access) && <p className="practice-record-notice" role="status">{recordAccessMessage(access)}</p>}
          {recorder.error && <div className="practice-record-error" role="alert"><span>{recorder.error}</span><button type="button" onClick={recorder.retry}>重试保存</button></div>}
          {mode === "dictation" ? (
            // BPM 改变只重建听写内部播放器，保留草稿、验证结果和参考答案状态。
            <RhythmDictation key={binding} session={{ state, onChange: update }} exercise={exercise} bpm={bpm} metronomeEnabled={metronomeEnabled} onBusyChange={onBusyChange} settingsPanel={settingsPanel}
              onRecord={recorder.dictation} toolbarEnd={shortcutHelp} />
          ) : (
            // 换题重建；调速由训练组件原地停止旧轮次，保留谱面。
            <RhythmTrainer
              key={exerciseKey}
              exercise={exercise}
              bpm={bpm}
              metronomeEnabled={metronomeEnabled}
              settingsPanel={settingsPanel}
              onBusyChange={onBusyChange}
              onAttemptStart={recorder.startAttempt}
              toolbarEnd={shortcutHelp}
            />
          )}
        </section>
      )}
    </PracticeSettings>
  );
}
