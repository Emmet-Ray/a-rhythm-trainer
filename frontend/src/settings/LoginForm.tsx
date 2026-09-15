import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthApiError, authErrorMessage, sendLoginCode } from "../api/auth";
import type { useAuth } from "../auth/useAuth";

export default function LoginForm({
  auth,
}: {
  auth: ReturnType<typeof useAuth>;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pending, setPending] = useState<"sending" | "login" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [codeError, setCodeError] = useState("");
  const phoneInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(false);
  const disabled = pending !== null || auth.busy;

  // 发送成功的状态提交后，输入框已解除禁用；失败与倒计时更新不抢焦点。
  useEffect(() => {
    if (requestId) codeInput.current?.focus();
  }, [requestId]);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => {
      setRemaining(
        Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)),
      );
    }, 500);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, []);

  function coolDown() {
    deadline.current = Date.now() + 60_000;
    setRemaining(60);
  }

  async function send() {
    if (locked.current || disabled || remaining > 0) return;
    if (!/^1[3-9][0-9]{9}$/.test(phone)) {
      setPhoneError("请输入 11 位中国大陆手机号，不含国家码或空格。");
      phoneInput.current?.focus();
      return;
    }
    locked.current = true;
    setPending("sending");
    setPhoneError("");
    setCodeError("");
    setError("");
    setMessage("");
    // 新发送可能使旧请求失效，即使最终没有收到成功响应也不再使用旧 ID。
    setRequestId(null);
    setCode("");
    try {
      const id = await sendLoginCode(phone);
      if (!mounted.current) return;
      setRequestId(id);
      setMessage("验证码已发送，请查看短信。");
      coolDown();
    } catch (error) {
      if (!mounted.current) return;
      setError(authErrorMessage(error));
      if (error instanceof AuthApiError && error.status === 429) coolDown();
    } finally {
      locked.current = false;
      if (mounted.current) setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || disabled) return;
    if (!requestId) {
      setError("请先发送验证码。");
      return;
    }
    if (!/^[0-9]{6}$/.test(code)) {
      setCodeError("请输入 6 位数字验证码。");
      setError("");
      setMessage("");
      codeInput.current?.focus();
      return;
    }
    locked.current = true;
    setPending("login");
    setCodeError("");
    setError("");
    setMessage("");
    try {
      await auth.login(requestId, code);
    } catch (error) {
      if (mounted.current) setError(authErrorMessage(error));
    } finally {
      locked.current = false;
      if (mounted.current) setPending(null);
    }
  }

  return (
    <div
      className="design-system login-page account-login"
    >
      <form
        className="login-form"
        aria-label="登录"
        onSubmit={submit}
        noValidate
        aria-busy={disabled}
      >
        <label htmlFor="login-phone">手机号</label>
        <input
          id="login-phone"
          ref={phoneInput}
          aria-invalid={!!phoneError}
          aria-describedby={phoneError ? "login-phone-error" : undefined}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={11}
          value={phone}
          disabled={disabled}
          onChange={(event) => {
            setPhone(event.target.value);
            setRequestId(null);
            setCode("");
            setMessage("");
            setError("");
            setPhoneError("");
            setCodeError("");
          }}
        />
        {phoneError && <p id="login-phone-error" className="login-field-error" role="alert">{phoneError}</p>}
        <label htmlFor="login-code">验证码</label>
        <div className="login-code-row">
          <input
            id="login-code"
            ref={codeInput}
            aria-invalid={!!codeError}
            aria-describedby={codeError ? "login-code-error" : undefined}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            disabled={disabled}
            onChange={(event) => {
              setCode(event.target.value);
              setCodeError("");
              setError("");
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={disabled || remaining > 0}
          >
            {pending === "sending"
              ? "正在发送…"
              : remaining > 0
                ? `${remaining} 秒后重发`
                : "发送验证码"}
          </button>
        </div>
        {codeError && <p id="login-code-error" className="login-field-error" role="alert">{codeError}</p>}
        <div className="login-feedback">
          {error ? (
            <p role="alert" className="auth-error">
              {error}
            </p>
          ) : (
            <p role="status">{message}</p>
          )}
        </div>
        <button type="submit" disabled={disabled || !requestId}>
          {pending === "login" ? "正在登录…" : "登录"}
        </button>
      </form>
    </div>
  );
}
