import { useConfirm } from "../ui/confirmation";
import { Modal } from "../ui/Modal";
import { AsyncStatus } from "../ui/AsyncStatus";
import { useEffect, useRef, useState } from "react";
import { ActionError } from "../ui/ActionError";
import { SuccessToast } from "../ui/SuccessToast";
import { requestConnections, connectionsChanged, type Connections } from "../api/modelConnections";

export default function ModelServiceSettings() {
  const confirm = useConfirm();
  const [data, setData] = useState<Connections | null>(null);
  const [managing, setManaging] = useState<"deepseek" | "chatgpt" | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  function finish() { setManaging(null); setKey(""); }
  const loading = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loading.current = controller;
    requestConnections("", "GET", undefined, controller.signal).then(async value => {
      if (controller.signal.aborted) return;
      setData(value); setError("");
      const params = new URLSearchParams(window.location.search);
      const authorized = params.get("authorization");
      if (authorized) {
        setNotice(authorized === "success" ? "ChatGPT 已授权" : "已取消授权");
        params.delete("authorization");
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
        connectionsChanged();
        if (authorized === "success") {
          try {
            const refreshed = await requestConnections("/chatgpt/models", "POST", undefined, controller.signal);
            if (!controller.signal.aborted) setData(refreshed);
          }
          catch { if (!controller.signal.aborted) setError("授权已保存，模型列表暂时无法获取，可在对话中重试"); }
        }
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [revision]);
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    // A user mutation supersedes any background configuration/catalog read.
    loading.current?.abort();
    running.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { running.current = false; setBusy(false); }
  }
  function updated(value: Connections) { setData(value); connectionsChanged(); }
  async function authorize() {
    const value = await requestConnections<{ url: string }>("/chatgpt/authorize", "POST");
    window.location.assign(value.url);
  }
  return <section className="settings-section model-service-settings" aria-labelledby="model-service-heading">
    <h2 id="model-service-heading">模型服务</h2>
    {!data ? <><AsyncStatus pending={!error} label="正在读取模型配置…" />
      {error && <p>无法读取模型配置 <button onClick={() => setRevision(v => v + 1)}>重试</button></p>}</> : <>
      {(["deepseek", "chatgpt"] as const).map(provider => {
        const config = data[provider];
        const name = provider === "deepseek" ? "DeepSeek" : "ChatGPT";
        return <div className="model-service-row" key={provider}>
          <div className="model-service-summary"><h3>{name} <span>{provider === "deepseek" ? "API Key" : "订阅授权"}</span></h3>
            <p>{config.needs_authorization ? "凭证已失效" : config.configured ? provider === "deepseek" ? "已配置" : `已授权${config.account ? ` · ${config.account}` : ""}` : provider === "deepseek" ? "未配置" : "未授权"}</p>
          </div>
          <button disabled={busy} aria-label={`${config.configured ? "管理" : "配置"} ${name}`} onClick={() => { setManaging(provider); setKey(""); setError(""); }}>
            {config.needs_authorization ? provider === "deepseek" ? "更新凭证" : "重新授权" : config.configured ? "管理" : provider === "deepseek" ? "配置" : "授权"}
          </button>
        </div>;
      })}
    </>}
    {managing && <Modal title={managing === "deepseek" ? "DeepSeek" : "ChatGPT"} closeLabel="关闭模型服务管理" busy={busy} onClose={finish}>
      {close => <>
      {managing === "deepseek" && data && <>
        <form className="model-connection-form" onSubmit={event => { event.preventDefault(); void run(async () => {
          updated(await requestConnections("/deepseek/key", "PUT", { key })); setKey(""); setManaging(null); setNotice("API Key 已验证并保存");
        }); }}>
          <label htmlFor="model-api-key">{data.deepseek.configured ? "更新 API Key" : "API Key"}</label>
          <input data-dialog-autofocus id="model-api-key" type="password" autoComplete="new-password" value={key} onChange={e => setKey(e.target.value)} placeholder="输入 DeepSeek API Key" disabled={busy} />
          <div className="app-dialog-footer"><button type="button" disabled={busy} onClick={close}>取消</button><button className="app-dialog-primary" disabled={busy || !key.trim()} type="submit">{busy ? "验证中…" : "保存"}</button></div>
        </form>
        {data.deepseek.configured && <div className="model-service-dialog-secondary"><button className="danger" disabled={busy} onClick={async () => {
          if (await confirm({ title: "移除 API Key", description: "使用前需重新配置。", confirmLabel: "移除", danger: true })) void run(async () => {
            updated(await requestConnections("/deepseek/key", "DELETE")); setKey(""); setManaging(null); setNotice("API Key 已移除");
          });
        }}>移除 API Key</button></div>}
      </>}
      {managing === "chatgpt" && data && <>
        <p className="model-service-account">{data.chatgpt.configured ? data.chatgpt.account || "已授权" : "使用 ChatGPT 账号授权"}</p>
        <div className="app-dialog-footer"><button type="button" disabled={busy} onClick={close}>取消</button><button className="app-dialog-primary" disabled={busy} onClick={() => void run(authorize)}>{busy ? "正在连接…" : data.chatgpt.configured ? "重新授权" : "授权 ChatGPT"}</button></div>
        {data.chatgpt.configured && <div className="model-service-dialog-secondary">
          <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">用量与应用权限 ↗</a>
          <button className="danger" disabled={busy} onClick={async () => {
            if (await confirm({ title: "移除 ChatGPT 授权", description: "使用前需重新授权。", confirmLabel: "移除", danger: true })) void run(async () => {
              const value = await requestConnections<{ connections: Connections; message: string }>("/chatgpt/authorization", "DELETE");
              updated(value.connections); setManaging(null); setNotice(value.message);
            });
          }}>移除授权</button>
        </div>}
      </>}
      {error && managing && <p className="assistant-error" role="alert">{error}</p>}
      </>}
    </Modal>}
    {error && !managing && <ActionError message={error} />}
    {notice && <SuccessToast key={notice} message={notice} />}
  </section>;
}
