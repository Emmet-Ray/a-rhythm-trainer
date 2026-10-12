import { useAssistantPageSection } from "./assistantContext";
import { buildPracticeContextSummary } from "./practiceContextSummary";
import type { RecordDetailSnapshot } from "../practice-records/recordDetailContext";

/** 只发布当前页的尝试；查看题目预览前遵循听写答案隐藏规则。 */
export function RecordDetailAssistantContext({ record, visibleRecord, tab, page, pages, totalAttempts }: RecordDetailSnapshot) {
  useAssistantPageSection("recordDetail", { tab, period: "all", page, pages, totalAttempts, recordId: record.id,
    summary: buildPracticeContextSummary({ context: record, exercise: record.exercise, mode: record.mode,
      session: visibleRecord, answerExposed: tab === "score" || (record.mode === "dictation" && record.attempts.some(attempt => attempt.viewedAnswer)) }, { status: "unavailable" }) });
  return null;
}
