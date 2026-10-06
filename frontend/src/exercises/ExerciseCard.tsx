import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import type { RhythmExercise } from "../rhythm/RhythmModel";

const Score = lazy(() => import("../rhythm/notation/RhythmDraftScore").then(module => ({ default: module.RhythmDraftScore })));

/** 只展示练习；数据来源、操作和反馈由调用方提供。 */
export function ExerciseCard({ title, exercise, actions, hideScore = false }: {
  title: string;
  exercise: RhythmExercise;
  actions?: ReactNode;
  /** 隐藏答案时不挂载小节导航和谱面。 */
  hideScore?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, exercise.measures.length - 1);
  const measures = useMemo(() => [exercise.measures[active].elements], [exercise, active]);
  return <article className="exercise-card" aria-label={`练习：${title}`}>
    <header className="exercise-card-heading">
      <div className="exercise-card-title">
        <h3>{title}</h3>
      </div>
    </header>
    {!hideScore && <div className="exercise-card-controls">
    <div className="exercise-measure-navigation" role="group" aria-label="小节导航">
      <span>小节</span>
      <div className="exercise-measure-buttons">
        {exercise.measures.map((_, index) => <button key={index} type="button"
          aria-label={`跳到小节 ${index + 1}`} aria-pressed={index === active}
          onClick={() => setSelected(index)}>{index + 1}</button>)}
      </div>
    </div>
    </div>}
    {!hideScore && <div className="exercise-card-score" role="group" aria-label={`第 ${active + 1} 小节谱面`}>
      <Suspense fallback={<p role="status">正在加载谱面…</p>}>
        <Score fitMeasure showNavigation={false} measureNumberStart={active + 1} measures={measures} timeSignature={exercise.timeSignature} />
      </Suspense>
    </div>}
    {actions ? <footer>{actions}</footer> : null}
  </article>;
}
