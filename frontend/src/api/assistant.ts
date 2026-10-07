import { validateUIMessages, type UIMessage } from "ai";
import type { ModelSelection } from "./modelConnections";
import type { PageContext } from "../assistant/assistantContext";

export type AssistantMessage = UIMessage<{ created_at?: string; page_context?: PageContext | null }>;
export type CardState = { bpm: number; answer_viewed: boolean };
export type SessionSummary = { id: string; title: string; updated_at: string; is_running: boolean; unreadable: boolean };
export type ChatSession = {
  model_selection?: ModelSelection | null;
  title?: string; created_at?: string; updated_at?: string; card_states?: Record<string, CardState>;
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
      403: "助手请求来源未获允许，请检查后端 ALLOWED_ORIGINS 配置。", 404: "会话不存在或不属于当前身份，请打开历史对话或开始新对话。",
      409: "这个会话仍在运行，请稍后同步状态。", 413: "消息过大，请减少图片后重试", 422: "消息或图片格式不正确，或内容过大",
      503: "助手服务暂不可用，请检查设置中的模型服务或稍后重试",
    };
    throw new AssistantApiError(response.status, messages[response.status] ?? "助手请求失败，请稍后再试。");
  }
  return response;
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object"; }
function isCardState(value: unknown): value is CardState {
  return object(value) && Number.isInteger(value.bpm) && Number(value.bpm) >= 40 && Number(value.bpm) <= 240
    && typeof value.answer_viewed === "boolean";
}
async function parseSession(response: Response): Promise<ChatSession> {
  const value: unknown = await response.json();
  if (!object(value) || typeof value.id !== "string" || !value.id || !Array.isArray(value.messages)
    || typeof value.is_running !== "boolean"
    || ![null, "running", "completed", "failed", "cancelled"].includes(value.last_run_status as string | null)) {
    throw new Error("助手会话格式异常，请同步状态后再试。");
  }
  if (value.model_selection != null && (!object(value.model_selection)
    || !["deepseek", "chatgpt"].includes(value.model_selection.provider as string)
    || typeof value.model_selection.model !== "string" || !value.model_selection.model))
    throw new Error("对话模型配置格式异常，请重试");
  if (value.selection_notice !== undefined && typeof value.selection_notice !== "string")
    throw new Error("模型选择结果格式异常，请同步状态后再试");
  if (value.card_states !== undefined && (!object(value.card_states) || !Object.values(value.card_states).every(isCardState)))
    throw new Error("练习卡片状态格式异常，请重试。");
  const messages = value.messages.length
    ? await validateUIMessages<AssistantMessage>({ messages: value.messages }) : [];
  return { ...value, messages } as ChatSession;
}
export async function createSession(signal: AbortSignal, selection?: ModelSelection): Promise<ChatSession> {
  return parseSession(await assistantFetch("/api/assistant/sessions", { method: "POST",
    ...(selection ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(selection) } : {}) }, signal));
}
export async function getSession(id: string, signal: AbortSignal): Promise<ChatSession> {
  const session = await parseSession(await assistantFetch(`/api/assistant/sessions/${encodeURIComponent(id)}`, {}, signal));
  if (session.id !== id) throw new Error("助手返回了不匹配的会话。");
  return session;
}

export async function selectSessionModel(id: string, selection: ModelSelection, signal: AbortSignal): Promise<ChatSession & { selection_notice?: string }> {
  const response = await fetch(`/api/assistant/sessions/${encodeURIComponent(id)}/model`, {
    method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection), signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  if (!response.ok) {
    const value = await response.json();
    throw new AssistantApiError(response.status, typeof value.detail === "string" ? value.detail : "模型选择未能保存");
  }
  return parseSession(response);
}

/** 只读取配置可用性；不验证凭证、不产生模型调用。 */
export async function getAssistantStatus(signal: AbortSignal): Promise<{ status: "ready" | "unconfigured" | "invalid"; message: string }> {
  const value: unknown = await (await assistantFetch("/api/assistant/status", {}, signal)).json();
  if (!object(value) || !["ready", "unconfigured", "invalid"].includes(value.status as string)
      || typeof value.message !== "string") throw new Error("助手配置状态格式异常，请重试。");
  return value as { status: "ready" | "unconfigured" | "invalid"; message: string };
}

export async function listSessions(signal: AbortSignal, offset = 0): Promise<{ sessions: SessionSummary[]; total: number }> {
  const value = await (await assistantFetch(`/api/assistant/sessions?offset=${offset}`, {}, signal)).json();
  if (!object(value) || !Array.isArray(value.sessions) || typeof value.total !== "number"
    || !value.sessions.every(item => object(item) && typeof item.id === "string" && typeof item.title === "string"
      && typeof item.updated_at === "string" && typeof item.is_running === "boolean" && typeof item.unreadable === "boolean"))
    throw new Error("历史对话格式异常，请重试。");
  return value as { sessions: SessionSummary[]; total: number };
}
export async function deleteSession(id: string, signal: AbortSignal) {
  await assistantFetch(`/api/assistant/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }, signal);
}
export async function saveCardState(sessionId: string, exerciseId: string, state: CardState, signal: AbortSignal): Promise<CardState> {
  const value: unknown = await (await assistantFetch(`/api/assistant/sessions/${encodeURIComponent(sessionId)}/cards/${encodeURIComponent(exerciseId)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state), keepalive: true }, signal)).json();
  if (!isCardState(value)) throw new Error("练习卡片状态格式异常，请重试。");
  return value;
}

/** 只展示受支持的内联图片，不加载消息中的外部地址。 */
export function isMessageImage(part: { type: string; url?: string }): part is import("ai").FileUIPart {
  return part.type === "file" && /^data:image\/(png|jpeg|webp);base64,/.test(part.url ?? "");
}
