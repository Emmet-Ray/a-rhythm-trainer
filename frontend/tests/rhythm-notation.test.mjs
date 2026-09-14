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

test("草稿谱单行铺满双小节，长题横向扩展而不增加高度", () => {
  const short = layout.createDraftScoreLayout(2, 1500, 4);
  const long = layout.createDraftScoreLayout(8, 1500, 4);
  assert.equal(short.width * short.scale, 1500);
  assert.equal(long.height, short.height);
  assert.equal(long.scale, short.scale);
  assert.deepEqual(long.measures.slice(0, 2), short.measures);
  assert.ok(long.width * long.scale > 1500);
  assert.ok(long.measures.every(m => m.y === 40));
});

test("窄屏草稿保留可读尺寸和稳定小节边界", () => {
  const draft = layout.createDraftScoreLayout(4, 320, 4);
  assert.equal(draft.scale, 1);
  assert.ok(draft.width > 320);
  assert.ok(draft.measures[0].width >= 100 + 16 * 30);
  for (let i = 1; i < draft.measures.length; i++) {
    assert.equal(draft.measures[i].x, draft.measures[i - 1].x + draft.measures[i - 1].width);
  }
});

test("同宽窗口的一、二、多小节保持相同符号倍率和显示高度", () => {
  for (const width of [320, 768, 1134, 1500, 2000]) {
    const two = layout.createDraftScoreLayout(2, width, 4);
    for (const count of [1, 2, 4, 8]) {
      const draft = layout.createDraftScoreLayout(count, width, 4);
      assert.equal(draft.scale, two.scale);
      assert.equal(draft.height * draft.scale, two.height * two.scale);
      assert.equal(draft.measures[0].width, two.measures[0].width);
      assert.ok(draft.measures.every(measure => measure.y === two.measures[0].y));
    }
  }
});

test("小节定位只在需要时滚动，窄屏对齐左端并限制末尾位置", () => {
  const draft = layout.createDraftScoreLayout(4, 1180, 4);
  assert.equal(layout.getDraftMeasureScrollLeft(draft, 0, 0, 1180), 0);
  assert.equal(layout.getDraftMeasureScrollLeft(draft, 1, 0, 1180), 0);
  const next = layout.getDraftMeasureScrollLeft(draft, 2, 0, 1180);
  assert.equal(next, 570);
  assert.equal(layout.getDraftMeasureScrollLeft(draft, 2, next, 1180), next);
  assert.equal(layout.getDraftMeasureScrollLeft(draft, 0, 570, 1180), 10);
  assert.equal(layout.getDraftMeasureScrollLeft(draft, 3, 0, 320), 1750);
  assert.equal(layout.getDraftMeasureScrollLeft(draft, 99, 150, 320), 150);
});

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
