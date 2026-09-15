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
const { default: PracticeCue } = await server.ssrLoadModule("/src/practice/PracticeCue.tsx");
const { RhythmDraftScore } = await server.ssrLoadModule("/src/rhythm/notation/RhythmDraftScore.tsx");
const { default: App } = await server.ssrLoadModule("/src/App.tsx");
const { default: SettingsPage } = await server.ssrLoadModule("/src/pages/SettingsPage.tsx");
const { VisitsContext } = await server.ssrLoadModule("/src/navigation/usePageNavigation.ts");
const { PageVisits } = await server.ssrLoadModule("/src/navigation/PageVisits.ts");
const { default: PracticeWorkspace } = await server.ssrLoadModule("/src/practice/PracticeWorkspace.tsx");
const { dictationBinding } = await server.ssrLoadModule("/src/practice/DictationState.ts");
const { default: RhythmScore } = await server.ssrLoadModule("/src/rhythm/notation/RhythmScore.tsx");
const { createExerciseTimeline } = await server.ssrLoadModule("/src/rhythm/RhythmTiming.ts");
const { PracticeHeading } = await server.ssrLoadModule("/src/practice/PracticeHeading.tsx");

// 导航和状态文案不依赖图标库生成的 SVG 路径与属性顺序。
const withoutSvg = html => html.replace(/<svg\b[^]*?<\/svg>/g, "");

test("高频操作在各模式保留文字并提供不参与朗读的图标", async () => {
  for (const [path, labels] of [
    ["/preset/basic-values-01", ["击拍练习", "试听"]],
    ["/preset/dictation-basic-values-01", ["播放题目", "播放我的答案"]],
    ["/random/tapping", ["击拍练习", "试听", "换一题", "生成设置"]],
    ["/random/dictation", ["播放题目", "播放我的答案", "换一题", "生成设置", "验证当前小节", "查看答案"]],
    ["/custom/tapping", ["新建练习"]],
    ["/custom/dictation", ["新建练习"]],
    ["/custom/tapping/new", ["试听", "保存练习"]],
    ["/custom/dictation/new", ["试听", "保存练习"]],
  ]) {
    const html = path.startsWith("/custom/")
      ? await renderPage(path, path.endsWith("/new") ? "/custom/:mode/new" : "/custom/:mode")
      : await renderApp(path);
    const controls = html.match(/<(?:button|a)\b[^]*?<\/(?:button|a)>/g) ?? [];
    for (const label of labels) {
      const control = controls.find(item => withoutSvg(item).replace(/<[^>]*>/g, "").trim() === label);
      assert.ok(control, `${path}: ${label}`);
      assert.match(control, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
      assert.equal((control.match(/<svg\b/g) ?? []).length, 1);
    }
  }
});

test("共用题头只显示返回入口和原题名，无题名时不补模式标题", () => {
  for (const title of [undefined, "练习 1", "很长的自定义题目".repeat(12)]) {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(PracticeHeading, { backTo: "/random", backLabel: "随机练习", title })));
    assert.match(withoutSvg(html), /href="\/random"[^>]*>随机练习/);
    assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    if (title) assert.ok(html.includes(`<h1>${title}</h1>`));
    else assert.doesNotMatch(html, /<h1/);
    assert.doesNotMatch(html, /eyebrow|击拍练习|节奏听写/);
  }
});

