import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { PageVisits } = await server.ssrLoadModule("/src/navigation/PageVisits.ts");
const { browsingScrollScope } = await server.ssrLoadModule("/src/navigation/usePageNavigation.ts");
const { createDictationState, dictationBinding, restoreDictation } = await server.ssrLoadModule("/src/practice/DictationState.ts");

test("浏览偏好供新访问继承，原访问快照（包括初值）不受后来选择影响", () => {
  const visits = new PageVisits();
  assert.equal(visits.readBrowsing("a", "preset:mode", () => "tapping"), "tapping");
  visits.rememberBrowsing("preset:mode", "dictation");
  assert.equal(visits.readBrowsing("b", "preset:mode", () => "tapping"), "dictation");
  assert.equal(visits.readBrowsing("a", "preset:mode", () => "unused"), "tapping");
  visits.rememberBrowsing("preset:mode", "tapping");
  assert.equal(visits.readBrowsing("c", "preset:mode", () => "unused"), "tapping");
  assert.equal(visits.readBrowsing("b", "preset:mode", () => "unused"), "dictation");
});

test("浏览状态按身份及字段隔离，不改变作答快照或跨刷新保留", () => {
  const visits = new PageVisits();
  visits.rememberBrowsing("custom:account:1:offset", 50);
  assert.equal(visits.readBrowsing("b", "custom:account:2:offset", () => 0), 0);
  assert.equal(visits.readBrowsing("b", "custom:account:1:offset", () => 0), 50);
  visits.write("a", "dictation", { answer: 1 });
  assert.equal(visits.read("b", "dictation", null), null);
  assert.equal(new PageVisits().readBrowsing("c", "custom:account:1:offset", () => 0), 0);
  visits.rememberDestination("/settings", "/settings?category=appearance");
  assert.equal(visits.destination("/settings"), "/settings?category=appearance");
  assert.equal(new PageVisits().destination("/settings"), "/settings");
});

test("只有浏览列表跨访问保留滚动，练习和编辑页面不继承", () => {
  for (const path of ["/preset", "/records", "/random", "/custom", "/custom/tapping", "/custom/dictation"])
    assert.ok(browsingScrollScope(path, "guest"));
  for (const path of ["/preset/question", "/random/tapping", "/custom/tapping/new", "/custom/tapping/test/edit"])
    assert.equal(browsingScrollScope(path, "guest"), undefined);
  assert.notEqual(browsingScrollScope("/custom/tapping", "account:1"), browsingScrollScope("/custom/tapping", "account:2"));
});

test("惰性初值每条访问每个字段只创建一次，返回和后续更新复用原状态", () => {
  const visits = new PageVisits();
  let calls = 0;
  const create = () => ({ id: ++calls });
  const first = visits.readOrCreate("entry", "question", create);
  assert.equal(visits.readOrCreate("entry", "question", create), first);
  assert.equal(visits.read("entry", "question", null), first);
  assert.equal(calls, 1);
  const replacement = { id: 100 };
  visits.write("entry", "question", replacement);
  assert.equal(visits.readOrCreate("entry", "question", create), replacement);
  assert.equal(calls, 1);
  assert.notEqual(visits.readOrCreate("new-entry", "question", create), first);
  assert.notEqual(visits.readOrCreate("entry", "other-mode", create), first);
  assert.equal(calls, 3);
});

test("惰性初始化保留空值；创建失败不缓存，普通读取不写入初值", () => {
  const visits = new PageVisits();
  assert.equal(visits.read("entry", "question", "fallback"), "fallback");
  assert.throws(() => visits.readOrCreate("entry", "question", () => { throw new Error("failed"); }), /failed/);
  assert.equal(visits.readOrCreate("entry", "question", () => null), null);
  assert.equal(visits.readOrCreate("entry", "question", () => assert.fail("已有空值也应恢复")), null);
});

