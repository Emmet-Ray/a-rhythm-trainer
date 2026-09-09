import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { default: CustomPracticePage } = await server.ssrLoadModule("/src/pages/CustomPracticePage.tsx");

async function renderPage(path, route) {
  const stream = await renderToReadableStream(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(Routes, null,
      createElement(Route, { path: route, element: createElement(CustomPracticePage) }),
    ),
  ));
  await stream.allReady;
  return new Response(stream).text();
}

test("自定义入口分别提供击拍和听写的新建地址，几何游戏不开放", async () => {
  const html = await renderPage("/custom", "/custom");
  assert.match(html, /href="\/custom\/tapping\/new"/);
  assert.match(html, /href="\/custom\/dictation\/new"/);
  assert.doesNotMatch(html, /href="[^\"]*geometry/);
  assert.match(html, /aria-current="page"[^>]*>自定义练习/);
});

test("未知模式和未开放的几何模式不回退到默认编辑器", async () => {
  for (const mode of ["unknown", "geometry"]) {
    const html = await renderPage(`/custom/${mode}/new`, "/custom/:mode/new");
    assert.match(html, /未找到/);
    assert.doesNotMatch(html, /编辑自定义练习/);
  }
});

test("新建草稿默认两节、空名称、4/4，只有编辑功能并明确说明未保存", async () => {
  const html = await renderPage("/custom/tapping/new", "/custom/:mode/new");
  assert.match(html, /aria-label="当前小节数量">2/);
  assert.match(html, /aria-label="小节 1"/);
  assert.match(html, /aria-label="小节 2"/);
  assert.match(html, /value=""/);
  assert.match(html, /4\/4 拍/);
  assert.match(html, /离开或刷新页面后草稿会丢失/);
  assert.match(html, /添加休止符/);
  assert.doesNotMatch(html, /验证当前小节|播放题目|播放我的答案|查看答案/);
});
