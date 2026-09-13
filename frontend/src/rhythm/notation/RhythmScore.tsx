import { useEffect, useRef, useState } from "react";
import {
  BarlineType,
  Beam,
  Formatter,
  Renderer,
  StaveNote,
  Voice,
  Tuplet,
  type RenderContext,
} from "vexflow";

import { expandRhythmElements, type RhythmExercise } from "../RhythmModel";
import { createRhythmStave, getRhythmLineY, rhythmEventToVexFlowStaveNote } from "./RhythmNotation";
import type { ExerciseTimeline, TimingEvent } from "../RhythmTiming";
import {
  createScoreLayout,
  getBeatBeamGroups,
  timingOffsetToScorePosition,
  type MeasureLayout,
  type ScorePosition,
} from "./RhythmScoreLayout";

const ACTIVE_NOTE_COLOR = "var(--ds-primary, #7052d6)";
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
    if (containerWidth === 0) return;
    // 先关联连梁，再测量无独立符尾时的最小排版宽度。
    const preparedMeasures = measures.map((measure) => {
      const expanded = expandRhythmElements(measure.elements);
      const notes = expanded.events.map(({ event }) => rhythmEventToVexFlowStaveNote(event));
      // Tuplet 同时设置 3:2 的记谱时值比例和可见数字；必须在测量/排版前关联。
      const tuplets = expanded.tripletGroups.map(indexes => new Tuplet(
        indexes.map(index => notes[index]), { numNotes: 3, notesOccupied: 2, bracketed: false },
      ));
      const beams = getBeatBeamGroups(measure.elements).map((indexes) =>
        new Beam(indexes.map((index) => notes[index])),
      );
      const voice = new Voice().setStrict(false).addTickables(notes);
      const noteWidth = notes.length > 0
        ? new Formatter().joinVoices([voice]).preCalculateMinTotalWidth([voice])
        : 0;
      // 为行首谱号/拍号和音符间的阅读间距留余量，不能只保证符号不重叠。
      return { notes, beams, tuplets, minimumWidth: Math.max(noteWidth + 120, 100 + notes.length * 24) };
    });
    const minimumWidth = Math.max(320, ...preparedMeasures.map((measure) => measure.minimumWidth));
    const scoreLayout = createScoreLayout(measures.length, containerWidth, minimumWidth);
    if (scoreLayout.measures.length === 0) return;
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(containerWidth, scoreLayout.height * scoreLayout.scale);
    const context = renderer.getContext();
    context.scale(scoreLayout.scale, scoreLayout.scale);
    const eventPositions: ScorePosition[] = [];
    const layouts: MeasureLayout[] = [];

    preparedMeasures.forEach(({ notes: measureNotes, beams, tuplets }, measureIndex) => {
      const placement = scoreLayout.measures[measureIndex];
      const stave = createRhythmStave(placement.x, placement.y, placement.width, placement.isRowStart);
      if (!placement.isRowStart) {
        // 左侧小节已画右边界，避免重复描画同一根线。
        stave.setBegBarType(BarlineType.NONE);
      }
      if (measureIndex === 0) {
        stave.addTimeSignature(`${timeSignature.beats}/${timeSignature.beatType}`);
      }
      if (measureIndex === measures.length - 1) stave.setEndBarType(BarlineType.END);
      stave.setContext(context).draw();
      const markerY = getRhythmLineY(stave) + MARKER_Y_OFFSET;
      const measureTime = timeline.measures[measureIndex];
      measureNotes.forEach((note, index) => {
        if (measureTime.firstEventIndex + index === activeEventIndex) {
          note.setStyle({ fillStyle: ACTIVE_NOTE_COLOR, strokeStyle: ACTIVE_NOTE_COLOR });
        }
      });
      if (measureNotes.length > 0) Formatter.FormatAndDraw(context, stave, measureNotes);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
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
        if (position) drawTimingMarker(context, position.x, position.y, event.kind);
        return;
      }
      const position = eventPositions[event.eventIndex];
      if (!position) return;
      drawTimingMarker(context, position.x, position.y, event.kind);
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

// 实心表示发生了敲击（绿：命中，红：误敲），空心红圆表示漏拍。
function drawTimingMarker(
  context: RenderContext,
  x: number,
  y: number,
  kind: TimingEvent["kind"],
): void {
  const color = kind === "hit" ? HIT_MARKER_COLOR : ERROR_MARKER_COLOR;
  const lineWidth = 2;
  // 空心圆的描边向两侧延伸，缩小路径半径以保持相同的外径。
  const radius = kind === "miss" ? 6 - lineWidth / 2 : 6;
  context
    .save()
    .setFillStyle(color)
    .setStrokeStyle(color)
    .setLineWidth(lineWidth)
    .beginPath()
    .arc(x, y, radius, 0, Math.PI * 2, false);
  if (kind === "miss") context.stroke();
  else context.fill();
  context.restore();
}

export default RhythmScore;
