import { Modal } from "../ui/Modal";
import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { SessionName, SessionSummary } from "../api/assistant";

/** 每行拥有菜单和重命名草稿；保存成功后由列表与会话状态接收正式名称。 */
export function ConversationActions({ item, busy, onRename, onDelete }: {
  item: SessionSummary; busy: boolean;
  onRename: (title: string) => Promise<SessionName>;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"rename" | "delete" | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [container, setContainer] = useState<HTMLElement>();
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  const interactedOutside = useRef(false);
  function restoreFocus() {
    // 菜单关闭时入口可能先恢复隐藏；先聚焦所在行，使 :focus-within 显示入口。
    trigger.current?.closest("li")?.querySelector<HTMLButtonElement>(".assistant-history-open")?.focus({ preventScroll: true });
    trigger.current?.focus({ preventScroll: true });
  }
  function finish() {
    openingDialog.current = false;
    setAction(null);
    requestAnimationFrame(restoreFocus);
  }
  async function save() {
    if (saving || (action === "rename" && !draft.trim())) return;
    setSaving(true); setError("");
    try {
      if (action === "delete") await onDelete();
      else await onRename(draft.trim());
      finish();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试。"); }
    finally { setSaving(false); }
  }
  return <><DropdownMenu.Root modal={false} open={open} onOpenChange={value => {
    if (value && busy) return;
    if (value) { interactedOutside.current = false; setContainer(trigger.current?.closest<HTMLElement>(".assistant-history") ?? undefined); }
    setOpen(value);
  }}>
    <DropdownMenu.Trigger asChild>
      <button ref={trigger} type="button" className="assistant-history-actions" aria-label={`对话操作：${item.title}`} aria-disabled={busy}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal container={container}>
      <DropdownMenu.Content className="design-system assistant-conversation-menu" align="end" sideOffset={4} collisionPadding={12}
        onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}
        onInteractOutside={() => { interactedOutside.current = true; }}
        onCloseAutoFocus={event => { event.preventDefault(); if (!openingDialog.current && !interactedOutside.current) restoreFocus(); }}>
        <DropdownMenu.Item disabled={busy || item.is_running || item.unreadable} onSelect={() => {
          openingDialog.current = true; setDraft(item.title); setError(""); setAction("rename");
        }}><Pencil size={16} aria-hidden="true" />重命名</DropdownMenu.Item>
        <DropdownMenu.Item className="assistant-conversation-delete" disabled={busy || item.is_running} onSelect={() => { openingDialog.current = true; setError(""); setAction("delete"); }}>
          <Trash2 size={16} aria-hidden="true" />删除
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
    {action && <Modal title={action === "rename" ? "重命名对话" : "删除对话"}
      description={action === "delete" ? "删除后无法恢复。" : undefined} busy={saving}
      closeLabel={action === "rename" ? "关闭重命名" : "关闭删除确认"} onClose={finish}>
      {close => <form onSubmit={event => { event.preventDefault(); void save(); }}>
        {action === "rename" && <input data-dialog-autofocus aria-label="对话名称" maxLength={60} value={draft} disabled={saving}
          onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} />}
        {error && <p className="app-dialog-error" role="alert">{error}</p>}
        <div className="app-dialog-footer">
          <button data-dialog-autofocus={action === "delete" ? "" : undefined} type="button" disabled={saving} onClick={close}>取消</button>
          <button type="submit" className={action === "rename" ? "app-dialog-primary" : "app-dialog-danger"} disabled={saving || (action === "rename" && !draft.trim())}>{action === "rename" ? (saving ? "保存中…" : "保存") : (saving ? "删除中…" : "删除")}</button>
        </div>
      </form>}
    </Modal>}
  </>;
}
