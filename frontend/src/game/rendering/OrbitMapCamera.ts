import type { OrbitTrack } from "../core/OrbitTrack";

/** 默认两拍预读，整轮保持同一比例；取景只由音乐位置决定，不依赖帧率或命中偏差。
 * 计算的是运动段，绘图仍使用完整地图；预留完整圆周和晚按越过目标的空间。
 */
export function createOrbitMapCamera(track: OrbitTrack) {
  const firstBeat = (track.targets[0] ?? 0) - track.leadInBeats;
  const lastBeat = (track.targets.at(-1) ?? 0);
  function center(beat: number) {
    let index = 0;
    while (index < track.targets.length && beat >= track.targets[index]) index++;
    const start = index === 0 ? firstBeat : track.targets[index - 1];
    const end = track.targets[index] ?? start;
    const fraction = end === start ? 0 : Math.max(0, Math.min(1, (beat - start) / (end - start)));
    const from = track.points[index], to = track.points[index + 1] ?? from;
    return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
  }
  function bounds(beat: number) {
    const start = Math.max(firstBeat, Math.min(lastBeat, beat));
    const end = Math.min(lastBeat, start + 2);
    const points = [center(start), center(end)];
    track.targets.forEach((target, index) => { if (target > start && target < end) points.push(track.points[index + 1]); });
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  }
  // 窗口边界经过落点时才改变线性片段；这些位置给出全局最大跨度。
  const windows = [firstBeat, ...track.targets, ...track.targets.map(beat => beat - 2)].map(bounds);
  const spanX = Math.max(...windows.map(window => window.right - window.left));
  const spanY = Math.max(...windows.map(window => window.bottom - window.top));
  return (timeMs: number, beatMs: number, width: number, height: number) => {
    const window = bounds(timeMs / beatMs);
    // 预读道路可能偏向任一方向；两轴均预留晚按时原圆心周围的完整圆周。
    const spacing = Math.min(90, (width - 48) / (spanX + 4.4), (height - 140) / (spanY + 4.4));
    return {
      spacing,
      x: width * .5 - (window.left + window.right) * .5 * spacing,
      y: height * .51 - (window.top + window.bottom) * .5 * spacing,
    };
  };
}
