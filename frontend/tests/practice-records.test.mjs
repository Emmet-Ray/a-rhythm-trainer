import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { recordKey, exerciseVersion } = await server.ssrLoadModule("/src/practice-records/practiceRecords.ts");
const { listPracticeRecords, savePracticeActions, deletePracticeRecord, clearPracticeRecords, parsePracticeRecord } = await server.ssrLoadModule("/src/practice-records/practiceRecordStorage.ts");
const { recordAccess } = await server.ssrLoadModule("/src/practice-records/recordAccess.ts");
const { RecordAccessContext } = await server.ssrLoadModule("/src/practice-records/recordAccess.ts");
const { default: PracticeRecordsPage } = await server.ssrLoadModule("/src/pages/PracticeRecordsPage.tsx");
const { DictationAttempts, RecordDetail } = await server.ssrLoadModule("/src/practice-records/RecordDetail.tsx");
const { default: LocalRecordSettings } = await server.ssrLoadModule("/src/settings/LocalRecordSettings.tsx");
const { createDictationState, restoreDictation, dictationBinding } = await server.ssrLoadModule("/src/practice/DictationState.ts");

const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: "note", noteValue: "whole" }] }, { elements: [{ kind: "note", noteValue: "whole" }] }] };
const context = { source: "custom", exerciseId: "test", title: "两小节" };
const at = "2026-09-16T00:00:00.000Z";
const later = "2026-09-17T00:00:00.000Z";
const attempt = { id: "round-1", completedAt: at, bpm: 60, timingWindows: { perfectMs: 50, hitMs: 150 }, targetCount: 2, hitCount: 0, missCount: 2, wrongTapCount: 0, passed: false };
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const tap = (overrides = {}) => ({ mode: "tapping", attempt: { ...attempt, ...overrides } });
const hear = (event, time = at, attemptId = "answer-1") => ({ mode: "dictation", attemptId, event, at: time });
const verify = (measureIndex, correct = false, attemptId = "answer-1", time = at) => hear({ type: "verify", measureIndex, correct }, time, attemptId);
function save(storage, actions, options = {}) {
  return savePracticeActions(options.context ?? context, options.exercise ?? exercise, actions[0].mode, actions, options.expectedId, storage);
}

test("预设和自定义跨访问累计，保留首次和最近时间，每轮条件独立", () => {
  for (const source of ["preset", "custom"]) {
    const storage = memoryStorage();
    const options = { context: { ...context, source } };
    const id = save(storage, [tap()], options);
    assert.equal(save(storage, [tap({ id: "round-2", completedAt: later, bpm: 80 })], options), id);
    const [record] = listPracticeRecords(storage);
    assert.equal(listPracticeRecords(storage).length, 1);
    assert.deepEqual(record.attempts.map(item => item.bpm), [60, 80]);
    assert.equal(record.startedAt, at);
    assert.equal(record.updatedAt, later);
  }
});

test("同轮迟到修正原成绩，不重复追加、不回退最近练习时间", () => {
  const storage = memoryStorage();
  save(storage, [tap(), tap({ id: "round-2", completedAt: later })]);
  save(storage, [tap({ hitCount: 2, missCount: 0, passed: true })]);
  const [record] = listPracticeRecords(storage);
  assert.equal(record.attempts.length, 2);
  assert.equal(record.attempts[0].passed, true);
  assert.equal(record.updatedAt, later);
});

test("改名不拆分，修改节奏分版本，恢复旧内容继续旧版本；原题快照独立", () => {
  const storage = memoryStorage();
  const id = save(storage, [tap()]);
  assert.equal(save(storage, [tap({ id: "renamed" })], { context: { ...context, title: "新名字" } }), id);
  assert.equal(listPracticeRecords(storage)[0].title, "新名字");
  const changed = structuredClone(exercise);
  changed.measures[0].elements[0].kind = "rest";
  assert.notEqual(save(storage, [tap()], { exercise: changed }), id);
  assert.equal(save(storage, [tap({ id: "back" })]), id);
  assert.equal(listPracticeRecords(storage).length, 2);
  assert.equal(listPracticeRecords(storage).find(item => item.id === id).exercise.measures[0].elements[0].kind, "note");
});

test("内容版本不受属性顺序、显式零附点影响；拍号和小节内容参与版本", () => {
  const equivalent = { measures: exercise.measures.map(() => ({ elements: [{ dots: 0, noteValue: "whole", kind: "note" }] })), timeSignature: { beatType: 4, beats: 4 } };
  assert.equal(exerciseVersion(equivalent), exerciseVersion(exercise));
  assert.notEqual(exerciseVersion({ ...exercise, measures: exercise.measures.slice(0, 1) }), exerciseVersion(exercise));
  assert.notEqual(recordKey(context, exercise, "tapping"), recordKey(context, exercise, "dictation"));
  assert.notEqual(recordKey(context, exercise, "tapping"), recordKey({ ...context, source: "preset" }, exercise, "tapping"));
});

