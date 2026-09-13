import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

// 复用已有的 Vite 转译 TypeScript，不启动 HTTP 服务或额外安装测试框架。
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let timing;
let model;
let scoreLayout;
let createPracticeClock;
try {
  model = await server.ssrLoadModule("/src/rhythm/RhythmModel.ts");
  timing = await server.ssrLoadModule("/src/rhythm/RhythmTiming.ts");
  scoreLayout = await server.ssrLoadModule("/src/rhythm/notation/RhythmScoreLayout.ts");
  ({ createPracticeClock } = await server.ssrLoadModule("/src/rhythm/RhythmAudio.ts"));
} finally {
  await server.close();
}

const windows = { perfectMs: 50, hitMs: 150 };
const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: [{ elements: ["quarter", "quarter", "quarter", "eighth", "eighth"].map(
    (noteValue) => ({ kind: "note", noteValue }),
  ) }],
};
const timeline = timing.createExerciseTimeline(exercise, 60, 3, windows);

function inputClockFixture() {
  let browserMs = 10000;
  const context = { currentTime: 10, state: "running" };
  const browser = { now: () => browserMs, timeOrigin: 1700000000000 };
  const clock = createPracticeClock(context, 0, 100, browser);
  return {
    context, browser, clock,
    advance(ms, audioMs = ms) { browserMs += ms; context.currentTime += audioMs / 1000; },
  };
}

test("输入使用事件创建时间：0/80/200ms 分发延迟不会改变命中目标或误差", () => {
  const line = { targetTaps: [0, 125, 250].map((offsetMs, eventIndex) => ({ offsetMs, eventIndex })), finishOffsetMs: 400 };
  for (const delay of [0, 80, 200]) {
    const { clock, advance } = inputClockFixture();
    advance(100 + delay);
    const tap = clock.inputTimeMs(10100);
    approximately(tap, 0);
    const result = timing.judgePractice(line, [tap], clock.nowMs(), windows);
    assert.equal(result.events[0].kind, "hit");
    assert.equal(result.events[0].targetIndex, 0);
    approximately(result.events[0].errorMs, 0);
  }
});

test("输入时钟兼容 epoch 毫秒，拒绝未知、未来、创建本轮之前的输入", () => {
  const { clock, browser, advance } = inputClockFixture();
  advance(300);
  approximately(clock.inputTimeMs(browser.timeOrigin + 10100), 0);
  for (const time of [NaN, Infinity, -Infinity, 0, 9999, 10301]) {
    assert.equal(clock.inputTimeMs(time), null);
  }
});

test("暂停恢复建立新输入段，不把挂起时间算作误差或接受挂起期间的输入", () => {
  const { clock, context, advance } = inputClockFixture();
  advance(200);
  clock.nowMs();
  context.state = "suspended";
  clock.resetInputTime();
  advance(2000, 0);
  assert.equal(clock.inputTimeMs(11000), null);
  approximately(clock.nowMs(), 100);
  context.state = "running";
  clock.resetInputTime();
  advance(100);
  assert.equal(clock.inputTimeMs(11000), null);
  approximately(clock.inputTimeMs(12250), 150);
});

test("未及时观察到 statechange 时也拒绝跨不连续区间的旧输入", () => {
  const { clock, advance } = inputClockFixture();
  advance(1100, 100);
  assert.equal(clock.inputTimeMs(10100), null);
  advance(100);
  approximately(clock.inputTimeMs(11150), 50);
});

test("新时钟拒绝上一轮排队输入；映射过程不改变音频排程原点", () => {
  const { clock, context, browser, advance } = inputClockFixture();
  advance(300);
  const next = createPracticeClock(context, 0, 100, browser);
  assert.equal(next.inputTimeMs(10100), null);
  approximately(clock.audioTimeAt(0), 10.1);
  approximately(next.audioTimeAt(0), 10.4);
});

test("RAF 先判漏拍后收到旧输入，与先收到输入的最终结果相同", () => {
  const line = { targetTaps: [0, 125, 250].map((offsetMs, eventIndex) => ({ offsetMs, eventIndex })), finishOffsetMs: 400 };
  const before = timing.judgePractice(line, [], 200, windows);
  assert.equal(before.events[0].kind, "miss");
  const corrected = timing.judgePractice(line, [0], 200, windows);
  const immediate = timing.judgePractice(line, [0], 0, windows);
  const misses = timing.collectExpiredTargets(line.targetTaps, immediate.nextTargetIndex, 200, windows);
  assert.deepEqual(corrected.events, [...immediate.events, ...misses]);
  assert.deepEqual(before.events, [{ kind: "miss", targetIndex: 0, eventIndex: 0 }]);
});

test("自然结束后仍可修正迟到输入，整轮重算保留最近匹配、边界与唯一结算", () => {
  const line = { targetTaps: [0, 125, 250].map((offsetMs, eventIndex) => ({ offsetMs, eventIndex })), finishOffsetMs: 400 };
  assert.equal(timing.summarizePractice(3, timing.judgePractice(line, [], 500, windows).events).missCount, 3);
  const taps = Object.freeze([250, 0, 125]);
  const result = timing.judgePractice(line, taps, 500, windows);
  assert.equal(timing.summarizePractice(3, result.events).passed, true);
  assert.equal(new Set(result.events.map(event => event.targetIndex)).size, 3);
  const missed = timing.judgePractice(line, [125, 250], 500, windows);
  assert.deepEqual(missed.events.map(event => event.kind), ["miss", "hit", "hit"]);
  const left = timing.judgePractice(line, [-150], 0, windows);
  assert.equal(left.events[0].kind, "hit");
  const right = timing.judgePractice(line, [400], 500, windows);
  assert.equal(right.events.filter(event => event.kind === "wrongTap").length, 0);
});

test("全轮重算过滤预备拍和非法输入，保留重复敲击的误敲，不回补已跳过的目标", () => {
  const line = { targetTaps: [{ offsetMs: 0, eventIndex: 0 }], finishOffsetMs: 1000 };
  const result = timing.judgePractice(line, [-200, -100, -50, 0, NaN, Infinity, 1000, 2000], 1000, windows);
  assert.deepEqual(result.events.map(event => event.kind), ["hit", "wrongTap"]);
  assert.equal(result.events[0].tapOffsetMs, -100);
  assert.equal(result.events[1].tapOffsetMs, 0);
});

