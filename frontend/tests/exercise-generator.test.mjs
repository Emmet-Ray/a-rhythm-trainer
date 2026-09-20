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
let randomMaterials;
let validateRhythmExercise;
try {
  ({ generateRandomExercise, resolveRandomPatterns, randomMaterials } = await server.ssrLoadModule("/src/exercises/randomExercises.ts"));
  ({ validateRhythmExercise } = await server.ssrLoadModule("/src/rhythm/RhythmModel.ts"));
} finally {
  await server.close();
}


const config = (materials, measureCount = 2, mode = "tapping") => ({ materials, measureCount, mode });
const basic = ["whole-note", "half-note", "quarter-note"];

test("每个范围只启用对应材料，组合无需勾选基础音符，重复选择不增加权重", () => {
  for (const material of randomMaterials) {
    const resolved = resolveRandomPatterns(config([material.id]));
    assert.deepEqual(resolved.map(p => p.id), [material.id]);
    assert.deepEqual(resolved[0].elements, material.elements);
    assert.deepEqual(resolveRandomPatterns(config([material.id, material.id])), resolved);
  }
  assert.deepEqual(resolveRandomPatterns(config(basic)).map(p => p.id), basic);
  assert.equal(randomMaterials.length, 23);
  assert.equal(new Set(randomMaterials.map(p => p.id)).size, randomMaterials.length);
});

test("普通音符与休止符独立选择，附点、反附点及三连音定义准确", () => {
  const first = id => resolveRandomPatterns(config([id]))[0];
  assert.deepEqual(first("eighth-note").elements, [{ kind: "note", noteValue: "eighth" }]);
  assert.deepEqual(first("sixteenth-rest").elements, [{ kind: "rest", noteValue: "sixteenth" }]);
  assert.deepEqual(first("dotted-quarter-note").elements, [{ kind: "note", noteValue: "quarter", dots: 1 }]);
  assert.deepEqual(first("eighth-dotted-quarter").elements, [
    { kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "quarter", dots: 1 },
  ]);
  assert.deepEqual(first("sixteenth-dotted-eighth").elements, [
    { kind: "note", noteValue: "sixteenth" }, { kind: "note", noteValue: "eighth", dots: 1 },
  ]);
  assert.deepEqual(first("eighth-triplet").elements, [{ kind: "triplet", notes: Array.from({ length: 3 }, () => ({ kind: "note", noteValue: "eighth" })) }]);
});

test("解析精确时值和合法拍位，不共享材料快照且不依赖练习模式", () => {
  const input = Object.freeze(config(Object.freeze(randomMaterials.map(p => p.id)), 4));
  const first = resolveRandomPatterns(input);
  const expected = structuredClone(first);
  assert.deepEqual(first.find(p => p.id === "half-note").startTicks, [0, 48]);
  assert.deepEqual(first.find(p => p.id === "eighth-rest").startTicks, [0, 12, 24, 36, 48, 60, 72, 84]);
  assert.equal(first.find(p => p.id === "dotted-quarter-note").durationTicks, 36);
  assert.equal(first.find(p => p.id === "dotted-eighth-note").durationTicks, 18);
  assert.ok(first.every(p => p.startTicks.every(t => Number.isInteger(t) && t + p.durationTicks <= 96)));
  first[0].elements[0].dots = 1;
  first[0].startTicks.push(99);
  assert.deepEqual(resolveRandomPatterns(input), expected);
  assert.deepEqual(resolveRandomPatterns({ ...input, mode: "dictation" }), expected);
});

test("无法满拍时明确报错且不调用随机源，不隐式补入未选择材料", () => {
  for (const materials of [["dotted-quarter-note"], ["dotted-eighth-note"], ["dotted-quarter-note", "dotted-eighth-note"]]) {
    assert.throws(() => generateRandomExercise(config(materials), () => assert.fail("不可完成配置不能随机")), /无法填满/);
  }
  for (const materials of [["dotted-quarter-note", "eighth-note"], ["dotted-eighth-note", "sixteenth-note"]]) {
    assert.doesNotThrow(() => validateRhythmExercise(generateRandomExercise(config(materials), () => 0)));
  }
});

