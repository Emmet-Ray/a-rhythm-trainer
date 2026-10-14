import { getMeasureTicks, expandRhythmElements, TICKS_PER_QUARTER, validateRhythmExercise, type RhythmElement, type RhythmEvent, type RhythmExercise } from "../rhythm/RhythmModel";
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

/** materials 是练习材料，单题优先覆盖最多种；不隐式补入其他音符，允许纯休止符。 */
export type RandomGenerationConfig = {
  mode: "tapping" | "dictation";
  timeSignature: RhythmExercise["timeSignature"];
  materials: readonly MaterialId[];
  measureCount: typeof randomMeasureCounts[number];
};

/** 校验配置并解析所选材料的独立快照；起点和时值统一转换为模型整数 tick。 */
export function resolveRandomPatterns(config: RandomGenerationConfig) {
  if (config?.mode !== "tapping" && config?.mode !== "dictation") throw new Error("请选择击拍或节奏听写模式。");
  if (!Array.isArray(config.materials) || config.materials.length === 0) throw new Error("至少选择一个练习范围。");
  if (config.materials.some(id => !randomMaterials.some(material => material.id === id))) throw new Error("包含尚未支持的练习范围。");
  if (!randomMeasureCounts.includes(config.measureCount)) throw new Error("小节数只支持 1、2、4。");
  const capacity = getMeasureTicks(config.timeSignature);
  const selected = new Set(config.materials);
  return randomMaterials.filter(material => selected.has(material.id)).map(material => ({
    id: material.id,
    elements: structuredClone(material.elements),
    durationTicks: expandRhythmElements(material.elements).durationTicks,
    startTicks: material.startBeats.map(beat => beat * TICKS_PER_QUARTER).filter(tick => tick + expandRhythmElements(material.elements).durationTicks <= capacity),
  }));
}

/** 按小节、展开事件的序号比较类型和实际时值；缺失事件计为不同。
 * 不做错位匹配；不同拍号视为不同题目，组合材料的分组方式不影响结果。
 */
export function randomExerciseSimilarity(left: RhythmExercise, right: RhythmExercise): number {
  if (left.timeSignature.beats !== right.timeSignature.beats || left.timeSignature.beatType !== right.timeSignature.beatType) return 0;
  let same = 0;
  let total = 0;
  for (let i = 0; i < Math.max(left.measures.length, right.measures.length); i++) {
    const a = expandRhythmElements(left.measures[i]?.elements ?? []).events;
    const b = expandRhythmElements(right.measures[i]?.elements ?? []).events;
    total += Math.max(a.length, b.length);
    same += a.filter((item, index) => item.event.kind === b[index]?.event.kind && item.durationTicks === b[index]?.durationTicks).length;
  }
  return total === 0 ? 1 : same / total;
}

/** 生成完整题目，优先最大化整题使用的已选材料种数，再随机选择合法排列。
 * 组合材料作为整体参与覆盖，不以其零散子音符代替；不维护跨题覆盖状态。
 * 与 previous 相似度超过 80% 时最多额外重试三次，全部超限则取差异最大的候选。
 * random 必须返回 [0, 1) 内有限数；输入和各次输出不共享可变元素。
 */
export function generateRandomExercise(
  config: RandomGenerationConfig,
  random: () => number = Math.random,
  previous?: RhythmExercise | null,
): RhythmExercise {
  const materials = resolveRandomPatterns(config);
  const measureTicks = getMeasureTicks(config.timeSignature);
  if (materials.some(p => !Number.isInteger(p.durationTicks) || p.durationTicks <= 0)) {
    throw new Error("随机材料必须具有正整数 tick 时值。");
  }
  function shuffled<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i >= 0; i--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("随机数必须是 [0, 1) 内的有限数。");
      const j = Math.floor(value * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  const canFinish: boolean[] = Array(measureTicks + 1).fill(false);
  canFinish[measureTicks] = true;
  const choices: number[][] = Array.from({ length: measureTicks }, () => []);
  for (let position = measureTicks - 1; position >= 0; position--) {
    choices[position] = materials.flatMap((pattern, index) => {
      const end = position + pattern.durationTicks;
      return pattern.startTicks.includes(position) && end <= measureTicks && canFinish[end] ? [index] : [];
    });
    canFinish[position] = choices[position].length > 0;
  }
  if (!canFinish[0]) throw new Error(`所选材料无法填满 ${config.timeSignature.beats}/4 小节，请增加其他音符或节奏型。`);

  const totalTicks = measureTicks * config.measureCount;
  // 当前目录共 23 项，可用位集合记录已用材料。状态只存在于一次生成调用内。
  if (materials.length > 30) throw new Error("随机材料目录超过覆盖规划支持的数量。");
  const byDuration = materials.map((_, index) => index).sort((a, b) => materials[a].durationTicks - materials[b].durationTicks);
  const available: number[] = Array(totalTicks + 1).fill(0);
  for (let tick = totalTicks - 1; tick >= 0; tick--) {
    available[tick] = choices[tick % measureTicks].reduce((mask, index) => mask | (1 << index), available[tick + 1]);
  }
  // 忽略拍位的最短材料时值给出乐观上界，用于剪枝，不决定最终可行性。
  function upperBound(tick: number, used: number, count: number) {
    let remaining = totalTicks - tick;
    for (const index of byDuration) {
      if ((used & (1 << index)) || !(available[tick] & (1 << index))) continue;
      remaining -= materials[index].durationTicks;
      if (remaining < 0) break;
      count++;
    }
    return count;
  }

  function plan(target: number): number[] | null {
    const failed = new Set<string>();
    const path: number[] = [];
    function visit(tick: number, used: number, count: number): boolean {
      if (tick === totalTicks) return count >= target;
      if (upperBound(tick, used, count) < target) return false;
      const key = `${tick}:${used}`;
      if (failed.has(key)) return false;
      const candidates = shuffled(choices[tick % measureTicks]);
      // 随机打乱后优先尝试未覆盖材料；同覆盖数的选择不依赖目录顺序。
      if (count < target) candidates.sort((a, b) => Number(Boolean(used & (1 << a))) - Number(Boolean(used & (1 << b))));
      for (const index of candidates) {
        const bit = 1 << index;
        path.push(index);
        if (visit(tick + materials[index].durationTicks, used | bit, count + ((used & bit) ? 0 : 1))) return true;
        path.pop();
      }
      failed.add(key);
      return false;
    }
    return visit(0, 0, 0) ? path : null;
  }

  let target = upperBound(0, 0, 0);
  let path = plan(target);
  while (!path) path = plan(--target);

  function toExercise(indices: number[]): RhythmExercise {
    const exercise: RhythmExercise = {
      timeSignature: { ...config.timeSignature },
      measures: Array.from({ length: config.measureCount }, () => ({ elements: [] })),
    };
    let tick = 0;
    for (const index of indices) {
      const material = materials[index];
      exercise.measures[Math.floor(tick / measureTicks)].elements.push(...structuredClone(material.elements));
      tick += material.durationTicks;
    }
    validateRhythmExercise(exercise);
    return exercise;
  }

  let best = toExercise(path);
  if (!previous) return best;
  let bestSimilarity = randomExerciseSimilarity(best, previous);
  for (let retry = 0; retry < 3 && bestSimilarity > 0.8; retry++) {
    // target 已证明可行，每次候选都保持相同的最大覆盖数。
    const candidate = toExercise(plan(target)!);
    const similarity = randomExerciseSimilarity(candidate, previous);
    if (similarity < bestSimilarity) {
      best = candidate;
      bestSimilarity = similarity;
    }
  }
  return best;
}
