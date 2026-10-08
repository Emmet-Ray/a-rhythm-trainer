import type { RhythmExercise } from "../rhythm/RhythmModel";

export type CustomMode = "tapping" | "dictation";
export type CustomExercise = {
  id: string;
  name: string;
  mode: CustomMode;
  exercise: RhythmExercise;
};

/** 可编辑的题目内容；保存身份由所在工作区持有。 */
export type ExerciseDraft = Pick<CustomExercise, "name" | "mode" | "exercise">;
