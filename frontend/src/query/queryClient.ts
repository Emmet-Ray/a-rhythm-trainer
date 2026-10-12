import { QueryClient } from "@tanstack/react-query";

// 单个浏览器应用共享缓存。读取失败由用户重试；写入绝不自动重试。
// 保持离线时仍尝试访问本机后端，避免请求永久停在 paused 状态。
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { retry: false, refetchOnWindowFocus: true, networkMode: "always" },
  mutations: { retry: false, networkMode: "always" },
} });
