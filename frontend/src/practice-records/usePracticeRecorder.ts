import { useLayoutEffect, useRef, useState } from "react";
import { useVisitState } from "../navigation/usePageNavigation";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import type { PracticeResult, TimingWindows } from "../rhythm/RhythmTiming";
import type { DictationRecordEvent, ExerciseContext } from "./PracticeRecord";
import { savePracticeActions, type RecordAction } from "./practiceRecordStorage";

export type AttemptRecorder = (conditions: { bpm: number; timingWindows: TimingWindows }) => ((result: PracticeResult) => void) | undefined;
type PendingRecording = { actions: RecordAction[]; recordId?: string; dictationAttemptId?: string; error: string };

/** 题目归档独立于访问；听写尝试编号与草稿一起在站内返回时恢复。
 * 写入成功后丢弃行为队列；卸载后的音频回调不能跨身份继续写入。
 */
export function usePracticeRecorder({ mode, context, exercise, enabled, scope }: {
  mode: "tapping" | "dictation";
  context?: ExerciseContext;
  exercise: RhythmExercise | null;
  enabled: boolean;
  scope: string;
}) {
  const [remembered, remember] = useVisitState<PendingRecording>(`record-pending:${scope}`, { actions: [], error: "" });
  const current = useRef<PendingRecording>({ ...remembered });
  const active = useRef(true);
  const [error, setError] = useState(remembered.error);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function persist() {
    if (!enabled || !active.current || !context || !exercise || !current.current.actions.length) return;
    try {
      current.current.recordId = savePracticeActions(context, exercise, mode, current.current.actions, current.current.recordId);
      current.current.actions = [];
      current.current.error = "";
    } catch (cause) {
      current.current.error = cause instanceof Error ? cause.message : "无法保存练习记录。";
    }
    setError(current.current.error);
    remember({ ...current.current });
  }

  const startAttempt: AttemptRecorder = (conditions) => {
    if (!enabled || !context || !exercise || !active.current) return;
    const id = crypto.randomUUID();
    const timingWindows = { ...conditions.timingWindows };
    let completedAt: string | undefined;
    return (result) => {
      if (!active.current) return;
      completedAt ??= new Date().toISOString();
      current.current.actions = [...current.current.actions, { mode: "tapping", attempt:
        { ...result, id, completedAt, bpm: conditions.bpm, timingWindows } }];
      persist();
    };
  };

  function dictation(event: DictationRecordEvent) {
    if (!enabled || !context || !exercise || !active.current) return;
    if (!current.current.dictationAttemptId && event.type === "edit") return;
    current.current.dictationAttemptId ??= crypto.randomUUID();
    current.current.actions = [...current.current.actions, { mode: "dictation", attemptId: current.current.dictationAttemptId, event, at: new Date().toISOString() }];
    persist();
  }

  return { startAttempt, dictation, retry: persist, error };
}
