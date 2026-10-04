import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let practiceNavigationState, readPracticeOrigin;
try { ({ practiceNavigationState, readPracticeOrigin } = await server.ssrLoadModule("/src/exercises/aiPracticeNavigation.ts")); }
finally { await server.close(); }
test("进入 AI 训练保留来源地址，切换题目不丢失原始来源", () => {
  const state = practiceNavigationState({ pathname: "/records", search: "?mode=tapping", hash: "#recent", state: null });
  assert.deepEqual(readPracticeOrigin(state), { path: "/records?mode=tapping#recent", label: "练习记录" });
  assert.deepEqual(practiceNavigationState({ pathname: "/ai/tapping/two", search: "", hash: "", state }), state);
});
test("缺失或不合法的来源回退到首页", () => {
  for (const state of [null, {}, { practiceOrigin: { path: "//example.com", label: "外部" } }, { practiceOrigin: { path: "/\\example.com", label: "外部" } }]) {
    assert.deepEqual(readPracticeOrigin(state), { path: "/", label: "首页" });
  }
});
