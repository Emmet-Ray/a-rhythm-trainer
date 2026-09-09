import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let catalog;
let timing;
try {
  catalog = await server.ssrLoadModule("/src/data/presetExercises.ts");
  timing = await server.ssrLoadModule("/src/RhythmTiming.ts");
} finally {
  await server.close();
}

test("练习库的主题与题目 ID 唯一，所有题目都能按地址 ID 找回", () => {
  const topicIds = new Set();
  const questionIds = new Set();
  for (const topic of catalog.presetTopics) {
    assert.ok(!topicIds.has(topic.id));
    topicIds.add(topic.id);
    const modes = new Set();
    for (const group of topic.modes) {
      assert.ok(!modes.has(group.mode));
      modes.add(group.mode);
      assert.ok(catalog.practiceModes.some((mode) => mode.id === group.mode));
      for (const question of group.questions) {
        assert.match(question.id, /^[a-z0-9-]+$/);
        assert.ok(!questionIds.has(question.id));
        questionIds.add(question.id);
        const found = catalog.findPresetQuestion(question.id);
        assert.equal(found.topic, topic);
        assert.equal(found.mode, group.mode);
        assert.equal(found.question, question);
      }
    }
    assert.equal(modes.size, 3);
  }
});

test("未知题目 ID 不回退到默认题，查找不修改内容", () => {
  const before = structuredClone(catalog.presetTopics);
  for (const id of ["", "missing", "QUARTERS", "../quarters", "quarters", "eighths", "rests", "halves", "whole", "two-measures", "three-measures", "eighth-notes-02"]) {
    assert.equal(catalog.findPresetQuestion(id), undefined);
  }
  assert.deepEqual(catalog.presetTopics, before);
});

