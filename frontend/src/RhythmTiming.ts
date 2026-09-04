import {
  noteValueToDurationInQuarterNotes,
  type RhythmExercise,
} from "./RhythmModel";

export type TargetTap = {
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
  | (TargetReference & {
      kind: "tooEarly";
      tapOffsetMs: number;
      errorMs: number;
    });

// todo: 这里后续可能需要把currentTimeMs作为一个参数传进来，因为现在在用的是相对时间，后面可能需要改成相对于传进来的时间。
export function createTargetTapTimeline(
  exercise: RhythmExercise,
  bpm: number,
): TargetTap[] {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error("BPM 必须是大于 0 的有限数字。");
  }

  const quarterNoteDurationMs = 60_000 / bpm;
  let currentTimeMs = 0;
  const targetTaps: TargetTap[] = [];

  exercise.events.forEach((event, eventIndex) => {
    if (event.kind === "note") {
      targetTaps.push({ eventIndex, offsetMs: currentTimeMs });
    }

    currentTimeMs +=
      quarterNoteDurationMs *
      noteValueToDurationInQuarterNotes(event.noteValue);
  });

  return targetTaps;
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

export function evaluateTap(
  targetTaps: readonly TargetTap[],
  nextTargetIndex: number,
  tapTimeMs: number,
  windows: TimingWindows,
): TimingEvent | null {
  /**
   *  todo: 具体怎么判断的？
   */
  // 已经结束了，不需要再判定了
  if (nextTargetIndex >= targetTaps.length) {
    return null;
  }

  const target = targetTaps[nextTargetIndex];
  const { opensAtMs, closesAtMs } = getTargetTimingWindow(target, windows);
  const errorMs = tapTimeMs - target.offsetMs;

  if (tapTimeMs < opensAtMs) {
    return {
      kind: "tooEarly",
      targetIndex: nextTargetIndex,
      eventIndex: target.eventIndex,
      tapOffsetMs: tapTimeMs,
      errorMs,
    };
  }
  // 命中窗口采用左闭右开区间；到达右边界后由超时逻辑判定 miss。
  if (tapTimeMs >= closesAtMs) {
    return null;
  }

  let grade: "perfect" | "early" | "late";
  if (Math.abs(errorMs) <= windows.perfectMs) {
    grade = "perfect";
  } else if (errorMs < 0) {
    grade = "early";
  } else {
    grade = "late";
  }

  return {
    kind: "hit",
    grade,
    targetIndex: nextTargetIndex,
    eventIndex: target.eventIndex,
    tapOffsetMs: tapTimeMs,
    errorMs,
  };
}

export function evaluateExpiredTarget(
  targetTaps: readonly TargetTap[],
  nextTargetIndex: number,
  currentTimeMs: number,
  windows: TimingWindows,
): TimingEvent | null {
  // 现在（currentTimeMs）是否已经吵了
  // 已经判定完了
  if (nextTargetIndex >= targetTaps.length) {
    return null;
  }

  const target = targetTaps[nextTargetIndex];
  const { closesAtMs } = getTargetTimingWindow(target, windows);
  // nextTargetIndex已经 加1 过了，也就是上一个目标已经被匹配过了，没有miss
  // 其实 加1 过之后根本不会运行到这里了，因为useEffect又重置了？
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
