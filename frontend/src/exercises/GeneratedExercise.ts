import { parseRhythmExercise, type RhythmExercise } from "../rhythm/RhythmModel";

export type GeneratedExercise = { id: string; title: string; description: string; mode: "tapping" | "dictation"; exercise: RhythmExercise };

/** 生成练习是外部输入；先验证，再交给展示、训练和编辑器。 */
export function parseGeneratedExercise(value: unknown): GeneratedExercise {
  if (!value || typeof value !== "object") throw new Error("练习数据不完整");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()
    || typeof candidate.title !== "string" || !candidate.title.trim()
    || typeof candidate.description !== "string") throw new Error("练习数据不完整");
  // 旧卡片仅在输入边界转换；内部统一使用明确的训练方式。
  let mode = candidate.mode;
  if (mode === undefined) {
    if (candidate.intent !== undefined && candidate.intent !== "practice" && candidate.intent !== "dictation") throw new Error("练习方式无效");
    mode = candidate.intent === "dictation" ? "dictation" : "tapping";
  }
  if (mode !== "tapping" && mode !== "dictation") throw new Error("练习方式无效");
  return { mode, id: candidate.id, title: candidate.title, description: candidate.description,
    exercise: parseRhythmExercise(candidate.exercise) };
}
