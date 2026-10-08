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
  assert.equal(await conversation.send("重复", snapshot), "rejected");
  release(); await running;
  assert.equal(conversation.getSnapshot().needsSync, true);
  const before = fetch.mock.calls.length;
  assert.equal(await conversation.send("下一条", snapshot), "rejected");
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
  assert.deepEqual(Object.keys(request).sort(), ["images", "message_id", "page_context", "text"]);
  assert.deepEqual(request.page_context, snapshot);
  assert.equal(request.text, "问题");
  assert.equal(c.chat.messages[1].parts[1].text, "完整回答");
  assert.equal(c.getSnapshot().busy, false);
  assert.equal("messages" in c.getSnapshot().session, false);
  assert.equal(c.getSnapshot().acceptedInput.id, request.message_id);
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
  assert.equal(await c.send("问题", snapshot), "rejected");
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


test("刷新恢复服务端消息，恢复失败阻止发送且不遗忘会话", async t => {
  const values = new Map([["rhythm:assistant:v1:test", "session1"]]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage; });
  let fail = true;
  t.mock.method(globalThis, "fetch", async () => { if (fail) throw new Error("offline"); return Response.json(final()); });
  const conversation = new AssistantConversation("test");
  await conversation.restore();
  assert.equal(conversation.getSnapshot().expired, true);
  assert.equal(await conversation.send("不能另开一轮", null), "rejected");
  assert.equal(values.get("rhythm:assistant:v1:test"), "session1");
  fail = false;
  await conversation.restore();
  assert.equal(conversation.getSnapshot().expired, false);
  assert.equal(conversation.chat.messages.at(-1).parts.at(-1).text, "完整回答");
  conversation.dispose();
  assert.equal(values.get("rhythm:assistant:v1:test"), "session1");
  const reopened = new AssistantConversation("test");
  await reopened.restore();
  reopened.reset();
  assert.equal(values.has("rhythm:assistant:v1:test"), false);
});

test("打开历史期间新建会话，迟到响应不能覆盖新会话", async t => {
  let release;
  t.mock.method(globalThis, "fetch", async () => { await new Promise(resolve => { release = resolve; }); return Response.json(final()); });
  const conversation = new AssistantConversation();
  const loading = conversation.open("session1");
  assert.equal(conversation.getSnapshot().restoring, true);
  conversation.reset(); release();
  assert.equal(await loading, false);
  assert.equal(conversation.getSnapshot().session, null);
  assert.deepEqual(conversation.chat.messages, []);
});

test("恢复仍在运行的会话时禁止重发，后续同步恢复最终回答", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json(++calls === 1 ? { ...empty(), is_running: true, last_run_status: "running" } : final()));
  const conversation = new AssistantConversation();
  assert.equal(await conversation.open("session1"), true);
  assert.equal(conversation.getSnapshot().needsSync, true);
  assert.equal(await conversation.send("不要重复调用", null), "rejected");
  await conversation.sync();
  assert.equal(conversation.getSnapshot().needsSync, false);
  assert.equal(conversation.chat.messages.at(-1).parts.at(-1).text, "完整回答");
});

test("初始化在恢复结果确定前保持等待，没有历史时才进入新对话", async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let saved = "session1", release;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => saved, setItem: () => {}, removeItem: () => {},
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage; });
  t.mock.method(globalThis, "fetch", async () => { await new Promise(resolve => { release = resolve; }); return Response.json(final()); });
  const c = new AssistantConversation("test");
  assert.equal(c.getSnapshot().initialized, false);
  const pending = c.restore();
  assert.equal(c.getSnapshot().initialized, false);
  release(); await pending;
  assert.equal(c.getSnapshot().initialized, true);
  assert.equal(c.getSnapshot().session.id, "session1");
  saved = null;
  const fresh = new AssistantConversation("test");
  await fresh.restore();
  assert.equal(fresh.getSnapshot().initialized, true);
  assert.equal(fresh.getSnapshot().session, null);
});

