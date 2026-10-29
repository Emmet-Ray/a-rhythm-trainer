import { createPracticeClock, createTapFeedback, prepareMetronomeSound, prepareTapSound, scheduleCountIn, scheduleTapSound, type PracticeClock } from "../../rhythm/RhythmAudio";
import type { PracticeSound, MetronomeSound } from "../../rhythm/SoundSamples";
import { OrbitRound, READY_ORBIT } from "../core/OrbitRound";
import { OrbitPreview } from "../core/OrbitPreview";
import { OrbitEnding, type OrbitDisplaySnapshot } from "./OrbitEnding";
import { prepareGameMusic } from "../audio/GameMusic";
import type { MusicScore } from "../core/MusicScore";
import type { OrbitTrack } from "../core/OrbitTrack";

export type OrbitMode = "challenge" | "preview";
export type OrbitPlaybackSnapshot = OrbitDisplaySnapshot & { mode: OrbitMode };

type Options = {
  track: OrbitTrack;
  music?: MusicScore;
  onChange: (snapshot: OrbitPlaybackSnapshot) => void;
  acquirePlayback: (stop: () => void) => () => void;
};

/** 画面只读的音频时间快照。运动时间可在终态冻结，场景与收尾时间仍跟随音频。 */
export type OrbitFrame = {
  timeMs: number;
  beatMs: number;
  visualTimeMs: number;
  snapshot: OrbitDisplaySnapshot;
  hit: { index: number; at: number };
  terminalAt: number;
};

/** 拥有游戏运行状态、音频上下文及播放所有权，不依赖 DOM 或 Phaser。
 * start 固定一轮的速度、音色、精度与模式；stop/dispose 作废异步加载和完成通知。
 * 后台定时推进与 readFrame 共用音频时钟，读取画面不产生额外的声音排程。
 * dispose 后不可重新启动；加载失败释放资源并向调用方报告，已取消的加载不再报告。
 */
