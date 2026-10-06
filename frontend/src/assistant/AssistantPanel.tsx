import { AssistantMarkdown } from "./AssistantMarkdown";
import { PracticeActivityContext } from "./practiceActivity";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CircleAlert,
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
  const [conversation] = useState(() => new AssistantConversation());
  const state = useSyncExternalStore(
    conversation.subscribe,
    conversation.getSnapshot,
    conversation.getSnapshot,
  );
  useEffect(() => {
    for (const entry of state.session?.entries ?? []) {
      if (entry.type !== "user") continue;
      const batch = entry.page_context?.state.practice_activity;
      if (batch && typeof batch === "object" && !Array.isArray(batch) && typeof batch.batchId === "string") activity?.acknowledge(batch.batchId);
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
  const started = Boolean(state.session?.entries.length || state.pending);
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
  }, [visible, state]);

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
        2 * parseFloat(style.columnGap);
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
  }, [draft, visible, home, availability.ready]);

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
      !availability.ready ||
      !draft.trim() ||
      before.busy ||
      before.needsSync ||
      before.expired
    )
      return;
    const originalDraft = draft;
    const text = draft.trim(),
      version = generation.current;
    const previousEntryCount = before.session?.entries.length ?? 0;
    follow.current = true;
    setDraft("");
    activity?.start();
    const page = readCurrentPageContext();
    const batch = activity?.prepare();
    const focus = activity?.getFocus();
    const context = batch || focus ? { ...(page ?? { page: "unknown", description: "当前页面未提供上下文", state: {} }),
      state: { ...page?.state, practice_activity: batch ?? null, practice_focus: focus ?? null } } : page;
    await conversation.send(text, context);
    if (version !== generation.current) return;
    const after = conversation.getSnapshot();
    // 仅在已确认本次输入没有写入会话时恢复。不能用文字相等判断：用户可能连续发送相同内容。
    const accepted = after.session?.entries
      .slice(previousEntryCount)
      .some((entry) => entry.type === "user");
    if (!after.needsSync && !accepted)
      setDraft((current) => current || originalDraft);
  }
  function newConversation() {
    if (
      (state.session || draft) &&
      !window.confirm("开始新对话？当前面板将清空，正在生成的回答会停止。")
    )
      return;
    generation.current++;
    playbackGroup.stop();
    conversation.reset();
    activity?.reset();
    setDraft("");
    follow.current = true;
    input.current?.focus();
  }
  function close() {
    playbackGroup.stop();
    closePanel();
  }
  const blocked =
    !availability.ready || state.busy || state.needsSync || state.expired;

  return (
    <div className="assistant-shell" data-layout={home ? "home" : "sidebar"}>
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
        data-empty={availability.ready && !started}
        role={modal ? "dialog" : home ? "region" : "complementary"}
        aria-modal={modal ? true : undefined}
        aria-labelledby={
          availability.ready ? "assistant-title" : "assistant-unavailable-title"
        }
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          if (!home && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        {home && !availability.ready && <title>首页 · 节奏训练</title>}
        {!availability.ready ? (
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
              <h2 id="assistant-title">节奏助手</h2>
              <div className="assistant-actions">
                <button
                  type="button"
                  className="assistant-new"
                  aria-label="新对话"
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
                  <p>可以生成练习，也可以聊聊节奏。</p>
                </div>
              ) : null}
              {state.session?.entries.map((entry, index) =>
                entry.type === "tool_result" ? (
                  entry.tool_name === "propose_rhythm_exercise" &&
                  !entry.is_error ? (
                    <ExerciseProposalResult
                      key={index}
                      value={entry.details.generated_exercise}
                      playbackGroup={playbackGroup}
                      onPracticeStart={setPractice}
                    />
                  ) : null
                ) : !entry.text.trim() ? null : (
                  <article
                    className={`assistant-message ${entry.type}`}
                    key={index}
                    aria-label={entry.type === "user" ? "你的消息" : "助手回答"}
                  >
                    {entry.type === "assistant" ? <AssistantMarkdown text={entry.text} />
                      : <p className="assistant-message-text">{entry.text}</p>}
                    <div className="assistant-message-meta">
                      <time
                        dateTime={entry.created_at}
                        title={new Date(entry.created_at).toLocaleString()}
                      >
                        {new Date(entry.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  </article>
                ),
              )}
              {state.pending && !state.pending.completed ? (
                <div className="assistant-pending">
                  {state.pending.question && <article
                    className="assistant-message user"
                    aria-label="正在发送的消息"
                  >
                    <p className="assistant-message-text">
                      {state.pending.question}
                    </p>
                  </article>}
                  <article
                    className="assistant-message assistant"
                    aria-label="正在生成的回答"
                  >
                    <AssistantMarkdown text={state.pending.text || (state.busy ? "正在思考…" : "等待同步…")} />
                    {!state.busy && state.pending.text ? (
                      <small className="assistant-notice">
                        临时内容，等待同步
                      </small>
                    ) : null}
                  </article>
                </div>
              ) : null}
            </div>
            <form
              className="assistant-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {(activityLabel || practiceLabel) && <p className="assistant-notice">{activityLabel || practiceLabel}</p>}
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
                <div className="assistant-input-actions">
                  {state.busy ? (
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