test("共用谱面列出所有小节导航，受控选择与只读浏览独立", () => {
  for (const count of [1, 2, 4]) {
    const props = { measures: Array.from({ length: count }, () => []), timeSignature: { beats: 4, beatType: 4 } };
    const html = renderToStaticMarkup(createElement(RhythmDraftScore, { ...props, selectedMeasureIndex: count - 1, onSelectMeasure() {} }));
    assert.equal((html.match(/aria-label="跳到小节 /g) ?? []).length, count);
    assert.match(html, new RegExp(`aria-label="跳到小节 ${count}" aria-pressed="true"`));
    assert.ok(html.indexOf('aria-label="小节导航"') < html.indexOf('class="rhythm-draft-viewport"'));
    const reference = renderToStaticMarkup(createElement(RhythmDraftScore, { ...props, navigationLabel: "参考答案" }));
    assert.match(reference, /参考答案/);
    assert.match(reference, /aria-label="跳到小节 1" aria-pressed="true"/);
    assert.doesNotMatch(reference, /class="rhythm-measure-selection"/);
  }
});

async function renderApp(path) {
  const stream = await renderToReadableStream(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)));
  await stream.allReady;
  return (await new Response(stream).text()).replaceAll("<!-- -->", "");
}

test("结果图标不参与朗读，正确与错误都保留文字及关闭按钮名称", () => {
  for (const passed of [true, false]) {
    const html = renderToStaticMarkup(createElement(PracticeCue, { passed, onDismiss() {} }));
    assert.match(html, /aria-label="关闭练习结果"/);
    assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.match(withoutSvg(html), new RegExp(`data-passed="${passed}">${passed ? "通过" : "未通过"}`));
  }
});

test("共用提示支持倒数和可关闭结果，听写反馈位于小节内而遮罩位于滚动窗口之外", () => {
  for (const countdown of [4, 3, 2, 1]) {
    const html = renderToStaticMarkup(createElement(PracticeCue, { countdown }));
    assert.match(html, new RegExp(`aria-label="预备拍：${countdown}"`));
    assert.doesNotMatch(html, /关闭练习结果/);
  }
  const cue = createElement(PracticeCue, { passed: true, onDismiss() {} });
  const html = renderToStaticMarkup(createElement(RhythmDraftScore, {
    measures: [[]], timeSignature: { beats: 4, beatType: 4 },
    measureFeedback: ["correct"], overlay: cue,
  }));
  assert.match(html, /draft-measure-feedback[^]*data-verdict="correct"/);
  assert.match(html, /<\/div><\/div><\/div><div class="rhythm-score-overlay">/);
  assert.match(html, /aria-label="关闭练习结果"/);
  assert.match(withoutSvg(html), /data-passed="true">通过/);
});

test("听写小节反馈与导航同步，未验证或清除后不显示结果", () => {
  const render = (measureFeedback) => renderToStaticMarkup(createElement(RhythmDraftScore, {
    measures: [[], [], []], timeSignature: { beats: 4, beatType: 4 }, selectedMeasureIndex: 1, measureFeedback,
  }));
  const html = render(["incorrect", "correct", "unchecked"]);
  assert.match(html, /aria-label="跳到小节 1，有错误"/);
  assert.match(html, /aria-label="跳到小节 2，正确" aria-pressed="true"/);
  assert.match(html, /aria-label="跳到小节 3"/);
  assert.equal((html.match(/class="draft-navigation-verdict"/g) ?? []).length, 2);
  assert.equal((html.match(/class="draft-measure-feedback"/g) ?? []).length, 2);
  const cleared = render(["unchecked", "correct", "unchecked"]);
  assert.doesNotMatch(cleared, /有错误|小节 1 验证结果/);
  assert.doesNotMatch(render(undefined), /data-verdict|draft-measure-feedback/);
});

test("首页独立展示三个平等入口，不显示预设主题或训练区", async () => {
  const html = await renderApp("/");
  assert.match(html, /<title>首页 · 节奏训练<\/title>/);
  assert.match(html, /aria-label="练习入口"/);
  assert.doesNotMatch(html, /home-rhythm-mark|home-intro|<h1>节奏训练<\/h1>/);
  assert.match(html, /<svg[^>]*class="brand-mark"[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.match(withoutSvg(html), /class="brand"[^>]*>节奏训练/);
  for (const description of ["按主题循序练习，逐步熟悉不同节奏", "选择想巩固的节奏，随机出题反复练习", "编写自己的节奏题目，保存后随时练习"]) {
    assert.ok(html.includes(description));
  }
  for (const path of ["preset", "random", "custom"]) assert.ok(html.includes(`href="/${path}"`));
  assert.match(html, /aria-current="page"[^>]*>首页/);
  assert.doesNotMatch(html, /topic-section|击拍训练区|节奏听写区/);
});

test("随机练习展示两个可用入口，几何游戏仅作未开放提示", async () => {
  const html = await renderApp("/random");
  assert.match(html, /href="\/random\/tapping"/);
  assert.match(html, /href="\/random\/dictation"/);
  assert.match(html, /<p class="mode-unavailable">几何游戏暂未开放<\/p>/);
  assert.doesNotMatch(html, /href="\/random\/geometry"/);
});

test("预设列表与详情都在 preset 下，旧 practice 地址不再兼容", async () => {
  const list = await renderApp("/preset");
  assert.match(list, /<h1>预设练习<\/h1>/);
  assert.match(list, /href="\/preset\/basic-values-01"/);
  assert.doesNotMatch(list, /href="\/practice\//);
  const detail = await renderApp("/preset/basic-values-01");
  assert.match(withoutSvg(detail), /href="\/preset"[^>]*>预设练习/);
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
    if (path === "/preset") {
      assert.equal((html.match(/aria-label="训练方式"/g) ?? []).length, 1);
      assert.match(html, /class="preset-question-heading"[^]*?aria-label="训练方式"[^]*?<\/header>\s*<section id="preset-question-list"/);
      assert.match(html, /aria-label="练习主题"/);
      assert.match(html, /<select/);
      assert.doesNotMatch(html, /几何游戏|未开放|href="\/preset\/eighths-01"/);
    }
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
  assert.doesNotMatch(tapping, /random-toolbar-actions|random-settings-drawer/);
  assert.doesNotMatch(await renderApp("/preset/dictation-basic-values-01"), /random-toolbar-actions|random-settings-drawer/);
  assert.match(tapping, /class="design-system practice-page"/);
  assert.doesNotMatch(tapping, /trainer-feedback|rhythm-score-overlay/);
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
    assert.doesNotMatch(html, /data-verdict=|rhythm-playback-status|dictation-completion/);
    assert.match(html, /data-action="play" data-source="question"/);
  }
  const customIndex = await renderApp("/custom");
  assert.match(customIndex, /class="design-system custom-index"/);
  assert.match(customIndex, /<p class="mode-unavailable">几何游戏暂未开放<\/p>/);
  assert.doesNotMatch(customIndex, /href="\/custom\/geometry"/);
  for (const path of ["/settings"]) {
    const html = await renderApp(path);
    assert.match(html, /class="site-header design-system"/);
    assert.match(html, /class="design-system settings-page"/);
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
  const html = await renderApp("/settings?category=appearance");
  assert.match(html, /class="design-system settings-page"/);
  assert.match(html, /aria-current="page" href="\/settings"/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, /紫色/);
  assert.match(html, /蓝色/);
  assert.match(html, /青绿色/);
  assert.match(html, /恢复默认/);
  assert.match(html, /class="settings-unavailable">未开放<\/span>/);
  assert.doesNotMatch(html, /请登录后/);
});

test("设置页提供五个分类，默认只展示账号内容", async () => {
  const html = await renderApp("/settings");
  for (const [id, title] of [
    ["account", "账号"], ["appearance", "外观"], ["local-data", "本地数据"],
    ["sound", "声音"], ["tapping-precision", "击拍精度"],
  ]) {
    const badge = id === "sound" ? '<span class="settings-unavailable">未开放</span>' : "";
    assert.match(withoutSvg(html), new RegExp(`<button[^>]*aria-pressed="${id === "account"}"[^>]*>${title}${badge}</button>`));
  }
  for (const id of ["local-data", "sound", "tapping-precision"]) {
    assert.doesNotMatch(html, new RegExp(`id="${id}-heading"`));
  }
  assert.match(html, /aria-label="设置分类"/);
  assert.match(html, /<h2 id="account-heading">账号<\/h2>/);
});

function renderSettings(state, error = "") {
  const auth = { state, error, busy: false, refresh() {}, login() {}, logout() {} };
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/settings?category=account"] }, createElement(SettingsPage, { auth })));
}

test("设置分类图标保留文字名称且不参与朗读", async () => {
  const cases = [
    [await renderApp("/settings?category=appearance"), ["账号", "外观", "本地数据", "声音未开放", "击拍精度"]],
  ];
  for (const [html, labels] of cases) {
    for (const label of labels) {
      const button = (html.match(/<button\b[^]*?<\/button>/g) ?? []).find(item => withoutSvg(item).replace(/<[^>]*>/g, "").trim() === label);
      assert.ok(button, label);
      assert.match(button, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    }
  }
});

test("账号设置统一承载会话状态、重试和退出，顶部不再显示登录入口", async () => {
  const checking = renderSettings({ status: "checking" });
  assert.match(checking, /正在确认登录/);
  assert.doesNotMatch(checking, /login-form/);
  const loggedIn = renderSettings({ status: "authenticated", user: { id: 1 } });
  assert.match(loggedIn, /已登录/);
  assert.match(loggedIn, /退出登录/);
  assert.doesNotMatch(loggedIn, /login-form/);
  const unavailable = renderSettings({ status: "unavailable" }, "无法确认退出结果。");
  assert.match(unavailable, /重新检查/);
  assert.match(unavailable, /无法确认退出结果/);
  assert.match(unavailable, /login-form/);
  const html = await renderApp("/settings");
  const header = html.match(/<header class="site-header[\s\S]*?<\/header>/)?.[0] ?? "";
  assert.doesNotMatch(header, /登录|退出|auth-status/);
});

test("登录表单保留标签、自动填充和反馈语义，未发送验证码时不能登录", async () => {
  const html = renderSettings({ status: "guest" });
  assert.match(html, /aria-label="登录"/);
  assert.match(html, /for="login-phone"/);
  assert.match(html, /type="tel"[^>]*autoComplete="tel-national"/);
  assert.match(html, /for="login-code"/);
  assert.match(html, /autoComplete="one-time-code"/);
  assert.match(html, /id="login-phone"[^>]*aria-invalid="false"/);
  assert.match(html, /id="login-code"[^>]*aria-invalid="false"/);
  assert.doesNotMatch(html, /id="login-(?:phone|code)-error"/);
  assert.match(html, /class="login-feedback"><p role="status"/);
  assert.match(withoutSvg(html), /<button type="submit" disabled="">登录/);
});

async function renderPage(path, route, auth = { state: { status: "guest" }, busy: false }, visits = null, state = null) {
  const stream = await renderToReadableStream(createElement(VisitsContext, { value: visits }, createElement(MemoryRouter, { initialEntries: [{ pathname: path, key: "test-visit", state }] },
    createElement(Routes, null,
      createElement(Route, { path: route, element: createElement(CustomPracticePage, { auth }) }),
    ),
  )));
  await stream.allReady;
  return new Response(stream).text();
}

test("工作区恢复听写答案、验证及设置但不恢复结果遮罩，账号来源隔离", () => {
  const visits = new PageVisits();
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: "note", noteValue: "whole" }] }] };
  const scope = "custom:account:1:account:dictation:item";
  visits.write("session", `practice:${scope}:settings`, { bpm: 97, metronomeEnabled: false });
  visits.write("session", `practice:${scope}:dictation`, {
    binding: dictationBinding(1, exercise),
    state: { answerMeasures: [exercise.measures[0].elements], selectedMeasureIndex: 0, playbackScope: "measure", measureVerdicts: ["correct"] },
  });
  function render(recoveryScope = scope, exerciseKey = 1) {
    return renderToStaticMarkup(createElement(VisitsContext, { value: visits },
      createElement(MemoryRouter, { initialEntries: [{ pathname: "/practice", key: "session" }] },
        createElement(PracticeWorkspace, { exercise, mode: "dictation", exerciseKey, recoveryScope }))));
  }
  const html = render();
  assert.match(html, /value="97"/);
  assert.match(html, /aria-label="节拍器" aria-pressed="false"/);
  assert.match(html, /type="checkbox" checked=""/);
  assert.match(html, /小节 1 验证结果/);
  assert.doesNotMatch(html, /关闭练习结果|预备拍：|停止题目|停止答案/);
  assert.doesNotMatch(render(scope, 2), /小节 1 验证结果/);
  const other = render("custom:account:2:account:dictation:item");
  assert.doesNotMatch(other, /小节 1 验证结果/);
  assert.match(other, /value="60"/);
});

test("原访问恢复草稿内容和生效设置，身份及模式不同不载入，清除后回到空草稿", async () => {
  const visits = new PageVisits();
  const draft = {
    name: "账号一草稿",
    measures: [[], [], [{ kind: "note", noteValue: "half" }]],
    selectedMeasureIndex: 2,
    settings: { bpm: 93, metronomeEnabled: false },
  };
  const field = "custom:account:1:tapping:draft";
  visits.write("test-visit", field, draft);
  const auth = { state: { status: "authenticated", user: { id: 1 } }, busy: false };
  const html = await renderPage("/custom/tapping/new", "/custom/:mode/new", auth, visits);
  assert.match(html, /value="账号一草稿"/);
  assert.match(html, /aria-label="当前小节数量">3/);
  assert.match(html, /aria-label="跳到小节 3" aria-pressed="true"/);
  assert.match(html, /aria-label="节拍器" aria-pressed="false"/);
  assert.match(html, /value="93"/);
  assert.doesNotMatch(html, /预备拍：|>停止<|正在保存/);
  for (const other of [
    { state: { status: "guest" }, busy: false },
    { state: { status: "authenticated", user: { id: 2 } }, busy: false },
  ]) {
    const isolated = await renderPage("/custom/tapping/new", "/custom/:mode/new", other, visits);
    assert.doesNotMatch(isolated, /账号一草稿/);
    assert.match(isolated, /aria-label="当前小节数量">2/);
  }
  const otherMode = await renderPage("/custom/dictation/new", "/custom/:mode/new", auth, visits);
  assert.doesNotMatch(otherMode, /账号一草稿/);
  visits.forget("test-visit", field, draft);
  const cleared = await renderPage("/custom/tapping/new", "/custom/:mode/new", auth, visits);
  assert.doesNotMatch(cleared, /账号一草稿/);
  assert.match(cleared, /aria-label="当前小节数量">2/);
});

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
    assert.match(html, /practice-layout--sidebar/);
  }
});

