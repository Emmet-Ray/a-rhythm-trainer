import { practiceSounds, metronomeSounds, type PracticeSound, type MetronomeSound } from "./SoundSamples";

/**
 * 为本轮练习固定一个音频时钟上的正式起点。
 * 正式起点位于“创建时刻 + 调度余量 + 预备拍总时长”之后。
 * leadInMs 只给第一声预留排程时间；声音和判定共用同一起点，不会额外增加敲击误差。
 *
 * nowMs()：每次调用时读取最新音频时间，返回距离正式起点的毫秒数。
 *   起点为 0ms，预备拍期间为负数，正式开始后为非负数。
 * audioTimeAt(offsetMs)：把相对正式起点的毫秒数转换为音频时间轴上的秒数，
 *   用于 oscillator.start() 等音频排程；返回的是播放时刻，不是等待时长。
 *
 * 例如创建时音频时间为 10 秒，余量 100ms、预备拍 3000ms：
 * 正式起点为 13.1 秒，audioTimeAt(-3000) 为 10.1 秒；
 * 当音频时间走到 13.15 秒时，nowMs() 约为 50ms。
 */
export function createPracticeClock(
  context: Pick<AudioContext, "currentTime"> & Partial<Pick<AudioContext, "state">>,
  countInDurationMs: number,
  leadInMs = 100,
  inputClock: Pick<Performance, "now" | "timeOrigin"> = performance,
) {
  const practiceStartsAtSeconds =
    context.currentTime + (leadInMs + countInDurationMs) / 1000;
  let sampledAtMs = inputClock.now();
  let sampledAudioMs = context.currentTime * 1000;
  let inputEpochMs = sampledAtMs;

  // 暂停的精确边界无法从 currentTime 恢复；换段后宁可丢弃旧输入，不能跨暂停回推。
  function resetInputTime() {
    sampledAtMs = inputClock.now();
    sampledAudioMs = context.currentTime * 1000;
    inputEpochMs = sampledAtMs;
  }

  function sample() {
    const atMs = inputClock.now();
    const audioMs = context.currentTime * 1000;
    // statechange 尚未送达时的保守保护。50ms 是时钟不连续检测容差，非判定窗口。
    if ((context.state !== undefined && context.state !== "running") ||
      Math.abs((atMs - sampledAtMs) - (audioMs - sampledAudioMs)) > 50) {
      inputEpochMs = atMs;
    }
    sampledAtMs = atMs;
    sampledAudioMs = audioMs;
    return { atMs, audioMs };
  }

  return {
    nowMs: () => sample().audioMs - practiceStartsAtSeconds * 1000,
    /** 仅供可视化读时，不采样、不重置输入 epoch；动画帧不得改变击拍判定。 */
    readTimeMs: () => context.currentTime * 1000 - practiceStartsAtSeconds * 1000,
    /** 将浏览器事件创建时间映射到本轮音频时间；无效、跨轮或跨暂停输入返回 null。
     * 兼容旧浏览器的 epoch 毫秒；不以处理时间兜底，以免将旧输入误算成新敲击。
     * 这是事件分发延迟修正，不是硬件/输出延迟校准。
     */
    inputTimeMs: (timeStamp: number): number | null => {
      const { atMs, audioMs } = sample();
      const eventMs = timeStamp > 1e12 ? timeStamp - inputClock.timeOrigin : timeStamp;
      if (!Number.isFinite(eventMs) || eventMs < inputEpochMs || eventMs > atMs ||
        (context.state !== undefined && context.state !== "running")) return null;
      return audioMs - (atMs - eventMs) - practiceStartsAtSeconds * 1000;
    },
    /** 音频 statechange 时调用；调用方负责监听和清理。 */
    resetInputTime,
    // 只有安排声音时，才把练习相对毫秒转换成音频绝对秒数。
    audioTimeAt: (offsetMs: number) =>
      practiceStartsAtSeconds + offsetMs / 1000,
  };
}

export type PracticeClock = ReturnType<typeof createPracticeClock>;

