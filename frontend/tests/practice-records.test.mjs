import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { recordKey, exerciseVersion, recordTappingAttempt, recordDictationEvent } = await server.ssrLoadModule(
  "/src/practice-records/practiceRecords.ts",
);
const { parsePracticeRecords, parsePracticeRecord } =
  await server.ssrLoadModule("/src/practice-records/practiceRecordValidation.ts");
const { default: PracticeRecordsPage } = await server.ssrLoadModule(
  "/src/pages/PracticeRecordsPage.tsx",
);
const { DictationAttempts, RecordDetail } = await server.ssrLoadModule(
  "/src/practice-records/RecordDetail.tsx",
);
const { default: LocalDataSettings } = await server.ssrLoadModule(
  "/src/settings/LocalDataSettings.tsx",
);
const { createDictationState, restoreDictation, dictationBinding } =
  await server.ssrLoadModule("/src/practice/DictationState.ts");

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: [
    { elements: [{ kind: "note", noteValue: "whole" }] },
    { elements: [{ kind: "note", noteValue: "whole" }] },
  ],
};
const context = { source: "custom", exerciseId: "test", title: "两小节" };
const at = "2026-09-16T00:00:00.000Z";
const later = "2026-09-17T00:00:00.000Z";
const attempt = {
  id: "round-1",
  completedAt: at,
  bpm: 60,
  timingWindows: { perfectMs: 50, hitMs: 150 },
  targetCount: 2,
  hitCount: 0,
  missCount: 2,
  wrongTapCount: 0,
  passed: false,
};
function memoryStorage() {
  return { records: [] };
}
function listPracticeRecords(collection) {
  return parsePracticeRecords(collection.records).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
const tap = (overrides = {}) => ({
  mode: "tapping",
  attempt: { ...attempt, ...overrides },
});
test("全部命中但主动停止的未通过记录可保存，通过仍要求无漏拍误敲", () => {
  const storage = memoryStorage();
  save(storage, [tap({ hitCount: 2, missCount: 0, passed: false })]);
  assert.equal(listPracticeRecords(storage)[0].attempts[0].passed, false);
  const record = listPracticeRecords(storage)[0];
  const invalid = {
    ...record,
    attempts: [
      { ...record.attempts[0], hitCount: 1, missCount: 1, passed: true },
    ],
  };
  assert.throws(() => parsePracticeRecord(invalid));
});
const hear = (event, time = at, attemptId = "answer-1") => ({
  mode: "dictation",
  attemptId,
  event,
  at: time,
});
const verify = (
  measureIndex,
  correct = false,
  attemptId = "answer-1",
  time = at,
) => hear({ type: "verify", measureIndex, correct }, time, attemptId);
// 事件计算测试只在内存累计；持久化快照与并发行为由 instance-records.test.mjs 验证
function applyPracticeActions(records, context, exercise, mode, actions) {
  const key = recordKey(context, exercise, mode);
  const index = records.findIndex(item => recordKey(item, item.exercise, item.mode) === key);
  let record = records[index] ?? null;
  for (const action of actions) {
    record = action.mode === 'tapping'
      ? recordTappingAttempt(record, context, exercise, action.attempt)
      : recordDictationEvent(record, context, exercise, action.attemptId, action.event, action.at);
  }
  return { records: !record ? [...records] : index < 0 ? [...records, record]
    : records.map((item, i) => i === index ? record : item), result: record?.id };
}
function save(storage, actions, options = {}) {
  const next = applyPracticeActions(
    storage.records,
    options.context ?? context,
    options.exercise ?? exercise,
    actions[0].mode,
    actions,
  );
  storage.records = parsePracticeRecords(next.records);
  return next.result;
}

test("预设和自定义跨访问累计，保留首次和最近时间，每轮条件独立", () => {
  for (const source of ["preset", "custom"]) {
    const storage = memoryStorage();
    const options = { context: { ...context, source } };
    const id = save(storage, [tap()], options);
    assert.equal(
      save(
        storage,
        [tap({ id: "round-2", completedAt: later, bpm: 80 })],
        options,
      ),
      id,
    );
    const [record] = listPracticeRecords(storage);
    assert.equal(listPracticeRecords(storage).length, 1);
    assert.deepEqual(
      record.attempts.map((item) => item.bpm),
      [60, 80],
    );
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
  assert.equal(
    save(storage, [tap({ id: "renamed" })], {
      context: { ...context, title: "新名字" },
    }),
    id,
  );
  assert.equal(listPracticeRecords(storage)[0].title, "新名字");
  const changed = structuredClone(exercise);
  changed.measures[0].elements[0].kind = "rest";
  assert.notEqual(save(storage, [tap()], { exercise: changed }), id);
  assert.equal(save(storage, [tap({ id: "back" })]), id);
  assert.equal(listPracticeRecords(storage).length, 2);
  assert.equal(
    listPracticeRecords(storage).find((item) => item.id === id).exercise
      .measures[0].elements[0].kind,
    "note",
  );
});

test("内容版本不受属性顺序、显式零附点影响；拍号和小节内容参与版本", () => {
  const equivalent = {
    measures: exercise.measures.map(() => ({
      elements: [{ dots: 0, noteValue: "whole", kind: "note" }],
    })),
    timeSignature: { beatType: 4, beats: 4 },
  };
  assert.equal(exerciseVersion(equivalent), exerciseVersion(exercise));
  assert.notEqual(
    exerciseVersion({ ...exercise, measures: exercise.measures.slice(0, 1) }),
    exerciseVersion(exercise),
  );
  assert.notEqual(
    recordKey(context, exercise, "tapping"),
    recordKey(context, exercise, "dictation"),
  );
  assert.notEqual(
    recordKey(context, exercise, "tapping"),
    recordKey({ ...context, source: "preset" }, exercise, "tapping"),
  );
});

test("随机题按生成编号区分，内容相同也不合并，同一次生成可累计", () => {
  const storage = memoryStorage();
  const first = {
    context: { ...context, source: "random", exerciseId: "generation-1" },
  };
  const id = save(storage, [tap()], first);
  assert.equal(save(storage, [tap({ id: "again" })], first), id);
  save(storage, [tap()], {
    context: { ...first.context, exerciseId: "generation-2" },
  });
  assert.equal(listPracticeRecords(storage).length, 2);
});

test("听写同一次尝试整题与单小节播放为 3/2，只保存开始和完成时间", () => {
  const storage = memoryStorage();
  save(storage, [
    hear({ type: "play", scope: "all" }),
    hear({ type: "play", scope: 0 }),
    hear({ type: "play", scope: 0 }),
    hear({ type: "play", scope: 1 }),
  ]);
  const [record] = listPracticeRecords(storage);
  const [answer] = record.attempts;
  assert.equal(record.attempts.length, 1);
  assert.deepEqual(
    answer.measures.map((item) => item.questionPlayCount),
    [3, 2],
  );
  assert.deepEqual(
    answer.measures.map((item) => item.verdict),
    ["unchecked", "unchecked"],
  );
  assert.equal(answer.startedAt, at);
  assert.equal(answer.completedAt, null);
  assert.equal(answer.viewedAnswer, false);
  assert.deepEqual(Object.keys(answer).sort(), [
    "completedAt",
    "id",
    "measures",
    "startedAt",
    "viewedAnswer",
  ]);
  assert.equal("independentlyCompleted" in record, false);
});

test("同一题目两份作答分别记录，完成状态和是否查看答案不互相污染", () => {
  const storage = memoryStorage();
  const id = save(storage, [
    hear({ type: "view-answer" }),
    verify(0, true),
    verify(1, true),
  ]);
  assert.equal(
    save(storage, [
      verify(0, true, "answer-2", later),
      verify(1, true, "answer-2", later),
    ]),
    id,
  );
  const [record] = listPracticeRecords(storage);
  assert.equal(record.attempts.length, 2);
  assert.deepEqual(
    record.attempts.map((item) => item.viewedAnswer),
    [true, false],
  );
  assert.deepEqual(
    record.attempts.map((item) => item.completedAt),
    [at, later],
  );
  for (const answer of record.attempts)
    assert.deepEqual(
      answer.measures.map((item) => item.verificationCount),
      [1, 1],
    );
  assert.equal(record.startedAt, at);
  assert.equal(record.updatedAt, later);
});

test("作答临时状态只随站内草稿恢复，新草稿不继承判定", () => {
  const empty = createDictationState(exercise);
  const state = { ...empty, measureVerdicts: ["correct", "incorrect"] };
  const binding = dictationBinding("test", exercise);
  assert.equal(restoreDictation({ binding, state }, binding, empty), state);
  assert.equal(restoreDictation(null, binding, empty), empty);
  assert.deepEqual(createDictationState(exercise).measureVerdicts, [
    "unchecked",
    "unchecked",
  ]);
});

test("读取不建空记录，非法小节不写入存储", () => {
  const storage = memoryStorage();
  assert.deepEqual(listPracticeRecords(storage), []);
  assert.equal(storage.records.length, 0);
  assert.equal(
    save(storage, [hear({ type: "edit", measureIndex: 0 })]),
    undefined,
  );
  assert.equal(storage.records.length, 0);
  assert.throws(
    () => save(storage, [hear({ type: "play", scope: 3 })]),
    /小节/,
  );
  assert.throws(() => save(storage, [verify(-1)]), /小节/);
  assert.deepEqual(listPracticeRecords(storage), []);
});

test("不同页面的尝试不覆盖，返回原尝试延续原明细", () => {
  const storage = memoryStorage();
  save(storage, [verify(0)]);
  save(storage, [verify(0, false, "answer-2")]);
  save(storage, [hear({ type: "play", scope: 1 })]);
  const [record] = listPracticeRecords(storage);
  assert.equal(record.attempts.length, 2);
  assert.equal(record.attempts[0].measures[1].questionPlayCount, 1);
  assert.equal(record.attempts[1].measures[1].questionPlayCount, 0);
});

test("无效计数/完成状态拒绝解析，同一题目的重复记录拒绝读取", () => {
  const storage = memoryStorage();
  save(storage, [hear({ type: "play", scope: "all" })]);
  const [record] = listPracticeRecords(storage);
  const answer = record.attempts[0];
  assert.throws(
    () =>
      parsePracticeRecord({
        ...record,
        attempts: [{ ...answer, completedAt: later }],
      }),
    /完成状态/,
  );
  assert.throws(
    () =>
      parsePracticeRecord({
        ...record,
        attempts: [
          {
            ...answer,
            measures: [
              { ...answer.measures[0], questionPlayCount: -1 },
              answer.measures[1],
            ],
          },
        ],
      }),
    /计数/,
  );
  assert.throws(
    () => parsePracticeRecord({ ...record, attempts: [answer, answer] }),
    /尝试重复/,
  );
  storage.records = [record, { ...record, id: "duplicate" }];
  assert.throws(() => listPracticeRecords(storage), /重复/);
});

test("行为计算不修改原记录；读取快照独立", () => {
  const storage = memoryStorage();
  save(storage, [verify(0)]);
  const pending = [
    hear({ type: "edit", measureIndex: 0 }),
    verify(0),
    hear({ type: "play", scope: "all" }),
  ];
  applyPracticeActions(
    storage.records,
    context,
    exercise,
    "dictation",
    pending,
  );
  assert.equal(
    listPracticeRecords(storage)[0].attempts[0].measures[0].verificationCount,
    1,
  );
  save(storage, pending);
  const [record] = listPracticeRecords(storage);
  assert.equal(record.attempts[0].measures[0].verificationCount, 2);
  record.attempts[0].measures[0].verificationCount = 999;
  assert.equal(
    listPracticeRecords(storage)[0].attempts[0].measures[0].verificationCount,
    2,
  );
});

test("列表按最近练习时间倒序而非首次练习时间", () => {
  const storage = memoryStorage();
  const firstId = save(storage, [tap()]);
  save(storage, [tap({ completedAt: "2026-09-16T12:00:00.000Z" })], {
    context: { ...context, exerciseId: "other" },
  });
  save(storage, [tap({ id: "latest", completedAt: later })]);
  assert.equal(listPracticeRecords(storage)[0].id, firstId);
});

test("重复验证/查看答案不更新，修改清除判定且保留次数，不改变开始时间", () => {
  const storage = memoryStorage();
  save(storage, [verify(0)]);
  const initial = JSON.stringify(storage.records);
  save(storage, [verify(0, false, "answer-1", later)]);
  assert.equal(JSON.stringify(storage.records), initial);
  save(storage, [hear({ type: "edit", measureIndex: 0 }, later)]);
  let record = listPracticeRecords(storage)[0];
  assert.equal(record.updatedAt, at);
  assert.deepEqual(record.attempts[0].measures[0], {
    questionPlayCount: 0,
    verificationCount: 1,
    verdict: "unchecked",
  });
  save(storage, [
    verify(0, true, "answer-1", later),
    hear({ type: "view-answer" }, later),
  ]);
  const viewed = JSON.stringify(storage.records);
  save(storage, [hear({ type: "view-answer" }, "2026-09-18T00:00:00.000Z")]);
  assert.equal(JSON.stringify(storage.records), viewed);
  record = listPracticeRecords(storage)[0];
  assert.equal(record.attempts[0].measures[0].verificationCount, 2);
  assert.equal(record.attempts[0].startedAt, at);
  assert.equal(record.attempts[0].completedAt, null);
});

test("全部验证正确后尝试冻结，之后播放、编辑、查看答案都不改写", () => {
  const storage = memoryStorage();
  save(storage, [verify(0, true), verify(1, true, "answer-1", later)]);
  const before = JSON.stringify(storage.records);
  save(storage, [
    hear({ type: "play", scope: "all" }),
    hear({ type: "view-answer" }),
    hear({ type: "edit", measureIndex: 0 }),
    verify(0),
  ]);
  assert.equal(JSON.stringify(storage.records), before);
  const answer = listPracticeRecords(storage)[0].attempts[0];
  assert.equal(answer.completedAt, later);
  assert.equal(answer.viewedAnswer, false);
  assert.deepEqual(
    answer.measures.map((item) => item.verdict),
    ["correct", "correct"],
  );
});

test("记录与本地数据按需读取，初始状态不把未加载当作空历史", () => {
  const render = component => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component)));
  assert.match(render(LocalDataSettings), /正在读取练习记录/);
  const records = render(PracticeRecordsPage);
  assert.match(records, /正在读取练习记录/);
  assert.doesNotMatch(records, /暂无练习记录/);
  assert.match(records, /记录时间范围/);
});

