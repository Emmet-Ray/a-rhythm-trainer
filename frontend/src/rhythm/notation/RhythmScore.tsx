import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarlineType,
  Formatter,
  Renderer,
  StaveNote,
  type RenderContext,
} from "vexflow";

import type { RhythmExercise } from "../RhythmModel";
import { createRhythmStave, getRhythmLineY, prepareRhythmMeasure } from "./RhythmNotation";
import type { ExerciseTimeline, TimingEvent } from "../RhythmTiming";
import { drawTimingMarker } from "./RhythmTimingMarker";
import {
  createPracticeScoreLayout,
  createTimingFeedbackLayout,
  getScoreViewportHeight,
  getScoreEventBounds,
  getScoreFollowTop,
  timingOffsetToScorePosition,
  type MeasureGeometry,
  type ScorePosition,
  type ScoreLayout,
} from "./RhythmScoreLayout";

const ACTIVE_NOTE_COLOR = "var(--ds-primary, #7052d6)";
const MARKER_Y_OFFSET = 32;
// 为页头、标题与操作栏预留高度；极矮窗口仍至少保留一行可读谱面。
const PAGE_CHROME_HEIGHT = 400;

type RhythmScoreProps = {
  exercise: RhythmExercise;
  activeEventIndex: number | null;
  timeline: ExerciseTimeline;
  timingEvents: readonly TimingEvent[];
  /** 仅控制阅读跟随；事件位置来自音频时钟，预备拍指向首事件，停止后传 null。 */
  playback: { roundId: number; eventIndex: number } | null;
  /** 固定在可视窗口上的临时提示，由调用方决定内容；不随谱面滚动或参与排版。 */
  overlay?: ReactNode;
  /** 点击仅报告原谱事件起点，不启动播放、不改变浏览位置。 */
  selection?: { startEventIndex: number; disabled: boolean; onSelect: (measure: number, eventIndex: number) => void };
};

type RenderedScore = {
  context: RenderContext;
  notes: StaveNote[];
  eventPositions: ScorePosition[];
  measures: MeasureGeometry[];
  layout: ScoreLayout;
};

