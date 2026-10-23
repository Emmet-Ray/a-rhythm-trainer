import type { PracticeClock } from "../../rhythm/RhythmAudio";
import { loadGameSamples, playMusicVoice, type SampleBank, type GameSamples } from "./GameInstruments";
import { arrangeMusic, melodyGain } from "./MusicArrangement";
import { musicMeasureStarts, type MusicScore } from "../core/MusicScore";
import type { OrbitTrack } from "../core/OrbitTrack";

/** 每局独立的音乐播放与旋律，共用游戏音频时钟。
 * 伴奏从原曲的小节偏移进入；挑战命中时弹奏旋律，试听则提前排程本段全部旋律。
 * 停止/失败淡出全部声音（含尚未起音的旋律），
 * 完成等待伴奏和全部旋律声部自然结束；回调结束前仍持有播放所有权。
 */
export async function prepareGameMusic(context: AudioContext, score: MusicScore, track: OrbitTrack, bpm: number, bank: SampleBank) {
  let samples: GameSamples;
  try { samples = await loadGameSamples(context, bank); }
  catch { throw new Error("音乐加载失败，请重试。"); }
  let master: GainNode | null = null, backingGain: GainNode | null = null;
  let boundary: ConstantSourceNode | null = null;
  let ended = false, stopped = false, onFinished: (() => void) | null = null;
  const backing = new Set<AudioBufferSourceNode>();
  const leads = new Set<AudioBufferSourceNode>();
  const beat = 60 / bpm;
  function finishIfSilent() {
    if (!ended || leads.size > 0 || (!onFinished && !stopped)) return;
    master?.disconnect();
    const done = onFinished; onFinished = null; done?.();
  }
  function playNote(index: number, at: number) {
    if (!master || stopped) return;
    const note = score.melody[track.anchorOffset + index];
    for (const midi of [note.midi, ...(note.additionalMidis ?? [])]) {
      const source = playMusicVoice(context, master, samples, "piano", at,
        note.duration * beat, midi, note.gain * melodyGain / Math.sqrt(1 + (note.additionalMidis?.length ?? 0)));
      if (!source) continue;
      leads.add(source);
      source.addEventListener("ended", () => { leads.delete(source); finishIfSilent(); });
    }
  }
  return {
    start(clock: Pick<PracticeClock, "audioTimeAt">, melody: "on-hit" | "automatic" = "on-hit") {
      master = context.createGain(); master.gain.value = .75; master.connect(context.destination);
      backingGain = context.createGain(); backingGain.connect(master);
      const tail = track.range.endMeasure === score.chords.length ? .35 : 0;
      const at = clock.audioTimeAt(0), end = at + track.durationBeats * beat + tail;
      const startBeat = musicMeasureStarts(score)[track.range.startMeasure];
      // 原生音频排程不等待整曲渲染，也不依赖动画帧或 JS 定时器。
      // 局部起点保留前一音尚未结束的尾音，但不在预备拍中播放它。
      for (const note of arrangeMusic(score)) {
        const relative = (note.beat - startBeat) * beat;
        if (relative >= track.durationBeats * beat) continue;
        const source = playMusicVoice(context, backingGain, samples, note.instrument,
          at + Math.max(0, relative), note.duration * beat, note.midi, note.gain, Math.max(0, -relative));
        if (!source) continue;
        backing.add(source);
        source.stop(end);
        source.addEventListener("ended", () => { backing.delete(source); });
      }
      // A tied melody already sounding at the selected bar is carried automatically, not re-hit.
      const carried = score.melody.find(note => note.beat < startBeat - 1e-8 && note.beat + note.duration > startBeat + 1e-8);
      if (carried) for (const midi of [carried.midi, ...(carried.additionalMidis ?? [])]) {
        const source = playMusicVoice(context, backingGain, samples, "piano", at,
          carried.duration * beat, midi, carried.gain * melodyGain / Math.sqrt(1 + (carried.additionalMidis?.length ?? 0)),
          (startBeat - carried.beat) * beat);
        if (source) { backing.add(source); source.stop(end); source.addEventListener("ended", () => backing.delete(source)); }
      }
      // 范围边界只收伴奏；偏晚敲出的末音保留自己的包络。
      backingGain.gain.setValueAtTime(1, end - .15); backingGain.gain.linearRampToValueAtTime(0, end);
      // 静音边界由音频线程触发，纯休止/N.C. 段也能正确完成。
      boundary = context.createConstantSource(); boundary.offset.value = 0; boundary.connect(backingGain);
      boundary.onended = () => {
        ended = true; boundary?.disconnect(); backingGain?.disconnect(); finishIfSilent();
      };
      boundary.start(at); boundary.stop(end);
      if (melody === "automatic") track.targets.forEach((target, index) => playNote(index, clock.audioTimeAt(target * beat * 1000)));
    },
    tap(index: number) { playNote(index, context.currentTime); },
    finish(done: () => void) { if (!stopped) { onFinished = done; finishIfSilent(); } },
    stop() {
      if (stopped) return;
      stopped = true; onFinished = null;
      const end = context.currentTime + .04;
      master?.gain.cancelAndHoldAtTime(context.currentTime); master?.gain.linearRampToValueAtTime(0, end);
      for (const source of leads) source.stop(end);
      for (const source of backing) source.stop(end);
      if (!ended) boundary?.stop(end);
      finishIfSilent();
    },
  };
}
export type GameMusic = Awaited<ReturnType<typeof prepareGameMusic>>;
