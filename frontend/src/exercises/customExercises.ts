import type { RhythmExercise } from "../rhythm/RhythmModel";

export type CustomMode = "tapping" | "dictation";
export type CustomExercise = {
  id: string;
  name: string;
  mode: CustomMode;
  exercise: RhythmExercise;
};