test("十三个主题的 58 道题符合预设顺序，每小节四拍且时间线连续", () => {
  // 独立列出出题稿，避免仅校验总时长而漏掉音符顺序错误。
  const expected = [
    ["basic-values", [
      "QQQQ | QQQQ", "QQH | W", "QQQQ | HQQ | W | QQH",
    ]],
    ["eighth-notes", [
      "Q Q EE EE | EE Q EE Q",
      "EE Q Q Q | Q EE Q Q | Q Q EE Q | Q Q Q EE",
      "EE EE Q Q | Q EE EE Q | Q Q EE EE | Q Q Q Q",
      "EE Q EE Q | Q EE Q EE | EE Q Q EE | Q Q Q Q",
      "Q EE EE EE | EE Q EE EE | EE EE Q EE | EE EE EE Q",
      "Q EE Q Q | EE EE Q Q | Q EE Q EE | EE EE EE EE",
    ]],
    ["mixed-values-1", [
      "H EE EE | H Q EE | H EE Q | H Q Q",
      "EE EE H | Q EE H | EE Q H | Q Q H",
      "W | EE EE EE EE | W | Q EE Q EE",
      "Q Q Q Q | EE EE EE EE | H H | Q EE Q EE",
      "Q Q Q Q | Q EE Q EE | H EE Q | EE Q H | W | EE EE Q Q | Q Q EE EE | H Q Q",
    ]],
    ["rests", [
      "Q RQ Q RQ | Q Q Q Q",
      "H RH | RH H | Q Q Q Q",
      "W | RW | H H | Q Q Q Q",
      "Q Q E RE Q | Q Q RE E Q | E RE Q RE E Q | Q Q Q Q",
      "H RH | RQ Q EE Q | W | RW | RE E Q E RE Q | Q Q Q Q",
    ]],
    ["dotted-quarters", [
      "Q. E Q Q | Q Q Q Q",
      "Q. E Q Q | Q Q Q. E | Q Q. E Q | Q Q Q Q",
      "Q. E Q. E | Q. E EE Q | EE Q Q. E | Q Q Q Q",
      "H Q. E | Q. E H | W | Q Q. E Q | Q. E Q. E | Q Q Q Q",
    ]],
    ["syncopation", [
      "Q Q Q Q | E Q E Q Q",
      "E Q E Q Q | Q Q E Q E | E Q E E Q E",
      "EE EE Q Q | E Q E Q Q | Q Q EE EE | Q Q E Q E",
      "H E Q E | E Q E H | W | Q E Q E Q | E Q E E Q E | Q Q Q Q",
    ]],
    ["mixed-values-2", [
      "Q. E Q Q | E Q E Q Q",
      "Q. E E Q E | E Q E Q Q | H E Q E | Q. E H",
      "RQ E Q E Q | Q. E RQ Q | RH E Q E | E Q E Q RQ",
      "H E Q E | Q. E EE Q | E Q E Q Q | W | RE E E Q E Q | Q Q Q Q",
    ]],
    ["sixteenth-notes", [
      "EE EE Q Q | SSSS SSSS Q Q",
      "ESS Q ESS Q | ESS ESS ESS ESS",
      "SSE Q SSE Q | Q SSE Q SSE | SSE SSE Q Q",
      "ESS SSE Q Q | SSE ESS Q Q | SSSS ESS SSE Q | ESS SSE SSSS Q",
      "Q Q EE EE | SSSS SSSS SSSS SSSS | ESS Q SSE Q | SSE ESS SSSS EE | H ESS SSE | ESS SSE EE Q",
    ]],
    ["dotted-eighths", [
      "EE Q EE Q | E.S Q E.S Q",
      "E.S Q Q Q | Q E.S Q Q | Q Q E.S E.S",
      "E.S ESS Q Q | ESS E.S Q Q | E.S E.S SSE Q | SSSS E.S EE Q",
      "H E.S Q | E.S ESS SSE Q | W | Q E.S Q E.S | E.S E.S E.S E.S | EE EE Q Q",
    ]],
    ["small-syncopation", [
      "EE Q EE Q | SES Q SES Q",
      "SES Q Q Q | Q SES Q Q | Q Q SES SES",
      "SSSS SES Q Q | SES SSSS Q Q | ESS SES SSE Q | SES SES EE Q",
      "H H | SES Q SES Q | W | Q SES SSE ESS | SES SES SES SES | EE EE Q Q",
    ]],
    ["mixed-values-3", [
      "E.S Q SES Q | SES Q E.S Q",
      "ESS SSE E.S SES | SES E.S SSE ESS | H SSSS EE | E.S SES Q Q",
      "RQ SES E.S Q | E.S RE E SES Q | RH ESS SSE | SES Q RQ Q",
      "Q. E ESS SSE | E Q E E.S SES | SSSS ESS SSE Q | W | RE E SES E.S Q | E.S SES EE Q",
    ]],
    ["eighth-triplets", [
      "Q Q Q Q | T Q T Q",
      "T Q Q Q | Q T Q Q | Q Q T T",
      "EE T EE T | T EE T EE | T T T T | Q Q Q Q",
      "SSSS T Q Q | T SSSS Q Q | ESS T SSE T | T ESS T SSE",
      "H H | T T Q Q | W | Q T Q T | T T T T | EE T SSSS Q",
    ]],
    ["mixed-values-4", [
      "EE T Q Q | SSSS T EE Q",
      "Q. E T Q | E Q E T Q | T Q. E Q | T E Q E Q",
      "E.S SES T Q | T ESS SSE Q | SES T E.S EE | SSSS T ESS SSE",
      "RQ T EE Q | RH T Q | RW | T E.S SES Q | RE E T ESS Q",
      "W | H T EE | Q. E E Q E | SSSS ESS SSE T | E.S SES T Q | RE E T RQ Q",
    ]],
  ];
  const symbols = { whole: "W", half: "H", quarter: "Q", eighth: "E", sixteenth: "S" };
  const beats = { W: 4, H: 2, Q: 1, E: 0.5, S: 0.25 };
  assert.deepEqual(catalog.presetTopics.map((topic) => topic.id), expected.map(([id]) => id));
  for (const [topicIndex, [topicId, patterns]] of expected.entries()) {
    const questions = catalog.presetTopics[topicIndex].modes.find((group) => group.mode === "tapping").questions;
    assert.equal(questions.length, patterns.length);
    for (const [index, pattern] of patterns.entries()) {
      const question = questions[index];
      assert.equal(question.id, `${topicId}-${String(topicId === "eighth-notes" && index >= 1 ? index + 2 : index + 1).padStart(2, "0")}`);
      assert.deepEqual(question.exercise.timeSignature, { beats: 4, beatType: 4 });
      const measures = pattern.replaceAll(" ", "").split("|");
      assert.deepEqual(question.exercise.measures.map((measure) =>
        measure.elements.map((event) => {
          if (event.kind === "triplet") {
            assert.deepEqual(event.notes, Array.from({length: 3}, () => ({kind: "note", noteValue: "eighth"})));
            return "T";
          }
          assert.ok(event.kind === "note" || event.kind === "rest");
          assert.ok(event.dots === undefined || event.dots === 0 || event.dots === 1);
          return `${event.kind === "rest" ? "R" : ""}${symbols[event.noteValue]}${event.dots === 1 ? "." : ""}`;
        }).join("")
      ), measures, question.id);
      for (const bpm of [60, 120]) {
        const beatMs = 60000 / bpm;
        let offsetTicks = 0;
        const expectedTargets = [];
        const expectedIndexes = [];
        let eventIndex = 0;
        for (const measure of measures) {
          const tokens = measure.match(/T|R?[WHQES]\.?/g);
          assert.equal(tokens.join(""), measure);
          let measureBeats = 0;
          for (const token of tokens) {
            if (token === "T") {
              assert.equal(offsetTicks % 24, 0, question.id);
              for (let i = 0; i < 3; i++) {
                expectedTargets.push((offsetTicks + i * 8) / 24 * beatMs);
                expectedIndexes.push(eventIndex++);
              }
              offsetTicks += 24;
              measureBeats += 1;
              continue;
            }
            const duration = beats[token.replace("R", "").replace(".", "")] * (token.endsWith(".") ? 1.5 : 1);
            if (!token.startsWith("R")) {
              expectedTargets.push(offsetTicks / 24 * beatMs);
              expectedIndexes.push(eventIndex);
            }
            offsetTicks += duration * 24;
            measureBeats += duration;
            eventIndex++;
          }
          assert.equal(measureBeats, 4, question.id);
        }
        const timeline = timing.createExerciseTimeline(question.exercise, bpm, 3, { perfectMs: 50, hitMs: 150 });
        assert.equal(timeline.finishOffsetMs, Math.max(
          measures.length * 4 * beatMs,
          expectedTargets.length > 0 ? expectedTargets.at(-1) + 150 : 0,
        ));
        assert.deepEqual(timeline.targetTaps.map((target) => target.offsetMs), expectedTargets);
        assert.deepEqual(timeline.targetTaps.map((target) => target.eventIndex), expectedIndexes);
        assert.deepEqual(timeline.measures.map((measure) => [measure.startOffsetMs, measure.endOffsetMs]),
          measures.map((_, i) => [i * 4 * beatMs, (i + 1) * 4 * beatMs]));
      }
    }
  }
});

