import { useEffect, useRef } from "react";
import {
  BarlineType,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  type RenderContext,
} from "vexflow";

import type { RhythmExercise, RhythmEvent } from "./RhythmModel";
import type { ExerciseTimeline, TimingEvent } from "./RhythmTiming";
import { timingOffsetToScoreX, type MeasureLayout } from "./RhythmScoreLayout";

const MEASURE_WIDTH = 360;
const SCORE_HEIGHT = 180;
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

// 单行按小节排版；音符数组顺序与时间线的全局 eventIndex 一致。
// todo: 连梁与增量渲染优化留待后续。
function RhythmScore({
  exercise,
  activeEventIndex,
  timeline,
  timingEvents,
}: RhythmScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { measures, timeSignature } = exercise;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(Math.max(1, measures.length) * MEASURE_WIDTH + 20, SCORE_HEIGHT);
    const context = renderer.getContext();
    const notes: StaveNote[] = [];
    const layouts: MeasureLayout[] = [];
    let markerY = 0;

    measures.forEach((measure, measureIndex) => {
      const stave = new Stave(10 + measureIndex * MEASURE_WIDTH, 40, MEASURE_WIDTH);
      if (measureIndex === 0) {
        stave.addClef("treble").addTimeSignature(`${timeSignature.beats}/${timeSignature.beatType}`);
      } else {
        // 左侧小节已画右边界，避免重复描画同一根线。
        stave.setBegBarType(BarlineType.NONE);
      }
      if (measureIndex === measures.length - 1) stave.setEndBarType(BarlineType.END);
      stave.setContext(context).draw();
      markerY = stave.getBottomLineY() + MARKER_Y_OFFSET;
      const measureTime = timeline.measures[measureIndex];
      const measureNotes = measure.events.map(rhythmEventToVexFlowStaveNote);
      measureNotes.forEach((note, index) => {
        if (measureTime.firstEventIndex + index === activeEventIndex) {
          note.setStyle({ fillStyle: ACTIVE_NOTE_COLOR, strokeStyle: ACTIVE_NOTE_COLOR });
        }
      });
      if (measureNotes.length > 0) Formatter.FormatAndDraw(context, stave, measureNotes);
      notes.push(...measureNotes);
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
        minimumX: stave.getNoteStartX(),
        maximumX: stave.getNoteEndX(),
        anchors,
      });
    });

    timingEvents.forEach((event) => {
      if (event.kind === "wrongTap") {
        const x = timingOffsetToScoreX(event.tapOffsetMs, layouts);
        if (x !== null) drawWrongTapMarker(context, x, markerY);
        return;
      }
      const note = notes[event.eventIndex];
      if (!note) return;
      const x = getNoteCenterX(note);
      if (event.kind === "miss") drawMissMarker(context, x, markerY);
      else drawHitMarker(context, x, markerY);
    });

    return () => container.replaceChildren();
  }, [activeEventIndex, measures, timeline, timingEvents, timeSignature.beats, timeSignature.beatType]);

  return (
    <div style={{ maxWidth: "100%", overflowX: "auto" }} role="region" aria-label="节奏乐谱" tabIndex={0}>
      <div ref={containerRef} style={{ width: "max-content", margin: "0 auto" }} />
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

  return new StaveNote({
    keys: ["b/4"],
    duration: event.kind === "rest" ? `${duration}r` : duration,
  });
}

export default RhythmScore;
