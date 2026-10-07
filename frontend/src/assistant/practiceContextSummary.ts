import type { ExerciseContext, PracticeRecord, TappingAttempt } from "../practice-records/PracticeRecord";
import { recordKey } from "../practice-records/practiceRecords";
import { readCachedHistory } from "../practice-records/practiceRecordStorage";
import { createExerciseTimeline } from "../rhythm/RhythmTiming";
import type { RhythmExercise } from "../rhythm/RhythmModel";

export type PracticeContextSource = {
  context: ExerciseContext;
  exercise: RhythmExercise;
  mode: PracticeRecord["mode"];
  answerExposed: boolean;
  session: PracticeRecord | null;
  historyEnabled: boolean;
};

function tappingSummary(attempt: TappingAttempt, exercise: RhythmExercise, includePositions: boolean) {
  const { details, ...summary } = attempt;
  if (!details) return { ...summary, detailAvailability: "summary-only", stopped: null };
  const events = details.timingEvents;
  const timeline = createExerciseTimeline(exercise, attempt.bpm, 0, attempt.timingWindows);
  const positions = includePositions ? events.filter(event => event.kind !== "hit" || event.grade !== "perfect").slice(0, 64).map(event => {
    const offset = event.kind === "wrongTap" ? event.tapOffsetMs : timeline.eventStartOffsetsMs[event.eventIndex];
    const measure = timeline.measures.findIndex(item => offset >= item.startOffsetMs && offset < item.endOffsetMs);
    return { ...event, measure: measure >= 0 ? measure + 1 : null,
      beat: measure >= 0 ? 1 + (offset - timeline.measures[measure].startOffsetMs) / (60000 / attempt.bpm) : null };
  }) : undefined;
  return { ...summary, detailAvailability: "timing", stopped: details.stopped,
    earlyCount: events.filter(event => event.kind === "hit" && event.grade === "early").length,
    lateCount: events.filter(event => event.kind === "hit" && event.grade === "late").length,
    ...(positions ? { positions, positionsTruncated: events.filter(event => event.kind !== "hit" || event.grade !== "perfect").length > positions.length } : {}) };
}

/** 默认综合本次轮次，自动读取同来源、同编号、同内容版本的历史。
 * 读取失败明确标记；不把失败当成无历史。听写未公开答案时不附带标准谱面。
 * 只整理题目与记录，不推断当前速度、播放状态或选中小节；这些由页面调用方提供。
 * session 是调用方选定的轮次范围（本次访问或待发送活动），这些轮次不再重复计入历史。
 * 限定最近轮次和位置明细，避免反复练习使单条请求无限增长。
 */
export function buildPracticeContextSummary(source: PracticeContextSource, readHistory?: () => PracticeRecord[]) {
  const { context, exercise, mode, session } = source;
  const sessionIds = new Set(session?.attempts.map(attempt => attempt.id));
  let history: PracticeRecord | undefined;
  let historyTotal = 0;
  let historyAttemptIds: string[] = [];
  let historyStatus = source.historyEnabled ? "available" : "unavailable";
  if (source.historyEnabled) {
    try {
      const key = recordKey(context, exercise, mode);
      if (readHistory) {
        history = readHistory().find(record => recordKey(record, record.exercise, record.mode) === key);
        historyTotal = history?.attempts.length ?? 0;
        historyAttemptIds = history?.attempts.map(attempt => attempt.id) ?? [];
      } else {
        const cached = readCachedHistory(context, exercise, mode);
        history = cached.record; historyTotal = cached.total; historyAttemptIds = cached.attemptIds;
      }
    } catch { historyStatus = "read-error"; }
  }
  const prior = history?.attempts.filter(attempt => !sessionIds.has(attempt.id)) ?? [];
  function project(attempts: Array<PracticeRecord["attempts"][number]>) {
    return attempts.slice(-20).map((attempt, index, recent) => "passed" in attempt
      ? tappingSummary(attempt, exercise, index >= recent.length - 3)
      : { ...attempt, bpmAvailability: attempt.playbackSettings ? "recorded-per-playback-setting" : "not-recorded" });
  }
  const summary = {
    source: context.source, exerciseId: context.exerciseId, title: context.title, mode, timeSignature: exercise.timeSignature,
    measureCount: exercise.measures.length,
    answerExposed: source.answerExposed,
    ...(mode === "tapping" || source.answerExposed ? { exercise } : {}),
    session: { totalAttempts: session?.attempts.length ?? 0, recentAttempts: project(session?.attempts ?? []) },
    history: { status: historyStatus, totalAttempts: Math.max(0, historyTotal - historyAttemptIds.filter(id => sessionIds.has(id)).length), recentAttempts: project(prior) },
  };
  // 预留页面其余字段的空间；先减少历史，再减少本次较早轮次，保留最新结果。
  const bytes = () => new TextEncoder().encode(JSON.stringify(summary)).length;
  while (bytes() > 40 * 1024 && summary.history.recentAttempts.length) summary.history.recentAttempts.shift();
  while (bytes() > 40 * 1024 && summary.session.recentAttempts.length > 1) summary.session.recentAttempts.shift();
  return summary;
}
