import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let GeneratedExerciseStore;
try { ({ GeneratedExerciseStore } = await server.ssrLoadModule("/src/exercises/GeneratedExerciseStore.ts")); }
finally { await server.close(); }
const generated = { id: "one", title: "练习", description: "", exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: "note", noteValue: "whole" }] }] } };

test("临时生成练习保留各个版本并隔离读写与身份", () => {
  const store = new GeneratedExerciseStore();
  const original = structuredClone(generated);
  store.add(original);
  store.add({ ...generated, id: "two", title: "新版本" });
  original.title = "外部修改";
  store.get("one").exercise.measures.length = 0;
  assert.deepEqual(store.get("one"), generated);
  assert.equal(store.get("two").title, "新版本");
  assert.equal(store.get("missing"), null);
  assert.equal(new GeneratedExerciseStore().get("one"), null);
});

test("非法题目不能进入临时题目集合", () => {
  const store = new GeneratedExerciseStore();
  assert.throws(() => store.add({ ...generated, exercise: {} }));
  assert.equal(store.get("one"), null);
});
