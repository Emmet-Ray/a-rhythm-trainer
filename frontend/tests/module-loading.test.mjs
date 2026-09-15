import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement, Suspense } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { preloadable } = await server.ssrLoadModule("/src/navigation/preloadable.ts");
const { destinationModules, routeModules } = await server.ssrLoadModule("/src/navigation/routeModules.ts");
const { workspaceModule, editorModule } = await server.ssrLoadModule("/src/practice/practiceModules.ts");
const { LoadingPlaceholder } = await server.ssrLoadModule("/src/navigation/LoadingPlaceholder.tsx");

test("预加载按意图获取模块一次、不挂载；完成后首次渲染无需 fallback", async () => {
  let imports = 0;
  let renders = 0;
  let resolve;
  const resource = preloadable(() => { imports++; return new Promise(done => { resolve = done; }); });
  assert.equal(imports, 0);
  const requests = [resource.preload(), resource.preload()];
  assert.equal(imports, 1);
  resolve({ default: ({ label }) => { renders++; return createElement("p", null, label); } });
  await Promise.all(requests);
  assert.equal(renders, 0);
  const html = renderToStaticMarkup(createElement(Suspense, { fallback: "waiting" }, createElement(resource.Component, { label: "ready" })));
  assert.match(html, /ready/);
  assert.doesNotMatch(html, /waiting/);
  assert.equal(renders, 1);
  await resource.preload();
  assert.equal(imports, 1);
});

test("未预加载的组件仍可通过 Suspense 等待完成", async () => {
  const resource = preloadable(async () => ({ default: () => createElement("p", null, "loaded") }));
  const stream = await renderToReadableStream(createElement(Suspense, { fallback: "waiting" }, createElement(resource.Component)));
  await stream.allReady;
  assert.match(await new Response(stream).text(), /loaded/);
});

test("失败的预测加载不会产生未处理拒绝，后续意图可重试", async () => {
  let calls = 0;
  const resource = preloadable(async () => {
    if (++calls === 1) throw new Error("network unavailable");
    return { default: () => createElement("p", null, "retry succeeded") };
  });
  await resource.preload();
  await resource.preload();
  assert.equal(calls, 2);
  assert.match(renderToStaticMarkup(createElement(resource.Component)), /retry succeeded/);
});

test("预加载范围不把首页、列表或设置变成全量训练代码入口", () => {
  for (const path of ["/", "/unknown", "/constructor", "/toString"]) assert.deepEqual(destinationModules(path), []);
  for (const section of ["preset", "random", "custom", "settings"]) assert.deepEqual(destinationModules(`/${section}`), [routeModules[section]]);
  assert.deepEqual(destinationModules("/custom/tapping"), [routeModules.custom]);
  assert.deepEqual(destinationModules("/custom/dictation/new"), [routeModules.custom, editorModule]);
  assert.deepEqual(destinationModules("/custom/tapping/account/123"), [routeModules.custom, workspaceModule]);
  assert.deepEqual(destinationModules("/preset/basic-values-01"), [routeModules.preset, workspaceModule]);
  assert.deepEqual(destinationModules("/random/dictation"), [routeModules.random, workspaceModule]);
  assert.deepEqual(destinationModules("/random/unknown"), [routeModules.random]);
});

test("加载占位立即标记待完成，短等待不播报文本，不提供伪操作控件", () => {
  const html = renderToStaticMarkup(createElement(LoadingPlaceholder, { workspace: true, label: "正在加载练习…" }));
  assert.match(html, /data-navigation-pending/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /正在加载|<button/);
});
