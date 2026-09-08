import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let audio;
try {
  audio = await server.ssrLoadModule("/src/RhythmAudio.ts");
} finally {
  await server.close();
}

function fakeContext() {
  const sources = [];
  const gains = [];
  return {
    currentTime: 10,
    destination: {},
    sources,
    gains,
    decodes: 0,
    async decodeAudioData() { this.decodes++; return { duration: 13.32 }; },
    createBufferSource() {
      const source = {
        connect: (gain) => gain,
        start(...args) { this.started = args; },
        disconnect() { this.disconnected = true; },
      };
      sources.push(source);
      return source;
    },
    createGain() {
      const gain = {
        gain: {
          changes: [],
          setValueAtTime(value, time) { this.changes.push([value, time]); },
          linearRampToValueAtTime(value, time) { this.changes.push([value, time]); },
        },
        connect() {},
        disconnect() { this.disconnected = true; },
      };
      gains.push(gain);
      return gain;
    },
  };
}

const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });

test("钢琴采样并发和重复准备只下载解码一次", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => response());
  const context = fakeContext();
  await Promise.all([audio.prepareTapSound(context), audio.prepareTapSound(context)]);
  await audio.prepareTapSound(context);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(context.decodes, 1);
  assert.match(fetch.mock.calls[0].arguments[0], /assets\/audio\/felt-piano-a4\.mp3$/);
});

test("下载或解码失败后可以重新加载", async (t) => {
  let attempt = 0;
  t.mock.method(globalThis, "fetch", async () => ++attempt === 1 ? { ok: false, status: 404 } : response());
  const context = fakeContext();
  await assert.rejects(audio.prepareTapSound(context), /钢琴声音加载失败/);
  const decode = context.decodeAudioData;
  context.decodeAudioData = async () => { throw new Error("bad audio"); };
  await assert.rejects(audio.prepareTapSound(context), /钢琴声音加载失败/);
  context.decodeAudioData = decode;
  await audio.prepareTapSound(context);
  assert.equal(attempt, 3);
});

test("发声同步复用采样，保留调度时刻并应用偏移和淡出，结束释放节点", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => response());
  const context = fakeContext();
  assert.throws(() => audio.playTapSound(context), /prepareTapSound/);
  await audio.prepareTapSound(context);
  const pending = [];
  audio.scheduleTapSound(context, 12, 14, pending);
  audio.playTapSound(context, pending);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(pending.length, 2);
  assert.notEqual(pending[0], pending[1]);
  assert.equal(pending[0].buffer, pending[1].buffer);
  assert.deepEqual(pending[0].started, [12, 0.01, 2]);
  assert.equal(pending[1].started[0], 10);
  assert.equal(pending[1].started[1], 0.01);
  assert.ok(Math.abs(pending[1].started[2] - 0.2) < 1e-10);
  assert.deepEqual(context.gains[0].gain.changes.at(-2), [0.7, 13.92]);
  assert.deepEqual(context.gains[0].gain.changes.at(-1), [0, 14]);
  const first = pending[0];
  first.onended();
  assert.equal(pending.length, 1);
  assert.equal(first.disconnected, true);
  assert.equal(context.gains[0].disconnected, true);
});

test("击拍立即发声，每次均为固定短音，不依赖目标时值或敲击时刻", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response());
  const context = fakeContext();
  await audio.prepareTapSound(context);
  for (const now of [9.9, 10, 10.1]) {
    context.currentTime = now;
    audio.playTapSound(context);
    const [start, , duration] = context.sources.at(-1).started;
    assert.equal(start, now);
    assert.ok(Math.abs(duration - 0.2) < 1e-10);
    assert.deepEqual(context.gains.at(-1).gain.changes.at(-1), [0, now + 0.2]);
  }
});

test("短音按比例淡出，慢速长音保持完整时值，采样不循环延长", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response());
  const context = fakeContext();
  await audio.prepareTapSound(context);
  for (const duration of [0.05, 0.125, 1, 2, 4, 8, 20]) {
    audio.scheduleTapSound(context, 0, duration);
    const actual = Math.min(duration, 13.32 - 0.01);
    assert.equal(context.sources.at(-1).started[2], actual);
    assert.deepEqual(context.gains.at(-1).gain.changes.at(-2), [0.7, actual - Math.min(0.08, actual / 4)]);
    assert.deepEqual(context.gains.at(-1).gain.changes.at(-1), [0, actual]);
  }
  for (const [start, end] of [[1, 1], [1, 0], [-1, 1], [0, NaN], [0, Infinity]]) {
    assert.throws(() => audio.scheduleTapSound(context, start, end), /声音终点/);
  }
});
