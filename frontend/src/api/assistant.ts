import type { PageContext } from "../assistant/assistantContext";

export type SessionEntry = { type: "user"; text: string; created_at: string; page_context: PageContext | null }
  | { type: "assistant"; text: string; created_at: string; tool_calls?: { id: string; name: string; arguments: string }[] }
  | { type: "tool_result"; tool_call_id: string; tool_name: string; content: string;
      details: Record<string, unknown>; is_error: boolean; created_at: string };
export type ChatSession = {
  id: string; entries: SessionEntry[]; is_running: boolean;
  last_run_status: null | "running" | "completed" | "failed" | "cancelled";
};
export type ChatEvent = { type: "text_delta" | "message_completed"; text: string } | { type: "run_completed" };

export class AssistantApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function checkedFetch(path: string, options: RequestInit, signal: AbortSignal, timeout = 15_000) {
  const response = await fetch(`/api/assistant${path}`, {
    ...options, credentials: "same-origin", cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      403: "助手目前仅供本机使用，请检查访问地址。", 404: "会话已失效，请开始新对话。",
      409: "这个会话仍在运行，请稍后同步状态。", 422: "问题或页面资料格式不正确，或内容过大。",
      503: "助手尚未配置或服务不可用，请检查后端配置。",
    };
    throw new AssistantApiError(response.status, messages[response.status] ?? "助手请求失败，请稍后再试。");
  }
  return response;
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object"; }
function isEntry(value: unknown): value is SessionEntry {
  if (!object(value) || typeof value.created_at !== "string"
    || !Number.isFinite(Date.parse(value.created_at))) return false;
  if (value.type === "tool_result") return typeof value.tool_call_id === "string"
    && typeof value.tool_name === "string" && typeof value.content === "string"
    && typeof value.is_error === "boolean" && object(value.details) && !Array.isArray(value.details);
  if (typeof value.text !== "string") return false;
  if (value.type === "assistant") return value.tool_calls === undefined || (Array.isArray(value.tool_calls)
    && value.tool_calls.every(call => object(call) && typeof call.id === "string"
      && typeof call.name === "string" && typeof call.arguments === "string"));
  return value.type === "user" && (value.page_context === null
    || (object(value.page_context) && typeof value.page_context.page === "string"
      && typeof value.page_context.description === "string" && object(value.page_context.state)));
}
async function parseSession(response: Response): Promise<ChatSession> {
  const value: unknown = await response.json();
  if (!object(value) || typeof value.id !== "string" || !value.id || !Array.isArray(value.entries)
    || !value.entries.every(isEntry) || typeof value.is_running !== "boolean"
    || ![null, "running", "completed", "failed", "cancelled"].includes(value.last_run_status as string | null)) {
    throw new Error("助手会话格式异常，请同步状态后再试。");
  }
  return value as ChatSession;
}
export async function createSession(signal: AbortSignal): Promise<ChatSession> {
  return parseSession(await checkedFetch("/sessions", { method: "POST" }, signal));
}
export async function getSession(id: string, signal: AbortSignal): Promise<ChatSession> {
  const session = await parseSession(await checkedFetch(`/sessions/${encodeURIComponent(id)}`, {}, signal));
  if (session.id !== id) throw new Error("助手返回了不匹配的会话。");
  return session;
}

/** 只发送本次输入，历史与快照记录归后端所有。不自动重发产生费用的请求。 */
export async function sendMessage(id: string, text: string, pageContext: PageContext | null,
  onEvent: (event: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const response = await checkedFetch(`/sessions/${encodeURIComponent(id)}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, page_context: pageContext }),
  }, signal, 135_000);
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("助手返回的响应格式不正确。");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", data: string[] = [], completed = false, finished = false;
  const line = (value: string) => {
    if (value.startsWith("data:")) data.push(value.slice(5).trimStart());
    else if (value === "" && data.length) {
      const event: unknown = JSON.parse(data.join("\n"));
      data = [];
      if (!object(event)) throw new Error("助手事件格式异常。");
      if (event.type === "run_failed") throw new Error(
        typeof event.message === "string" ? event.message : "助手运行失败。");
      if (event.type === "text_delta" && !completed && typeof event.text === "string") {
        onEvent({ type: "text_delta", text: event.text });
      } else if (event.type === "message_completed" && !completed && typeof event.text === "string" && event.text.trim()) {
        completed = true;
        onEvent({ type: "message_completed", text: event.text });
      } else if (event.type === "run_completed" && completed) {
        finished = true;
        onEvent({ type: "run_completed" });
      } else throw new Error("助手事件顺序或内容异常。");
    }
  };
  try {
    while (!finished) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) throw new Error("回答连接中断，正在核对后端会话。不要重复发送原问题。");
      buffer += decoder.decode(next.value, { stream: true });
      if (buffer.length > 262144) throw new Error("助手响应片段过大。");
      let index;
      while ((index = buffer.indexOf("\n")) !== -1) {
        line(buffer.slice(0, index).replace(/\r$/, ""));
        buffer = buffer.slice(index + 1);
        if (finished) break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
