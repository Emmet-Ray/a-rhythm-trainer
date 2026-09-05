import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

// 复用已有的 Vite 转译 TypeScript，不启动 HTTP 服务或额外安装测试框架。
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let timing;
let createPracticeClock;
try {
  timing = await server.ssrLoadModule("/src/RhythmTiming.ts");
  ({ createPracticeClock } = await server.ssrLoadModule("/src/RhythmAudio.ts"));
} finally {
  await server.close();
}

const windows = { perfectMs: 50, hitMs: 150 };
const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  events: ["quarter", "quarter", "quarter", "eighth", "eighth"].map(
    (noteValue) => ({ kind: "note", noteValue }),
  ),
};
const timeline = timing.createExerciseTimeline(exercise, 60, 3, windows);

function approximately(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
}

test("时钟以正式练习为零点，音频秒数与相对毫秒双向对应", () => {
  const context = { currentTime: 10 };
  const clock = createPracticeClock(context, 3000);
  approximately(clock.nowMs(), -3100);
  approximately(clock.audioTimeAt(-3000), 10.1);
  approximately(clock.audioTimeAt(0), 13.1);
  context.currentTime = 14.15;
  approximately(clock.nowMs(), 1050);
  approximately(clock.audioTimeAt(clock.nowMs()), context.currentTime);
});

test("音频时钟暂停时，即使普通定时器继续运行，练习时间也不推进", async () => {
  const context = { currentTime: 10 };
  const clock = createPracticeClock(context, 3000);
  context.currentTime = clock.audioTimeAt(140);
  const pausedMs = clock.nowMs();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(clock.nowMs(), pausedMs);
  assert.deepEqual(timing.collectExpiredTargets(timeline.targetTaps, 0, clock.nowMs(), windows), []);
  context.currentTime = clock.audioTimeAt(160);
  assert.equal(timing.collectExpiredTargets(timeline.targetTaps, 0, clock.nowMs(), windows).length, 1);
});

test("重新开始建立新起点；调度余量不会加入敲击误差", () => {
  const context = { currentTime: 10 };
  const first = createPracticeClock(context, 3000);
  context.currentTime = 20;
  const second = createPracticeClock(context, 3000);
  approximately(second.nowMs(), -3100);
  assert.ok(first.nowMs() > 0);
  for (const leadInMs of [0, 100, 250]) {
    const clock = createPracticeClock(context, 3000, leadInMs);
    context.currentTime = clock.audioTimeAt(30);
    approximately(clock.nowMs(), 30);
    assert.equal(timing.evaluateTap(timeline.targetTaps, 0, clock.nowMs(), windows).grade, "perfect");
  }
});

test("当前练习的预备拍、目标起点、事件终点与文档表格一致", () => {
  assert.equal(timeline.countInDurationMs, 3000);
  assert.deepEqual(timeline.countInOffsetsMs, [-3000, -2000, -1000]);
  assert.deepEqual(timeline.targetTaps.map((t) => t.offsetMs), [0, 1000, 2000, 3000, 3500]);
  assert.deepEqual(timeline.eventEndOffsetsMs, [1000, 2000, 3000, 3500, 4000]);
  assert.equal(timeline.finishOffsetMs, 4000);
});

test("BPM 翻倍时音符和预备拍时长减半，判定窗口仍保持毫秒设置", () => {
  const faster = timing.createExerciseTimeline(exercise, 120, 3, windows);
  assert.equal(faster.countInDurationMs, 1500);
  assert.deepEqual(faster.eventEndOffsetsMs, [500, 1000, 1500, 1750, 2000]);
  assert.deepEqual(timing.getTargetTimingWindow(faster.targetTaps[1], windows), {
    opensAtMs: 350, closesAtMs: 650,
  });
});

test("画面按当前时间定位：缓冲、倒数、音符边界、卡顿后跳转、结束", () => {
  assert.equal(timing.getPlaybackPosition(timeline, -3100).countInBeat, -1);
  assert.equal(timing.getPlaybackPosition(timeline, -3000).countInBeat, 0);
  assert.equal(timing.getPlaybackPosition(timeline, -2000).countInBeat, 1);
  assert.equal(timing.getPlaybackPosition(timeline, -1000).countInBeat, 2);
  assert.equal(timing.getPlaybackPosition(timeline, 0).phase, "playing");
  assert.equal(timing.getPlaybackPosition(timeline, 999).playingBeatIndex, 0);
  assert.equal(timing.getPlaybackPosition(timeline, 1000).playingBeatIndex, 1);
  assert.equal(timing.getPlaybackPosition(timeline, 3520).playingBeatIndex, 4);
  assert.equal(timing.getPlaybackPosition(timeline, 4000).phase, "finished");
});

test("首尾休止符占用时间，但不生成待敲击目标", () => {
  const rests = timing.createExerciseTimeline({
    ...exercise,
    events: [
      { kind: "rest", noteValue: "quarter" },
      { kind: "note", noteValue: "eighth" },
      { kind: "rest", noteValue: "quarter" },
    ],
  }, 60, 3, windows);
  assert.deepEqual(rests.targetTaps, [{ eventIndex: 1, offsetMs: 1000 }]);
  assert.deepEqual(rests.eventEndOffsetsMs, [1000, 1500, 2500]);
  assert.equal(timing.getTargetTimingWindow(rests.targetTaps[0], windows).opensAtMs, 850);
  assert.equal(rests.finishOffsetMs, 2500);
});

