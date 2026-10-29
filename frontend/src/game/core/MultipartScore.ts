/** Performed music uses quarter-note beats. Parts are independent of game targets. */
export type PartNote = { id: string; beat: number; duration: number; midi: number; velocity: number };
export type PartPreset = { kind: "melodic" | "drums"; program: number; bank?: number };
export type MusicPart = {
  id: string; name: string; preset: PartPreset;
  gain?: number; velocityScale?: number;
  notes: readonly PartNote[];
};
export type NoteReference = { partId: string; noteId: string };
export type MultipartScore = {
  title: string; recommendedBpm: number; credit?: string;
  soundFont: { file: string; gain: number };
  bars: readonly (2 | 3 | 4)[];
  pickupBeats?: number;
  parts: readonly MusicPart[];
  /** Each group is one hit; its beat is derived from the referenced notes. */
  hits: readonly (readonly NoteReference[])[];
  sections: readonly { measure: number; title: string }[];
};
export type PerformanceNote = PartNote & { part: MusicPart; hit: number | null };
export type MusicPerformance = {
  soundFont: MultipartScore["soundFont"];
  parts: readonly MusicPart[];
  notes: readonly PerformanceNote[];
  hits: readonly { beat: number; notes: readonly PerformanceNote[] }[];
  measureStarts: number[];
};
const validId = (id: string) => typeof id === "string" && id.trim().length > 0;
const integer = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;

export function multipartMeasureStarts(score: Pick<MultipartScore, "bars" | "pickupBeats">) {
  if (!score.bars.length || score.bars.some(n => ![2, 3, 4].includes(n))) throw Error("音乐需要有效的 2、3 或 4 拍小节。");
  if (score.pickupBeats !== undefined && (!Number.isFinite(score.pickupBeats) || score.pickupBeats <= 0 || score.pickupBeats >= score.bars[0]))
    throw Error("弱起时长必须大于零且短于首小节。");
  const starts = [0];
  score.bars.forEach((n, i) => starts.push(starts.at(-1)! + (i === 0 ? score.pickupBeats ?? n : n)));
  return starts;
}

/** Compile once at the boundary; never infer hit ownership from part names or indexes. */
export function compileMultipartScore(score: MultipartScore): MusicPerformance {
  const fail = (message: string): never => { throw Error(`${score.title}: ${message}`); };
  const measureStarts = multipartMeasureStarts(score), end = measureStarts.at(-1)!;
  if (!Number.isFinite(score.recommendedBpm) || score.recommendedBpm <= 0) fail("BPM 无效。");
  if (!score.soundFont.file || !Number.isFinite(score.soundFont.gain) || score.soundFont.gain < 0) fail("音色库或总增益无效。");
  if (!score.parts.length) fail("至少需要一个声部。");
  const lookup = new Map<string, Map<string, PerformanceNote>>(), notes: PerformanceNote[] = [];
  for (const part of score.parts) {
    if (!validId(part.id) || lookup.has(part.id)) fail(`声部 ID 无效或重复：${part.id}`);
    if (!["melodic", "drums"].includes(part.preset.kind) || !integer(part.preset.program, 127) || !integer(part.preset.bank ?? 0, 127)) fail(`声部 ${part.id} 音色无效。`);
    if (!Number.isFinite(part.gain ?? 1) || (part.gain ?? 1) < 0 || !Number.isFinite(part.velocityScale ?? 1) || (part.velocityScale ?? 1) <= 0) fail(`声部 ${part.id} 音量或力度无效。`);
    const entries = new Map<string, PerformanceNote>(); lookup.set(part.id, entries);
    for (const note of part.notes) {
      if (!validId(note.id) || entries.has(note.id)) fail(`声部 ${part.id} 音符 ID 无效或重复：${note.id}`);
      if (!Number.isFinite(note.beat) || note.beat < 0 || !Number.isFinite(note.duration) || note.duration <= 0 || note.beat + note.duration > end + 1e-8
        || !integer(note.midi, 127) || !Number.isFinite(note.velocity) || note.velocity <= 0 || note.velocity > 1) fail(`声部 ${part.id} 音符 ${note.id} 的拍位、时值、音高或力度无效。`);
      const event: PerformanceNote = { ...note, part, hit: null };
      entries.set(note.id, event); notes.push(event);
    }
  }
  const hits = score.hits.map((refs, index) => {
    if (!refs.length) fail(`击拍 ${index + 1} 没有音符。`);
    const events = refs.map(ref => {
      const event = lookup.get(ref.partId)?.get(ref.noteId);
      if (!event) return fail(`击拍 ${index + 1} 引用了不存在的 ${ref.partId}/${ref.noteId}。`);
      if (event.hit !== null) fail(`音符 ${ref.partId}/${ref.noteId} 重复归属击拍。`);
      event.hit = index; return event;
    });
    const beat = events[0].beat;
    if (events.some(n => Math.abs(n.beat - beat) > 1e-8)) fail(`击拍 ${index + 1} 的音符不在同一拍位。`);
    return { beat, notes: events };
  });
  if (!hits.length || hits.some((h, i) => i > 0 && h.beat <= hits[i - 1].beat + 1e-8)) fail("关卡击拍必须非空并按不同拍位递增。");
  if (score.sections.some((s, i) => !integer(s.measure, score.bars.length - 1) || (i > 0 && s.measure <= score.sections[i - 1].measure))) fail("段落必须按有效小节递增。");
  return { soundFont: score.soundFont, parts: score.parts, notes: notes.sort((a, b) => a.beat - b.beat), hits, measureStarts };
}

/** Authoring convenience: select whole parts, grouping simultaneous attacks across parts. */
export function hitsFromParts(parts: readonly MusicPart[]): NoteReference[][] {
  const events = parts.flatMap(part => part.notes.map(note => ({ beat: note.beat, ref: { partId: part.id, noteId: note.id } }))).sort((a, b) => a.beat - b.beat);
  const groups: { beat: number; refs: NoteReference[] }[] = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (last && Math.abs(last.beat - event.beat) < 1e-8) last.refs.push(event.ref);
    else groups.push({ beat: event.beat, refs: [event.ref] });
  }
  return groups.map(g => g.refs);
}
