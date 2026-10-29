import { SoundFontSynth } from "./SoundFontSynth";
import processorUrl from "spessasynth_lib/dist/spessasynth_processor.min.js?url";
import type { PracticeClock } from "../../rhythm/RhythmAudio";
import type { MusicScore } from "../core/MusicScore";
import { compileMultipartScore, type PerformanceNote, type MusicPart } from "../core/MultipartScore";
import type { OrbitTrack } from "../core/OrbitTrack";

const modules = new WeakMap<AudioContext, Promise<void>>();
let bankCache: { url: string; pending: Promise<ArrayBuffer> } | undefined;

function loadBank(file: string) {
  const url = `${import.meta.env.BASE_URL}${file.replace(/^\//, "")}`;
  if (bankCache?.url === url) return bankCache.pending;
  const pending = fetch(url).then(response => {
    if (!response.ok) throw new Error(`音色库读取失败：${response.status}`);
    return response.arrayBuffer();
  });
  bankCache = { url, pending };
  void pending.catch(() => { if (bankCache?.pending === pending) bankCache = undefined; });
  return pending;
}

/** One worklet per round, immutable bank bytes across rounds. Destroying the worklet
 * cancels its future MIDI queue as well as sounding voices; stopAll alone cannot do this.
 * The worklet URL is emitted by Vite from the installed package, keeping versions in sync.
 */