/** 正式阶段的独立节拍器声部。共用练习时钟，拍点位于 [0, durationMs)。
 * 开启时只安排尚未到来的拍点，不补响、不重置拍位；关闭不影响预备拍或练习音色。
 * dispose 用于结束本轮，之后不能重新开启。当前 BPM 和重音按四分拍计算。
 */
export function createMetronome(
  context: AudioContext,
  clock: PracticeClock,
  bpm: number,
  beatsPerMeasure: number,
  durationMs: number,
) {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isInteger(beatsPerMeasure) || beatsPerMeasure <= 0
    || !Number.isFinite(durationMs) || durationMs < 0) throw new Error("节拍器需要有效的 BPM、小节拍数和播放时长。");
  let enabled = false;
  let disposed = false;
  const sources: AudioScheduledSourceNode[] = [];
  function stop() {
    sources.splice(0).forEach(source => source.stop());
  }
  return {
    setEnabled(next: boolean) {
      if (disposed || next === enabled) return;
      enabled = next;
      if (!enabled) { stop(); return; }
      const beatMs = 60000 / bpm;
      const firstBeat = Math.max(0, Math.floor(clock.nowMs() / beatMs) + 1);
      for (let beat = firstBeat; beat * beatMs < durationMs; beat++) {
        scheduleCountIn(context, clock.audioTimeAt(beat * beatMs), beat % beatsPerMeasure === 0, sources);
      }
    },
    dispose() { disposed = true; stop(); },
  };
}

export type Metronome = ReturnType<typeof createMetronome>;

type PreparedSound = { buffer: AudioBuffer; offset: number; duration: number };
const metronomeBuffers = new WeakMap<AudioContext, PreparedSound>();
const tapBuffers = new WeakMap<AudioContext, AudioBuffer>();
const loads = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer>>>();

/** 每个音频上下文按素材缓存解码结果，失败项移除以允许重试。 */
function loadSound(context: AudioContext, file: string, minimumDuration = 0.02): Promise<AudioBuffer> {
  let cache = loads.get(context);
  if (!cache) { cache = new Map(); loads.set(context, cache); }
  let pending = cache.get(file);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}assets/audio/${file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!Number.isFinite(buffer.duration) || buffer.duration <= minimumDuration) throw new Error("采样过短");
      return buffer;
    })().catch(error => { cache.delete(file); throw error; });
    cache.set(file, pending);
  }
  return pending;
}

/** 预备拍也使用所选节拍器。开始一轮前准备，运行中不切换。 */
export async function prepareMetronomeSound(context: AudioContext, sound: MetronomeSound = "mechanical"): Promise<void> {
  const sample = metronomeSounds.find(s => s.id === sound)!;
  try {
    const buffer = await loadSound(context, sample.file, sound === "mechanical" ? 0.244 : 0.02);
    metronomeBuffers.set(context, {
      buffer, offset: sound === "mechanical" ? 0.044 : 0,
      duration: sound === "mechanical" ? 0.2 : buffer.duration,
    });
  } catch { throw new Error("节拍器声音加载失败，请重试。"); }
}

/** 提前安排一声预备拍提示音，并保留声源以便中途取消。 */
export function scheduleCountIn(
  context: AudioContext,
  startsAt: number,
  accent: boolean,
  sources: AudioScheduledSourceNode[],
) {
  if (!Number.isFinite(startsAt) || startsAt < 0) throw new Error("节拍器起点必须是有效音频时间。");
  const prepared = metronomeBuffers.get(context);
  const buffer = prepared?.buffer;
  if (!buffer) throw new Error("请先等待 prepareMetronomeSound() 完成。");
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  const duration = prepared!.duration;
  const volume = accent ? 0.7 : 0.45;
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(volume, startsAt + 0.001);
  gain.gain.setValueAtTime(volume, startsAt + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, startsAt + duration);
  source.connect(gain).connect(context.destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    const index = sources.indexOf(source);
    if (index !== -1) sources.splice(index, 1);
  };
  source.start(startsAt, prepared!.offset, duration);
  sources.push(source);
}

// 试听参数集中在这里；保留原始采样，便于按实际听感调整。
const NOTE_OFFSET_SECONDS = 0;
const NOTE_FADE_SECONDS = 0.08;
const NOTE_GAIN = 0.7;

