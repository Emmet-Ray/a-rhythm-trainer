export type Provider = "deepseek" | "chatgpt";
export type ModelSelection = { provider: Provider; model: string };
export type Connection = {
  configured: boolean; model: string; models: { id: string; name: string; supports_images?: boolean }[];
  catalog_updated_at: number; needs_authorization?: boolean; account?: string;
};
export type Connections = { provider: Provider; deepseek: Connection; chatgpt: Connection };
export const providerNames: Record<Provider, string> = { deepseek: "DeepSeek", chatgpt: "ChatGPT" };
export const providers: Provider[] = ["deepseek", "chatgpt"];

/** 仅传输公开连接状态；服务端不会回传已保存的密钥或令牌 */
export async function requestConnections<T = Connections>(path = "", method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/model-connections${path}`, {
    method, cache: "no-store", headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(65_000)]) : AbortSignal.timeout(65_000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : "模型服务请求失败");
  return value;
}
export function connectionsChanged() {
  window.dispatchEvent(new Event("model-connections-changed"));
}

/** 默认选择变化不代表凭证或目录发生变化 */
export function selectionChanged(selection: ModelSelection) {
  window.dispatchEvent(new CustomEvent("model-selection-changed", { detail: selection }));
}
