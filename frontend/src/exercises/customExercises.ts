import { parseRhythmExercise, type RhythmExercise } from "../rhythm/RhythmModel";

export type CustomMode = "tapping" | "dictation";
export type CustomExercise = {
  id: string;
  name: string;
  mode: CustomMode;
  exercise: RhythmExercise;
};
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
const STORAGE_KEY = "rhythm-trainer.custom-exercises";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireMode(mode: unknown): asserts mode is CustomMode {
  if (mode !== "tapping" && mode !== "dictation") throw new Error("请选择击拍练习或节奏听写。");
}

function getStorage(storage?: StorageAccess): StorageAccess {
  try {
    const result = storage ?? globalThis.localStorage;
    if (!result) throw new Error("存储不可用");
    return result;
  } catch {
    throw new Error("无法访问本地练习，请检查浏览器是否允许网站存储后重试。");
  }
}

function readAll(storage: StorageAccess): { exercises: CustomExercise[]; estimatedBytes: number } {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("无法读取本地练习，请检查浏览器存储后重试。");
  }
  if (raw === null) return { exercises: [], estimatedBytes: 0 };

  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.exercises)) throw new Error("无效存储格式");
    const ids = new Set<string>();
    const exercises = data.exercises.map((item: unknown) => {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)
        || typeof item.name !== "string" || !item.name.trim()) throw new Error("无效题目");
      requireMode(item.mode);
      ids.add(item.id);
      return { id: item.id, name: item.name.trim(), mode: item.mode, exercise: parseRhythmExercise(item.exercise) };
    });
    // 按 UTF-16 代码单元估算键与原始值的大小，不代表浏览器实际磁盘占用或配额。
    return { exercises, estimatedBytes: (STORAGE_KEY.length + raw.length) * 2 };
  } catch {
    throw new Error("本地练习数据损坏或版本暂不支持，无法读取或追加保存；原数据未修改。");
  }
}

/** 每次读取最新存储，按模式返回独立快照；读取失败抛错，不回退成空题库。 */
export function listCustomExercises(mode: CustomMode, storage?: StorageAccess): CustomExercise[] {
  requireMode(mode);
  return readAll(getStorage(storage)).exercises.filter((item) => item.mode === mode);
}

/** 一次读取并校验完整题库；失败时抛错，不把未知数量当作零。 */
export function getCustomExerciseSummary(storage?: StorageAccess) {
  const { exercises, estimatedBytes } = readAll(getStorage(storage));
  const tapping = exercises.filter(item => item.mode === "tapping").length;
  return { total: exercises.length, tapping, dictation: exercises.length - tapping, estimatedBytes };
}

/** 删除当前浏览器的全部本地练习（包括损坏数据）；调用方负责确认，不影响其他存储项。 */
export function clearCustomExercises(storage?: Pick<Storage, "removeItem">): void {
  try {
    (storage ?? globalThis.localStorage).removeItem(STORAGE_KEY);
  } catch {
    throw new Error("清空本地练习失败，请检查浏览器是否允许网站存储后重试。");
  }
}

/**
 * 校验并新建题目快照，只保存 ID、名称、模式和节奏模型，不保存播放配置。
 * 首次保存生成稳定 ID；同名题目不覆盖，最新保存排在前面，不修改输入。
 * 每次先读取最新题库，旧数据异常时拒绝覆盖；只有 setItem 成功才返回。
 * 可注入最小 Storage 接口用于测试。单次写入完整版本化 JSON，不承诺跨标签页并发事务。
 */
export function saveCustomExercise(input: Omit<CustomExercise, "id">, storage?: StorageAccess): CustomExercise {
  requireMode(input.mode);
  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("请输入练习名称。");
  const exercise = parseRhythmExercise(input.exercise);
  const target = getStorage(storage);
  const { exercises: existing } = readAll(target);
  const item = { id: `custom-${crypto.randomUUID()}`, name: input.name.trim(), mode: input.mode, exercise };
  if (existing.some((previous) => previous.id === item.id)) throw new Error("生成题目编号失败，请重试。");
  try {
    target.setItem(STORAGE_KEY, JSON.stringify({ version: 1, exercises: [item, ...existing] }));
  } catch {
    throw new Error("保存失败，浏览器存储可能已满或不可用。草稿仍保留，请检查后重试。");
  }
  return item;
}
