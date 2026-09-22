import type { RhythmElement, RhythmExercise } from "../rhythm/RhythmModel";
import type { DictationAttempt, DictationRecord, DictationRecordEvent, ExerciseContext, PracticeRecord, TappingAttempt, TappingRecord } from "./PracticeRecord";

/** Historical achievement is separate from the current attempt's result. */
export function historicalStatus(record: PracticeRecord | undefined): string {
  if (!record) return "";
  if (record.mode === "tapping") return record.attempts.some(item => item.passed) ? "已通过" : "";
  if (record.attempts.some(item => item.completedAt && !item.viewedAnswer)) return "已独立完成";
  if (record.attempts.some(item => item.completedAt)) return "已完成";
  return "";
}

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
/** Clamp after filtering/deletion; bounds apply to the displayed (newest-first) order. */
export function recordPage(total: number, requested: number) {
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
  const start = (page - 1) * pageSize;
  return { page, pages, start, end: Math.min(total, start + pageSize) };
}

export type RecordFilter = "all" | PracticeRecord["mode"];
export type RecordPeriod = "week" | "month" | "all";

/** Counts attempts, not questions. Calendar days use the browser timezone, including today.
 * Tapping belongs to its end date; dictation belongs to its start date even when completed later.
 * Returned records remain whole so opening/deleting one retains the existing all-history semantics.
 */
export function recordOverview(records: readonly PracticeRecord[], mode: RecordFilter, period: RecordPeriod, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (period === "week" ? 6 : 29));
  const lowerBound = period === "all" ? -Infinity : start.getTime();
  const days = new Set<string>();
  const matching: { record: PracticeRecord; latest: number }[] = [];
  let tappingCount = 0;
  let passedCount = 0;
  let dictationCount = 0;
  let completedCount = 0;
  let independentCount = 0;

  for (const record of records) {
    if (mode !== "all" && record.mode !== mode) continue;
    let latest = -Infinity;
    for (const attempt of record.attempts) {
      const date = new Date("startedAt" in attempt ? attempt.startedAt : attempt.completedAt);
      const time = date.getTime();
      if (!Number.isFinite(time) || time < lowerBound || time > now.getTime()) continue;
      latest = Math.max(latest, time);
      days.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
      if ("passed" in attempt) {
        tappingCount++;
        if (attempt.passed) passedCount++;
      } else {
        dictationCount++;
        if (attempt.completedAt !== null) {
          completedCount++;
          if (!attempt.viewedAnswer) independentCount++;
        }
      }
    }
    if (latest !== -Infinity) matching.push({ record, latest });
  }
  return {
    records: matching.sort((a, b) => b.latest - a.latest).map(item => item.record),
    count: tappingCount + dictationCount,
    days: days.size,
    tappingCount, passedCount,
    passRate: tappingCount ? Math.round(passedCount / tappingCount * 100) : null,
    dictationCount, completedCount, independentCount,
  };
}
