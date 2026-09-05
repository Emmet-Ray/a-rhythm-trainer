export type MeasureLayout = {
  startOffsetMs: number;
  endOffsetMs: number;
  minimumX: number;
  maximumX: number;
  anchors: { offsetMs: number; x: number }[];
};

/**
 * 先按时间选择小节，再在事件起点（含休止符）与小节结束锚点之间插值。
 * 小节边界属于后一小节，首尾越界限制在谱面范围内。
 * 这是显示映射，不参与敲击判定；布局由谱面渲染后提供。
 */
export function timingOffsetToScoreX(
  offsetMs: number,
  measures: readonly MeasureLayout[],
): number | null {
  if (measures.length === 0) return null;
  const measure = measures.find((item) => offsetMs < item.endOffsetMs) ?? measures[measures.length - 1];
  const anchors = measure.anchors;
  if (anchors.length < 2) return measure.minimumX;
  const rightIndex = anchors.findIndex((anchor, index) => index > 0 && offsetMs <= anchor.offsetMs);
  const index = rightIndex === -1 ? anchors.length - 1 : rightIndex;
  const left = anchors[index - 1];
  const right = anchors[index];
  const duration = right.offsetMs - left.offsetMs;
  const x = duration > 0
    ? left.x + (right.x - left.x) * (offsetMs - left.offsetMs) / duration
    : left.x;
  return Math.min(Math.max(x, measure.minimumX), measure.maximumX);
}
