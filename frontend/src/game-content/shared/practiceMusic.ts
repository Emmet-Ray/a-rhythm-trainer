import { partNotes } from "../../game/audio/KeyboardScore";
import { hitsFromParts, type MusicPart, type MultipartScore } from "../../game/core/MultipartScore";
import { generalUserFile, generalUserPresets as presets } from "./audio/generalUser";
import type { RhythmExercise } from "../../rhythm/RhythmModel";
import { createMusicMelody } from "../../game/core/MusicScore";

// Familiar themes rephrased to the exact exercise rhythm. Each level owns its pitches;
// repeated notes divide sustained tones instead of filling space with unrelated runs.
const C = [36, 48, 55], F = [41, 48, 53], G = [43, 50, 55];
const themes = {
  twinkle: { title: "小星星 · 节奏变奏", credit: "法国传统旋律《Ah ! vous dirai-je, maman》· 节奏改编" },
  joy: { title: "欢乐颂 · 节奏变奏", credit: "贝多芬《欢乐颂》主题 · 节奏与收束改编" },
};

export function createPracticeMusic(exercise: RhythmExercise, phrases: readonly (readonly number[])[], theme: keyof typeof themes): MultipartScore {
  const bars = exercise.measures.length;
  if (![2, 4, 8].includes(bars) || exercise.timeSignature.beats !== 4 || exercise.timeSignature.beatType !== 4)
    throw new Error("排练室编配需要 2、4 或 8 个完整 4/4 小节。");
  // Open fifths leave space for the theme; the final two beats settle on the tonic.
  const harmony = theme === "joy"
    ? Array.from({ length: bars / 2 }, () => [C, G, C, C]).flat()
    : bars === 8 ? [C,C,F,C,F,C,G,C,C,F,C,G,F,C,G,C] : [C,C,F,C,F,C,G,C];
  const lead: MusicPart = {id:"melody",name:"练习旋律",preset:presets.piano,velocityScale:1.6,
    notes:partNotes(createMusicMelody(exercise,phrases,beat=>Number.isInteger(beat)?.42:.38))};
  const bass: MusicPart = {id:"bass",name:"低音",preset:presets.fingerBass,velocityScale:2.8,
    notes:harmony.map((chord,i)=>({id:String(i),beat:i*2,duration:1.85,midi:chord[0],velocity:.09}))};
  const keyboard: MusicPart = {id:"keyboard",name:"开放五度",preset:presets.electricPiano,velocityScale:1.8,
    notes:partNotes(harmony.map((chord,i)=>({beat:i*2,duration:1.85,midi:chord[1],additionalMidis:chord.slice(2),gain:.12})))};
  return {...themes[theme],recommendedBpm:60,soundFont:{file:generalUserFile,gain:1.2},
    bars:Array.from({length:bars},()=>4),sections:[],parts:[lead,bass,keyboard],hits:hitsFromParts([lead])};
}
