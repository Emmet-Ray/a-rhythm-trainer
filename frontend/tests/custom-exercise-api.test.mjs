import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false,
  server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let api;
try { api = await server.ssrLoadModule("/src/api/customExercises.ts"); }
finally { await server.close(); }

const content = { timeSignature: { beats: 4, beatType: 4 }, measures: [
  { elements: [{ kind: "note", noteValue: "whole" }] },
] };
const detail = { id: "custom-test", name: "练习", mode: "tapping", exercise: content, created_at: "2026-09-12T00:00:00Z" };
const input = { name: detail.name, mode: detail.mode, exercise: content };

test("更新只提交名称与节奏，验证原 ID 和模式；删除接受无响应体的 204", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(detail));
  assert.equal((await api.updateAccountExercise(detail.id, input)).id, detail.id);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, `/api/custom-exercises/${detail.id}`);
  assert.equal(options.method, "PUT");
  assert.deepEqual(JSON.parse(options.body), {name: input.name, exercise: content});
  fetch.mock.mockImplementation(async () => Response.json({...detail, mode: "dictation"}));
  await assert.rejects(api.updateAccountExercise(detail.id, input), error => error.status === 502);
  fetch.mock.mockImplementation(async () => Response.json({...detail, id: "other"}));
  await assert.rejects(api.updateAccountExercise(detail.id, input), error => error.status === 502);
  fetch.mock.mockImplementation(async () => new Response(null, {status: 204}));
  await api.deleteAccountExercise(detail.id);
  assert.equal(fetch.mock.calls.at(-1).arguments[1].method, "DELETE");
});

test("保存只提交题目字段，使用 Cookie，不保存客户端归属", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(detail, { status: 201 }));
  const saved = await api.saveAccountExercise({ ...input, user_id: 99, id: "client-id", created_at: "old" });
  assert.equal(saved.createdAt, detail.created_at);
  assert.deepEqual(saved.exercise, content);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, "/api/custom-exercises");
  assert.equal(options.method, "POST");
  assert.equal(options.credentials, "same-origin");
  assert.equal(options.cache, "no-store");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), input);
});

test("分页保留参数，摘要不包含完整谱面或用户字段", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({items: [{...detail, user_id: 99}], limit: 2, offset: 4}));
  const signal = new AbortController().signal;
  const result = await api.listAccountExercises("tapping", {limit: 2, offset: 4, signal});
  assert.deepEqual(result, {items: [{id: detail.id, name: detail.name, mode: detail.mode, createdAt: detail.created_at}], limit: 2, offset: 4});
  assert.equal(fetch.mock.calls[0].arguments[0], "/api/custom-exercises?mode=tapping&limit=2&offset=4");
  assert.equal(fetch.mock.calls[0].arguments[1].signal, signal);
});

test("成功的空页可以返回空列表", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({items: [], limit: 50, offset: 0}));
  assert.deepEqual(await api.listAccountExercises("dictation"), {items: [], limit: 50, offset: 0});
});

test("读取按路径编码 ID，并支持取消信号", async (t) => {
  const id = "id/with?query#hash";
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({...detail, id}));
  const signal = new AbortController().signal;
  assert.equal((await api.getAccountExercise(id, signal)).id, id);
  assert.equal(fetch.mock.calls[0].arguments[0], `/api/custom-exercises/${encodeURIComponent(id)}`);
  assert.equal(fetch.mock.calls[0].arguments[1].signal, signal);
});

for (const status of [401, 403, 404, 422, 503]) {
  test(`${status} 明确抛错，不返回空数据、不回显原文、不重试`, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({detail:"secret"}, {status}));
    for (const action of [() => api.saveAccountExercise(input), () => api.listAccountExercises("tapping"), () => api.getAccountExercise(detail.id), () => api.updateAccountExercise(detail.id, input), () => api.deleteAccountExercise(detail.id)]) {
      await assert.rejects(action(), error => error instanceof api.CustomExerciseApiError && error.status === status && !error.message.includes("secret"));
    }
    assert.equal(fetch.mock.callCount(), 5);
  });
}

test("网络中断保留保存结果不确定的提示，不自动重试", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("secret network error"); });
  await assert.rejects(api.saveAccountExercise(input), error => error.status === 0 && !error.message.includes("secret"));
  assert.equal(fetch.mock.callCount(), 1);
});

test("请求取消保留 AbortError，包括读取响应体阶段", async (t) => {
  const error = new DOMException("aborted", "AbortError");
  const fetch = t.mock.method(globalThis, "fetch", async () => {throw error;});
  await assert.rejects(api.getAccountExercise(detail.id), caught => caught === error);
  fetch.mock.mockImplementation(async () => ({ok: true, status: 200, json: async () => {throw error;}}));
  await assert.rejects(api.listAccountExercises("tapping"), caught => caught === error);
});

for (const value of [null, {}, {...detail, created_at: "invalid"}, {...detail, exercise: {}}, {...detail, exercise: {...content, measures: []}}, {...detail, id: "other"}]) {
  test(`拒绝不可信题目响应 ${JSON.stringify(value)}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json(value));
    await assert.rejects(api.getAccountExercise(detail.id), error => error.status === 502);
  });
}

for (const page of [{items: [], limit: 1, offset: 0}, {items: [detail, detail], limit: 50, offset: 0}, {items: [{...detail, mode:"dictation"}], limit:50, offset:0}, {items: null, limit:50, offset:0}]) {
  test("分页响应不匹配或内容异常时拒绝整页", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json(page));
    await assert.rejects(api.listAccountExercises("tapping"), error => error.status === 502);
  });
}

test("非法查询不发送请求，非 JSON 和错误成功状态不作为成功", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("not-json"));
  await assert.rejects(api.listAccountExercises("tapping", {limit:101}), error => error.status === 422);
  await assert.rejects(api.getAccountExercise(""), error => error.status === 422);
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(api.getAccountExercise(detail.id), error => error.status === 502);
  await assert.rejects(api.saveAccountExercise(input), error => error.status === 502);
});
