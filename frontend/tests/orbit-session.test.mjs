import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

// Importing in Node proves that running a session does not initialize Phaser or require a DOM.
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const { createOrbitSession } = await server.ssrLoadModule('/src/game/runtime/OrbitSession.ts');
const { createOrbitTrack } = await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
const { practiceSounds, metronomeSounds } = await server.ssrLoadModule('/src/rhythm/SoundSamples.ts');
await server.close();
const track = createOrbitTrack({ melody: [{ beat: 0, duration: 1, midi: 60, gain: .4 }, { beat: 1, duration: 1, midi: 62, gain: .4 }], chords: [[]], measureBeats: [2] });
const sounds = { practice: 'piano', metronome: 'mechanical' };
const windows = { hitMs: 150, perfectMs: 50 };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, cancelAndHoldAtTime() {} });
const node = () => ({ connect(output) { return output; }, disconnect() {} });

function fixture(t) {
  let context, resume = Promise.resolve();
  const changes = [], leases = [];
  t.mock.timers.enable({ apis: ['setInterval'] });
  t.mock.method(globalThis, 'fetch', async () => response());
  t.mock.method(performance, 'now', () => (context?.currentTime ?? 0) * 1000);
  class Context {
    currentTime = 0; state = 'running'; destination = {}; sources = []; closed = 0;
    constructor() { context = this; }
    resume() { return resume; }
    async close() { this.state = 'closed'; this.closed++; }
    async decodeAudioData() { return { duration: 2 }; }
    createGain() { return { ...node(), gain: param() }; }
    createBufferSource() {
      const source = { ...node(), stops: [], ended: false,
        start(at, offset, duration) { this.at = at; this.end = at + duration; },
        stop(at = context.currentTime) { this.stops.push(at); },
        endNow() { if (!this.ended) { this.ended = true; this.onended?.(); } },
      };
      this.sources.push(source); return source;
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  globalThis.AudioContext = Context;
  const session = createOrbitSession({ track, onChange: snapshot => changes.push(snapshot), acquirePlayback: stop => {
    const lease = { stop, releases: 0 }; leases.push(lease); return () => lease.releases++;
  } });
  t.after(() => {
    session.dispose();
    if (previous) Object.defineProperty(globalThis, 'AudioContext', previous); else delete globalThis.AudioContext;
  });
  return { session, changes, leases, get context() { return context; },
    delayResume(value) { resume = value; },
    start: (mode = 'challenge', precision = windows) => session.start(60, sounds, precision, mode),
    advance(seconds, endSources = true) {
      context.currentTime = seconds;
      if (endSources) for (const source of context.sources) if (source.end <= seconds || source.stops.some(at => at <= seconds)) source.endNow();
      t.mock.timers.tick(50);
    },
    tap() { session.tap(context.currentTime * 1000); },
  };
}

test('stop during resume prevents sample loading; repeated disposal closes once and prevents restart', async t => {
  const f = fixture(t), pending = deferred(); f.delayResume(pending.promise);
  const starting = f.start(); assert.equal(f.changes.at(-1).phase, 'loading');
  f.session.stop(); pending.resolve(); await starting;
  assert.equal(fetch.mock.callCount(), 0); assert.equal(f.context.sources.length, 0);
  assert.equal(f.changes.at(-1).phase, 'ready'); assert.equal(f.leases[0].releases, 1);
  f.session.dispose(); f.session.dispose(); await f.start();
  assert.equal(f.context.closed, 1); assert.equal(f.leases.length, 1);
});

test('cancelled sample completion cannot schedule audio or replace a newer round', async t => {
  const f = fixture(t), pending = deferred(); fetch.mock.mockImplementation(() => pending.promise);
  const old = f.start(); await Promise.resolve(); f.session.stop();
  fetch.mock.mockImplementation(async () => response());
  const other = { practice: practiceSounds.find(s => s.id !== sounds.practice).id, metronome: metronomeSounds.find(s => s.id !== sounds.metronome).id };
  await f.session.start(120, other, windows, 'preview');
  const count = f.context.sources.length, snapshot = f.changes.at(-1);
  pending.resolve(response()); await old;
  assert.equal(f.context.sources.length, count); assert.equal(f.changes.at(-1), snapshot);
  assert.equal(f.session.readFrame().beatMs, 500); assert.equal(snapshot.mode, 'preview');
  assert.equal(f.leases[0].releases, 1); assert.equal(f.leases[1].releases, 0);
});

test('active loading errors release ownership and permit retry; cancelled errors stay silent', async t => {
  const f = fixture(t); fetch.mock.mockImplementation(async () => { throw Error('offline'); });
  await assert.rejects(f.start(), /加载失败/);
  assert.equal(f.changes.at(-1).phase, 'ready'); assert.equal(f.leases[0].releases, 1);
  const pending = deferred(); fetch.mock.mockImplementation(() => pending.promise);
  const old = f.start(); await Promise.resolve(); f.session.stop();
  pending.reject(Error('old failure')); await old;
  fetch.mock.mockImplementation(async () => response()); await f.start();
  assert.equal(f.changes.at(-1).phase, 'count-in');
});

test('background clock detects misses without a renderer and releases ownership exactly once', async t => {
  const f = fixture(t); await f.start(); f.advance(4.3);
  assert.equal(f.changes.at(-1).phase, 'failing');
  assert.ok(f.context.sources.every(s => s.ended || s.stops.length)); assert.equal(f.leases[0].releases, 1);
  f.advance(4.7); assert.equal(f.changes.at(-1).phase, 'failed');
  const count = f.changes.length; f.advance(20); assert.equal(f.changes.length, count);
  f.session.stop(); assert.equal(f.leases[0].releases, 1);
});

test('early last hit locks input, preserves landing motion and waits for real tails', async t => {
  const f = fixture(t); await f.start(); f.advance(4.1); f.tap(); f.advance(5); f.tap();
  let frame = f.session.readFrame(); assert.equal(frame.snapshot.phase, 'finishing');
  assert.ok(Math.abs(frame.timeMs - 900) < 1e-8); assert.equal(frame.terminalAt, 1000);
  const count = f.context.sources.length; f.tap(); assert.equal(f.context.sources.length, count);
  f.advance(6.2, false); frame = f.session.readFrame();
  assert.equal(frame.timeMs, 1000); assert.ok(frame.visualTimeMs > 2000);
  assert.equal(frame.snapshot.phase, 'finishing'); assert.equal(f.leases[0].releases, 0);
  f.advance(7.1); assert.equal(f.changes.at(-1).phase, 'completed'); assert.equal(f.leases[0].releases, 1);
});

test('stopping during finishing invalidates old voice endings after restart', async t => {
  const f = fixture(t); await f.start(); f.advance(4.1); f.tap(); f.advance(5.1); f.tap();
  const oldSources = [...f.context.sources]; f.leases[0].stop();
  assert.equal(f.changes.at(-1).phase, 'ready'); await f.start('preview');
  for (const source of oldSources) source.endNow();
  f.advance(9.3); assert.equal(f.changes.at(-1).phase, 'playing');
  assert.equal(f.changes.at(-1).mode, 'preview'); assert.equal(f.leases[1].releases, 0);
});

test('preview schedules once, ignores taps and waits for voices without rendering', async t => {
  const f = fixture(t); await f.start('preview'); const count = f.context.sources.length;
  f.advance(4.1); f.tap(); f.session.readFrame(); f.session.readFrame();
  assert.equal(f.context.sources.length, count); f.advance(6.2, false);
  assert.equal(f.changes.at(-1).phase, 'finishing'); assert.equal(f.changes.at(-1).hits, 2);
  assert.equal(f.leases[0].releases, 0); f.advance(7.1);
  assert.equal(f.changes.at(-1).phase, 'completed'); assert.equal(f.leases[0].releases, 1);
});

test('start captures precision before audio loading; suspended audio does not advance judgement', async t => {
  const f = fixture(t), pending = deferred(), precision = { ...windows };
  f.delayResume(pending.promise); const starting = f.start('challenge', precision);
  precision.hitMs = 1; pending.resolve(); await starting;
  f.advance(4.2); f.tap(); assert.equal(f.changes.at(-1).hits, 1);
  f.context.state = 'suspended'; f.advance(6); assert.equal(f.changes.at(-1).phase, 'playing');
  f.context.state = 'running'; f.advance(6); assert.equal(f.changes.at(-1).phase, 'failing');
});
