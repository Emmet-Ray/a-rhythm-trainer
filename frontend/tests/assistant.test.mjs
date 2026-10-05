import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false,
  server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let api, AssistantConversation, AssistantContext, parseGeneratedExercise;
try {
  ({ parseGeneratedExercise } = await server.ssrLoadModule("/src/exercises/GeneratedExercise.ts"));
  api = await server.ssrLoadModule("/src/api/assistant.ts");
  ({ AssistantConversation } = await server.ssrLoadModule("/src/assistant/conversation.ts"));
  ({ AssistantContext } = await server.ssrLoadModule("/src/assistant/assistantContext.ts"));
} finally { await server.close(); }
const stamp = "2026-10-03T02:00:00+00:00";
const snapshot = { page: "editor", description: "编辑页", state: { measure_count: 2 } };
const empty = () => ({ id: "session1", entries: [], is_running: false, last_run_status: null });
const final = () => ({ ...empty(), last_run_status: "completed", entries: [
  { type: "user", text: "问题", created_at: stamp, page_context: snapshot },
  { type: "assistant", text: "完整回答", created_at: stamp },
] });
const events = [ { type: "text_delta", text: "部分" },
  { type: "message_completed", text: "完整回答" }, { type: "run_completed" } ];
function sse(values = events) {
  const bytes = new TextEncoder().encode(values.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""));
  return new Response(new ReadableStream({ start(controller) {
    // 刻意按字节切块，覆盖中文 UTF-8 和 CRLF 的边界。
    for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1));
    controller.close();
  } }), { headers: { "Content-Type": "text/event-stream" } });
}

test("发送只包含新消息和本次快照，解析新版事件和分片中文", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => sse());
  const received = [];
  await api.sendMessage("a/b", "问题", snapshot, e => received.push(e), new AbortController().signal);
  assert.deepEqual(received, events);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, "/api/assistant/sessions/a%2Fb/messages");
  assert.deepEqual(JSON.parse(options.body), { text: "问题", page_context: snapshot });
  assert.equal(options.credentials, "same-origin");
});

test("缺少运行完成、错误事件、错误顺序均不算成功", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => sse(events.slice(0, 2)));
  const call = () => api.sendMessage("s", "问题", null, () => {}, new AbortController().signal);
  await assert.rejects(call(), /连接中断/);
  fetch.mock.mockImplementation(async () => sse([{ type: "run_failed", message: "模拟失败" }]));
  await assert.rejects(call(), /模拟失败/);
  fetch.mock.mockImplementation(async () => sse([{ type: "run_completed" }]));
  await assert.rejects(call(), /顺序/);
});

test("过期会话明确报错，不自动创建或重发", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("secret", { status: 404 }));
  await assert.rejects(api.getSession("s", new AbortController().signal), e => e.status === 404 && !e.message.includes("secret"));
  assert.equal(fetch.mock.calls.length, 1);
});

test("完成后使用后端 entries 校准显示，多轮复用会话 ID", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options]);
    if (url === "/api/assistant/sessions") return Response.json(empty(), { status: 201 });
    if (options.method === "POST") return sse();
    return Response.json(final());
  });
  const conversation = new AssistantConversation();
  await conversation.send("问题", snapshot);
  assert.deepEqual(conversation.getSnapshot().session.entries, final().entries);
  assert.equal(conversation.getSnapshot().pending, null);
  await conversation.send("再问", null);
  assert.equal(calls.filter(([url]) => url === "/api/assistant/sessions").length, 1);
  assert.deepEqual(JSON.parse(calls.filter(([, o]) => o.method === "POST").at(-1)[1].body), { text: "再问", page_context: null });
});

test("失败保留服务端用户记录，临时回答不混进历史", async t => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") return Response.json(empty());
    if (options.method === "POST") return sse([{ type: "text_delta", text: "未完成" }, { type: "run_failed", message: "失败" }]);
    return Response.json({ ...final(), entries: final().entries.slice(0, 1), last_run_status: "failed" });
  });
  const conversation = new AssistantConversation();
  await conversation.send("问题", snapshot);
  assert.equal(conversation.getSnapshot().session.entries.length, 1);
  assert.equal(conversation.getSnapshot().pending, null);
  assert.equal(conversation.getSnapshot().busy, false);
});

test("双击不重复提交，同步失败时阻止下一次发送", async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") { await waiting; return Response.json(empty()); }
    if (options.method === "POST") return sse();
    throw new TypeError("network");
  });
  const conversation = new AssistantConversation();
  const running = conversation.send("问题", snapshot);
  assert.equal(await conversation.send("重复", snapshot), false);
  release(); await running;
  assert.equal(conversation.getSnapshot().needsSync, true);
  const before = fetch.mock.calls.length;
  assert.equal(await conversation.send("下一条", snapshot), false);
  assert.equal(fetch.mock.calls.length, before);
});

