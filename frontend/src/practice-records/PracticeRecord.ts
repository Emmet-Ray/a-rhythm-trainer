import type { RhythmElement, RhythmExercise } from "../rhythm/RhythmModel";
import type { PracticeResult, TimingWindows } from "../rhythm/RhythmTiming";

export const exerciseSources = { preset: "预设", random: "随机", custom: "自定义", ai: "AI" } as const;

export type ExerciseContext = {
  source: keyof typeof exerciseSources;
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
  /** 本轮开始时的节拍器设置；旧记录可能没有。 */
  metronomeEnabled?: boolean;
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

export type DictationPlaybackSettings = { bpm: number; metronomeEnabled: boolean; count: number };

export type DictationAttempt = {
  answerMeasures?: RhythmElement[][];
  playbackSettings?: DictationPlaybackSettings[];
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
  | { type: "play"; scope: "all" | number; bpm?: number; metronomeEnabled?: boolean }
  | { type: "verify"; measureIndex: number; correct: boolean; answerMeasures?: RhythmElement[][] }
  | { type: "edit"; measureIndex: number; answerMeasures?: RhythmElement[][] }
  | { type: "view-answer" };
