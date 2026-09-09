import { validateRhythmExercise, type RhythmEvent, type RhythmExercise } from "./RhythmModel";

export type GenerationConfig = {
  mode: "tapping" | "dictation";
  rule: "basic";
};

/** 根据生成配置返回一份已校验、可独立修改的练习，不修改配置。
 * 当前 basic 规则按训练方式返回固定的两小节 4/4 示例，尚未随机化。
 * 不依赖 BPM、预设题库或页面状态；同配置多次生成内容相同，但不共享可变数据。
 */
export function generateExercise(config: GenerationConfig): RhythmExercise {
  if (config?.mode !== "tapping" && config?.mode !== "dictation") {
    throw new Error("生成练习目前只支持击拍或节奏听写模式。");
  }
  if (config.rule !== "basic") {
    throw new Error("生成练习目前只支持 basic（基础节奏）规则。");
  }

  // 先用明确的固定输出验证生成流程，之后在这里替换或扩展出题规则。
  const measures: RhythmEvent["noteValue"][][] = config.mode === "tapping"
    ? [["quarter", "quarter", "quarter", "quarter"], ["half", "quarter", "quarter"]]
    : [["half", "quarter", "quarter"], ["whole"]];
  const exercise: RhythmExercise = {
    timeSignature: { beats: 4, beatType: 4 },
    measures: measures.map(values => ({
      elements: values.map(noteValue => ({ kind: "note", noteValue })),
    })),
  };
  validateRhythmExercise(exercise);
  return exercise;
}
