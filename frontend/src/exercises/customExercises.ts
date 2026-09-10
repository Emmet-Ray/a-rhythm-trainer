import { validateRhythmExercise, type RhythmElement, type RhythmExercise } from "../rhythm/RhythmModel";

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

/** 只复制模型字段并检查容器结构，再交给模型验证枚举值、三连音与时值。 */
function parseExercise(value: unknown): RhythmExercise {
  if (!isRecord(value) || !isRecord(value.timeSignature) || !Array.isArray(value.measures)
    || value.measures.length === 0) throw new Error("练习至少需要一个小节。");

  function parseEvent(event: unknown) {
    if (!isRecord(event)) throw new Error("节奏符号格式无效。");
    return {
      kind: event.kind,
      noteValue: event.noteValue,
      ...(event.dots === undefined ? {} : { dots: event.dots }),
    };
  }

  const exercise = {
    timeSignature: { beats: value.timeSignature.beats, beatType: value.timeSignature.beatType },
    measures: value.measures.map((measure) => {
      if (!isRecord(measure) || !Array.isArray(measure.elements)) throw new Error("小节格式无效。");
      return { elements: measure.elements.map((element: unknown) => {
        if (isRecord(element) && element.kind === "triplet") {
          if (!Array.isArray(element.notes)) throw new Error("小三连格式无效。");
          return { kind: "triplet", notes: element.notes.map(parseEvent) };
        }
        return parseEvent(element);
      }) as RhythmElement[] };
    }),
  } as RhythmExercise;
  // 此时仅保证结构；模型校验成功前不能作为合法练习返回。
  validateRhythmExercise(exercise);
  return exercise;
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

function readAll(storage: StorageAccess): CustomExercise[] {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("无法读取本地练习，请检查浏览器存储后重试。");
  }
  if (raw === null) return [];

  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.exercises)) throw new Error("无效存储格式");
    const ids = new Set<string>();
    return data.exercises.map((item: unknown) => {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)
        || typeof item.name !== "string" || !item.name.trim()) throw new Error("无效题目");
      requireMode(item.mode);
      ids.add(item.id);
      return { id: item.id, name: item.name.trim(), mode: item.mode, exercise: parseExercise(item.exercise) };
    });
  } catch {
    throw new Error("本地练习数据损坏或版本暂不支持，无法读取或追加保存；原数据未修改。");
  }
}

/** 每次读取最新存储，按模式返回独立快照；读取失败抛错，不回退成空题库。 */
export function listCustomExercises(mode: CustomMode, storage?: StorageAccess): CustomExercise[] {
  requireMode(mode);
  return readAll(getStorage(storage)).filter((item) => item.mode === mode);
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
  const exercise = parseExercise(input.exercise);
  const target = getStorage(storage);
  const existing = readAll(target);
  const item = { id: `custom-${crypto.randomUUID()}`, name: input.name.trim(), mode: input.mode, exercise };
  if (existing.some((previous) => previous.id === item.id)) throw new Error("生成题目编号失败，请重试。");
  try {
    target.setItem(STORAGE_KEY, JSON.stringify({ version: 1, exercises: [item, ...existing] }));
  } catch {
    throw new Error("保存失败，浏览器存储可能已满或不可用。草稿仍保留，请检查后重试。");
  }
  return item;
}
