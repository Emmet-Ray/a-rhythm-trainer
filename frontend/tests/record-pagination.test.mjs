import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { RecordPagination } = await server.ssrLoadModule("/src/practice-records/RecordPagination.tsx");
const { recordPage } = await server.ssrLoadModule("/src/practice-records/practiceRecords.ts");
const { DictationAttempts, RecordDetail } = await server.ssrLoadModule("/src/practice-records/RecordDetail.tsx");

test("每页十条，空列表和删除末页后夹取有效页码", () => {
  assert.deepEqual(recordPage(0, 5), { page: 1, pages: 1, start: 0, end: 0 });
  assert.deepEqual(recordPage(23, 3), { page: 3, pages: 3, start: 20, end: 23 });
  assert.deepEqual(recordPage(20, 3), { page: 2, pages: 2, start: 10, end: 20 });
  assert.equal(recordPage(23, 0).page, 1);
  assert.equal(recordPage(23, NaN).page, 1);
});

test("单页不展示分页，首尾按钮禁用，中间页可双向切换", () => {
  const render = (total, page) => renderToStaticMarkup(createElement(RecordPagination, {
    ...recordPage(total, page), label: "记录分页", onChange() {},
  }));
  assert.equal(render(10, 1), "");
  assert.equal(render(0, 1), "");
  assert.match(render(23, 1), /<button type="button" disabled=""/);
  assert.match(render(23, 3), /<button type="button" disabled="">下一页/);
  assert.match(render(23, 2), /2 \/ 3/);
  assert.doesNotMatch(render(23, 2), /disabled/);
});

test("听写序号跨页递增，按需渲染小节入口且不修改数据", () => {
  const attempts = Array.from({ length: 23 }, (_, index) => ({
    id: `attempt-${index}`, startedAt: "2026-09-22T00:00:00Z", completedAt: null,
    viewedAnswer: false, measures: [{ questionPlayCount: 1, verificationCount: 0, verdict: "unchecked" }],
  }));
  const before = JSON.stringify(attempts);
  const render = (page) => renderToStaticMarkup(createElement(DictationAttempts, { attempts, page }));
  assert.match(render(1), /scope="row">1<\/th>/);
  assert.match(render(1), /scope="row">10<\/th>/);
  assert.doesNotMatch(render(1), /scope="row">11<\/th>/);
  assert.match(render(2), /scope="row">11<\/th>/);
  assert.match(render(2), /scope="row">20<\/th>/);
  assert.match(render(2), /查看序号 11 的小节明细/);
  assert.match(render(3), /scope="row">23<\/th>/);
  assert.equal((render(2).match(/aria-expanded="false"/g) ?? []).length, 10);
  assert.equal((render(3).match(/aria-expanded="false"/g) ?? []).length, 3);
  assert.equal(JSON.stringify(attempts), before);
});

test("击拍详情仅渲染最新十次，汇总仍包含全部尝试", () => {
  const record = {
    id: "record", title: "测试题", source: "preset", mode: "tapping",
    attempts: Array.from({ length: 23 }, (_, index) => ({
      id: `attempt-${index}`, completedAt: "2026-09-22T00:00:00Z", bpm: 60,
      timingWindows: { perfectMs: 50, hitMs: 100 }, passed: true,
      hitCount: 4, targetCount: 4, missCount: 0, wrongTapCount: 0,
    })),
  };
  const html = renderToStaticMarkup(createElement(RecordDetail, { record, onClose() {} }));
  assert.match(html, /共 23 次/);
  assert.match(html, /scope="row">1<\/th>/);
  assert.match(html, /scope="row">10<\/th>/);
  assert.doesNotMatch(html, /scope="row">11<\/th>/);
  assert.match(html, /练习明细分页/);
});
