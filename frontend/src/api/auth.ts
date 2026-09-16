/** 只访问同源接口；凭证由浏览器 Cookie 管理，不读取或存储 token，不自动重试。 */
export type CurrentUser = { id: number };
export type SessionState =
  | { status: "disabled" | "guest" }
  | { status: "authenticated"; user: CurrentUser };

export class AuthApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    const messages: Record<number, string> = {
      400: "验证码错误或请求不可用，请重试或重新发送。",
      401: "登录已过期，请重新登录。",
      403: "请求来源不受允许，请检查网站登录配置。",
      422: "手机号或验证码格式不正确。",
      429: "发送过于频繁，请稍后再试。",
      503: "登录服务暂不可用，请稍后再试。",
    };
    super(messages[status] ?? "登录请求失败，请稍后再试。");
    this.status = status;
  }
}

export async function getSessionState(
  signal?: AbortSignal,
): Promise<SessionState> {
  try {
    const value = await (await request("me", undefined, signal)).json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AuthApiError(502);
    if (value?.auth_enabled === false && Object.keys(value).length === 1) return { status: "disabled" };
    if ("auth_enabled" in value) throw new AuthApiError(502);
    return { status: "authenticated", user: parseUser(value) };
  } catch (error) {
    // 只有 401 能确认未登录；网络错误与 503 必须保留为未知状态。
    if (error instanceof AuthApiError && error.status === 401) return { status: "guest" };
    throw error;
  }
}

export async function sendLoginCode(phoneNumber: string): Promise<string> {
  const value = await (
    await request("sms-code", { phone_number: phoneNumber })
  ).json();
  if (
    typeof value?.request_id !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.request_id)
  ) {
    throw new AuthApiError(502);
  }
  return value.request_id;
}

export async function loginWithCode(
  requestId: string,
  code: string,
): Promise<CurrentUser> {
  return readUser(await request("login", { request_id: requestId, code }));
}

export async function logoutSession(): Promise<void> {
  const response = await request("logout", {});
  if (response.status !== 204) throw new AuthApiError(502);
}

export function authErrorMessage(error: unknown): string {
  return error instanceof AuthApiError
    ? error.message
    : "网络连接失败，请检查网络后重试。";
}

async function request(
  path: string,
  body?: object,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal,
  });
  if (!response.ok) throw new AuthApiError(response.status);
  return response;
}

async function readUser(response: Response): Promise<CurrentUser> {
  return parseUser(await response.json());
}

function parseUser(value: unknown): CurrentUser {
  if (typeof value !== "object" || value === null || !("id" in value)) throw new AuthApiError(502);
  const id = value.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
    throw new AuthApiError(502);
  return { id };
}
