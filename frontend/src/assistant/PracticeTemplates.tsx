import { useEffect, useRef } from "react";
import { ChevronDown, Hand, Ear } from "lucide-react";

const templates = [
  { title: "生成击拍练习", icon: Hand, text: "给我一道两小节的入门击拍练习，以八分音符为主。" },
  { title: "生成节奏听写", icon: Ear, text: "给我一道两小节的入门节奏听写题，以四分音符和八分音符为主。" },
];

/** 模板只填入输入草稿，不选择训练模式，也不发送请求。 */
export function PracticeTemplates({ onSelect, disabled }: { onSelect: (text: string) => void; disabled: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <details ref={menu} className="assistant-templates" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key === "Escape" && menu.current?.open) {
      event.preventDefault(); event.stopPropagation(); menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
  }}>
    <summary aria-label="练习模板" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}>
      练习<ChevronDown size={14} aria-hidden="true" />
    </summary>
    <div className="assistant-template-options">
      {templates.map(({ title, icon: Icon, text }) => <button key={title} type="button" disabled={disabled} onClick={() => {
        if (menu.current) menu.current.open = false;
        onSelect(text);
      }}><Icon size={16} aria-hidden="true" />{title}</button>)}
    </div>
  </details>;
}
