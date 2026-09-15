import { createElement, use, type ComponentType } from "react";

/** 模块级共享加载：预加载完成后同步渲染；未完成时由最近的 Suspense 接管。
 * 预加载只获取代码，不挂载组件。失败的预测请求可重试，实际渲染失败仍向错误边界传播。
 */
export function preloadable<Props extends object>(importModule: () => Promise<{ default: ComponentType<Props> }>) {
  let pending: ReturnType<typeof importModule> | undefined;
  let resolved: Awaited<ReturnType<typeof importModule>> | undefined;
  let rendering = false;
  function load() {
    return pending ??= importModule().then(module => {
      resolved = module;
      return module;
    });
  }
  function Component(props: Props) {
    rendering = true;
    const module = resolved ?? use(load());
    return createElement(module.default, props);
  }
  function preload() {
    const request = load();
    return request.then(() => {}, () => {
      if (!rendering && pending === request) pending = undefined;
    });
  }
  return { Component, preload };
}
