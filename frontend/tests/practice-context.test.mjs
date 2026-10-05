import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { buildPracticeContextSummary } = await server.ssrLoadModule('/src/assistant/practiceContextSummary.ts');
const { AssistantContext } = await server.ssrLoadModule('/src/assistant/assistantContext.ts');
const { recordTappingAttempt } = await server.ssrLoadModule('/src/practice-records/practiceRecords.ts');
const { parsePracticeRecord } = await server.ssrLoadModule('/src/practice-records/practiceRecordStorage.ts');
const { PracticeActivity } = await server.ssrLoadModule('/src/assistant/practiceActivity.ts');
const { recordDictationEvent } = await server.ssrLoadModule('/src/practice-records/practiceRecords.ts');
const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: 'note', noteValue: 'whole' }] }, { elements: [{ kind: 'note', noteValue: 'whole' }] }] };
const context = { source: 'preset', exerciseId: 'one', title: '测试练习' };
const at = '2026-10-05T00:00:00Z';
const attempt = { id: 'a', completedAt: at, bpm: 60, timingWindows: { perfectMs: 50, hitMs: 150 }, passed: false, targetCount: 2, hitCount: 1, missCount: 1, wrongTapCount: 0,
  details: { stopped: false, timingEvents: [{ kind: 'hit', grade: 'late', targetIndex: 0, eventIndex: 0, tapOffsetMs: 80, errorMs: 80 }, { kind: 'miss', targetIndex: 1, eventIndex: 1 }] } };
const source = { context, exercise, mode: 'tapping', answerExposed: false, session: null, historyEnabled: true };
const record = (...attempts) => attempts.reduce((r, a) => recordTappingAttempt(r, context, exercise, a), null);

test('本次多轮和同题历史分离，迟到修正不增加轮数，保留实际速度与判定标准', () => {
  const second = { ...attempt, id: 'b', bpm: 80 };
  const corrected = { ...second, wrongTapCount: 1, details: { ...second.details, timingEvents: [...second.details.timingEvents, { kind: 'wrongTap', tapOffsetMs: 900 }] } };
  const session = record(attempt, second, corrected);
  const old = { ...attempt, id: 'old', details: undefined };
  const result = buildPracticeContextSummary({ ...source, session }, () => [record(old, attempt, corrected)]);
  assert.equal(result.session.totalAttempts, 2);
  assert.equal(result.session.recentAttempts[1].wrongTapCount, 1);
  assert.equal(result.session.recentAttempts[1].bpm, 80);
  assert.equal(result.session.recentAttempts[0].positions[1].measure, 2);
  assert.equal(result.session.recentAttempts[0].positions[1].beat, 1);
  assert.equal(result.history.totalAttempts, 1);
  assert.equal(result.history.recentAttempts[0].detailAvailability, 'summary-only');
  assert.equal(result.history.recentAttempts[0].stopped, null);
});

test('历史严格匹配题目来源、编号、模式和内容版本', () => {
  const base = record(attempt);
  const changed = structuredClone(exercise); changed.measures[0].elements[0].kind = 'rest';
  for (const mismatch of [{ ...base, exercise: changed }, { ...base, exerciseId: 'other' }, { ...base, source: 'random' }, { ...base, mode: 'dictation', attempts: [] }]) {
    assert.equal(buildPracticeContextSummary(source, () => [mismatch]).history.totalAttempts, 0);
  }
});

test('历史读取失败或无权限不影响本次分析，也不能伪装成没有历史', () => {
  const session = record(attempt);
  const failed = buildPracticeContextSummary({ ...source, session }, () => { throw new Error('storage'); });
  assert.equal(failed.history.status, 'read-error');
  assert.equal(failed.session.totalAttempts, 1);
  const unavailable = buildPracticeContextSummary({ ...source, session, historyEnabled: false }, () => { throw new Error('must not read'); });
  assert.equal(unavailable.history.status, 'unavailable');
});

test('听写未公开不发送标准谱面，公开后可讲解；只包含用户作答和验证事实', () => {
  const hidden = buildPracticeContextSummary({ ...source, mode: 'dictation' }, () => []);
  assert.equal(Object.hasOwn(hidden, 'exercise'), false);
  for (const field of ['currentAnswer', 'verdicts', 'selectedMeasure', 'bpm', 'audioBusy']) {
    assert.equal(Object.hasOwn(hidden, field), false, `记录摘要不推断页面字段 ${field}`);
  }
  assert.deepEqual(buildPracticeContextSummary({ ...source, mode: 'dictation', answerExposed: true }, () => []).exercise, exercise);
});