test("每个主题拥有独立的模式题库，未开放模式不复制击拍题目", () => {
  const lists = new Set();
  for (const topic of catalog.presetTopics) {
    for (const group of topic.modes) {
      assert.ok(!lists.has(group.questions));
      lists.add(group.questions);
      if (group.mode === "tapping") assert.ok(group.questions.length > 0);
      else if (!catalog.practiceModes.find((mode) => mode.id === group.mode).available) {
        assert.deepEqual(group.questions, []);
      }
    }
  }
});

test("基础听写题包含两小节三种音符，时间线连续且归属于听写", () => {
  const { topic, mode, question } = catalog.findPresetQuestion("dictation-basic-values-01");
  assert.equal(topic.id, "basic-values");
  assert.equal(mode, "dictation");
  assert.deepEqual(question.exercise.measures.map(({ elements }) => elements.map((event) => event.noteValue)),
    [["half", "quarter", "quarter"], ["whole"]]);
  const timeline = timing.createExerciseTimeline(question.exercise, 60, 3, { perfectMs: 50, hitMs: 150 });
  assert.deepEqual(timeline.targetTaps.map((target) => target.offsetMs), [0, 2000, 3000, 4000]);
  assert.deepEqual(timeline.eventEndOffsetsMs, [2000, 3000, 4000, 8000]);
  assert.equal(timeline.finishOffsetMs, 8000);
});

test("查找题目按实际所属模式返回，而不是默认当作击拍题", () => {
  const topic = catalog.presetTopics[0];
  const group = topic.modes.find((group) => group.mode === "dictation");
  const question = {
    id: "test-dictation", title: "听写测试题", description: "",
    exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [
      { elements: [{ kind: "note", noteValue: "whole" }] },
    ] },
  };
  // 仅测试夹具临时增加一题，确保新模式的查询路径可用。
  group.questions.push(question);
  try {
    assert.deepEqual(catalog.findPresetQuestion(question.id), { topic, mode: "dictation", question });
    assert.equal(catalog.findPresetQuestion("basic-values-01").mode, "tapping");
  } finally {
    group.questions.pop();
  }
});
