import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
let randomExerciseSimilarity;
let randomMaterials;
let validateRhythmExercise;
try {
  ({ generateRandomExercise, resolveRandomPatterns, randomMaterials, randomExerciseSimilarity } = await server.ssrLoadModule("/src/exercises/randomExercises.ts"));
  ({ validateRhythmExercise } = await server.ssrLoadModule("/src/rhythm/RhythmModel.ts"));
} finally {
  await server.close();
}


const config = (materials, measureCount = 2, mode = "tapping") => ({ materials, measureCount, mode, timeSignature: { beats: 4, beatType: 4 } });
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
  for (const value of [0, 0.999999]) {
    const result = generateRandomExercise(config(basic), () => value);
    assert.deepEqual(new Set(result.measures.flatMap(m => m.elements.map(e => e.noteValue))), new Set(["whole", "half", "quarter"]));
  }
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
      const stream = await renderToReadableStream(createElement(QueryClientProvider, { client: new QueryClient() }, tree));
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
      const restored = await renderToReadableStream(createElement(QueryClientProvider, { client: new QueryClient() }, tree));
      await restored.allReady;
      await new Response(restored).text();
      assert.equal(visits.read("default", `random:${mode}:question`, null), question);
    }
  } finally { await pageServer.close(); }
});


test("覆盖整道题；能全部覆盖时不遗漏，容纳不下时不固定偏向目录首项", () => {
  const alternatives = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const one = generateRandomExercise(config(["whole-note", "quarter-note"], 1), seededRandom(seed * 10007));
    alternatives.add(one.measures[0].elements[0].noteValue);
    const two = generateRandomExercise(config(["whole-note", "quarter-note"], 2), seededRandom(seed));
    assert.deepEqual(new Set(two.measures.flatMap(m => m.elements.map(e => e.noteValue))), new Set(["whole", "quarter"]));
    const mixed = generateRandomExercise(config(["quarter-note", "two-eighths", "small-syncopation"], 1), seededRandom(seed));
    const values = mixed.measures[0].elements.map(e => e.noteValue).join(',');
    assert.ok(values.includes('sixteenth,eighth,sixteenth'), "小切分必须整体出现");
    assert.ok(values.includes('eighth,eighth'), "二平均必须整体出现");
    assert.ok(values.includes('quarter'));
  }
  assert.deepEqual(alternatives, new Set(["whole", "quarter"]));
});

test("独立穷举小范围合法组合，验证整题覆盖数确为最大值", () => {
  const selections = [
    ["whole-note", "half-note", "quarter-note"],
    ["half-note", "dotted-quarter-note", "eighth-rest", "quarter-note"],
    ["quarter-note", "two-eighths", "eighth-note", "small-syncopation"],
    ["dotted-eighth-note", "sixteenth-rest", "eighth-triplet"],
  ];
  for (const beats of [2, 3, 4]) for (const count of [1, 2]) for (const materials of selections) {
    const input = { ...config(materials, count), timeSignature: { beats, beatType: 4 } };
    const patterns = resolveRandomPatterns(input);
    const capacity = beats * 24;
    const fullMasks = new Set();
    function enumerate(tick, used) {
      if (tick === capacity * count) { fullMasks.add(used); return; }
      for (let i = 0; i < patterns.length; i++) {
        const p = patterns[i];
        if (p.startTicks.includes(tick % capacity)) enumerate(tick + p.durationTicks, used | (1 << i));
      }
    }
    enumerate(0, 0);
    const bits = mask => mask.toString(2).replaceAll('0', '').length;
    const optimum = Math.max(...[...fullMasks].map(bits));
    if (!fullMasks.size) {
      assert.throws(() => generateRandomExercise(input), /无法填满/);
      continue;
    }
    for (let seed = 1; seed <= 3; seed++) {
      const result = generateRandomExercise(input, seededRandom(seed));
      // 从最终谱面独立反推所有合法材料分解，而非读取生成器内部的选择。
      let masks = new Set([0]);
      for (const measure of result.measures) {
        const next = new Set();
        function match(index, tick, used) {
          if (index === measure.elements.length) { next.add(used); return; }
          patterns.forEach((p, i) => {
            if (p.startTicks.includes(tick) && JSON.stringify(measure.elements.slice(index, index + p.elements.length)) === JSON.stringify(p.elements)) {
              match(index + p.elements.length, tick + p.durationTicks, used | (1 << i));
            }
          });
        }
        for (const mask of masks) match(0, 0, mask);
        masks = next;
      }
      assert.equal(Math.max(...[...masks].map(bits)), optimum);
    }
  }
});