test("随机题按生成编号区分，内容相同也不合并，同一次生成可累计", () => {
  const storage = memoryStorage();
  const first = { context: { ...context, source: "random", exerciseId: "generation-1" } };
  const id = save(storage, [tap()], first);
  assert.equal(save(storage, [tap({ id: "again" })], first), id);
  save(storage, [tap()], { context: { ...first.context, exerciseId: "generation-2" } });
  assert.equal(listPracticeRecords(storage).length, 2);
});

test("听写同一次尝试整题与单小节播放为 3/2，只保存开始和完成时间", () => {
  const storage = memoryStorage();
  save(storage, [hear({ type: "play", scope: "all" }), hear({ type: "play", scope: 0 }), hear({ type: "play", scope: 0 }), hear({ type: "play", scope: 1 })]);
  const [record] = listPracticeRecords(storage);
  const [answer] = record.attempts;
  assert.equal(record.attempts.length, 1);
  assert.deepEqual(answer.measures.map(item => item.questionPlayCount), [3, 2]);
  assert.deepEqual(answer.measures.map(item => item.verdict), ["unchecked", "unchecked"]);
  assert.equal(answer.startedAt, at);
  assert.equal(answer.completedAt, null);
  assert.equal(answer.viewedAnswer, false);
  assert.deepEqual(Object.keys(answer).sort(), ["completedAt", "id", "measures", "startedAt", "viewedAnswer"]);
  assert.equal("independentlyCompleted" in record, false);
});

test("同一题目两份作答分别记录，完成状态和是否查看答案不互相污染", () => {
  const storage = memoryStorage();
  const id = save(storage, [hear({ type: "view-answer" }), verify(0, true), verify(1, true)]);
  assert.equal(save(storage, [verify(0, true, "answer-2", later), verify(1, true, "answer-2", later)]), id);
  const [record] = listPracticeRecords(storage);
  assert.equal(record.attempts.length, 2);
  assert.deepEqual(record.attempts.map(item => item.viewedAnswer), [true, false]);
  assert.deepEqual(record.attempts.map(item => item.completedAt), [at, later]);
  for (const answer of record.attempts) assert.deepEqual(answer.measures.map(item => item.verificationCount), [1, 1]);
  assert.equal(record.startedAt, at);
  assert.equal(record.updatedAt, later);
});

test("作答临时状态只随站内草稿恢复，新草稿不继承判定", () => {
  const empty = createDictationState(exercise);
  const state = { ...empty, measureVerdicts: ["correct", "incorrect"] };
  const binding = dictationBinding("test", exercise);
  assert.equal(restoreDictation({ binding, state }, binding, empty), state);
  assert.equal(restoreDictation(null, binding, empty), empty);
  assert.deepEqual(createDictationState(exercise).measureVerdicts, ["unchecked", "unchecked"]);
});

test("读取不建空记录，非法小节和模式不写入存储", () => {
  const storage = memoryStorage();
  assert.deepEqual(listPracticeRecords(storage), []);
  assert.equal(storage.values.size, 0);
  assert.equal(save(storage, [hear({ type: "edit", measureIndex: 0 })]), undefined);
  assert.equal(storage.values.size, 0);
  assert.throws(() => save(storage, [hear({ type: "play", scope: 3 })]), /小节/);
  assert.throws(() => save(storage, [verify(-1)]), /小节/);
  assert.throws(() => save(storage, [tap(), verify(0)]), /模式/);
  assert.deepEqual(listPracticeRecords(storage), []);
});

test("不同页面的尝试不覆盖，返回原尝试延续原明细", () => {
  const storage = memoryStorage();
  const id = save(storage, [verify(0)]);
  save(storage, [verify(0, false, "answer-2")]);
  save(storage, [hear({ type: "play", scope: 1 })], { expectedId: id });
  const [record] = listPracticeRecords(storage);
  assert.equal(record.attempts.length, 2);
  assert.equal(record.attempts[0].measures[1].questionPlayCount, 1);
  assert.equal(record.attempts[1].measures[1].questionPlayCount, 0);
});

