export type { RhythmExercise, RhythmMeasure, RhythmEvent };
export { noteValueToDurationInQuarterNotes };

/***************************************************************/
// 核心模型部分
type NoteValue = "whole" | "half" | "quarter" | "eighth";

type RhythmExercise = {
  // todo：目前是写死的 4/4 拍
  timeSignature: {
    beats: 4;
    beatType: 4;
  };

  // 每个小节约定填满当前拍号；事件不跨小节，暂不支持连音线。
  measures: RhythmMeasure[];
};

type RhythmMeasure = {
  events: RhythmEvent[];
};

type RhythmEvent = {
  kind: "note" | "rest";
  noteValue: NoteValue;
};

/***************************************************************/
// todo: 校验输入内容

/***************************************************************/
// 将核心模型转换为其他类型

function noteValueToDurationInQuarterNotes(noteValue: NoteValue): number {
  // 单位始终是四分音符，不随拍号改变；音符与对应休止符共用时值。
  switch (noteValue) {
    case "whole":
      return 4;
    case "half":
      return 2;
    case "quarter":
      return 1;
    case "eighth":
      return 1 / 2;
    default:
      throw new Error("暂不支持该时值。");
  }
}