test("乱序送达、不同补漏频率在密集混合节奏下均产生相同结果", () => {
  for (const bpm of [60, 120, 240]) {
    const exercise = {
      timeSignature: { beats: 4, beatType: 4 },
      measures: [{ elements: [
        { kind: "triplet", notes: Array.from({ length: 3 }, () => ({ kind: "note", noteValue: "eighth" })) },
        ...Array.from({ length: 4 }, () => ({ kind: "note", noteValue: "sixteenth" })),
        { kind: "rest", noteValue: "quarter" }, { kind: "note", noteValue: "quarter" },
      ] }],
    };
    const line = timing.createExerciseTimeline(exercise, bpm, 4, windows);
    const taps = line.targetTaps.map(t => t.offsetMs);
    const expected = timing.judgePractice(line, taps, line.finishOffsetMs, windows);
    const received = [];
    for (const tap of [...taps].reverse()) {
      timing.judgePractice(line, received, line.finishOffsetMs, windows);
      received.push(tap);
    }
    assert.deepEqual(timing.judgePractice(line, received, line.finishOffsetMs + 200, windows), expected);
    assert.equal(timing.summarizePractice(line.targetTaps.length, expected.events).passed, true);
  }
});

test("相同时间戳不是同一次输入，非法时间戳不会扰乱其他输入的排序", () => {
  const line = { targetTaps: [0, 1000].map((offsetMs, eventIndex) => ({offsetMs, eventIndex})), finishOffsetMs: 2000 };
  const result = timing.judgePractice(line, [1000, NaN, 0, 0], 2000, windows);
  assert.deepEqual(result.events.map(event => event.kind), ["hit", "wrongTap", "hit"]);
  assert.equal(result.events[0].targetIndex, 0);
  assert.equal(result.events[2].targetIndex, 1);
});

test("外部练习解析只复制模型字段，返回独立快照", () => {
  const input = structuredClone(exercise);
  input.name = "不属于节奏模型的字段";
  const parsed = model.parseRhythmExercise(input);
  assert.deepEqual(parsed, exercise);
  parsed.measures[0].elements[0].noteValue = "half";
  assert.equal(input.measures[0].elements[0].noteValue, "quarter");
});

test("外部完整练习拒绝零小节、非法结构和不足拍数，模型仍允许页面空白占位", () => {
  const empty = { timeSignature: { beats: 4, beatType: 4 }, measures: [] };
  assert.doesNotThrow(() => model.validateRhythmExercise(empty));
  for (const input of [null, empty, { ...empty, measures: [null] },
    { ...empty, measures: [{ elements: [{ kind: "note", noteValue: "quarter" }] }] }]) {
    assert.throws(() => model.parseRhythmExercise(input));
  }
});

test("默认预备拍占一个 4/4 小节，覆盖值及正式起点保持一致", () => {
  const normal = timing.createExerciseTimeline(exercise, 60, undefined, windows);
  assert.equal(normal.countInDurationMs, 4000);
  assert.deepEqual(normal.countInOffsetsMs, [-4000, -3000, -2000, -1000]);
  const fast = timing.createExerciseTimeline(exercise, 120, undefined, windows);
  assert.equal(fast.countInDurationMs, 2000);
  assert.deepEqual(fast.countInOffsetsMs, [-2000, -1500, -1000, -500]);
  assert.deepEqual(normal.targetTaps, timeline.targetTaps);
  assert.equal(timing.getPlaybackPosition(normal, -4001).countInBeat, -1);
  for (let index = 0; index < 4; index++) {
    assert.equal(timing.getPlaybackPosition(normal, -4000 + index * 1000).countInBeat, index);
  }
  assert.equal(timing.getPlaybackPosition(normal, 0).phase, "playing");
  assert.equal(timing.createExerciseTimeline(exercise, 60, 0, windows).countInDurationMs, 0);
  assert.equal(timing.createExerciseTimeline(exercise, 60, 2, windows).countInDurationMs, 2000);
  const context = { currentTime: 10 };
  const clock = createPracticeClock(context, normal.countInDurationMs);
  approximately(clock.audioTimeAt(-4000), 10.1);
  approximately(clock.audioTimeAt(0), 14.1);
});

test("八分音符按四分拍连梁，长音与休止符占时但不参与连梁", () => {
  const values = { E: "eighth", Q: "quarter", H: "half", W: "whole", r: "eighth", R: "quarter" };
  for (const [pattern, expected] of [
    ["", []],
    ["EEEEEEEE", [[0, 1], [2, 3], [4, 5], [6, 7]]],
    ["QEEQEE", [[1, 2], [4, 5]]],
    ["HEEEE", [[1, 2], [3, 4]]],
    ["W", []],
    ["HH", []],
    ["QQQQ", []],
    ["rEErEEEE", [[4, 5], [6, 7]]],
    ["REEQQ", [[1, 2]]],
    ["ErQQQ", []],
    ["EQEQEE", [[4, 5]]],
  ]) {
    const events = [...pattern].map((symbol) => ({
      kind: symbol === "r" || symbol === "R" ? "rest" : "note",
      noteValue: values[symbol],
    }));
    const before = structuredClone(events);
    assert.deepEqual(scoreLayout.getBeatBeamGroups(events), expected, pattern);
    assert.deepEqual(events, before);
  }
});

test("连梁分组使用小节内下标，前一小节的末尾音不与下一小节相连", () => {
  const note = (noteValue) => ({ kind: "note", noteValue });
  const first = [note("eighth"), note("quarter"), note("quarter"), note("quarter"), note("eighth")];
  const second = [note("eighth"), note("eighth"), note("half"), note("quarter")];
  assert.deepEqual(scoreLayout.getBeatBeamGroups(first), []);
  assert.deepEqual(scoreLayout.getBeatBeamGroups(second), [[0, 1]]);
});

