import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let editor;
try {
  editor = await server.ssrLoadModule("/src/practice/RhythmEditor.tsx");
} finally {
  await server.close();
}

test("编辑器支持五种音符和休止符，以及四分、八分音符的单附点", () => {
  for (const kind of ["note", "rest"]) {
    for (const noteValue of ["whole", "half", "quarter", "eighth", "sixteenth"]) {
      assert.equal(editor.canEditRhythmElements([{ kind, noteValue }]), true);
      assert.equal(editor.canEditRhythmElements([{ kind, noteValue, dots: 1 }]),
        kind === "note" && ["quarter", "eighth"].includes(noteValue));
    }
  }
});

test("编辑器支持非拍头三连音，拒绝不支持的组内容；检查不修改草稿", () => {
  const note = { kind: "note", noteValue: "eighth" };
  const triplet = { kind: "triplet", notes: [note, note, note] };
  const elements = [note, triplet];
  const before = structuredClone(elements);
  assert.equal(editor.canEditRhythmElements(elements), true);
  for (const notes of [[note, note], [note, note, { ...note, kind: "rest" }],
    [note, note, { ...note, dots: 1 }], [note, note, { ...note, noteValue: "quarter" }]]) {
    assert.equal(editor.canEditRhythmElements([{ kind: "triplet", notes }]), false);
  }
  assert.deepEqual(elements, before);
  assert.equal(editor.canEditRhythmElements([]), true);
});

test("无小节时显示调用方的空态，保留但禁用输入，不触发修改或选择", () => {
  const html = renderToStaticMarkup(createElement(editor.RhythmEditor, {
    measures: [],
    timeSignature: { beats: 4, beatType: 4 },
    selectedMeasureIndex: 0,
    emptyContent: createElement("p", null, "请先生成题目"),
    onChange: () => assert.fail("不得修改"),
    onSelectMeasure: () => assert.fail("不得选择"),
  }));
  assert.match(html, /请先生成题目/);
  assert.doesNotMatch(html, /rhythm-answer-notation/);
  const buttons = html.match(/<button\b[^>]*>/g);
  assert.equal(buttons.length, 14);
  assert.ok(buttons.every((button) => button.includes('disabled=""')));
});

test("清空按钮只在当前小节有内容时可用，不受其他小节内容影响", () => {
  const note = { kind: "note", noteValue: "quarter" };
  for (const [measures, selectedMeasureIndex, disabled] of [
    [[], 0, true], [[[], [note]], 0, true], [[[], [note]], 1, false],
    [[[note], []], 0, false], [[[note], []], 1, true],
  ]) {
    const html = renderToStaticMarkup(createElement(editor.RhythmEditor, {
      measures, selectedMeasureIndex, timeSignature: { beats: 4, beatType: 4 },
      onChange: () => assert.fail("渲染不应清空"), onSelectMeasure: () => {},
    }));
    const button = html.match(/<button\b[^>]*>清空当前小节<\/button>/)[0];
    assert.equal(button.includes('disabled=""'), disabled);
  }
});

test("符号按钮保留中文名称和提示，装饰图形不代替按钮的可访问名称", () => {
  const html = renderToStaticMarkup(createElement(editor.RhythmEditor, {
    measures: [[]], timeSignature: { beats: 4, beatType: 4 }, selectedMeasureIndex: 0,
    onChange: () => assert.fail("渲染不得修改草稿"), onSelectMeasure: () => {},
  }));
  for (const label of ["全音符", "二分音符", "四分音符", "八分音符", "十六分音符",
    "全休止符", "二分休止符", "四分休止符", "八分休止符", "十六分休止符", "小三连"]) {
    assert.match(html, new RegExp(`<button[^>]*aria-label="${label}"[^>]*title="${label}"[^>]*><span[^>]*aria-hidden="true"`));
    assert.doesNotMatch(html, new RegExp(`>${label}</button>`));
  }
  assert.match(html, /aria-label="附点"[^>]*disabled=""[^>]*aria-pressed="false"/);
  assert.match(html, />删除末尾<\/button>/);
  assert.equal((html.match(/class="rhythm-symbol"/g) ?? []).length, 12);
  assert.doesNotMatch(html, /rhythm-editor-row-label/);
  assert.match(html, /role="group" aria-label="添加音符"/);
  assert.match(html, /role="group" aria-label="添加休止符"/);
});

test("附点改为符号后仍按末尾音符控制禁用状态", () => {
  for (const [event, disabled, pressed] of [
    [{ kind: "note", noteValue: "quarter" }, false, false],
    [{ kind: "note", noteValue: "eighth" }, false, false],
    [{ kind: "rest", noteValue: "quarter" }, true, false],
  ]) {
    const html = renderToStaticMarkup(createElement(editor.RhythmEditor, {
      measures: [[event]], timeSignature: { beats: 4, beatType: 4 }, selectedMeasureIndex: 0,
      onChange: () => {}, onSelectMeasure: () => {},
    }));
    const button = html.match(/<button[^>]*aria-label="附点"[^>]*>/)[0];
    assert.equal(button.includes('disabled=""'), disabled);
    assert.ok(button.includes(`aria-pressed="${pressed}"`));
  }
});
