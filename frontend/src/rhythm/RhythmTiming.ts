import {
  expandRhythmElements,
  TICKS_PER_QUARTER,
  validateRhythmExercise,
  type RhythmExercise,
  type RhythmElement,
} from "./RhythmModel";

export type TargetTap = {
  // 按小节顺序展开后的全局事件下标，包含休止符占据的位置。
  eventIndex: number;
  offsetMs: number;
};

export type TimingWindows = {
  perfectMs: number;
  hitMs: number;
};

export type TargetTimingWindow = {
  opensAtMs: number;
  closesAtMs: number;
};

type TargetReference = {
  targetIndex: number;
  eventIndex: number;
};

export type TimingEvent =
  | (TargetReference & {
      kind: "hit";
      grade: "perfect" | "early" | "late";
      tapOffsetMs: number;
      errorMs: number;
    })
  | (TargetReference & {
      kind: "miss";
    })
  | {
      kind: "wrongTap";
      tapOffsetMs: number;
    };

export type PracticeResult = {
  passed: boolean;
  targetCount: number;
  hitCount: number;
  missCount: number;
  wrongTapCount: number;
};

/**
 * 汇总同一轮自然结束后的完整判定记录，不读取时钟或修改记录。
 * targetCount 为本轮目标总数；每个目标应恰好有一次 hit 或 miss。
 * 所有命中等级均算命中；零目标且没有误敲也通过。
 * 是否自然结束由调用者判断，中断和试听不使用此函数结算。
 */
export function summarizePractice(
  targetCount: number,
  timingEvents: readonly TimingEvent[],
): PracticeResult {
  let hitCount = 0;
  let missCount = 0;
  let wrongTapCount = 0;

  for (const event of timingEvents) {
    switch (event.kind) {
      case "hit":
        hitCount += 1;
        break;
      case "miss":
        missCount += 1;
        break;
      case "wrongTap":
        wrongTapCount += 1;
        break;
    }
  }

  return {
    passed: hitCount === targetCount && missCount === 0 && wrongTapCount === 0,
    targetCount,
    hitCount,
    missCount,
    wrongTapCount,
  };
}

export type PlaybackPosition = {
  phase: "countIn" | "playing" | "finished";
  countInBeat: number;
  playingBeatIndex: number;
};

/**
 * 将谱子的时值按 BPM 展开为时间线；不读取时钟，也不生成系统或音频的绝对时间。
 * 正式练习起点统一为 0ms。BPM 当前以四分音符为单位，事件时长逐个累计，
 * 休止符同样占用时间，但不生成待敲击目标。
 *
 * 返回的时间字段均以毫秒为单位，下标为按小节顺序展开的全局事件编号：
 * - targetTaps：音符的起点偏移及全局事件下标，供敲击匹配使用。
 * - measures：小节起止偏移及 firstEventIndex，供谱面关联时间与事件。
 * - eventStartOffsetsMs：所有事件（含休止符）的起点，供反馈位置映射。
 * - eventEndOffsetsMs：所有事件（含休止符）的终点偏移，供画面定位使用；
 *   它是音符/休止符的结束时刻，不是命中窗口关闭时刻。
 * - countInDurationMs：预备拍的总时长，是持续时间而非时间点。
 * - countInOffsetsMs：每声预备拍的起点偏移，位于正式起点之前，因而为负数。
 * - finishOffsetMs：谱子总时长与最后一个目标窗口关闭时刻中较晚的值，
 *   确保末尾休止符完整播放，也保留最后一拍允许晚击的时间。
 *
 * 例如 BPM 60、三拍预备拍：预备拍偏移为 [-3000, -2000, -1000]。
 * 这些偏移在每轮练习中不变；实际声音排程时才通过 clock.audioTimeAt() 转为绝对秒数。
 */
