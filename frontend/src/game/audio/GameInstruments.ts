/** 第一版音乐音源与校准。游戏独立于训练音色设置；素材来源见 game-content/shared/audio/README.md。 */
export type MusicInstrument = "piano" | "ep" | "bass" | "kick" | "stick" | "hat";
type Sample = { midi: number; buffer: AudioBuffer };
export type GameSamples = Record<MusicInstrument, Sample[]>;
/** A bank is supplied by content; the audio engine does not know asset names or song IDs. */
export type SampleBank = readonly { instrument: MusicInstrument; midi: number; file: string }[];
let cache: { bank: SampleBank; sampleRate: number; pending: Promise<GameSamples> } | undefined;

/** 解码后的音源与每局节点分离；同采样率跨上下文共享，只保留最近一套音源。
 * 失败移除缓存，下一次启动可以重试；不缓存连接到旧上下文的音频节点。 */
export function loadGameSamples(context: AudioContext, bank: SampleBank): Promise<GameSamples> {
  if (cache?.bank === bank && cache.sampleRate === context.sampleRate) return cache.pending;
  const pending = Promise.all(bank.map(async ({ instrument, midi, file }) => {
    const response = await fetch(`${import.meta.env.BASE_URL}${file.replace(/^\//, "")}`);
    if (!response.ok) throw new Error(`音乐素材读取失败：${file}`);
    return { instrument, midi, buffer: await context.decodeAudioData(await response.arrayBuffer()) };
  })).then(entries => {
    const samples: GameSamples = { piano: [], ep: [], bass: [], kick: [], stick: [], hat: [] };
    for (const { instrument, midi, buffer } of entries) samples[instrument].push({ midi, buffer });
    return samples;
  });
  cache = { bank, sampleRate: context.sampleRate, pending };
  void pending.catch(() => { if (cache?.pending === pending) cache = undefined; });
  return pending;
}

export function nearestSample(samples: readonly Sample[], midi: number) {
  return samples.reduce((a, b) => Math.abs(b.midi - midi) < Math.abs(a.midi - midi) ? b : a);
}

/** 音高就近映射；保留谱面时值后释放。鼓声直接播放完整录音，不随 BPM 截短。
 * elapsed 为局部播放跳过的秒数，同时推进采样位置和包络；已结束返回 null。
 * 不循环采样或延长原录音。返回实际声源供本局统一追踪尾音和停止。
 */
export function playMusicVoice(context: BaseAudioContext, output: AudioNode, samples: GameSamples,
  instrument: MusicInstrument, at: number, gate: number, midi: number, volume: number, elapsed = 0) {
  const sample = nearestSample(samples[instrument], midi);
  const rate = 2 ** ((midi - sample.midi) / 12);
  const drum = instrument === "kick" || instrument === "stick" || instrument === "hat";
  const release = instrument === "bass" ? .25 : .28;
  const length = Math.min(drum ? sample.buffer.duration : gate + release, sample.buffer.duration / rate);
  if (elapsed >= length) return null;
  const source = context.createBufferSource(), gain = context.createGain();
  source.buffer = sample.buffer; source.playbackRate.value = rate;
  const attack = Math.min(.003, length / 4);
  const releaseAt = Math.max(attack, length - (drum ? .01 : release));
  const level = elapsed < attack ? volume * elapsed / attack : elapsed <= releaseAt ? volume
    : volume * (.0001 / volume) ** ((elapsed - releaseAt) / (length - releaseAt));
  gain.gain.setValueAtTime(level, at);
  if (elapsed < attack) gain.gain.linearRampToValueAtTime(volume, at + attack - elapsed);
  if (elapsed < releaseAt) gain.gain.setValueAtTime(volume, at + releaseAt - elapsed);
  gain.gain.exponentialRampToValueAtTime(.0001, at + length - elapsed);
  source.connect(gain).connect(output);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.start(at, elapsed * rate, (length - elapsed) * rate);
  return source;
}
