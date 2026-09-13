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
const { default: App } = await server.ssrLoadModule("/src/App.tsx");

async function renderApp(path) {
  const stream = await renderToReadableStream(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)));
  await stream.allReady;
  return (await new Response(stream).text()).replaceAll("<!-- -->", "");
}

test("首页独立展示三个平等入口，不显示预设主题或训练区", async () => {
  const html = await renderApp("/");
  assert.match(html, /<title>首页 · 节奏训练<\/title>/);
  assert.match(html, /aria-label="练习入口"/);
  for (const path of ["preset", "random", "custom"]) assert.ok(html.includes(`href="/${path}"`));
  assert.match(html, /aria-current="page"[^>]*>首页/);
  assert.doesNotMatch(html, /topic-section|击拍训练区|节奏听写区/);
});

test("随机练习三种方式同级展示，几何游戏未开放且没有跳转入口", async () => {
  const html = await renderApp("/random");
  assert.match(html, /href="\/random\/tapping"/);
  assert.match(html, /href="\/random\/dictation"/);
  assert.match(html, /<div class="question-link random-mode-unavailable" aria-disabled="true"><h3>几何游戏<\/h3><span class="question-action">未开放<\/span><\/div>/);
  assert.doesNotMatch(html, /href="\/random\/geometry"/);
});

test("预设列表与详情都在 preset 下，旧 practice 地址不再兼容", async () => {
  const list = await renderApp("/preset");
  assert.match(list, /<h1>预设练习<\/h1>/);
  assert.match(list, /href="\/preset\/basic-values-01"/);
  assert.doesNotMatch(list, /href="\/practice\//);
  const detail = await renderApp("/preset/basic-values-01");
  assert.match(detail, /href="\/preset"[^>]*>← 返回预设练习/);
  assert.match(detail, /击拍训练区/);
  const missing = await renderApp("/preset/nonexistent");
  assert.match(missing, /未找到该练习/);
  assert.match(missing, /返回预设练习/);
  const old = await renderApp("/practice/basic-values-01");
  assert.match(old, /未找到该页面/);
  assert.match(old, /返回首页/);
  assert.doesNotMatch(old, /击拍训练区/);
});

test("三个来源页面不再展示来源切换栏，保留首页返回入口及训练方式选择", async () => {
  for (const path of ["/preset", "/random", "/custom"]) {
    const html = await renderApp(path);
    assert.doesNotMatch(html, /aria-label="内容来源"/);
    assert.match(html, /href="\/"[^>]*>首页/);
    assert.match(html, /击拍练习/);
    assert.match(html, /节奏听写/);
    if (path === "/preset") assert.match(html, /class="option-strip topic-modes"/);
  }
  assert.match(await renderApp("/login"), /href="\/"[^>]*>首页/);
});

test("顶部练习下拉默认收起，在列表和题目页标识所属栏目", async () => {
  for (const [path, active, current] of [["/", null, null], ["/preset", "/preset", "page"],
    ["/preset/basic-values-01", "/preset", "location"], ["/random/tapping", "/random", "location"],
    ["/custom/dictation", "/custom", "location"]]) {
    const html = await renderApp(path);
    const dropdown = html.match(/<details class="practice-navigation"[\s\S]*?<\/details>/)?.[0];
    assert.ok(dropdown);
    assert.doesNotMatch(dropdown, /<details[^>]*\bopen/);
    for (const target of ["/preset", "/random", "/custom"]) assert.ok(dropdown.includes(`href="${target}"`));
    if (active) assert.match(dropdown, new RegExp(`<a(?=[^>]*href="${active}")(?=[^>]*aria-current="${current}")[^>]*>`));
    else assert.doesNotMatch(dropdown, /aria-current/);
  }
});

test("设计系统覆盖公共页头、首页、预设列表与击拍页，其他主体不受影响", async () => {
  assert.match(await renderApp("/"), /class="design-system home-page"/);
  assert.match(await renderApp("/preset"), /class="design-system preset-library"/);
  const tapping = await renderApp("/preset/basic-values-01");
  assert.match(tapping, /class="design-system practice-page"/);
  assert.match(tapping, /data-feedback="neutral"/);
  assert.match(tapping, /data-action="start"/);
  assert.match(tapping, /data-action="listen"/);
  assert.match(await renderApp("/random"), /class="design-system random-page random-index"/);
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderApp(`/random/${mode}`);
    assert.match(html, /class="design-system random-generation"/);
    assert.match(html, /class="practice-settings design-system"/);
    if (mode === "tapping") assert.match(html, /rhythm-trainer design-system/);
    else assert.match(html, /<section aria-label="节奏听写区">/);
  }
  for (const path of ["/preset/dictation-basic-values-01", "/random/dictation"]) {
    const html = await renderApp(path);
    assert.match(html, /class="rhythm-dictation design-system"/);
    assert.match(html, /data-verdict="unchecked"/);
    assert.match(html, /data-action="play" data-source="question"/);
  }
  const customIndex = await renderApp("/custom");
  assert.match(customIndex, /class="design-system custom-index"/);
  assert.match(customIndex, /class="question-link custom-mode-unavailable" aria-disabled="true"/);
  for (const path of ["/login"]) {
    const html = await renderApp(path);
    assert.match(html, /class="site-header design-system"/);
    assert.match(html, /class="design-system login-page"/);
  }
});

