import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let PlaybackGroup;
try { ({ PlaybackGroup } = await server.ssrLoadModule("/src/practice/PlaybackGroup.ts")); }
finally { await server.close(); }

test("starting another player stops the previous player; stale release preserves the new owner", () => {
  const group = new PlaybackGroup();
  const stopped = [];
  const releaseFirst = group.acquire(() => stopped.push("first"));
  group.acquire(() => stopped.push("second"));
  assert.deepEqual(stopped, ["first"]);
  releaseFirst();
  group.stop();
  group.stop();
  assert.deepEqual(stopped, ["first", "second"]);
});

test("completed or unmounted players release ownership without being stopped twice", () => {
  const group = new PlaybackGroup();
  let stops = 0;
  const release = group.acquire(() => stops++);
  release();
  group.stop();
  assert.equal(stops, 0);
});

test("stop callback may release its ownership during replacement", () => {
  const group = new PlaybackGroup();
  const release = group.acquire(() => release());
  let stopped = false;
  group.acquire(() => { stopped = true; });
  group.stop();
  assert.equal(stopped, true);
});
