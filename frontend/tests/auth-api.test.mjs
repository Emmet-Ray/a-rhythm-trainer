import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let api;
try {
  api = await server.ssrLoadModule("/src/auth/authApi.ts");
} finally {
  await server.close();
}

test("当前用户仅将 401 解释为未登录，查询使用同源 Cookie", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("", { status: 401 }));
  assert.equal(await api.getCurrentUser(), null);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, "/api/auth/me");
  assert.equal(options.credentials, "same-origin");
  assert.equal(options.cache, "no-store");
  assert.equal(options.method, "GET");
});

for (const status of [403, 500, 503]) {
  test(`/me 的 ${status} 不被当作未登录，不自动重试`, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response("secret", { status }));
    await assert.rejects(api.getCurrentUser(), (error) => error.status === status && !error.message.includes("secret"));
    assert.equal(fetch.mock.callCount(), 1);
  });
}

test("网络故障和取消保持异常，不返回未登录", async (t) => {
  const failure = new TypeError("network secret");
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw failure; });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.getCurrentUser(controller.signal), (error) => error === failure);
  assert.equal(fetch.mock.calls[0].arguments[1].signal, controller.signal);
  assert.equal(api.authErrorMessage(failure), "网络连接失败，请检查网络后重试。");
});

test("发送使用正确参数，保留请求 ID，核验不提交另一个手机号或保存凭证", async (t) => {
  const requestId = "a".repeat(43);
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ request_id: requestId }));
  assert.equal(await api.sendLoginCode("13800138000"), requestId);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, "/api/auth/sms-code");
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), { phone_number: "13800138000" });
  fetch.mock.mockImplementation(async () => Response.json({ id: 5, token: "do-not-store" }));
  assert.deepEqual(await api.loginWithCode(requestId, "012345"), { id: 5 });
  assert.deepEqual(JSON.parse(fetch.mock.calls[1].arguments[1].body), { request_id: requestId, code: "012345" });
});

test("退出接受 204，不尝试读取空 JSON", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  assert.equal(await api.logoutSession(), undefined);
  assert.equal(fetch.mock.calls[0].arguments[0], "/api/auth/logout");
  assert.equal(fetch.mock.calls[0].arguments[1].method, "POST");
});

test("错误响应不回显后端原始正文", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "secret" }, { status: 429 }));
  await assert.rejects(api.sendLoginCode("13800138000"), (error) => error.status === 429 && api.authErrorMessage(error) === "发送过于频繁，请稍后再试。");
});

for (const value of [null, {}, { id: "1" }, { id: -1 }, { id: 1.5 }]) {
  test(`拒绝非法用户响应 ${JSON.stringify(value)}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json(value));
    await assert.rejects(api.getCurrentUser(), (error) => error.status === 502);
  });
}

test("拒绝非法请求 ID 与非预期退出响应", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ request_id: "bad" }));
  await assert.rejects(api.sendLoginCode("13800138000"), (error) => error.status === 502);
  await assert.rejects(api.logoutSession(), (error) => error.status === 502);
});