test("404 状态页提供与错误类型对应的主要返回入口", async () => {
  for (const path of ["/missing", "/preset/missing"]) {
    const html = await renderApp(path);
    assert.match(html, /class="design-system not-found" aria-labelledby="not-found-heading"/);
    assert.match(html, /id="not-found-heading"/);
    assert.match(html, /class="not-found-code">404/);
    assert.ok(html.includes(`class="not-found-action" href="${path === "/missing" ? "/" : "/preset"}"`));
    assert.match(html, /未找到/);
  }
});

test("设置页不要求登录，显示三套配色与恢复默认入口", async () => {
  const html = await renderApp("/settings");
  assert.match(html, /class="design-system settings-page"/);
  assert.match(html, /aria-current="page" href="\/settings"/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, /紫色/);
  assert.match(html, /蓝色/);
  assert.match(html, /青绿色/);
  assert.match(html, /恢复默认/);
  assert.doesNotMatch(html, /未开放|请登录后/);
});

test("登录表单保留标签、自动填充和反馈语义，未发送验证码时不能登录", async () => {
  const html = await renderApp("/login");
  assert.match(html, /aria-labelledby="login-heading"/);
  assert.match(html, /for="login-phone"/);
  assert.match(html, /type="tel"[^>]*autoComplete="tel-national"/);
  assert.match(html, /for="login-code"/);
  assert.match(html, /autoComplete="one-time-code"/);
  assert.match(html, /class="login-feedback"><p role="status"/);
  assert.match(html, /<button type="submit" disabled="">登录/);
});

async function renderPage(path, route, auth = { state: { status: "guest" }, busy: false }) {
  const stream = await renderToReadableStream(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(Routes, null,
      createElement(Route, { path: route, element: createElement(CustomPracticePage, { auth }) }),
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

test("自定义练习复用组件自身样式，不需要页面开启设计开关", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}/saved-${mode}`, "/custom/:mode/:exerciseId");
    assert.match(html, /class="design-system practice-page custom-detail"/);
    assert.match(html, /class="practice-settings design-system"/);
    assert.match(html, mode === "tapping"
      ? /class="rhythm-trainer design-system"/
      : /class="rhythm-dictation design-system"/);
  }
});

test("已保存列表链接到所属模式的题目", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}`, "/custom/:mode");
    assert.match(html, /class="design-system practice-page custom-library"/);
    assert.ok(html.includes(`href="/custom/${mode}/saved-${mode}"`));
    assert.match(html, /开始练习/);
    assert.match(html, /<button type="button" disabled="">编辑 <small>未开放<\/small><\/button>/);
    assert.doesNotMatch(html, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/);
  }
});

