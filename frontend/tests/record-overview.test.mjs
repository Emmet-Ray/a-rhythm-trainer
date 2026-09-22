import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { recordOverview } = await server.ssrLoadModule("/src/practice-records/practiceRecords.ts");
const now = new Date(2026, 8, 22, 12);
const date = (day, hour = 0) => new Date(2026, 8, day, hour).toISOString();
const tapping = (id, attempts) => ({ id, mode: "tapping", attempts });
const dictation = (id, attempts) => ({ id, mode: "dictation", attempts });
const tap = (day, passed = false) => ({ completedAt: date(day), passed });
const write = (day, completedAt = null, viewedAnswer = false) => ({ startedAt: date(day), completedAt, viewedAnswer });

test("统计按尝试计算、跨模式同一天去重，详情仍返回完整题目", () => {
  const records = [tapping("a", [tap(1), tap(22, true), tap(22)]), dictation("b", [write(21, date(22)), write(22, date(22), true), write(22)])];
  const before = JSON.stringify(records);
  const result = recordOverview(records, "all", "week", now);
  assert.equal(result.count, 5);
  assert.equal(result.days, 2);
  assert.equal(result.tappingCount, 2);
  assert.equal(result.passRate, 50);
  assert.equal(result.completedCount, 2);
  assert.equal(result.independentCount, 1);
  assert.equal(result.records[0], records[0]);
  assert.equal(result.records[0].attempts.length, 3);
  assert.equal(JSON.stringify(records), before);
});

test("近七天含今天本地零点边界，排除未来与窗口外记录", () => {
  const records = [tapping("a", [tap(15), tap(16), tap(22), tap(23)])];
  assert.equal(recordOverview(records, "all", "week", now).count, 2);
  assert.equal(recordOverview(records, "all", "all", now).count, 3);
  const midnight = new Date(2026, 8, 23, 0);
  assert.equal(recordOverview([tapping("a", [tap(16)])], "all", "week", midnight).count, 0);
});

test("近三十天跨月；听写按开始时间而非完成时间归属", () => {
  const records = [dictation("a", [write(15, date(22)), write(16, date(22))]),
    tapping("b", [{ completedAt: new Date(2026, 7, 24).toISOString(), passed: true },
      { completedAt: new Date(2026, 7, 23, 23, 59).toISOString(), passed: false }])];
  assert.equal(recordOverview(records, "dictation", "week", now).count, 1);
  assert.equal(recordOverview(records, "tapping", "month", now).count, 1);
  assert.equal(recordOverview(records, "tapping", "month", now).passRate, 100);
});

test("模式过滤同时限制题目与统计，空范围不显示虚假的零通过率", () => {
  const records = [tapping("a", [tap(22)]), dictation("b", [write(22)])];
  const result = recordOverview(records, "dictation", "all", now);
  assert.deepEqual(result.records.map(item => item.id), ["b"]);
  assert.equal(result.count, 1);
  assert.equal(result.tappingCount, 0);
  assert.equal(result.passRate, null);
  assert.equal(recordOverview([], "all", "all", now).days, 0);
});

test("列表按范围内最近一次练习排序，删除后统计直接减少", () => {
  const records = [tapping("older", [tap(19)]), tapping("newer", [tap(21, true)])];
  assert.deepEqual(recordOverview(records, "all", "week", now).records.map(item => item.id), ["newer", "older"]);
  assert.equal(recordOverview(records.slice(0, 1), "all", "week", now).passedCount, 0);
});
