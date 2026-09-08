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
  audio.scheduleTapSound(context, 12, pending);
  audio.playTapSound(context, pending);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(pending.length, 2);
  assert.notEqual(pending[0], pending[1]);
  assert.equal(pending[0].buffer, pending[1].buffer);
  assert.deepEqual(pending[0].started, [12, 0.01, 0.8]);
  assert.deepEqual(pending[1].started, [10, 0.01, 0.8]);
  assert.deepEqual(context.gains[0].gain.changes.at(-2), [0.7, 12.4]);
  assert.deepEqual(context.gains[0].gain.changes.at(-1), [0, 12.8]);
  const first = pending[0];
  first.onended();
  assert.equal(pending.length, 1);
  assert.equal(first.disconnected, true);
  assert.equal(context.gains[0].disconnected, true);
});