test("账号列表等待远程响应，不读取本地题库", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  const html = await renderPage("/custom/tapping", "/custom/:mode", { state: { status: "authenticated", user: { id: 1 } }, busy: false });
  assert.match(html, /我的练习/);
  assert.match(html, /正在读取练习/);
  assert.doesNotMatch(html, /saved-tapping|暂无题目/);
});

test("登录未知或正在切换身份时不读取本地题库", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const auth of [
    { state: { status: "checking" }, busy: false },
    { state: { status: "unavailable" }, busy: false },
    { state: { status: "authenticated", user: { id: 1 } }, busy: true },
  ]) {
    const html = await renderPage("/custom/tapping", "/custom/:mode", auth);
    assert.match(html, /class="design-system practice-page custom-status"/);
    assert.doesNotMatch(html, /saved-tapping|暂无题目/);
    assert.match(html, /登录/);
  }
});

test("账号详情未登录时要求登录，已登录也不会用同 ID 的本地题目兜底", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  const path = "/custom/tapping/account/saved-tapping";
  const route = "/custom/:mode/account/:exerciseId";
  const guest = await renderPage(path, route);
  assert.match(guest, /请登录后查看账号练习/);
  assert.match(guest, /class="design-system practice-page custom-status"/);
  const html = await renderPage(path, route, { state: { status: "authenticated", user: { id: 1 } }, busy: false });
  assert.match(html, /正在读取练习/);
  assert.doesNotMatch(html, /tapping题目|击拍训练区/);
});

test("已登录打开旧本地链接仍读取本地题目，不隐式改为账号来源", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  const html = await renderPage("/custom/tapping/saved-tapping", "/custom/:mode/:exerciseId", { state: { status: "authenticated", user: { id: 1 } }, busy: false });
  assert.match(html, /本地练习/);
  assert.match(html, /tapping题目/);
});

test("编辑器不显示存储提示，登录状态未知时不能保存但保留编辑界面", async () => {
  for (const status of ["authenticated", "checking", "unavailable"]) {
    const html = await renderPage("/custom/tapping/new", "/custom/:mode/new", { state: { status, user: { id: 1 } }, busy: false });
    assert.match(html, /编辑自定义练习/);
    assert.doesNotMatch(html, /class="custom-draft-notice"/);
    if (status !== "authenticated") assert.match(html, /<button[^>]*disabled=""[^>]*>保存练习/);
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
  assert.match(html, /class="design-system practice-page custom-detail"/);
  assert.match(html, /重试读取/);
  assert.doesNotMatch(html, /未找到该练习|击拍训练区/);
});

test("自定义入口分别提供击拍和听写的列表地址，几何游戏不开放", async () => {
  const html = await renderPage("/custom", "/custom");
  assert.match(html, /href="\/custom\/tapping"/);
  assert.match(html, /href="\/custom\/dictation"/);
  assert.doesNotMatch(html, /href="[^\"]*geometry/);
  assert.doesNotMatch(html, /aria-label="内容来源"/);
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

test("听写与自定义新建页共用编辑器自身样式", async () => {
  const dictation = await renderApp("/preset/dictation-basic-values-01");
  const custom = await renderPage("/custom/tapping/new", "/custom/:mode/new");
  for (const html of [dictation, custom]) {
    assert.match(html, /class="rhythm-editor design-system"/);
    assert.match(html, /class="rhythm-measure-selection"/);
  }
});

test("新建草稿默认两节、空名称、4/4，提供公共设置但全空草稿不可试听", async () => {
  const html = await renderPage("/custom/tapping/new", "/custom/:mode/new");
  assert.match(html, /class="design-system practice-page custom-create"/);
  assert.match(html, /class="rhythm-playback design-system"/);
  assert.match(html, /aria-label="当前小节数量">2/);
  assert.match(html, /aria-label="小节 1"/);
  assert.match(html, /aria-label="小节 2"/);
  assert.match(html, /value=""/);
  assert.match(html, /4\/4 拍/);
  assert.doesNotMatch(html, /class="custom-draft-notice"/);
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
