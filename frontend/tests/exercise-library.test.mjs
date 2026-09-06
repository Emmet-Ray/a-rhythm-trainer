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
  for (const id of ["", "missing", "QUARTERS", "../quarters"]) {
    assert.equal(catalog.findPresetQuestion(id), undefined);
  }
  assert.deepEqual(catalog.presetTopics, before);
});

test("七道预设迁移后保留原有节奏时值与敲击目标", () => {
  const expected = {
    quarters: [4000, [0, 1000, 2000, 3000]],
    eighths: [4000, [0, 1000, 2000, 3000, 3500]],
    rests: [4000, [0, 2000, 3000]],
    halves: [4000, [0, 2000]],
    whole: [4000, [0]],
    "two-measures": [8000, [0, 2000, 4000]],
    "three-measures": [12000, Array.from({ length: 12 }, (_, i) => i * 1000)],
  };
  const questions = catalog.presetTopics.flatMap((topic) => topic.modes.flatMap((group) => group.questions));
  assert.deepEqual(questions.map((q) => q.id).sort(), Object.keys(expected).sort());
  for (const question of questions) {
    assert.equal(catalog.findPresetQuestion(question.id).mode, "tapping");
    const timeline = timing.createExerciseTimeline(question.exercise, 60, 3, { perfectMs: 50, hitMs: 150 });
    assert.equal(timeline.finishOffsetMs, expected[question.id][0]);
    assert.deepEqual(timeline.targetTaps.map((target) => target.offsetMs), expected[question.id][1]);
    for (const measure of timeline.measures) {
      assert.equal(measure.endOffsetMs - measure.startOffsetMs, 4000);
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
    assert.equal(catalog.findPresetQuestion("quarters").mode, "tapping");
  } finally {
    group.questions.pop();
  }
});