for (const fail of [false, true]) test(`生成中切换历史：${fail ? "失败后保留原会话并要求同步" : "旧流结束不能覆盖目标"}`, async t => {
  let ready, oldSignal;
  const streaming = new Promise(resolve => { ready = resolve; });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") return Response.json(empty());
    if (options.method === "POST") {
      oldSignal = options.signal;
      return new Response(new ReadableStream({ start(controller) {
        options.signal.addEventListener("abort", () => controller.error(options.signal.reason), { once: true });
        ready();
      } }), { headers: { "Content-Type": "text/event-stream" } });
    }
    if (url.endsWith("session2")) {
      if (fail) throw new TypeError("offline");
      return Response.json({ ...final(), id: "session2" });
    }
    return Response.json({ ...final(), last_run_status: "cancelled" });
  });
  const c = new AssistantConversation();
  const pending = c.send("原会话问题", snapshot);
  await streaming;
  assert.equal(c.getSnapshot().busy, true);
  assert.equal(await c.open("session2"), !fail);
  await pending;
  assert.equal(oldSignal.aborted, true);
  assert.equal(c.getSnapshot().session.id, fail ? "session1" : "session2");
  assert.equal(c.getSnapshot().needsSync, fail);
  assert.equal(c.getSnapshot().busy, false);
  if (fail) {
    assert.equal(await c.send("不能重复发送", null), "rejected");
    await c.sync();
    assert.equal(c.getSnapshot().needsSync, false);
  } else assert.equal(c.chat.messages.at(-1).parts.at(-1).text, "完整回答");
});


test("按对话保存模型，保存期间不发送消息，切换失败保留原选择", async t => {
  const deep = { provider: "deepseek", model: "deepseek-test" };
  const chat = { provider: "chatgpt", model: "gpt-test" };
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
  let release;
  let fail = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "PUT") {
      await new Promise(resolve => { release = resolve; });
      return fail ? Response.json({ detail: "模型不可用" }, { status: 400 }) : Response.json({ ...empty(), model_selection: JSON.parse(options.body) });
    }
    return Response.json({ ...empty(), model_selection: deep });
  });
  const conversation = new AssistantConversation();
  await conversation.open("session1");
  const selecting = conversation.selectModel(chat);
  assert.equal(await conversation.send("不应发送", null), "rejected");
  release();
  assert.equal(await selecting, true);
  assert.deepEqual(conversation.getSnapshot().session.model_selection, chat);
  fail = true;
  const rejected = conversation.selectModel(deep);
  release();
  assert.equal(await rejected, false);
  assert.deepEqual(conversation.getSnapshot().session.model_selection, chat);
  assert.equal(conversation.getSnapshot().error, "模型不可用");
});

test("新对话取消了未完成的模型选择，迟到结果不能恢复旧会话", async t => {
  let release;
  t.mock.method(globalThis, "fetch", async () => {
    await new Promise(resolve => { release = resolve; });
    return Response.json(empty());
  });
  const conversation = new AssistantConversation();
  const pending = conversation.selectModel({ provider: "deepseek", model: "deepseek-test" });
  conversation.reset(); release();
  assert.equal(await pending, false);
  assert.equal(conversation.getSnapshot().session, null);
});


test("新对话发送时固定界面上展示的模型，不受另一页面更改默认值影响", async t => {
  let creation;
  const selection = { provider: "deepseek", model: "deepseek-test" };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") { creation = JSON.parse(options.body); return Response.json({ ...empty(), model_selection: selection }); }
    if (options.method === "POST") return sse();
    return Response.json({ ...final(), model_selection: selection });
  });
  const conversation = new AssistantConversation();
  await conversation.send("问题", null, selection);
  assert.deepEqual(creation, selection);
});

for (const duringSync of [false, true]) test(`回复${duringSync ? '同步时' : '生成时'}切换模型不会中断消息，也不会被旧快照覆盖`, async t => {
  const deep = { provider: 'deepseek', model: 'deepseek-test' };
  const gpt = { provider: 'chatgpt', model: 'gpt-test' };
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  let release, reached;
  const blocked = new Promise(resolve => { release = resolve; });
  const checkpoint = new Promise(resolve => { reached = resolve; });
  let sending = false, streamSignal, selected = deep;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'PUT') {
      selected = JSON.parse(options.body);
      return Response.json({ ...empty(), model_selection: selected });
    }
    if (options.method === 'POST') {
      streamSignal = options.signal;
      sending = true;
      if (!duringSync) { reached(); await blocked; }
      return sse();
    }
    const value = { ...(sending ? final() : empty()), model_selection: selected };
    if (sending && duringSync) { reached(); await blocked; }
    return Response.json(value);
  });
  const conversation = new AssistantConversation();
  await conversation.open('session1');
  const running = conversation.send('问题', null);
  await checkpoint;
  const chatInstance = conversation.chat;
  assert.equal(await conversation.selectModel(gpt), true);
  assert.equal(conversation.getSnapshot().busy, true);
  assert.deepEqual(conversation.getSnapshot().session.model_selection, gpt);
  assert.equal(streamSignal.aborted, false);
  assert.equal(conversation.chat, chatInstance);
  release(); await running;
  assert.deepEqual(conversation.getSnapshot().session.model_selection, gpt);
  assert.equal(conversation.chat.messages.at(-1).parts.at(-1).text, '完整回答');
  assert.equal(conversation.getSnapshot().busy, false);
});