test("已保存列表链接到所属模式的题目", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}`, "/custom/:mode");
    assert.match(html, /class="design-system practice-page custom-library"/);
    assert.ok(html.includes(`href="/custom/${mode}/saved-${mode}"`));
    assert.match(html, /开始练习/);
    assert.doesNotMatch(html, /question-meta|4\/4 拍|\d+ 小节/);
    assert.match(html, /practice-titlebar custom-list-heading/);
    assert.match(html, /<section class="custom-catalog" aria-label="题目列表">[\s\S]*aria-label="已保存的自定义练习"/);
    assert.match(html.match(/<header class="practice-titlebar custom-list-heading">[\s\S]*?<\/header>/)?.[0] ?? "", /custom-new-link/);
    assert.doesNotMatch(html, /未开放|eyebrow/);
    assert.doesNotMatch(html, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/);
  }
});

test("保存返回仅突出匹配题目，失效保存标记不显示反馈", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}`, "/custom/:mode", undefined, null, { savedExerciseId: `saved-${mode}` });
    assert.equal((html.match(/data-just-saved="true"/g) ?? []).length, 1);
    assert.match(html, /class="custom-saved-notice" role="status">已保存/);
    const stale = await renderPage(`/custom/${mode}`, "/custom/:mode", undefined, null, { savedExerciseId: "missing" });
    assert.doesNotMatch(stale, /data-just-saved|custom-saved-notice/);
  }
});

