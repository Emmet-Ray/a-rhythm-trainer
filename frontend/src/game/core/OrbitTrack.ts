import { compileMultipartScore } from "./MultipartScore";
import type { MusicScore } from "./MusicScore";
import type { RhythmExercise } from "../../rhythm/RhythmModel";
import { createExerciseTimeline, type MeasureRange } from "../../rhythm/RhythmTiming";

/** beat 为从零开始的四分拍位；落地后影响下一圆弧，不改变音乐 BPM。 */
export type OrbitSpeedChange = { beat: number; halfTurnBeats: .5 | 1 | 2 | 4 | 8 };

type OrbitSource = RhythmExercise | MusicScore;

// 曲谱关直接使用合并延音后的旋律起点，不把延音续接伪装成一次敲击或休止。
function sourceTimeline(source: OrbitSource) {
  if ("measures" in source) {
    const timeline = createExerciseTimeline(source, 60, 4, { hitMs: 1, perfectMs: 0 });
    return { targets: timeline.targetTaps.map(tap => tap.offsetMs / 1000), durationBeats: timeline.durationMs / 1000,
      measureStarts: [...timeline.measures.map(measure => measure.startOffsetMs / 1000), timeline.durationMs / 1000] };
  }
  const score = compileMultipartScore(source);
  return { targets: score.hits.map(h => h.beat), durationBeats: score.measureStarts.at(-1)!, measureStarts: score.measureStarts };
}

/** 用音乐拍位编写转向，返回绘图/运行使用的落点序号。
 * 拍位从 0 开始，须对应已有的中间目标；转向仍只影响落地后的下一段圆弧。
 * 前面增减音符时无需手工重编号，缺失或重复的转向位置在关卡加载时明确报错。
 */
export function twirlTilesAtBeats(source: OrbitSource, beats: readonly number[]) {
  const { targets } = sourceTimeline(source);
  const tiles = beats.map(beat => {
    // 三连音从毫秒换回拍位时可能有浮点尾差；容差远小于模型的一 tick。
    const index = targets.findIndex(target => Math.abs(target - beat) < 1e-9);
    if (!Number.isFinite(beat) || index < 0 || index === targets.length - 1) throw new Error(`转向拍位 ${beat} 必须对应已有的中间目标。`);
    return index + 1;
  });
  if (new Set(tiles).size !== tiles.length) throw new Error("转向拍位不能重复。");
  return tiles.sort((a, b) => a - b);
}

/** 默认顺时针，只有显式转向地块才能反转。地块序号从 1 开始，落地后影响下一段。
 * 默认一拍半圈；显式转速地块落地后改变下一段速率，转向只改变方向，不改变球距。
 */
export function createOrbitTrack(source: OrbitSource, twirlTiles: readonly number[] = [], speedChanges: readonly OrbitSpeedChange[] = []) {
  const { targets, durationBeats, measureStarts } = sourceTimeline(source);
  const speedTiles = speedChanges.map(change => {
    const tile = targets.findIndex(beat => Math.abs(beat - change.beat) < 1e-9) + 1;
    if (tile < 1 || tile >= targets.length || ![.5, 1, 2, 4, 8].includes(change.halfTurnBeats)) {
      throw new Error("转速事件必须对应已有的中间目标，半圈拍数只能是半、一、二、四或八拍。");
    }
    return { tile, halfTurnBeats: change.halfTurnBeats };
  });
  if (new Set(speedTiles.map(change => change.tile)).size !== speedTiles.length) throw new Error("转速事件不能重复。");
  const speeds = new Map(speedTiles.map(change => [change.tile, change.halfTurnBeats]));
  // 与 angles/directions 同下标：第 i 段从 points[i] 绕到 points[i + 1]。
  const radiansPerBeat: number[] = [];
  let halfTurnBeats: .5 | 1 | 2 | 4 | 8 = 1;
  if (!targets.length) throw new Error("游戏关卡至少需要一个敲击目标。");
  const points = [{ x: 0, y: 0 }];
  const angles = [Math.PI];
  if (new Set(twirlTiles).size !== twirlTiles.length || twirlTiles.some(tile => !Number.isInteger(tile) || tile < 1 || tile >= targets.length)) {
    throw new Error("转向地块必须是互不重复的中间落点序号。");
  }
  const twirls = new Set(twirlTiles);
  const directions: (1 | -1)[] = [];
  let direction: 1 | -1 = 1;
  for (let i = 0; i < targets.length; i++) {
    halfTurnBeats = speeds.get(i) ?? halfTurnBeats;
    const speed = Math.PI / halfTurnBeats;
    radiansPerBeat.push(speed);
    if (twirls.has(i)) direction = direction === 1 ? -1 : 1;
    directions.push(direction);
    const gap = i === 0 ? 1 : targets[i] - targets[i - 1];
    if (gap <= 0 || gap >= 2 * halfTurnBeats) throw new Error("敲击间隔必须小于一整圈。");
    const end = angles[i] + direction * speed * gap;
    points.push({ x: points[i].x + Math.cos(end), y: points[i].y + Math.sin(end) });
    angles.push(end + Math.PI);
  }
  directions.push(direction);
  radiansPerBeat.push(Math.PI / halfTurnBeats);
  const map = { points, twirlTiles: [...twirlTiles], speedTiles };
  return { targets, ...map, map, angles, directions, durationBeats, radiansPerBeat,
    range: { startMeasure: 0, endMeasure: measureStarts.length - 1 },
    measureStarts, anchorOffset: 0, leadInBeats: 1 };
}
export type OrbitTrack = ReturnType<typeof createOrbitTrack>;

