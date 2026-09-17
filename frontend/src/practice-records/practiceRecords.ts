import type { RhythmElement, RhythmExercise } from "../rhythm/RhythmModel";
import type { DictationAttempt, DictationRecord, DictationRecordEvent, ExerciseContext, PracticeRecord, TappingAttempt, TappingRecord } from "./PracticeRecord";

/** 内容版本只比较记谱，不包含名称、速度或对象属性顺序；无附点的两种写法等价。 */
export function exerciseVersion(exercise: RhythmExercise): string {
  const element = (item: RhythmElement): unknown => item.kind === "triplet"
    ? [item.kind, item.notes.map(element)] : [item.kind, item.noteValue, item.dots ?? 0];
  return JSON.stringify([exercise.timeSignature.beats, exercise.timeSignature.beatType,
    exercise.measures.map(measure => measure.elements.map(element))]);
}

export function recordKey(context: ExerciseContext, exercise: RhythmExercise, mode: PracticeRecord["mode"]): string {
  return JSON.stringify([context.source, context.exerciseId, mode, exerciseVersion(exercise)]);
}

function base(context: ExerciseContext, exercise: RhythmExercise, at: string) {
  return { ...context, exercise: structuredClone(exercise), id: crypto.randomUUID(), startedAt: at, updatedAt: at };
}

/** 同一轮迟到输入修正原成绩；轮次 ID 不依赖组件渲染次数。 */
export function recordTappingAttempt(record: TappingRecord | null, context: ExerciseContext, exercise: RhythmExercise, attempt: TappingAttempt): TappingRecord {
  const current = record ?? { ...base(context, exercise, attempt.completedAt), mode: "tapping" as const, attempts: [] };
  const exists = current.attempts.some(item => item.id === attempt.id);
  return { ...current, title: context.title, updatedAt: current.updatedAt > attempt.completedAt ? current.updatedAt : attempt.completedAt, attempts: exists
    ? current.attempts.map(item => item.id === attempt.id ? attempt : item)
    : [...current.attempts, attempt] };
}

/** 一份空白作答对应一个稳定 ID。完成后冻结；编辑只清除判定，既不创建尝试也不更新时间。 */
export function recordDictationEvent(record: DictationRecord | null, context: ExerciseContext, exercise: RhythmExercise,
  attemptId: string, event: DictationRecordEvent, at = new Date().toISOString()): DictationRecord | null {
  const previous = record?.attempts.find(item => item.id === attemptId);
  if (previous?.completedAt) return record;
  if (!previous && event.type === "edit") return record;
  const attempt: DictationAttempt = previous ?? {
    id: attemptId, startedAt: at, completedAt: null, viewedAnswer: false,
    measures: exercise.measures.map(() => ({ questionPlayCount: 0, verificationCount: 0, verdict: "unchecked" })),
  };
  if ((event.type === "verify" || event.type === "edit") && !attempt.measures[event.measureIndex]) throw new Error("小节不存在。");
  if (event.type === "play" && event.scope !== "all" && !attempt.measures[event.scope]) throw new Error("小节不存在。");
  if (event.type === "verify" && attempt.measures[event.measureIndex].verdict !== "unchecked") return record;
  if (event.type === "edit" && attempt.measures[event.measureIndex].verdict === "unchecked") return record;
  if (event.type === "view-answer" && attempt.viewedAnswer) return record;
  const measures = attempt.measures.map((item, index) => {
    if (event.type === "play" && (event.scope === "all" || event.scope === index)) return { ...item, questionPlayCount: item.questionPlayCount + 1 };
    if (event.type === "verify" && event.measureIndex === index) return { ...item, verificationCount: item.verificationCount + 1, verdict: event.correct ? "correct" as const : "incorrect" as const };
    if (event.type === "edit" && event.measureIndex === index) return { ...item, verdict: "unchecked" as const };
    return item;
  });
  const next: DictationAttempt = { ...attempt, measures, viewedAnswer: attempt.viewedAnswer || event.type === "view-answer",
    completedAt: measures.length > 0 && measures.every(item => item.verdict === "correct") ? at : null };
  const current: DictationRecord = record ?? { ...base(context, exercise, at), mode: "dictation", attempts: [] };
  return { ...current, title: context.title,
    updatedAt: event.type === "edit" || current.updatedAt > at ? current.updatedAt : at,
    attempts: previous ? current.attempts.map(item => item.id === attemptId ? next : item) : [...current.attempts, next] };
}
