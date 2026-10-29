import { multipartMeasureStarts, type MusicPart } from "../../game/core/MultipartScore";
import { generalUserPresets as presets } from "./audio/generalUser";

type PatternVoice = "ep" | "bass" | "kick" | "stick" | "hat";
type PatternNote = { instrument: PatternVoice; beat: number; duration: number; midi: number; gain: number };
export type ChordArrangement = {
  chords: readonly (readonly number[])[];
  measureBeats?: readonly (2 | 3 | 4)[];
  pickupBeats?: number;
  arrangements?: readonly { measure: number; style: "spacious" | "rhythmic" }[];
  chordChanges?: readonly { measure: number; offset: number; chord: readonly number[] }[];
};

export function chordMeasureStarts(score: ChordArrangement) {
  if (score.measureBeats && score.measureBeats.length !== score.chords.length) throw Error("和声小节数不一致。");
  const starts = multipartMeasureStarts({bars:score.measureBeats ?? score.chords.map(()=>4),pickupBeats:score.pickupBeats});
  const seen = new Set<string>();
  for (const c of score.chordChanges ?? []) {
    const key = `${c.measure}:${c.offset}`;
    if (!Number.isInteger(c.measure) || c.measure < 0 || c.measure >= score.chords.length || !Number.isFinite(c.offset)
      || c.offset <= 0 || c.offset >= starts[c.measure+1]-starts[c.measure] || seen.has(key)) throw Error("换和弦需要唯一、有效的小节内拍位。");
    seen.add(key);
  }
  for (const chord of [...score.chords,...(score.chordChanges ?? []).map(c=>c.chord)])
    if (chord.some(n=>!Number.isInteger(n)||n<0||n>127)) throw Error("和弦需要有效 MIDI 音高。");
  return starts;
}
const db = (value: number) => 10 ** (value / 20);
// 试听基准固定到音源；只衰减伴奏，不按每首曲子的整体响度归一化。
const calibration = { ep: db(-5.68), bass: db(-7.48), drums: db(12.66) };
const reductions = {
  spacious: { ep: -5, bass: -3, kick: -3, stick: -6, hat: -6 },
  rhythmic: { ep: -7, bass: -4, kick: -4, stick: -7, hat: -8 },
};


/** Optional authoring pattern; produces ordinary parts before playback. N.C. stays silent. */
export function arrangeChordNotes(score: ChordArrangement): PatternNote[] {
  const starts = chordMeasureStarts(score);
  return score.chords.flatMap((chord, bar) => {
    const style = score.arrangements?.filter(section => section.measure <= bar).at(-1)?.style ?? "spacious";
    const rhythmic = style === "rhythmic", mix = reductions[style];
    const notes: PatternNote[] = [];
    const add = (instrument: PatternVoice, beat: number, duration: number, midi: number, gain: number) =>
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

export function createHarmonyParts(score: ChordArrangement): MusicPart[] {
  const notes = arrangeChordNotes(score);
  return [
    { id:"keyboard", name:"和声键盘", instrument:"ep", preset:presets.electricPiano, scale:1.8 },
    { id:"bass", name:"贝斯", instrument:"bass", preset:presets.fingerBass, scale:2.8 },
    { id:"kick", name:"底鼓", instrument:"kick", preset:presets.standardDrums, scale:.28, key:36 },
    { id:"stick", name:"边击", instrument:"stick", preset:presets.standardDrums, scale:.28, key:37 },
    { id:"hat", name:"踩镲", instrument:"hat", preset:presets.standardDrums, scale:.28, key:42 },
  ].map(({id,name,instrument,preset,scale,key})=>({id,name,preset,notes:notes.filter(n=>n.instrument===instrument).map((n,i)=>({
    id:String(i),beat:n.beat,duration:key===undefined?n.duration:.1,midi:key??n.midi,velocity:Math.min(1,n.gain*scale),
  }))})).filter(part=>part.notes.length>0);
}