/** 小节下标从 0 开始，结束小节不包含在内，与练习时间线约定一致。
 * 只截取本轮目标与运动段，完整地图保留供绘图；局部小节起点归零，保留起始休止。
 * 保留绝对位置、球的身份和已发生的转向，anchorOffset 将本轮进度映射回原地图。
 * 预备阶段先静止展示，最后用原入场间隔进入首个目标，不重新生成几何路线。
 */
export function selectOrbitRange(track: OrbitTrack, range: MeasureRange): OrbitTrack {
  const { startMeasure, endMeasure } = range;
  if (!Number.isInteger(startMeasure) || !Number.isInteger(endMeasure)
    || startMeasure < track.range.startMeasure || endMeasure > track.range.endMeasure || startMeasure >= endMeasure) {
    throw new Error("练习范围需要包含关卡内连续的完整小节。");
  }
  const startBeat = track.measureStarts[startMeasure - track.range.startMeasure];
  const endBeat = track.measureStarts[endMeasure - track.range.startMeasure];
  const found = track.targets.findIndex(beat => beat >= startBeat - 1e-8);
  const first = found === -1 ? track.targets.length : found;
  const end = track.targets.findIndex(beat => beat >= endBeat - 1e-8);
  const last = end === -1 ? track.targets.length : end;
  return {
    ...track, range: { ...range }, durationBeats: endBeat - startBeat,
    measureStarts: track.measureStarts.slice(startMeasure - track.range.startMeasure, endMeasure - track.range.startMeasure + 1).map(beat => Math.max(0, beat - startBeat)),
    targets: track.targets.slice(first, last).map(beat => Math.max(0, beat - startBeat)),
    points: track.points.slice(first, last + 1), angles: track.angles.slice(first, last + 1),
    directions: track.directions.slice(first, last + 1),
    radiansPerBeat: track.radiansPerBeat.slice(first, last + 1),
    speedTiles: track.speedTiles.filter(change => change.tile >= first && change.tile <= last).map(change => ({ ...change, tile: change.tile - first })),
    twirlTiles: track.twirlTiles.filter(tile => tile >= first && tile <= last).map(tile => tile - first),
    anchorOffset: track.anchorOffset + first,
    leadInBeats: first === 0 ? track.leadInBeats : first < last ? track.targets[first] - track.targets[first - 1] : 0,
  };
}

/** 当前待敲击目标所属的原关卡小节，用于失败后的局部重练入口。 */
export function orbitTargetMeasure(track: OrbitTrack, targetIndex: number) {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= track.targets.length) throw new Error("目标下标超出本轮范围。");
  return track.range.startMeasure + track.measureStarts.findLastIndex(beat => beat <= track.targets[targetIndex] + 1e-8);
}

/** 命中且到达预定拍位后才交换圆心。偏早命中仍走完入场圆弧；
 * 未命中则绕原圆心匀速越过目标，直到判定层结束本轮，不能自动落地。
 */
export function orbitPose(timeMs: number, beatMs: number, track: OrbitTrack, hits: number) {
  const beat = timeMs / beatMs;
  let anchor = 0;
  while (anchor < hits && beat >= track.targets[anchor]) anchor++;
  const start = anchor === 0 ? (track.targets[0] ?? 0) - track.leadInBeats : track.targets[anchor - 1];
  const elapsed = anchor === track.targets.length ? 0 : Math.max(0, beat - start);
  return { anchor, angle: track.angles[anchor] + track.directions[anchor] * track.radiansPerBeat[anchor] * elapsed, direction: track.directions[anchor], primaryAnchored: (anchor + track.anchorOffset) % 2 === 0 };
}
