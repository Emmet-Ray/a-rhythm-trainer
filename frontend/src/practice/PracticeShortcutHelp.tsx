import { useId } from "react";
import { Keyboard, X } from "lucide-react";
import { practiceShortcuts } from "./usePracticeShortcuts";
import type { ExerciseContext, PracticeRecord } from "../practice-records/PracticeRecord";

export default function PracticeShortcutHelp({ mode, source }: {
  mode: PracticeRecord["mode"];
  source?: ExerciseContext["source"];
}) {
  const id = useId();
  const items: { label: string; key: string }[] = mode === "tapping"
    ? [practiceShortcuts.practice, practiceShortcuts.listen, practiceShortcuts.stop, { label: "击拍", key: "空格" }]
    : [];
  if (source === "preset") items.push(practiceShortcuts.previous, practiceShortcuts.next);
  if (source === "random") items.push({ ...practiceShortcuts.next, label: "换一题" });
  if (!items.length) return null;
  return <div className="practice-shortcuts text-actions">
    <button type="button" popoverTarget={id} aria-label="查看快捷键"><Keyboard className="ui-icon" aria-hidden="true" />快捷键</button>
    <div id={id} popover="auto" className="practice-shortcuts-panel" role="dialog" aria-labelledby={id + "-title"}>
      <header><h2 id={id + "-title"}>快捷键</h2><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="关闭快捷键"><X className="ui-icon" aria-hidden="true" /></button></header>
      <dl>{items.map(({ label, key }) => <div key={key}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl>
    </div>
  </div>;
}
