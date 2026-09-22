import { parseRhythmExercise } from "../rhythm/RhythmModel";
import type {
  DictationRecordEvent,
  ExerciseContext,
  PracticeRecord,
  TappingAttempt,
} from "./PracticeRecord";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import {
  recordDictationEvent,
  recordKey,
  recordTappingAttempt,
} from "./practiceRecords";

const STORAGE_KEY = "rhythm-trainer.practice-records";
export const RECORDS_CHANGED = "rhythm-trainer:records-changed";
type RecordStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("记录格式无效");
}
function text(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("记录字段缺失");
}
function count(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error("计数无效");
}
function date(value: unknown) {
  text(value);
  if (!Number.isFinite(Date.parse(value))) throw new Error("记录时间无效");
}

/** 外部数据在存储边界校验；未知版本或损坏数据不能伪装成空列表再覆盖。 */
export function parsePracticeRecord(value: unknown): PracticeRecord {
  object(value);
  for (const key of ["id", "exerciseId", "title"] as const) text(value[key]);
  date(value.startedAt);
  date(value.updatedAt);
  if (!["preset", "random", "custom"].includes(String(value.source)))
    throw new Error("来源无效");
  const exercise = parseRhythmExercise(value.exercise);
  if (value.mode === "tapping") {
    if (!Array.isArray(value.attempts) || value.attempts.length === 0)
      throw new Error("击拍记录为空");
    const ids = new Set<string>();
    for (const item of value.attempts) {
      object(item);
      text(item.id);
      date(item.completedAt);
      if (ids.has(item.id)) throw new Error("轮次重复");
      ids.add(item.id);
      if (
        typeof item.bpm !== "number" ||
        !Number.isFinite(item.bpm) ||
        item.bpm <= 0
      )
        throw new Error("速度无效");
      object(item.timingWindows);
      const { perfectMs, hitMs } = item.timingWindows;
      if (
        typeof perfectMs !== "number" ||
        typeof hitMs !== "number" ||
        !Number.isFinite(perfectMs) ||
        !Number.isFinite(hitMs) ||
        perfectMs < 0 ||
        hitMs <= 0 ||
        perfectMs > hitMs
      )
        throw new Error("判定窗口无效");
      for (const key of [
        "targetCount",
        "hitCount",
        "missCount",
        "wrongTapCount",
      ] as const)
        count(item[key]);
      if (
        (item.hitCount as number) + (item.missCount as number) !==
          item.targetCount ||
        typeof item.passed !== "boolean" ||
        (item.passed &&
          !(item.hitCount === item.targetCount &&
            item.missCount === 0 &&
            item.wrongTapCount === 0))
      )
        throw new Error("击拍结果无效");
    }
  } else if (value.mode === "dictation") {
    if (!Array.isArray(value.attempts) || value.attempts.length === 0)
      throw new Error("听写尝试为空或格式过旧");
    const ids = new Set<string>();
    for (const attempt of value.attempts) {
      object(attempt);
      text(attempt.id);
      date(attempt.startedAt);
      if (ids.has(attempt.id)) throw new Error("尝试重复");
      ids.add(attempt.id);
      if (attempt.completedAt !== null) {
        date(attempt.completedAt);
        if (
          Date.parse(attempt.completedAt as string) <
          Date.parse(attempt.startedAt as string)
        )
          throw new Error("完成时间早于开始时间");
      }
      if (
        typeof attempt.viewedAnswer !== "boolean" ||
        !Array.isArray(attempt.measures) ||
        attempt.measures.length !== exercise.measures.length
      )
        throw new Error("听写尝试无效");
      for (const item of attempt.measures) {
        object(item);
        count(item.questionPlayCount);
        count(item.verificationCount);
        if (
          !["unchecked", "correct", "incorrect"].includes(
            String(item.verdict),
          ) ||
          (item.verdict !== "unchecked" && item.verificationCount === 0)
        )
          throw new Error("小节判定无效");
      }
      if (
        (attempt.completedAt !== null) !==
        (attempt.measures.length > 0 &&
          attempt.measures.every((item) => item.verdict === "correct"))
      )
        throw new Error("完成状态无效");
    }
  } else throw new Error("练习模式无效");
  return structuredClone({ ...value, exercise }) as PracticeRecord;
}

