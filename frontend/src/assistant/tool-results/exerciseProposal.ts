import { parseRhythmExercise, type RhythmExercise } from "../../rhythm/RhythmModel";

export type ExerciseProposal = { id: string; title: string; description: string; exercise: RhythmExercise };

/** 工具详情是外部输入；先验证，再交给谱面和编辑器。 */
export function parseExerciseProposal(value: unknown): ExerciseProposal {
  if (!value || typeof value !== "object") throw new Error("练习数据不完整");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()
    || typeof candidate.title !== "string" || !candidate.title.trim()
    || typeof candidate.description !== "string") throw new Error("练习数据不完整");
  return { id: candidate.id, title: candidate.title, description: candidate.description,
    exercise: parseRhythmExercise(candidate.exercise) };
}