test("空练习、全休止符与零预备拍不会访问不存在的目标", () => {
  for (const events of [[], [{ kind: "rest", noteValue: "quarter" }]]) {
    const empty = timing.createExerciseTimeline({ ...exercise, events }, 60, 0, windows);
    assert.deepEqual(empty.countInOffsetsMs, []);
    assert.deepEqual(empty.targetTaps, []);
    assert.equal(timing.evaluateTap(empty.targetTaps, 0, 0, windows), null);
    assert.deepEqual(timing.collectExpiredTargets(empty.targetTaps, 0, 1000, windows), []);
    assert.equal(timing.getPlaybackPosition(empty, empty.finishOffsetMs).phase, "finished");
  }
});

test("命中窗口左闭右开，perfect 含正负边界，预备拍末尾允许提前命中", () => {
  for (const [tapMs, grade] of [[850, "early"], [949, "early"], [950, "perfect"], [1000, "perfect"], [1050, "perfect"], [1051, "late"], [1149, "late"]]) {
    assert.equal(timing.evaluateTap(timeline.targetTaps, 1, tapMs, windows).grade, grade);
  }
  assert.equal(timing.evaluateTap(timeline.targetTaps, 1, 1150, windows), null);
  const early = timing.evaluateTap(timeline.targetTaps, 0, -100, windows);
  assert.equal(early.grade, "early");
  assert.equal(early.errorMs, -100);
});

test("tooEarly 不消耗目标；目标全部判定后继续敲击返回 null", () => {
  const before = structuredClone(timeline.targetTaps);
  assert.equal(timing.evaluateTap(timeline.targetTaps, 1, 600, windows).kind, "tooEarly");
  assert.equal(timing.evaluateTap(timeline.targetTaps, 1, 1000, windows).grade, "perfect");
  assert.deepEqual(timeline.targetTaps, before);
  assert.equal(timing.evaluateTap(timeline.targetTaps, 5, 3750, windows), null);
});

test("漏拍在窗口关闭时产生，延迟后补齐多个目标，推进游标后不重复判定", () => {
  assert.equal(timing.evaluateExpiredTarget(timeline.targetTaps, 0, 149, windows), null);
  assert.equal(timing.evaluateExpiredTarget(timeline.targetTaps, 0, 150, windows).kind, "miss");
  const misses = timing.collectExpiredTargets(timeline.targetTaps, 0, 2200, windows);
  assert.deepEqual(misses.map((m) => m.targetIndex), [0, 1, 2]);
  const nextIndex = misses.length;
  assert.deepEqual(timing.collectExpiredTargets(timeline.targetTaps, nextIndex, 2200, windows), []);
  assert.equal(timing.evaluateTap(timeline.targetTaps, nextIndex, 3000, windows).grade, "perfect");
  assert.deepEqual(timing.collectExpiredTargets(timeline.targetTaps, nextIndex + 1, 3150, windows), []);
});

test("结束时可收齐漏拍；最后音符短于命中窗口时要等到窗口关闭", () => {
  const short = timing.createExerciseTimeline({
    ...exercise, events: [{ kind: "note", noteValue: "eighth" }],
  }, 600, 0, windows);
  assert.equal(short.eventEndOffsetsMs[0], 50);
  assert.equal(short.finishOffsetMs, 150);
  assert.equal(timing.getPlaybackPosition(short, 149).phase, "playing");
  assert.equal(timing.collectExpiredTargets(short.targetTaps, 0, 150, windows).length, 1);
  assert.equal(timing.getPlaybackPosition(short, 150).phase, "finished");
  assert.equal(timing.collectExpiredTargets(timeline.targetTaps, 0, timeline.finishOffsetMs, windows).length, 5);
});

test("窗口重叠时匹配最靠前的待判定目标，而非时间上最近的目标", () => {
  const fast = timing.createExerciseTimeline({
    ...exercise,
    events: [{ kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "eighth" }],
  }, 120, 3, windows);
  const first = timing.evaluateTap(fast.targetTaps, 0, 140, windows);
  assert.equal(first.targetIndex, 0);
  assert.equal(first.grade, "late");
  const second = timing.evaluateTap(fast.targetTaps, 1, 140, windows);
  assert.equal(second.targetIndex, 1);
  assert.equal(second.grade, "early");
});

test("非法 BPM、预备拍数和判定窗口给出明确错误", () => {
  for (const bpm of [0, -60, NaN, Infinity]) {
    assert.throws(() => timing.createExerciseTimeline(exercise, bpm, 3, windows), /BPM/);
  }
  for (const count of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => timing.createExerciseTimeline(exercise, 60, count, windows), /预备拍/);
  }
  for (const invalid of [
    { perfectMs: -1, hitMs: 150 }, { perfectMs: 50, hitMs: 0 },
    { perfectMs: 200, hitMs: 150 }, { perfectMs: NaN, hitMs: 150 },
    { perfectMs: 50, hitMs: Infinity },
  ]) {
    assert.throws(() => timing.createExerciseTimeline(exercise, 60, 3, invalid), /判定窗口/);
  }
});
