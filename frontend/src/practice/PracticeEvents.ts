import type { RhythmElement } from "../rhythm/RhythmModel";
import type { PracticeResult, TimingWindows } from "../rhythm/RhythmTiming";

/** 开始一轮时提供实际条件；返回的回调接受该轮结果及迟到输入产生的修正。 */
export type TappingAttemptRecorder = (conditions: { bpm: number; metronomeEnabled?: boolean; timingWindows: TimingWindows }) => ((result: PracticeResult) => void) | undefined;

/** 组件报告事实，记录模块决定如何累计；不接收每次编辑的答案日志。 */
export type DictationEvent =
  | { type: "play"; scope: "all" | number; bpm?: number; metronomeEnabled?: boolean }
  | { type: "verify"; measureIndex: number; correct: boolean; answerMeasures?: RhythmElement[][] }
  | { type: "edit"; measureIndex: number; answerMeasures?: RhythmElement[][] }
  | { type: "view-answer" };
