import { expandRhythmElements, TICKS_PER_QUARTER, validateRhythmExercise, type RhythmElement, type RhythmExercise } from "../rhythm/RhythmModel";

/** 随机主题独立于预设题库；综合主题通过多选表达，不重复登记材料。 */
export const randomTopics = [
  { id: "basic-notes", label: "全音符、二分音符、四分音符" },
  { id: "eighth-notes", label: "八分音符、二平均节奏" },
  { id: "rests", label: "四种休止符" },
] as const;
export type RandomTopicId = typeof randomTopics[number]["id"];
export const randomMeasureCounts = [1, 2, 4] as const;
export const DEFAULT_RANDOM_MEASURE_COUNT = 2;

/** topics 是允许范围，不保证逐题覆盖；不隐式加入基础主题，允许纯休止符。 */
export type RandomGenerationConfig = {
  mode: "tapping" | "dictation";
  topics: readonly RandomTopicId[];
  measureCount: typeof randomMeasureCounts[number];
};

type PatternDefinition = {
  id: string;
  /** 所列主题必须全部选中，才能使用这份材料。 */
  requires: readonly RandomTopicId[];
  elements: RhythmElement[];
  /** 4/4 小节中的零基四分拍位置；这是出题策略，不是模型的音乐合法性限制。 */
  startBeats: readonly number[];
};

// 材料可以包含普通事件或三连音组；时值由模型计算，不另存一份易失同步的拍数。
// 新主题在上方登记，材料在这里登记；跨主题组合使用 requires，不散落到生成算法中。
const patterns: readonly PatternDefinition[] = [
  { id: "whole-note", requires: ["basic-notes"], elements: [{ kind: "note", noteValue: "whole" }], startBeats: [0] },
  { id: "half-note", requires: ["basic-notes"], elements: [{ kind: "note", noteValue: "half" }], startBeats: [0, 2] },
  { id: "quarter-note", requires: ["basic-notes"], elements: [{ kind: "note", noteValue: "quarter" }], startBeats: [0, 1, 2, 3] },
  { id: "two-eighths", requires: ["eighth-notes"], elements: [{ kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "eighth" }], startBeats: [0, 1, 2, 3] },
  { id: "whole-rest", requires: ["rests"], elements: [{ kind: "rest", noteValue: "whole" }], startBeats: [0] },
  { id: "half-rest", requires: ["rests"], elements: [{ kind: "rest", noteValue: "half" }], startBeats: [0, 2] },
  { id: "quarter-rest", requires: ["rests"], elements: [{ kind: "rest", noteValue: "quarter" }], startBeats: [0, 1, 2, 3] },
  { id: "eighth-rest", requires: ["rests"], elements: [{ kind: "rest", noteValue: "eighth" }], startBeats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  { id: "eighth-note-rest", requires: ["eighth-notes", "rests"], elements: [{ kind: "note", noteValue: "eighth" }, { kind: "rest", noteValue: "eighth" }], startBeats: [0, 1, 2, 3] },
  { id: "eighth-rest-note", requires: ["eighth-notes", "rests"], elements: [{ kind: "rest", noteValue: "eighth" }, { kind: "note", noteValue: "eighth" }], startBeats: [0, 1, 2, 3] },
];

/** 校验配置并解析候选材料快照，不随机、不填小节、不修改输入。
 * 每个材料只出现一次；依赖主题全部满足才启用。输出使用模型的整数 tick。
 * 生成器还需筛选起点、剩余时值，以及剩余空间能否由候选材料填满。
 */
export function resolveRandomPatterns(config: RandomGenerationConfig) {
  if (config?.mode !== "tapping" && config?.mode !== "dictation") throw new Error("请选择击拍或节奏听写模式。");
  if (!Array.isArray(config.topics) || config.topics.length === 0) throw new Error("请至少选择一个主题。");
  if (config.topics.some(id => !randomTopics.some(topic => topic.id === id))) throw new Error("包含尚未支持的随机主题。");
  if (!randomMeasureCounts.includes(config.measureCount)) throw new Error("小节数只支持 1、2、4。");
  const selected = new Set(config.topics);
  return patterns.filter(pattern => pattern.requires.every(id => selected.has(id))).map(pattern => ({
    id: pattern.id,
    elements: structuredClone(pattern.elements),
    durationTicks: expandRhythmElements(pattern.elements).durationTicks,
    startTicks: pattern.startBeats.map(beat => beat * TICKS_PER_QUARTER),
  }));
}

/** 生成固定 4/4 的完整题目，每步在可完成小节的材料中等概率选择。
 * 不保证主题覆盖或完整题目等概率，允许重复题目及全休止符。
 * random 每次必须返回 [0, 1) 内的有限数；可注入以复现结果和测试边界。
 * 不修改配置，结果中的材料逐次深拷贝，不共享可变事件或三连音组。
 */
export function generateRandomExercise(config: RandomGenerationConfig, random: () => number = Math.random): RhythmExercise {
  const materials = resolveRandomPatterns(config);
  const measureTicks = 4 * TICKS_PER_QUARTER;
  // 材料定义属于代码边界：无效时值会破坏从后往前计算的前提，必须提前拒绝。
  if (materials.some(p => !Number.isInteger(p.durationTicks) || p.durationTicks <= 0)) {
    throw new Error("随机材料必须具有正整数 tick 时值。");
  }
  const canFinish: boolean[] = Array(measureTicks + 1).fill(false);
  canFinish[measureTicks] = true;
  const choices: (typeof materials)[] = Array.from({ length: measureTicks }, () => []);
  for (let position = measureTicks - 1; position >= 0; position--) {
    choices[position] = materials.filter(pattern => {
      const end = position + pattern.durationTicks;
      return pattern.startTicks.includes(position) && end <= measureTicks && canFinish[end];
    });
    canFinish[position] = choices[position].length > 0;
  }
  if (!canFinish[0]) throw new Error("所选主题无法组成完整的 4/4 小节，请调整主题范围。");

  const exercise: RhythmExercise = {
    timeSignature: { beats: 4, beatType: 4 },
    measures: Array.from({ length: config.measureCount }, () => {
      const elements: RhythmElement[] = [];
      let position = 0;
      while (position < measureTicks) {
        const value = random();
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("随机数必须是 [0, 1) 内的有限数。");
        const candidates = choices[position];
        const chosen = candidates[Math.floor(value * candidates.length)];
        elements.push(...structuredClone(chosen.elements));
        position += chosen.durationTicks;
      }
      return { elements };
    }),
  };
  validateRhythmExercise(exercise);
  return exercise;
}
