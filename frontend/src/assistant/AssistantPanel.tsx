import { useChat } from "@ai-sdk/react";
import { isToolUIPart, getToolName } from "ai";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { PracticeActivityContext } from "./practiceActivity";
import {
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CircleAlert,
  History,
  PanelLeftOpen,
  MessageCircle,
  Plus,
  X,
  RefreshCw,
  ArrowUp,
  Square,
} from "lucide-react";
import { ExerciseProposalResult } from "./tool-results/ExerciseProposalResult";
import { GeneratedPracticeOverlay } from "../practice/GeneratedPracticeOverlay";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { PracticeTemplates } from "./PracticeTemplates";
import { PlaybackGroup } from "../practice/PlaybackGroup";
import { AssistantConversation } from "./conversation";
import { useAssistantContext } from "./assistantContext";
import { useAssistantPresentation } from "./useAssistantPresentation";
import { useAssistantAvailability } from "./useAssistantAvailability";
import { ModelSelector } from "./ModelSelector";
import { ConversationHistory } from "./ConversationHistory";
import type { ModelSelection } from "../api/modelConnections";
import type { CardState } from "../api/assistant";
import HomePage from "../pages/HomePage";

export function AssistantPanel({ home = false }: { home?: boolean }) {
  const activity = useContext(PracticeActivityContext);
  const activityLabel = useSyncExternalStore(activity?.subscribe ?? (() => () => {}), activity?.getLabel ?? (() => ""), () => "");
  const availability = useAssistantAvailability();
  const {
    panel: panelRef,
    launcher: launcherRef,
    visible,
    modal,
    open,
    close: closePanel,
  } = useAssistantPresentation(home, availability.ready);
  const [playbackGroup] = useState(() => new PlaybackGroup());
  const [conversation] = useState(() => new AssistantConversation("instance"));
  const [modelAvailable, setModelAvailable] = useState(false);
  const [modelChoice, setModelChoice] = useState<ModelSelection | null>(null);
  const modelAvailabilityChanged = useCallback((available: boolean, selection: ModelSelection | null) => {
    setModelAvailable(available); setModelChoice(selection);
  }, []);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const sessionSidebar = useRef<HTMLElement>(null);
  const sessionToggle = useRef<HTMLButtonElement>(null);
  // 窄屏会话列表覆盖正文时，键盘操作留在列表内；返回宽屏后恢复普通侧栏。
  useEffect(() => {
    if (!mobileHistoryOpen) return;
    const sidebar = sessionSidebar.current;
    const toggle = sessionToggle.current;
    if (!sidebar) return;
    const buttons = () => Array.from(sidebar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    buttons()[0]?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileHistoryOpen(false);
      } else if (event.key === "Tab") {
        const items = buttons();
        const first = items[0];
        const last = items.at(-1);
        if (!sidebar.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    const media = window.matchMedia("(max-width: 1000px)");
    const resize = () => { if (!media.matches) setMobileHistoryOpen(false); };
    document.addEventListener("keydown", keydown);
    media.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", keydown);
      media.removeEventListener("change", resize);
      if (media.matches) toggle?.focus({ preventScroll: true });
    };
  }, [mobileHistoryOpen]);
  const historyAnchor = useRef<HTMLDivElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    historyButton.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!historyOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !historyAnchor.current?.contains(event.target)) setHistoryOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [historyOpen]);
  const saveCard = useCallback((id: string, value: CardState) => conversation.saveCard(id, value), [conversation]);
  useEffect(() => {
    if (availability.ready) void conversation.restore();
  }, [availability.ready, conversation]);
  const { messages, status } = useChat({ chat: conversation.chat, throttle: 40 });
  const state = useSyncExternalStore(
    conversation.subscribe,
    conversation.getSnapshot,
    conversation.getSnapshot,
  );
  useEffect(() => {
    for (const entry of state.session?.messages ?? []) {
      if (entry.role !== "user") continue;
      const batch = entry.metadata?.page_context?.state.practice_activity;
      if (batch && typeof batch === "object" && !Array.isArray(batch) && typeof batch.batchId === "string") activity?.acknowledge(batch.batchId);
    }
  }, [activity, state.session]);
  useEffect(() => {
    if (!state.needsSync || state.busy || state.expired) return;
    const timer = setTimeout(() => void conversation.sync(), 1500);
    return () => clearTimeout(timer);
  }, [conversation, state.needsSync, state.busy, state.expired]);
  const activitySession = useRef<string | null>(null);
  useEffect(() => {
    if (activitySession.current === (state.session?.id ?? null)) return;
    activitySession.current = state.session?.id ?? null;
    if (state.session) {
      activity?.start();
      const focus = state.session.messages.findLast(message => message.role === "user")?.metadata?.page_context?.state.practice_focus;
      if (!activity?.getFocus()) activity?.restoreFocus(focus);
    }
  }, [activity, state.session]);
  const { readCurrentPageContext, practiceLabel } = useAssistantContext();
  const [practice, setPractice] = useState<GeneratedExercise | null>(null);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const generation = useRef(0);
  const scrollPosition = useRef(0);
  const initializing = availability.loading || (availability.ready &&
    !state.initialized);
  const started = Boolean(messages.length || state.busy || state.expired);
  const lastMessage = messages.at(-1);
  const waitingForContent = status === "submitted" || (status === "streaming" &&
    (lastMessage?.role !== "assistant" || lastMessage.parts.every(part => part.type === "step-start" || part.type === "reasoning")));
  useEffect(
    () => () => {
      generation.current++;
      conversation.dispose();
      playbackGroup.stop();
    },
    [conversation, playbackGroup],
  );
  useEffect(() => {
    if (!visible) playbackGroup.stop();
  }, [visible, playbackGroup]);
  useEffect(() => {
    if (visible && follow.current && thread.current)
      thread.current.scrollTop = thread.current.scrollHeight;
  }, [visible, state, messages]);

  useLayoutEffect(() => {
    const field = input.current;
    const box = field?.parentElement;
    if (!visible || !field || !box) return;
    // 始终用单行布局的可用宽度判断换行，避免展开后变宽引起布局反复切换。
    const resize = () => {
      const style = getComputedStyle(box);
      const controls = box.querySelector<HTMLElement>(".assistant-templates")!;
      const actions = box.querySelector<HTMLElement>(
        ".assistant-input-actions",
      )!;
      const width =
        box.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        controls.offsetWidth -
        actions.offsetWidth -
        (box.querySelector<HTMLElement>(".assistant-model-control")?.offsetWidth ?? 0) -
        3 * parseFloat(style.columnGap);
      field.style.width = `${Math.max(width, 1)}px`;
      field.style.height = "0px";
      box.dataset.multiline = String(
        field.scrollHeight > parseFloat(getComputedStyle(field).lineHeight) + 1,
      );
      field.style.width = "";
      field.style.height = "0px";
      field.style.height = `${Math.min(field.scrollHeight, 144)}px`;
    };
    resize();
    let width = box.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (width !== box.clientWidth) {
        width = box.clientWidth;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(resize);
      }
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [draft, visible, home, availability.ready, initializing, modelChoice?.model]);

  useLayoutEffect(() => {
    const element = thread.current;
    if (visible && element)
      element.scrollTop = follow.current
        ? element.scrollHeight
        : scrollPosition.current;
  }, [home, visible]);

  function suggest(text: string) {
    setDraft(text);
    input.current?.focus();
  }

  async function send() {
    const before = conversation.getSnapshot();
    if (
      !availability.ready || !modelAvailable || initializing ||
      !draft.trim() ||
      before.busy ||
      before.needsSync ||
      before.expired
    )
      return;
    const originalDraft = draft;
    const text = draft.trim(),
      version = generation.current;
    const previousEntryCount = before.session?.messages.length ?? 0;
    follow.current = true;
    setDraft("");
    activity?.start();
    const page = readCurrentPageContext();
    const batch = activity?.prepare();
    const focus = activity?.getFocus();
    const context = batch || focus ? { ...(page ?? { page: "unknown", description: "当前页面未提供上下文", state: {} }),
      state: { ...page?.state, practice_activity: batch ?? null, practice_focus: focus ?? null } } : page;
    await conversation.send(text, context, modelChoice ?? undefined);
    if (version !== generation.current) return;
    const after = conversation.getSnapshot();
    // 仅在已确认本次输入没有写入会话时恢复。不能用文字相等判断：用户可能连续发送相同内容。
    const accepted = after.session?.messages
      .slice(previousEntryCount)
      .some((entry) => entry.role === "user");
    if (!after.needsSync && !accepted)
      setDraft((current) => current || originalDraft);
  }
  function newConversation() {
    generation.current++;
    playbackGroup.stop();
    conversation.reset();
    setHistoryOpen(false);
    setPractice(null);
    activity?.reset();
    setDraft("");
    follow.current = true;
    input.current?.focus();
  }
  function close() {
    playbackGroup.stop();
    closePanel();
  }
  const blocked = state.selectingModel ||
    !availability.ready || !modelAvailable || initializing || state.busy || state.needsSync || state.expired;

  const deleteConversation = (id: string) => {
    if (state.session?.id !== id) return;
    conversation.reset(); activity?.reset(); setDraft(""); setPractice(null);
  };
  const openConversation = async (id: string) => {
    if (id === state.session?.id) {
      closeHistory(); setMobileHistoryOpen(false); return true;
    }
    if (draft && !window.confirm("打开历史对话将清空当前输入草稿，是否继续？")) return false;
    generation.current++;
    const opened = await conversation.open(id);
    if (opened) {
      activity?.reset(); activity?.start();
      activity?.restoreFocus(conversation.getSnapshot().session?.messages.findLast(message => message.role === "user")?.metadata?.page_context?.state.practice_focus);
      setDraft(""); setPractice(null); follow.current = true;
      setHistoryOpen(false); setMobileHistoryOpen(false);
      requestAnimationFrame(() => input.current?.focus());
    }
    return opened;
  };
  return (
    <div className="assistant-shell" data-layout={home ? "home" : "sidebar"} data-history-expanded={home && sidebarExpanded && availability.ready && !initializing} data-mobile-history={mobileHistoryOpen}>
      {home && availability.ready && !initializing && <>
        {mobileHistoryOpen && <button className="assistant-history-backdrop" aria-label="关闭会话列表" onClick={() => setMobileHistoryOpen(false)} />}
        <aside ref={sessionSidebar} role={mobileHistoryOpen ? "dialog" : undefined} aria-modal={mobileHistoryOpen ? true : undefined} aria-label="会话列表" className="assistant-session-sidebar" onKeyDown={event => { if (event.key === "Escape" && !mobileHistoryOpen) { setSidebarExpanded(false); requestAnimationFrame(() => sessionToggle.current?.focus()); } }}>
          <ConversationHistory placement="sidebar" currentId={state.session?.id} refreshKey={`${state.session?.id ?? ""}:${state.busy}`}
            onNew={() => { newConversation(); setMobileHistoryOpen(false); }} onOpen={openConversation} onDeleted={deleteConversation}
            onClose={() => { setSidebarExpanded(false); setMobileHistoryOpen(false); }} />
        </aside>
      </>}
      <button
        ref={launcherRef}
        className="assistant-launcher"
        hidden={visible || !availability.ready}
        type="button"
        aria-label="打开 AI 助手"
        aria-expanded={visible}
        aria-controls="assistant-panel"
        onClick={() => {
          open();
          requestAnimationFrame(() => input.current?.focus());
        }}
      >
        <MessageCircle size={22} aria-hidden="true" />
        <span>AI 助手</span>
      </button>
      <dialog
        ref={panelRef}
        id="assistant-panel"
        className="assistant-panel"
        hidden={!visible}
        inert={home && mobileHistoryOpen}
        data-empty={availability.ready && !initializing && !started}
        role={modal ? "dialog" : home ? "region" : "complementary"}
        aria-modal={modal ? true : undefined}
        aria-label={home && (availability.ready || initializing) ? "节奏助手" : undefined}
        aria-labelledby={
          availability.ready || initializing ? (home ? undefined : "assistant-title") : "assistant-unavailable-title"
        }
        onCancel={(event) => {
          event.preventDefault();
          if (historyOpen) closeHistory(); else close();
        }}
        onKeyDown={(event) => {
          if (historyOpen && event.key === "Escape") {
            event.preventDefault(); event.stopPropagation(); closeHistory();
          } else if (!home && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        {home && !availability.ready && <title>首页 · 节奏训练</title>}
        {!availability.ready && !initializing ? (
          <section
            className="assistant-unavailable"
            role={availability.loading ? "status" : "alert"}
          >
            <div className="assistant-unavailable-content">
              {!availability.loading && (
                <CircleAlert size={32} aria-hidden="true" />
              )}
              <h1 id="assistant-unavailable-title">{availability.title}</h1>
              <p>{availability.message}</p>
            </div>
          </section>
        ) : (
          <>
            <header className="assistant-heading">
              {home && <button ref={sessionToggle} type="button" aria-expanded={mobileHistoryOpen} aria-controls="assistant-history" className="assistant-session-toggle" aria-label="展开会话列表" onClick={() => { setSidebarExpanded(true); setMobileHistoryOpen(window.matchMedia("(max-width: 1000px)").matches); }}><PanelLeftOpen size={20} aria-hidden="true" /></button>}
              {!home && <h2 id="assistant-title">节奏助手</h2>}
              <div className="assistant-actions" hidden={home}>
                <div className="assistant-history-anchor" ref={historyAnchor}>
                <button ref={historyButton} type="button" className="assistant-new" aria-label="历史对话" aria-haspopup="dialog" aria-controls="assistant-history" aria-expanded={historyOpen}
                  disabled={initializing || state.restoring} onClick={() => { playbackGroup.stop(); setHistoryOpen(value => !value); }}>
                  <History size={16} aria-hidden="true" />历史对话
                </button>
            {!home && historyOpen && <ConversationHistory anchor={historyButton} currentId={state.session?.id}
              onClose={closeHistory}
              onDeleted={deleteConversation} onOpen={openConversation} />}
                </div>
                <button
                  type="button"
                  className="assistant-new"
                  aria-label="新对话"
                  disabled={initializing}
                  onClick={newConversation}
                >
                  <Plus size={16} aria-hidden="true" />
                  新对话
                </button>
                {!home && (
                  <button
                    type="button"
                    aria-label="收起助手"
                    title="收起助手"
                    onClick={close}
                  >
                    <X size={19} aria-hidden="true" />
                  </button>
                )}
              </div>
            </header>
            {initializing ? <div className="assistant-initializing" role="status" aria-label="正在加载对话"><div className="assistant-loading-placeholder" aria-hidden="true"><span /><span /><span /></div></div> : <>
            <div
              ref={thread}
              className="assistant-messages"
              role="log"
              aria-label="对话记录"
              aria-live="polite"
              onScroll={() => {
                const el = thread.current;
                if (el) {
                  scrollPosition.current = el.scrollTop;
                  follow.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                }
              }}
            >
              {home && <HomePage started={started} />}
              {!home && !started ? (
                <div className="assistant-empty">
                  <MessageCircle size={30} aria-hidden="true" />
                  <h3>从一个节奏问题开始</h3>
                </div>
              ) : null}
              {messages.map(message => <div className="assistant-turn" key={`${state.session?.id ?? "new"}:${message.id}`}>
                {message.parts.map((part, index) => {
                  if (isToolUIPart(part)) {
                    if (getToolName(part) !== "propose_rhythm_exercise") return null;
                    if (part.state === "output-available") {
                      const output = part.output as { generated_exercise?: unknown };
                      return <ExerciseProposalResult key={part.toolCallId}
                        savedState={state.session?.card_states?.[(output?.generated_exercise as GeneratedExercise)?.id]} onStateChange={saveCard}
                        value={output?.generated_exercise} playbackGroup={playbackGroup} onPracticeStart={setPractice} />;
                    }
                    if (part.state === "input-streaming" || part.state === "input-available")
                      return <p key={part.toolCallId} className="assistant-notice" role="status">正在生成练习…</p>;
                    return null;
                  }
                  if (part.type !== "text" || !part.text.trim()) return null;
                  return <article className={`assistant-message ${message.role}${part.state === "streaming" ? " assistant-pending" : ""}`} key={index}
                    aria-label={message.role === "user" ? "你的消息" : "助手回答"}>
                    {message.role === "assistant" ? <AssistantMarkdown text={part.text} />
                      : <p className="assistant-message-text">{part.text}</p>}
                    {message.metadata?.created_at && index === message.parts.findLastIndex(value => value.type === "text") && <div className="assistant-message-meta">
                      <time dateTime={message.metadata.created_at}>
                        {new Date(message.metadata.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </div>}
                  </article>;
                })}
              </div>)}
              {waitingForContent && <p className="assistant-notice" role="status">正在思考…</p>}

            </div>
            <form
              className="assistant-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {(activityLabel || practiceLabel) && <p className="assistant-notice">{activityLabel || practiceLabel}</p>}
              {state.restoring && <p className="assistant-notice" role="status">正在恢复对话…</p>}
              {state.error ? (
                <p className="assistant-error" role="alert">
                  {state.error}
                </p>
              ) : null}
              {state.notice ? (
                <p className="assistant-notice" role="status">
                  {state.notice}
                </p>
              ) : null}
              {state.needsSync && !state.expired ? (
                <button
                  type="button"
                  disabled={state.busy}
                  onClick={() => void conversation.sync()}
                >
                  <RefreshCw size={16} />
                  同步状态
                </button>
              ) : null}
              {state.expired && !state.session && <button type="button" disabled={state.busy} onClick={() => void conversation.restore()}>重试恢复</button>}
              {state.expired ? (
                <button type="button" onClick={newConversation}>
                  开始新对话
                </button>
              ) : null}
              <div className="assistant-input-box">
                <PracticeTemplates
                  onSelect={suggest}
                  disabled={!availability.ready}
                />
                <textarea
                  ref={input}
                  id="assistant-input"
                  aria-label="向助手提问"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={4000}
                  rows={1}
                  disabled={!availability.ready}
                  placeholder={
                    state.busy ? "可以继续输入，回答结束后发送…" : home && !started
                      ? "描述你想练的内容，或问一个问题…"
                      : "继续提问或调整练习…"
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !state.busy &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <ModelSelector selection={state.session ? state.session.model_selection ?? null : undefined}
                  disabled={initializing || state.selectingModel || state.restoring || (state.busy && !state.session) || state.needsSync || state.expired}
                  onSelect={selection => conversation.selectModel(selection)} onAvailable={modelAvailabilityChanged} />
                <div className="assistant-input-actions">
                  {status === "submitted" || status === "streaming" ? (
                    <button
                      type="button"
                      aria-label="停止生成"
                      title="停止生成"
                      onClick={() => conversation.stop()}
                    >
                      <Square size={15} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      aria-label="发送"
                      title="发送"
                      disabled={blocked || !draft.trim()}
                    >
                      <ArrowUp size={19} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </form>
            </>}
          </>
        )}
      </dialog>
      {practice && (
        <GeneratedPracticeOverlay
          key={practice.id}
          generated={practice}
          onClose={() => setPractice(null)}
        />
      )}
    </div>
  );
}
