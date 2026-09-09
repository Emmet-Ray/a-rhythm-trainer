import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

// 沿用现有测试的 TypeScript 加载方式，不启动 HTTP 服务。
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let isMeasureAnswerCorrect;
let rhythmEventToDurationInQuarterNotes;
try {
  ({ isMeasureAnswerCorrect } = await server.ssrLoadModule("/src/RhythmDictation.tsx"));
  ({ rhythmEventToDurationInQuarterNotes } = await server.ssrLoadModule("/src/RhythmModel.ts"));
} finally {
  await server.close();
}

const note = (noteValue, dots) => ({ kind: "note", noteValue, ...(dots === undefined ? {} : { dots }) });
const expected = [note("quarter"), note("eighth"), note("eighth"), note("half")];

test("完全相同的记谱通过，不要求对象引用相同", () => {
  assert.equal(isMeasureAnswerCorrect(structuredClone(expected), expected), true);
  const withRest = [note("half"), { kind: "rest", noteValue: "half" }];
  assert.equal(isMeasureAnswerCorrect(structuredClone(withRest), withRest), true);
});

test("空白、少写、多写都不通过", () => {
  for (const answer of [[], expected.slice(0, -1), [...expected, note("eighth")]]) {
    assert.equal(isMeasureAnswerCorrect(answer, expected), false);
  }
  assert.equal(isMeasureAnswerCorrect([], []), false);
});

test("音符顺序或时值不同不通过", () => {
  assert.equal(isMeasureAnswerCorrect([expected[1], expected[0], ...expected.slice(2)], expected), false);
  assert.equal(isMeasureAnswerCorrect([note("half"), ...expected.slice(1)], expected), false);
});

test("总拍数相同不代表答案相同", () => {
  const quarters = Array.from({ length: 4 }, () => note("quarter"));
  const eighths = Array.from({ length: 8 }, () => note("eighth"));
  assert.equal(isMeasureAnswerCorrect(eighths, quarters), false);
});

test("全音符与二分音符听写按实际记谱验证，不接受同拍数替换", () => {
  const first = [note("half"), note("quarter"), note("quarter")];
  const second = [note("whole")];
  assert.equal(isMeasureAnswerCorrect(structuredClone(first), first), true);
  assert.equal(isMeasureAnswerCorrect(structuredClone(second), second), true);
  assert.equal(isMeasureAnswerCorrect([note("half"), note("half")], second), false);
  assert.equal(isMeasureAnswerCorrect([note("quarter"), note("half"), note("quarter")], first), false);
});

test("音符和休止符不能互相替代", () => {
  const restAnswer = [{ kind: "rest", noteValue: "quarter" }, ...expected.slice(1)];
  assert.equal(isMeasureAnswerCorrect(restAnswer, expected), false);
  assert.equal(isMeasureAnswerCorrect(expected, restAnswer), false);
});

test("五种休止符按对应时值占拍，正确答案通过，同长度音符不能替代", () => {
  for (const [noteValue, beats] of [["whole", 4], ["half", 2], ["quarter", 1], ["eighth", 0.5], ["sixteenth", 0.25]]) {
    const rest = { kind: "rest", noteValue };
    assert.equal(rhythmEventToDurationInQuarterNotes(rest), beats);
    const target = Array.from({ length: 4 / beats }, () => ({ ...rest }));
    assert.equal(isMeasureAnswerCorrect(structuredClone(target), target), true);
    assert.equal(isMeasureAnswerCorrect([note(noteValue), ...target.slice(1)], target), false);
    assert.equal(isMeasureAnswerCorrect([], target), false);
  }
  assert.equal(isMeasureAnswerCorrect(
    [{ kind: "rest", noteValue: "half" }, { kind: "rest", noteValue: "half" }],
    [{ kind: "rest", noteValue: "whole" }],
  ), false);
});

test("十六分音符每个占四分之一拍，满小节及混合记谱可验证", () => {
  assert.equal(rhythmEventToDurationInQuarterNotes(note("sixteenth")), 0.25);
  const sixteenths = Array.from({ length: 16 }, () => note("sixteenth"));
  assert.equal(isMeasureAnswerCorrect(structuredClone(sixteenths), sixteenths), true);
  assert.equal(isMeasureAnswerCorrect(sixteenths.slice(0, -1), sixteenths), false);
  assert.equal(isMeasureAnswerCorrect([...sixteenths, note("sixteenth")], sixteenths), false);
  const mixed = [note("half"), note("quarter"), note("eighth"), note("sixteenth"), { kind: "rest", noteValue: "sixteenth" }];
  assert.equal(mixed.reduce((sum, event) => sum + rhythmEventToDurationInQuarterNotes(event), 0), 4);
  assert.equal(isMeasureAnswerCorrect(structuredClone(mixed), mixed), true);
  assert.equal(isMeasureAnswerCorrect([...mixed.slice(0, -2), note("eighth")], mixed), false);
});

test("附点不同不通过；相同附点通过", () => {
  const dotted = [note("quarter", 1), note("eighth"), note("half")];
  assert.equal(isMeasureAnswerCorrect(structuredClone(dotted), dotted), true);
  assert.equal(isMeasureAnswerCorrect([note("quarter"), ...dotted.slice(1)], dotted), false);
  assert.equal(isMeasureAnswerCorrect(dotted, [note("quarter", 0), ...dotted.slice(1)]), false);
});

test("dots 省略与显式 0 双向等价", () => {
  const explicit = expected.map((event) => ({ ...event, dots: 0 }));
  assert.equal(isMeasureAnswerCorrect(explicit, expected), true);
  assert.equal(isMeasureAnswerCorrect(expected, explicit), true);
});

test("成功和失败都不修改输入，支持冻结的数组和事件", () => {
  const frozen = (events) => Object.freeze(events.map((event) => Object.freeze({ ...event })));
  const target = frozen(expected);
  const answer = frozen(expected);
  const wrong = frozen([...expected].reverse());
  assert.equal(isMeasureAnswerCorrect(answer, target), true);
  assert.equal(isMeasureAnswerCorrect(wrong, target), false);
  assert.deepEqual(answer, expected);
  assert.deepEqual(target, expected);
  assert.deepEqual(wrong, [...expected].reverse());
});
