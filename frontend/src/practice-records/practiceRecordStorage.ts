import { queryOptions } from "@tanstack/react-query";
import { queryClient } from "../query/queryClient";
import type { PracticeRecord, ExerciseContext } from "./PracticeRecord";
import type { PracticeHistory } from "./PracticeHistory";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import { parsePracticeRecord } from "./practiceRecordValidation";
import { recordKey, type RecordFilter, type RecordPeriod } from "./practiceRecords";
export type RecordSummary = Omit<PracticeRecord, "attempts"> & {
  attemptCount: number; passedCount: number; completedCount: number; independentCount: number; viewedAnswerCount: number;
};
export type AttemptPage = { attemptIds?: string[]; record: RecordSummary; attempts: PracticeRecord["attempts"]; page: number; pages: number; total: number; pageSize: number };
export type RecordList = { records: RecordSummary[]; page: number; pages: number; total: number; pageSize: number;
  overview: { count: number; days: number; tappingCount: number; passedCount: number; passRate: number | null;
    dictationCount: number; completedCount: number; independentCount: number } };

async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/local-data/records${path}`, { method, signal, cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) throw Error(response.status === 404
    ? "这条练习记录已被删除，请重新进入练习"
    : "无法访问本地记录服务，请确认后端正在运行");
  return response.json();
}

/** 所有记录读取共享失效边界；写入完成后刷新活跃视图，离页缓存标为过期。 */
function refreshPracticeRecords() {
  // 后台读取不能阻塞下一次练习事实的串行写入。
  void queryClient.invalidateQueries({ queryKey: ["records"] });
}
export const recordTotalsOptions = () => queryOptions({
  queryKey: ["records", "totals"], queryFn: ({ signal }) => request<{ recordCount: number; attemptCount: number }>("/summary", "GET", undefined, signal),
});
export function recordListOptions(mode: RecordFilter, period: RecordPeriod, page: number, now: Date) {
  const search = recordListQuery(mode, period, page, now);
  return queryOptions({ queryKey: ["records", "list", search],
    queryFn: async ({ signal }) => ({ ...await request<RecordList>(search, "GET", undefined, signal), filter: mode, period, asOf: now.toISOString() }),
  });
}
export const recordAttemptsOptions = (id: string, page: number) => queryOptions({
  queryKey: ["records", "attempts", id, page], queryFn: ({ signal }) => queryRecordAttempts(id, page, signal),
});
export const practiceProgressOptions = (targets: HistoryTarget[]) => queryOptions({
  queryKey: ["records", "progress", targets], queryFn: ({ signal }) => request<(RecordSummary | null)[]>("/progress", "POST", { targets }, signal),
});
function recordListQuery(mode: RecordFilter, period: RecordPeriod, page: number, now: Date) {
  const query = new URLSearchParams({ mode, page: String(page), before: now.toISOString(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (period !== "all") {
    const after = new Date(now); after.setHours(0, 0, 0, 0); after.setDate(after.getDate() - (period === "week" ? 6 : 29));
    query.set("after", after.toISOString());
  }
  return `?${query}`;
}
async function queryRecordAttempts(id: string, page: number, signal?: AbortSignal) {
  return parseAttemptPage(await request<AttemptPage>(`/${encodeURIComponent(id)}?page=${page}`, "GET", undefined, signal));
}
function parseAttemptPage(value: AttemptPage): AttemptPage {
  const record = parsePracticeRecord({ ...value.record, attempts: value.attempts });
  return { ...value, attempts: record.attempts };
}
type HistoryTarget = { source: ExerciseContext["source"]; exerciseId: string; mode: PracticeRecord["mode"]; exercise: RhythmExercise };
export function exerciseHistoryOptions(target: HistoryTarget) {
  return queryOptions({
    queryKey: ["records", "history", recordKey({ ...target, title: "" }, target.exercise, target.mode)],
    queryFn: async ({ signal }) => {
      const value = await request<AttemptPage | null>("/lookup", "POST", target, signal);
      return value ? parseAttemptPage(value) : null;
    },
  });
}
/** 只读取查询缓存；不发请求，不把未加载或失败当成没有记录。 */
export function readExerciseHistory(context: ExerciseContext, exercise: RhythmExercise, mode: PracticeRecord["mode"]): PracticeHistory {
  const state = queryClient.getQueryState<AttemptPage | null>(exerciseHistoryOptions({ ...context, exercise, mode }).queryKey);
  if (state?.status === "error") return { status: "read-error" };
  if (state?.data === undefined) return { status: "not-loaded" };
  const page = state.data;
  return { status: "available", record: page ? { ...page.record, attempts: page.attempts } as PracticeRecord : undefined,
    total: page?.total ?? 0, attemptIds: page?.attemptIds ?? [] };
}
export function summaryAchievement(record?: RecordSummary | null) {
  if (!record) return "";
  return record.mode === "tapping" ? record.passedCount > 0 ? "已通过" : ""
    : record.independentCount > 0 ? "已独立完成" : record.completedCount > 0 ? "已完成" : "";
}

/** 一个访问独占自己的尝试 ID；串行保存累计快照，创建重试不会重复插入。
 * 一旦绑定档案，只调用该档案下的创建/更新接口，404 不自动重新创建档案。
 * 不提供跨页面的删除代数或更新版本控制。
 */
export function createPracticeRecordWriter() {
  let recordId: string | undefined;
  let key: string | undefined;
  const saved = new Map<string, string>();
  let queue: Promise<unknown> = Promise.resolve();
  return (record: PracticeRecord): Promise<void> => {
    const incoming = parsePracticeRecord(structuredClone(record));
    const nextKey = recordKey(incoming, incoming.exercise, incoming.mode);
    if (key !== undefined && key !== nextKey) return Promise.reject(Error("不能在同一次记录访问中切换题目"));
    key = nextKey;
    const task = queue.catch(() => {}).then(async () => {
      if (!recordId) {
        const created = await request<{ id: string }>("", "POST", incoming);
        if (typeof created.id !== "string" || !created.id) throw Error("记录服务响应格式错误");
        recordId = created.id;
        for (const attempt of incoming.attempts) saved.set(attempt.id, JSON.stringify(attempt));
      } else {
        for (const attempt of incoming.attempts) {
          const value = JSON.stringify(attempt);
          if (saved.get(attempt.id) === value) continue;
          const path = `/${encodeURIComponent(recordId)}/attempts`;
          await request(saved.has(attempt.id) ? `${path}/${encodeURIComponent(attempt.id)}` : path,
            saved.has(attempt.id) ? "PUT" : "POST", { attempt, title: incoming.title, updatedAt: incoming.updatedAt });
          saved.set(attempt.id, value);
        }
      }
      refreshPracticeRecords();
    });
    queue = task;
    return task;
  };
}
export async function deletePracticeRecord(id: string) {
  await request(`/${encodeURIComponent(id)}`, "DELETE"); queryClient.removeQueries({ queryKey: ["records", "history"], type: "inactive" }); refreshPracticeRecords();
}
export async function clearPracticeRecords() {
  await request("", "DELETE"); queryClient.removeQueries({ queryKey: ["records", "history"], type: "inactive" }); refreshPracticeRecords();
}
