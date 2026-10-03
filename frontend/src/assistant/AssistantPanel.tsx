import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MessageCircle, Plus, X, RefreshCw, ArrowUp, Square } from "lucide-react";
import { AssistantConversation } from "./conversation";
import { useAssistantContext } from "./assistantContext";

export function AssistantPanel() {
  const [conversation] = useState(() => new AssistantConversation());
  const state = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot, conversation.getSnapshot);
  const { readCurrentPageContext } = useAssistantContext();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; conversation.dispose(); }, [conversation]);
  useEffect(() => {
    if (open && follow.current && thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [open, state]);

  useEffect(() => {
    const field = input.current;
    if (!open || !field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 144)}px`;
  }, [draft, open]);

  async function send() {
    const before = conversation.getSnapshot();
    if (!draft.trim() || before.busy || before.needsSync || before.expired) return;
    const originalDraft = draft;
    const text = draft.trim(), version = generation.current;
    const previousEntryCount = before.session?.entries.length ?? 0;
    follow.current = true;
    setDraft("");
    await conversation.send(text, readCurrentPageContext());
    if (version !== generation.current) return;
    const after = conversation.getSnapshot();
    // 仅在已确认本次输入没有写入会话时恢复。不能用文字相等判断：用户可能连续发送相同内容。
    const accepted = after.session?.entries.slice(previousEntryCount).some(entry => entry.type === "user");
    if (!after.needsSync && !accepted) setDraft(current => current || originalDraft);
  }
  function newConversation() {
    if ((state.session || draft) && !window.confirm("开始新对话？当前面板将清空，正在生成的回答会停止。")) return;
    generation.current++;
    conversation.reset(); setDraft(""); follow.current = true;
    input.current?.focus();
  }
  function close() { setOpen(false); requestAnimationFrame(() => launcher.current?.focus()); }
  const blocked = state.busy || state.needsSync || state.expired;

  return <div className="assistant-shell">
    <button ref={launcher} className="assistant-launcher" hidden={open} type="button"
      aria-label="打开 AI 助手" aria-expanded={open} aria-controls="assistant-panel"
      onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}>
      <MessageCircle size={22} aria-hidden="true" /><span>AI 助手</span>
    </button>
    <aside id="assistant-panel" className="assistant-panel" hidden={!open} aria-labelledby="assistant-title"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <header className="assistant-heading">
        <h2 id="assistant-title">节奏助手</h2>
        <div className="assistant-actions">
          <button type="button" className="assistant-new" aria-label="新对话" onClick={newConversation}><Plus size={16} aria-hidden="true" />新对话</button>
          <button type="button" aria-label="收起助手" title="收起助手" onClick={close}><X size={19} aria-hidden="true" /></button>
        </div>
      </header>
      <div ref={thread} className="assistant-messages" role="log" aria-label="对话记录" aria-live="polite"
        onScroll={() => { const el = thread.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }}>
        {!state.session?.entries.length && !state.pending ? <div className="assistant-empty">
          <MessageCircle size={30} aria-hidden="true" /><h3>从一个节奏问题开始</h3>
          <p>试着问“四分音符和八分音符有什么区别？”</p><p>在编辑页，还可以询问当前草稿的内容。</p>
        </div> : null}
        {state.session?.entries.map((entry, index) => <article className={`assistant-message ${entry.type}`} key={index} aria-label={entry.type === "user" ? "你的消息" : "助手回答"}>
          <p className="assistant-message-text">{entry.text}</p>
          <div className="assistant-message-meta">
            <time dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>{new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>

          </div>
        </article>)}
        {state.pending ? <div className="assistant-pending">
          <article className="assistant-message user" aria-label="正在发送的消息"><p className="assistant-message-text">{state.pending.question}</p></article>
          <article className="assistant-message assistant" aria-label="正在生成的回答">
            <p className="assistant-message-text">{state.pending.text || "正在思考…"}</p>
            <small className="assistant-notice">{state.busy ? "生成中" : "临时内容，等待同步"}</small>
          </article>
        </div> : null}
      </div>
      <form className="assistant-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        {state.error ? <p className="assistant-error" role="alert">{state.error}</p> : null}
        {state.notice ? <p className="assistant-notice" role="status">{state.notice}</p> : null}
        {state.needsSync && !state.expired ? <button type="button" disabled={state.busy} onClick={() => void conversation.sync()}>
          <RefreshCw size={16} />同步状态</button> : null}
        {state.expired ? <button type="button" onClick={newConversation}>开始新对话</button> : null}
        <div className="assistant-input-box">
          <textarea ref={input} id="assistant-input" aria-label="向助手提问" value={draft} onChange={event => setDraft(event.target.value)}
            maxLength={4000} rows={1} disabled={state.busy} placeholder="问点节奏相关的问题…"
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault(); void send();
              }
            }} />
          <div className="assistant-input-actions">
            {state.busy ? <button type="button" aria-label="停止生成" title="停止生成" onClick={() => conversation.stop()}><Square size={15} aria-hidden="true" /></button>
              : <button type="submit" aria-label="发送" title="发送" disabled={blocked || !draft.trim()}><ArrowUp size={19} aria-hidden="true" /></button>}
          </div>
        </div>
      </form>
    </aside>
  </div>;
}
