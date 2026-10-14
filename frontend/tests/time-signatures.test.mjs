import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const model = await server.ssrLoadModule("/src/rhythm/RhythmModel.ts");
const timing = await server.ssrLoadModule("/src/rhythm/RhythmTiming.ts");
const { appendRhythmInput } = await server.ssrLoadModule("/src/practice/RhythmEditorInput.ts");
const { generateRandomExercise } = await server.ssrLoadModule("/src/exercises/randomExercises.ts");
const quarter = { kind: "note", noteValue: "quarter" };
const windows = { perfectMs: 50, hitMs: 150 };
for (const beats of [2, 3, 4]) {
  const timeSignature = { beats, beatType: 4 };
  const elements = Array.from({ length: beats }, () => ({ ...quarter }));
  const exercise = { timeSignature, measures: [{ elements }, { elements }] };
  test(`${beats}/4 保存模型、输入容量、预备拍、完整与局部时间线`, () => {
    assert.deepEqual(model.parseRhythmExercise(exercise), exercise);
    assert.equal(appendRhythmInput(elements, [quarter], timeSignature), null);
    assert.deepEqual(appendRhythmInput(elements.slice(1), [quarter], timeSignature), elements);
    for (const bpm of [60, 120]) {
      const beatMs = 60000 / bpm;
      const line = timing.createExerciseTimeline(exercise, bpm, undefined, windows);
      assert.equal(line.durationMs, beats * 2 * beatMs);
      assert.equal(line.countInDurationMs, beats * beatMs);
      assert.equal(line.countInOffsetsMs.length, beats);
      assert.deepEqual(line.targetTaps.map(t => t.offsetMs), Array.from({ length: beats * 2 }, (_, i) => i * beatMs));
      const local = timing.createExerciseTimeline(exercise, bpm, undefined, windows, { startMeasure: 1, endMeasure: 2 });
      assert.equal(local.durationMs, beats * beatMs);
      assert.equal(local.targetTaps[0].offsetMs, 0);
      const draft = timing.createRhythmPlaybackTimeline([[], [quarter]], timeSignature, bpm);
      assert.equal(draft.durationMs, beats * 2 * beatMs);
      assert.equal(draft.notes[0].startOffsetMs, beats * beatMs);
    }
    for (const count of [beats - 1, beats + 1]) {
      assert.throws(() => model.parseRhythmExercise({ timeSignature, measures: [{ elements: Array(count).fill(quarter) }] }), /第 1 小节/);
    }
  });
  test(`${beats}/4 随机生成可容纳普通音符、附点、休止及三连音`, () => {
    for (const materials of [["quarter-note"], ["eighth-triplet"], ["sixteenth-rest"], ["dotted-quarter-note", "eighth-note"], ["whole-note", "half-note", "quarter-note"]]) {
      for (const value of [0, 0.49, 0.999]) {
        const result = generateRandomExercise({ timeSignature, mode: "tapping", measureCount: 4, materials }, () => value);
        assert.deepEqual(result.timeSignature, timeSignature);
        assert.equal(result.measures.length, 4);
        assert.doesNotThrow(() => model.validateRhythmExercise(result));
      }
    }
    if (beats < 4) assert.throws(() => generateRandomExercise({ timeSignature, mode: "dictation", measureCount: 1, materials: ["whole-note"] }), /无法填满/);
  });
}
test("拍号必须明确提供且受支持，不猜测或转换旧格式", () => {
  for (const timeSignature of [undefined, { beats: 6, beatType: 8 }, { beats: 5, beatType: 4 }, { beats: "3", beatType: 4 }]) {
    assert.throws(() => model.getMeasureTicks(timeSignature));
    assert.throws(() => generateRandomExercise({ timeSignature, mode: "tapping", materials: ["quarter-note"], measureCount: 1 }));
  }
});
