import { useLayoutEffect, useMemo, useRef } from "react";
import { expandRhythmElements, type RhythmExercise } from "../../rhythm/RhythmModel";
import { drawRhythmPosters, exercisePosterExamples } from "../rendering/RhythmPosters";

/** Same notation as the room posters, composed on one sheet for the catalog. */
export function RhythmCardPoster({ exercise, number }: { exercise: RhythmExercise; number: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const examples = useMemo(() => {
    const examples = exercisePosterExamples(exercise);
    const repeated = examples.length === 2 && JSON.stringify(examples[1]) === JSON.stringify([...examples[0], ...examples[0]]);
    return repeated ? examples.slice(1) : examples;
  }, [exercise]);
  const posters = useMemo(() => {
    const widths = examples.map(elements => Math.max(22, expandRhythmElements(elements).events.length * 7 + 10));
    return examples.map((elements, index) => ({
      x: widths.slice(0, index).reduce((sum, width) => sum + width + 10, 0),
      y: 0, width: widths[index], height: 24, elements,
    }));
  }, [examples]);
  const width = posters.length ? posters.at(-1)!.x + posters.at(-1)!.width : 22;
  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, 30);
    drawRhythmPosters(context, posters, { largeNoteheads: true });
  }, [posters, width]);
  return <div className="orbit-rhythm-paper" aria-hidden="true">
    <span className="orbit-level-number">{String(number).padStart(2, "0")}</span>
    <canvas ref={canvasRef} data-wide={width > 100 || undefined} width={width} height={30} />
  </div>;
}