test("听写恢复同时绑定生成编号与题目内容，不按小节数量误配答案", () => {
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: "note", noteValue: "whole" }] }] };
  const empty = createDictationState(exercise);
  assert.deepEqual(empty.answerMeasures, [[]]);
  assert.deepEqual(empty.measureVerdicts, ["unchecked"]);
  const state = { ...empty, answerMeasures: [[{ kind: "note", noteValue: "half" }]], playbackScope: "measure", measureVerdicts: ["incorrect"] };
  const binding = dictationBinding(1, exercise);
  const snapshot = { binding, state };
  assert.equal(restoreDictation(snapshot, dictationBinding(1, structuredClone(exercise)), empty), state);
  assert.equal(restoreDictation(snapshot, dictationBinding(2, exercise), empty), empty);
  const changed = structuredClone(exercise);
  changed.measures[0].elements[0].kind = "rest";
  assert.equal(restoreDictation(snapshot, dictationBinding(1, changed), empty), empty);
  assert.equal(restoreDictation(null, binding, empty), empty);
  assert.deepEqual(createDictationState(null).answerMeasures, []);
});

test("草稿按访问、身份和模式隔离，保存成功只清除提交的版本", () => {
  const visits = new PageVisits();
  const submitted = { name: "草稿", measures: [[], []] };
  const edited = { ...submitted, name: "继续修改" };
  visits.write("entry", "account:1:tapping:draft", submitted);
  visits.write("entry", "account:2:tapping:draft", submitted);
  visits.write("entry", "account:1:dictation:draft", submitted);
  assert.equal(visits.read("new-entry", "account:1:tapping:draft", null), null);
  visits.write("entry", "account:1:tapping:draft", edited);
  visits.forget("entry", "account:1:tapping:draft", submitted);
  assert.equal(visits.read("entry", "account:1:tapping:draft", null), edited);
  visits.forget("entry", "account:1:tapping:draft", edited);
  assert.equal(visits.read("entry", "account:1:tapping:draft", null), null);
  assert.equal(visits.read("entry", "account:2:tapping:draft", null), submitted);
  assert.equal(visits.read("entry", "account:1:dictation:draft", null), submitted);
});

test("同一地址的不同访问各自保留选择和滚动，后退前进恢复原记录", () => {
  const visits = new PageVisits();
  visits.enter({ key: "a", path: "/preset" }, "POP");
  visits.write("a", "mode", "dictation");
  visits.savePosition("a", 900);
  visits.enter({ key: "b", path: "/preset/question" }, "PUSH");
  assert.equal(visits.backDistance("/preset"), -1);
  visits.enter({ key: "c", path: "/preset" }, "PUSH");
  assert.equal(visits.read("c", "mode", "tapping"), "tapping");
  assert.equal(visits.position("c"), 0);
  visits.enter({ key: "a", path: "/preset" }, "POP");
  assert.equal(visits.read("a", "mode", "tapping"), "dictation");
  assert.equal(visits.position("a"), 900);
  visits.enter({ key: "b", path: "/preset/question" }, "POP");
  assert.equal(visits.backDistance("/preset"), -1);
});

test("未知来源不猜测后退距离，新分支丢弃前进记录，replace 不增加历史长度", () => {
  const visits = new PageVisits();
  visits.enter({ key: "direct", path: "/preset/question" }, "POP");
  assert.equal(visits.backDistance("/preset"), undefined);
  visits.enter({ key: "list", path: "/preset" }, "PUSH");
  visits.enter({ key: "settings", path: "/settings" }, "PUSH");
  visits.enter({ key: "list", path: "/preset" }, "POP");
  visits.enter({ key: "new", path: "/custom/new" }, "PUSH");
  assert.equal(visits.backDistance("/settings"), undefined);
  visits.enter({ key: "saved", path: "/custom" }, "REPLACE");
  assert.equal(visits.backDistance("/custom/new"), undefined);
  assert.equal(visits.backDistance("/preset"), -1);
  visits.enter({ key: "outside", path: "/settings" }, "POP");
  assert.equal(visits.backDistance("/preset"), undefined);
});

test("字段、账号与应用会话隔离；重复挂载同一记录不改变返回距离", () => {
  const visits = new PageVisits();
  visits.enter({ key: "list", path: "/custom" }, "POP");
  visits.write("list", "account:1:offset", 50);
  visits.write("list", "account:2:offset", 100);
  assert.equal(visits.read("list", "account:1:offset", 0), 50);
  assert.equal(visits.read("list", "local:offset", 0), 0);
  visits.enter({ key: "detail", path: "/custom/item" }, "PUSH");
  visits.enter({ key: "detail", path: "/custom/item" }, "PUSH");
  assert.equal(visits.backDistance("/custom"), -1);
  assert.equal(new PageVisits().read("list", "account:1:offset", 0), 0);
});