// 排版仅依赖题目和容器宽度；时间线、高亮和判定只更新反馈，不重建基础 SVG。
function RhythmScore({
  exercise,
  activeEventIndex,
  timeline,
  timingEvents,
  playback,
  overlay,
  selection,
}: RhythmScoreProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<RenderedScore | null>(null);
  const automaticScrollTop = useRef(0);
  const [windowHeight, setWindowHeight] = useState(0);
  const [pausedRound, setPausedRound] = useState<number | null>(null);
  const roundId = playback?.roundId ?? null;
  const followingEventIndex = playback?.eventIndex ?? null;
  const followPaused = roundId !== null && pausedRound === roundId;
  const { measures, timeSignature } = exercise;
  const minimumWidth = useMemo(() => containerWidth === 0 ? 320 : Math.max(320, ...measures.map(measure => prepareRhythmMeasure(measure.elements).minimumWidth)), [measures, containerWidth]);
  const scoreLayout = useMemo(() => createPracticeScoreLayout(measures.length, containerWidth, minimumWidth), [measures.length, containerWidth, minimumWidth]);
  const [eventBounds, setEventBounds] = useState<ReturnType<typeof getScoreEventBounds>>([]);
  const pointerOrigin = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      if (width > 0) setContainerWidth((previous) => previous === width ? previous : width);
    });
    observer.observe(viewport);
    const resize = () => setWindowHeight(window.innerHeight);
    resize();
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    if (containerWidth === 0) return;
    const preparedMeasures = measures.map(measure => prepareRhythmMeasure(measure.elements));
    if (scoreLayout.measures.length === 0) return;
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(containerWidth, scoreLayout.height * scoreLayout.scale);
    const context = renderer.getContext();
    context.setFillStyle("var(--ds-score)");
    context.setStrokeStyle("var(--ds-score)");
    context.scale(scoreLayout.scale, scoreLayout.scale);
    const rendered: RenderedScore = { context, notes: [], eventPositions: [], measures: [], layout: scoreLayout };

    preparedMeasures.forEach(({ notes: measureNotes, beams, tuplets }, measureIndex) => {
      const placement = scoreLayout.measures[measureIndex];
      const stave = createRhythmStave(placement.x, placement.y, placement.width, placement.isRowStart);
      // 使用谱表内置编号定位，避免把布局起点误当作可见谱线的位置。
      stave.setMeasure(measureIndex + 1);
      if (!placement.isRowStart) {
        // 左侧小节已画右边界，避免重复描画同一根线。
        stave.setBegBarType(BarlineType.NONE);
      }
      if (measureIndex === 0) {
        stave.addTimeSignature(`${timeSignature.beats}/${timeSignature.beatType}`);
      }
      if (measureIndex === measures.length - 1) stave.setEndBarType(BarlineType.END);
      context.save();
      stave.setContext(context).draw();
      context.restore();
      const markerY = getRhythmLineY(stave) + MARKER_Y_OFFSET;
      if (measureNotes.length > 0) Formatter.FormatAndDraw(context, stave, measureNotes);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
      rendered.notes.push(...measureNotes);
      measureNotes.forEach((note) => {
        rendered.eventPositions.push({
          x: getNoteCenterX(note),
          y: markerY,
        });
      });
      rendered.measures.push({
        eventXs: measureNotes.map(getNoteCenterX),
        markerY,
        minimumX: stave.getNoteStartX(),
        maximumX: stave.getNoteEndX(),
      });
    });
    renderedRef.current = rendered;
    setEventBounds(getScoreEventBounds(rendered.measures, scoreLayout.scale));

    return () => {
      renderedRef.current = null;
      container.replaceChildren();
    };
  }, [containerWidth, measures, timeSignature.beats, timeSignature.beatType, scoreLayout]);

  useEffect(() => {
    const cancelPointer = () => { if (pointerOrigin.current) pointerOrigin.current.moved = true; };
    window.addEventListener("scroll", cancelPointer, true);
    return () => window.removeEventListener("scroll", cancelPointer, true);
  }, []);

  useLayoutEffect(() => {
    const notes = renderedRef.current?.notes ?? [];
    notes.forEach((note, index) => {
      const element = note.getSVGElement();
      if (element) element.style.opacity = index < (selection?.startEventIndex ?? 0) ? "0.35" : "1";
    });
  }, [selection?.startEventIndex, containerWidth, measures, timeSignature, scoreLayout]);

  // 可视高度改变只改变裁剪窗口，不能重建谱面或影响音频时间线。
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const rendered = renderedRef.current;
    if (!viewport || !rendered) return;
    viewport.style.height = `${getScoreViewportHeight(rendered.layout, windowHeight - PAGE_CHROME_HEIGHT)}px`;
    automaticScrollTop.current = viewport.scrollTop;
  }, [containerWidth, windowHeight, measures, timeSignature.beats, timeSignature.beatType]);

  useLayoutEffect(() => {
    if (roundId !== null) {
      automaticScrollTop.current = 0;
      viewportRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [roundId]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const rendered = renderedRef.current;
    if (!viewport || !rendered || followingEventIndex === null || followPaused) return;
    const top = getScoreFollowTop(rendered.layout, timeline, followingEventIndex, viewport.scrollTop, viewport.clientHeight);
    // 按行切换而非连续动画，敲击时音符保持静止；也满足减少动态效果偏好。
    if (Math.abs(top - viewport.scrollTop) > 0.5) {
      automaticScrollTop.current = top;
      viewport.scrollTo({ top, behavior: "instant" });
    }
  }, [roundId, followingEventIndex, followPaused, timeline, containerWidth, windowHeight, measures]);

  function pauseFollow() {
    const viewport = viewportRef.current;
    if (roundId !== null && viewport && viewport.scrollHeight > viewport.clientHeight) setPausedRound(roundId);
  }

  useLayoutEffect(() => {
    const rendered = renderedRef.current;
    if (!rendered) return;
    const { context, eventPositions } = rendered;
    const activeNote = activeEventIndex === null ? undefined : rendered.notes[activeEventIndex]?.getSVGElement();
    if (activeNote) {
      activeNote.style.fill = ACTIVE_NOTE_COLOR;
      activeNote.style.stroke = ACTIVE_NOTE_COLOR;
      activeNote.style.color = ACTIVE_NOTE_COLOR;
    }
    // 复用音符实际排版坐标，只有误敲的位置插值需要当前 BPM 的时间线。
    const layouts = createTimingFeedbackLayout(timeline, rendered.measures).slice(timeline.range.startMeasure, timeline.range.endMeasure);

    const feedback = context.openGroup("timing-feedback") as SVGGElement;
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

    context.closeGroup();
    return () => {
      feedback.remove();
      activeNote?.style.removeProperty("fill");
      activeNote?.style.removeProperty("stroke");
      activeNote?.style.removeProperty("color");
    };
  }, [containerWidth, measures, timeSignature.beats, timeSignature.beatType, activeEventIndex, timeline, timingEvents]);

  return (
    <div className="rhythm-score">
      <div className="rhythm-score-stage">
        <div ref={viewportRef} className="rhythm-score-viewport" role="region" aria-label="节奏乐谱" tabIndex={0}
          onWheel={() => { pointerOrigin.current = null; pauseFollow(); }} onTouchMove={pauseFollow}
          onPointerLeave={() => { if (pointerOrigin.current) pointerOrigin.current.moved = true; }}
          onPointerMove={event => {
            const origin = pointerOrigin.current;
            if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) origin.moved = true;
          }}
          onScroll={event => {
            // 也覆盖原生滚动条拖动；自身的按行滚动不能被误认成用户操作。
            const top = event.currentTarget.scrollTop;
            if (Math.abs(top - automaticScrollTop.current) > 1) pauseFollow();
            automaticScrollTop.current = top;
          }}
          onClick={event => { if (event.detail > 0) event.currentTarget.blur(); }}
          onKeyDown={event => {
            if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) pauseFollow();
          }}>
          <div className="rhythm-score-content">
            <div ref={containerRef} />
            {selection && eventBounds.map(({ eventIndex, measure, localIndex, cursorX, ...bounds }) => <button
              key={eventIndex} type="button" className="score-event-select"
              aria-label={`第 ${measure + 1} 小节第 ${localIndex + 1} 个符号，设为练习起点`}
              aria-pressed={eventIndex === selection.startEventIndex}
              disabled={selection.disabled}
              style={{ ...bounds, "--score-start-x": `${cursorX}px` } as CSSProperties}
              onPointerDown={event => {
                pointerOrigin.current = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY, moved: false } : null;
              }}
              onPointerCancel={() => { pointerOrigin.current = null; }}
              onClick={event => {
                if (event.detail > 0) event.currentTarget.blur();
                const origin = pointerOrigin.current;
                pointerOrigin.current = null;
                if (event.detail !== 0 && (!origin || origin.moved)) return;
                selection.onSelect(measure, eventIndex);
              }} />)}
          </div>
        </div>
        {overlay && <div className="rhythm-score-overlay">{overlay}</div>}
      </div>
      <div className="score-follow-controls">
        {followPaused && <button type="button" onClick={event => {
          event.currentTarget.blur();
          setPausedRound(null);
        }}>继续跟随</button>}
      </div>
    </div>
  );
}

function getNoteCenterX(note: StaveNote): number {
  return (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
}

export default RhythmScore;
