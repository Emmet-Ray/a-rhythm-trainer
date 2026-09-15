export const themes = [
  { id: "purple", label: "紫色" },
  { id: "blue", label: "蓝色" },
  { id: "teal", label: "青绿色" },
] as const;
export type Theme = typeof themes[number]["id"];
export const DEFAULT_THEME: Theme = "purple";
const STORAGE_KEY = "rhythm-trainer.appearance";
const MODE_STORAGE_KEY = "rhythm-trainer.color-mode";
export const colorModes = [
  { id: "system", label: "跟随系统" },
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
] as const;
export type ColorMode = typeof colorModes[number]["id"];
export const DEFAULT_COLOR_MODE: ColorMode = "system";

type Appearance = Readonly<{ theme: Theme; colorMode: ColorMode; storageAvailable: boolean }>;
let current: Appearance = { theme: DEFAULT_THEME, colorMode: DEFAULT_COLOR_MODE, storageAvailable: true };
let systemPreference: MediaQueryList | undefined;

function parseTheme(value: unknown): Theme {
  return themes.find(theme => theme.id === value)?.id ?? DEFAULT_THEME;
}

function applyColorMode() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.colorMode = current.colorMode === "system"
      ? (systemPreference?.matches ? "dark" : "light") : current.colorMode;
  }
}

function apply(theme: Theme, colorMode: ColorMode, storageAvailable: boolean): Appearance {
  current = { theme, colorMode, storageAvailable };
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
  applyColorMode();
  return current;
}

/** 启动时、React 渲染前调用；损坏或未知偏好回退默认，不修改其他本地数据。 */
export function initializeAppearance(): Appearance {
  systemPreference?.removeEventListener("change", applyColorMode);
  systemPreference = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;
  systemPreference?.addEventListener("change", applyColorMode);
  try {
    const theme = parseTheme(globalThis.localStorage.getItem(STORAGE_KEY));
    const storedMode = globalThis.localStorage.getItem(MODE_STORAGE_KEY);
    const mode = colorModes.find(mode => mode.id === storedMode)?.id ?? DEFAULT_COLOR_MODE;
    return apply(theme, mode, true);
  } catch {
    return apply(DEFAULT_THEME, DEFAULT_COLOR_MODE, false);
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
    return apply(next, current.colorMode, true);
  } catch {
    return apply(next, current.colorMode, false);
  }
}

/** 明暗偏好独立于配色存储；跟随系统时无需重挂载页面或谱面。 */
export function selectColorMode(mode: ColorMode): Appearance {
  const next = colorModes.find(item => item.id === mode)?.id ?? DEFAULT_COLOR_MODE;
  try {
    globalThis.localStorage.setItem(MODE_STORAGE_KEY, next);
    return apply(current.theme, next, true);
  } catch {
    return apply(current.theme, next, false);
  }
}

export function resetAppearance(): Appearance {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, DEFAULT_THEME);
    globalThis.localStorage.setItem(MODE_STORAGE_KEY, DEFAULT_COLOR_MODE);
    return apply(DEFAULT_THEME, DEFAULT_COLOR_MODE, true);
  } catch {
    return apply(DEFAULT_THEME, DEFAULT_COLOR_MODE, false);
  }
}

if (import.meta.hot) import.meta.hot.dispose(() => systemPreference?.removeEventListener("change", applyColorMode));
