import { lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import type { ExerciseDraft, CustomExercise } from "../exercises/customExercises";
import type { ExerciseContext } from "../practice-records/PracticeRecord";
import { saveExercise, updateExercise } from "../api/customExercises";
import { useVisitState } from "../navigation/usePageNavigation";
import { LoadingPlaceholder } from "../navigation/LoadingPlaceholder";
import { PlaybackContext } from "./PlaybackGroup";
import { workspaceModule } from "./practiceModules";

const ExerciseEditor = lazy(() => import("./ExerciseEditor"));
const PracticeWorkspace = workspaceModule.Component;

export type WorkbenchView = {
  title: ReactNode;
  name: string;
  editing: boolean;
  editAction: ReactNode;
  content: ReactNode;
  history: { context: ExerciseContext; exercise: ExerciseDraft["exercise"]; mode: ExerciseDraft["mode"] };
  /** 关闭所在弹窗等非路由离开也必须经过草稿保护。 */
  canLeave: () => boolean;
};

/** 同一道题的练习／编辑生命周期。来源决定首次保存的身份，之后始终更新保存的副本。
 * 外层只安排题头和容器，不持有草稿，也不因切换视图改变导航位置。
 */
export function ExerciseWorkbench({ initial, origin, initialEditing = false, answerExposed = false, onAnswerViewed, onBusyChange, onEditingChange, onCancelNew, children }: {
  initial: ExerciseDraft;
  origin: ExerciseContext | null;
  initialEditing?: boolean;
  answerExposed?: boolean;
  onAnswerViewed?: () => void;
  onBusyChange?: (busy: boolean) => void;
  onEditingChange?: (editing: boolean) => void;
  onCancelNew?: () => void;
  children: (view: WorkbenchView) => ReactNode;
}) {
  const scope = `${origin?.source ?? "new"}:${initial.mode}:${origin?.exerciseId ?? "exercise"}`;
  const [saved, setSaved] = useVisitState<CustomExercise | null>(`workbench:${scope}:saved`, null);
  const [editing, setEditing] = useState(initialEditing);
  const [viewed, setViewed] = useVisitState(`workbench:${scope}:viewed`, false);
  const [version, setVersion] = useVisitState(`workbench:${scope}:version`, 0);
  const playback = useContext(PlaybackContext);
  const [guard, setGuard] = useState<(() => boolean) | null>(null);
  const registerGuard = useCallback((next: (() => boolean) | null) => { setGuard(() => next); }, []);
  const current = saved ?? initial;
  const context: ExerciseContext = saved
    ? { source: "custom", exerciseId: saved.id, title: saved.name }
    : { source: "custom", exerciseId: "new", ...origin, title: current.name };
  useEffect(() => {
    if (editing) onAnswerViewed?.();
  }, [editing, onAnswerViewed]);
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  const stop = () => { playback?.stop(); onBusyChange?.(false); };
  const canLeave = () => !editing || (guard?.() ?? false);
  const editAction = editing ? null : <div className="text-actions"><button type="button" className="exercise-edit" onClick={() => {
    stop(); setViewed(true); setEditing(true);
  }}><Pencil className="ui-icon" aria-hidden="true" />编辑</button></div>;
  const view = { name: current.name, title: current.name, editing, editAction, history: { context, exercise: current.exercise, mode: current.mode }, canLeave };
  return <Suspense fallback={children({ ...view, content: <LoadingPlaceholder workspace label="正在加载练习…" /> })}>
    {editing ? <ExerciseEditor initial={current} scope={scope} registerGuard={registerGuard}
      onSave={draft => {
        const id = saved?.id ?? (origin?.source === "custom" ? origin.exerciseId : undefined);
        return id ? updateExercise(id, draft) : saveExercise(draft);
      }}
      onSaved={item => { stop(); setSaved(item); setViewed(true); setVersion(value => value + 1); setEditing(false); }}
      onCancel={() => {
        stop();
        if (!saved && onCancelNew) onCancelNew();
        else setEditing(false);
      }}>{editor => children({ ...view, title: editor.title, editAction: editor.actions, content: editor.content })}</ExerciseEditor>
      : children({ ...view, content: <PracticeWorkspace exercise={current.exercise} mode={current.mode} exerciseKey={`${context.exerciseId}:${version}`}
        recoveryScope={scope} recordContext={context} answerExposed={answerExposed || viewed || initialEditing}
        onAnswerViewed={onAnswerViewed} onBusyChange={onBusyChange} /> })}
  </Suspense>;
}