test("全音符和二分音符按四分音符单位展开，长音符只生成一次敲击", () => {
  for (const bpm of [60, 120]) {
    const beatMs = 60_000 / bpm;
    for (const [values, starts, ends] of [
      [["whole"], [0], [4]],
      [["half", "half"], [0, 2], [2, 4]],
      [["half", "quarter", "eighth", "eighth"], [0, 2, 3, 3.5], [2, 3, 3.5, 4]],
    ]) {
      const expanded = timing.createExerciseTimeline({
        ...exercise, measures: [{ elements: values.map((noteValue) => ({ kind: "note", noteValue })) }],
      }, bpm, 3, windows);
      assert.deepEqual(expanded.targetTaps.map((target) => target.offsetMs), starts.map((n) => n * beatMs));
      assert.deepEqual(expanded.eventEndOffsetsMs, ends.map((n) => n * beatMs));
      assert.equal(expanded.finishOffsetMs, 4 * beatMs);
      assert.equal(timing.getPlaybackPosition(expanded, 4 * beatMs - 1).phase, "playing");
      assert.equal(timing.getPlaybackPosition(expanded, 4 * beatMs).phase, "finished");
      for (const [index, target] of expanded.targetTaps.entries()) {
        assert.equal(timing.evaluateTap(expanded.targetTaps, index, target.offsetMs, windows).events.at(-1).grade, "perfect");
      }
      assert.deepEqual(timing.evaluateTap(expanded.targetTaps, expanded.targetTaps.length, 4 * beatMs - 1, windows).events.at(-1), {
        kind: "wrongTap", tapOffsetMs: 4 * beatMs - 1,
      });
    }
  }
});

test("二分及全休止符占用时长但不生成敲击目标", () => {
  const halfRest = timing.createExerciseTimeline({
    ...exercise, measures: [{ elements: [
      { kind: "rest", noteValue: "half" },
      { kind: "note", noteValue: "half" },
    ] }],
  }, 60, 0, windows);
  assert.deepEqual(halfRest.targetTaps, [{ eventIndex: 1, offsetMs: 2000 }]);
  assert.deepEqual(halfRest.eventEndOffsetsMs, [2000, 4000]);
  const wholeRest = timing.createExerciseTimeline({
    ...exercise, measures: [{ elements: [{ kind: "rest", noteValue: "whole" }] }],
  }, 60, 0, windows);
  assert.deepEqual(wholeRest.targetTaps, []);
  assert.deepEqual(wholeRest.eventEndOffsetsMs, [4000]);
  assert.equal(wholeRest.finishOffsetMs, 4000);
});

function approximately(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
}

test("多小节连续累计时间与全局事件下标，跨小节不提前结束", () => {
  const multi = timing.createExerciseTimeline({
    ...exercise,
    measures: [
      { elements: [{ kind: "note", noteValue: "half" }, { kind: "note", noteValue: "half" }] },
      { elements: [{ kind: "rest", noteValue: "whole" }] },
      { elements: [{ kind: "rest", noteValue: "half" }, { kind: "note", noteValue: "half" }] },
    ],
  }, 60, 3, windows);
  assert.deepEqual(multi.measures, [
    { startOffsetMs: 0, endOffsetMs: 4000, firstEventIndex: 0 },
    { startOffsetMs: 4000, endOffsetMs: 8000, firstEventIndex: 2 },
    { startOffsetMs: 8000, endOffsetMs: 12000, firstEventIndex: 3 },
  ]);
  assert.deepEqual(multi.eventStartOffsetsMs, [0, 2000, 4000, 8000, 10000]);
  assert.deepEqual(multi.targetTaps, [
    { eventIndex: 0, offsetMs: 0 }, { eventIndex: 1, offsetMs: 2000 }, { eventIndex: 4, offsetMs: 10000 },
  ]);
  assert.deepEqual(multi.countInOffsetsMs, [-3000, -2000, -1000]);
  assert.equal(timing.getPlaybackPosition(multi, 4000).playingBeatIndex, 2);
  assert.equal(timing.getPlaybackPosition(multi, 8000).playingBeatIndex, 3);
  assert.equal(timing.getPlaybackPosition(multi, 11999).phase, "playing");
  assert.equal(timing.getPlaybackPosition(multi, 12000).phase, "finished");
  const misses = timing.collectExpiredTargets(multi.targetTaps, 0, 12000, windows);
  assert.deepEqual(misses.map((event) => event.eventIndex), [0, 1, 4]);
  assert.equal(timing.summarizePractice(3, misses).missCount, 3);
  const hits = multi.targetTaps.map((target, index) => timing.evaluateTap(multi.targetTaps, index, target.offsetMs, windows).events.at(-1));
  assert.equal(timing.summarizePractice(3, hits).passed, true);
});

test("两小节交界窗口允许提前命中第二小节，不重复判漏拍", () => {
  const multi = timing.createExerciseTimeline({ ...exercise, measures: [
    { elements: [{ kind: "note", noteValue: "whole" }] },
    { elements: [{ kind: "note", noteValue: "whole" }] },
  ] }, 60, 0, windows);
  const hit = timing.evaluateTap(multi.targetTaps, 1, 3900, windows).events.at(-1);
  assert.equal(hit.eventIndex, 1);
  assert.equal(hit.grade, "early");
  assert.deepEqual(timing.collectExpiredTargets(multi.targetTaps, 2, 8000, windows), []);
});

