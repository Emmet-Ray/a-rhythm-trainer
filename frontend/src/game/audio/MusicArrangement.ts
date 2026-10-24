import { musicMeasureStarts, type MusicScore } from "../core/MusicScore";
import type { MusicInstrument } from "./GameInstruments";

export type BackingNote = { instrument: MusicInstrument; beat: number; duration: number; midi: number; gain: number };
const db = (value: number) => 10 ** (value / 20);
// 试听基准固定到音源；只衰减伴奏，不按每首曲子的整体响度归一化。
export const melodyGain = db(.58) * (75 / 127) / .4;
const calibration = { ep: db(-5.68), bass: db(-7.48), drums: db(12.66) };
const reductions = {
  spacious: { ep: -5, bass: -3, kick: -3, stick: -6, hat: -6 },
  rhythmic: { ep: -7, bass: -4, kick: -4, stick: -7, hat: -8 },
};

/** 音乐关伴奏：优先使用显式声部，否则按和声与段落风格编配，N.C. 保持静默。
 * 和弦首音为低音音级（归入 A1—Ab2），其余为和声；所有事件保留全曲拍位供范围播放使用。
 */
export function arrangeMusic(score: MusicScore): BackingNote[] {
  const starts = musicMeasureStarts(score);
  if (score.backing) return score.backing.flatMap(note => {
    const pitches = [note.midi, ...(note.additionalMidis ?? [])];
    if (!Number.isFinite(note.beat) || note.beat < 0 || !Number.isFinite(note.duration) || note.duration <= 0
      || note.beat + note.duration > starts.at(-1)! + 1e-8 || !Number.isFinite(note.gain) || note.gain <= 0 || note.gain > 1
      || pitches.some(midi => !Number.isInteger(midi) || midi < 0 || midi > 127))
      throw new Error("伴奏需要有效的音高、力度及曲内拍位和时长。");
    return pitches.map(midi => ({ instrument: note.instrument, beat: note.beat, duration: note.duration,
      midi, gain: note.gain / Math.sqrt(pitches.length) }));
  });
  return score.chords.flatMap((chord, bar) => {
    const style = score.arrangements?.filter(section => section.measure <= bar).at(-1)?.style ?? "spacious";
    const rhythmic = style === "rhythmic", mix = reductions[style];
    const notes: BackingNote[] = [];
    const add = (instrument: MusicInstrument, beat: number, duration: number, midi: number, gain: number) =>
      notes.push({ instrument, beat: starts[bar] + beat, duration, midi, gain });
    const harmony = rhythmic ? [[0,.55],[1.5,.4],[2.5,.4],[3.5,.35]] : [[0,3.2]];
    const bass = rhythmic ? [[0,.55],[1.5,.35],[2,.55],[3.5,.35]] : [[0,3.2]];
    const length = starts[bar + 1] - starts[bar];
    const segments = [{ offset: 0, chord }, ...(score.chordChanges ?? []).filter(change => change.measure === bar)]
      .sort((a, b) => a.offset - b.offset);
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i], end = segments[i + 1]?.offset ?? length;
      if (!segment.chord.length) continue;
      // 保留小节律动；新和弦在实际换和弦拍位补起音，旧和声不能延续越界。
      const pattern = (events: number[][]) => {
        const inside = events.filter(([beat]) => beat >= segment.offset && beat < end);
        if (!inside.some(([beat]) => beat === segment.offset)) inside.unshift([segment.offset, rhythmic ? .4 : 3.2]);
        return inside.map(([beat, duration]) => [beat, Math.min(duration, end - beat)]);
      };
      for (const [beat, duration] of pattern(harmony)) for (const midi of segment.chord.slice(1))
        add("ep", beat, duration, midi, calibration.ep * db(mix.ep));
      const bassMidi = 33 + ((segment.chord[0] - 33) % 12 + 12) % 12;
      for (const [beat, duration] of pattern(bass))
        add("bass", beat, duration, bassMidi, 85 / 127 * calibration.bass * db(mix.bass));
      for (const beat of rhythmic ? [0,1.5,2] : [0]) if (beat >= segment.offset && beat < end)
        add("kick", beat, 0, 60, .85 * calibration.drums * db(mix.kick));
      for (const beat of rhythmic ? [1,3] : [2]) if (beat >= segment.offset && beat < end)
        add("stick", beat, 0, 60, .65 * calibration.drums * db(mix.stick));
      for (const beat of rhythmic ? [0,.5,1,1.5,2,2.5,3,3.5] : [0,2]) if (beat >= segment.offset && beat < end)
        add("hat", beat, 0, 60, .25 * calibration.drums * db(mix.hat));
    }
    return notes;
  });
}
