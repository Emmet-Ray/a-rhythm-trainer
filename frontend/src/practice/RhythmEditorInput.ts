import { getMeasureTicks, expandRhythmElements, type RhythmElement, type RhythmExercise } from "../rhythm/RhythmModel";

export { rhythmPatterns as rhythmInputPatterns } from "../rhythm/RhythmPatterns";

/** 原子追加：超出容量返回 null，不修改草稿；成功时复制输入，普通组合不保留分组。 */
export function appendRhythmInput(current: readonly RhythmElement[], input: readonly RhythmElement[], signature: RhythmExercise["timeSignature"]): RhythmElement[] | null {
  const next = [...current, ...input];
  if (expandRhythmElements(next).durationTicks > getMeasureTicks(signature)) return null;
  return [...current, ...structuredClone(input)];
}
