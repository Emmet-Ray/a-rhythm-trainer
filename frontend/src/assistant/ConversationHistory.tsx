import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { X, Trash2, Plus, PanelLeftClose } from "lucide-react";
import { deleteSession, listSessions, type ChatSession, type SessionSummary } from "../api/assistant";

/** 按需读取历史摘要；打开和删除都由后端检查归属。 */
export function ConversationHistory({ panelRef, anchor, currentId, onOpen, onDeleted, onClose, placement = "popover", onNew, currentSession }: {
  panelRef?: Ref<HTMLElement>; anchor?: RefObject<HTMLButtonElement | null>; placement?: "popover" | "sidebar"; onNew?: () => void; currentSession?: Omit<ChatSession, "messages"> | null; currentId?: string; onOpen: (id: string) => Promise<boolean>; onDeleted: (id: string) => void; onClose: () => void;
}) {
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  useImperativeHandle(panelRef, () => panel.current!);
  useLayoutEffect(() => {
    if (placement === "sidebar" || !anchor) return;
    const place = () => {
      const trigger = anchor.current, element = panel.current;
      if (!trigger || !element) return;
      const button = trigger.getBoundingClientRect();
      const container = trigger.closest(".assistant-panel")!.getBoundingClientRect();
      const left = Math.max(16, container.left + 16);
      const right = Math.min(window.innerWidth - 16, container.right - 16);
      const width = Math.min(340, right - left);
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(left, Math.min(button.right - width, right - width))}px`;
      element.style.top = `${button.bottom + 8}px`;
      element.style.maxHeight = `${Math.max(80, Math.min(460, window.innerHeight - button.bottom - 24))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("resize", place);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); };
  }, [anchor, placement]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    if (placement === "popover") heading.current?.focus();
    void listSessions(controller.signal).then(result => {
      if (!controller.signal.aborted) { setItems(result.sessions); setTotal(result.total); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [revision, placement]);
  // 将当前会话的服务端确认合入列表，切换会话后仍保留已更新的条目。
  const [previousSession, setPreviousSession] = useState(currentSession);
  if (currentSession !== previousSession) {
    setPreviousSession(currentSession);
    if (currentSession?.updated_at && currentSession.last_run_status) {
      const summary: SessionSummary = { id: currentSession.id, title: currentSession.title ?? "新对话",
        updated_at: currentSession.updated_at, is_running: currentSession.is_running, unreadable: false };
      setItems(previous => [summary, ...previous.filter(item => item.id !== summary.id)]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      if (!items.some(item => item.id === summary.id)) setTotal(value => Math.max(value, items.length + 1));
    }
  }
  async function remove(item: SessionSummary) {
    if (!window.confirm("删除这段对话？")) return;
    setBusy(true); setError("");
    try {
      await deleteSession(item.id, lifetime.current!.signal);
      if (lifetime.current?.signal.aborted) return;
      onDeleted(item.id);
      setRevision(value => value + 1);
    } catch (error) { if (!lifetime.current?.signal.aborted) { setError(error instanceof Error ? error.message : "删除失败。"); setBusy(false); } }
  }
  async function more() {
    setBusy(true); setError("");
    try {
      const result = await listSessions(lifetime.current!.signal, items.length);
      if (!lifetime.current?.signal.aborted) { setItems(previous => [...previous, ...result.sessions]); setTotal(result.total); }
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : "读取失败。"); }
    finally { if (!lifetime.current?.signal.aborted) setBusy(false); }
  }
  return <section ref={panel} id="assistant-history" className={`assistant-history assistant-history--${placement}`} role={placement === "popover" ? "dialog" : "region"} aria-label="历史对话">
    <div className="assistant-history-heading">
      <h3 ref={heading} tabIndex={-1}>{placement === "sidebar" ? "节奏助手" : "历史对话"}</h3>
      <button type="button" onClick={onClose} aria-label={placement === "sidebar" ? "收起会话列表" : "关闭历史对话"}>{placement === "sidebar" ? <PanelLeftClose size={20} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}</button>
    </div>
    {placement === "sidebar" && <><button type="button" className="assistant-sidebar-new" onClick={onNew}><Plus size={18} aria-hidden="true" />新对话</button><p className="assistant-history-caption">最近对话</p></>}
    {error && <p className="assistant-error" role="alert">{error} <button type="button" disabled={busy} onClick={() => { setError(""); setBusy(true); setRevision(value => value + 1); }}>重试</button></p>}
    {!busy && !error && !items.length && <p className="assistant-history-empty">暂无对话</p>}
    <ul>{items.map(item => <li key={item.id} data-current={item.id === currentId}>
      <button type="button" className="assistant-history-open" title={`${item.title}${item.updated_at ? ` · ${new Date(item.updated_at).toLocaleString()}` : ""}`} disabled={busy || item.unreadable} aria-current={item.id === currentId ? "true" : undefined}
        onClick={async () => { setBusy(true); if (!await onOpen(item.id)) setError("无法打开对话，请重试。"); setBusy(false); }}>
        <span className="assistant-history-title">{item.title}</span>
        {item.unreadable && <small>无法读取</small>}
      </button>
      <button type="button" className="assistant-history-delete" aria-label={`删除对话：${item.title}`} disabled={busy || item.is_running} onClick={() => void remove(item)}><Trash2 size={16} aria-hidden="true" /></button>
    </li>)}</ul>
    {busy && <p role="status" className="assistant-notice">正在读取…</p>}
    {items.length < total && <button type="button" disabled={busy} onClick={() => void more()}>加载更多</button>}
  </section>;
}