test("误敲位置按小节映射：单个长音、休止符、小节边界和首尾限制", () => {
  const layouts = [
    { startOffsetMs: 0, endOffsetMs: 4000, minimumX: 90, maximumX: 350, markerY: 150,
      anchors: [{ offsetMs: 0, x: 100 }, { offsetMs: 4000, x: 350 }] },
    { startOffsetMs: 4000, endOffsetMs: 8000, minimumX: 370, maximumX: 710, markerY: 330,
      anchors: [{ offsetMs: 4000, x: 380 }, { offsetMs: 6000, x: 550 }, { offsetMs: 8000, x: 710 }] },
  ];
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(1000, layouts), { x: 162.5, y: 150 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(3000, layouts), { x: 287.5, y: 150 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(4000, layouts), { x: 380, y: 330 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(5000, layouts), { x: 465, y: 330 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(7000, layouts), { x: 630, y: 330 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(-10000, layouts), { x: 90, y: 150 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(9000, layouts), { x: 710, y: 330 });
  assert.equal(scoreLayout.timingOffsetToScorePosition(0, []), null);
});

test("结果统计：所有等级的命中均可通过，漏敲或误敲均不通过", () => {
  const hits = ["perfect", "early", "late"].map((grade, index) => ({
    kind: "hit", grade, targetIndex: index, eventIndex: index,
    tapOffsetMs: index * 1000, errorMs: 0,
  }));
  const miss = { kind: "miss", targetIndex: 2, eventIndex: 2 };
  const wrongTap = { kind: "wrongTap", tapOffsetMs: 3700 };
  const cases = [
    { events: hits, passed: true, hitCount: 3, missCount: 0, wrongTapCount: 0 },
    { events: [...hits.slice(0, 2), miss], passed: false, hitCount: 2, missCount: 1, wrongTapCount: 0 },
    { events: [...hits, wrongTap], passed: false, hitCount: 3, missCount: 0, wrongTapCount: 1 },
    { events: [...hits.slice(0, 2), miss, wrongTap, wrongTap], passed: false, hitCount: 2, missCount: 1, wrongTapCount: 2 },
  ];
  for (const { events, ...expected } of cases) {
    const before = structuredClone(events);
    assert.deepEqual(timing.summarizePractice(3, events), { targetCount: 3, ...expected });
    assert.deepEqual(events, before);
  }
});

test("零目标结果：没有误敲通过，有误敲不通过", () => {
  assert.deepEqual(timing.summarizePractice(0, []), {
    passed: true, targetCount: 0, hitCount: 0, missCount: 0, wrongTapCount: 0,
  });
  assert.deepEqual(timing.summarizePractice(0, [{ kind: "wrongTap", tapOffsetMs: 500 }]), {
    passed: false, targetCount: 0, hitCount: 0, missCount: 0, wrongTapCount: 1,
  });
});

test("结束时先补齐遗漏目标，再汇总结果", () => {
  const hits = timeline.targetTaps.slice(0, -1).map((target, index) =>
    timing.evaluateTap(timeline.targetTaps, index, target.offsetMs, windows).events.at(-1),
  );
  const misses = timing.collectExpiredTargets(
    timeline.targetTaps, hits.length, timeline.finishOffsetMs, windows,
  );
  assert.deepEqual(timing.summarizePractice(timeline.targetTaps.length, [...hits, ...misses]), {
    passed: false, targetCount: 5, hitCount: 4, missCount: 1, wrongTapCount: 0,
  });
});

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
    assert.equal(timing.evaluateTap(timeline.targetTaps, 0, clock.nowMs(), windows).events.at(-1).grade, "perfect");
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
    measures: [{ elements: [
      { kind: "rest", noteValue: "quarter" },
      { kind: "note", noteValue: "eighth" },
      { kind: "rest", noteValue: "half" },
      { kind: "rest", noteValue: "eighth" },
    ] }],
  }, 60, 3, windows);
  assert.deepEqual(rests.targetTaps, [{ eventIndex: 1, offsetMs: 1000 }]);
  assert.deepEqual(rests.eventEndOffsetsMs, [1000, 1500, 3500, 4000]);
  assert.equal(timing.getTargetTimingWindow(rests.targetTaps[0], windows).opensAtMs, 850);
  assert.equal(rests.finishOffsetMs, 4000);
});

test("空练习、全休止符与零预备拍不会访问不存在的目标", () => {
  for (const measures of [[], [{ elements: [{ kind: "rest", noteValue: "whole" }] }]]) {
    const empty = timing.createExerciseTimeline({ ...exercise, measures }, 60, 0, windows);
    assert.deepEqual(empty.countInOffsetsMs, []);
    assert.deepEqual(empty.targetTaps, []);
    // 判定函数不负责过滤本轮输入时间；没有目标的有效输入统一为误敲。
    assert.deepEqual(timing.evaluateTap(empty.targetTaps, 0, 0, windows).events.at(-1), {
      kind: "wrongTap", tapOffsetMs: 0,
    });
    assert.deepEqual(timing.collectExpiredTargets(empty.targetTaps, 0, 1000, windows), []);
    assert.equal(timing.getPlaybackPosition(empty, empty.finishOffsetMs).phase, "finished");
  }
});

test("命中窗口左闭右开，perfect 含正负边界，预备拍末尾允许提前命中", () => {
  for (const [tapMs, grade] of [[850, "early"], [949, "early"], [950, "perfect"], [1000, "perfect"], [1050, "perfect"], [1051, "late"], [1149, "late"]]) {
    assert.equal(timing.evaluateTap(timeline.targetTaps, 1, tapMs, windows).events.at(-1).grade, grade);
  }
  assert.deepEqual(timing.evaluateTap(timeline.targetTaps, 1, 1150, windows), {
    events: [
      { kind: "miss", targetIndex: 1, eventIndex: timeline.targetTaps[1].eventIndex },
      { kind: "wrongTap", tapOffsetMs: 1150 },
    ],
    nextTargetIndex: 2,
  });
  const early = timing.evaluateTap(timeline.targetTaps, 0, -100, windows).events.at(-1);
  assert.equal(early.grade, "early");
  assert.equal(early.errorMs, -100);
});

test("窗口之前的误敲只记录时间，不消耗目标", () => {
  const before = structuredClone(timeline.targetTaps);
  for (const tapOffsetMs of [600, 700, 849]) {
    assert.deepEqual(timing.evaluateTap(timeline.targetTaps, 1, tapOffsetMs, windows).events.at(-1), {
      kind: "wrongTap", tapOffsetMs,
    });
  }
  assert.equal(timing.evaluateTap(timeline.targetTaps, 1, 1000, windows).events.at(-1).grade, "perfect");
  assert.deepEqual(timeline.targetTaps, before);
});

test("最后目标命中或漏拍后，本轮剩余时间内每次敲击均为误敲", () => {
  const lastIndex = timeline.targetTaps.length - 1;
  const lastTarget = timeline.targetTaps[lastIndex];
  const hit = timing.evaluateTap(timeline.targetTaps, lastIndex, lastTarget.offsetMs, windows).events.at(-1);
  assert.equal(hit.kind, "hit");
  const misses = timing.collectExpiredTargets(timeline.targetTaps, lastIndex, 3750, windows);
  assert.equal(misses.length, 1);
  assert.equal(misses[0].kind, "miss");
  for (const nextIndex of [lastIndex + 1, lastIndex + misses.length]) {
    for (const tapOffsetMs of [3750, 3800, 3999]) {
      assert.ok(tapOffsetMs < timeline.finishOffsetMs);
      assert.deepEqual(timing.evaluateTap(timeline.targetTaps, nextIndex, tapOffsetMs, windows).events.at(-1), {
        kind: "wrongTap", tapOffsetMs,
      });
      assert.deepEqual(timing.collectExpiredTargets(timeline.targetTaps, nextIndex, tapOffsetMs, windows), []);
    }
  }
});

test("漏拍在窗口关闭时产生，延迟后补齐多个目标，推进游标后不重复判定", () => {
  assert.equal(timing.evaluateExpiredTarget(timeline.targetTaps, 0, 149, windows), null);
  assert.equal(timing.evaluateExpiredTarget(timeline.targetTaps, 0, 150, windows).kind, "miss");
  const misses = timing.collectExpiredTargets(timeline.targetTaps, 0, 2200, windows);
  assert.deepEqual(misses.map((m) => m.targetIndex), [0, 1, 2]);
  const nextIndex = misses.length;
  assert.deepEqual(timing.collectExpiredTargets(timeline.targetTaps, nextIndex, 2200, windows), []);
  assert.equal(timing.evaluateTap(timeline.targetTaps, nextIndex, 3000, windows).events.at(-1).grade, "perfect");
  assert.deepEqual(timing.collectExpiredTargets(timeline.targetTaps, nextIndex + 1, 3150, windows), []);
});

test("结束时可收齐漏拍；最后音符短于命中窗口时要等到窗口关闭", () => {
  const short = timing.createExerciseTimeline({
    ...exercise, measures: [{ elements: [
      { kind: "rest", noteValue: "half", dots: 1 },
      { kind: "rest", noteValue: "eighth" },
      { kind: "note", noteValue: "eighth" },
    ] }],
  }, 600, 0, windows);
  assert.equal(short.eventEndOffsetsMs.at(-1), 400);
  assert.equal(short.finishOffsetMs, 500);
  assert.equal(timing.getPlaybackPosition(short, 499).phase, "playing");
  assert.equal(timing.collectExpiredTargets(short.targetTaps, 0, 500, windows).length, 1);
  assert.equal(timing.getPlaybackPosition(short, 500).phase, "finished");
  assert.equal(timing.collectExpiredTargets(timeline.targetTaps, 0, timeline.finishOffsetMs, windows).length, 5);
});

test("窗口重叠时选择最近目标，跳过的旧目标记为漏拍", () => {
  const fast = timing.createExerciseTimeline({
    ...exercise,
    measures: [{ elements: [{ kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "eighth" }, { kind: "rest", noteValue: "half", dots: 1 }] }],
  }, 120, 3, windows);
  const result = timing.evaluateTap(fast.targetTaps, 0, 140, windows);
  assert.deepEqual(result, {
    events: [
      { kind: "miss", targetIndex: 0, eventIndex: 0 },
      { kind: "hit", targetIndex: 1, eventIndex: 1, grade: "early", tapOffsetMs: 140, errorMs: -110 },
    ],
    nextTargetIndex: 2,
  });
});

test("密集十六分音符漏掉上一拍后，准时敲下一拍立即恢复，等距优先较早目标", () => {
  const targets = [1000, 1125, 1250].map((offsetMs, eventIndex) => ({ offsetMs, eventIndex }));
  const before = structuredClone(targets);
  const result = timing.evaluateTap(targets, 0, 1125, windows);
  assert.deepEqual(result.events.map(e => [e.kind, e.targetIndex]), [["miss", 0], ["hit", 1]]);
  assert.equal(result.events.at(-1).grade, "perfect");
  assert.equal(result.nextTargetIndex, 2);
  const next = timing.evaluateTap(targets, result.nextTargetIndex, 1250, windows);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].targetIndex, 2);
  assert.equal(next.events[0].grade, "perfect");
  assert.equal(timing.evaluateTap(targets, 0, 1062.5, windows).events.at(-1).targetIndex, 0);
  assert.equal(timing.evaluateTap(targets, 0, 1062.6, windows).events.at(-1).targetIndex, 1);
  assert.deepEqual(targets, before);
});

