import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError, authErrorMessage, getCurrentUser, loginWithCode, logoutSession, type CurrentUser } from "./authApi";

type AuthState =
  | { status: "checking" | "guest" | "unavailable" }
  | { status: "authenticated"; user: CurrentUser };

/** 由 App 持有一份状态；旧的 /me 响应不能覆盖后来的登录或退出结果。 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const mutating = useRef(false);

  const restore = useCallback(async (version: number, signal?: AbortSignal) => {
    try {
      const user = await getCurrentUser(signal);
      if (!signal?.aborted && version === revision.current) setState(user ? { status: "authenticated", user } : { status: "guest" });
    } catch {
      if (!signal?.aborted && version === revision.current) setState({ status: "unavailable" });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void restore(++revision.current, controller.signal);
    return () => controller.abort();
  }, [restore]);

  function refresh() {
    if (mutating.current) return;
    setError("");
    setState({ status: "checking" });
    void restore(++revision.current);
  }

  async function login(requestId: string, code: string) {
    if (mutating.current) throw new Error("正在处理登录请求。");
    mutating.current = true;
    const version = ++revision.current;
    setBusy(true);
    setError("");
    try {
      const user = await loginWithCode(requestId, code);
      if (version === revision.current) setState({ status: "authenticated", user });
    } catch (error) {
      // 网络中断时服务器可能已经设置会话；不武断地声明用户未登录。
      if (version === revision.current) {
        const definiteFailure = error instanceof AuthApiError && [400, 403, 422].includes(error.status);
        setState((current) => definiteFailure && current.status !== "checking" ? current : { status: "unavailable" });
      }
      throw error;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  async function logout() {
    if (mutating.current) return;
    mutating.current = true;
    const version = ++revision.current;
    setBusy(true);
    setError("");
    try {
      await logoutSession();
      if (version === revision.current) setState({ status: "guest" });
    } catch (error) {
      if (version === revision.current) {
        setState({ status: "unavailable" });
        setError(`无法确认退出结果。${authErrorMessage(error)}`);
      }
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  return { state, busy, error, refresh, login, logout };
}