test('多轮快照有界，保留最新轮次和截断信息', () => {
  const session = record(...Array.from({ length: 50 }, (_, i) => ({ ...attempt, id: String(i) })));
  const result = buildPracticeContextSummary({ ...source, session }, () => []);
  assert.equal(result.session.totalAttempts, 50);
  assert.equal(result.session.recentAttempts.length, 20);
  assert.equal(result.session.recentAttempts.at(-1).id, '49');
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).length < 40 * 1024);
});

test('页面上下文与练习引用独立，覆盖层优先且关闭后恢复底层', () => {
  const scope = new AssistantContext();
  const page = Symbol(), lower = Symbol(), overlay = Symbol();
  scope.publish(page, { page: 'home', description: '首页', state: {} });
  scope.publishPractice(lower, 'A', () => ({ id: 'A' }));
  scope.publishPractice(overlay, 'B', () => ({ id: 'B' }));
  scope.publishPractice(lower, 'A', () => ({ id: 'A', latest: true }));
  assert.equal(scope.readCurrentPageContext().state.practice.snapshot.id, 'B');
  scope.removePractice(overlay);
  assert.equal(scope.readCurrentPageContext().state.practice.snapshot.id, 'A');
  scope.removePractice(lower);
  assert.equal(scope.readCurrentPageContext().state.practice.scope, 'recent');
  assert.equal(scope.getPracticeLabel(), '刚才练习：A');
  assert.equal(new AssistantContext().readCurrentPageContext(), null);
});

test('关闭覆盖层仍可引用，发送时读取最新历史，返回快照不可修改内部状态', () => {
  const scope = new AssistantContext(); const owner = Symbol(); let attempts = 1;
  scope.publishPractice(owner, 'A', () => ({ attempts }));
  scope.removePractice(owner); attempts = 2;
  const snapshot = scope.readCurrentPageContext();
  assert.equal(snapshot.state.practice.snapshot.attempts, 2);
  snapshot.state.practice.snapshot.attempts = 9;
  assert.equal(scope.readCurrentPageContext().state.practice.snapshot.attempts, 2);
});

test('新判定明细持久化并校验，旧汇总仍可读取，中断不算通过', () => {
  assert.deepEqual(parsePracticeRecord(record(attempt)).attempts[0].details, attempt.details);
  assert.equal(parsePracticeRecord(record({ ...attempt, details: undefined })).attempts[0].details, undefined);
  for (const details of [
    { ...attempt.details, timingEvents: [{ kind: 'unknown' }] },
    { ...attempt.details, timingEvents: [attempt.details.timingEvents[0], attempt.details.timingEvents[0]] },
    { ...attempt.details, timingEvents: [{ ...attempt.details.timingEvents[0], errorMs: Infinity }, attempt.details.timingEvents[1]] },
    { ...attempt.details, timingEvents: [attempt.details.timingEvents[0]] },
  ]) assert.throws(() => parsePracticeRecord(record({ ...attempt, details })));
  assert.equal(buildPracticeContextSummary({ ...source, session: record({ ...attempt, details: { ...attempt.details, stopped: true } }) }, () => []).session.recentAttempts[0].stopped, true);
});


test('会话活动仅记录有效结果；多轮合并，收到确认才清除，发送期间的更新留给下一批', () => {
  const activity = new PracticeActivity();
  activity.record(record(attempt), attempt.id, false);
  assert.equal(activity.prepare(), null);
  activity.start();
  activity.record(record(attempt), attempt.id, false);
  const first = activity.prepare();
  assert.equal(first.practices[0].session.totalAttempts, 1);
  assert.equal(activity.prepare().practices[0].session.totalAttempts, 1, '未确认不能删除');
  const second = { ...attempt, id: 'b' };
  activity.record(record(attempt, second), second.id, false);
  activity.acknowledge(first.batchId);
  const next = activity.prepare();
  assert.deepEqual(next.practices[0].session.recentAttempts.map(item => item.id), ['b']);
  activity.acknowledge(next.batchId);
  assert.equal(activity.prepare(), null);
  assert.equal(activity.getFocus().title, context.title, '后续消息仍有最近产生结果的题目');
  activity.record(record(attempt, second), second.id, false);
  assert.equal(activity.prepare(), null, '重复发布相同成绩不能产生新活动');
});