test("账号列表等待远程响应，不读取本地题库", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  const html = await renderPage("/custom/tapping", "/custom/:mode", { state: { status: "authenticated", user: { id: 1 } }, busy: false });
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
  assert.match(html, /<h1>tapping题目<\/h1>/);
  assert.doesNotMatch(html, /class="eyebrow"/);
  assert.match(html, /tapping题目/);
});

test("编辑器不显示存储提示，登录状态未知时先确认草稿身份", async () => {
  for (const status of ["authenticated", "checking", "unavailable"]) {
    const html = await renderPage("/custom/tapping/new", "/custom/:mode/new", { state: { status, user: { id: 1 } }, busy: false });
    if (status === "authenticated") assert.match(html, /编辑自定义练习/);
    else {
      assert.doesNotMatch(html, /编辑自定义练习|保存练习/);
      assert.match(html, /正在确认登录|无法确认登录状态/);
    }
    assert.doesNotMatch(html, /class="custom-draft-notice"/);
  }
});

test("公共练习设置可从已生效快照初始化，不自动触发变化或播放", () => {
  let changes = 0;
  const html = renderToStaticMarkup(createElement(PracticeSettings, {
    initialValue: { bpm: 112, metronomeEnabled: false },
    onChange() { changes++; },
    children: value => createElement("output", null, JSON.stringify(value)),
  }));
  assert.match(html, /value="112"/);
  assert.match(html, /aria-label="节拍器" aria-pressed="false"/);
  assert.equal(changes, 0);
});

