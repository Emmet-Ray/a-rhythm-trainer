import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { default: CustomPracticePage } = await server.ssrLoadModule("/src/pages/CustomPracticePage.tsx");
const { default: PracticeSettings } = await server.ssrLoadModule("/src/practice/PracticeSettings.tsx");
const { default: RhythmPlayback } = await server.ssrLoadModule("/src/practice/RhythmPlayback.tsx");

async function renderPage(path, route) {
  const stream = await renderToReadableStream(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(Routes, null,
      createElement(Route, { path: route, element: createElement(CustomPracticePage) }),
    ),
  ));
  await stream.allReady;
  return new Response(stream).text();
}

function mockSavedExercises(t, raw) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => raw } });
  t.after(() => previous ? Object.defineProperty(globalThis, "localStorage", previous) : delete globalThis.localStorage);
}

const savedQuestions = ["tapping", "dictation"].map((mode) => ({
  id: `saved-${mode}`, name: `${mode}题目`, mode,
  exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [
    { elements: [{ kind: "note", noteValue: "whole" }] },
  ] },
}));

test("已保存列表链接到所属模式的题目", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}`, "/custom/:mode");
    assert.ok(html.includes(`href="/custom/${mode}/saved-${mode}"`));
    assert.match(html, /开始练习/);
  }
});

test("保存题目可按地址直接进入相应训练，共用 BPM 和节拍器", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}/saved-${mode}`, "/custom/:mode/:exerciseId");
    assert.ok(html.includes(`<h1>${mode}题目</h1>`));
    assert.ok(html.includes(`href="/custom/${mode}"`));
    assert.match(html, /应用速度/);
    assert.match(html, /value="60"/);
    assert.match(html, /type="checkbox" checked=""/);
    assert.ok(html.includes(mode === "tapping" ? 'aria-label="击拍训练区"' : 'aria-label="节奏听写区"'));
    assert.doesNotMatch(html, /编辑自定义练习|保存练习/);
  }
});

test("题目不存在或模式不匹配不启动训练", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const id of ["missing", "saved-dictation"]) {
    const html = await renderPage(`/custom/tapping/${id}`, "/custom/:mode/:exerciseId");
    assert.match(html, /未找到该练习/);
    assert.match(html, /返回题目列表/);
    assert.doesNotMatch(html, /击拍训练区|节奏听写区|应用速度/);
  }
});

test("题目页读取损坏数据时显示错误与重试，不冒充题目不存在", async (t) => {
  mockSavedExercises(t, "broken-json");
  const html = await renderPage("/custom/tapping/saved-tapping", "/custom/:mode/:exerciseId");
  assert.match(html, /无法读取练习/);
  assert.match(html, /重试读取/);
  assert.doesNotMatch(html, /未找到该练习|击拍训练区/);
});

test("自定义入口分别提供击拍和听写的列表地址，几何游戏不开放", async () => {
  const html = await renderPage("/custom", "/custom");
  assert.match(html, /href="\/custom\/tapping"/);
  assert.match(html, /href="\/custom\/dictation"/);
  assert.doesNotMatch(html, /href="[^\"]*geometry/);
  assert.match(html, /aria-current="page"[^>]*>自定义练习/);
});

test("模式列表保留新建入口，空存储显示暂无题目", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
  t.after(() => previous ? Object.defineProperty(globalThis, "localStorage", previous) : delete globalThis.localStorage);
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}`, "/custom/:mode");
    assert.ok(html.includes(`href="/custom/${mode}/new"`));
    assert.match(html, /暂无题目/);
    assert.doesNotMatch(html, /已保存的自定义练习|编辑自定义练习/);
  }
});

test("存储访问失败时列表显示错误与重试，不显示空题库", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  t.after(() => previous ? Object.defineProperty(globalThis, "localStorage", previous) : delete globalThis.localStorage);
  const html = await renderPage("/custom/tapping", "/custom/:mode");
  assert.match(html, /无法访问本地练习/);
  assert.match(html, /重试读取/);
  assert.doesNotMatch(html, /暂无题目/);
});

test("未知模式和未开放的几何模式不回退到默认编辑器", async () => {
  for (const mode of ["unknown", "geometry"]) {
    const html = await renderPage(`/custom/${mode}/new`, "/custom/:mode/new");
    assert.match(html, /未找到/);
    assert.doesNotMatch(html, /编辑自定义练习/);
  }
});

test("新建草稿默认两节、空名称、4/4，提供公共设置但全空草稿不可试听", async () => {
  const html = await renderPage("/custom/tapping/new", "/custom/:mode/new");
  assert.match(html, /aria-label="当前小节数量">2/);
  assert.match(html, /aria-label="小节 1"/);
  assert.match(html, /aria-label="小节 2"/);
  assert.match(html, /value=""/);
  assert.match(html, /4\/4 拍/);
  assert.match(html, /离开或刷新页面后草稿会丢失/);
  assert.match(html, /添加休止符/);
  assert.match(html, /保存练习/);
  assert.match(html, /应用速度/);
  assert.match(html, /value="60"/);
  assert.match(html, /type="checkbox" checked=""/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>试听<\/button>/);
  assert.doesNotMatch(html, /验证当前小节|播放题目|播放我的答案|查看答案/);
});

test("公共设置提供一致默认值，多实例的标签和输入 ID 不冲突", () => {
  const received = [];
  const settings = () => createElement(PracticeSettings, null, (value) => {
    received.push(value);
    return null;
  });
  const html = renderToStaticMarkup(createElement("div", null, settings(), settings()));
  assert.deepEqual(received, [
    { bpm: 60, metronomeEnabled: true },
    { bpm: 60, metronomeEnabled: true },
  ]);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) assert.ok(html.includes(`for="${id}"`));
});

test("共用播放器禁止全空草稿，允许纯休止符和欠拍草稿，不自行加入听写按钮", () => {
  for (const [measures, disabled] of [
    [[], true], [[[], []], true],
    [[[{ kind: "rest", noteValue: "quarter" }]], false],
    [[[{ kind: "note", noteValue: "eighth" }], []], false],
  ]) {
    const html = renderToStaticMarkup(createElement(RhythmPlayback, {
      options: [{ id: "draft", label: "试听", stopLabel: "停止", measures }],
      bpm: 60,
      timeSignature: { beats: 4, beatType: 4 },
    }));
    assert.equal(html.includes('disabled=""'), disabled);
    assert.equal((html.match(/<button\b/g) ?? []).length, 1);
    assert.doesNotMatch(html, /播放题目|播放我的答案/);
  }
});
