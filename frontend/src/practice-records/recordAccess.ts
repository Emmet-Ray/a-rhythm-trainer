import { createContext } from "react";
import type { useAuth } from "../auth/useAuth";

export type RecordAccess = "guest" | "account" | "checking" | "unavailable";
export const RecordAccessContext = createContext<RecordAccess>("checking");

export function recordAccess(auth: Pick<ReturnType<typeof useAuth>, "state" | "busy">): RecordAccess {
  if (auth.busy || auth.state.status === "checking") return "checking";
  if (auth.state.status === "authenticated") return "account";
  if (auth.state.status === "guest" || auth.state.status === "disabled") return "guest";
  return "unavailable";
}

export function recordAccessMessage(access: RecordAccess) {
  if (access === "account") return "账号练习记录暂未开放，本次不会写入游客记录。";
  if (access === "checking") return "正在确认身份，暂不记录练习。";
  if (access === "unavailable") return "暂时无法确认身份，本次不保存练习记录；练习仍可使用。";
  return "";
}