test('同一轮修正替换旧结果；跨题更新保留两题；重置丢弃旧会话批次', () => {
  const activity = new PracticeActivity(); activity.start();
  activity.record(record(attempt), attempt.id, false);
  const old = activity.prepare();
  const corrected = { ...attempt, bpm: 80 };
  activity.record(record(corrected), attempt.id, false);
  activity.record({ ...record(attempt), exerciseId: 'B', title: 'B' }, attempt.id, false);
  activity.acknowledge(old.batchId);
  const next = activity.prepare();
  assert.equal(next.practices.length, 2);
  assert.equal(next.practices[0].session.recentAttempts[0].bpm, 80);
  assert.equal(activity.getFocus().title, 'B');
  assert.equal(activity.getFocus().practiceRef, next.practices[1].practiceRef);
  activity.reset(); activity.start();
  activity.record(record(attempt), attempt.id, false);
  activity.acknowledge(next.batchId);
  assert.equal(activity.prepare().practices.length, 1, '旧会话确认不能清掉新活动');
});

test('听写累计设置、验证与最终作答，同次编辑使判定失效，未公开不泄露标准题目', () => {
  let dictation = null;
  const update = event => { dictation = recordDictationEvent(dictation, context, exercise, 'd', event, at); };
  update({ type: 'play', scope: 'all', bpm: 60, metronomeEnabled: true });
  update({ type: 'play', scope: 0, bpm: 50, metronomeEnabled: false });
  update({ type: 'play', scope: 'all', bpm: 60, metronomeEnabled: true });
  update({ type: 'verify', measureIndex: 0, correct: true, answerMeasures: [[{ kind: 'note', noteValue: 'whole' }], []] });
  const activity = new PracticeActivity(); activity.start();
  activity.record(dictation, 'd', false);
  update({ type: 'edit', measureIndex: 0, answerMeasures: [[], []] });
  activity.record(dictation, 'd', false);
  const output = activity.prepare();
  assert.equal(output.practices[0].session.totalAttempts, 1);
  const d = output.practices[0].session.recentAttempts[0];
  assert.equal(d.measures[0].verdict, 'unchecked');
  assert.deepEqual(d.answerMeasures, [[], []]);
  assert.deepEqual(d.playbackSettings, [{ bpm: 60, metronomeEnabled: true, count: 2 }, { bpm: 50, metronomeEnabled: false, count: 1 }]);
  for (const field of ['bpm', 'audioBusy', 'selectedMeasure', 'currentAnswer', 'verdicts']) {
    assert.equal(Object.hasOwn(output.practices[0], field), false, `活动不能冒充当前页面状态 ${field}`);
  }
  assert.equal(Object.hasOwn(output.practices[0], 'exercise'), false);
  assert.ok(!JSON.stringify(activity.getFocus()).includes('whole'));
  assert.deepEqual(parsePracticeRecord(dictation).attempts[0].playbackSettings, d.playbackSettings);
  assert.throws(() => parsePracticeRecord({ ...dictation, attempts: [{ ...dictation.attempts[0], playbackSettings: [{ bpm: -1, metronomeEnabled: true, count: 2 }] }] }));
});


test('记录对象可作为题目引用，摘要只投影身份字段，未公开听写不透传原始记录', () => {
  const dictation = recordDictationEvent(null, context, exercise, 'd', { type: 'play', scope: 'all' }, at);
  const summary = buildPracticeContextSummary({ context: dictation, exercise, mode: 'dictation',
    answerExposed: false, session: dictation, historyEnabled: false });
  assert.equal(summary.exerciseId, context.exerciseId);
  for (const field of ['exercise', 'attempts', 'id', 'createdAt', 'updatedAt']) {
    assert.equal(Object.hasOwn(summary, field), false, `不能透传记录字段 ${field}`);
  }
  const d = summary.session.recentAttempts[0];
  assert.equal(d.bpmAvailability, 'not-recorded');
  assert.equal(Object.hasOwn(d, 'answerMeasures'), false, '未记录答案时不能补成空白作答');
  assert.equal(Object.hasOwn(d, 'playbackSettings'), false, '不能补造默认速度');
});

test('活动轮次数保持完整，摘要只保留最近轮次，无需调用方再次过滤', () => {
  const activity = new PracticeActivity(); activity.start();
  for (let i = 0; i < 25; i++) {
    const next = { ...attempt, id: String(i), details: undefined };
    activity.record(record(next), next.id, false);
  }
  const practice = activity.prepare().practices[0];
  assert.equal(practice.session.totalAttempts, 25);
  assert.equal(practice.session.recentAttempts.length, 20);
  assert.equal(practice.session.recentAttempts.at(-1).id, '24');
  assert.equal(Object.hasOwn(practice, 'bpm'), false, '速度由每轮实际记录提供');
  assert.equal(practice.session.recentAttempts[0].bpm, 60);
});
