import { parseRhythmExercise, type RhythmExercise } from "../rhythm/RhythmModel";

export type GeneratedExercise = { id: string; title: string; description: string; exercise: RhythmExercise };

/** 生成练习是外部输入；先验证，再交给展示、训练和编辑器。 */
export function parseGeneratedExercise(value: unknown): GeneratedExercise {
  if (!value || typeof value !== "object") throw new Error("练习数据不完整");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()
    || typeof candidate.title !== "string" || !candidate.title.trim()
    || typeof candidate.description !== "string") throw new Error("练习数据不完整");
  return { id: candidate.id, title: candidate.title, description: candidate.description,
    exercise: parseRhythmExercise(candidate.exercise) };
}
