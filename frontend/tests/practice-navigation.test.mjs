import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { historicalStatus, recordKey } = await server.ssrLoadModule("/src/practice-records/practiceRecords.ts");
const { ExerciseHistory } = await server.ssrLoadModule("/src/practice-records/ExerciseHistory.tsx");
const { RecordAccessContext } = await server.ssrLoadModule("/src/practice-records/recordAccess.ts");
const { PresetQuestionNavigation } = await server.ssrLoadModule("/src/practice/PresetQuestionNavigation.tsx");
const { canUsePracticeShortcut, practiceShortcutAction } = await server.ssrLoadModule("/src/practice/usePracticeShortcuts.ts");
const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: "note", noteValue: "whole" }] }] };

test("快捷键映射 H/L/S/P/N，旧映射不再生效", () => {
  for (const [code, action] of Object.entries({ KeyH: "practice", KeyL: "listen", KeyS: "stop", KeyP: "previous", KeyN: "next", KeyA: "answer", KeyV: "verify", KeyR: "reference" })) {
    assert.equal(practiceShortcutAction(code), action);
  }
  for (const code of ["Escape", "ArrowLeft", "ArrowRight", "Space"]) assert.equal(practiceShortcutAction(code), undefined);
});

test("听写播放与验证按钮显示共享键位，通用编辑播放器默认不启用快捷键", async () => {
  const { RhythmDictation } = await server.ssrLoadModule("/src/practice/RhythmDictation.tsx");
  const { default: Playback } = await server.ssrLoadModule("/src/practice/RhythmPlayback.tsx");
  const html = renderToStaticMarkup(createElement(RhythmDictation, { exercise, bpm: 60 }));
  assert.match(html, /title="播放题目（L）" aria-keyshortcuts="L"/);
  assert.match(html, /title="播放我的答案（A）" aria-keyshortcuts="A" disabled=""/);
  assert.match(html, /title="验证当前小节（V）" aria-keyshortcuts="V"/);
  assert.match(html, /title="查看答案（R）" aria-keyshortcuts="R"/);
  const editor = renderToStaticMarkup(createElement(Playback, {
    options: [{ id: "preview", label: "试听", stopLabel: "停止", measures: exercise.measures.map(item => item.elements) }],
    timeSignature: exercise.timeSignature, bpm: 60,
  }));
  assert.doesNotMatch(editor, /aria-keyshortcuts/);
});

test("快捷键说明只展示当前工作区支持的操作", async () => {
  const { default: Help } = await server.ssrLoadModule("/src/practice/PracticeShortcutHelp.tsx");
  const render = (mode, source) => renderToStaticMarkup(createElement(Help, { mode, source }));
  const tapping = render("tapping", "preset");
  for (const key of ["H", "L", "S", "P", "N", "空格"]) assert.ok(tapping.includes(">" + key + "<"));
  const random = render("dictation", "random");
  assert.match(random, /换一题/);
  assert.doesNotMatch(random, /上一题|击拍练习/);
  const dictation = render("dictation", "custom");
  for (const key of ["L", "A", "S", "V", "R"]) assert.ok(dictation.includes(">" + key + "<"));
  assert.doesNotMatch(tapping, /查看答案|返回作答/);
  assert.doesNotMatch(dictation, /上一题|下一题|击拍练习/);
  assert.doesNotMatch(render("tapping", "custom"), /上一题|下一题/);
});

test("历史成就保留已通过，与最后一次结果无关；听写优先显示独立完成", () => {
  assert.equal(historicalStatus(), "");
  assert.equal(historicalStatus({ mode: "tapping", attempts: [{ passed: false }] }), "");
  assert.equal(historicalStatus({ mode: "tapping", attempts: [{ passed: true }, { passed: false }] }), "已通过");
  assert.equal(historicalStatus({ mode: "dictation", attempts: [{ completedAt: null, viewedAnswer: true }] }), "");
  assert.equal(historicalStatus({ mode: "dictation", attempts: [{ completedAt: "now", viewedAnswer: true }] }), "已完成");
  assert.equal(historicalStatus({ mode: "dictation", attempts: [{ completedAt: "now", viewedAnswer: false }, { completedAt: "later", viewedAnswer: true }] }), "已独立完成");
});

