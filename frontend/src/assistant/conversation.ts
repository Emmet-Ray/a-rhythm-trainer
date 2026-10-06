import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AssistantApiError, assistantFetch, createSession, getSession, type AssistantMessage, type ChatSession, saveCardState, type CardState } from "../api/assistant";
import type { PageContext } from "./assistantContext";

type State = { initialized: boolean; session: ChatSession | null;
  restoring: boolean; busy: boolean; needsSync: boolean; expired: boolean; error: string; notice: string };
const initial = (): State => ({ initialized: true, session: null, restoring: false, busy: false,
  needsSync: false, expired: false, error: "", notice: "" });
type Operation = { stream: AbortController; lifetime: AbortController };

/** SDK 管理消息与流；这里仅协调服务端会话、运行互斥及中断后的核对。 */
export class AssistantConversation {
  private state = initial();
  private storageKey: string | null;
  private cardWrites = new Map<string, Promise<void>>();
  constructor(identity?: string) {
    this.storageKey = identity ? `rhythm:assistant:v1:${identity}` : null;
    this.state.initialized = !identity;
  }
  private remember(id: string | null) {
    if (!this.storageKey) return;
    try { if (id) localStorage.setItem(this.storageKey, id); else localStorage.removeItem(this.storageKey); } catch { /* 后端历史仍可手动打开。 */ }
  }
  async restore() {
    if (this.operation || this.state.session) return;
    let id: string | null = null;
    try { if (this.storageKey) id = localStorage.getItem(this.storageKey); } catch { /* 浏览器存储不可用。 */ }
    if (id) await this.open(id);
    else this.update({ initialized: true });
  }
  async open(id: string): Promise<boolean> {
    if (this.state.restoring) return false;
    const interrupted = !!this.operation || this.state.needsSync;
    if (this.operation) {
      // 切换只停止旧请求；保留其可见内容，目标读取失败时仍可同步原会话。
      // 换一个 Chat 实例隔离旧流的迟到片段，避免写入目标对话。
      const messages = this.chat.messages;
      this.operation.lifetime.abort();
      this.operation.stream.abort();
      void this.chat.stop();
      this.chat = this.createChat();
      this.chat.messages = messages;
    }
    const op = { stream: new AbortController(), lifetime: new AbortController() };
    this.operation = op;
    this.update({ busy: true, restoring: true, error: "", notice: "" });
    try {
      const session = await getSession(id, op.lifetime.signal);
      if (!this.current(op)) return false;
      this.chat = this.createChat();
      this.chat.messages = session.messages;
      this.remember(id);
      this.update({ session, expired: false, needsSync: session.is_running,
        notice: session.is_running ? "这段对话仍在生成，正在同步已保存的内容。"
          : session.last_run_status === "cancelled" ? "上次回答已中断，已恢复保存的内容。"
          : session.last_run_status === "failed" ? "上次生成未完成，已恢复保存的内容。" : "" });
      return true;
    } catch (error) {
      if (this.current(op)) {
        // 暂时性网络失败不能遗忘会话，防止下一次刷新悄悄开始新对话。
        const missing = error instanceof AssistantApiError && error.status === 404;
        if (missing) this.remember(null);
        this.update({ error: error instanceof Error ? error.message : "恢复对话失败。", expired: !this.state.session, needsSync: interrupted && !!this.state.session });
      }
      return false;
    } finally {
      if (this.current(op)) { this.operation = null; this.update({ initialized: true, busy: false, restoring: false }); }
    }
  }
  saveCard(exerciseId: string, value: CardState) {
    const sessionId = this.state.session?.id;
    if (!sessionId) return;
    const key = `${sessionId}:${exerciseId}`;
    const task = (this.cardWrites.get(key) ?? Promise.resolve()).then(async () => {
      try {
        const saved = await saveCardState(sessionId, exerciseId, value, new AbortController().signal);
        if (this.state.session?.id === sessionId) this.update({ session: { ...this.state.session,
          card_states: { ...this.state.session.card_states, [exerciseId]: saved } } });
      } catch {
        if (this.state.session?.id === sessionId) this.update({ error: "练习卡片状态未能保存，请重新操作后再刷新。" });
      }
    }).finally(() => { if (this.cardWrites.get(key) === task) this.cardWrites.delete(key); });
    this.cardWrites.set(key, task);
  }
  private operation: Operation | null = null;
  private listeners = new Set<() => void>();
  chat = this.createChat();
  private createChat() {
    return new Chat<AssistantMessage>({
      transport: new DefaultChatTransport({
        prepareSendMessagesRequest: ({ messages, body }) => {
          const message = messages.at(-1)!;
          return { api: `/api/assistant/sessions/${encodeURIComponent(this.state.session!.id)}/messages`,
            body: { text: message.parts.filter(part => part.type === "text").map(part => part.text).join(""),
              message_id: message.id, page_context: body?.page_context ?? null } };
        },
        fetch: (url, options) => assistantFetch(String(url), options ?? {},
          AbortSignal.any([options?.signal ?? new AbortController().signal,
            this.operation!.stream.signal, this.operation!.lifetime.signal]), 135_000),
      }),
    });
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private current(op: Operation) { return this.operation === op && !op.lifetime.signal.aborted; }
  private async reconcile(op: Operation) {
    const id = this.state.session?.id;
    if (!id) return;
    // SDK 流结束可能略早于服务器释放占用；短暂读取重试不重发模型请求。
    for (let attempt = 0; attempt < 8; attempt++) {
      const session = await getSession(id, op.lifetime.signal);
      if (!this.current(op)) return;
      this.update({ session, needsSync: session.is_running });
      if (!session.is_running) this.chat.messages = session.messages;
      if (!session.is_running) {
        if (op.stream.signal.aborted) this.update({ notice: session.last_run_status === "completed"
          ? "回答已完成，已从后端恢复完整记录。" : "已停止，下面的记录已与后端同步。" });
        else if (session.last_run_status === "failed" && !this.state.error)
          this.update({ error: "本轮生成未完成，已保留生成的练习和完整记录。" });
        else if (session.last_run_status === "cancelled")
          this.update({ notice: "本轮回答已中断，已与后端同步记录。" });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 150));
      op.lifetime.signal.throwIfAborted();
    }
    this.update({ notice: "后端仍在收尾，请稍后同步状态。" });
  }
  async send(text: string, context: PageContext | null): Promise<boolean> {
    if (this.operation || this.state.needsSync || this.state.expired || !text.trim()) return false;
    const op = { stream: new AbortController(), lifetime: new AbortController() };
    this.operation = op;
    const pageContext = structuredClone(context);
    this.update({ busy: true, error: "", notice: "" });
    try {
      if (!this.state.session) {
        const session = await createSession(op.lifetime.signal);
        if (!this.current(op)) return false;
        this.remember(session.id);
        this.update({ session });
      }
      op.stream.signal.throwIfAborted();
      const chat = this.chat;
      chat.clearError();
      await chat.sendMessage({ text, metadata: { created_at: new Date().toISOString(), page_context: pageContext } },
        { body: { page_context: pageContext } });
      if (chat.error) throw chat.error;
    } catch (error) {
      if (this.current(op)) {
        if (op.stream.signal.aborted) this.update({ notice: "已请求停止，正在核对已保存的记录。" });
        else this.update({ error: error instanceof Error ? error.message : "助手请求失败。" });
        if (error instanceof AssistantApiError && error.status === 404) this.update({ expired: true });
      }
    } finally {
      if (this.current(op)) {
        try { await this.reconcile(op); }
        catch (error) {
          if (this.current(op)) this.update({ needsSync: true,
            expired: error instanceof AssistantApiError && error.status === 404,
            error: "无法确认后端会话状态，请同步状态或开始新对话，不要重复发送原问题。" });
        }
        if (this.current(op)) {
          this.operation = null;
          this.update({ busy: false });
        }
      }
    }
    return true;
  }
  stop() { this.operation?.stream.abort(); void this.chat.stop(); }
  async sync() {
    if (this.operation || !this.state.session || this.state.expired) return;
    const op = { stream: new AbortController(), lifetime: new AbortController() };
    this.operation = op;
    this.update({ busy: true, error: "", notice: "" });
    try { await this.reconcile(op); }
    catch (error) {
      if (this.current(op)) this.update({ needsSync: true,
        expired: error instanceof AssistantApiError && error.status === 404,
        error: error instanceof Error ? error.message : "同步失败。" });
    } finally {
      if (this.current(op)) { this.operation = null; this.update({ busy: false }); }
    }
  }
  reset(forget = true) {
    if (forget) this.remember(null);
    this.operation?.lifetime.abort(); this.operation?.stream.abort(); this.operation = null;
    void this.chat.stop();
    this.chat = this.createChat();
    this.state = initial(); this.listeners.forEach(listener => listener());
  }
  dispose() { this.reset(false); }
}
