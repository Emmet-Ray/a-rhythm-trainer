import { PracticeActivityContext } from "../assistant/practiceActivity";
import { useContext, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { useVisitState } from "../navigation/usePageNavigation";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import type { PracticeResult, TimingWindows } from "../rhythm/RhythmTiming";
import { recordDictationEvent, recordTappingAttempt } from "./practiceRecords";
import type { PracticeRecord, DictationRecordEvent, ExerciseContext } from "./PracticeRecord";
import { createPracticeRecordWriter } from "./practiceRecordStorage";

export type AttemptRecorder = (conditions: { bpm: number; metronomeEnabled?: boolean; timingWindows: TimingWindows }) => ((result: PracticeResult) => void) | undefined;
type PendingRecording = { pending?: PracticeRecord; batch?: PracticeRecord; writer?: ReturnType<typeof createPracticeRecordWriter>; saving?: boolean; onChange?: (error: string) => void; dictationAttemptId?: string; error: string; session?: PracticeRecord };

/** 题目归档独立于访问；听写尝试编号与草稿一起在站内返回时恢复。
 * 本次轮次始终在内存累计，enabled 只控制持久化；保存失败不影响本次分析。
 * 写入成功后丢弃待存快照；卸载后的音频回调不再更新，已提交的批次继续完成。
 */
export function usePracticeRecorder({ mode, context, exercise, enabled, scope, answerExposed = false }: {
  mode: "tapping" | "dictation";
  context?: ExerciseContext;
  exercise: RhythmExercise | null;
  enabled: boolean;
  scope: string;
  answerExposed?: boolean;
}) {
  const activity = useContext(PracticeActivityContext);
  const [remembered, remember] = useVisitState<PendingRecording>(`record-pending:${scope}`, { error: "" });
  // 待存快照按访问共享，离页后仍在写入的旧组件与返回后的组件使用同一批次
  const current = useRef<PendingRecording>(remembered);
  const active = useRef(true);
  const [error, setError] = useState(remembered.error);
  useLayoutEffect(() => {
    active.current = true;
    const pending = current.current;
    pending.onChange = setError;
    return () => {
      active.current = false;
      if (pending.onChange === setError) pending.onChange = undefined;
    };
  }, []);

  async function persist() {
    if (!enabled || current.current.saving || !context || !exercise || !current.current.pending) return;
    current.current.saving = true;
    try {
      while (current.current.pending) {
        const batch: PracticeRecord = current.current.batch ?? current.current.pending;
        current.current.batch = batch;
        current.current.writer ??= createPracticeRecordWriter();
        remember(current.current);
        await current.current.writer(batch);
        if (current.current.pending === batch) current.current.pending = undefined;
        current.current.batch = undefined;
        current.current.error = "";
        remember(current.current);
      }
    } catch (cause) {
      current.current.error = cause instanceof Error ? cause.message : "无法保存练习记录";
      remember(current.current);
    } finally {
      current.current.saving = false;
      current.current.onChange?.(current.current.error);
    }
  }

  const startAttempt: AttemptRecorder = (conditions) => {
    if (mode !== "tapping" || !context || !exercise || !active.current) return;
    const id = crypto.randomUUID();
    const timingWindows = { ...conditions.timingWindows };
    let completedAt: string | undefined;
    return (result) => {
      if (!active.current) return;
      completedAt ??= new Date().toISOString();
      const attempt = { ...result, id, completedAt, bpm: conditions.bpm, ...(conditions.metronomeEnabled !== undefined ? { metronomeEnabled: conditions.metronomeEnabled } : {}), timingWindows };
      current.current.session = recordTappingAttempt(current.current.session?.mode === "tapping" ? current.current.session : null, context, exercise, attempt);
      activity?.record(current.current.session, id, enabled);
      remember(current.current);
      if (enabled) current.current.pending = current.current.session;
      remember(current.current);
      void persist();
    };
  };

  function dictation(event: DictationRecordEvent) {
    if (mode !== "dictation" || !context || !exercise || !active.current) return;
    if (!current.current.dictationAttemptId && event.type === "edit") return;
    current.current.dictationAttemptId ??= crypto.randomUUID();
    const at = new Date().toISOString();
    let session = current.current.session?.mode === "dictation" ? current.current.session : null;
    if (answerExposed) session = recordDictationEvent(session, context, exercise, current.current.dictationAttemptId, { type: "view-answer" }, at);
    current.current.session = recordDictationEvent(session, context, exercise, current.current.dictationAttemptId, event, at) ?? undefined;
    if (current.current.session) activity?.record(current.current.session, current.current.dictationAttemptId, enabled);
    remember(current.current);
    if (!enabled) return;
    current.current.pending = current.current.session;
    remember(current.current);
    void persist();
  }

  // 训练进行中从助手卡片查看答案，也要立即更新已存在的尝试；仅打开页面不创建记录。
  const exposeExistingAttempt = useEffectEvent(() => {
    if (current.current.dictationAttemptId) dictation({ type: "view-answer" });
  });
  useLayoutEffect(() => { if (answerExposed) exposeExistingAttempt(); }, [answerExposed]);

  return { startAttempt, dictation, retry: persist, error, readSession: () => current.current.session ?? null };
}
