import { Suspense, useContext, useSyncExternalStore } from "react";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { GeneratedExercisesContext } from "../exercises/GeneratedExerciseStore";
import { workspaceModule } from "./practiceModules";
import { LoadingPlaceholder } from "../navigation/LoadingPlaceholder";

const PracticeWorkspace = workspaceModule.Component;

/** 页面和覆盖面板共用生成练习的记录身份、听写曝光状态与恢复范围。 */
export function GeneratedPracticeWorkspace({ generated }: { generated: GeneratedExercise }) {
  const store = useContext(GeneratedExercisesContext)!;
  const viewed = useSyncExternalStore(store.subscribe, () => store.hasViewedAnswer(generated.id));
  return <Suspense fallback={<LoadingPlaceholder workspace label="正在加载练习…" />}>
    <PracticeWorkspace exercise={generated.exercise} exerciseKey={generated.id} mode={generated.mode}
      recoveryScope={`ai:${generated.mode}:${generated.id}`}
      recordContext={{ source: "ai", exerciseId: generated.id, title: generated.title }} answerExposed={viewed}
      onAnswerViewed={() => store.markAnswerViewed(generated.id)} />
  </Suspense>;
}
