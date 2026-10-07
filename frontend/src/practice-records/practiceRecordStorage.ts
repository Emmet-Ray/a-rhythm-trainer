import type { PracticeRecord, ExerciseContext } from "./PracticeRecord";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import { parsePracticeRecords } from "./practiceRecordValidation";
import { applyPracticeActions, type RecordAction } from "./practiceRecords";
export type { RecordAction } from "./practiceRecords";
export const RECORDS_CHANGED = "rhythm-trainer:records-changed";
type Snapshot = { revision: number; records: PracticeRecord[] };
let snapshot: Snapshot | null = null;
let error = "正在读取练习记录";
let sequence = 0;
let queue: Promise<unknown> = Promise.resolve();
function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(RECORDS_CHANGED));
}
function parse(value: unknown): Snapshot {
  const data = value as Snapshot;
  if (
    !data ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0 ||
    !Array.isArray(data.records)
  )
    throw Error("记录服务响应格式错误");
  return {
    revision: data.revision,
    records: parsePracticeRecords(data.records),
  };
}
async function request(options?: RequestInit): Promise<Snapshot> {
  const response = await fetch("/api/local-data/records", {
    cache: "no-store",
    ...options,
  });
  if (!response.ok)
    throw Object.assign(
      Error(
        response.status === 409
          ? "记录已更新，请重试"
          : "无法访问本地记录服务，请确认后端正在运行",
      ),
      { status: response.status },
    );
  return parse(await response.json());
}
export async function refreshPracticeRecords() {
  const version = ++sequence;
  try {
    const value = await request();
    if (version === sequence) {
      snapshot = value;
      error = "";
      notify();
    }
  } catch (cause) {
    if (version === sequence) {
      error = cause instanceof Error ? cause.message : "读取失败";
      notify();
    }
    throw cause;
  }
}
export function listPracticeRecords(): PracticeRecord[] {
  if (error || !snapshot) throw Error(error || "正在读取练习记录");
  return structuredClone(snapshot.records).sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
  );
}
/** 串行处理本标签页写入；跨标签页冲突时重新读取并重放行为，不覆盖完整旧快照。 */
function mutate<T>(
  change: (records: PracticeRecord[]) => {
    records: PracticeRecord[];
    result: T;
  },
  operationId: string = crypto.randomUUID(),
): Promise<T> {
  const task = queue
    .catch(() => {})
    .then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const base = await request();
        const changed = change(base.records);
        try {
          const saved = await request({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              revision: base.revision,
              records: parsePracticeRecords(changed.records),
              operation_id: operationId,
            }),
          });
          ++sequence;
          snapshot = saved;
          error = "";
          notify();
          return changed.result;
        } catch (cause) {
          if ((cause as { status?: number }).status !== 409 || attempt === 3)
            throw cause;
        }
      }
      throw Error("保存冲突，请重试");
    });
  queue = task;
  return task;
}
export async function savePracticeActions(
  context: ExerciseContext,
  exercise: RhythmExercise,
  mode: PracticeRecord["mode"],
  actions: readonly RecordAction[],
  expectedId?: string,
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ context, exercise, mode, actions, expectedId }),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const operationId = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return mutate(
    (records) =>
      applyPracticeActions(
        records,
        context,
        exercise,
        mode,
        actions,
        expectedId,
      ),
    operationId,
  );
}
export function deletePracticeRecord(id: string) {
  return mutate((records) => ({
    records: records.filter((item) => item.id !== id),
    result: undefined,
  }));
}
export function clearPracticeRecords() {
  return mutate(() => ({ records: [], result: undefined }));
}