export async function prepareSoundFontMusic(context: AudioContext, score: MusicScore, track: OrbitTrack,
  bpm: number, signal?: AbortSignal) {
  const performance = compileMultipartScore(score);
  const config = performance.soundFont;
  const beat = 60 / bpm, startBeat = performance.measureStarts[track.range.startMeasure];
  const endBeat = performance.measureStarts[track.range.endMeasure];
  const hits = performance.hits.filter(h => h.beat >= startBeat - 1e-8 && h.beat < endBeat - 1e-8);
  if (hits.length !== track.targets.length || hits.some((h, i) => Math.abs(h.beat - startBeat - track.targets[i]) > 1e-8))
    throw Error(`${score.title}: 击拍映射与选段轨道不一致。`);
  const automatic = performance.notes.filter(n => n.beat < endBeat && n.beat + n.duration > startBeat
    && (n.hit === null || n.beat < startBeat - 1e-8));
  type Lane = { channel: number; until: number };
  type Pool = { part: MusicPart; lanes: Lane[]; manual: boolean };
  const pools: Pool[] = [];
  const counters = [0, 1];
  for (const part of performance.parts) for (const manual of [false, true]) {
    const notes = manual ? hits.flatMap(h => h.notes).filter(n => n.part === part) : automatic.filter(n => n.part === part);
    if (!notes.length) continue;
    // Reserve enough lanes for score overlap plus early/late hit timing. Each lane
    // holds one gate, so an old note-off can never end a newer repeated pitch.
    const edges = notes.flatMap(n => [[n.beat * beat - (manual ? .4 : 0), 1], [(n.beat + n.duration) * beat + (manual ? .4 : 0), -1]]);
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0, count = 0;
    for (const [, delta] of edges) { active += delta; count = Math.max(count, active); }
    const parity = Number(manual);
    const lanes = Array.from({ length: count }, () => { const channel = counters[parity]; counters[parity] += 2; return { channel, until: -Infinity }; });
    pools.push({ part, manual, lanes });
  }
  const channelCount = Math.max(16, ...pools.flatMap(p => p.lanes.map(l => l.channel + 1)));
  if (channelCount > 512) throw Error(`${score.title}: 本轮需要 ${channelCount} 个 GS 通道，超过当前 512 通道资源预算。`);
  if (!context.audioWorklet) throw new Error("GS 播放需要支持 AudioWorklet 的浏览器，请使用 HTTPS 或 localhost。");
  signal?.throwIfAborted();
  let module = modules.get(context);
  if (!module) {
    module = context.audioWorklet.addModule(processorUrl);
    modules.set(context, module);
    void module.catch(() => { if (modules.get(context) === module) modules.delete(context); });
  }
  const [bytes] = await Promise.all([loadBank(config.file), module]).catch(error => {
    throw new Error("GS 音色加载失败，请检查网络后重试。", { cause: error });
  });
  signal?.throwIfAborted();
  const synth = new SoundFontSynth(context);
  const output = context.createGain(), backingOutput = context.createGain();
  output.gain.value = config.gain;
  backingOutput.connect(output);
  let destroyed = false, stopped = false, boundaryEnded = false;
  let boundary: ConstantSourceNode | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let cleanup: ReturnType<typeof setTimeout> | undefined;
  let done: (() => void) | undefined;
  let lastOff = 0;
  let rejectInitialization: ((reason: Error) => void) | undefined;
  function abort() {
    destroy(); rejectInitialization?.(new DOMException("音色加载已取消", "AbortError"));
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearInterval(poll); clearTimeout(cleanup);
    signal?.removeEventListener("abort", abort);
    boundary?.disconnect(); backingOutput.disconnect(); output.disconnect();
    synth.destroy();
  }
  signal?.addEventListener("abort", abort, { once: true });
  try {
    // addSoundBank transfers its buffer, so retain the cached original for retries.
    await Promise.race([
      (async () => { await synth.soundBankManager.addSoundBank(bytes.slice(0), "game"); await synth.isReady; })(),
      new Promise<never>((_resolve, reject) => { rejectInitialization = reject; }),
    ]);
    rejectInitialization = undefined;
    signal?.throwIfAborted();
    synth.setLogLevel(false, false, false);
    // Dry playback: natural SF2 envelopes remain intact; no hidden effect tail or compressor.
    synth.setSystemParameter("effectsEnabled", false);
    synth.setSystemParameter("voiceCap", 256);
    if (channelCount > synth.midiChannels.length) await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout); signal?.removeEventListener("abort", cancelled);
        synth.eventHandler.removeEvent("channelAdded", "game-channels");
        if (error) reject(error); else resolve();
      };
      const cancelled = () => finish(new DOMException("通道初始化已取消", "AbortError"));
      const timeout = setTimeout(() => finish(Error("GS 通道初始化超时。")), 5000);
      signal?.addEventListener("abort", cancelled, { once: true });
      let confirmed = synth.midiChannels.length;
      synth.eventHandler.addEvent("channelAdded", "game-channels", () => {
        if (++confirmed >= channelCount) finish();
      });
      const missing = channelCount - synth.midiChannels.length;
      for (let i = 0; i < missing; i++) synth.addNewChannel();
    });
    signal?.throwIfAborted();
    for (const pool of pools) for (const { channel } of pool.lanes) {
      const preset = pool.part.preset;
      synth.midiChannels[channel].setDrums(preset.kind === "drums");
      synth.midiChannels[channel].setSystemParameter("gain", pool.part.gain ?? 1);
      synth.controllerChange(channel, 0, preset.bank ?? 0);
      synth.controllerChange(channel, 7, 100);
      synth.controllerChange(channel, 10, 64);
      synth.programChange(channel, preset.program);
    }
    // SpessaSynth folds extended channel outputs modulo 16. Connect each physical
    // output once: even channels are automatic voices, odd channels are hit voices.
    for (let channel = 0; channel < 16; channel++) synth.connectChannel(channel % 2 ? output : backingOutput, channel);
    output.connect(context.destination);
  } catch (error) {
    destroy();
    if (signal?.aborted) throw error;
    throw new Error("GS 音色加载失败，请重试。", { cause: error });
  }

  function play(note: PerformanceNote, at: number, duration: number, manual: boolean) {
    if (destroyed || stopped) return;
    const pool = pools.find(p => p.part === note.part && p.manual === manual)!;
    const lane = pool.lanes.find(l => l.until <= at + 1e-8);
    if (!lane) throw Error(`声部 ${note.part.name} 的实际重叠超过预留通道，请缩小击拍偏差或调整编配。`);
    const off = at + Math.max(duration, .01);
    lane.until = off;
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * (note.part.velocityScale ?? 1) * 127)));
    synth.noteOn(lane.channel, note.midi, velocity, { time: at });
    synth.noteOff(lane.channel, note.midi, { time: off });
    lastOff = Math.max(lastOff, off);
  }
  function finishIfSilent() {
    // This timer only observes completion. All note on/off events run on the audio thread.
    if (!done || !boundaryEnded || context.currentTime < lastOff + .05 || synth.voiceCount > 0 || destroyed) return;
    const callback = done; done = undefined;
    destroy(); callback();
  }
  function playLead(index: number, at: number) {
    for (const note of hits[index].notes) play(note, at, note.duration * beat, true);
  }

  return {
    start(clock: Pick<PracticeClock, "audioTimeAt">, melody: "on-hit" | "automatic" = "on-hit") {
      if (destroyed || stopped) return;
      const at = clock.audioTimeAt(0), end = at + track.durationBeats * beat;
      // SF2 voices cannot seek into an existing sample envelope. At a local entry,
      // re-articulate held notes for their remaining duration, without adding hit targets.
      for (const note of automatic) {
        const relative = (note.beat - startBeat) * beat;
        const start = Math.max(0, relative), stop = Math.min(relative + note.duration * beat, end - at);
        play(note, at + start, stop - start, false);
      }
      backingOutput.gain.setValueAtTime(1, Math.max(at, end - .15));
      backingOutput.gain.linearRampToValueAtTime(0, end);
      boundary = context.createConstantSource(); boundary.offset.value = 0; boundary.connect(output);
      boundary.onended = () => { boundaryEnded = true; finishIfSilent(); };
      boundary.start(at); boundary.stop(end);
      if (melody === "automatic") track.targets.forEach((target, index) => playLead(index, clock.audioTimeAt(target * beat * 1000)));
      poll = setInterval(finishIfSilent, 50);
    },
    tap(index: number) { if (!stopped && !destroyed) playLead(index, context.currentTime); },
    finish(callback: () => void) { if (!stopped && !destroyed) { done = callback; finishIfSilent(); } },
    stop() {
      if (stopped || destroyed) return;
      stopped = true; done = undefined;
      clearInterval(poll);
      output.gain.cancelAndHoldAtTime(context.currentTime);
      output.gain.linearRampToValueAtTime(0, context.currentTime + .04);
      // Silence is audio scheduled; timeout only disposes the now inaudible processor.
      cleanup = setTimeout(destroy, 60);
    },
  };
}
