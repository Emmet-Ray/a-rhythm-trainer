import { useContext, useMemo } from "react";
import { readPracticeOrigin } from "../exercises/aiPracticeNavigation";
import { Navigate, useLocation, useParams } from "react-router";
import { GeneratedExercisesContext } from "../exercises/GeneratedExerciseStore";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { GeneratedPracticeWorkspace } from "../practice/GeneratedPracticeWorkspace";
import { PracticeHeading } from "../practice/PracticeHeading";

export default function AiPracticePage({ mode }: { mode: "tapping" | "dictation" }) {
  const location = useLocation();
  const origin = readPracticeOrigin(location.state);
  const { exerciseId = "" } = useParams();
  const store = useContext(GeneratedExercisesContext);
  const generated = useMemo(() => store?.get(exerciseId) ?? null, [store, exerciseId]);
  if (!generated) return <div className="design-system practice-page">
    <title>AI 练习 · 节奏训练</title>
    <PracticeHeading backTo={origin.path} backLabel={origin.label} title="练习已失效" />
    <p role="status">这份临时练习已不在当前会话中，请打开助手重新生成。</p>
  </div>;
  if (generated.mode !== mode) return <Navigate replace to={`/ai/${generated.mode}/${encodeURIComponent(generated.id)}`} state={location.state} />;
  return <GeneratedPractice key={generated.id} generated={generated} mode={mode} />;
}

function GeneratedPractice({ generated, mode }: { generated: GeneratedExercise; mode: "tapping" | "dictation" }) {
  const label = mode === "dictation" ? "听写练习" : "击拍练习";
  const origin = readPracticeOrigin(useLocation().state);
  return <GeneratedPracticeWorkspace generated={generated}>
    {view => <div className="design-system practice-page">
      <title>{`${view.name} · ${label}`}</title>
      <PracticeHeading backTo={origin.path} backLabel={origin.label} title={view.title}
        history={view.editing ? undefined : view.history}>{view.editAction}</PracticeHeading>
      {view.content}
    </div>}
  </GeneratedPracticeWorkspace>;
}
