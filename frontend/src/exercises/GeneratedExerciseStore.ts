import { createContext } from "react";
import { parseGeneratedExercise, type GeneratedExercise } from "./GeneratedExercise";

/** 当前页面会话的临时题目。按生成 ID 保留版本；不写入题库，刷新后需从助手对话恢复。 */
export class GeneratedExerciseStore {
  private exposed = new Set<string>();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  hasViewedAnswer = (id: string) => this.exposed.has(id);
  /** 展示过谱面后不可恢复为未查看；同一生成结果跨卡片与训练方式共享。 */
  markAnswerViewed(id: string) {
    if (this.exposed.has(id)) return;
    this.exposed.add(id);
    this.listeners.forEach(listener => listener());
  }

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
