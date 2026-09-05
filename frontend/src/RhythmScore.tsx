import { useEffect, useRef } from "react";
import {
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  type RenderContext,
} from "vexflow";

import type { RhythmExercise, RhythmEvent } from "./RhythmModel";
import type { TargetTap, TimingEvent } from "./RhythmTiming";

const SCORE_WIDTH = 500;
const SCORE_HEIGHT = 180;
const ACTIVE_NOTE_COLOR = "#646cff";
const HIT_MARKER_COLOR = "#65a94b";
const ERROR_MARKER_COLOR = "#df4438";
const MARKER_Y_OFFSET = 32;

type RhythmScoreProps = {
  exercise: RhythmExercise;
  activeEventIndex: number | null;
  targetTapTimeline: readonly TargetTap[];
  timingEvents: readonly TimingEvent[];
};

type TimelineAnchor = {
  offsetMs: number;
  x: number;
};

// todo: 这里还可以有一个提升点，但是这个点属于“可有可无”的。
// 就是现在的渲染出来的谱子跟平时读的五线谱不太一样，
// 比如现在两个八分音符是分着的，平时的五线谱里两个八分音符应该由连梁连接。
// todo: 渲染优化点，虽然渲染规模并不大，但是还是要考虑优化一下，有时候还是能够感觉到“刷新的跳变“的。
function RhythmScore({
  exercise,
  activeEventIndex,
  targetTapTimeline,
  timingEvents,
}: RhythmScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { events, timeSignature } = exercise;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // VexFlow owns everything inside this container. Clearing before setup also
    // makes the effect safe when StrictMode repeats the setup/cleanup cycle.
    container.replaceChildren();

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(SCORE_WIDTH, SCORE_HEIGHT);

    const context = renderer.getContext();
    const stave = new Stave(10, 40, SCORE_WIDTH - 20);
    stave
      .addClef("treble")
      .addTimeSignature(`${timeSignature.beats}/${timeSignature.beatType}`);
    stave.setContext(context).draw();

    const notes = events.map(rhythmEventToVexFlowStaveNote);
    const activeNote =
      activeEventIndex === null ? undefined : notes[activeEventIndex];
    if (activeNote) {
      activeNote.setStyle({
        fillStyle: ACTIVE_NOTE_COLOR,
        strokeStyle: ACTIVE_NOTE_COLOR,
      });
    }

    if (notes.length > 0) {
      Formatter.FormatAndDraw(context, stave, notes);

      const anchors = createTimelineAnchors(targetTapTimeline, notes);
      const markerY = stave.getBottomLineY() + MARKER_Y_OFFSET;

      timingEvents.forEach((timingEvent) => {
        if (timingEvent.kind === "wrongTap") {
          const markerX = timingOffsetToX(
            timingEvent.tapOffsetMs,
            anchors,
            stave.getNoteStartX(),
            stave.getNoteEndX(),
          );
          drawWrongTapMarker(context, markerX, markerY);
          return;
        }

        const note = notes[timingEvent.eventIndex];
        if (!note) {
          return;
        }

        const markerX = getNoteCenterX(note);
        if (timingEvent.kind === "miss") {
          drawMissMarker(context, markerX, markerY);
        } else {
          drawHitMarker(context, markerX, markerY);
        }
      });
    }

    return () => {
      container.replaceChildren();
    };
  }, [
    activeEventIndex,
    events,
    targetTapTimeline,
    timingEvents,
    timeSignature.beats,
    timeSignature.beatType,
  ]);

  return <div ref={containerRef} />;
}

function createTimelineAnchors(
  targetTapTimeline: readonly TargetTap[],
  notes: readonly StaveNote[],
): TimelineAnchor[] {
  return targetTapTimeline.flatMap((target) => {
    const note = notes[target.eventIndex];
    if (!note) {
      return [];
    }

    return [{ offsetMs: target.offsetMs, x: getNoteCenterX(note) }];
  });
}

function timingOffsetToX(
  offsetMs: number,
  anchors: readonly TimelineAnchor[],
  minimumX: number,
  maximumX: number,
): number {
  if (anchors.length === 0) {
    return minimumX;
  }

  if (anchors.length === 1) {
    return clamp(anchors[0].x, minimumX, maximumX);
  }

  let leftAnchor = anchors[0];
  let rightAnchor = anchors[1];

  if (offsetMs >= anchors[anchors.length - 1].offsetMs) {
    leftAnchor = anchors[anchors.length - 2];
    rightAnchor = anchors[anchors.length - 1];
  } else {
    for (let index = 1; index < anchors.length; index += 1) {
      if (offsetMs <= anchors[index].offsetMs) {
        leftAnchor = anchors[index - 1];
        rightAnchor = anchors[index];
        break;
      }
    }
  }

  const durationMs = rightAnchor.offsetMs - leftAnchor.offsetMs;
  if (durationMs === 0) {
    return clamp(leftAnchor.x, minimumX, maximumX);
  }

  const progress = (offsetMs - leftAnchor.offsetMs) / durationMs;
  const x = leftAnchor.x + (rightAnchor.x - leftAnchor.x) * progress;
  return clamp(x, minimumX, maximumX);
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
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
