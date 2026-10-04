type Origin = { path: string; label: string };
const home: Origin = { path: "/", label: "首页" };

/** 返回目标随这次导航保存；AI 题目间切换继续使用最初的来源页。 */
export function readPracticeOrigin(state: unknown): Origin {
  const value = (state as { practiceOrigin?: Partial<Origin> } | null)?.practiceOrigin;
  if (!value || typeof value.path !== "string" || !value.path.startsWith("/")
    || value.path.startsWith("//") || value.path.includes("\\")
    || typeof value.label !== "string" || !value.label.trim()) return home;
  return { path: value.path, label: value.label };
}

export function practiceNavigationState(location: { pathname: string; search: string; hash: string; state: unknown }) {
  if (location.pathname.startsWith("/ai/")) return { practiceOrigin: readPracticeOrigin(location.state) };
  const labels: Record<string, string> = { records: "练习记录", preset: "预设练习", random: "随机练习", custom: "自定义练习", settings: "设置", about: "关于" };
  return { practiceOrigin: { path: location.pathname + location.search + location.hash,
    label: location.pathname === "/" ? "首页" : labels[location.pathname.split("/")[1]] ?? "返回" } };
}
