import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateGameAssets } from '../scripts/lib/game-assets.mjs';

test('资源清单双向验证归属、尺寸、源文件与采样完整性', async () => {
  const repository = await mkdtemp(path.join(tmpdir(), 'game-assets-'));
  try {
    const dir = path.join(repository, 'frontend/public/assets/game');
    await mkdir(dir, { recursive: true });
    const png = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.writeUInt32BE(22, 16); png.writeUInt32BE(22, 20);
    await writeFile(path.join(dir, 'ball.png'), png);
    await writeFile(path.join(repository, 'art.px.js'), 'export default {};');
    const bytes = Buffer.from('sample'); await writeFile(path.join(dir, 'piano.flac'), bytes);
    const image = { url: '/assets/game/ball.png', width: 22, height: 22, source: 'art.px.js', output: 'sprites/ball.png', scale: 1 };
    const sample = { file: '/assets/game/piano.flac', instrument: 'piano', midi: 60, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), source: 'fixture' };
    const validate = (images = [image], samples = [sample]) => validateGameAssets({ repository, images, samples });
    assert.deepEqual(await validate(), []);
    assert.match((await validate([])).join('\n'), /no declaration/);
    assert.match((await validate([image, image])).join('\n'), /Duplicate image owner/);
    assert.match((await validate([{ ...image, width: 10 }])).join('\n'), /dimensions/);
    assert.match((await validate([{ ...image, source: 'missing.js' }])).join('\n'), /missing.js/);
    assert.match((await validate([image], [sample, sample])).join('\n'), /Duplicate sample pitch/);
    await writeFile(path.join(dir, 'piano.flac'), 'changed');
    assert.match((await validate()).join('\n'), /checksum/);
    await rm(path.join(dir, 'ball.png'));
    assert.match((await validate()).join('\n'), /ball.png/);
  } finally { await rm(repository, { recursive: true, force: true }); }
});