export function createOrbitSession(options: Options) {
  let disposed = false;
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  let generation = 0;
  let context: AudioContext | null = null;
  let clock: PracticeClock | null = null;
  let round: OrbitRound | OrbitPreview | null = null;
  let mode: OrbitMode = "challenge";
  let feedback: { tap: (index: number) => void; finish: (done: () => void) => void; stop: () => void } | null = null;
  let audioFinishRequested = false;
  let audioFinished = false;
  let ending: OrbitEnding | null = null;
  let hitFlash = { index: 0, at: -Infinity };
  let release: (() => void) | null = null;
  let loading: AbortController | null = null;
  const sources: AudioScheduledSourceNode[] = [];
  let published: OrbitDisplaySnapshot = READY_ORBIT;

  function publish(snapshot: OrbitDisplaySnapshot) {
    if (disposed || snapshot === published) return;
    published = snapshot;
    options.onChange({ ...snapshot, mode });
  }
  function stopAudio() {
    sources.splice(0).forEach(source => source.stop());
    feedback?.stop(); feedback = null;
    release?.(); release = null;
  }
  function synchronize(time: number) {
    if (!round || !ending) return;
    if (round.snapshot.phase === "failed") stopAudio();
    if (round.snapshot.phase === "completed" && !audioFinishRequested) {
      audioFinishRequested = true;
      const version = generation;
      const finished = () => { if (!disposed && generation === version) audioFinished = true; };
      if (feedback) feedback.finish(finished); else finished();
    }
    const landedAt = mode === "preview" ? (options.track.targets.at(-1) ?? 0) * round.beatMs : round.stoppedAtMs ?? time;
    const snapshot = ending.read(round.snapshot, time, audioFinished && sources.length === 0, landedAt);
    if (snapshot.phase === "completed") { release?.(); release = null; }
    publish(snapshot);
  }
  function stop() {
    generation++;
    loading?.abort(); loading = null;
    clearInterval(progressTimer); progressTimer = undefined;
    stopAudio();
    clock = null;
    round = null;
    mode = "challenge";
    audioFinishRequested = false; audioFinished = false; ending = null;
    hitFlash = { index: 0, at: -Infinity };
    publish(READY_ORBIT);
  }
  function currentTime() {
    const time = clock?.readTimeMs() ?? -1000;
    // 提前命中末拍时，仍随音频时间走完入场圆弧，不能跳到未来的停止时间。
    return round && round.stoppedAtMs !== null ? Math.min(time, round.stoppedAtMs) : time;
  }
  function tick() {
    if (!round || !clock) return;
    if (context?.state !== "running") return;
    const time = clock.readTimeMs(), previousHits = round.snapshot.hits;
    round.advance(time);
    if (mode === "preview" && round.snapshot.hits > previousHits) {
      const index = round.snapshot.hits;
      hitFlash = { index, at: options.track.targets[index - 1] * round.beatMs };
    }
    synchronize(time);
    if (published.phase === "completed" || published.phase === "failed") {
      clearInterval(progressTimer); progressTimer = undefined;
    }
  }

  return {
    /** 推进至当前音频时间并读取完整帧；无画面时由后台定时器继续推进。 */
    readFrame(): OrbitFrame {
      tick();
      const time = currentTime();
      return { timeMs: time, beatMs: round?.beatMs ?? 1000, visualTimeMs: clock?.readTimeMs() ?? time,
        snapshot: published, hit: hitFlash, terminalAt: ending?.atMs ?? -Infinity };
    },
    async start(bpm: number, sounds: { practice: PracticeSound; metronome: MetronomeSound }, windows: { hitMs: number; perfectMs: number }, playbackMode: OrbitMode = "challenge") {
      if (disposed) return;
      stop();
      windows = { ...windows };
      sounds = { ...sounds };
      mode = playbackMode;
      const version = generation;
      const controller = new AbortController();
      loading = controller;
      release = options.acquirePlayback(stop);
      publish({ ...READY_ORBIT, phase: "loading" });
      try {
        context ??= new AudioContext();
        await context.resume();
        if (disposed || generation !== version) return;
        const [, preparedMusic] = await Promise.all([prepareMetronomeSound(context, sounds.metronome),
          options.music ? prepareGameMusic(context, options.music, options.track, bpm, controller.signal) : prepareTapSound(context, sounds.practice)]);
        if (disposed || generation !== version) { preparedMusic?.stop(); return; }
        loading = null;
        round = mode === "preview" ? new OrbitPreview(bpm, options.track) : new OrbitRound(bpm, windows, options.track);
        ending = new OrbitEnding(options.track.durationBeats * round.beatMs);
        clock = createPracticeClock(context, round.beatMs * 4);
        const music = preparedMusic ?? null;
        feedback = music ?? (mode === "challenge" ? createTapFeedback(context) : null);
        music?.start(clock, mode === "preview" ? "automatic" : "on-hit");
        if (mode === "preview" && !music) {
          for (const [index, target] of options.track.targets.entries()) {
            const end = options.track.targets[index + 1] ?? options.track.durationBeats;
            scheduleTapSound(context, clock.audioTimeAt(target * round.beatMs), clock.audioTimeAt(end * round.beatMs), sources);
          }
        }
        for (let beat = -4; beat < (music ? 0 : options.track.durationBeats); beat++) {
          scheduleCountIn(context, clock.audioTimeAt(beat * round.beatMs), ((beat + 4) % 4) === 0, sources);
        }
        // 隐藏画面或浏览器暂停 RAF 时，仍按音频时钟推进判定和收尾。
        // 定时器不排程音乐，也不累计时间；后台节流后直接读取实际进度。
        progressTimer = setInterval(tick, 50);
        publish(round.snapshot);
      } catch (error) {
        if (disposed || generation !== version) return;
        stop();
        throw error;
      }
    },
    tap(timeStamp: number) {
      if (!(round instanceof OrbitRound) || !clock) return;
      const time = clock.inputTimeMs(timeStamp);
      if (time === null) return;
      const hit = round.tap(time);
      if (hit) {
        feedback?.tap(round.snapshot.hits - 1);
        hitFlash = { index: round.snapshot.hits, at: time };
      }
      synchronize(clock.readTimeMs());
    },
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      if (context && context.state !== "closed") void context.close();
    },
  };
}
export type OrbitSession = ReturnType<typeof createOrbitSession>;
