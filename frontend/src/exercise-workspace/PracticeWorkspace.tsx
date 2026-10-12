import { ActionError } from "../ui/ActionError";
import { useCallback, useContext, useMemo, useState, type SetStateAction } from "react";
import { useAssistantPractice } from "../assistant/assistantContext";
import { PracticeActivityContext } from "../assistant/practiceActivity";
import { readExerciseHistory } from "../practice-records/practiceRecordStorage";
import { buildPracticeContextSummary } from "../assistant/practiceContextSummary";
import PracticeShortcutHelp from "./PracticeShortcutHelp";
import PracticeSettings, { type PracticeSettingsValue } from "../practice/PracticeSettings";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import RhythmTrainer from "../practice/RhythmTrainer";
import { RhythmDictation } from "../practice/RhythmDictation";
import { useVisitState } from "../navigation/usePageNavigation";
import { createDictationState, dictationBinding, restoreDictation, type DictationSnapshot, type DictationState } from "../practice/DictationState";
import type { ExerciseContext } from "../practice-records/PracticeRecord";
import { usePracticeRecorder } from "../practice-records/usePracticeRecorder";

type WorkspaceProps = {
  exercise: RhythmExercise | null;
  exerciseKey?: string | number;
  mode: "tapping" | "dictation";
  recoveryScope?: string;
  settingsScope?: string;
  recordContext?: ExerciseContext;
  answerExposed?: boolean;
  onAnswerViewed?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

export default function PracticeWorkspace(props: WorkspaceProps) {
  const binding = dictationBinding(props.exerciseKey ?? 0, props.exercise);
  return <WorkspaceSession key={binding} {...props} binding={binding} />;
}

/** 设置始终存在；exercise 为 null 时显示不可操作的训练区。
 * exerciseKey 标识本轮题目；恢复时核对题目内容与编号，不恢复音频、轮次及遮罩。
 * recoveryScope 隔离题目来源与访问；settingsScope 可跨题共享设置，输入过程由 PracticeSettings 管理。
 */
function WorkspaceSession({
  exercise,
  mode,
  exerciseKey = 0,
  onBusyChange,
  recoveryScope = mode,
  settingsScope = recoveryScope,
  recordContext,
  answerExposed = false,
  onAnswerViewed,
  binding,
}: WorkspaceProps & { binding: string }) {
  const [audioBusy, setAudioBusy] = useState(false);
  const reportBusy = useCallback((busy: boolean) => { setAudioBusy(busy); onBusyChange?.(busy); }, [onBusyChange]);
  const [settings, rememberSettings] = useVisitState<PracticeSettingsValue>(`practice:${settingsScope}:settings`, { bpm: 60, metronomeEnabled: true });
  const [snapshot, setSnapshot] = useVisitState<DictationSnapshot | null>(`practice:${recoveryScope}:dictation`, null);
  const activity = useContext(PracticeActivityContext);
  const recorder = usePracticeRecorder({ mode, context: recordContext, exercise, enabled: true,
    onAttemptChanged: (record, attemptId) => activity?.record(record, attemptId, true),
    answerExposed, scope: `${recoveryScope}:${binding}` });
  const empty = useMemo(() => createDictationState(exercise), [exercise]);
  const state = restoreDictation(snapshot, binding, empty);
  const update = useCallback((next: SetStateAction<DictationState>) => {
    setSnapshot(previous => {
      const current = restoreDictation(previous, binding, empty);
      return { binding, state: typeof next === "function" ? next(current) : next };
    });
  }, [binding, empty, setSnapshot]);
  useAssistantPractice(exercise && recordContext ? recordContext.title : null, () => {
    if (!exercise || !recordContext) return null;
    const session = recorder.readSession();
    const viewed = answerExposed || (session?.mode === "dictation" && session.attempts.some(attempt => attempt.viewedAnswer));
    return {
      ...buildPracticeContextSummary({ context: recordContext, exercise, mode,
        answerExposed: viewed, session }, readExerciseHistory(recordContext, exercise, mode)),
      bpm: settings.bpm,
      metronomeEnabled: settings.metronomeEnabled,
      audioBusy,
      ...(mode === "dictation" ? { currentAnswer: state.answerMeasures,
        selectedMeasure: state.selectedMeasureIndex + 1, verdicts: state.measureVerdicts } : {}),
    };
  });
  const shortcutHelp = <PracticeShortcutHelp mode={mode} source={recordContext?.source} />;
  return (
    <PracticeSettings layout="sidebar" initialValue={settings} onChange={rememberSettings}>
      {({ bpm, metronomeEnabled }, settingsPanel) => (
        <section aria-label={mode === "dictation" ? "节奏听写区" : "击拍训练区"}>
          {recorder.error && <ActionError message={recorder.error} onRetry={recorder.retry} />}
          {mode === "dictation" ? (
            // BPM 改变只重建听写内部播放器，保留草稿、验证结果和参考答案状态。
            <RhythmDictation key={binding} session={{ state, onChange: update }} exercise={exercise} bpm={bpm} metronomeEnabled={metronomeEnabled} onBusyChange={reportBusy} settingsPanel={settingsPanel}
              onRecord={event => { if (event.type === "view-answer") onAnswerViewed?.(); recorder.dictation(event); }} toolbarEnd={shortcutHelp} />
          ) : (
            // 换题重建；调速由训练组件原地停止旧轮次，保留谱面。
            <RhythmTrainer
              key={exerciseKey}
              exercise={exercise}
              bpm={bpm}
              metronomeEnabled={metronomeEnabled}
              settingsPanel={settingsPanel}
              onBusyChange={reportBusy}
              onAttemptStart={recorder.startAttempt}
              toolbarEnd={shortcutHelp}
            />
          )}
        </section>
      )}
    </PracticeSettings>
  );
}
