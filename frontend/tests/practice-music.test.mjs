import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const { gameLevels } = await server.ssrLoadModule('/src/game/catalog.ts');
const { createLevelTrack } = await server.ssrLoadModule('/src/game/core/GameLevel.ts');
const { arrangeMusic } = await server.ssrLoadModule('/src/game/audio/MusicArrangement.ts');
await server.close();

test('all thirteen rhythm studies retain target timing while adding pitched phrases and a tonic ending', () => {
  const basics = gameLevels.filter(level => level.category === 'rhythm');
  assert.equal(basics.length, 13);
  for (const level of basics) {
    const track = createLevelTrack(level), score = level.music;
    assert.deepEqual(score.melody.map(note => note.beat), track.targets, level.id);
    assert.equal(score.melody.at(-1).midi, 60, level.id);
    assert.equal(score.recommendedBpm, 60);
    assert.equal(score.chords.length, level.exercise.measures.length);
    for (let bar = 0; bar < score.chords.length; bar++) {
      const notes = score.melody.filter(note => note.beat >= bar * 4 && note.beat < (bar + 1) * 4);
      assert.ok(new Set(notes.map(note => note.midi)).size >= 2, level.id + ' bar ' + bar);
      for (const note of notes) assert.ok(note.beat + note.duration <= (bar + 1) * 4 + 1e-8);
    }
    const backing = arrangeMusic(score);
    assert.ok(backing.length > 0);
    for (const note of backing) {
      assert.ok(['ep','bass'].includes(note.instrument));
      assert.equal(note.beat % 2, 0);
      assert.ok(note.gain < .2);
      assert.ok(note.beat + note.duration <= track.durationBeats);
    }
  }
});

test('classic theme identity and attribution survive the rhythm adaptation', () => {
  const quarter = gameLevels.find(level => level.id === 'quarter').music;
  assert.deepEqual(quarter.melody.map(n => n.midi), [60,60,67,67,69,69,67,67,65,65,64,64,62,62,60,60]);
  assert.match(quarter.credit, /传统旋律/);
  const joy = gameLevels.find(level => level.id === 'dotted-eighth').music;
  assert.deepEqual(joy.melody.map(n => n.midi), [64,64,65,67,67,65,64,62,60,60,62,64,62,60,60,60]);
  assert.match(joy.credit, /贝多芬/);
  for (const level of gameLevels.filter(l => l.category === 'rhythm')) {
    assert.equal(level.music.chordChanges.length, level.exercise.measures.length);
    assert.ok(!level.music.credit.includes('原创'));
  }
});
