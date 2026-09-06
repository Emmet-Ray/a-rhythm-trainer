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

test("前三个主题的 14 道题符合预设顺序，每小节四拍且时间线连续", () => {
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
  ];
  const symbols = { whole: "W", half: "H", quarter: "Q", eighth: "E" };
  const beats = { W: 4, H: 2, Q: 1, E: 0.5 };
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
        measure.events.map((event) => {
          assert.equal(event.kind, "note");
          return symbols[event.noteValue];
        }).join("")
      ), measures, question.id);
      for (const bpm of [60, 120]) {
        const beatMs = 60000 / bpm;
        let offset = 0;
        const expectedTargets = [];
        for (const measure of measures) {
          assert.equal([...measure].reduce((sum, symbol) => sum + beats[symbol], 0), 4);
          for (const symbol of measure) {
            expectedTargets.push(offset);
            offset += beats[symbol] * beatMs;
          }
        }
        const timeline = timing.createExerciseTimeline(question.exercise, bpm, 3, { perfectMs: 50, hitMs: 150 });
        assert.equal(timeline.finishOffsetMs, measures.length * 4 * beatMs);
        assert.deepEqual(timeline.targetTaps.map((target) => target.offsetMs), expectedTargets);
        assert.deepEqual(timeline.targetTaps.map((target) => target.eventIndex), expectedTargets.map((_, i) => i));
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
      else assert.deepEqual(group.questions, []);
    }
  }
});

test("查找题目按实际所属模式返回，而不是默认当作击拍题", () => {
  const topic = catalog.presetTopics[0];
  const group = topic.modes.find((group) => group.mode === "dictation");
  const question = {
    id: "test-dictation", title: "听写测试题", description: "",
    exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [
      { events: [{ kind: "note", noteValue: "whole" }] },
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