test("删除/清空后旧页面不能复活记录，新的访问允许重新记录，不触及题库", () => {
  const storage = memoryStorage();
  storage.setItem("rhythm-trainer.custom-exercises", "keep");
  const id = save(storage, [tap()]);
  deletePracticeRecord(id, storage);
  assert.throws(() => save(storage, [tap()], { expectedId: id }), /已被删除/);
  const nextId = save(storage, [tap()]);
  assert.notEqual(nextId, id);
  assert.throws(() => save(storage, [tap()], { expectedId: id }), /已被删除/);
  clearPracticeRecords(storage);
  assert.equal(storage.getItem("rhythm-trainer.custom-exercises"), "keep");
  assert.throws(() => save(storage, [tap()], { expectedId: nextId }), /已被删除/);
});

test("旧格式、未知版本和损坏数据不自动删除或覆盖", () => {
  const storage = memoryStorage();
  for (const raw of ["broken", JSON.stringify({ version: 1, records: [] }), JSON.stringify({ version: 99, records: [] })]) {
    storage.setItem("rhythm-trainer.practice-records", raw);
    assert.throws(() => listPracticeRecords(storage), /损坏|版本/);
    assert.throws(() => save(storage, [tap()]), /损坏|版本/);
    assert.equal(storage.getItem("rhythm-trainer.practice-records"), raw);
  }
});

test("无效计数/完成状态拒绝解析，同一题目的重复记录拒绝读取", () => {
  const storage = memoryStorage();
  save(storage, [hear({ type: "play", scope: "all" })]);
  const [record] = listPracticeRecords(storage);
  const answer = record.attempts[0];
  assert.throws(() => parsePracticeRecord({ ...record, attempts: [{ ...answer, completedAt: later }] }), /完成状态/);
  assert.throws(() => parsePracticeRecord({ ...record, attempts: [{ ...answer, measures: [{ ...answer.measures[0], questionPlayCount: -1 }, answer.measures[1]] }] }), /计数/);
  assert.throws(() => parsePracticeRecord({ ...record, attempts: [answer, answer] }), /尝试重复/);
  storage.setItem("rhythm-trainer.practice-records", JSON.stringify({ version: 3, records: [record, { ...record, id: "duplicate" }] }));
  assert.throws(() => listPracticeRecords(storage), /损坏/);
});

test("保存失败保留原累计值，重试行为队列只累计一次；读取快照独立", () => {
  const storage = memoryStorage();
  save(storage, [verify(0)]);
  const pending = [hear({ type: "edit", measureIndex: 0 }), verify(0), hear({ type: "play", scope: "all" })];
  assert.throws(() => save({ ...storage, setItem() { throw new Error("quota"); } }, pending), /保存失败/);
  assert.equal(listPracticeRecords(storage)[0].attempts[0].measures[0].verificationCount, 1);
  save(storage, pending);
  const [record] = listPracticeRecords(storage);
  assert.equal(record.attempts[0].measures[0].verificationCount, 2);
  record.attempts[0].measures[0].verificationCount = 999;
  assert.equal(listPracticeRecords(storage)[0].attempts[0].measures[0].verificationCount, 2);
});

test("列表按最近练习时间倒序而非首次练习时间", () => {
  const storage = memoryStorage();
  const firstId = save(storage, [tap()]);
  save(storage, [tap({ completedAt: "2026-09-16T12:00:00.000Z" })], { context: { ...context, exerciseId: "other" } });
  save(storage, [tap({ id: "latest", completedAt: later })]);
  assert.equal(listPracticeRecords(storage)[0].id, firstId);
});

test("重复验证/查看答案不更新，修改清除判定且保留次数，不改变开始时间", () => {
  const storage = memoryStorage();
  save(storage, [verify(0)]);
  const initial = storage.getItem("rhythm-trainer.practice-records");
  save(storage, [verify(0, false, "answer-1", later)]);
  assert.equal(storage.getItem("rhythm-trainer.practice-records"), initial);
  save(storage, [hear({ type: "edit", measureIndex: 0 }, later)]);
  let record = listPracticeRecords(storage)[0];
  assert.equal(record.updatedAt, at);
  assert.deepEqual(record.attempts[0].measures[0], { questionPlayCount: 0, verificationCount: 1, verdict: "unchecked" });
  save(storage, [verify(0, true, "answer-1", later), hear({ type: "view-answer" }, later)]);
  const viewed = storage.getItem("rhythm-trainer.practice-records");
  save(storage, [hear({ type: "view-answer" }, "2026-09-18T00:00:00.000Z")]);
  assert.equal(storage.getItem("rhythm-trainer.practice-records"), viewed);
  record = listPracticeRecords(storage)[0];
  assert.equal(record.attempts[0].measures[0].verificationCount, 2);
  assert.equal(record.attempts[0].startedAt, at);
  assert.equal(record.attempts[0].completedAt, null);
});