export function createExerciseTimeline(
  exercise: RhythmExercise,
  bpm: number,
  countInBeatCount: number | undefined,
  windows: TimingWindows,
) {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error("BPM 必须是大于 0 的有限数字。");
  }
  const countIn = createCountInTimeline(exercise.timeSignature, bpm, countInBeatCount);
  validateTimingWindows(windows);

  validateRhythmExercise(exercise);

  const quarterNoteDurationMs = 60_000 / bpm;
  let offsetMs = 0;
  let measureStartTick = 0;
  const targetTaps: TargetTap[] = [];
  const eventEndOffsetsMs: number[] = [];

  const eventStartOffsetsMs: number[] = [];
  // 小节之间不重置时间或事件编号，不插入停顿。
  const measures = exercise.measures.map((measure) => {
    const startOffsetMs = offsetMs;
    const firstEventIndex = eventEndOffsetsMs.length;
    const expanded = expandRhythmElements(measure.elements);
    const toMs = (tick: number) => tick / TICKS_PER_QUARTER * quarterNoteDurationMs;
    expanded.events.forEach(({ event, startTick, durationTicks }) => {
      const eventIndex = eventEndOffsetsMs.length;
      const eventStartMs = toMs(measureStartTick + startTick);
      eventStartOffsetsMs.push(eventStartMs);
      if (event.kind === "note") {
        targetTaps.push({ eventIndex, offsetMs: eventStartMs });
      }
      eventEndOffsetsMs.push(toMs(measureStartTick + startTick + durationTicks));
    });
    measureStartTick += expanded.durationTicks;
    offsetMs = toMs(measureStartTick);
    return { startOffsetMs, endOffsetMs: offsetMs, firstEventIndex };
  });

  const lastTarget = targetTaps.at(-1);
  const finishOffsetMs = Math.max(
    offsetMs,
    lastTarget ? getTargetTimingWindow(lastTarget, windows).closesAtMs : 0,
  );

  return {
    targetTaps,
    measures,
    eventStartOffsetsMs,
    eventEndOffsetsMs,
    ...countIn,
    finishOffsetMs,
  };
}

export type ExerciseTimeline = ReturnType<typeof createExerciseTimeline>;

/** 预备拍默认一小节；目前以四分音符数拍。显式指定非负整数可覆盖默认值，0 表示不预备。
 * 返回正式起点之前的负偏移和总时长，声音排程与练习时钟必须使用同一份结果。
 */
export function createCountInTimeline(
  timeSignature: RhythmExercise["timeSignature"],
  bpm: number,
  countInBeatCount: number = timeSignature.beats,
) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("BPM 必须是大于 0 的有限数字。");
  if (timeSignature.beatType !== 4) throw new Error("预备拍目前只支持以四分音符为一拍的拍号。");
  if (!Number.isInteger(countInBeatCount) || countInBeatCount < 0) throw new Error("预备拍数必须为非负整数。");
  const beatMs = 60000 / bpm;
  const countInDurationMs = countInBeatCount * beatMs;
  return {
    countInDurationMs,
    countInOffsetsMs: Array.from({ length: countInBeatCount }, (_, index) => (index - countInBeatCount) * beatMs),
  };
}

/** 直接从时间定位画面；回调延迟时跳到正确位置，不逐拍补播。 */
export function getPlaybackPosition(
  timeline: ExerciseTimeline,
  nowMs: number,
): PlaybackPosition {
  if (nowMs < 0) {
    return {
      phase: "countIn",
      // -1 表示还在第一声之前的调度缓冲中。
      countInBeat: timeline.countInOffsetsMs.findLastIndex((at) => nowMs >= at),
      playingBeatIndex: 0,
    };
  }
  if (nowMs >= timeline.finishOffsetMs) {
    return { phase: "finished", countInBeat: 0, playingBeatIndex: 0 };
  }
  const index = timeline.eventEndOffsetsMs.findIndex((end) => nowMs < end);
  return {
    phase: "playing",
    countInBeat: 0,
    playingBeatIndex:
      index === -1 ? timeline.eventEndOffsetsMs.length - 1 : index,
  };
}

/** 一次收齐已过期目标；用于每帧检查、敲击前检查和结束前结算。 */
export function collectExpiredTargets(
  targetTaps: readonly TargetTap[],
  nextTargetIndex: number,
  nowMs: number,
  windows: TimingWindows,
): TimingEvent[] {
  const misses: TimingEvent[] = [];
  for (let index = nextTargetIndex; index < targetTaps.length; index += 1) {
    const miss = evaluateExpiredTarget(targetTaps, index, nowMs, windows);
    if (miss === null) break;
    misses.push(miss);
  }
  return misses;
}

export function getTargetTimingWindow(
  target: TargetTap,
  windows: TimingWindows,
): TargetTimingWindow {
  validateTimingWindows(windows);

  return {
    opensAtMs: target.offsetMs - windows.hitMs,
    closesAtMs: target.offsetMs + windows.hitMs,
  };
}

/**
 * 处理一次有效敲击，返回本次记录与新游标，不修改输入。
 * 目标须按 offsetMs 升序排列；游标之前的目标均已结算，不能回头补敲。
 * 时间均为相对正式练习起点的毫秒数，调用者负责过滤本轮以外的输入。
 *
 * 先结算过期目标，再在 [目标起点 - hitMs, 目标起点 + hitMs) 内
 * 选择时间误差最小的待判定目标；等距优先较早目标。
 * 命中时将跳过的目标记为漏拍，再记录命中；无候选则记录误敲，
 * 不消耗尚未过期的目标。最后一条记录始终对应本次敲击。
 * |误差| <= perfectMs 为 perfect，其余负误差为 early，正误差为 late。
 */
