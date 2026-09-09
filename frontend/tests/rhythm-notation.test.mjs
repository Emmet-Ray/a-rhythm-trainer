import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let notation;
try {
  notation = await server.ssrLoadModule("/src/rhythm/notation/RhythmNotation.ts");
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