test("新对话或身份重置后，旧请求不会恢复旧历史", async t => {
  let release;
  t.mock.method(globalThis, "fetch", async () => {
    await new Promise(resolve => { release = resolve; });
    return Response.json(empty());
  });
  const conversation = new AssistantConversation();
  const running = conversation.send("旧问题", snapshot);
  conversation.reset(); release(); await running;
  assert.equal(conversation.getSnapshot().session, null);
  assert.equal(conversation.getSnapshot().busy, false);
});

test("停止取消流并查询后端，已完成的回答可以恢复", async t => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") return Response.json(empty());
    if (options.method === "POST") {
      started();
      return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    }
    return Response.json(final());
  });
  const conversation = new AssistantConversation();
  const running = conversation.send("问题", snapshot);
  await ready; conversation.stop(); await running;
  assert.deepEqual(conversation.getSnapshot().session.entries, final().entries);
  assert.match(conversation.getSnapshot().notice, /已完成/);
});

test("页面快照深复制，旧页面卸载不清除新页面，离开页面清空", () => {
  const context = new AssistantContext(), old = Symbol(), current = Symbol();
  const page = structuredClone(snapshot);
  context.publish(old, page);
  page.state.measure_count = 9;
  assert.equal(context.readCurrentPageContext().state.measure_count, 2);
  const copy = context.readCurrentPageContext(); copy.state.measure_count = 10;
  assert.equal(context.readCurrentPageContext().state.measure_count, 2);
  context.publish(current, { page: "home", description: "首页", state: {} });
  context.remove(old);
  assert.equal(context.readCurrentPageContext().page, "home");
  context.remove(current);
  assert.equal(context.readCurrentPageContext(), null);
});

test("会话保留工具调用与工具结果，供后续卡片使用", async t => {
  const value = { ...empty(), entries: [
    { type: "assistant", text: "", created_at: stamp,
      tool_calls: [{ id: "c1", name: "propose_rhythm_exercise", arguments: "{}" }] },
    { type: "tool_result", tool_call_id: "c1", tool_name: "propose_rhythm_exercise",
      content: "已生成", details: { generated_exercise: { id: "exercise1" } }, is_error: false, created_at: stamp },
  ] };
  t.mock.method(globalThis, "fetch", async () => Response.json(value));
  assert.deepEqual(await api.getSession("session1", new AbortController().signal), value);
});

test("拒绝字段不完整的工具结果", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ ...empty(), entries: [
    { type: "tool_result", created_at: stamp, content: "text" },
  ] }));
  await assert.rejects(api.getSession("session1", new AbortController().signal), /会话格式异常/);
});


test("候选练习先校验节奏，返回独立数据", () => {
  const value = { id: "proposal", title: "四拍", description: "基础", exercise: {
    timeSignature: { beats: 4, beatType: 4 },
    measures: [{ elements: Array.from({ length: 4 }, () => ({ kind: "note", noteValue: "quarter" })) }],
  } };
  const proposal = parseGeneratedExercise(value);
  proposal.exercise.measures[0].elements[0].kind = "rest";
  assert.equal(value.exercise.measures[0].elements[0].kind, "note");
  assert.throws(() => parseGeneratedExercise({ ...value, id: "" }));
  assert.throws(() => parseGeneratedExercise({ ...value, exercise: { ...value.exercise, measures: [{ elements: [] }] } }));
});

test("应用能力随编辑目标注册与注销，旧编辑器不能注销新目标", () => {
  const scope = new AssistantContext();
  const first = Symbol(), second = Symbol();
  let applied;
  const apply = proposal => { applied = proposal; return true; };
  scope.registerApply(first, () => false);
  scope.registerApply(second, apply);
  scope.removeApply(first);
  assert.equal(scope.getApplySnapshot(), apply);
  assert.equal(scope.getApplySnapshot()({ id: "p" }), true);
  assert.deepEqual(applied, { id: "p" });
  assert.equal(scope.readCurrentPageContext(), null);
  scope.registerApply(second, null);
  assert.equal(scope.getApplySnapshot(), null);
  scope.registerApply(second, apply);
  scope.removeApply(second);
  assert.equal(scope.getApplySnapshot(), null);
});


test("配置状态区分可用、未配置与配置错误，不创建会话", async t => {
  for (const status of ["ready", "unconfigured", "invalid"]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ status, message: "提示" }));
    assert.deepEqual(await api.getAssistantStatus(new AbortController().signal), { status, message: "提示" });
    assert.equal(mock.mock.calls[0].arguments[0], "/api/assistant/status");
    mock.mock.restore();
  }
});
test("配置查询拒绝异常响应，不误判为助手可用", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ status: "ready" }));
  await assert.rejects(api.getAssistantStatus(new AbortController().signal), /状态格式异常/);
});