test("一次敲击统一补齐过期和跳过的目标，已结算目标不能回补或重复漏拍", () => {
  const targets = [0, 100, 200, 300, 1000].map((offsetMs, i) => ({ offsetMs, eventIndex: i * 2 }));
  const result = timing.evaluateTap(targets, 0, 300, windows);
  assert.deepEqual(result.events.map(e => [e.kind, e.targetIndex, e.eventIndex]), [
    ["miss", 0, 0], ["miss", 1, 2], ["miss", 2, 4], ["hit", 3, 6],
  ]);
  assert.equal(result.nextTargetIndex, 4);
  assert.deepEqual(timing.collectExpiredTargets(targets, result.nextTargetIndex, 450, windows), []);
  assert.deepEqual(timing.evaluateTap(targets, result.nextTargetIndex, 310, windows), {
    events: [{ kind: "wrongTap", tapOffsetMs: 310 }], nextTargetIndex: 4,
  });
  const finalMisses = timing.collectExpiredTargets(targets, result.nextTargetIndex, 1150, windows);
  const all = [...result.events, ...finalMisses];
  assert.equal(new Set(all.map(e => e.targetIndex)).size, targets.length);
  assert.deepEqual(timing.summarizePractice(targets.length, all), {
    passed: false, targetCount: 5, hitCount: 1, missCount: 4, wrongTapCount: 0,
  });
});

test("没有候选时只推进已过期目标，不消耗未来目标；左右窗口边界保持不变", () => {
  const targets = [{ offsetMs: 0, eventIndex: 0 }, { offsetMs: 1000, eventIndex: 2 }];
  const result = timing.evaluateTap(targets, 0, 500, windows);
  assert.deepEqual(result, {
    events: [{ kind: "miss", targetIndex: 0, eventIndex: 0 }, { kind: "wrongTap", tapOffsetMs: 500 }],
    nextTargetIndex: 1,
  });
  assert.deepEqual(timing.evaluateTap(targets, 1, 849, windows), {
    events: [{ kind: "wrongTap", tapOffsetMs: 849 }], nextTargetIndex: 1,
  });
  assert.equal(timing.evaluateTap(targets, 1, 850, windows).events.at(-1).kind, "hit");
  assert.equal(timing.evaluateTap(targets, 1, 1150, windows).nextTargetIndex, 2);
});

