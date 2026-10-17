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
let markers;
try {
  notation = await server.ssrLoadModule("/src/rhythm/notation/RhythmNotation.ts");
  layout = await server.ssrLoadModule("/src/rhythm/notation/RhythmScoreLayout.ts");
  timing = await server.ssrLoadModule("/src/rhythm/RhythmTiming.ts");
  markers = await server.ssrLoadModule("/src/rhythm/notation/RhythmTimingMarker.ts");
} finally {
  await server.close();
}

test("击拍反馈不依赖红绿区分：命中实心圆、误敲叉号、漏拍空心圆", () => {
  for (const kind of ["hit", "wrongTap", "miss"]) {
    const calls = [];
    const context = Object.fromEntries(["save", "restore", "setFillStyle", "setStrokeStyle", "setLineWidth", "beginPath", "arc", "moveTo", "lineTo", "fill", "stroke"].map(name => [name, (...args) => {
      calls.push([name, ...args]);
      return context;
    }]));
    markers.drawTimingMarker(context, 100, 120, kind);
    assert.equal(calls.some(([name]) => name === "fill"), kind === "hit");
    assert.equal(calls.some(([name]) => name === "stroke"), kind !== "hit");
    if (kind === "wrongTap") {
      assert.equal(calls.some(([name]) => name === "arc"), false);
      assert.deepEqual(calls.filter(([name]) => name === "moveTo" || name === "lineTo"), [
        ["moveTo", 96, 116], ["lineTo", 104, 124], ["moveTo", 104, 116], ["lineTo", 96, 124],
      ]);
    } else {
      assert.deepEqual(calls.find(([name]) => name === "arc").slice(1, 4), [100, 120, kind === "hit" ? 6 : 5]);
    }
    assert.equal(calls.at(-1)[0], "restore");
  }
});

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

test("不同拍号草稿保持相同符号倍率与高度，容量仅影响最小小节宽度", () => {
  for (const width of [320, 768, 1134, 1500, 2000]) {
    for (const count of [1, 2, 8]) {
      const reference = layout.createDraftScoreLayout(count, width, 4);
      for (const beats of [2, 3, 4]) {
        const draft = layout.createDraftScoreLayout(count, width, beats);
        assert.equal(draft.scale, reference.scale);
        assert.equal(draft.height * draft.scale, reference.height * reference.scale);
        assert.ok(draft.measures[0].width >= 100 + beats * 4 * 30);
      }
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

test("恢复末尾小节时宽屏完整可见，窄屏对齐小节起点且不越界", () => {
  for (const width of [320, 768, 1180, 1500]) {
    for (const count of [1, 2, 4, 8]) {
      const draft = layout.createDraftScoreLayout(count, width, 4);
      const measure = draft.measures[count - 1];
      const left = measure.x * draft.scale;
      const right = (measure.x + measure.width) * draft.scale;
      const scroll = layout.getDraftMeasureScrollLeft(draft, count - 1, 0, width);
      assert.ok(scroll >= 0 && scroll <= Math.max(0, draft.width * draft.scale - width));
      if (measure.width * draft.scale <= width) {
        assert.ok(left >= scroll && right <= scroll + width);
      } else {
        assert.equal(scroll, left);
      }
      assert.equal(layout.getDraftMeasureScrollLeft(draft, count - 1, scroll, width), scroll);
    }
  }
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


test("小节背景包含谱面外侧留白，内部无缝且不拉伸末行", () => {
  for (const score of [layout.createDraftScoreLayout(4, 1180, 4), layout.createScoreLayout(5, 1000), layout.createScoreLayout(3, 280)]) {
    const bounds = layout.getScoreMeasureBounds(score);
    score.measures.forEach((measure, index) => {
      const bound = bounds[index];
      if (measure.isRowStart) assert.equal(bound.left, 0);
      else assert.ok(Math.abs(bounds[index - 1].left + bounds[index - 1].width - bound.left) < 0.001);
      assert.ok(bound.left <= measure.x * score.scale);
      assert.ok(bound.left + bound.width >= (measure.x + measure.width) * score.scale - 0.001);
      if (!score.measures[index + 1] || score.measures[index + 1].isRowStart) {
        assert.ok(Math.abs(bound.left + bound.width - (measure.x + measure.width + 10) * score.scale) < 0.001);
      }
    });
  }
  const score = layout.createScoreLayout(5, 1000);
  const bounds = layout.getScoreMeasureBounds(score);
  assert.equal(bounds[1].left + bounds[1].width, score.width * score.scale);
  assert.ok(bounds.at(-1).width < score.width * score.scale);
});

test("符号点击区域以实际坐标中点吸附，缩放后不覆盖行间空白", () => {
  const bounds = layout.getScoreEventBounds([
    { eventXs: [50, 90, 150], markerY: 110, minimumX: 30, maximumX: 190 },
    { eventXs: [60], markerY: 260, minimumX: 40, maximumX: 200 },
  ], 1.5);
  assert.equal(bounds[0].left + bounds[0].width, bounds[1].left);
  assert.equal(bounds[1].left + bounds[1].cursorX, 90 * 1.5);
  assert.ok(bounds[2].top + bounds[2].height < bounds[3].top);
  assert.deepEqual(bounds.map(b => [b.measure, b.eventIndex]), [[0,0],[0,1],[0,2],[1,3]]);
});
