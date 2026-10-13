import { practiceSounds, metronomeSounds, type PracticeSound, type MetronomeSound } from "../rhythm/SoundSamples";

const STORAGE_KEY = "rhythm-trainer.sounds";
export const DEFAULT_SOUNDS = { practice: "piano", metronome: "mechanical" } as const;
type Sounds = { practice: PracticeSound; metronome: MetronomeSound };
type Preference = Sounds & { storageAvailable: boolean };
let current: Preference = { ...DEFAULT_SOUNDS, storageAvailable: true };

function normalize(value: Partial<Sounds> | null): Sounds {
  return {
    practice: practiceSounds.find(s => s.id === value?.practice)?.id ?? DEFAULT_SOUNDS.practice,
    metronome: metronomeSounds.find(s => s.id === value?.metronome)?.id ?? DEFAULT_SOUNDS.metronome,
  };
}
export function initializeSoundPreferences(): Preference {
  try {
    current = { ...normalize(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? "null")), storageAvailable: true };
  } catch {
    current = { ...DEFAULT_SOUNDS, storageAvailable: false };
  }
  return current;
}
/** 每次开始读取快照；运行中的声音不追随偏好变化。 */
export function getSoundPreferences(): Preference { return current; }
export function selectSounds(sounds: Sounds): Preference {
  const next = normalize(sounds);
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    current = { ...next, storageAvailable: true };
  } catch {
    current = { ...next, storageAvailable: false };
  }
  return current;
}
