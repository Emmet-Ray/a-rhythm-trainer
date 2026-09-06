import { useEffect, useRef, useState } from "react";
import {
  BarlineType,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  type RenderContext,
} from "vexflow";

import type { RhythmExercise, RhythmEvent } from "./RhythmModel";
import type { ExerciseTimeline, TimingEvent } from "./RhythmTiming";
import {
  createScoreLayout,
  getEighthNoteBeamGroups,
  timingOffsetToScorePosition,
  type MeasureLayout,
  type ScorePosition,
} from "./RhythmScoreLayout";

const ACTIVE_NOTE_COLOR = "#646cff";
const HIT_MARKER_COLOR = "#65a94b";
const ERROR_MARKER_COLOR = "#df4438";
const MARKER_Y_OFFSET = 32;

type RhythmScoreProps = {
  exercise: RhythmExercise;
  activeEventIndex: number | null;
  timeline: ExerciseTimeline;
  timingEvents: readonly TimingEvent[];
};

// 按完整小节换行；反馈位置按时间线的全局 eventIndex 保存。
// todo: 增量渲染优化留待后续。
function RhythmScore({
  exercise,
  activeEventIndex,
  timeline,
  timingEvents,
}: RhythmScoreProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { measures, timeSignature } = exercise;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      if (width > 0) setContainerWidth((previous) => previous === width ? previous : width);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    const scoreLayout = createScoreLayout(measures.length, containerWidth);
    if (scoreLayout.measures.length === 0) return;
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(containerWidth, scoreLayout.height * scoreLayout.scale);
    const context = renderer.getContext();
    context.scale(scoreLayout.scale, scoreLayout.scale);
    const eventPositions: ScorePosition[] = [];
    const layouts: MeasureLayout[] = [];

    measures.forEach((measure, measureIndex) => {
      const placement = scoreLayout.measures[measureIndex];
      const stave = new Stave(placement.x, placement.y, placement.width);
      if (placement.isRowStart) {
        stave.addClef("treble");
      } else {
        // 左侧小节已画右边界，避免重复描画同一根线。
        stave.setBegBarType(BarlineType.NONE);
      }
      if (measureIndex === 0) {
        stave.addTimeSignature(`${timeSignature.beats}/${timeSignature.beatType}`);
      }
      if (measureIndex === measures.length - 1) stave.setEndBarType(BarlineType.END);
      stave.setContext(context).draw();
      const markerY = stave.getBottomLineY() + MARKER_Y_OFFSET;
      const measureTime = timeline.measures[measureIndex];
      const measureNotes = measure.events.map(rhythmEventToVexFlowStaveNote);
      // 排版前关联 Beam，让 VexFlow 去掉独立符尾；排版后再绘制连梁。
      const beams = getEighthNoteBeamGroups(measure.events).map(([first, second]) =>
        new Beam([measureNotes[first], measureNotes[second]]),
      );
      measureNotes.forEach((note, index) => {
        if (measureTime.firstEventIndex + index === activeEventIndex) {
          note.setStyle({ fillStyle: ACTIVE_NOTE_COLOR, strokeStyle: ACTIVE_NOTE_COLOR });
        }
      });
      if (measureNotes.length > 0) Formatter.FormatAndDraw(context, stave, measureNotes);
      beams.forEach((beam) => beam.setContext(context).draw());
      measureNotes.forEach((note, index) => {
        eventPositions[measureTime.firstEventIndex + index] = {
          x: getNoteCenterX(note),
          y: markerY,
        };
      });
      const anchors = measureNotes.map((note, index) => ({
        offsetMs: timeline.eventStartOffsetsMs[measureTime.firstEventIndex + index],
        x: getNoteCenterX(note),
      }));
      // 单个全音符/全休止符也有起点和终点，误敲不再固定在同一个位置。
      if (anchors.length === 0) {
        anchors.push({ offsetMs: measureTime.startOffsetMs, x: stave.getNoteStartX() });
      }
      anchors.push({ offsetMs: measureTime.endOffsetMs, x: stave.getNoteEndX() });
      layouts.push({
        ...measureTime,
        markerY,
        minimumX: stave.getNoteStartX(),
        maximumX: stave.getNoteEndX(),
        anchors,
      });
    });

    timingEvents.forEach((event) => {
      if (event.kind === "wrongTap") {
        const position = timingOffsetToScorePosition(event.tapOffsetMs, layouts);
        if (position) drawWrongTapMarker(context, position.x, position.y);
        return;
      }
      const position = eventPositions[event.eventIndex];
      if (!position) return;
      if (event.kind === "miss") drawMissMarker(context, position.x, position.y);
      else drawHitMarker(context, position.x, position.y);
    });

    return () => container.replaceChildren();
  }, [containerWidth, activeEventIndex, measures, timeline, timingEvents, timeSignature.beats, timeSignature.beatType]);

  return (
    <div ref={viewportRef} style={{ width: "100%", minWidth: 0 }} role="region" aria-label="节奏乐谱" tabIndex={0}>
      <div ref={containerRef} />
    </div>
  );
}

function getNoteCenterX(note: StaveNote): number {
  return (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
}

function drawHitMarker(context: RenderContext, x: number, y: number): void {
  context
    .save()
    .setFillStyle(HIT_MARKER_COLOR)
    .beginPath()
    .arc(x, y, 6, 0, Math.PI * 2, false)
    .fill()
    .restore();
}

function drawMissMarker(context: RenderContext, x: number, y: number): void {
  const size = 7;

  context
    .save()
    .setStrokeStyle(ERROR_MARKER_COLOR)
    .setLineWidth(2.25)
    .setLineCap("round")
    .beginPath()
    .moveTo(x, y - size)
    .lineTo(x + size, y)
    .lineTo(x, y + size)
    .lineTo(x - size, y)
    .closePath()
    .stroke()
    .restore();
}

function drawWrongTapMarker(
  context: RenderContext,
  x: number,
  y: number,
): void {
  drawCross(context, x, y, 6, 5.5);
}

function drawCross(
  context: RenderContext,
  x: number,
  y: number,
  size: number,
  lineWidth: number,
): void {
  context
    .save()
    .setStrokeStyle(ERROR_MARKER_COLOR)
    .setLineWidth(lineWidth)
    .setLineCap("round")
    .beginPath()
    .moveTo(x - size, y - size)
    .lineTo(x + size, y + size)
    .moveTo(x + size, y - size)
    .lineTo(x - size, y + size)
    .stroke()
    .restore();
}

function rhythmEventToVexFlowStaveNote(event: RhythmEvent): StaveNote {
  // 将时值名称转换为 vexflow 对应的类型
  let duration: string;
  switch (event.noteValue) {
    case "whole":
      duration = "w";
      break;
    case "half":
      duration = "h";
      break;
    case "quarter":
      duration = "q";
      break;
    case "eighth":
      duration = "8";
      break;
    default:
      throw new Error("暂不支持该时值。");
  }

  const note = new StaveNote({
    keys: ["b/4"],
    duration: event.kind === "rest" ? `${duration}r` : duration,
    dots: event.dots ?? 0,
  });
  // dots 决定 VexFlow 内部时值；Dot modifier 才负责画出可见的点。
  if (event.dots === 1) Dot.buildAndAttach([note]);
  return note;
}

export default RhythmScore;
