const HORIZONTAL_PADDING = 10;
const PREFERRED_MEASURE_WIDTH = 360;
const ROW_HEIGHT = 180;
const STAVE_TOP = 40;
// 为带谱号、拍号的八个独立八分音符保留排版空间；更窄的容器统一缩放。
const MINIMUM_SCORE_WIDTH = 340;

type MeasurePlacement = {
  x: number;
  y: number;
  width: number;
  isRowStart: boolean;
};

export type ScoreLayout = {
  // 所有谱面与反馈使用同一逻辑坐标系；显示尺寸为 width/height 乘以 scale。
  width: number;
  height: number;
  scale: number;
  measures: MeasurePlacement[];
};

/** 按完整小节换行；末行沿用前面的小节宽度并左对齐。未测得宽度时不排版。 */
export function createScoreLayout(measureCount: number, containerWidth: number): ScoreLayout {
  const measuredWidth = Math.max(0, Math.floor(containerWidth));
  if (measureCount === 0 || measuredWidth === 0) {
    return { width: measuredWidth, height: 0, scale: 1, measures: [] };
  }
  const width = Math.max(MINIMUM_SCORE_WIDTH, measuredWidth);
  const availableWidth = width - HORIZONTAL_PADDING * 2;
  const measuresPerRow = Math.min(
    measureCount,
    Math.max(1, Math.floor(availableWidth / PREFERRED_MEASURE_WIDTH)),
  );
  const measureWidth = availableWidth / measuresPerRow;
  return {
    width,
    height: Math.ceil(measureCount / measuresPerRow) * ROW_HEIGHT,
    scale: measuredWidth / width,
    measures: Array.from({ length: measureCount }, (_, index) => ({
      x: HORIZONTAL_PADDING + (index % measuresPerRow) * measureWidth,
      y: STAVE_TOP + Math.floor(index / measuresPerRow) * ROW_HEIGHT,
      width: measureWidth,
      isRowStart: index % measuresPerRow === 0,
    })),
  };
}

export type ScorePosition = { x: number; y: number };

export type MeasureLayout = {
  startOffsetMs: number;
  endOffsetMs: number;
  minimumX: number;
  maximumX: number;
  markerY: number;
  anchors: { offsetMs: number; x: number }[];
};

/**
 * 先按时间选择小节，再在事件起点（含休止符）与小节结束锚点之间插值。
 * 小节边界属于后一小节，首尾越界限制在谱面范围内。
 * Y 直接取所选小节的反馈基线，不在两行之间插值。
 * 这是显示映射，不参与敲击判定；布局由谱面渲染后提供。
 */
export function timingOffsetToScorePosition(
  offsetMs: number,
  measures: readonly MeasureLayout[],
): ScorePosition | null {
  if (measures.length === 0) return null;
  const measure = measures.find((item) => offsetMs < item.endOffsetMs) ?? measures[measures.length - 1];
  const anchors = measure.anchors;
  if (anchors.length < 2) return { x: measure.minimumX, y: measure.markerY };
  const rightIndex = anchors.findIndex((anchor, index) => index > 0 && offsetMs <= anchor.offsetMs);
  const index = rightIndex === -1 ? anchors.length - 1 : rightIndex;
  const left = anchors[index - 1];
  const right = anchors[index];
  const duration = right.offsetMs - left.offsetMs;
  const x = duration > 0
    ? left.x + (right.x - left.x) * (offsetMs - left.offsetMs) / duration
    : left.x;
  return {
    x: Math.min(Math.max(x, measure.minimumX), measure.maximumX),
    y: measure.markerY,
  };
}
