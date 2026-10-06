import { AssistantApiError, createSession, getSession, sendMessage, type ChatSession } from "../api/assistant";
import type { PageContext } from "./assistantContext";

type PendingReply = { question: string; text: string; streamedEntries?: boolean; completed?: boolean };
type State = { session: ChatSession | null; pending: PendingReply | null;
  busy: boolean; needsSync: boolean; expired: boolean; error: string; notice: string };
const initial = (): State => ({ session: null, pending: null, busy: false,
  needsSync: false, expired: false, error: "", notice: "" });
type Operation = { stream: AbortController; lifetime: AbortController };

/** 面板只缓存服务端记录用于显示；临时回答单独管理，不向后端回传历史。 */
export class AssistantConversation {
  private state = initial();
  private operation: Operation | null = null;
  private listeners = new Set<() => void>();
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
    // run_completed 可能略早于服务器释放占用；短暂读取重试不重发模型请求。
    for (let attempt = 0; attempt < 8; attempt++) {
      const session = await getSession(id, op.lifetime.signal);
      if (!this.current(op)) return;
      this.update({ session, pending: null, needsSync: session.is_running });
      if (!session.is_running) {
        if (op.stream.signal.aborted) this.update({ notice: session.last_run_status === "completed"
          ? "回答已完成，已从后端恢复完整记录。" : "已停止，下面的记录已与后端同步。" });
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
    this.update({ busy: true, error: "", notice: "", pending: { question: text, text: "" } });
    try {
      if (!this.state.session) {
        const session = await createSession(op.lifetime.signal);
        if (!this.current(op)) return false;
        this.update({ session });
      }
      op.stream.signal.throwIfAborted();
      await sendMessage(this.state.session!.id, text, pageContext, event => {
        if (!this.current(op) || op.stream.signal.aborted || !this.state.pending) return;
        if (event.type === "entry_added") {
          const session = this.state.session!;
          if (event.index !== session.entries.length) throw new Error("助手记录顺序异常，请同步状态。");
          this.update({ session: { ...session, entries: [...session.entries, event.entry] },
            pending: { ...this.state.pending, streamedEntries: true,
              ...(event.entry.type === "user" ? { question: "" } : {}),
              ...(event.entry.type === "assistant" ? { text: "" } : {}) } });
        }
        if (event.type === "text_delta") this.update({ pending: { ...this.state.pending, text: this.state.pending.text + event.text } });
        if (event.type === "message_completed") this.update({ pending: { ...this.state.pending,
          completed: Boolean(this.state.pending.streamedEntries), text: this.state.pending.streamedEntries ? "" : event.text } });
      }, AbortSignal.any([op.stream.signal, op.lifetime.signal]));
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
          this.update({ busy: false, ...(!this.state.session ? { pending: null } : {}) });
        }
      }
    }
    return true;
  }
  stop() { this.operation?.stream.abort(); }
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
  reset() {
    this.operation?.lifetime.abort(); this.operation?.stream.abort(); this.operation = null;
    this.state = initial(); this.listeners.forEach(listener => listener());
  }
  dispose() { this.reset(); }
}
