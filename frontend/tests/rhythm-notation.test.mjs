import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let notation;
let layout;
let timing;
try {
  notation = await server.ssrLoadModule("/src/rhythm/notation/RhythmNotation.ts");
  layout = await server.ssrLoadModule("/src/rhythm/notation/RhythmScoreLayout.ts");
  timing = await server.ssrLoadModule("/src/rhythm/RhythmTiming.ts");
} finally {
  await server.close();
}

test("节奏谱只显示中线，首小节使用打击乐谱号，后续小节不重复谱号", () => {
  const first = notation.createRhythmStave(10, 40, 300, true);
  const next = notation.createRhythmStave(310, 40, 300, false);
  assert.deepEqual(first.getConfigForLines().map((line) => line.visible), [false, false, true, false, false]);
  assert.equal(first.getClef(), "percussion");
  assert.equal(next.getModifiers(undefined, "Clef").length, 0);
  assert.equal(notation.getRhythmLineY(first), notation.getRhythmLineY(next));
  assert.equal(notation.getRhythmLineY(first), first.getYForLine(2));
});

test("内置小节号靠近单线谱，编号不改变谱表宽度与音符起点", () => {
  for (const [index, y] of [40, 190, 340].entries()) {
    const stave = notation.createRhythmStave(10, y, 300, true);
    const startX = stave.getNoteStartX();
    stave.setMeasure(index + 1);
    assert.equal(stave.getMeasure(), index + 1);
    assert.equal(stave.getWidth(), 300);
    assert.equal(stave.getNoteStartX(), startX);
    // VexFlow 的编号基线为顶部文字位置 + 3，而非布局起点上方。
    const distance = notation.getRhythmLineY(stave) - (stave.getYForTopText() + 3);
    assert.ok(distance >= 20 && distance <= 35);
  }
});

test("调速只重映射反馈时间，保持已排版坐标、换行与小节边界", () => {
  const exercise = {
    timeSignature: { beats: 4, beatType: 4 },
    measures: [
      { elements: [{ kind: "note", noteValue: "half" }, { kind: "note", noteValue: "half" }] },
      { elements: [{ kind: "rest", noteValue: "whole" }] },
    ],
  };
  const geometry = [
    { minimumX: 80, maximumX: 400, markerY: 132, eventXs: [100, 250] },
    { minimumX: 60, maximumX: 400, markerY: 312, eventXs: [90] },
  ];
  const before = structuredClone(geometry);
  const windows = { perfectMs: 50, hitMs: 150 };
  const slow = layout.createTimingFeedbackLayout(timing.createExerciseTimeline(exercise, 60, undefined, windows), geometry);
  const fast = layout.createTimingFeedbackLayout(timing.createExerciseTimeline(exercise, 120, undefined, windows), geometry);
  assert.deepEqual(geometry, before);
  for (let i = 0; i < slow.length; i++) {
    assert.deepEqual(fast[i].anchors, slow[i].anchors.map(anchor => ({ ...anchor, offsetMs: anchor.offsetMs / 2 })));
  }
  for (const offset of [-100, 0, 1000, 3999, 4000, 6000, 8000, 9000]) {
    assert.deepEqual(layout.timingOffsetToScorePosition(offset / 2, fast), layout.timingOffsetToScorePosition(offset, slow));
  }
  assert.equal(layout.timingOffsetToScorePosition(2000, fast).y, 312);
});

test("无事件坐标的小节也能用两端锚点定位反馈", () => {
  const timeline = { measures: [{ firstEventIndex: 0, startOffsetMs: 0, endOffsetMs: 4000 }], eventStartOffsetsMs: [] };
  const measures = layout.createTimingFeedbackLayout(timeline, [{ minimumX: 80, maximumX: 400, markerY: 132, eventXs: [] }]);
  assert.deepEqual(measures[0].anchors, [{ offsetMs: 0, x: 80 }, { offsetMs: 4000, x: 400 }]);
  assert.deepEqual(layout.timingOffsetToScorePosition(2000, measures), { x: 240, y: 132 });
});

test("所有普通时值及休止符保持记谱时值、落在中线，无音高差异", () => {
  for (const kind of ["note", "rest"]) {
    for (const noteValue of ["whole", "half", "quarter", "eighth", "sixteenth"]) {
      const event = { kind, noteValue };
      const note = notation.rhythmEventToVexFlowStaveNote(event);
      assert.equal(note.isRest(), kind === "rest");
      assert.equal(note.getKeyLine(0), 3);
      assert.equal(note.getStemDirection(), 1);
    }
  }
});
