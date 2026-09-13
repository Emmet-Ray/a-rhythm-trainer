export const themes = [
  { id: "purple", label: "紫色" },
  { id: "blue", label: "蓝色" },
  { id: "teal", label: "青绿色" },
] as const;
export type Theme = typeof themes[number]["id"];
export const DEFAULT_THEME: Theme = "purple";
const STORAGE_KEY = "rhythm-trainer.appearance";

type Appearance = Readonly<{ theme: Theme; storageAvailable: boolean }>;
let current: Appearance = { theme: DEFAULT_THEME, storageAvailable: true };

function parseTheme(value: unknown): Theme {
  return themes.find(theme => theme.id === value)?.id ?? DEFAULT_THEME;
}

function apply(theme: Theme, storageAvailable: boolean): Appearance {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
  current = { theme, storageAvailable };
  return current;
}

/** 启动时、React 渲染前调用；损坏或未知偏好回退默认，不修改其他本地数据。 */
export function initializeAppearance(): Appearance {
  try {
    return apply(parseTheme(globalThis.localStorage.getItem(STORAGE_KEY)), true);
  } catch {
    return apply(DEFAULT_THEME, false);
  }
}

/** 读取当前已应用的选择；保存失败后跨页面导航仍保留本次偏好。 */
export function getAppearance(): Appearance {
  return current;
}

/** 立即应用并尽力保存。恢复默认也走此入口，只覆盖配色偏好，不清空存储。 */
export function selectTheme(theme: Theme): Appearance {
  const next = parseTheme(theme);
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, next);
    return apply(next, true);
  } catch {
    return apply(next, false);
  }
}
