import { expandRhythmElements, TICKS_PER_QUARTER, type RhythmElement } from "../RhythmModel";
import type { ExerciseTimeline } from "../RhythmTiming";

/** 返回小节内的拍内连梁分组。八分、十六分音符（含单附点）可混合；
 * 普通符号遇休止符、长音符或跨拍事件断开分组。
 * 三连音无论从何处开始都独立连梁，不与前后普通音符相连；所有组均不跨小节。
 * 单个音符保留符尾；梁的层数和局部短梁交给记谱库处理。
 */
export function getBeatBeamGroups(elements: readonly RhythmElement[]): number[][] {
  const expanded = expandRhythmElements(elements);
  const groups: number[][] = [];
  const tripletStarts = new Map(expanded.tripletGroups.map((group) => [group[0], group]));
  const tripletIndexes = new Set(expanded.tripletGroups.flat());
  let pending: number[] = [];
  const flush = () => {
    if (pending.length > 1) groups.push(pending);
    pending = [];
  };
  expanded.events.forEach(({ event, startTick, durationTicks }, index) => {
    if (tripletIndexes.has(index)) {
      flush();
      const group = tripletStarts.get(index);
      if (group) groups.push(group);
      return;
    }
    if (startTick % TICKS_PER_QUARTER === 0) flush();
    const end = startTick + durationTicks;
    const canBeam = event.kind === "note"
      && (event.noteValue === "eighth" || event.noteValue === "sixteenth")
      && end <= (Math.floor(startTick / TICKS_PER_QUARTER) + 1) * TICKS_PER_QUARTER;
    if (canBeam) pending.push(index);
    else flush();
  });
  flush();
  return groups;
}

const HORIZONTAL_PADDING = 10;
const PREFERRED_MEASURE_WIDTH = 360;
const ROW_HEIGHT = 150;
const STAVE_TOP = 40;
const MINIMUM_MEASURE_WIDTH = 320;

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

/** 草稿始终单行。按最短可编辑时值（十六分音符）预留宽度，
 * 而非根据当前答案伸缩；宽屏优先显示两个完整小节，余下横向滚动。
 * 不读取题目答案，空小节与填满后使用相同坐标。
 */
export function createDraftScoreLayout(measureCount: number, containerWidth: number, quarterBeats: number): ScoreLayout {
  const minimumWidth = Math.max(360, 100 + Math.ceil(quarterBeats * 4) * 30);
  const viewport = Math.max(0, containerWidth);
  const visibleCount = Math.max(1, Math.min(2, measureCount));
  const scale = Math.max(1, Math.min(1.6, viewport / (minimumWidth * visibleCount + 20)));
  const measureWidth = Math.max(minimumWidth, (viewport / scale - 20) / visibleCount);
  return {
    width: measureCount * measureWidth + 20,
    height: 150,
    scale,
    measures: Array.from({ length: measureCount }, (_, index) => ({
      x: 10 + index * measureWidth, y: 40, width: measureWidth, isRowStart: index === 0,
    })),
  };
}

/** 按完整小节换行；最小小节宽度可由记谱库测量提供。
 * preferredScale 指定期望记谱倍率；先换算逻辑宽度再排版，音符与反馈共用 scale。
 * 末行等宽左对齐；放不下一个小节时统一缩小；未测得容器宽度时不排版。
 */
export function createScoreLayout(measureCount: number, containerWidth: number, minimumMeasureWidth = MINIMUM_MEASURE_WIDTH, preferredScale = 1): ScoreLayout {
  const measuredWidth = Math.max(0, Math.floor(containerWidth));
  if (measureCount === 0 || measuredWidth === 0) {
    return { width: measuredWidth, height: 0, scale: 1, measures: [] };
  }
  const minimumWidth = Math.max(MINIMUM_MEASURE_WIDTH, Math.ceil(minimumMeasureWidth));
  const width = Math.max(minimumWidth + HORIZONTAL_PADDING * 2, measuredWidth / preferredScale);
  const availableWidth = width - HORIZONTAL_PADDING * 2;
  const measuresPerRow = Math.min(
    measureCount,
    Math.max(1, Math.floor(availableWidth / Math.max(PREFERRED_MEASURE_WIDTH, minimumWidth))),
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

/** 可视窗口只显示完整的一至两行；即使矮屏也不裁掉单行内的符号和反馈。 */
export function getScoreViewportHeight(layout: ScoreLayout, availableHeight: number): number {
  if (layout.measures.length === 0) return 0;
  const rowHeight = ROW_HEIGHT * layout.scale;
  const visibleRows = Math.max(1, Math.min(2, Math.floor(availableHeight / rowHeight)));
  return Math.min(layout.height * layout.scale, visibleRows * rowHeight);
}

/** 从时钟定位的事件（含休止符）选择谱行，不读取敲击结果。
 * 两行窗口优先保留当前行与下一行；仅在需要换行时返回新的滚动位置。
 * 返回值为显示像素，与 SVG 的逻辑坐标隔离；末尾不滚出空白区域。
 */
export function getScoreFollowTop(
  layout: ScoreLayout, timeline: ExerciseTimeline, eventIndex: number,
  scrollTop: number, viewportHeight: number,
): number {
  const measureIndex = timeline.measures.findLastIndex(measure => measure.firstEventIndex <= eventIndex);
  const placement = layout.measures[measureIndex];
  if (!placement || viewportHeight <= 0) return scrollTop;
  const rowHeight = ROW_HEIGHT * layout.scale;
  const rowTop = (placement.y - STAVE_TOP) * layout.scale;
  const totalHeight = layout.height * layout.scale;
  const visibleRows = Math.max(1, Math.min(2, Math.floor((viewportHeight + 0.5) / rowHeight)));
  const requiredBottom = Math.min(totalHeight, rowTop + visibleRows * rowHeight);
  if (rowTop >= scrollTop - 0.5 && requiredBottom <= scrollTop + viewportHeight + 0.5) return scrollTop;
  return Math.max(0, Math.min(rowTop, totalHeight - viewportHeight));
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

export type MeasureGeometry = {
  minimumX: number;
  maximumX: number;
  markerY: number;
  eventXs: readonly number[];
};

/** 将已绘制的小节坐标关联到当前时间线，不重新排版。
 * geometry 与 timeline 必须来自同一题目；调速只改变锚点的时间，不能改变坐标。
 * 空小节及仅一个全音符/休止符的小节也保留起点、终点，供误敲位置插值。
 */
export function createTimingFeedbackLayout(
  timeline: ExerciseTimeline,
  geometry: readonly MeasureGeometry[],
): MeasureLayout[] {
  return geometry.map((measure, index) => {
    const time = timeline.measures[index];
    const anchors = measure.eventXs.map((x, eventIndex) => ({
      offsetMs: timeline.eventStartOffsetsMs[time.firstEventIndex + eventIndex], x,
    }));
    if (anchors.length === 0) anchors.push({ offsetMs: time.startOffsetMs, x: measure.minimumX });
    anchors.push({ offsetMs: time.endOffsetMs, x: measure.maximumX });
    return { ...time, minimumX: measure.minimumX, maximumX: measure.maximumX, markerY: measure.markerY, anchors };
  });
}

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