const exerciseOf = (...measures) => ({ timeSignature: { beats: 4, beatType: 4 }, measures: measures.map(elements => ({ elements })) });
const note = (noteValue = "quarter", kind = "note", dots) => ({ kind, noteValue, ...(dots ? { dots } : {}) });

test("相似度按小节与展开事件比较，包含类型、附点实际时值、三连音及缺失元素", () => {
  const a = exerciseOf([note(), note(), note(), note('eighth'), note('eighth')]);
  const b = structuredClone(a); b.measures[0].elements[0].kind = 'rest';
  assert.equal(randomExerciseSimilarity(a, b), 0.8);
  assert.equal(randomExerciseSimilarity(a, a), 1);
  assert.equal(randomExerciseSimilarity(a, exerciseOf([note(), note(), note(), note()])), 3 / 5);
  assert.equal(randomExerciseSimilarity(exerciseOf([note('half'), note('half')]), exerciseOf([note('quarter', 'note', 1), note('quarter', 'note', 1)])), 0);
  const triplet = exerciseOf([{ kind: 'triplet', notes: [note('eighth'), note('eighth'), note('eighth')] }]);
  assert.equal(randomExerciseSimilarity(triplet, exerciseOf([note('eighth'), note('eighth'), note('eighth')])), 0);
  assert.equal(randomExerciseSimilarity(exerciseOf([note()], [note()]), exerciseOf([note()])), 0.5);
  assert.equal(randomExerciseSimilarity(a, { ...a, timeSignature: { beats: 3, beatType: 4 } }), 0);
  const paired = generateRandomExercise(config(['two-eighths'], 1), () => 0);
  const singles = generateRandomExercise(config(['eighth-note'], 1), () => 0);
  assert.equal(randomExerciseSimilarity(paired, singles), 1);
});

test("超过 80% 最多额外三次，全部超限时取最不相似候选，仍保持覆盖", () => {
  const input = config(['sixteenth-note', 'sixteenth-rest'], 1);
  const previous = generateRandomExercise(input, () => 0.99);
  function candidateTape(flips) {
    const tape = [];
    generateRandomExercise(input, () => { tape.push(0.99); return 0.99; });
    // 两种材料在每个位置均合法；改变后续随机排列，保留开头两种材料的覆盖。
    for (const index of flips) tape[index * 2] = 0;
    return tape;
  }
  const tapes = [candidateTape([]), candidateTape([3]), candidateTape([3, 5, 7]), candidateTape([3, 5])];
  const candidates = tapes.map(tape => { let i = 0; return generateRandomExercise(input, () => tape[i++]); });
  const stream = tapes.flat(); let calls = 0;
  const result = generateRandomExercise(input, () => { assert.ok(calls < stream.length, '不能第五次生成'); return stream[calls++]; }, previous);
  assert.equal(calls, stream.length);
  assert.deepEqual(result, candidates[2]);
  assert.equal(randomExerciseSimilarity(result, previous), 13 / 16);
  assert.deepEqual(new Set(result.measures[0].elements.map(e => e.kind)), new Set(['note', 'rest']));
});

test("达到 80% 即接受、首次不同不重试、只有一种结果也能结束", () => {
  const input = config(['quarter-note', 'eighth-note'], 1);
  let callsPerCandidate = 0;
  const candidate = generateRandomExercise(input, () => { callsPerCandidate++; return 0.99; });
  assert.equal(candidate.measures[0].elements.length, 5);
  const previous = structuredClone(candidate); previous.measures[0].elements[0].kind = 'rest';
  let calls = 0;
  assert.deepEqual(generateRandomExercise(input, () => { calls++; return 0.99; }, previous), candidate);
  assert.equal(calls, callsPerCandidate, '80% 不应重试');
  const only = config(['quarter-note'], 1);
  const same = generateRandomExercise(only, () => 0);
  let singleCalls = 0;
  assert.deepEqual(generateRandomExercise(only, () => { singleCalls++; return 0; }, same), same);
  assert.equal(singleCalls, 16, '四次候选后停止');
});
