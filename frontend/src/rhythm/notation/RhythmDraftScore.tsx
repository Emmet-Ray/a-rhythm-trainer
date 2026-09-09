import { useEffect, useMemo, useRef } from "react";
import { BarlineType, Beam, Formatter, Renderer, Tuplet, Voice } from "vexflow";
import { expandRhythmElements, type RhythmElement, type RhythmExercise } from "../RhythmModel";
import { createRhythmStave, rhythmEventToVexFlowStaveNote } from "./RhythmNotation";
import { getBeatBeamGroups } from "./RhythmScoreLayout";

type RhythmDraftScoreProps = {
  measures: readonly (readonly RhythmElement[])[];
  timeSignature: RhythmExercise["timeSignature"];
  selectedMeasureIndex?: number;
  onSelectMeasure?: (index: number) => void;
};

// 原样显示草稿或参考答案，不自动补休止符；未传选择回调时仅展示谱面。
export function RhythmDraftScore({
  measures,
  timeSignature,
  selectedMeasureIndex,
  onSelectMeasure,
}: RhythmDraftScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 测量结果同时供绘谱和选择区域使用；切换选中小节不重新排版。
  const score = useMemo(() => {
    let x = 10;
    const preparedMeasures = [];
    for (const [index, elements] of measures.entries()) {
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
      const stave = createRhythmStave(x, 40, 280, index === 0);
      if (index === 0)
        stave.addTimeSignature(
          `${timeSignature.beats}/${timeSignature.beatType}`,
        );
      else stave.setBegBarType(BarlineType.NONE);
      if (index === measures.length - 1) stave.setEndBarType(BarlineType.END);

      const voice = new Voice().setStrict(false).addTickables(notes);
      const noteWidth =
        notes.length > 0
          ? new Formatter()
              .joinVoices([voice])
              .preCalculateMinTotalWidth([voice])
          : 0;
      // 谱号、拍号和右边界占用空间；额外留出音符的阅读间距。
      const notationPadding = stave.getNoteStartX() - x + 30;
      const width = Math.ceil(
        Math.max(
          280,
          notationPadding + Math.max(noteWidth + 40, notes.length * 30),
        ),
      );
      stave.setWidth(width);
      const measure = { x, width, stave, notes, beams, tuplets };
      x += width;
      preparedMeasures.push(measure);
    }
    return { measures: preparedMeasures, width: x + 10, height: 180 };
  }, [measures, timeSignature.beats, timeSignature.beatType]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(score.width, score.height);
    const context = renderer.getContext();
    score.measures.forEach(({ stave, notes, beams, tuplets }) => {
      stave.setContext(context).draw();
      // 宽松排版允许空小节和未填满的小节，不补休止符。
      if (notes.length > 0) Formatter.FormatAndDraw(context, stave, notes);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
    });

    // 同时兼容卸载与开发模式的 Effect 重建，避免留下重复 SVG。
    return () => container.replaceChildren();
  }, [score]);

  return (
    <div style={{ maxWidth: "100%", overflowX: "auto" }}>
      <div
        style={{
          position: "relative",
          width: score.width,
          height: score.height,
        }}
      >
        {onSelectMeasure && (
          <div role="group" aria-label="选择小节">
            {score.measures.map(({ x, width }, index) => (
              <button
                key={index}
                type="button"
                aria-label={`小节 ${index + 1}`}
                aria-pressed={index === selectedMeasureIndex}
                onClick={() => onSelectMeasure(index)}
                style={{
                  position: "absolute",
                  left: x,
                  top: 10,
                  width,
                  height: score.height - 20,
                  padding: 0,
                  border: 0,
                  borderRadius: 0,
                  outlineOffset: -3,
                  backgroundColor:
                    index === selectedMeasureIndex ? "#f0efff" : "transparent",
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
      </div>
    </div>
  );
}
