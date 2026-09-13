import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MetronomePlaybackContext } from "./MetronomePlayback";
import type { RhythmElement, RhythmExercise } from "../rhythm/RhythmModel";
import { createRhythmPlaybackTimeline } from "../rhythm/RhythmTiming";
import {
  createPracticeClock,
  createMetronome,
  prepareTapSound,
  prepareMetronomeSound,
  scheduleCountIn,
  scheduleTapSound,
  type Metronome,
} from "../rhythm/RhythmAudio";

type PlaybackOption = {
  id: string;
  label: string;
  stopLabel: string;
  measures: readonly (readonly RhythmElement[])[] | null;
};

/**
 * 互斥播放调用方提供的题目或草稿，不持有答案、选择或判定；候选 ID 应稳定且唯一。
 * 每次点击固定时间线；编辑不改变已排程声音，全空草稿不可开始，但活动项始终可停止。
 * BPM、播放范围或小节数量改变时，调用方用 key 重建；卸载取消排程、RAF 和异步启动并关闭音频。
 * 节拍器开关实时生效，不参与 key，也不影响预备拍和钢琴。
 */
export default function RhythmPlayback({ options, timeSignature, bpm, metronomeEnabled = true, extraActions }: {
  options: readonly PlaybackOption[];
  timeSignature: RhythmExercise["timeSignature"] | null;
  bpm: number;
  metronomeEnabled?: boolean;
  extraActions?: (busy: boolean) => ReactNode;
}) {
  const metronomePlayback = useContext(MetronomePlaybackContext);
  const clearMetronomePlaybackRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<
    "idle" | "starting" | "countIn" | "playing" | "finished"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const metronomeRef = useRef<Metronome | null>(null);
  const metronomeEnabledRef = useRef(metronomeEnabled);
  useEffect(() => {
    metronomeEnabledRef.current = metronomeEnabled;
    metronomeRef.current?.setEnabled(metronomeEnabled);
  }, [metronomeEnabled]);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef<string | null>(null);
  const [playbackSource, setPlaybackSource] = useState<string | null>(null);

  const cancelPlayback = useCallback(() => {
    clearMetronomePlaybackRef.current?.();
    clearMetronomePlaybackRef.current = null;
    metronomeRef.current?.dispose();
    metronomeRef.current = null;
    // resume 尚未完成时也能取消；旧请求恢复后不得再安排声音。
    requestRef.current += 1;
    activeRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sourcesRef.current.forEach((source) => source.stop());
    sourcesRef.current = [];
  }, []);

  useEffect(
    () => () => {
      cancelPlayback();
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    },
    [cancelPlayback],
  );

  async function togglePlayback(option: PlaybackOption) {
    const source = option.id;
    if (activeRef.current === source) {
      cancelPlayback();
      setStatus("idle");
      return;
    }
    if (!timeSignature || !option.measures?.some((elements) => elements.length > 0)) return;
    // 新一轮开始前清理上一轮尚未结束的自然尾音。
    cancelPlayback();
    activeRef.current = source;
    setPlaybackSource(source);
    const request = ++requestRef.current;
    setStatus("starting");
    setError(null);
    try {
      const timeline = createRhythmPlaybackTimeline(
        option.measures,
        timeSignature,
        bpm,
      );
      const context =
        contextRef.current ?? (contextRef.current = new AudioContext());
      await Promise.all([
        context.resume(),
        prepareTapSound(context),
        prepareMetronomeSound(context),
      ]);
      if (request !== requestRef.current) return;
      const clock = createPracticeClock(context, timeline.countInDurationMs);
      metronomeRef.current = createMetronome(
        context,
        clock,
        bpm,
        timeSignature.beats,
        timeline.durationMs,
      );
      metronomeRef.current.setEnabled(metronomeEnabledRef.current);
      timeline.countInOffsetsMs.forEach((offset, index) => {
        scheduleCountIn(
          context,
          clock.audioTimeAt(offset),
          index === 0,
          sourcesRef.current,
        );
      });
      timeline.notes.forEach((note) => {
        scheduleTapSound(
          context,
          clock.audioTimeAt(note.startOffsetMs),
          clock.audioTimeAt(note.endOffsetMs),
          sourcesRef.current,
        );
      });
      // 末尾休止符同样占时，不能以“最后一声播完”作为整题结束。
      const endsAtMs = timeline.durationMs;
      clearMetronomePlaybackRef.current = metronomePlayback?.start({
        readTimeMs: clock.readTimeMs, bpm,
        countInDurationMs: timeline.countInDurationMs,
        durationMs: endsAtMs,
      }) ?? null;
      function update() {
        if (request !== requestRef.current) return;
        const nowMs = clock.nowMs();
        if (nowMs >= endsAtMs) {
          // 声音已按各自终点归零，这里收尾，不等待采样的长尾音。
          cancelPlayback();
          setStatus("finished");
          return;
        }
        setStatus(nowMs < 0 ? "countIn" : "playing");
        frameRef.current = requestAnimationFrame(update);
      }
      frameRef.current = requestAnimationFrame(update);
    } catch {
      if (request !== requestRef.current) return;
      cancelPlayback();
      setStatus("idle");
      setError("无法播放声音，请重试。");
    }
  }

  const isActive =
    status === "starting" || status === "countIn" || status === "playing";
  const text =
    status === "starting"
      ? "准备中"
      : status === "countIn"
        ? "预备拍"
        : status === "playing"
          ? "播放中"
          : status === "finished"
            ? "播放结束"
            : "";

  return (
    <div className="rhythm-playback design-system">
      <div className="rhythm-playback-buttons">
        {options.map((option) => {
          const playing = isActive && playbackSource === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-action={playing ? "stop" : "play"}
              data-source={option.id}
              disabled={!playing && (!timeSignature || !option.measures?.some((elements) => elements.length > 0))}
              onClick={() => void togglePlayback(option)}
            >
              {playing ? option.stopLabel : option.label}
            </button>
          );
        })}
        {extraActions?.(isActive)}
      </div>
      <span className="rhythm-playback-status" role="status">{text}</span>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
