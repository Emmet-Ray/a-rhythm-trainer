import type { RhythmElement, RhythmExercise } from "../rhythm/RhythmModel";

export type DictationState = {
  answerMeasures: RhythmElement[][];
  selectedMeasureIndex: number;
  playbackScope: "all" | "measure";
  measureVerdicts: ("unchecked" | "correct" | "incorrect")[];
};

/** 空白作答只继承小节数量，不复制标准答案。播放及遮罩不是可恢复状态。 */
export function createDictationState(exercise: RhythmExercise | null): DictationState {
  return {
    answerMeasures: exercise?.measures.map(() => []) ?? [],
    selectedMeasureIndex: 0,
    playbackScope: "all",
    measureVerdicts: exercise?.measures.map(() => "unchecked") ?? [],
  };
}

export type DictationSnapshot = { binding: string; state: DictationState };

/** 同一编号的题目内容改变也不可沿用答案；随机换题编号区分内容相同的两次生成。 */
export function dictationBinding(exerciseKey: string | number, exercise: RhythmExercise | null) {
  return JSON.stringify([exerciseKey, exercise]);
}

export function restoreDictation(snapshot: DictationSnapshot | null, binding: string, empty: DictationState) {
  return snapshot?.binding === binding ? snapshot.state : empty;
}
