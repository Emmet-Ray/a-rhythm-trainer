import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { GeneratedPracticeWorkspace } from "./GeneratedPracticeWorkspace";
import { PracticeKeyboardScope } from "./usePracticeShortcuts";
import { ExerciseHistory } from "../practice-records/ExerciseHistory";

/** 在来源页面上方临时练习；卸载停止训练，关闭恢复原触发点，不导航或重建背景。 */
export function GeneratedPracticeOverlay({ generated, onClose }: { generated: GeneratedExercise; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    element.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="generated-practice-overlay design-system" tabIndex={-1}
    aria-labelledby="generated-practice-title" aria-modal="true"
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault(); event.stopPropagation(); onClose();
    }}>
    <ExerciseHistory context={{ source: "ai", exerciseId: generated.id, title: generated.title }} exercise={generated.exercise} mode={generated.mode}>
      {({ status, action }) => <header className="generated-practice-heading">
        <div><h2 id="generated-practice-title">{generated.title}</h2>{status}</div>
        <div className="generated-practice-actions">{action}
          <button type="button" className="generated-practice-close" aria-label="关闭练习" onClick={onClose}><X size={22} aria-hidden="true" /></button>
        </div>
      </header>}
    </ExerciseHistory>
    <div className="generated-practice-content">
      <PracticeKeyboardScope value={dialog}>
        <GeneratedPracticeWorkspace generated={generated} />
      </PracticeKeyboardScope>
    </div>
  </dialog>, document.body);
}
