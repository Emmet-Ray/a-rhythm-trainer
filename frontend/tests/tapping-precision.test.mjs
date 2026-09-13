import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const preference = await server.ssrLoadModule("/src/settings/tappingPrecision.ts");
const timing = await server.ssrLoadModule("/src/rhythm/RhythmTiming.ts");

function storage(t, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value });
  t.after(() => previous
    ? Object.defineProperty(globalThis, "localStorage", previous)
    : delete globalThis.localStorage);
}

test("击拍精度默认标准；恢复三档、损坏值回退且不自动写存储", t => {
  let value = null;
  storage(t, { getItem: () => value, setItem: () => assert.fail("读取不应覆盖偏好") });
  for (const [input, expected] of [
    [null, "standard"], ["relaxed", "relaxed"], ["standard", "standard"], ["strict", "strict"],
    ["", "standard"], ["unknown", "standard"], ['{"hitMs":9999}', "standard"],
  ]) {
    value = input;
    assert.deepEqual(preference.initializeTappingPrecision(), { precision: expected, storageAvailable: true });
  }
});

test("保存和恢复默认只修改击拍精度，不影响主题、本地练习或账号数据", t => {
  const values = new Map([
    ["rhythm-trainer.appearance", "teal"],
    ["rhythm-trainer.custom-exercises", "untouched"],
  ]);
  storage(t, { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  preference.initializeTappingPrecision();
  assert.deepEqual(preference.selectTappingPrecision("strict"), { precision: "strict", storageAvailable: true });
  assert.equal(preference.initializeTappingPrecision().precision, "strict");
  preference.selectTappingPrecision(preference.DEFAULT_TAPPING_PRECISION);
  assert.equal(preference.initializeTappingPrecision().precision, "standard");
  assert.equal(values.get("rhythm-trainer.appearance"), "teal");
  assert.equal(values.get("rhythm-trainer.custom-exercises"), "untouched");
  assert.equal(values.size, 3);
});

test("存储不可用时默认标准，保存失败仍跨页面保留本次选择", t => {
  storage(t, {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("quota"); },
  });
  assert.deepEqual(preference.initializeTappingPrecision(), { precision: "standard", storageAvailable: false });
  assert.deepEqual(preference.selectTappingPrecision("relaxed"), { precision: "relaxed", storageAvailable: false });
  assert.equal(preference.getTappingPrecision().precision, "relaxed");
  assert.deepEqual(preference.getTappingTimingWindows(), { perfectMs: 80, hitMs: 200 });
  assert.equal(preference.initializeTappingPrecision().precision, "standard");
});

test("访问存储本身抛错时选择仍可用，非法选择回退标准", t => {
  storage(t, null);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
  assert.equal(preference.initializeTappingPrecision().storageAvailable, false);
  assert.equal(preference.selectTappingPrecision("strict").precision, "strict");
  assert.equal(preference.selectTappingPrecision("invalid").precision, "standard");
});

test("每轮读取独立窗口快照，后续选择和调用方修改不污染已开始或下一轮", t => {
  storage(t, { getItem: () => "standard", setItem() {} });
  preference.initializeTappingPrecision();
  const round = preference.getTappingTimingWindows();
  preference.selectTappingPrecision("strict");
  assert.deepEqual(round, { perfectMs: 50, hitMs: 150 });
  assert.deepEqual(preference.getTappingTimingWindows(), { perfectMs: 30, hitMs: 100 });
  round.hitMs = 999;
  assert.deepEqual(preference.getTappingTimingWindows("standard"), { perfectMs: 50, hitMs: 150 });
});

test("三档分别应用完美边界、命中左闭右开边界；标准保持原有参数", () => {
  const expected = { relaxed: [80, 200], standard: [50, 150], strict: [30, 100] };
  const targets = [{ eventIndex: 0, offsetMs: 1000 }];
  for (const [id, [perfectMs, hitMs]] of Object.entries(expected)) {
    const windows = preference.getTappingTimingWindows(id);
    assert.deepEqual(windows, { perfectMs, hitMs });
    for (const [error, grade] of [[-perfectMs, "perfect"], [perfectMs, "perfect"], [-perfectMs - 1, "early"], [perfectMs + 1, "late"]]) {
      assert.equal(timing.evaluateTap(targets, 0, 1000 + error, windows).events.at(-1).grade, grade);
    }
    assert.equal(timing.evaluateTap(targets, 0, 1000 - hitMs, windows).events.at(-1).kind, "hit");
    assert.equal(timing.evaluateTap(targets, 0, 1000 - hitMs - 1, windows).events.at(-1).kind, "wrongTap");
    assert.equal(timing.evaluateTap(targets, 0, 1000 + hitMs - 1, windows).events.at(-1).kind, "hit");
    assert.deepEqual(timing.evaluateTap(targets, 0, 1000 + hitMs, windows).events.map(event => event.kind), ["miss", "wrongTap"]);
  }
});

test("不同档位不改音符起止、预备拍和 BPM；结束时间覆盖本档最后命中窗口", () => {
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [
    { elements: Array.from({ length: 16 }, () => ({ kind: "note", noteValue: "sixteenth" })) },
  ] };
  for (const bpm of [60, 120, 240]) {
    const standard = timing.createExerciseTimeline(exercise, bpm, 4, preference.getTappingTimingWindows("standard"));
    for (const { id } of preference.tappingPrecisions) {
      const windows = preference.getTappingTimingWindows(id);
      const line = timing.createExerciseTimeline(exercise, bpm, 4, windows);
      for (const key of ["targetTaps", "eventStartOffsetsMs", "eventEndOffsetsMs", "countInOffsetsMs"]) {
        assert.deepEqual(line[key], standard[key]);
      }
      assert.equal(line.finishOffsetMs, Math.max(4 * 60000 / bpm, line.targetTaps.at(-1).offsetMs + windows.hitMs));
      const taps = line.targetTaps.slice(1).map(target => target.offsetMs);
      const result = timing.judgePractice(line, taps.reverse(), line.finishOffsetMs, windows);
      assert.equal(result.events[0].kind, "miss");
      assert.equal(result.events.filter(event => event.kind === "hit").length, 15);
      assert.equal(new Set(result.events.map(event => event.targetIndex)).size, 16);
    }
  }
});

test("各档密集窗口重叠仍匹配最近目标，等距优先较早目标", () => {
  const targets = [1000, 1125, 1250].map((offsetMs, eventIndex) => ({ offsetMs, eventIndex }));
  for (const { id } of preference.tappingPrecisions) {
    const windows = preference.getTappingTimingWindows(id);
    assert.equal(timing.evaluateTap(targets, 0, 1062.5, windows).events.at(-1).targetIndex, 0);
    assert.equal(timing.evaluateTap(targets, 0, 1062.6, windows).events.at(-1).targetIndex, 1);
  }
});