export function evaluateTap(
  targetTaps: readonly TargetTap[],
  nextTargetIndex: number,
  tapTimeMs: number,
  windows: TimingWindows,
): { events: TimingEvent[]; nextTargetIndex: number } {
  validateTimingWindows(windows);
  const events = collectExpiredTargets(targetTaps, nextTargetIndex, tapTimeMs, windows);
  const firstPendingIndex = nextTargetIndex + events.length;
  let closestIndex = -1;
  let closestDistance = Infinity;
  for (let index = firstPendingIndex; index < targetTaps.length; index += 1) {
    const target = targetTaps[index];
    const { opensAtMs, closesAtMs } = getTargetTimingWindow(target, windows);
    if (tapTimeMs < opensAtMs) break;
    const distance = Math.abs(tapTimeMs - target.offsetMs);
    if (tapTimeMs < closesAtMs && distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }
  if (closestIndex === -1) {
    events.push({ kind: "wrongTap", tapOffsetMs: tapTimeMs });
    return { events, nextTargetIndex: firstPendingIndex };
  }

  for (let index = firstPendingIndex; index < closestIndex; index += 1) {
    events.push({ kind: "miss", targetIndex: index, eventIndex: targetTaps[index].eventIndex });
  }
  const target = targetTaps[closestIndex];
  const errorMs = tapTimeMs - target.offsetMs;

  let grade: "perfect" | "early" | "late";
  if (Math.abs(errorMs) <= windows.perfectMs) {
    grade = "perfect";
  } else if (errorMs < 0) {
    grade = "early";
  } else {
    grade = "late";
  }

  events.push({
    kind: "hit",
    grade,
    targetIndex: closestIndex,
    eventIndex: target.eventIndex,
    tapOffsetMs: tapTimeMs,
    errorMs,
  });
  return { events, nextTargetIndex: closestIndex + 1 };
}

export function evaluateExpiredTarget(
  targetTaps: readonly TargetTap[],
  nextTargetIndex: number,
  currentTimeMs: number,
  windows: TimingWindows,
): TimingEvent | null {
  // 已经判定完了
  if (nextTargetIndex >= targetTaps.length) {
    return null;
  }

  const target = targetTaps[nextTargetIndex];
  const { closesAtMs } = getTargetTimingWindow(target, windows);
  // 窗口关闭前仍然允许命中；右边界到达时才允许判漏拍。
  if (currentTimeMs < closesAtMs) {
    return null;
  }

  return {
    kind: "miss",
    targetIndex: nextTargetIndex,
    eventIndex: target.eventIndex,
  };
}

function validateTimingWindows(windows: TimingWindows): void {
  if (
    !Number.isFinite(windows.perfectMs) ||
    !Number.isFinite(windows.hitMs) ||
    windows.perfectMs < 0 ||
    windows.hitMs <= 0 ||
    windows.perfectMs > windows.hitMs
  ) {
    throw new Error(
      "判定窗口必须满足：0 <= perfectMs <= hitMs，且 hitMs > 0。",
    );
  }
}

/** 题目与草稿共用的播放时间线。未填满/空小节保留完整时长，不修改或补写草稿。 */
export function createRhythmPlaybackTimeline(
  measures: readonly (readonly RhythmElement[])[],
  timeSignature: RhythmExercise["timeSignature"],
  bpm: number,
) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("BPM 必须为正数。");
  const beatMs = 60000 / bpm;
  const measureTicks =
    timeSignature.beats * (4 / timeSignature.beatType) * TICKS_PER_QUARTER;
  const notes: { startOffsetMs: number; endOffsetMs: number }[] = [];
  measures.forEach((elements, index) => {
    const expanded = expandRhythmElements(elements);
    if (expanded.durationTicks > measureTicks)
      throw new Error(`第 ${index + 1} 小节超出允许的拍数。`);
    expanded.events.forEach(({ event, startTick, durationTicks }) => {
      if (event.kind !== "note") return;
      const start = index * measureTicks + startTick;
      notes.push({
        startOffsetMs: (start / TICKS_PER_QUARTER) * beatMs,
        endOffsetMs: ((start + durationTicks) / TICKS_PER_QUARTER) * beatMs,
      });
    });
  });
  return {
    notes,
    durationMs: ((measures.length * measureTicks) / TICKS_PER_QUARTER) * beatMs,
    ...createCountInTimeline(timeSignature, bpm),
  };
}