test("非法配置在生成前拒绝", () => {
  const valid = config(basic);
  for (const input of [null, {}, { ...valid, mode: "geometry" }, { ...valid, materials: [] },
    { ...valid, materials: ["unknown"] }, { ...valid, materials: "quarter-note" }, { ...valid, measureCount: 3 }]) {
    assert.throws(() => resolveRandomPatterns(input));
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

test("全部单项、两两组合与固定种子混合范围，均只使用所选材料生成满拍题目", () => {
  const ids = randomMaterials.map(p => p.id);
  const selections = ids.map(id => [id]);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) selections.push([ids[i], ids[j]]);
  const random = seededRandom(17);
  for (let i = 0; i < 100; i++) selections.push(ids.filter(() => random() < 0.5));
  for (const selection of selections) {
    const materials = resolveRandomPatterns(config(selection));
    // 独立地穷举可达终点，区分不可满拍配置和生成器错误。
    const reachable = new Set([0]);
    for (let tick = 0; tick < 96; tick++) if (reachable.has(tick)) {
      for (const p of materials) if (p.startTicks.includes(tick) && tick + p.durationTicks <= 96) reachable.add(tick + p.durationTicks);
    }
    for (const mode of ["tapping", "dictation"]) for (const count of [1, 2, 4]) {
      const input = config(selection, count, mode);
      if (!reachable.has(96)) {
        assert.throws(() => generateRandomExercise(input), /无法填满/);
        continue;
      }
      const result = generateRandomExercise(input, seededRandom(count));
      assert.equal(result.measures.length, count);
      assert.doesNotThrow(() => validateRhythmExercise(result));
      for (const { elements } of result.measures) {
        function matches(index, tick) {
          if (index === elements.length) return tick === 96;
          return materials.some(p => p.startTicks.includes(tick)
            && JSON.stringify(elements.slice(index, index + p.elements.length)) === JSON.stringify(p.elements)
            && matches(index + p.elements.length, tick + p.durationTicks));
        }
        assert.ok(matches(0, 0), "输出必须可分解为所选材料，且起点合法");
      }
    }
  }
});

test("随机数首尾边界、单独节奏型以及纯休止符", () => {
  assert.deepEqual(generateRandomExercise(config(basic), () => 0).measures[0].elements, [{ kind: "note", noteValue: "whole" }]);
  assert.equal(generateRandomExercise(config(basic), () => 0.999999).measures[0].elements.length, 4);
  const eighths = generateRandomExercise(config(["two-eighths"]), () => 0);
  assert.equal(eighths.measures[0].elements.length, 8);
  assert.ok(eighths.measures[0].elements.every(e => e.kind === "note" && e.noteValue === "eighth"));
  const rests = generateRandomExercise(config(["sixteenth-rest"]), () => 0);
  assert.equal(rests.measures[0].elements.length, 16);
  assert.ok(rests.measures[0].elements.every(e => e.kind === "rest" && e.noteValue === "sixteenth"));
});

test("可复现且配置、小节、三连音和下一次生成之间没有可变对象共享", () => {
  const input = Object.freeze(config(Object.freeze(["eighth-triplet"]), 2, "dictation"));
  const first = generateRandomExercise(input, seededRandom(42));
  const expected = structuredClone(first);
  first.measures[0].elements[0].notes[0].noteValue = "quarter";
  assert.equal(first.measures[0].elements[1].notes[0].noteValue, "eighth");
  assert.equal(first.measures[1].elements[0].notes[0].noteValue, "eighth");
  assert.deepEqual(generateRandomExercise(input, seededRandom(42)), expected);
  const mixed = config(randomMaterials.map(p => p.id));
  assert.deepEqual(generateRandomExercise(mixed, seededRandom(12)), generateRandomExercise(mixed, seededRandom(12)));
});

test("随机源非法值明确报错", () => {
  assert.throws(() => generateRandomExercise(config([]), () => assert.fail("无效配置不能调用随机源")), /至少选择/);
  for (const value of [-0.1, 1, NaN, Infinity, undefined, "0"]) {
    assert.throws(() => generateRandomExercise(config(basic), () => value), /随机数必须/);
  }
});

test("随机页面首次进入已有默认两小节题目，设置关闭且入口为换一题", async () => {
  const pageServer = await createServer({ configFile: false,
    server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { default: RandomPracticePage } = await pageServer.ssrLoadModule("/src/pages/RandomPracticePage.tsx");
    const { VisitsContext } = await pageServer.ssrLoadModule("/src/navigation/usePageNavigation.ts");
    const { PageVisits } = await pageServer.ssrLoadModule("/src/navigation/PageVisits.ts");
    for (const mode of ["tapping", "dictation"]) {
      const visits = new PageVisits();
      const tree = createElement(VisitsContext.Provider, { value: visits },
        createElement(MemoryRouter, { initialEntries: [`/random/${mode}`] },
          createElement(Routes, null, createElement(Route, { path: "/random/:mode", element: createElement(RandomPracticePage) }))));
      const stream = await renderToReadableStream(tree);
      await stream.allReady;
      const html = await new Response(stream).text();
      for (const topic of randomMaterials) assert.ok(html.includes(topic.label));
      const fieldset = html.match(/<fieldset class="random-material-group"[\s\S]*?<\/fieldset>/)[0];
      assert.equal((fieldset.match(/checked=""/g) ?? []).length, 3);
      assert.match(fieldset, /全音符/);
      assert.equal((html.match(/class="random-material-group"/g) ?? []).length, 3);
      assert.equal((html.match(/type="checkbox"/g) ?? []).length, randomMaterials.length + (mode === "dictation" ? 1 : 0));
      const drawer = html.match(/<dialog[^]*?<\/dialog>/)[0];
      assert.doesNotMatch(drawer, /生成题目|<form|type="submit"/);
      assert.ok(drawer.indexOf('class="measure-count"') < drawer.indexOf('class="random-material-group"'));
      const counts = html.match(/<fieldset class="measure-count"[\s\S]*?<\/fieldset>/)[0];
      assert.equal((counts.match(/type="radio"/g) ?? []).length, 3);
      assert.equal((counts.match(/checked=""/g) ?? []).length, 1);
      assert.match(counts, /checked="" value="2"/);
      assert.match(html, /换一题/);
      assert.doesNotMatch(html, /生成题目|空白节奏乐谱/);
      assert.doesNotMatch(drawer, /<dialog[^>]*\sopen(?:\s|=|>)/);
      assert.match(html, /<dialog[^>]*class="design-system random-settings-drawer"[^>]*aria-labelledby=/);
      assert.match(html, /aria-label="关闭生成设置"/);
      assert.match(html, /class="practice-question-actions text-actions"/);
      assert.match(html, /aria-haspopup="dialog"/);
      assert.ok(html.indexOf("</dialog>") < html.indexOf('class="practice-question-actions text-actions"'));
      assert.match(html, /aria-label="速度滑块"/);
      assert.doesNotMatch(html, /应用速度|未应用/);
      assert.match(html, /节拍器/);
      assert.doesNotMatch(html, /固定示例|重新生成/);
      const question = visits.read("default", `random:${mode}:question`, null);
      assert.match(question.id, /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
      assert.equal(question.exercise.measures.length, 2);
      assert.doesNotThrow(() => validateRhythmExercise(question.exercise));
      // 返回时即使设置已清空，也必须恢复原题，不能尝试用待应用配置重新生成。
      visits.write("default", `random:${mode}:config`, config([], 4, mode));
      const restored = await renderToReadableStream(tree);
      await restored.allReady;
      await new Response(restored).text();
      assert.equal(visits.read("default", `random:${mode}:question`, null), question);
    }
  } finally { await pageServer.close(); }
});
