import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let generateRandomExercise;
let resolveRandomPatterns;
let randomTopics;
let validateRhythmExercise;
try {
  ({ generateRandomExercise, resolveRandomPatterns, randomTopics } = await server.ssrLoadModule("/src/exercises/randomExercises.ts"));
  ({ validateRhythmExercise } = await server.ssrLoadModule("/src/rhythm/RhythmModel.ts"));
} finally {
  await server.close();
}

test("主题材料严格按选择启用，跨主题组合要求双方同时选中", () => {
  const get = (topics) => resolveRandomPatterns({ mode: "tapping", topics, measureCount: 2 });
  assert.deepEqual(get(["basic-notes"]).map(p => p.id), ["whole-note", "half-note", "quarter-note"]);
  assert.deepEqual(get(["eighth-notes"]).map(p => p.id), ["two-eighths"]);
  const rests = get(["rests"]);
  assert.equal(rests.length, 4);
  assert.ok(rests.every(p => p.elements.every(e => e.kind === "rest")));
  const mixed = get(["eighth-notes", "rests"]);
  assert.equal(mixed.length, 7);
  assert.ok(mixed.some(p => p.id === "eighth-note-rest"));
  assert.ok(mixed.some(p => p.id === "eighth-rest-note"));
  assert.deepEqual(get(["rests", "eighth-notes", "rests"]), mixed);
});

test("材料提供精确时值与拍位，每次解析返回独立快照且不依赖模式", () => {
  const config = Object.freeze({ mode: "tapping", topics: Object.freeze(randomTopics.map(t => t.id)), measureCount: 4 });
  const first = resolveRandomPatterns(config);
  const expected = structuredClone(first);
  assert.equal(new Set(first.map(p => p.id)).size, first.length);
  assert.deepEqual(first.map(p => p.durationTicks), [96, 48, 24, 24, 96, 48, 24, 12, 24, 24]);
  assert.deepEqual(first.find(p => p.id === "half-note").startTicks, [0, 48]);
  assert.deepEqual(first.find(p => p.id === "eighth-rest").startTicks, [0, 12, 24, 36, 48, 60, 72, 84]);
  assert.ok(first.every(p => p.startTicks.every(t => Number.isInteger(t) && t + p.durationTicks <= 96)));
  first[0].elements[0].dots = 1;
  first[0].startTicks.push(99);
  assert.deepEqual(resolveRandomPatterns(config), expected);
  assert.deepEqual(resolveRandomPatterns({ ...config, mode: "dictation" }), expected);
});

test("随机规则拒绝空主题、未知主题、非法模式与小节数", () => {
  const valid = { mode: "tapping", topics: ["basic-notes"], measureCount: 2 };
  for (const config of [null, {}, { ...valid, mode: "geometry" }, { ...valid, topics: [] },
    { ...valid, topics: ["unknown"] }, { ...valid, topics: "rests" }, { ...valid, measureCount: 3 }]) {
    assert.throws(() => resolveRandomPatterns(config));
  }
  for (const measureCount of [1, 2, 4]) assert.doesNotThrow(() => resolveRandomPatterns({ ...valid, measureCount }));
});

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("所有主题组合、模式和长度均生成满拍且由合法拍位材料组成的题目", () => {
  for (let mask = 1; mask < 8; mask++) {
    const topics = randomTopics.filter((_, i) => mask & (1 << i)).map(t => t.id);
    for (const mode of ["tapping", "dictation"]) for (const measureCount of [1, 2, 4]) {
      const config = { mode, topics, measureCount };
      const materials = resolveRandomPatterns(config);
      for (let seed = 0; seed < 20; seed++) {
        const result = generateRandomExercise(config, seededRandom(seed));
        assert.equal(result.measures.length, measureCount);
        assert.doesNotThrow(() => validateRhythmExercise(result));
        for (const { elements } of result.measures) {
          function matches(index, tick) {
            if (index === elements.length) return tick === 96;
            return materials.some(p => p.startTicks.includes(tick)
              && JSON.stringify(elements.slice(index, index + p.elements.length)) === JSON.stringify(p.elements)
              && matches(index + p.elements.length, tick + p.durationTicks));
          }
          assert.ok(matches(0, 0), "输出必须可分解为所选材料，且每份材料起点合法");
        }
      }
    }
  }
});

