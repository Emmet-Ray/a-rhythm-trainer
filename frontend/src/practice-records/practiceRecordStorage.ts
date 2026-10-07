import { useEffect, useEffectEvent, useState } from "react";
import type { PracticeRecord, ExerciseContext } from "./PracticeRecord";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import { parsePracticeRecord } from "./practiceRecordValidation";
import { recordKey, type RecordFilter, type RecordPeriod } from "./practiceRecords";
export const RECORDS_CHANGED = "rhythm-trainer:records-changed";
export type RecordSummary = Omit<PracticeRecord, "attempts"> & {
  attemptCount: number; passedCount: number; completedCount: number; independentCount: number; viewedAnswerCount: number;
};
export type AttemptPage = { attemptIds?: string[]; record: RecordSummary; attempts: PracticeRecord["attempts"]; page: number; pages: number; total: number; pageSize: number };
export type RecordList = { records: RecordSummary[]; page: number; pages: number; total: number; pageSize: number;
  overview: { count: number; days: number; tappingCount: number; passedCount: number; passRate: number | null;
    dictationCount: number; completedCount: number; independentCount: number } };

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/local-data/records${path}`, { method, cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) throw Error(response.status === 404
    ? "这条练习记录已被删除，请重新进入练习"
    : "无法访问本地记录服务，请确认后端正在运行");
  return response.json();
}

/** 页面按需订阅自己的查询；筛选改变或离页时丢弃迟到响应，不缓存全部历史。 */
export function useRecordQuery<T>(key: string, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data?: T; error: string }>({ key, error: "" });
  const [revision, setRevision] = useState(0);
  const read = useEffectEvent(load);
  useEffect(() => {
    let active = true;
    void read().then(data => { if (active) setState({ key, data, error: "" }); }, error => {
      if (active) setState({ key, error: error instanceof Error ? error.message : "无法读取练习记录" });
    });
    return () => { active = false; };
  }, [key, revision]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(RECORDS_CHANGED, refresh);
    return () => window.removeEventListener(RECORDS_CHANGED, refresh);
  }, []);
  return { ...(state.key === key ? state : { data: undefined, error: "" }), reload: () => setRevision(value => value + 1) };
}

export async function refreshPracticeRecords() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RECORDS_CHANGED));
}
export function recordListQuery(mode: RecordFilter, period: RecordPeriod, page: number, now: Date) {
  const query = new URLSearchParams({ mode, page: String(page), before: now.toISOString(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (period !== "all") {
    const after = new Date(now); after.setHours(0, 0, 0, 0); after.setDate(after.getDate() - (period === "week" ? 6 : 29));
    query.set("after", after.toISOString());
  }
  return `?${query}`;
}
export function queryPracticeRecords(query: string) { return request<RecordList>(query); }
export function queryRecordTotals() { return request<{ recordCount: number; attemptCount: number }>("/summary"); }
export async function queryRecordAttempts(id: string, page: number) {
  return parseAttemptPage(await request<AttemptPage>(`/${encodeURIComponent(id)}?page=${page}`));
}
function parseAttemptPage(value: AttemptPage): AttemptPage {
  const record = parsePracticeRecord({ ...value.record, attempts: value.attempts });
  return { ...value, attempts: record.attempts };
}
type HistoryTarget = { source: ExerciseContext["source"]; exerciseId: string; mode: PracticeRecord["mode"]; exercise: RhythmExercise };
const histories = new Map<string, { record?: PracticeRecord; total: number; attemptIds: string[]; error?: string }>();
export async function queryExerciseHistory(target: HistoryTarget) {
  const key = recordKey({ ...target, title: "" }, target.exercise, target.mode);
  try {
    const value = await request<AttemptPage | null>("/lookup", "POST", target);
    const page = value ? parseAttemptPage(value) : null;
    histories.set(key, { record: page ? { ...page.record, attempts: page.attempts } as PracticeRecord : undefined, total: page?.total ?? 0, attemptIds: page?.attemptIds ?? [] });
    return page;
  } catch (error) {
    histories.set(key, { total: 0, attemptIds: [], error: "历史读取失败" });
    throw error;
  }
}
/** 助手只使用当前题已按需读取的最近尝试；未加载不伪装成无历史。 */
export function readCachedHistory(context: ExerciseContext, exercise: RhythmExercise, mode: PracticeRecord["mode"]) {
  const history = histories.get(recordKey(context, exercise, mode));
  if (!history || history.error) throw Error(history?.error ?? "历史尚未读取");
  return history;
}
export function queryPracticeProgress(targets: HistoryTarget[]) { return request<(RecordSummary | null)[]>("/progress", "POST", { targets }); }
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
      await refreshPracticeRecords();
    });
    queue = task;
    return task;
  };
}
export async function deletePracticeRecord(id: string) {
  await request(`/${encodeURIComponent(id)}`, "DELETE"); histories.clear(); await refreshPracticeRecords();
}
export async function clearPracticeRecords() {
  await request("", "DELETE"); histories.clear(); await refreshPracticeRecords();
}
