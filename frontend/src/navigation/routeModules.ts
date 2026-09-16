import type { SyntheticEvent } from "react";
import { preloadable } from "./preloadable";
import { editorModule, workspaceModule } from "../practice/practiceModules";
import { presetCatalogStore } from "../exercises/presetCatalogStore";

export const routeModules = {
  preset: preloadable(() => import("../pages/PresetPracticePage")),
  random: preloadable(() => import("../pages/RandomPracticePage")),
  custom: preloadable(() => import("../pages/CustomPracticePage")),
  settings: preloadable(() => import("../pages/SettingsPage")),
};

/** 列表只预加载页面；明确指向练习或新建页时才加载对应的重型模块。 */
export function destinationModules(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const [section, mode, target] = segments;
  const page = section === "login" ? "settings" : section;
  if (!Object.hasOwn(routeModules, page)) return [];
  const modules = [routeModules[page as keyof typeof routeModules]];
  if (section === "custom" && ["tapping", "dictation"].includes(mode)
    && (target === "new" || segments.at(-1) === "edit")) return [...modules, editorModule];
  if (section === "preset" && segments.length === 2
    || section === "random" && segments.length === 2 && ["tapping", "dictation"].includes(mode)
    || section === "custom" && ["tapping", "dictation"].includes(mode) && target && target !== "new") {
    return [...modules, workspaceModule];
  }
  return modules;
}

export function preloadDestination(pathname: string) {
  const pending = destinationModules(pathname).map(module => module.preload());
  if (pathname.split("/").filter(Boolean)[0] === "preset") pending.push(presetCatalogStore.load());
  return Promise.all(pending);
}

/** 在应用壳委托所有内部链接的意图事件，包括 ReturnLink；不改变链接导航行为。 */
export function preloadLinkIntent(event: SyntheticEvent) {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href);
  if (url.origin === window.location.origin) void preloadDestination(url.pathname);
}
