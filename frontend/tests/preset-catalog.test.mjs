import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { parsePresetCatalog, findPresetQuestion } = await server.ssrLoadModule("/src/exercises/presetCatalog.ts");
const { createPresetCatalogStore } = await server.ssrLoadModule("/src/exercises/presetCatalogStore.ts");
const original = JSON.parse(await readFile(new URL("../../content/preset-exercises.json", import.meta.url), "utf8"));
const fixture = () => structuredClone(original);

test("发布解析器保留所有内容、顺序和 ID，不持有输入引用", () => {
  const input = fixture();
  const catalog = parsePresetCatalog(input);
  assert.deepEqual(catalog, input);
  input.topics[0].title = "changed";
  assert.notEqual(catalog.topics[0].title, "changed");
  assert.equal(findPresetQuestion("missing", catalog.topics), undefined);
});

test("空题库、缺少模式和空题组为合法空状态", () => {
  assert.deepEqual(parsePresetCatalog({ schemaVersion: 1, topics: [] }).topics, []);
  const input = fixture();
  input.topics[0].modes = [];
  assert.deepEqual(parsePresetCatalog(input).topics[0].modes, []);
});

test("拒绝不支持的版本、结构、标识和模式，并指出问题位置", () => {
  for (const [mutate, message] of [
    [data => { data.schemaVersion = 2; }, /版本/],
    [data => { data.topics = {}; }, /topics/],
    [data => { data.topics[0].title = "  "; }, /第 1 个主题.*标题/],
    [data => { data.topics[0].id = "../bad"; }, /ID/],
    [data => { data.topics[1].id = data.topics[0].id; }, /重复 ID/],
    [data => { data.topics[0].modes[0].questions[1].id = data.topics[0].modes[0].questions[0].id; }, /第 2 题.*重复 ID/],
    [data => { data.topics[1].modes[0].questions[0].id = data.topics[0].modes[0].questions[0].id; }, /重复 ID/],
    [data => { data.topics[0].modes[0].mode = "unknown"; }, /模式/],
    [data => { data.topics[0].modes.push(data.topics[0].modes[0]); }, /模式/],
    [data => { data.topics[0].modes[0].mode = "geometry"; }, /尚未支持/],
  ]) {
    const data = fixture();
    mutate(data);
    assert.throws(() => parsePresetCatalog(data), message);
  }
});

test("发布与播放共用节奏校验：拒绝空题、小节不满、未知符号、附点和错误三连音", () => {
  for (const mutate of [
    exercise => { exercise.measures = []; },
    exercise => { exercise.timeSignature.beats = 3; },
    exercise => { exercise.measures[0].elements.pop(); },
    exercise => { exercise.measures[0].elements[0].noteValue = "unknown"; },
    exercise => { exercise.measures[0].elements[0].dots = 2; },
    exercise => { exercise.measures[0].elements[0] = { kind: "triplet", notes: [] }; },
  ]) {
    const data = fixture();
    mutate(data.topics[0].modes[0].questions[0].exercise);
    assert.throws(() => parsePresetCatalog(data), /第 1 个主题：tapping 第 1 题/);
  }
});

test("预加载和页面读取合并一次请求，成功后路由切换不重新请求", async () => {
  let requests = 0;
  const store = createPresetCatalogStore(async (url, options) => {
    requests++;
    assert.equal(url, "/content/preset-exercises.json");
    assert.equal(options.cache, "no-cache");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(fixture());
  });
  const seen = [];
  const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot().status));
  assert.equal(store.getSnapshot().status, "idle");
  const first = store.load();
  assert.equal(store.load(), first);
  await first;
  const snapshot = store.getSnapshot();
  await store.load();
  await store.load(true);
  assert.equal(requests, 1);
  assert.equal(store.getSnapshot(), snapshot);
  assert.equal(snapshot.status, "ready");
  assert.deepEqual(seen, ["loading", "ready"]);
  unsubscribe();
});

test("网络、HTTP、HTML 回退、无效题库和超时均可明确重试，不伪装成找不到题目", async () => {
  for (const failure of [
    () => { throw new Error("offline"); },
    () => new Response("unavailable", { status: 503 }),
    () => new Response("<!doctype html>"),
    () => Response.json({ schemaVersion: 2, topics: [] }),
    () => { throw new DOMException("timeout", "TimeoutError"); },
  ]) {
    let requests = 0;
    const store = createPresetCatalogStore(() => {
      requests++;
      return requests === 1 ? failure() : Promise.resolve(Response.json(fixture()));
    });
    await store.load();
    assert.equal(store.getSnapshot().status, "error");
    await store.load();
    assert.equal(requests, 1, "悬停/渲染不得自动循环请求失败资源");
    await store.load(true);
    assert.equal(requests, 2);
    assert.equal(store.getSnapshot().status, "ready");
  }
});

test("同一会话内容稳定，新会话读取更新内容，不需要改变题目 URL", async () => {
  let live = fixture();
  const fetchCatalog = async () => Response.json(live);
  const current = createPresetCatalogStore(fetchCatalog);
  await current.load();
  const id = live.topics[0].modes[0].questions[0].id;
  live = fixture();
  live.topics[0].modes[0].questions[0].title = "更新后的题名";
  await current.load();
  assert.notEqual(findPresetQuestion(id, current.getSnapshot().catalog.topics).question.title, "更新后的题名");
  const refreshed = createPresetCatalogStore(fetchCatalog);
  await refreshed.load();
  assert.equal(findPresetQuestion(id, refreshed.getSnapshot().catalog.topics).question.title, "更新后的题名");
});
