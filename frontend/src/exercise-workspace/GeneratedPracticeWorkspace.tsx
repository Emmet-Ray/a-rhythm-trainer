import { useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { GeneratedExercisesContext } from "../exercises/GeneratedExerciseStore";
import { ExerciseWorkbench, type WorkbenchView } from "./ExerciseWorkbench";

/** AI 页面与面板共享题目身份和答案曝光，保存的编辑副本由工作区维护。 */
export function GeneratedPracticeWorkspace({ generated, children }: {
  generated: GeneratedExercise;
  children: (view: WorkbenchView) => ReactNode;
}) {
  const store = useContext(GeneratedExercisesContext)!;
  const viewed = useSyncExternalStore(store.subscribe, () => store.hasViewedAnswer(generated.id));
  const markViewed = useCallback(() => store.markAnswerViewed(generated.id), [store, generated.id]);
  return <ExerciseWorkbench initial={{ name: generated.title, mode: generated.mode, exercise: generated.exercise }}
    origin={{ source: "ai", exerciseId: generated.id, title: generated.title }}
    answerExposed={viewed} onAnswerViewed={markViewed}>{children}</ExerciseWorkbench>;
}
