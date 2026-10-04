import { createContext } from "react";
import { parseGeneratedExercise, type GeneratedExercise } from "./GeneratedExercise";

/** 当前身份的临时题目。按生成 ID 保留版本；不写入题库，刷新或切换身份后失效。 */
export class GeneratedExerciseStore {
  private exercises = new Map<string, GeneratedExercise>();

  add(value: GeneratedExercise): void {
    const exercise = parseGeneratedExercise(value);
    this.exercises.set(exercise.id, structuredClone(exercise));
  }

  get(id: string): GeneratedExercise | null {
    const exercise = this.exercises.get(id);
    return exercise ? structuredClone(exercise) : null;
  }
}

export const GeneratedExercisesContext = createContext<GeneratedExerciseStore | null>(null);