test("默认选择保存失败不把已成功的会话切换报成失败，也不触发目录刷新", async t => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  let connectionEvents = 0, selectionEvents = 0;
  window.addEventListener('model-connections-changed', () => connectionEvents++);
  window.addEventListener('model-selection-changed', () => selectionEvents++);
  const choice = { provider: 'chatgpt', model: 'gpt-test' };
  const notice = '当前对话已切换模型，但未能保存新对话的默认选择';
  let failedDefault = true;
  t.mock.method(globalThis, 'fetch', async (url, options) => Response.json({ ...empty(),
    ...(options.method === 'PUT' ? { model_selection: choice, selection_notice: failedDefault ? notice : '' } : {}),
  }));
  const conversation = new AssistantConversation();
  await conversation.open('session1');
  assert.equal(await conversation.selectModel(choice), true);
  assert.deepEqual(conversation.getSnapshot().session.model_selection, choice);
  assert.equal(conversation.getSnapshot().notice, notice);
  assert.equal(conversation.getSnapshot().needsSync, false);
  assert.equal(conversation.getSnapshot().error, '');
  assert.equal(connectionEvents, 0);
  assert.equal(selectionEvents, 0);
  failedDefault = false;
  assert.equal(await conversation.selectModel(choice), true);
  assert.equal(selectionEvents, 1);
  assert.equal(connectionEvents, 0);
  assert.equal(conversation.getSnapshot().notice, '');
});


test("纯图片消息随本轮发送，恢复后保留 SDK 文件消息", async t => {
  const image = { type: "file", mediaType: "image/png", url: "data:image/png;base64,aGVsbG8=" };
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/assistant/sessions") return Response.json(empty());
    if (options.method === "POST") { request = JSON.parse(options.body); return sse(); }
    return Response.json({ ...final(), messages: [{ id: request.message_id, role: "user", parts: [image] }] });
  });
  const c = new AssistantConversation();
  assert.equal(await c.send("", null, undefined, [image]), "accepted");
  assert.equal(request.text, "");
  assert.deepEqual(request.images, [{ media_type: "image/png", data: "aGVsbG8=" }]);
  assert.deepEqual(c.chat.messages[0].parts, [image]);
});

for (const withImage of [false, true]) test(`完成确认后不读取快照，可连续发送${withImage ? "图片" : "文字"}`, async t => {
  let posts = 0;
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push([url, options.method]);
    if (url === "/api/assistant/sessions") return Response.json(empty());
    assert.equal(options.method, "POST", "正常完成不能读取会话快照");
    const body = JSON.parse(options.body);
    const assistantId = `a${++posts}`;
    return sse([
      { type: "data-turn-accepted", transient: true, data: { user_id: body.message_id, created_at: stamp, title: "问题", updated_at: stamp } },
      { type: "start", messageId: assistantId, messageMetadata: { created_at: stamp } },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: `tool-${posts}`, toolName: "propose_rhythm_exercise", input: {} },
      { type: "tool-output-available", toolCallId: `tool-${posts}`, output: { generated_exercise: { id: `exercise-${posts}` } } },
      { type: "finish-step" },
      ...events.slice(1, -1),
      { type: "data-turn-completed", transient: true, data: { user_id: body.message_id, assistant_id: assistantId, title: "问题", updated_at: stamp } },
      { type: "finish" },
    ]);
  });
  const c = new AssistantConversation();
  const images = withImage ? [{ type: "file", mediaType: "image/png", url: "data:image/png;base64,aGVsbG8=" }] : [];
  for (let i = 0; i < 2; i++) assert.equal(await c.send("问题", snapshot, undefined, images), "accepted");
  assert.equal(requests.length, 3);
  assert.equal(c.chat.messages.length, 4);
  assert.equal(c.chat.messages[1].parts.find(part => part.type === "tool-propose_rhythm_exercise").output.generated_exercise.id, "exercise-1");
  assert.equal(c.getSnapshot().needsSync, false);
  assert.equal(c.getSnapshot().session.last_run_status, "completed");
  assert.equal(c.getSnapshot().session.title, "问题");
  assert.equal(c.getSnapshot().acceptedInput.metadata.created_at, stamp);
  assert.ok(c.chat.messages.every(message => message.metadata.created_at === stamp));
  assert.ok(c.chat.messages.every(message => message.parts.every(part => !part.type.startsWith("data-"))));
  if (withImage) assert.equal(c.chat.messages[0].parts.filter(part => part.type === "file").length, 1);
});
