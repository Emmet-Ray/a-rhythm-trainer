import { expandRhythmElements, TICKS_PER_QUARTER, validateRhythmExercise, type RhythmElement, type RhythmEvent, type RhythmExercise } from "../rhythm/RhythmModel";
import { rhythmPatterns } from "../rhythm/RhythmPatterns";

export const randomMeasureCounts = [1, 2, 4] as const;
export const DEFAULT_RANDOM_MEASURE_COUNT = 2;

const noteValues = [
  { value: "whole", label: "全" }, { value: "half", label: "二分" },
  { value: "quarter", label: "四分" }, { value: "eighth", label: "八分" },
  { value: "sixteenth", label: "十六分" },
] as const;
type MaterialId = `${typeof noteValues[number]["value"]}-${"note" | "rest"}`
  | "dotted-quarter-note" | "dotted-eighth-note"
  | typeof rhythmPatterns[number]["id"] | "eighth-triplet";
type RandomMaterial = {
  id: MaterialId;
  label: string;
  group: "音符" | "休止符" | "节奏型";
  elements: readonly RhythmElement[];
  /** 普通短音符按自身网格放置；节奏型整组从拍头开始，长节奏型从第 1、3 拍开始。 */
  startBeats: readonly number[];
};

function singleMaterial(kind: RhythmEvent["kind"], value: typeof noteValues[number]): RandomMaterial {
  const element: RhythmEvent = { kind, noteValue: value.value };
  const beats = expandRhythmElements([element]).durationTicks / TICKS_PER_QUARTER;
  return {
    id: `${value.value}-${kind}`,
    label: value.label + (kind === "note" ? "音符" : "休止符"),
    group: kind === "note" ? "音符" : "休止符",
    elements: [element],
    startBeats: Array.from({ length: 4 / beats }, (_, i) => i * beats),
  };
}

/** 界面预览与生成材料共用目录；每项独立启用，组合不依赖基础音符勾选。 */
export const randomMaterials: readonly RandomMaterial[] = [
  ...noteValues.map(value => singleMaterial("note", value)),
  { id: "dotted-quarter-note", label: "附点四分音符", group: "音符", elements: [{ kind: "note", noteValue: "quarter", dots: 1 }], startBeats: [0, 1, 2] },
  { id: "dotted-eighth-note", label: "附点八分音符", group: "音符", elements: [{ kind: "note", noteValue: "eighth", dots: 1 }], startBeats: [0, 1, 2, 3] },
  ...noteValues.map(value => singleMaterial("rest", value)),
  ...rhythmPatterns.map(pattern => ({
    id: pattern.id, label: pattern.label, group: "节奏型" as const, elements: pattern.events,
    startBeats: expandRhythmElements(pattern.events).durationTicks === 2 * TICKS_PER_QUARTER ? [0, 2] : [0, 1, 2, 3],
  })),
  { id: "eighth-triplet", label: "小三连", group: "节奏型", elements: [{ kind: "triplet", notes: [
    { kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "eighth" },
  ] }], startBeats: [0, 1, 2, 3] },
];
export const defaultRandomMaterials: readonly MaterialId[] = ["whole-note", "half-note", "quarter-note"];

/** materials 是允许材料，不保证逐题覆盖；不隐式补入其他音符，允许纯休止符。 */
export type RandomGenerationConfig = {
  mode: "tapping" | "dictation";
  materials: readonly MaterialId[];
  measureCount: typeof randomMeasureCounts[number];
};

/** 校验配置并解析所选材料的独立快照；起点和时值统一转换为模型整数 tick。 */
export function resolveRandomPatterns(config: RandomGenerationConfig) {
  if (config?.mode !== "tapping" && config?.mode !== "dictation") throw new Error("请选择击拍或节奏听写模式。");
  if (!Array.isArray(config.materials) || config.materials.length === 0) throw new Error("至少选择一个练习范围。");
  if (config.materials.some(id => !randomMaterials.some(material => material.id === id))) throw new Error("包含尚未支持的练习范围。");
  if (!randomMeasureCounts.includes(config.measureCount)) throw new Error("小节数只支持 1、2、4。");
  const selected = new Set(config.materials);
  return randomMaterials.filter(material => selected.has(material.id)).map(material => ({
    id: material.id,
    elements: structuredClone(material.elements),
    durationTicks: expandRhythmElements(material.elements).durationTicks,
    startTicks: material.startBeats.map(beat => beat * TICKS_PER_QUARTER),
  }));
}

/** 生成固定 4/4 的完整题目，每步在可完成小节的材料中等概率选择。
 * 不保证材料覆盖或完整题目等概率，允许重复题目及全休止符。
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
  if (!canFinish[0]) throw new Error("所选材料无法填满 4/4 小节，请增加其他音符或节奏型。");

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
