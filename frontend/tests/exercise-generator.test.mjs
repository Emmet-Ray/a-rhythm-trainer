import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let generateExercise;
let validateRhythmExercise;
try {
  ({ generateExercise } = await server.ssrLoadModule("/src/exercises/randomExercises.ts"));
  ({ validateRhythmExercise } = await server.ssrLoadModule("/src/rhythm/RhythmModel.ts"));
} finally {
  await server.close();
}

for (const [mode, expected] of [
  ["tapping", [["quarter", "quarter", "quarter", "quarter"], ["half", "quarter", "quarter"]]],
  ["dictation", [["half", "quarter", "quarter"], ["whole"]]],
]) {
  test(`${mode} 基础规则返回固定的合法两小节练习，不修改配置`, () => {
    const config = Object.freeze({ mode, rule: "basic" });
    const exercise = generateExercise(config);
    assert.deepEqual(exercise.timeSignature, { beats: 4, beatType: 4 });
    assert.deepEqual(exercise.measures.map(m => m.elements.map(e => e.noteValue)), expected);
    assert.ok(exercise.measures.every(m => m.elements.every(e => e.kind === "note")));
    assert.doesNotThrow(() => validateRhythmExercise(exercise));
    assert.deepEqual(config, { mode, rule: "basic" });
  });

  test(`${mode} 重复生成内容一致，修改结果不影响其他或后续生成`, () => {
    const config = { mode, rule: "basic" };
    const first = generateExercise(config);
    const second = generateExercise(config);
    const original = structuredClone(second);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.notEqual(first.timeSignature, second.timeSignature);
    first.timeSignature.beats = 3;
    first.measures[0].elements[0].dots = 1;
    first.measures[0].elements.pop();
    first.measures.pop();
    assert.deepEqual(second, original);
    assert.deepEqual(generateExercise(config), original);
  });
}

test("不支持的生成配置明确报错，不回退到固定题目", () => {
  for (const config of [undefined, null, {}, { mode: "geometry", rule: "basic" }, { mode: "unknown", rule: "basic" }]) {
    assert.throws(() => generateExercise(config), /只支持击拍或节奏听写/);
  }
  for (const config of [{ mode: "tapping" }, { mode: "dictation", rule: "unknown" }]) {
    assert.throws(() => generateExercise(config), /只支持 basic/);
  }
});
