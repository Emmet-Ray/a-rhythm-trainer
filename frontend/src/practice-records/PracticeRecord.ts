import type { RhythmExercise } from "../rhythm/RhythmModel";
import type { PracticeResult, TimingWindows } from "../rhythm/RhythmTiming";

export type ExerciseContext = {
  source: "preset" | "random" | "custom";
  exerciseId: string;
  title: string;
};

type RecordBase = ExerciseContext & {
  id: string;
  startedAt: string;
  updatedAt: string;
  exercise: RhythmExercise;
};

export type TappingAttempt = PracticeResult & {
  id: string;
  completedAt: string;
  bpm: number;
  // 保存本轮实际窗口，避免偏好或档位定义改变后误解旧成绩。
  timingWindows: TimingWindows;
};

export type TappingRecord = RecordBase & {
  mode: "tapping";
  attempts: TappingAttempt[];
};

export type DictationMeasureRecord = {
  questionPlayCount: number;
  verificationCount: number;
  verdict: "unchecked" | "correct" | "incorrect";
};

export type DictationAttempt = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  viewedAnswer: boolean;
  measures: DictationMeasureRecord[];
};

export type DictationRecord = RecordBase & {
  mode: "dictation";
  attempts: DictationAttempt[];
};

export type PracticeRecord = TappingRecord | DictationRecord;

/** 组件报告事实，记录模块决定如何累计；不接收每次编辑的答案日志。 */
export type DictationRecordEvent =
  | { type: "play"; scope: "all" | number }
  | { type: "verify"; measureIndex: number; correct: boolean }
  | { type: "edit"; measureIndex: number }
  | { type: "view-answer" };
