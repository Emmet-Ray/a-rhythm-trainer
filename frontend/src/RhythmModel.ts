export type { RhythmExercise };
export { noteValueToDurationInQuarterNotes };

/***************************************************************/
// 核心模型部分
type NoteValue = "quarter" | "eighth";

type RhythmExercise = {
  // todo：目前是写死的 4/4 拍
  timeSignature: {
    beats: 4;
    beatType: 4;
  };

  events: RhythmEvent[];
};

type RhythmEvent = {
  kind: "note" | "rest";
  noteValue: NoteValue;
};

/***************************************************************/
// 将核心模型转换为其他类型

function noteValueToDurationInQuarterNotes(noteValue: NoteValue): number {
  // 将时值名称转换为以四分音符为单位的拍数。四分音符为 1 拍，八分音符为 1/2 拍。
  switch (noteValue) {
    case "quarter":
      return 1;
    case "eighth":
      return 1 / 2;
    default:
      throw new Error("暂不支持该时值。");
  }
}