test("详情抽屉有关闭与预览切换但没有删除", () => {
  const storage = memoryStorage();
  save(storage, [tap()]);
  {
    const html = renderToStaticMarkup(
      createElement(RecordDetail, {
        record: listPracticeRecords(storage)[0],
        onClose() {},
      }),
    );
    assert.match(html, /<dialog/);
    assert.match(html, /练习明细/);
    assert.match(html, /题目预览/);
    assert.match(html, /击拍练习明细/);
    assert.match(html, /关闭记录详情/);
    assert.doesNotMatch(html, /删除|更多记录操作/);
  }
});

test("听写每行一次尝试，最新优先，保留两个时间与独立的小节展开入口", () => {
  const storage = memoryStorage();
  save(storage, [
    verify(0, true),
    verify(1, true, "answer-1", later),
    hear({ type: "view-answer" }, later, "answer-2"),
  ]);
  const record = listPracticeRecords(storage)[0];
  const before = JSON.stringify(record);
  const html = renderToStaticMarkup(
    createElement(DictationAttempts, { attempts: record.attempts }),
  );
  assert.match(html, /<th>开始时间<\/th><th>完成时间<\/th>/);
  assert.ok(
    html.indexOf('scope="row">1</th>') < html.indexOf('scope="row">2</th>'),
  );
  assert.ok(
    html.indexOf("未完成</td><td>已查看") <
      html.indexOf("已完成</td><td>未查看"),
  );
  assert.match(html, /未完成<\/td><td>已查看/);
  assert.match(html, /已完成<\/td><td>未查看/);
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
  assert.equal((html.match(/class="dictation-measure-row"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<details/);
  assert.equal(JSON.stringify(record), before);
});

test("AI 练习按生成 ID 累计，版本独立，来源与谱面可从存储恢复", () => {
  const storage = memoryStorage();
  const options = {
    context: { source: "ai", exerciseId: "generated-1", title: "AI 四分练习" },
  };
  const id = save(storage, [tap()], options);
  assert.equal(
    save(storage, [tap({ id: "round-2", completedAt: later })], options),
    id,
  );
  save(storage, [tap()], {
    context: { ...options.context, exerciseId: "generated-2" },
  });
  const records = listPracticeRecords(storage);
  assert.equal(records.length, 2);
  assert.equal(records.find((record) => record.id === id).attempts.length, 2);
  assert.ok(records.every((record) => record.source === "ai"));
  assert.deepEqual(records[0].exercise, exercise);
  assert.notEqual(
    recordKey(options.context, exercise, "tapping"),
    recordKey({ ...options.context, source: "custom" }, exercise, "tapping"),
  );
});