test("三连音与十六分序列在不同速度下保持唯一结算，逐帧和延迟检查结果一致", () => {
  const denseExercise = {
    timeSignature: { beats: 4, beatType: 4 },
    measures: [{ elements: [
      { kind: "triplet", notes: Array.from({ length: 3 }, () => ({ kind: "note", noteValue: "eighth" })) },
      ...Array.from({ length: 4 }, () => ({ kind: "note", noteValue: "sixteenth" })),
      { kind: "rest", noteValue: "quarter" },
      { kind: "note", noteValue: "quarter" },
    ] }],
  };
  for (const bpm of [60, 120, 240]) {
    const line = timing.createExerciseTimeline(denseExercise, bpm, 0, windows);
    const run = (checkBeforeTap, skip) => {
      let cursor = 0;
      const events = [];
      for (let i = 0; i < line.targetTaps.length; i++) {
        if (skip && [0, 3, 4].includes(i)) continue;
        const time = line.targetTaps[i].offsetMs;
        if (checkBeforeTap) {
          const misses = timing.collectExpiredTargets(line.targetTaps, cursor, time, windows);
          events.push(...misses);
          cursor += misses.length;
        }
        const result = timing.evaluateTap(line.targetTaps, cursor, time, windows);
        assert.ok(result.nextTargetIndex >= cursor);
        cursor = result.nextTargetIndex;
        events.push(...result.events);
      }
      events.push(...timing.collectExpiredTargets(line.targetTaps, cursor, line.finishOffsetMs, windows));
      assert.equal(events.length, line.targetTaps.length);
      assert.equal(new Set(events.map(e => e.targetIndex)).size, line.targetTaps.length);
      return events;
    };
    assert.deepEqual(run(true, true), run(false, true));
    const result = timing.summarizePractice(line.targetTaps.length, run(false, true));
    assert.equal(result.missCount, 3);
    assert.equal(result.wrongTapCount, 0);
    const perfect = run(false, false);
    assert.ok(perfect.every(e => e.kind === "hit" && e.grade === "perfect"));
    assert.equal(timing.summarizePractice(line.targetTaps.length, perfect).passed, true);
  }
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

test("谱面布局按完整小节换行，末行等宽左对齐", () => {
  const layout = scoreLayout.createScoreLayout(5, 1000);
  assert.equal(layout.width, 1000);
  assert.equal(layout.height, 540);
  assert.deepEqual(layout.measures, [
    { x: 10, y: 40, width: 490, isRowStart: true },
    { x: 500, y: 40, width: 490, isRowStart: false },
    { x: 10, y: 220, width: 490, isRowStart: true },
    { x: 500, y: 220, width: 490, isRowStart: false },
    { x: 10, y: 400, width: 490, isRowStart: true },
  ]);
});

test("密集小节使用测量宽度减少每行小节数，并统一缩放反馈坐标", () => {
  const wide = scoreLayout.createScoreLayout(4, 1000, 510);
  assert.equal(wide.height, 720);
  assert.ok(wide.measures.every(m => m.width >= 510 && m.isRowStart));
  const narrow = scoreLayout.createScoreLayout(2, 280, 510);
  assert.equal(narrow.width, 530);
  assert.equal(narrow.width * narrow.scale, 280);
  assert.equal(narrow.measures[0].width, 510);
  assert.equal(narrow.measures[1].y, 220);
});

test("谱面布局支持单行、窄屏、空谱与未测得宽度", () => {
  assert.equal(scoreLayout.createScoreLayout(4, 1460).height, 180);
  const narrow = scoreLayout.createScoreLayout(8, 280);
  assert.equal(narrow.height, 1440);
  assert.equal(narrow.width * narrow.scale, 280);
  assert.ok(narrow.measures.every((measure) => measure.isRowStart && measure.width === 320));
  assert.deepEqual(scoreLayout.createScoreLayout(0, 1000), { width: 1000, height: 0, scale: 1, measures: [] });
  assert.deepEqual(scoreLayout.createScoreLayout(8, 0), { width: 0, height: 0, scale: 1, measures: [] });
  assert.equal(scoreLayout.createScoreLayout(4, 739).height, 720);
  assert.equal(scoreLayout.createScoreLayout(4, 740).height, 360);
});

test("误敲跨行时直接切换到下一小节，不在行间插值", () => {
  const measures = [
    { startOffsetMs: 0, endOffsetMs: 4000, minimumX: 100, maximumX: 700, markerY: 150,
      anchors: [{ offsetMs: 0, x: 100 }, { offsetMs: 4000, x: 700 }] },
    { startOffsetMs: 4000, endOffsetMs: 8000, minimumX: 60, maximumX: 350, markerY: 330,
      anchors: [{ offsetMs: 4000, x: 60 }, { offsetMs: 8000, x: 350 }] },
  ];
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(3999, measures), { x: 699.85, y: 150 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(4000, measures), { x: 60, y: 330 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(6000, measures), { x: 205, y: 330 });
  assert.deepEqual(scoreLayout.timingOffsetToScorePosition(4000, [{ ...measures[1], anchors: [] }]), { x: 60, y: 330 });
});

test("单附点时值、休止符、BPM 缩放与跨小节时间保持一致", () => {
  for (const [noteValue, base] of [["whole", 4], ["half", 2], ["quarter", 1], ["eighth", 0.5]]) {
    for (const kind of ["note", "rest"]) {
      assert.equal(model.rhythmEventToDurationInQuarterNotes({ kind, noteValue }), base);
      assert.equal(model.rhythmEventToDurationInQuarterNotes({ kind, noteValue, dots: 0 }), base);
      assert.equal(model.rhythmEventToDurationInQuarterNotes({ kind, noteValue, dots: 1 }), base * 1.5);
    }
  }
  const dotted = { ...exercise, measures: [
    { elements: [
      { kind: "note", noteValue: "quarter", dots: 1 },
      { kind: "note", noteValue: "eighth" },
      { kind: "note", noteValue: "quarter" },
      { kind: "note", noteValue: "quarter" },
    ] },
    { elements: [
      { kind: "rest", noteValue: "half", dots: 1 },
      { kind: "note", noteValue: "quarter" },
    ] },
  ] };
  const before = structuredClone(dotted);
  for (const bpm of [60, 120]) {
    const beatMs = 60000 / bpm;
    const result = timing.createExerciseTimeline(dotted, bpm, 3, windows);
    assert.deepEqual(result.targetTaps.map((target) => target.offsetMs), [0, 1.5, 2, 3, 7].map(n => n * beatMs));
    assert.deepEqual(result.eventEndOffsetsMs, [1.5, 2, 3, 4, 7, 8].map(n => n * beatMs));
    assert.equal(result.finishOffsetMs, 8 * beatMs);
    assert.equal(timing.getPlaybackPosition(result, 1.5 * beatMs - 1).playingBeatIndex, 0);
    assert.equal(timing.getPlaybackPosition(result, 1.5 * beatMs).playingBeatIndex, 1);
    assert.equal(timing.evaluateTap(result.targetTaps, 1, 1.5 * beatMs, windows).events.at(-1).grade, "perfect");
  }
  assert.deepEqual(dotted, before);
});

test("小节校验拒绝空、欠拍、超拍以及非法附点，并给出小节位置", () => {
  for (const [events, actual] of [
    [[], 0],
    [[{ kind: "note", noteValue: "half" }], 2],
    [[{ kind: "note", noteValue: "whole", dots: 1 }], 6],
    [[{ kind: "note", noteValue: "quarter", dots: 1 }, ...Array.from({ length: 3 }, () => ({ kind: "note", noteValue: "quarter" }))], 4.5],
  ]) {
    assert.throws(() => timing.createExerciseTimeline({
      ...exercise, measures: [...exercise.measures, { elements: events }],
    }, 60, 3, windows), new RegExp(`第 2 小节时值为 ${actual} 拍，应为 4 拍`));
  }
  for (const dots of [2, -1, 0.5, NaN, null, "1"]) {
    assert.throws(() => timing.createExerciseTimeline({
      ...exercise, measures: [{ elements: [{ kind: "note", noteValue: "whole", dots }] }],
    }, 60, 3, windows), /第 1 小节第 1 个事件：附点数/);
  }
  assert.throws(() => model.validateRhythmExercise({ ...exercise, timeSignature: { beats: 3, beatType: 4 } }), /4\/4/);
});

test("附点后的连梁按完整时值定位，跨拍的附点组合不连梁", () => {
  const eighth = { kind: "note", noteValue: "eighth" };
  assert.deepEqual(scoreLayout.getBeatBeamGroups([
    { kind: "note", noteValue: "quarter", dots: 1 }, eighth, eighth, eighth,
    { kind: "note", noteValue: "quarter" },
  ]), [[2, 3]]);
  for (const kind of ["note", "rest"]) {
    assert.deepEqual(scoreLayout.getBeatBeamGroups([
      { kind, noteValue: "half", dots: 1 }, eighth, eighth,
    ]), [[1, 2]]);
  }
  assert.deepEqual(scoreLayout.getBeatBeamGroups([{ ...eighth, dots: 1 }, eighth]), []);
  assert.deepEqual(scoreLayout.getBeatBeamGroups([eighth, { ...eighth, dots: 1 }]), []);
});

test("拍内混合连梁支持四平均、前八后十六、前十六后八、小附点和小切分", () => {
  const values = { S: "sixteenth", E: "eighth", Q: "quarter" };
  for (const [pattern, expected] of [
    ["SSSS", [[0, 1, 2, 3]]], ["ESS", [[0, 1, 2]]],
    ["SSE", [[0, 1, 2]]], ["E.S", [[0, 1]]], ["SES", [[0, 1, 2]]],
    ["SSSSSSSS", [[0, 1, 2, 3], [4, 5, 6, 7]]],
    ["SRS SS", [[2, 3]]], ["RS S E", [[1, 2]]],
    ["S E. S E.", [[0, 1], [2, 3]]],
    ["S E S. S", [[0, 1]]],
    ["S. S E", [[0, 1]]],
  ]) {
    const events = pattern.replaceAll(" ", "").match(/R?[SEQ]\.?/g).map(token => ({
      kind: token.startsWith("R") ? "rest" : "note",
      noteValue: values[token.replace("R", "").replace(".", "")],
      dots: token.endsWith(".") ? 1 : 0,
    }));
    const before = structuredClone(events);
    assert.deepEqual(scoreLayout.getBeatBeamGroups(events), expected, pattern);
    assert.deepEqual(events, before);
  }
});

test("十六分音符和休止符支持时值、附点、BPM 缩放与快速顺序判定", () => {
  for (const kind of ["note", "rest"]) {
    assert.equal(model.rhythmEventToDurationInQuarterNotes({ kind, noteValue: "sixteenth" }), 0.25);
    assert.equal(model.rhythmEventToDurationInQuarterNotes({ kind, noteValue: "sixteenth", dots: 1 }), 0.375);
  }
  const dense = { ...exercise, measures: [{ elements: Array.from({ length: 16 }, () => ({kind: "note", noteValue: "sixteenth"})) }] };
  for (const bpm of [60, 120, 240]) {
    const result = timing.createExerciseTimeline(dense, bpm, 3, windows);
    const interval = 60000 / bpm / 4;
    assert.deepEqual(result.targetTaps.map(t => t.offsetMs), Array.from({length: 16}, (_, i) => i * interval));
    assert.equal(result.finishOffsetMs, Math.max(16 * interval, 15 * interval + windows.hitMs));
    result.targetTaps.forEach((t, i) => assert.equal(timing.evaluateTap(result.targetTaps, i, t.offsetMs, windows).events.at(-1).grade, "perfect"));
  }
  const mixed = { ...exercise, measures: [{ elements: [
    {kind: "note", noteValue: "eighth", dots: 1},
    {kind: "rest", noteValue: "sixteenth"},
    {kind: "note", noteValue: "half", dots: 1},
  ] }] };
  const result = timing.createExerciseTimeline(mixed, 60, 3, windows);
  assert.deepEqual(result.eventEndOffsetsMs, [750, 1000, 4000]);
  assert.deepEqual(result.targetTaps, [{eventIndex: 0, offsetMs: 0}, {eventIndex: 2, offsetMs: 1000}]);
});

const triplet = () => ({
  kind: "triplet",
  notes: Array.from({ length: 3 }, () => ({ kind: "note", noteValue: "eighth" })),
});

test("小三连按组展开为独立事件，整数 tick 保留组边界与普通音符位置", () => {
  const elements = [{kind: "note", noteValue: "quarter"}, triplet(), {kind: "note", noteValue: "half"}];
  const before = structuredClone(elements);
  const expanded = model.expandRhythmElements(elements);
  assert.deepEqual(expanded.events.map(e => e.startTick), [0, 24, 32, 40, 48]);
  assert.deepEqual(expanded.events.map(e => e.durationTicks), [24, 8, 8, 8, 48]);
  assert.equal(expanded.durationTicks, 96);
  assert.deepEqual(expanded.tripletGroups, [[1, 2, 3]]);
  assert.deepEqual(scoreLayout.getBeatBeamGroups(elements), [[1, 2, 3]]);
  assert.deepEqual(elements, before);
});

test("连续三连音跨小节无累计误差，目标、高亮、漏拍和统计仍按独立事件", () => {
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: Array.from({length: 8}, () => ({elements: Array.from({length: 4}, triplet)})) };
  for (const bpm of [60, 120, 137]) {
    const line = timing.createExerciseTimeline(exercise, bpm, 3, windows);
    assert.equal(line.targetTaps.length, 96);
    assert.deepEqual(line.targetTaps.map(t => t.eventIndex), Array.from({length:96}, (_,i)=>i));
    assert.deepEqual(line.targetTaps.map(t => t.offsetMs), Array.from({length:96}, (_,i)=>i * 8 / 24 * (60000 / bpm)));
    assert.deepEqual(line.measures.map(m => m.startOffsetMs), Array.from({length:8}, (_,i)=>i * 4 * (60000 / bpm)));
    assert.equal(line.eventEndOffsetsMs.at(-1), 32 * (60000 / bpm));
    const target = line.targetTaps[13];
    assert.equal(timing.getPlaybackPosition(line, target.offsetMs).playingBeatIndex, 13);
    assert.equal(timing.evaluateTap(line.targetTaps, 13, target.offsetMs, windows).events.at(-1).grade, "perfect");
    const misses = timing.collectExpiredTargets(line.targetTaps, 0, line.finishOffsetMs, windows);
    assert.equal(misses.length, 96);
    assert.equal(timing.summarizePractice(96, misses).missCount, 96);
  }
  const groups = scoreLayout.getBeatBeamGroups(exercise.measures[0].elements);
  assert.deepEqual(groups, [[0,1,2],[3,4,5],[6,7,8],[9,10,11]]);
});

test("三连音与普通连梁、附点及休止符混排时，组保持独立", () => {
  const elements = [
    {kind:"rest",noteValue:"quarter"}, triplet(),
    {kind:"note",noteValue:"eighth",dots:1}, {kind:"note",noteValue:"sixteenth"},
    triplet(),
  ];
  assert.deepEqual(scoreLayout.getBeatBeamGroups(elements), [[1,2,3],[4,5],[6,7,8]]);
  const line = timing.createExerciseTimeline({timeSignature:{beats:4,beatType:4},measures:[{elements}]},60,3,windows);
  assert.deepEqual(line.targetTaps.map(t=>t.eventIndex), [1,2,3,4,5,6,7,8]);
  assert.equal(line.eventEndOffsetsMs.at(-1),4000);
});

test("非拍头三连音保留精确位置和独立连梁，支持跨拍及连续组", () => {
  for (const [noteValue, dots, start] of [["sixteenth", 0, 6], ["eighth", 0, 12], ["eighth", 1, 18]]) {
    const elements = [{ kind: "note", noteValue, dots }, triplet(), triplet()];
    const expanded = model.expandRhythmElements(elements);
    assert.deepEqual(expanded.events.map(e => e.startTick), [0, start, start + 8, start + 16, start + 24, start + 32, start + 40]);
    assert.equal(expanded.durationTicks, start + 48);
    assert.deepEqual(scoreLayout.getBeatBeamGroups(elements), [[1, 2, 3], [4, 5, 6]]);
  }
  const note = noteValue => ({ kind: "note", noteValue });
  const elements = [note("sixteenth"), note("sixteenth"), triplet(), note("sixteenth"), note("sixteenth"), note("half")];
  assert.deepEqual(scoreLayout.getBeatBeamGroups(elements), [[0, 1], [2, 3, 4], [5, 6]]);
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements }, { elements }] };
  for (const bpm of [60, 137]) {
    const line = timing.createExerciseTimeline(exercise, bpm, 3, windows);
    const ticks = [0, 6, 12, 20, 28, 36, 42, 48];
    assert.deepEqual(line.targetTaps.map(t => t.offsetMs), [...ticks, ...ticks.map(t => t + 96)].map(t => t / 24 * (60000 / bpm)));
    assert.equal(line.eventEndOffsetsMs.at(-1), 8 * (60000 / bpm));
  }
  assert.throws(() => model.validateRhythmExercise({
    timeSignature: { beats: 4, beatType: 4 },
    measures: [{ elements: [note("half"), note("quarter"), note("eighth"), triplet()] }],
  }), /第 1 小节/);
});

test("三连音拒绝缺音、多音、附点、休止符及嵌套", () => {
  const normal = triplet().notes[0];
  for (const notes of [
    [normal,normal], [normal,normal,normal,normal],
    [normal,normal,{...normal,dots:1}],
    [normal,normal,{...normal,kind:"rest"}],
    [normal,normal,{...normal,noteValue:"quarter"}],
    [normal,normal,triplet()],
  ]) {
    assert.throws(()=> model.validateRhythmExercise({
      timeSignature:{beats:4,beatType:4},
      measures:[{elements:[{kind:"triplet",notes},{kind:"note",noteValue:"half",dots:1}]}],
    }), /第 1 小节第 1 个事件：小三连/);
  }
});
