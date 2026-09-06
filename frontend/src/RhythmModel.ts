export type { RhythmExercise, RhythmMeasure, RhythmEvent };
export { noteValueToDurationInQuarterNotes, rhythmEventToDurationInQuarterNotes, validateRhythmExercise };

/***************************************************************/
// 核心模型部分
type NoteValue = "whole" | "half" | "quarter" | "eighth" | "sixteenth";

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
  /** 省略或 0 表示无附点；第一版只支持单附点，音符与休止符共用。 */
  dots?: 0 | 1;
};

/***************************************************************/
/** 返回完整事件的四分音符单位时值；拒绝尚未支持的附点数。 */
function rhythmEventToDurationInQuarterNotes(event: RhythmEvent): number {
  if (event.dots !== undefined && event.dots !== 0 && event.dots !== 1) {
    throw new Error("附点数只支持 0 或 1。");
  }
  return noteValueToDurationInQuarterNotes(event.noteValue) * (event.dots === 1 ? 1.5 : 1);
}

/** 校验当前 4/4 模型：每个已存在的小节必须填满四拍，不自动补拍或拆分。
 * 零小节保留为空练习；空小节不同于全小节休止，必须显式录入休止符。
 * 这是类型化练习的内容校验，不是任意外部 JSON 的结构解析器。
 */
function validateRhythmExercise(exercise: RhythmExercise): void {
  if (exercise.timeSignature.beats !== 4 || exercise.timeSignature.beatType !== 4) {
    throw new Error("目前只支持 4/4 拍。");
  }
  exercise.measures.forEach((measure, measureIndex) => {
    let duration = 0;
    measure.events.forEach((event, eventIndex) => {
      try {
        if (event.kind !== "note" && event.kind !== "rest") throw new Error("事件类型必须为 note 或 rest。");
        duration += rhythmEventToDurationInQuarterNotes(event);
      } catch (error) {
        throw new Error(`第 ${measureIndex + 1} 小节第 ${eventIndex + 1} 个事件：${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    });
    if (duration !== 4) {
      throw new Error(`第 ${measureIndex + 1} 小节时值为 ${duration} 拍，应为 4 拍。`);
    }
  });
}

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
    case "sixteenth":
      return 1 / 4;
    default:
      throw new Error("暂不支持该时值。");
  }
}
