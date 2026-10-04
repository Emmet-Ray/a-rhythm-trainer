import { Suspense, useContext, useMemo } from "react";
import { readPracticeOrigin } from "../exercises/aiPracticeNavigation";
import { useLocation, useParams } from "react-router";
import { GeneratedExercisesContext } from "../exercises/GeneratedExerciseStore";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { useAssistantPageContext } from "../assistant/assistantContext";
import { workspaceModule } from "../practice/practiceModules";
import { PracticeHeading } from "../practice/PracticeHeading";
import { LoadingPlaceholder } from "../navigation/LoadingPlaceholder";

const PracticeWorkspace = workspaceModule.Component;

export default function AiPracticePage() {
  const origin = readPracticeOrigin(useLocation().state);
  const { exerciseId = "" } = useParams();
  const store = useContext(GeneratedExercisesContext);
  const generated = useMemo(() => store?.get(exerciseId) ?? null, [store, exerciseId]);
  if (!generated) return <div className="design-system practice-page">
    <title>AI 练习 · 节奏训练</title>
    <PracticeHeading backTo={origin.path} backLabel={origin.label} title="练习已失效" />
    <p role="status">这份临时练习已不在当前会话中，请打开助手重新生成。</p>
  </div>;
  return <GeneratedPractice key={generated.id} generated={generated} />;
}

function GeneratedPractice({ generated }: { generated: GeneratedExercise }) {
  const origin = readPracticeOrigin(useLocation().state);
  const context = { source: "ai" as const, exerciseId: generated.id, title: generated.title };
  useAssistantPageContext({ page: "ai-practice", description: "AI 生成的击拍练习",
    state: { mode: "tapping", exercise_id: generated.id, title: generated.title, exercise: generated.exercise } });
  return <div className="design-system practice-page">
    <title>{`${generated.title} · 击拍练习`}</title>
    <p className="ai-practice-source">AI 练习</p>
    <PracticeHeading backTo={origin.path} backLabel={origin.label} title={generated.title}
      history={{ context, exercise: generated.exercise, mode: "tapping" }} />
    <Suspense fallback={<LoadingPlaceholder workspace label="正在加载练习…" />}>
      <PracticeWorkspace exercise={generated.exercise} exerciseKey={generated.id} mode="tapping"
        recoveryScope={`ai:tapping:${generated.id}`} recordContext={context} />
    </Suspense>
  </div>;
}
