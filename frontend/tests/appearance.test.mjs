import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const appearance = await server.ssrLoadModule("/src/settings/appearance.ts");

function browser(t, storage) {
  const root = { dataset: {} };
  for (const [name, value] of [["localStorage", storage], ["document", { documentElement: root }]]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => previous
      ? Object.defineProperty(globalThis, name, previous)
      : delete globalThis[name]);
  }
  return root;
}

test("启动时默认紫色，恢复合法选择，非法或未知值回退默认且不写存储", t => {
  let stored = null;
  const root = browser(t, { getItem: () => stored, setItem: () => assert.fail("初始化不应写入") });
  for (const [value, expected] of [[null, "purple"], ["blue", "blue"], ["teal", "teal"], ["purple", "purple"], ["unknown", "purple"], ['{"theme":"blue"}', "purple"]]) {
    stored = value;
    assert.deepEqual(appearance.initializeAppearance(), { theme: expected, storageAvailable: true });
    assert.equal(root.dataset.theme, expected);
  }
});

test("选择立即应用并可刷新恢复；重置只修改配色，不触碰自定义练习", t => {
  const values = new Map([["rhythm-trainer.custom-exercises", "untouched"]]);
  const root = browser(t, { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  appearance.initializeAppearance();
  assert.deepEqual(appearance.selectTheme("teal"), { theme: "teal", storageAvailable: true });
  assert.equal(root.dataset.theme, "teal");
  assert.equal(appearance.initializeAppearance().theme, "teal");
  appearance.selectTheme(appearance.DEFAULT_THEME);
  assert.equal(appearance.initializeAppearance().theme, "purple");
  assert.equal(values.get("rhythm-trainer.custom-exercises"), "untouched");
  assert.equal(values.size, 2);
});

test("存储读写失败不阻止换色，当前选择在再次读取界面状态时仍保留", t => {
  const root = browser(t, {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("quota"); },
  });
  assert.deepEqual(appearance.initializeAppearance(), { theme: "purple", storageAvailable: false });
  assert.deepEqual(appearance.selectTheme("blue"), { theme: "blue", storageAvailable: false });
  assert.equal(root.dataset.theme, "blue");
  assert.equal(appearance.getAppearance().theme, "blue");
  assert.equal(appearance.selectTheme("purple").storageAvailable, false);
});

test("访问 localStorage 本身抛错也不会使应用启动或切换失败", t => {
  browser(t, null);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
  assert.equal(appearance.initializeAppearance().theme, "purple");
  assert.equal(appearance.selectTheme("teal").storageAvailable, false);
});