/** 开始一轮前准备所选乐器，再建立时钟。 */
export async function prepareTapSound(context: AudioContext, sound: PracticeSound = "piano"): Promise<void> {
  try {
    tapBuffers.set(context, await loadSound(context, practiceSounds.find(s => s.id === sound)!.file));
  } catch { throw new Error("练习声音加载失败，请重试。"); }
}

/** 起止时刻均为 AudioContext 上的绝对秒数；终点前平滑淡出，不越过音符边界。 */
export function scheduleTapSound(
  context: AudioContext,
  startsAt: number,
  endsAt: number,
  sources?: AudioScheduledSourceNode[],
): void {
  if (!Number.isFinite(startsAt) || startsAt < 0 || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    throw new Error("声音终点必须晚于起点，且起止时刻必须是有效音频时间。");
  }
  const buffer = tapBuffers.get(context);
  if (!buffer) throw new Error("请先等待 prepareTapSound() 完成。");
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  // 音符结束或素材播完时收音；不循环或拉伸采样来伪造延音。
  const duration = Math.min(endsAt - startsAt, buffer.duration - NOTE_OFFSET_SECONDS);
  const attack = Math.min(0.002, duration / 4);
  const fadeStart = duration - Math.min(NOTE_FADE_SECONDS, duration / 4);
  // 保留素材起音，短淡入避免切入噪声，末尾淡出避免截断产生爆音。
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(NOTE_GAIN, startsAt + attack);
  gain.gain.setValueAtTime(NOTE_GAIN, startsAt + fadeStart);
  gain.gain.linearRampToValueAtTime(0, startsAt + duration);

  source.connect(gain).connect(context.destination);

  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    if (sources) {
      const index = sources.indexOf(source);
      if (index !== -1) sources.splice(index, 1);
    }
  };

  source.start(startsAt, NOTE_OFFSET_SECONDS, duration);
  sources?.push(source);
}

/** 每轮独立的击拍发声器。先 prepareTapSound，再创建；音色固定在创建时。
 * 每次 tap 同步起音，松键不截断。stop 清除所有尾音，之后仍可继续敲击。
 * 有限重叠：2 秒自然采样（末尾 300ms 收音），最多 4 个有效声部，
 * 超额时最旧声部用 40ms 淡出；淡出期间允许短暂共存。
 * 自然结算不必 stop，让末次尾音衰减；主动停止或开始下一轮时必须 stop。
 */
export function createTapFeedback(context: AudioContext) {
  const buffer = tapBuffers.get(context);
  if (!buffer) throw new Error("请先等待 prepareTapSound() 完成。");
  type Voice = { source: AudioBufferSourceNode; gain: GainNode; end: number; retiring: boolean };
  const voices = new Set<Voice>();
  function retire(voice: Voice, at: number) {
    if (voice.retiring || voice.end <= at) return;
    voice.retiring = true;
    const end = Math.min(voice.end, at + 0.04);
    // 保留包络在此刻的实际值，不能恢复成峰值，否则旧尾音会突然变响。
    voice.gain.gain.cancelAndHoldAtTime(at);
    voice.gain.gain.linearRampToValueAtTime(0, end);
    voice.end = end;
    voice.source.stop(end);
  }
  return {
    tap() {
      const at = context.currentTime;
      const active = [...voices].filter(voice => !voice.retiring && voice.end > at);
      for (const voice of active.slice(0, Math.max(0, active.length - 4 + 1))) retire(voice, at);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      const duration = Math.min(2, buffer.duration);
      const end = at + duration;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(NOTE_GAIN, at + Math.min(0.002, duration / 4));
      gain.gain.setValueAtTime(NOTE_GAIN, end - Math.min(0.3, duration / 4));
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain).connect(context.destination);
      const voice = { source, gain, end, retiring: false };
      voices.add(voice);
      source.onended = () => { voices.delete(voice); source.disconnect(); gain.disconnect(); };
      source.start(at, 0, duration);
    },
    stop() {
      for (const voice of voices) retire(voice, context.currentTime);
    },
  };
}