function storage(target?: RecordStorage): RecordStorage {
  try {
    return target ?? globalThis.localStorage;
  } catch {
    throw new Error("无法访问练习记录，请检查浏览器是否允许网站存储。");
  }
}

export function listPracticeRecords(target?: RecordStorage): PracticeRecord[] {
  let raw: string | null;
  try {
    raw = storage(target).getItem(STORAGE_KEY);
  } catch {
    throw new Error("无法读取练习记录，请检查浏览器存储后重试。");
  }
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    object(data);
    if (data.version !== 3 || !Array.isArray(data.records))
      throw new Error("未知版本");
    const records = data.records.map(parsePracticeRecord);
    if (new Set(records.map((item) => item.id)).size !== records.length)
      throw new Error("重复记录");
    if (
      new Set(records.map((item) => recordKey(item, item.exercise, item.mode)))
        .size !== records.length
    )
      throw new Error("重复题目记录");
    return records.sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
    );
  } catch {
    throw new Error(
      "练习记录已损坏或版本暂不支持，原数据未修改。可在本地数据设置中确认清空。",
    );
  }
}

function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(RECORDS_CHANGED));
}
function write(records: PracticeRecord[], target: RecordStorage) {
  try {
    target.setItem(STORAGE_KEY, JSON.stringify({ version: 3, records }));
  } catch {
    throw new Error(
      "练习记录保存失败，浏览器存储可能已满或不可用，请重试保存。",
    );
  }
  notify();
}

export type RecordAction =
  | { mode: "tapping"; attempt: TappingAttempt }
  | {
      mode: "dictation";
      attemptId: string;
      event: DictationRecordEvent;
      at: string;
    };

/** 每次从最新累计值应用待保存行为，成功后调用方才移除队列。
 * 不回写页面进入时的旧快照；已删除的记录也不能被旧页面复活。
 */
export function savePracticeActions(
  context: ExerciseContext,
  exercise: RhythmExercise,
  mode: PracticeRecord["mode"],
  actions: readonly RecordAction[],
  expectedId?: string,
  target?: RecordStorage,
): string | undefined {
  if (!actions.length) throw new Error("没有待保存的练习行为。");
  const destination = storage(target);
  const records = listPracticeRecords(destination);
  const key = recordKey(context, exercise, mode);
  const index = records.findIndex(
    (item) => recordKey(item, item.exercise, item.mode) === key,
  );
  let record: PracticeRecord | null = records[index] ?? null;
  if (expectedId && record?.id !== expectedId)
    throw new Error("这条练习记录已被删除，请从题目列表重新进入后记录。");
  for (const action of actions) {
    if (action.mode !== mode) throw new Error("记录模式不匹配。");
    record =
      action.mode === "tapping"
        ? recordTappingAttempt(
            record?.mode === "tapping" ? record : null,
            context,
            exercise,
            action.attempt,
          )
        : recordDictationEvent(
            record?.mode === "dictation" ? record : null,
            context,
            exercise,
            action.attemptId,
            action.event,
            action.at,
          );
  }
  if (!record || record === records[index]) return record?.id;
  const valid = parsePracticeRecord(record);
  if (index < 0) records.push(valid);
  else records[index] = valid;
  write(records, destination);
  return valid.id;
}

export function deletePracticeRecord(id: string, target?: RecordStorage) {
  const destination = storage(target);
  write(
    listPracticeRecords(destination).filter((item) => item.id !== id),
    destination,
  );
}

/** 只清空练习记录，不删除自定义题库。调用方必须先确认。 */
export function clearPracticeRecords(target?: RecordStorage) {
  try {
    storage(target).removeItem(STORAGE_KEY);
  } catch {
    throw new Error("清空练习记录失败，请检查浏览器存储后重试。");
  }
  notify();
}
