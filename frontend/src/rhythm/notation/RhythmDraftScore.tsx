import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { BarlineType, Beam, Formatter, Renderer, Tuplet } from "vexflow";
import { expandRhythmElements, type RhythmElement, type RhythmExercise } from "../RhythmModel";
import { createRhythmStave, rhythmEventToVexFlowStaveNote } from "./RhythmNotation";
import { createDraftScoreLayout, getBeatBeamGroups, getDraftMeasureScrollLeft } from "./RhythmScoreLayout";

export type MeasureFeedback = "unchecked" | "correct" | "incorrect";
const feedbackLabels = { correct: "正确", incorrect: "有错误" };

type RhythmDraftScoreProps = {
  measures: readonly (readonly RhythmElement[])[];
  timeSignature: RhythmExercise["timeSignature"];
  selectedMeasureIndex?: number;
  onSelectMeasure?: (index: number) => void;
  measureFeedback?: readonly MeasureFeedback[];
  overlay?: ReactNode;
  navigationLabel?: string;
  showNavigation?: boolean;
};

// 原样显示草稿或参考答案，不自动补休止符；未传选择回调时导航只改变独立的浏览位置。
export function RhythmDraftScore({
  measures,
  timeSignature,
  selectedMeasureIndex,
  onSelectMeasure,
  measureFeedback,
  overlay,
  navigationLabel = "小节",
  showNavigation = true,
}: RhythmDraftScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const initialPositioned = useRef(false);
  const [browsingMeasure, setBrowsingMeasure] = useState(0);
  const activeMeasure = selectedMeasureIndex ?? Math.min(browsingMeasure, measures.length - 1);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(() => createDraftScoreLayout(
    measures.length, viewportWidth, timeSignature.beats * 4 / timeSignature.beatType,
  ), [measures.length, viewportWidth, timeSignature.beats, timeSignature.beatType]);
  // 历史恢复可能从第 3、4 小节继续：等待真实宽度后只定位一次。
  // 后续编辑、尺寸变化及手动滚动不接管视野；显式跳转仍由 selectMeasure 处理。
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewportWidth <= 0 || initialPositioned.current) return;
    initialPositioned.current = true;
    if (selectedMeasureIndex !== undefined) {
      viewport.scrollLeft = getDraftMeasureScrollLeft(layout, selectedMeasureIndex, viewport.scrollLeft, viewport.clientWidth);
    }
  }, [layout, viewportWidth, selectedMeasureIndex]);
  // 测量结果同时供绘谱和选择区域使用；切换选中小节不重新排版。
  const score = useMemo(() => {
    const preparedMeasures = [];
    for (const [index, elements] of measures.entries()) {
      const { x, y, width } = layout.measures[index];
      const expanded = expandRhythmElements(elements);
      const notes = expanded.events.map(({ event }) =>
        rhythmEventToVexFlowStaveNote(event),
      );
      // 三连音比例会改变排版时值，必须在测量之前关联，草稿仍保留组结构。
      const tuplets = expanded.tripletGroups.map(
        (indexes) =>
          new Tuplet(
            indexes.map((noteIndex) => notes[noteIndex]),
            { numNotes: 3, notesOccupied: 2, bracketed: false },
          ),
      );
      const beams = getBeatBeamGroups(elements).map(
        (indexes) => new Beam(indexes.map((noteIndex) => notes[noteIndex])),
      );
      const stave = createRhythmStave(x, y, width, index === 0);
      stave.setMeasure(index + 1);
      if (index === 0)
        stave.addTimeSignature(
          `${timeSignature.beats}/${timeSignature.beatType}`,
        );
      else stave.setBegBarType(BarlineType.NONE);
      if (index === measures.length - 1) stave.setEndBarType(BarlineType.END);
      // 修改谱号/小节号等修饰后重新固定宽度，避免记谱库重新测量为空小节文本宽度。
      stave.setWidth(width);

      const measure = { x, width, stave, notes, beams, tuplets };
      preparedMeasures.push(measure);
    }
    return { ...layout, measures: preparedMeasures };
  }, [measures, layout, timeSignature.beats, timeSignature.beatType]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(score.width * score.scale, score.height * score.scale);
    const context = renderer.getContext();
    context.setFillStyle("var(--ds-score)");
    context.setStrokeStyle("var(--ds-score)");
    context.scale(score.scale, score.scale);
    score.measures.forEach(({ stave, notes, beams, tuplets }) => {
      context.save();
      stave.setContext(context).draw();
      context.restore();
      // 宽松排版允许空小节和未填满的小节，不补休止符。
      if (notes.length > 0) Formatter.FormatAndDraw(context, stave, notes);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
    });

    // 同时兼容卸载与开发模式的 Effect 重建，避免留下重复 SVG。
    return () => container.replaceChildren();
  }, [score]);

  function selectMeasure(index: number) {
    if (onSelectMeasure) onSelectMeasure(index);
    else setBrowsingMeasure(index);
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollLeft = getDraftMeasureScrollLeft(layout, index, viewport.scrollLeft, viewport.clientWidth);
  }

  return (
    <div className="rhythm-draft-score">
      {showNavigation && <div className="draft-measure-navigation" role="group" aria-label="小节导航">
        <span>{navigationLabel}</span>
        {measures.map((_, index) => {
          const verdict = measureFeedback?.[index];
          const checked = verdict === "correct" || verdict === "incorrect";
          return <button key={index} type="button" aria-label={`跳到小节 ${index + 1}${checked ? `，${feedbackLabels[verdict]}` : ""}`}
            aria-pressed={index === activeMeasure} onClick={() => selectMeasure(index)}>
            {index + 1}
            {checked && <span className="draft-navigation-verdict" data-verdict={verdict} aria-hidden="true">{verdict === "correct" ? <Check className="ui-icon" focusable="false" /> : <X className="ui-icon" focusable="false" />}</span>}
          </button>;
        })}
      </div>}
    <div style={{ position: "relative", minWidth: 0 }}>
    <div ref={viewportRef} className="rhythm-draft-viewport" role="region" aria-label="节奏谱面，可左右滚动" tabIndex={0}
      style={{ width: "100%", minWidth: 0, overflowX: "auto" }}>
      <div
        style={{
          position: "relative",
          width: score.width * score.scale,
          height: score.height * score.scale,
        }}
      >
        {onSelectMeasure && (
          <div role="group" aria-label="选择小节">
            {score.measures.map(({ x, width }, index) => (
              <button
                key={index}
                type="button"
                className="rhythm-measure-selection"
                aria-label={`小节 ${index + 1}`}
                aria-pressed={index === activeMeasure}
                onClick={() => selectMeasure(index)}
                style={{
                  position: "absolute",
                  left: x * score.scale,
                  top: 10 * score.scale,
                  width: width * score.scale,
                  height: (score.height - 20) * score.scale,
                  padding: 0,
                  border: 0,
                  borderRadius: 0,
                  outlineOffset: -3,
                  backgroundColor:
                    index === activeMeasure ? "var(--rhythm-selected-measure, #f0efff)" : "transparent",
                }}
              />
            ))}
          </div>
        )}
        {/* 谱线画在选择背景上方；点击穿透到按钮，两层一起滚动。 */}
        <div
          className="rhythm-answer-notation"
          ref={containerRef}
          aria-hidden="true"
          style={{ position: "relative", pointerEvents: "none" }}
        />
        {measureFeedback?.map((feedback, index) => {
          const placement = score.measures[index];
          return feedback && feedback !== "unchecked" && placement ? <div key={index} className="draft-measure-feedback"
            style={{ left: placement.x * score.scale, width: placement.width * score.scale }}>
            <span role="status" aria-label={`小节 ${index + 1} 验证结果`} data-verdict={feedback}>
              {feedback === "correct" ? <Check className="ui-icon" aria-hidden="true" focusable="false" /> : <X className="ui-icon" aria-hidden="true" focusable="false" />} {feedbackLabels[feedback]}
            </span>
          </div> : null;
        })}
      </div>
    </div>
    {overlay && <div className="rhythm-score-overlay">{overlay}</div>}
    </div>
    </div>
  );
}
