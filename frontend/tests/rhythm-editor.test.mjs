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
  assert.equal(buttons.length, 13);
  assert.ok(buttons.every((button) => button.includes('disabled=""')));
});
