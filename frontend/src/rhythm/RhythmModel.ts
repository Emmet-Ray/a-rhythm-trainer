export type { RhythmExercise, RhythmMeasure, RhythmEvent, RhythmElement, EighthTriplet };
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
  elements: RhythmElement[];
};

type RhythmEvent = {
  kind: "note" | "rest";
  noteValue: NoteValue;
  /** 省略或 0 表示无附点；第一版只支持单附点，音符与休止符共用。 */
  dots?: 0 | 1;
};

/** 第一版仅支持三个无附点八分音符，整组占一四分拍。 */
type TripletNote = { kind: "note"; noteValue: "eighth"; dots?: 0 };
type EighthTriplet = {
  kind: "triplet";
  notes: [TripletNote, TripletNote, TripletNote];
};
type RhythmElement = RhythmEvent | EighthTriplet;

// 音乐时值使用整数；24 可精确表达现有单附点时值及一拍三等分。
// 与 VexFlow 的内部 ticks 无关，只在生成播放时间线时换算为毫秒。
export const TICKS_PER_QUARTER = 24;

/** 展开一个小节的元素（也可用于未填满的小节片段）。
 * 输出事件起点为小节内 tick，组下标指向展开事件；不修改输入。
 * 验证三连音结构，允许非拍头起点；四拍总长由 validateRhythmExercise 检查。
 */
export function expandRhythmElements(elements: readonly RhythmElement[]) {
  const events: { event: RhythmEvent; startTick: number; durationTicks: number }[] = [];
  const tripletGroups: number[][] = [];
  let durationTicks = 0;
  elements.forEach((element, index) => {
    try {
      if (element.kind === "triplet") {
        if (!Array.isArray(element.notes) || element.notes.length !== 3 || element.notes.some(note =>
          note.kind !== "note" || note.noteValue !== "eighth"
          || (note.dots !== undefined && note.dots !== 0))) {
          throw new Error("小三连必须包含三个无附点八分音符，不支持休止符或嵌套组。");
        }
        const group: number[] = [];
        element.notes.forEach(event => {
          group.push(events.length);
          events.push({ event, startTick: durationTicks, durationTicks: 8 });
          durationTicks += 8;
        });
        tripletGroups.push(group);
      } else {
        if (element.kind !== "note" && element.kind !== "rest") throw new Error("事件类型必须为 note 或 rest。");
        const ticks = rhythmEventToDurationInQuarterNotes(element) * TICKS_PER_QUARTER;
        events.push({ event: element, startTick: durationTicks, durationTicks: ticks });
        durationTicks += ticks;
      }
    } catch (error) {
      throw new Error(`第 ${index + 1} 个事件：${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  });
  return { events, tripletGroups, durationTicks };
}

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
    let expanded;
    try {
      expanded = expandRhythmElements(measure.elements);
    } catch (error) {
      throw new Error(`第 ${measureIndex + 1} 小节${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    if (expanded.durationTicks !== 4 * TICKS_PER_QUARTER) {
      throw new Error(`第 ${measureIndex + 1} 小节时值为 ${expanded.durationTicks / TICKS_PER_QUARTER} 拍，应为 4 拍。`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 解析外部完整练习：复制模型字段并校验结构与时值；拒绝零小节，不修改输入。 */
export function parseRhythmExercise(value: unknown): RhythmExercise {
  if (!isRecord(value) || !isRecord(value.timeSignature) || !Array.isArray(value.measures)
    || value.measures.length === 0) throw new Error("练习至少需要一个小节。");

  function parseEvent(event: unknown) {
    if (!isRecord(event)) throw new Error("节奏符号格式无效。");
    return {
      kind: event.kind,
      noteValue: event.noteValue,
      ...(event.dots === undefined ? {} : { dots: event.dots }),
    };
  }

  const exercise = {
    timeSignature: { beats: value.timeSignature.beats, beatType: value.timeSignature.beatType },
    measures: value.measures.map((measure) => {
      if (!isRecord(measure) || !Array.isArray(measure.elements)) throw new Error("小节格式无效。");
      return { elements: measure.elements.map((element: unknown) => {
        if (isRecord(element) && element.kind === "triplet") {
          if (!Array.isArray(element.notes)) throw new Error("小三连格式无效。");
          return { kind: "triplet", notes: element.notes.map(parseEvent) };
        }
        return parseEvent(element);
      }) as RhythmElement[] };
    }),
  } as RhythmExercise;
  // 此时仅保证结构；模型校验成功前不能作为合法练习返回。
  validateRhythmExercise(exercise);
  return exercise;
}
