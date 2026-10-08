import { useAnimatedDismiss } from "../navigation/useAnimatedDismiss";
import { PlaybackContext } from "./PlaybackGroup";
import { useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { GeneratedPracticeWorkspace } from "./GeneratedPracticeWorkspace";
import { PracticeKeyboardScope } from "./usePracticeShortcuts";
import { ExerciseHistory } from "../practice-records/ExerciseHistory";

/** 在来源页面上方临时练习；卸载停止训练，关闭恢复原触发点，在原面板内切换编辑视图。 */
export function GeneratedPracticeOverlay({ generated, onClose }: { generated: GeneratedExercise; onClose: () => void }) {
  const opened = useRef(false);
  const prepare = useCallback((element: HTMLDialogElement) => {
    if (opened.current) element.dataset.viewSwitch = "true";
    opened.current = true;
  }, []);
  return <GeneratedPracticeWorkspace generated={generated}>{view => {
    return <PracticeDialog prepare={prepare} canLeave={view.canLeave} onClose={onClose}>{close => <>
    <ExerciseHistory {...view.history}>
      {({ status, action }) => <header className="generated-practice-heading">
        <div className="generated-practice-title"><h2 id="generated-practice-title">{view.title}</h2>{!view.editing && status}</div>
        <div className="generated-practice-actions">{view.editAction}{!view.editing && action}
          <button type="button" className="generated-practice-close" aria-label="关闭练习" onClick={close}><X size={22} aria-hidden="true" /></button>
        </div>
      </header>}
    </ExerciseHistory>
    <div className="generated-practice-content">
      {view.content}
    </div>
  </>}</PracticeDialog>;
  }}</GeneratedPracticeWorkspace>;
}

/** 对话框的显示、焦点和键盘作用域与实际 DOM 一起挂载。 */
function PracticeDialog({ prepare, canLeave, onClose, children }: {
  prepare: (element: HTMLDialogElement) => void;
  canLeave: () => boolean;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const playback = useContext(PlaybackContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useAnimatedDismiss(dialog, onClose);
  useLayoutEffect(() => {
    playback?.stop();
    const element = dialog.current!;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    prepare(element);
    element.showModal();
    element.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [playback, prepare]);
  const close = () => { if (canLeave()) { playback?.stop(); dismiss(); } };
  return createPortal(<dialog ref={dialog} className="generated-practice-overlay design-system" tabIndex={-1}
    aria-label="练习" aria-modal="true" onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault(); event.stopPropagation(); close();
    }}>
    <PracticeKeyboardScope value={dialog}>{children(close)}</PracticeKeyboardScope>
  </dialog>, document.body);
}
