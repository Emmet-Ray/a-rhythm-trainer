import { validateUIMessages, type UIMessage } from "ai";
import type { PageContext } from "../assistant/assistantContext";

export type AssistantMessage = UIMessage<{ created_at?: string; page_context?: PageContext | null }>;
export type ChatSession = {
  id: string; messages: AssistantMessage[]; is_running: boolean;
  last_run_status: null | "running" | "completed" | "failed" | "cancelled";
};

export class AssistantApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function assistantFetch(path: string, options: RequestInit, signal: AbortSignal, timeout = 15_000) {
  const response = await fetch(path, {
    ...options, credentials: "same-origin", cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      403: "助手请求来源未获允许，请检查后端 AI_ALLOWED_ORIGINS 配置。", 404: "会话已失效，请开始新对话。",
      409: "这个会话仍在运行，请稍后同步状态。", 422: "问题或页面资料格式不正确，或内容过大。",
      503: "助手尚未配置或服务不可用，请检查后端配置。",
    };
    throw new AssistantApiError(response.status, messages[response.status] ?? "助手请求失败，请稍后再试。");
  }
  return response;
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object"; }
async function parseSession(response: Response): Promise<ChatSession> {
  const value: unknown = await response.json();
  if (!object(value) || typeof value.id !== "string" || !value.id || !Array.isArray(value.messages)
    || typeof value.is_running !== "boolean"
    || ![null, "running", "completed", "failed", "cancelled"].includes(value.last_run_status as string | null)) {
    throw new Error("助手会话格式异常，请同步状态后再试。");
  }
  const messages = value.messages.length
    ? await validateUIMessages<AssistantMessage>({ messages: value.messages }) : [];
  return { ...value, messages } as ChatSession;
}
export async function createSession(signal: AbortSignal): Promise<ChatSession> {
  return parseSession(await assistantFetch("/api/assistant/sessions", { method: "POST" }, signal));
}
export async function getSession(id: string, signal: AbortSignal): Promise<ChatSession> {
  const session = await parseSession(await assistantFetch(`/api/assistant/sessions/${encodeURIComponent(id)}`, {}, signal));
  if (session.id !== id) throw new Error("助手返回了不匹配的会话。");
  return session;
}

/** 只读取配置可用性；不验证凭证、不产生模型调用。 */
export async function getAssistantStatus(signal: AbortSignal): Promise<{ status: "ready" | "unconfigured" | "invalid"; message: string }> {
  const value: unknown = await (await assistantFetch("/api/assistant/status", {}, signal)).json();
  if (!object(value) || !["ready", "unconfigured", "invalid"].includes(value.status as string)
      || typeof value.message !== "string") throw new Error("助手配置状态格式异常，请重试。");
  return value as { status: "ready" | "unconfigured" | "invalid"; message: string };
}
