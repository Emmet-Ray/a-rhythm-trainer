import {
  createExerciseTimeline,
  summarizePractice,
  type TimingEvent,
} from "../rhythm/RhythmTiming";
import { exerciseSources } from "./PracticeRecord";
import {
  parseRhythmExercise,
  expandRhythmElements,
  TICKS_PER_QUARTER,
} from "../rhythm/RhythmModel";
import type { PracticeRecord } from "./PracticeRecord";
import { recordKey } from "./practiceRecords";

function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("记录格式无效");
}
function text(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("记录字段缺失");
}
function count(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error("计数无效");
}
function date(value: unknown) {
  text(value);
  if (!Number.isFinite(Date.parse(value))) throw new Error("记录时间无效");
}

/** 外部数据在存储边界校验；未知版本或损坏数据不能伪装成空列表再覆盖。 */
export function parsePracticeRecord(value: unknown): PracticeRecord {
  object(value);
  for (const key of ["id", "exerciseId", "title"] as const) text(value[key]);
  date(value.startedAt);
  date(value.updatedAt);
  if (!Object.hasOwn(exerciseSources, String(value.source)))
    throw new Error("来源无效");
  const exercise = parseRhythmExercise(value.exercise);
  if (value.mode === "tapping") {
    if (!Array.isArray(value.attempts) || value.attempts.length === 0)
      throw new Error("击拍记录为空");
    const ids = new Set<string>();
    for (const item of value.attempts) {
      object(item);
      text(item.id);
      date(item.completedAt);
      if (ids.has(item.id)) throw new Error("轮次重复");
      ids.add(item.id);
      if (
        typeof item.bpm !== "number" ||
        !Number.isFinite(item.bpm) ||
        item.bpm <= 0
      )
        throw new Error("速度无效");
      if (
        item.metronomeEnabled !== undefined &&
        typeof item.metronomeEnabled !== "boolean"
      )
        throw new Error("节拍器设置无效");
      object(item.timingWindows);
      const { perfectMs, hitMs } = item.timingWindows;
      if (
        typeof perfectMs !== "number" ||
        typeof hitMs !== "number" ||
        !Number.isFinite(perfectMs) ||
        !Number.isFinite(hitMs) ||
        perfectMs < 0 ||
        hitMs <= 0 ||
        perfectMs > hitMs
      )
        throw new Error("判定窗口无效");
      if (item.details !== undefined) {
        object(item.details);
        if (
          typeof item.details.stopped !== "boolean" ||
          !Array.isArray(item.details.timingEvents)
        )
          throw new Error("判定明细无效");
        const timeline = createExerciseTimeline(exercise, item.bpm, 0, {
          perfectMs,
          hitMs,
        });
        const targets = new Set<number>();
        for (const event of item.details.timingEvents) {
          object(event);
          if (!["hit", "miss", "wrongTap"].includes(String(event.kind)))
            throw new Error("判定类型无效");
          if (event.kind !== "wrongTap") {
            count(event.targetIndex);
            count(event.eventIndex);
            const targetIndex = event.targetIndex as number;
            if (
              targets.has(targetIndex) ||
              timeline.targetTaps[targetIndex]?.eventIndex !== event.eventIndex
            )
              throw new Error("判定目标无效");
            targets.add(targetIndex);
          }
          if (
            event.kind !== "miss" &&
            (typeof event.tapOffsetMs !== "number" ||
              !Number.isFinite(event.tapOffsetMs))
          )
            throw new Error("敲击时间无效");
          if (
            event.kind === "hit" &&
            (!["perfect", "early", "late"].includes(String(event.grade)) ||
              typeof event.errorMs !== "number" ||
              !Number.isFinite(event.errorMs))
          )
            throw new Error("击拍偏差无效");
        }
        const summary = summarizePractice(
          timeline.targetTaps.length,
          item.details.timingEvents as TimingEvent[],
        );
        if (
          targets.size !== timeline.targetTaps.length ||
          summary.targetCount !== item.targetCount ||
          summary.hitCount !== item.hitCount ||
          summary.missCount !== item.missCount ||
          summary.wrongTapCount !== item.wrongTapCount ||
          (item.details.stopped ? false : summary.passed) !== item.passed
        )
          throw new Error("判定明细与汇总不一致");
      }
      for (const key of [
        "targetCount",
        "hitCount",
        "missCount",
        "wrongTapCount",
      ] as const)
        count(item[key]);
      if (
        (item.hitCount as number) + (item.missCount as number) !==
          item.targetCount ||
        typeof item.passed !== "boolean" ||
        (item.passed &&
          !(
            item.hitCount === item.targetCount &&
            item.missCount === 0 &&
            item.wrongTapCount === 0
          ))
      )
        throw new Error("击拍结果无效");
    }
  } else if (value.mode === "dictation") {
    if (!Array.isArray(value.attempts) || value.attempts.length === 0)
      throw new Error("听写尝试为空或格式过旧");
    const ids = new Set<string>();
    for (const attempt of value.attempts) {
      object(attempt);
      text(attempt.id);
      date(attempt.startedAt);
      if (ids.has(attempt.id)) throw new Error("尝试重复");
      ids.add(attempt.id);
      if (attempt.completedAt !== null) {
        date(attempt.completedAt);
        if (
          Date.parse(attempt.completedAt as string) <
          Date.parse(attempt.startedAt as string)
        )
          throw new Error("完成时间早于开始时间");
      }
      if (
        typeof attempt.viewedAnswer !== "boolean" ||
        !Array.isArray(attempt.measures) ||
        attempt.measures.length !== exercise.measures.length
      )
        throw new Error("听写尝试无效");
      if (attempt.playbackSettings !== undefined) {
        if (!Array.isArray(attempt.playbackSettings))
          throw new Error("播放设置无效");
        for (const setting of attempt.playbackSettings) {
          object(setting);
          if (
            typeof setting.bpm !== "number" ||
            !Number.isFinite(setting.bpm) ||
            setting.bpm <= 0 ||
            typeof setting.metronomeEnabled !== "boolean"
          )
            throw new Error("播放设置无效");
          count(setting.count);
          if (setting.count === 0) throw new Error("播放次数无效");
        }
      }
      if (attempt.answerMeasures !== undefined) {
        if (
          !Array.isArray(attempt.answerMeasures) ||
          attempt.answerMeasures.length !== exercise.measures.length
        )
          throw new Error("作答小节无效");
        for (const measure of attempt.answerMeasures) {
          if (
            !Array.isArray(measure) ||
            expandRhythmElements(measure).durationTicks >
              exercise.timeSignature.beats * TICKS_PER_QUARTER
          )
            throw new Error("作答内容无效");
        }
      }
      for (const item of attempt.measures) {
        object(item);
        count(item.questionPlayCount);
        count(item.verificationCount);
        if (
          !["unchecked", "correct", "incorrect"].includes(
            String(item.verdict),
          ) ||
          (item.verdict !== "unchecked" && item.verificationCount === 0)
        )
          throw new Error("小节判定无效");
      }
      if (
        (attempt.completedAt !== null) !==
        (attempt.measures.length > 0 &&
          attempt.measures.every((item) => item.verdict === "correct"))
      )
        throw new Error("完成状态无效");
    }
  } else throw new Error("练习模式无效");
  return structuredClone({ ...value, exercise }) as PracticeRecord;
}

/** 校验完整记录集合，拒绝重复 ID 或同一内容版本的重复记录。 */
export function parsePracticeRecords(value: unknown): PracticeRecord[] {
  if (!Array.isArray(value)) throw new Error("记录集合格式无效");
  const records = value.map(parsePracticeRecord);
  if (
    new Set(records.map((item) => item.id)).size !== records.length ||
    new Set(records.map((item) => recordKey(item, item.exercise, item.mode)))
      .size !== records.length
  )
    throw new Error("存在重复的练习记录");
  return records;
}
