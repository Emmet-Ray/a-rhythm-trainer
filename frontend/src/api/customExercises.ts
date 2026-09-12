import type { CustomExercise, CustomMode } from "../exercises/customExercises";
import { parseRhythmExercise } from "../rhythm/RhythmModel";

export type AccountExerciseSummary = Pick<CustomExercise, "id" | "name" | "mode"> & { createdAt: string };
export type AccountExercise = AccountExerciseSummary & Pick<CustomExercise, "exercise">;
export type AccountExercisePage = { items: AccountExerciseSummary[]; limit: number; offset: number };

export class CustomExerciseApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    const messages: Record<number, string> = {
      0: "网络请求失败；如果正在保存，结果可能尚未确认，请先检查账号练习列表。",
      401: "尚未登录或登录已过期，请重新登录。",
      403: "请求来源不受允许，请检查网站配置。",
      404: "练习不存在或不属于当前账号。",
      422: "练习内容或请求参数不合法，请检查名称、模式和小节内容。",
      502: "练习服务响应格式异常；如果正在保存，请先检查账号练习列表。",
      503: "练习服务暂不可用，请稍后再试。",
    };
    super(messages[status] ?? "练习请求失败，请稍后再试。");
    this.status = status;
  }
}

/** 新建账号题目，只提交名称、模式、节奏；不提交归属，不自动重试或回退本地保存。
 * 网络中断或响应异常不代表服务器没有保存成功，调用方不应自动再次提交。
 */
export async function saveAccountExercise(input: Omit<CustomExercise, "id">): Promise<AccountExercise> {
  const value = await request("", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, mode: input.mode, exercise: input.exercise }),
  }, 201);
  return parseDetail(value);
}

/** 返回单页摘要；只有成功的空页才返回空列表，错误不伪装成空题库。 */
export async function listAccountExercises(
  mode: CustomMode, options: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<AccountExercisePage> {
  const { limit = 50, offset = 0, signal } = options;
  if ((mode !== "tapping" && mode !== "dictation") || !Number.isSafeInteger(limit)
    || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new CustomExerciseApiError(422);
  }
  const query = new URLSearchParams({ mode, limit: String(limit), offset: String(offset) });
  const value = await request(`?${query}`, { signal }, 200);
  if (!isRecord(value) || !Array.isArray(value.items) || value.limit !== limit || value.offset !== offset
    || value.items.length > limit) throw new CustomExerciseApiError(502);
  const items = value.items.map(parseSummary);
  if (items.some(item => item.mode !== mode) || new Set(items.map(item => item.id)).size !== items.length) {
    throw new CustomExerciseApiError(502);
  }
  return { items, limit, offset };
}

/** 读取完整题目；401、404、503 均抛出带状态的错误，取消请求保留 AbortError。 */
export async function getAccountExercise(id: string, signal?: AbortSignal): Promise<AccountExercise> {
  if (typeof id !== "string" || !id.trim()) throw new CustomExerciseApiError(422);
  const value = parseDetail(await request(`/${encodeURIComponent(id)}`, { signal }, 200));
  if (value.id !== id) throw new CustomExerciseApiError(502);
  return value;
}

async function request(path: string, options: RequestInit, expectedStatus: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/custom-exercises${path}`, {
      method: "GET", ...options, credentials: "same-origin", cache: "no-store",
    });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new CustomExerciseApiError(0);
  }
  if (!response.ok) throw new CustomExerciseApiError(response.status);
  if (response.status !== expectedStatus) throw new CustomExerciseApiError(502);
  try {
    return await response.json();
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new CustomExerciseApiError(502);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSummary(value: unknown): AccountExerciseSummary {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()
    || typeof value.name !== "string" || !value.name.trim()
    || (value.mode !== "tapping" && value.mode !== "dictation")
    || typeof value.created_at !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value.created_at)
    || !Number.isFinite(Date.parse(value.created_at))) throw new CustomExerciseApiError(502);
  return { id: value.id, name: value.name, mode: value.mode, createdAt: value.created_at };
}

function parseDetail(value: unknown): AccountExercise {
  const summary = parseSummary(value);
  try {
    return { ...summary, exercise: parseRhythmExercise((value as Record<string, unknown>).exercise) };
  } catch {
    throw new CustomExerciseApiError(502);
  }
}