test("随机数边界选择首尾候选，只选二平均保持整组，休止符可填半拍", () => {
  const basic = { mode: "tapping", topics: ["basic-notes"], measureCount: 1 };
  assert.deepEqual(generateRandomExercise(basic, () => 0).measures[0].elements, [{ kind: "note", noteValue: "whole" }]);
  assert.equal(generateRandomExercise(basic, () => 0.999999).measures[0].elements.length, 4);
  const eighths = generateRandomExercise({ ...basic, topics: ["eighth-notes"] }, () => 0);
  assert.equal(eighths.measures[0].elements.length, 8);
  assert.ok(eighths.measures[0].elements.every(e => e.kind === "note" && e.noteValue === "eighth"));
  const rests = generateRandomExercise({ ...basic, topics: ["rests"] }, () => 0.999999);
  assert.equal(rests.measures[0].elements.length, 8);
  assert.ok(rests.measures[0].elements.every(e => e.kind === "rest" && e.noteValue === "eighth"));
});

test("固定随机序列可复现，配置不变且不同题目、小节、材料不共享对象", () => {
  const config = Object.freeze({ mode: "dictation", topics: Object.freeze(["eighth-notes"]), measureCount: 2 });
  const first = generateRandomExercise(config, seededRandom(42));
  const second = generateRandomExercise(config, seededRandom(42));
  assert.deepEqual(first, second);
  first.measures[0].elements[0].dots = 1;
  assert.equal(first.measures[0].elements[2].dots, undefined);
  assert.equal(first.measures[1].elements[0].dots, undefined);
  assert.deepEqual(generateRandomExercise(config, seededRandom(42)), second);
  const mixed = { ...config, topics: ["basic-notes", "eighth-notes", "rests"] };
  assert.deepEqual(generateRandomExercise(mixed, seededRandom(12)), generateRandomExercise(mixed, seededRandom(12)));
});

test("配置先校验，随机源返回非法值时明确报错", () => {
  assert.throws(() => generateRandomExercise({ mode: "tapping", topics: [], measureCount: 1 }, () => {
    assert.fail("无效配置不能调用随机源");
  }), /至少选择/);
  const config = { mode: "tapping", topics: ["basic-notes"], measureCount: 1 };
  for (const value of [-0.1, 1, NaN, Infinity, undefined, "0"]) {
    assert.throws(() => generateRandomExercise(config, () => value), /随机数必须/);
  }
});

test("随机页面默认基础主题与两小节，主题选项来自目录，生成前保留空训练区", async () => {
  const pageServer = await createServer({ configFile: false,
    server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { default: RandomPracticePage } = await pageServer.ssrLoadModule("/src/pages/RandomPracticePage.tsx");
    for (const mode of ["tapping", "dictation"]) {
      const stream = await renderToReadableStream(createElement(MemoryRouter, { initialEntries: [`/random/${mode}`] },
        createElement(Routes, null, createElement(Route, { path: "/random/:mode", element: createElement(RandomPracticePage) }))));
      await stream.allReady;
      const html = await new Response(stream).text();
      for (const topic of randomTopics) assert.ok(html.includes(topic.label));
      const fieldset = html.match(/<fieldset[\s\S]*?<\/fieldset>/)[0];
      assert.equal((fieldset.match(/checked=""/g) ?? []).length, 1);
      assert.match(fieldset, /checked=""[^>]*\/>全音符、二分音符、四分音符/);
      assert.match(html, /value="2" selected=""/);
      assert.match(html, /生成题目/);
      assert.match(html, /应用速度/);
      assert.match(html, /节拍器/);
      assert.doesNotMatch(html, /固定示例|重新生成/);
    }
  } finally { await pageServer.close(); }
});