test("保存题目可按地址直接进入相应训练，共用 BPM 和节拍器", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}/saved-${mode}`, "/custom/:mode/:exerciseId");
    assert.ok(html.includes(`<h1>${mode}题目</h1>`));
    assert.ok(html.includes(`href="/custom/${mode}"`));
    assert.match(html, /aria-label="速度滑块"/);
    assert.doesNotMatch(html, /应用速度|未应用/);
    assert.match(html, /value="60"/);
    assert.match(html, /aria-label="节拍器" aria-pressed="true"/);
    assert.ok(html.includes(mode === "tapping" ? 'aria-label="击拍训练区"' : 'aria-label="节奏听写区"'));
    assert.doesNotMatch(html, /编辑自定义练习|保存练习/);
  }
});

test("题目不存在或模式不匹配不启动训练", async (t) => {
  mockSavedExercises(t, JSON.stringify({ version: 1, exercises: savedQuestions }));
  for (const id of ["missing", "saved-dictation"]) {
    const html = await renderPage(`/custom/tapping/${id}`, "/custom/:mode/:exerciseId");
    assert.match(html, /未找到该练习/);
    assert.match(withoutSvg(html), /href="\/custom\/tapping"[^>]*>题目列表/);
    assert.doesNotMatch(html, /击拍训练区|节奏听写区|速度滑块/);
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

test("模式列表保留新建入口，空存储引导创建", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
  t.after(() => previous ? Object.defineProperty(globalThis, "localStorage", previous) : delete globalThis.localStorage);
  for (const mode of ["tapping", "dictation"]) {
    const html = await renderPage(`/custom/${mode}`, "/custom/:mode");
    assert.ok(html.includes(`href="/custom/${mode}/new"`));
    assert.match(html, /还没有练习，点击上方「新建练习」开始创建。/);
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
  assert.doesNotMatch(html, /custom-time-signature|class="eyebrow"/);
  assert.ok(html.indexOf('class="custom-save-button"') < html.indexOf('class="practice-body"'));
  assert.ok(html.indexOf('aria-label="练习设置"') < html.indexOf('aria-label="小节数量"'));
  assert.match(html, /practice-layout--sidebar/);
  assert.doesNotMatch(html, /class="custom-draft-notice"/);
  assert.match(html, /添加休止符/);
  assert.match(html, /保存练习/);
  assert.match(html, /aria-label="速度滑块"/);
  assert.doesNotMatch(html, /应用速度|未应用/);
  assert.match(html, /value="60"/);
  assert.match(html, /aria-label="节拍器" aria-pressed="true"/);
  assert.match(withoutSvg(html), /<button[^>]*disabled=""[^>]*>试听<\/button>/);
  assert.doesNotMatch(html, /验证当前小节|播放题目|播放我的答案|查看答案/);
  assert.doesNotMatch(html, /rhythm-playback-status/);
  assert.doesNotMatch(html, /practice-layout--stacked/);
});

test("公共速度控件提供整数滑块与数值输入，不再要求点击应用", () => {
  const html = renderToStaticMarkup(createElement(PracticeSettings, { children: () => null }));
  assert.match(html, /type="range" min="40" max="240" step="1" aria-label="速度滑块" aria-valuetext="60 BPM"/);
  assert.match(html, /type="number" min="40" max="240" step="1"/);
  assert.match(html, /aria-hidden="true" title="慢"><svg[^>]*focusable="false"/);
  assert.match(html, /aria-hidden="true" title="快"><svg[^>]*focusable="false"/);
  assert.doesNotMatch(html, /🐢|🐇/);
  assert.match(html, /class="tempo-value"><input[^>]*aria-label="速度 BPM"[^>]*\/><label[^>]*class="unit">BPM<\/label><\/div>/);
  assert.equal((html.match(/>BPM<\/label>/g) ?? []).length, 1);
  assert.doesNotMatch(html, />速度\s/);
  assert.doesNotMatch(html, /应用速度|未应用|aria-invalid="true"/);
  assert.match(html, /<button[^>]*aria-label="节拍器" aria-pressed="true"/);
  assert.match(html, /class="metronome-pendulum" transform="rotate\(0 40 76\)"/);
  assert.doesNotMatch(html, /metronome-toggle|type="checkbox"/);
});

test("预设与随机击拍都有题目，侧栏布局将操作按钮放在谱面之前", async () => {
  for (const path of ["/preset/basic-values-01", "/random/tapping"]) {
    const html = await renderApp(path);
    assert.match(html, /practice-layout--sidebar/);
    const actions = html.indexOf('class="trainer-actions"');
    const score = html.indexOf('aria-label="节奏乐谱"');
    assert.ok(actions >= 0 && actions < score);
    assert.doesNotMatch(html, /trainer-feedback|试听中|试听结束|trainer-result|trainer-countdown/);
    const toolbar = html.indexOf('class="practice-toolbar"');
    const body = html.indexOf('class="practice-body"');
    assert.ok(toolbar < actions && actions < body);
    assert.doesNotMatch(html, /keyboard-hint|键敲击/);
    assert.ok(html.indexOf('aria-label="练习设置"') > body);
    assert.equal((html.match(/aria-label="速度 BPM"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-label="节拍器"/g) ?? []).length, 1);
  }
  for (const path of ["/preset/dictation-basic-values-01", "/random/dictation"]) {
    const html = await renderApp(path);
    assert.match(html, /practice-layout--sidebar/);
    assert.doesNotMatch(html, /practice-layout--stacked/);
    const body = html.indexOf('class="practice-body"');
    assert.ok(html.indexOf('aria-label="播放范围"') < body);
    assert.match(html, /class="dictation-scope-toggle"><input type="checkbox"/);
    assert.match(html, /仅播放当前小节/);
    assert.doesNotMatch(html, /dictation-scope-options|class="dictation-scope-toggle"><input[^>]*checked/);
    assert.doesNotMatch(html, /class="dictation-scope-toggle"><input[^>]*disabled/);
    assert.ok(html.indexOf('data-source="question"') < body);
    assert.ok(html.indexOf('aria-label="练习设置"') > body);
    assert.equal((html.match(/aria-label="速度 BPM"/g) ?? []).length, 1);
  }
});

test("谱面临时提示位于滚动内容之外，省略提示时不渲染浮层", () => {
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [
    { elements: [{ kind: "note", noteValue: "whole" }] },
  ] };
  const props = { exercise, timeline: createExerciseTimeline(exercise, 60, 4, { perfectMs: 50, hitMs: 150 }),
    activeEventIndex: null, timingEvents: [], playback: null };
  const plain = renderToStaticMarkup(createElement(RhythmScore, props));
  assert.doesNotMatch(plain, /rhythm-score-overlay/);
  const html = renderToStaticMarkup(createElement(RhythmScore, { ...props,
    overlay: createElement("span", null, "临时提示"),
  }));
  assert.match(html, /aria-label="节奏乐谱"[^>]*><div><\/div><\/div><div class="rhythm-score-overlay"><span>临时提示<\/span><\/div><\/div>/);
  assert.match(html, /class="rhythm-score-stage"/);
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
