import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { PageVisits } = await server.ssrLoadModule("/src/navigation/PageVisits.ts");

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
