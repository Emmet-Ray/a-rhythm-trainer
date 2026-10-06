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
const empty = () => ({ id: "session1", messages: [], is_running: false, last_run_status: null });
const final = () => ({ ...empty(), last_run_status: "completed", messages: [
  { id: "u1", role: "user", parts: [{ type: "text", text: "问题" }], metadata: { created_at: stamp, page_context: snapshot } },
  { id: "a1", role: "assistant", parts: [{ type: "step-start" }, { type: "text", text: "完整回答", state: "done" }] },
] });
const events = [{ type: "start", messageId: "a1" }, { type: "start-step" },
  { type: "text-start", id: "t1" }, { type: "text-delta", id: "t1", delta: "完整回答" },
  { type: "text-end", id: "t1" }, { type: "finish-step" }, { type: "finish" }];
function sse(values = events) {
  const bytes = new TextEncoder().encode(values.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join("") + "data: [DONE]\n\n");
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1));
    controller.close();
  } }), { headers: { "Content-Type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
}

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

test("SDK 消费分片中文，仅提交新消息与快照，结束后核对服务端历史", async t => {
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") return Response.json(empty());
    if (options.method === "POST") { request = JSON.parse(options.body); return sse(); }
    const saved = final(); saved.messages[0].id = request.message_id;
    return Response.json(saved);
  });
  const c = new AssistantConversation();
  await c.send("问题", snapshot);
  assert.deepEqual(Object.keys(request).sort(), ["message_id", "page_context", "text"]);
  assert.deepEqual(request.page_context, snapshot);
  assert.equal(request.text, "问题");
  assert.equal(c.chat.messages[1].parts[1].text, "完整回答");
  assert.equal(c.getSnapshot().busy, false);
  assert.deepEqual(c.chat.messages, c.getSnapshot().session.messages);
  c.dispose();
});

test("SDK 工具结果在后续回复前可用，停止后从服务端保留已生成练习", async t => {
  let controller, userId;
  const output = { generated_exercise: { id: "p1" } };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") return Response.json(empty());
    if (options.method === "POST") {
      userId = JSON.parse(options.body).message_id;
      return new Response(new ReadableStream({ start(c) {
        controller = c;
        options.signal.addEventListener("abort", () => c.error(options.signal.reason), { once: true });
      } }), { headers: { "Content-Type": "text/event-stream" } });
    }
    return Response.json({ ...empty(), last_run_status: "cancelled", messages: [
      { id: userId, role: "user", parts: [{ type: "text", text: "问题" }] },
      { id: "a1", role: "assistant", parts: [{ type: "step-start" }, {
        type: "tool-propose_rhythm_exercise", toolCallId: "c1", state: "output-available", input: {}, output,
      }] },
    ] });
  });
  const c = new AssistantConversation();
  const pending = c.send("问题", snapshot);
  const tick = () => new Promise(resolve => setTimeout(resolve, 5));
  await tick();
  const emit = event => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  emit({ type: "start", messageId: "a1" }); emit({ type: "start-step" });
  emit({ type: "tool-input-start", toolCallId: "c1", toolName: "propose_rhythm_exercise" });
  emit({ type: "tool-input-available", toolCallId: "c1", toolName: "propose_rhythm_exercise", input: {} });
  emit({ type: "tool-output-available", toolCallId: "c1", output });
  await tick();
  assert.equal(c.getSnapshot().busy, true);
  assert.deepEqual(c.chat.messages[1].parts[1].output, output);
  c.stop(); await pending;
  assert.deepEqual(c.chat.messages[1].parts[1].output, output);
  assert.equal(c.getSnapshot().busy, false);
  assert.match(c.getSnapshot().notice, /已停止/);
  c.dispose();
});

test("SDK 错误与过期会话不自动重发，未确认同步时阻止继续发送", async t => {
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") return Response.json(empty());
    if (options.method === "POST") { posts++; return new Response("", { status: 404 }); }
    return new Response("", { status: 404 });
  });
  const c = new AssistantConversation();
  await c.send("问题", snapshot);
  assert.equal(c.getSnapshot().expired, true);
  assert.equal(posts, 1);
  assert.equal(await c.send("问题", snapshot), false);
  c.dispose();
});

test("流中未收到错误事件时，仍按后端最终状态提示失败", async t => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") return Response.json(empty());
    if (options.method === "POST") return sse(events.slice(0, -2));
    return Response.json({ ...final(), last_run_status: "failed" });
  });
  const c = new AssistantConversation();
  await c.send("问题", snapshot);
  assert.match(c.getSnapshot().error, /未完成/);
  assert.equal(c.getSnapshot().needsSync, false);
  c.dispose();
});
