import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let sounds;
try { sounds = await server.ssrLoadModule("/src/settings/soundPreferences.ts"); }
finally { await server.close(); }

function storage(t, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value });
  t.after(() => previous ? Object.defineProperty(globalThis, "localStorage", previous) : delete globalThis.localStorage);
}

test("音色偏好默认、保存恢复与无效选项回退", t => {
  let stored = null;
  storage(t, {
    getItem: () => stored, setItem: (_, value) => { stored = value; },
  });
  assert.equal(sounds.initializeSoundPreferences().practice, "piano");
  sounds.selectSounds({ practice: "guitar", metronome: "bell" });
  assert.deepEqual(sounds.initializeSoundPreferences(), { practice: "guitar", metronome: "bell", storageAvailable: true });
  stored = '{"practice":"removed","metronome":"claves"}';
  assert.equal(sounds.initializeSoundPreferences().practice, "piano");
  assert.equal(sounds.getSoundPreferences().metronome, "claves");
});

test("存储失败时当前会话仍使用用户选择", t => {
  storage(t, { getItem() { throw Error(); }, setItem() { throw Error(); } });
  assert.equal(sounds.initializeSoundPreferences().storageAvailable, false);
  assert.deepEqual(sounds.selectSounds({ practice: "guitar", metronome: "hihat" }), {
    practice: "guitar", metronome: "hihat", storageAvailable: false,
  });
});
