import { useChat } from "@ai-sdk/react";
import { isToolUIPart, getToolName, type FileUIPart } from "ai";
import { isMessageImage } from "../api/assistant";
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
  Copy,
  Check,
  CircleAlert,
  History,
  PanelLeftOpen,
  MessageCircle,
  Plus,
  X,
  RefreshCw,
} from "lucide-react";
import { ExerciseProposalResult } from "./tool-results/ExerciseProposalResult";
import { GeneratedPracticeOverlay } from "../practice/GeneratedPracticeOverlay";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { Composer, type ComposerHandle } from "./Composer";
import { PlaybackGroup } from "../practice/PlaybackGroup";
import { AssistantConversation } from "./conversation";
import { useAssistantContext } from "./assistantContext";
import { useAssistantPresentation } from "./useAssistantPresentation";
import { useAssistantAvailability } from "./useAssistantAvailability";
import { ConversationHistory } from "./ConversationHistory";
import type { ModelSelection } from "../api/modelConnections";
import type { CardState } from "../api/assistant";
import HomePage from "../pages/HomePage";

export function AssistantPanel({ home = false }: { home?: boolean }) {
  const activity = useContext(PracticeActivityContext);
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
  const { readCurrentPageContext } = useAssistantContext();
  const [practice, setPractice] = useState<GeneratedExercise | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const imageDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (expandedImage) imageDialog.current?.showModal();
    else imageDialog.current?.close();
  }, [expandedImage]);
  const historyHasImages = messages.some(message => message.parts.some(isMessageImage));

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
    const element = thread.current;
    if (visible && element)
      element.scrollTop = follow.current
        ? element.scrollHeight
        : scrollPosition.current;
  }, [home, visible]);

  async function send({ text, images }: { text: string; images: FileUIPart[] }, selection: ModelSelection): Promise<"accepted" | "rejected" | "unknown"> {
    const before = conversation.getSnapshot();
    const version = generation.current;
    const previousEntryCount = before.session?.messages.length ?? 0;
    follow.current = true;
    activity?.start();
    const page = readCurrentPageContext();
    const batch = activity?.prepare();
    const focus = activity?.getFocus();
    const context = batch || focus ? { ...(page ?? { page: "unknown", description: "当前页面未提供上下文", state: {} }),
      state: { ...page?.state, practice_activity: batch ?? null, practice_focus: focus ?? null } } : page;
    await conversation.send(text, context, selection, images);
    if (version !== generation.current) return "unknown";
    const after = conversation.getSnapshot();
    // 仅在已确认本次输入没有写入会话时恢复。不能用文字相等判断：用户可能连续发送相同内容。
    const accepted = after.session?.messages
      .slice(previousEntryCount)
      .some((entry) => entry.role === "user");
    return after.needsSync ? "unknown" : accepted ? "accepted" : "rejected";
  }
  function newConversation() {
    generation.current++;
    playbackGroup.stop();
    conversation.reset();
    setHistoryOpen(false);
    setPractice(null);
    activity?.reset();
    composer.current?.clear();
    follow.current = true;
    composer.current?.focus();
  }
  function close() {
    playbackGroup.stop();
    closePanel();
  }
  const deleteConversation = (id: string) => {
    if (state.session?.id !== id) return;
    generation.current++; conversation.reset(); activity?.reset(); composer.current?.clear(); setPractice(null);
  };
  const openConversation = async (id: string) => {
    if (id === state.session?.id) {
      closeHistory(); setMobileHistoryOpen(false); return true;
    }
    if (composer.current?.hasDraft() && !window.confirm("打开历史对话将清空当前输入草稿，是否继续？")) return false;
    generation.current++;
    const opened = await conversation.open(id);
    if (opened) {
      activity?.reset(); activity?.start();
      activity?.restoreFocus(conversation.getSnapshot().session?.messages.findLast(message => message.role === "user")?.metadata?.page_context?.state.practice_focus);
      composer.current?.clear(); setPractice(null); follow.current = true;
      setHistoryOpen(false); setMobileHistoryOpen(false);
      requestAnimationFrame(() => composer.current?.focus());
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
          requestAnimationFrame(() => composer.current?.focus());
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
              {messages.map(message => {
                const attachments = message.parts.filter(isMessageImage);
                const textParts = message.parts.filter(part => part.type === "text").filter(part => part.text.trim());
                const text = textParts.map(part => part.text).join("\n\n");
                return <div className="assistant-turn" key={`${state.session?.id ?? "new"}:${message.id}`}>
                {message.role === "user" ? <article className="assistant-message user" aria-label="你的消息">
                  {attachments.length > 0 && <div className="assistant-message-images">
                    {attachments.map((part, index) => <button type="button" className="assistant-message-image" key={index} aria-label="查看图片" onClick={() => setExpandedImage(part.url)}><img src={part.url} alt="消息图片" loading="lazy" /></button>)}
                  </div>}
                  {textParts.map((part, index) => <p key={index} className="assistant-message-text">{part.text}</p>)}
                  <MessageActions text={text} createdAt={message.metadata?.created_at} />
                </article> : <>{message.parts.map((part, index) => {
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
                  if (isMessageImage(part)) return <button type="button" className="assistant-message-image" key={index} aria-label="查看图片" onClick={() => setExpandedImage(part.url)}><img src={part.url} alt="消息图片" loading="lazy" /></button>;
                  if (part.type !== "text" || !part.text.trim()) return null;
                  return <article className={`assistant-message ${message.role}${part.state === "streaming" ? " assistant-pending" : ""}`} key={index}
                    aria-label="助手回答">
                    <AssistantMarkdown text={part.text} />
                  </article>;
                })}
                  <MessageActions text={text} createdAt={message.metadata?.created_at}
                    pending={message === lastMessage && (status === "submitted" || status === "streaming")} />
                </>}
              </div>;
              })}
              {waitingForContent && <p className="assistant-notice" role="status">正在思考…</p>}

            </div>

            </>}
          </>
        )}
        {/* 配置暂时不可用时只隐藏输入框，保留未发送草稿。 */}
            <Composer ref={composer} conversation={conversation} ready={availability.ready} visible={visible && availability.ready && !initializing}
              welcome={home && !started} streaming={status === "submitted" || status === "streaming"}
              historyHasImages={historyHasImages} onPreview={setExpandedImage} onSend={send}>
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
            </Composer>
      </dialog>
      <dialog ref={imageDialog} className="design-system assistant-image-viewer" aria-label="图片预览" onClose={() => setExpandedImage(null)} onClick={event => { if (event.target === event.currentTarget) setExpandedImage(null); }}>
        <button type="button" aria-label="关闭图片预览" onClick={() => setExpandedImage(null)}><X size={20} /></button>
        {expandedImage && <img src={expandedImage} alt="图片预览" />}
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


/** 每条消息只提供一个复制入口；复制原始文字，不包含时间、附件或工具数据。 */
function MessageActions({ text, createdAt, pending = false }: { text: string; createdAt?: string; pending?: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  if (!createdAt && (!text.trim() || pending)) return null;
  const label = copyState === "copied" ? "已复制" : "复制消息";
  return <div className="assistant-message-meta">
    {text.trim() && !pending && <button type="button" className="assistant-message-copy" aria-label={label} title={label} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopyState("copied"); }
      catch { setCopyState("failed"); }
    }}>{copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}</button>}
    {createdAt && <time dateTime={createdAt}>{new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}
    {copyState === "failed" && <span role="status">复制失败，请重试</span>}
  </div>;
}