test("全部验证正确后尝试冻结，之后播放、编辑、查看答案都不改写", () => {
  const storage = memoryStorage();
  save(storage, [verify(0, true), verify(1, true, "answer-1", later)]);
  const before = storage.getItem("rhythm-trainer.practice-records");
  save(storage, [hear({ type: "play", scope: "all" }), hear({ type: "view-answer" }), hear({ type: "edit", measureIndex: 0 }), verify(0)]);
  assert.equal(storage.getItem("rhythm-trainer.practice-records"), before);
  const answer = listPracticeRecords(storage)[0].attempts[0];
  assert.equal(answer.completedAt, later);
  assert.equal(answer.viewedAnswer, false);
  assert.deepEqual(answer.measures.map(item => item.verdict), ["correct", "correct"]);
});

test("只接受当前版本，不兼容或覆盖旧测试数据", () => {
  const storage = memoryStorage();
  save(storage, [tap()]);
  const data = JSON.parse(storage.getItem("rhythm-trainer.practice-records"));
  data.version = 2;
  const raw = JSON.stringify(data);
  storage.setItem("rhythm-trainer.practice-records", raw);
  assert.throws(() => listPracticeRecords(storage), /损坏|版本/);
  assert.throws(() => save(storage, [verify(0)]), /损坏|版本/);
  assert.equal(storage.getItem("rhythm-trainer.practice-records"), raw);
});

test("账号与未知身份不能使用游客记录；禁用账号等同游客", () => {
  for (const status of ["guest", "disabled"]) assert.equal(recordAccess({ state: { status }, busy: false }), "guest");
  assert.equal(recordAccess({ state: { status: "authenticated", user: { id: 1 } }, busy: false }), "account");
  assert.equal(recordAccess({ state: { status: "unavailable" }, busy: false }), "unavailable");
  assert.equal(recordAccess({ state: { status: "checking" }, busy: false }), "checking");
  assert.equal(recordAccess({ state: { status: "guest" }, busy: true }), "checking");
});

test("记录列表提供详情抽屉和独立删除入口，本地数据使用紧凑摘要", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = memoryStorage();
  save(storage, [tap(), tap({ id: "round-2" })]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    const render = component => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(RecordAccessContext.Provider, { value: "guest" }, createElement(component))));
    const settings = render(LocalRecordSettings);
    assert.match(settings, /1 条题目记录/);
    assert.match(settings, /2 次尝试/);
    assert.doesNotMatch(settings, /local-records-clear-description|仅删除/);
    const records = render(PracticeRecordsPage);
    assert.match(records, /record-filters topic-modes/);
    assert.doesNotMatch(records, /记录说明|记录仅保存在/);
    assert.match(records, /aria-haspopup="dialog"/);
    assert.match(records, /删除“两小节”的练习记录/);
    assert.match(records, /record-entry-actions text-actions/);
    assert.match(records, /查看详情：“两小节”的练习记录/);
    assert.doesNotMatch(records, /最近练习|共 \d+ 次|通过 \d+ 次|完成 \d+ 次|record-link|record-summary/);
    assert.doesNotMatch(records, /<details|href="\/records\//);
    assert.doesNotMatch(records, /<table/);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("详情抽屉有关闭与预览切换但没有删除，账号状态不展示游客记录", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = memoryStorage();
  save(storage, [tap()]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    const html = renderToStaticMarkup(createElement(RecordDetail, { record: listPracticeRecords(storage)[0], onClose() {} }));
    assert.match(html, /<dialog/);
    assert.match(html, /尝试记录/);
    assert.match(html, /题目预览/);
    assert.match(html, /击拍尝试明细/);
    assert.match(html, /关闭记录详情/);
    assert.doesNotMatch(html, /删除|更多记录操作/);
    const account = renderToStaticMarkup(createElement(RecordAccessContext.Provider, { value: "account" }, createElement(PracticeRecordsPage)));
    assert.doesNotMatch(account, /两小节|击拍尝试明细/);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("听写每行一次尝试，最新优先，保留两个时间与独立的小节展开入口", () => {
  const storage = memoryStorage();
  save(storage, [verify(0, true), verify(1, true, "answer-1", later), hear({ type: "view-answer" }, later, "answer-2")]);
  const record = listPracticeRecords(storage)[0];
  const before = JSON.stringify(record);
  const html = renderToStaticMarkup(createElement(DictationAttempts, { attempts: record.attempts }));
  assert.match(html, /<th>开始时间<\/th><th>完成时间<\/th>/);
  assert.ok(html.indexOf("第 2 次</th>") < html.indexOf("第 1 次</th>"));
  assert.match(html, /未完成<\/td><td>已查看/);
  assert.match(html, /已完成<\/td><td>未查看/);
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
  assert.equal((html.match(/class="dictation-measure-row"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<details/);
  assert.equal(JSON.stringify(record), before);
});
