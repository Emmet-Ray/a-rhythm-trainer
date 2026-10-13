/** 音色目录集中维护素材身份；播放包络由 RhythmAudio 决定。 */
export const practiceSounds = [
  { id: "piano", label: "钢琴", file: "piano-c4.flac" },
  { id: "guitar", label: "吉他", file: "guitar-c4.flac" },
] as const;
export const metronomeSounds = [
  { id: "mechanical", label: "机械声", file: "metronome.mp3" },
  { id: "cowbell", label: "牛铃", file: "cowbell.flac" },
  { id: "claves", label: "响棒", file: "claves.flac" },
  { id: "hihat", label: "闭镲", file: "hihat.flac" },
  { id: "bell", label: "铃音", file: "bell.flac" },
  { id: "electronic", label: "电子短音", file: "electronic.flac" },
] as const;
export type PracticeSound = typeof practiceSounds[number]["id"];
export type MetronomeSound = typeof metronomeSounds[number]["id"];