test("两种练习通过工具栏插槽组合说明，不提供时不出现快捷键入口", async () => {
  const { default: Trainer } = await server.ssrLoadModule("/src/practice/RhythmTrainer.tsx");
  const { RhythmDictation } = await server.ssrLoadModule("/src/practice/RhythmDictation.tsx");
  const { default: Help } = await server.ssrLoadModule("/src/practice/PracticeShortcutHelp.tsx");
  for (const [Component, mode] of [[Trainer, "tapping"], [RhythmDictation, "dictation"]]) {
    const props = { exercise: null, bpm: 60 };
    assert.doesNotMatch(renderToStaticMarkup(createElement(Component, props)), /查看快捷键/);
    const html = renderToStaticMarkup(createElement(Component, {
      ...props,
      toolbarEnd: createElement(Help, { mode, source: "preset" }),
    }));
    assert.equal((html.match(/aria-label="查看快捷键"/g) ?? []).length, 1);
    assert.ok(html.indexOf('aria-label="查看快捷键"') < html.indexOf('class="practice-body"'));
  }
});

test("不读取游客历史时，历史插槽仍保留题名与题头操作", async () => {
  const { PracticeHeading } = await server.ssrLoadModule("/src/practice/PracticeHeading.tsx");
  const html = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(RecordAccessContext, { value: "account" },
      createElement(PracticeHeading, {
        backTo: "/preset", backLabel: "预设练习", title: "四分音符",
        history: { context: { source: "preset", exerciseId: "one", title: "四分音符" }, exercise, mode: "tapping" },
      }, createElement("button", null, "下一题")))));
  assert.match(html, /<h1>四分音符<\/h1>/);
  assert.match(html, /下一题/);
  assert.doesNotMatch(html, /练习历史|已通过/);
});

test("题头历史匹配隔离来源、模式、随机题 ID 和内容版本", () => {
  const context = { source: "preset", exerciseId: "one", title: "题目" };
  const key = recordKey(context, exercise, "tapping");
  assert.notEqual(key, recordKey(context, exercise, "dictation"));
  assert.notEqual(key, recordKey({ ...context, source: "custom" }, exercise, "tapping"));
  assert.notEqual(recordKey({ ...context, source: "random" }, exercise, "tapping"), recordKey({ ...context, source: "random", exerciseId: "two" }, exercise, "tapping"));
  assert.notEqual(key, recordKey(context, { ...exercise, measures: [...exercise.measures, ...exercise.measures] }, "tapping"));
});

test("预设导航不越过传入主题边界，首尾禁用；单题两侧均禁用", () => {
  const render = (ids, id) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PresetQuestionNavigation, { questions: ids.map(id => ({ id })), questionId: id })));
  assert.match(render(["a", "b"], "a"), /disabled=""[^>]*title="上一题/);
  assert.doesNotMatch(render(["a", "b"], "a"), /disabled=""[^>]*title="下一题/);
  assert.match(render(["a", "b"], "b"), /disabled=""[^>]*title="下一题/);
  assert.equal((render(["a"], "a").match(/disabled=""/g) ?? []).length, 2);
});

test("非游客不读取本地历史；读取失败不能显示成暂无记录", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let reads = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { reads++; throw new Error("blocked"); } });
  try {
    const render = access => renderToStaticMarkup(createElement(RecordAccessContext, { value: access }, createElement(ExerciseHistory, { context: { source: "preset", exerciseId: "a", title: "题目" }, exercise, mode: "tapping", children: ({ action }) => action })));
    for (const access of ["checking", "account", "unavailable"]) assert.equal(render(access), "");
    assert.equal(reads, 0);
    const html = render("guest");
    assert.match(html, /历史读取失败/);
    assert.match(html, /重试读取/);
    assert.doesNotMatch(html, /暂无记录/);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("快捷键避开弹窗、输入控件、组合输入、长按与系统修饰键", () => {
  const previousDocument = globalThis.document;
  const previousElement = globalThis.HTMLElement;
  let modal = false;
  let popover = false;
  class Element { isContentEditable = false; closest() { return null; } }
  globalThis.document = { querySelector: selector => (selector.includes("popover") ? popover : modal) ? {} : null };
  globalThis.HTMLElement = Element;
  try {
    assert.equal(canUsePracticeShortcut({}), true);
    for (const flag of ["defaultPrevented", "repeat", "isComposing", "ctrlKey", "metaKey", "shiftKey", "altKey"]) assert.equal(canUsePracticeShortcut({ [flag]: true }), false);
    modal = true;
    assert.equal(canUsePracticeShortcut({}), false);
    modal = false;
    popover = true;
    assert.equal(canUsePracticeShortcut({}), false);
    popover = false;
    const target = new Element();
    target.isContentEditable = true;
    assert.equal(canUsePracticeShortcut({ target }), false);
    target.isContentEditable = false;
    target.closest = () => ({});
    assert.equal(canUsePracticeShortcut({ target }), false);
  } finally { globalThis.document = previousDocument; globalThis.HTMLElement = previousElement; }
});
