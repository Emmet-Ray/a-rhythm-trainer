import { useEffect, useState } from "react";
import { getAssistantStatus } from "../api/assistant";

/** 查询失败与未配置分开呈现；重试仅检查状态，不重发聊天消息。 */
export function useAssistantAvailability() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ ready: false, loading: true, title: "正在检查助手配置", message: "正在检查助手配置…" });
  useEffect(() => {
    const controller = new AbortController();
    void getAssistantStatus(controller.signal).then(result => {
      if (!controller.signal.aborted) setState({ ready: result.status === "ready", loading: false, title: result.status === "unconfigured" ? "未配置 API Key" : "助手配置有误", message: result.message });
    }, error => {
      if (!controller.signal.aborted) setState({ ready: false, loading: false, title: "无法连接助手服务",
        message: error instanceof Error ? error.message : "无法检查助手配置，请重试。" });
    });
    return () => controller.abort();
  }, [attempt]);
  function retry() {
    setState({ ready: false, loading: true, title: "正在检查助手配置", message: "正在检查助手配置…" });
    setAttempt(value => value + 1);
  }
  return { ...state, retry };
}
