/**
 * 为本轮练习固定一个音频时钟上的正式起点，并提供两种时间读法。
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
  context: Pick<AudioContext, "currentTime">,
  countInDurationMs: number,
  leadInMs = 100,
) {
  const practiceStartsAtSeconds =
    context.currentTime + (leadInMs + countInDurationMs) / 1000;

  return {
    nowMs: () => (context.currentTime - practiceStartsAtSeconds) * 1000,
    // 只有安排声音时，才把练习相对毫秒转换成音频绝对秒数。
    audioTimeAt: (offsetMs: number) =>
      practiceStartsAtSeconds + offsetMs / 1000,
  };
}

export type PracticeClock = ReturnType<typeof createPracticeClock>;

/** 正式阶段的独立节拍器声部。共用练习时钟，拍点位于 [0, durationMs)。
 * 开启时只安排尚未到来的拍点，不补响、不重置拍位；关闭不影响预备拍或钢琴。
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

const METRONOME_URL = `${import.meta.env.BASE_URL}assets/audio/metronome.mp3`;
// 当前素材主起音约在 46ms；保留少量起音余量，不修改原文件。
const METRONOME_OFFSET_SECONDS = 0.044;
const METRONOME_DURATION_SECONDS = 0.2;
const metronomeBuffers = new WeakMap<AudioContext, AudioBuffer>();
const metronomeLoads = new WeakMap<AudioContext, Promise<void>>();

/** 预备拍也依赖此采样，因此节拍器关闭时仍需准备。失败后允许重试。 */
export function prepareMetronomeSound(context: AudioContext): Promise<void> {
  const existing = metronomeLoads.get(context);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const response = await fetch(METRONOME_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (buffer.duration < METRONOME_OFFSET_SECONDS + METRONOME_DURATION_SECONDS) throw new Error("采样过短");
      metronomeBuffers.set(context, buffer);
    } catch {
      metronomeLoads.delete(context);
      throw new Error("节拍器声音加载失败，请重试。");
    }
  })();
  metronomeLoads.set(context, pending);
  return pending;
}

/** 提前安排一声预备拍提示音，并保留声源以便中途取消。 */
export function scheduleCountIn(
  context: AudioContext,
  startsAt: number,
  accent: boolean,
  sources: AudioScheduledSourceNode[],
) {
  if (!Number.isFinite(startsAt) || startsAt < 0) throw new Error("节拍器起点必须是有效音频时间。");
  const buffer = metronomeBuffers.get(context);
  if (!buffer) throw new Error("请先等待 prepareMetronomeSound() 完成。");
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  const duration = METRONOME_DURATION_SECONDS;
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
  source.start(startsAt, METRONOME_OFFSET_SECONDS, duration);
  sources.push(source);
}

// 试听参数集中在这里；保留原始采样，便于按实际听感调整。
const PIANO_URL = `${import.meta.env.BASE_URL}assets/audio/felt-piano-a4.mp3`;
const PIANO_OFFSET_SECONDS = 0.01;
const PIANO_FADE_SECONDS = 0.08;
const TAP_SOUND_SECONDS = 0.2;
const PIANO_GAIN = 0.7;
const pianoBuffers = new WeakMap<AudioContext, AudioBuffer>();
const pianoLoads = new WeakMap<AudioContext, Promise<void>>();

/** 开始一轮前等待加载/解码完成，再建立时钟。重复调用复用结果，失败后允许重试。 */
export function prepareTapSound(context: AudioContext): Promise<void> {
  const existing = pianoLoads.get(context);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const response = await fetch(PIANO_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (buffer.duration <= PIANO_OFFSET_SECONDS) throw new Error("采样过短");
      pianoBuffers.set(context, buffer);
    } catch {
      pianoLoads.delete(context);
      throw new Error("钢琴声音加载失败，请重试。");
    }
  })();
  pianoLoads.set(context, pending);
  return pending;
}

/** 立即播放固定长度的击拍反馈，不依赖谱面时值或命中误差。 */
export function playTapSound(context: AudioContext, sources?: AudioScheduledSourceNode[]): void {
  const startsAt = context.currentTime;
  scheduleTapSound(context, startsAt, startsAt + TAP_SOUND_SECONDS, sources);
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
  const buffer = pianoBuffers.get(context);
  if (!buffer) throw new Error("请先等待 prepareTapSound() 完成。");
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  // 音符结束或素材播完时收音；不循环或拉伸采样来伪造延音。
  const duration = Math.min(endsAt - startsAt, buffer.duration - PIANO_OFFSET_SECONDS);
  const attack = Math.min(0.002, duration / 4);
  const fadeStart = duration - Math.min(PIANO_FADE_SECONDS, duration / 4);
  // 跳过开头弱信号，短淡入避免切入噪声，末尾淡出避免截断产生爆音。
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(PIANO_GAIN, startsAt + attack);
  gain.gain.setValueAtTime(PIANO_GAIN, startsAt + fadeStart);
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

  source.start(startsAt, PIANO_OFFSET_SECONDS, duration);
  sources?.push(source);
}
