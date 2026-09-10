import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let saveCustomExercise, listCustomExercises;
try {
  ({ saveCustomExercise, listCustomExercises } = await server.ssrLoadModule("/src/exercises/customExercises.ts"));
} finally {
  await server.close();
}

function memoryStorage(raw = null) {
  return {
    raw,
    writes: 0,
    getItem() { return this.raw; },
    setItem(_key, value) { this.raw = value; this.writes++; },
  };
}
const note = (noteValue, dots) => ({ kind: "note", noteValue, ...(dots === undefined ? {} : { dots }) });
const candidate = (mode = "tapping") => ({
  name: "  我的练习  ", mode,
  exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [note("whole")] }] },
});

test("空存储返回空列表，不主动写入初始化数据", () => {
  const storage = memoryStorage();
  assert.deepEqual(listCustomExercises("tapping", storage), []);
  assert.deepEqual(listCustomExercises("dictation", storage), []);
  assert.equal(storage.writes, 0);
  assert.equal(storage.raw, null);
});

test("保存产生稳定独立 ID，同名不覆盖，最新在前且模式分离", () => {
  const storage = memoryStorage();
  const first = saveCustomExercise(candidate(), storage);
  const second = saveCustomExercise(candidate(), storage);
  const dictation = saveCustomExercise(candidate("dictation"), storage);
  assert.equal(first.name, "我的练习");
  assert.notEqual(first.id, second.id);
  assert.deepEqual(listCustomExercises("tapping", storage).map((item) => item.id), [second.id, first.id]);
  assert.deepEqual(listCustomExercises("dictation", storage), [dictation]);
  assert.equal(JSON.parse(storage.raw).version, 1);
});

test("只保存题目字段，草稿、返回值和读取值均不与存储共享引用", () => {
  const storage = memoryStorage();
  const input = { ...candidate(), bpm: 120, metronomeEnabled: false };
  input.exercise.measures[0].elements = [
    note("quarter", 1), note("eighth"),
    { kind: "triplet", notes: [note("eighth"), note("eighth"), note("eighth")] },
    { kind: "rest", noteValue: "quarter" },
  ];
  const original = structuredClone(input);
  const saved = saveCustomExercise(input, storage);
  assert.deepEqual(input, original);
  assert.deepEqual(Object.keys(saved).sort(), ["exercise", "id", "mode", "name"]);
  const serialized = storage.raw;
  input.exercise.measures[0].elements[2].notes[0].dots = 1;
  saved.exercise.measures[0].elements.pop();
  const read = listCustomExercises("tapping", storage);
  assert.deepEqual(read[0].exercise, original.exercise);
  read[0].exercise.measures[0].elements[2].notes.pop();
  assert.equal(storage.raw, serialized);
  assert.deepEqual(listCustomExercises("tapping", storage)[0].exercise, original.exercise);
});

test("无名称、空题目、欠拍、超拍、非法拍号和三连音均拒绝保存，保留原数据", () => {
  const invalid = [
    { ...candidate(), name: "  " },
    { ...candidate(), mode: "geometry" },
    { ...candidate(), exercise: null },
    { ...candidate(), exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [] } },
    ...[
      [], [note("quarter")], [note("whole"), note("quarter")], [null],
      [note("whole", 2)], [{ kind: "triplet", notes: [note("eighth")] }],
      [{ kind: "triplet", notes: [null, null, null] }],
    ].map((elements) => ({ ...candidate(), exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements }] } })),
    { ...candidate(), exercise: { ...candidate().exercise, timeSignature: { beats: 3, beatType: 4 } } },
  ];
  for (const input of invalid) {
    const storage = memoryStorage();
    saveCustomExercise(candidate(), storage);
    const before = storage.raw;
    assert.throws(() => saveCustomExercise(input, storage));
    assert.equal(storage.raw, before);
    assert.equal(storage.writes, 1);
  }
});

test("损坏或不支持的数据不能当成空列表，也不能追加覆盖", () => {
  const valid = { ...candidate(), id: "existing" };
  const badExercise = { ...valid, exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [note("quarter")] }] } };
  const records = [
    "", "not-json", "null", "[]",
    JSON.stringify({ version: 2, exercises: [valid] }),
    JSON.stringify({ version: 1, exercises: [valid, valid] }),
    JSON.stringify({ version: 1, exercises: [badExercise] }),
    JSON.stringify({ version: 1, exercises: [{ ...valid, mode: "unknown" }] }),
    JSON.stringify({ version: 1, exercises: [{ ...valid, name: " " }] }),
  ];
  for (const raw of records) {
    const storage = memoryStorage(raw);
    assert.throws(() => listCustomExercises("tapping", storage), /损坏或版本暂不支持/);
    assert.throws(() => saveCustomExercise(candidate(), storage), /损坏或版本暂不支持/);
    assert.equal(storage.raw, raw);
    assert.equal(storage.writes, 0);
  }
});

test("读取受限和写入失败明确报错，不修改原数据或草稿，恢复后可重试", () => {
  const storage = memoryStorage();
  const input = candidate();
  const before = structuredClone(input);
  const originalSet = storage.setItem;
  storage.setItem = () => { throw new Error("quota"); };
  assert.throws(() => saveCustomExercise(input, storage), /保存失败.*草稿仍保留/);
  assert.equal(storage.raw, null);
  assert.deepEqual(input, before);
  storage.setItem = originalSet;
  const saved = saveCustomExercise(input, storage);
  assert.equal(listCustomExercises("tapping", storage)[0].id, saved.id);
  const raw = storage.raw;
  storage.getItem = () => { throw new Error("blocked"); };
  assert.throws(() => listCustomExercises("tapping", storage), /无法读取/);
  assert.throws(() => saveCustomExercise(input, storage), /无法读取/);
  assert.equal(storage.raw, raw);
});
