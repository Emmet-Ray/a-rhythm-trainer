import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function filesIn(directory, extension) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(filename, extension));
    else if (entry.name.endsWith(extension)) files.push(filename);
  }
  return files;
}

/** Check both directions: every declaration ships, and every shipped image/sample has an owner.
 * Source metadata is validated without regenerating approved art or loading audio in a browser. */
export async function validateGameAssets({ repository, images, samples, local = false }) {
  const errors = [], publicRoot = path.join(repository, 'frontend/public');
  const declared = new Set(), identities = new Set();
  for (const image of images) {
    if (declared.has(image.url)) errors.push(`Duplicate image owner: ${image.url}`);
    declared.add(image.url);
    try {
      const bytes = await readFile(local && image.url.startsWith('/local-content/')
        ? path.join(repository, 'frontend', image.url) : path.join(publicRoot, image.url));
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        || bytes.readUInt32BE(16) !== image.width || bytes.readUInt32BE(20) !== image.height)
        errors.push(`Image dimensions/signature do not match: ${image.url}`);
      if (!(await stat(path.join(repository, image.source))).isFile()) errors.push(`Missing art source: ${image.source}`);
      if (!image.output.endsWith('.png') || !Number.isInteger(image.scale) || image.scale < 1)
        errors.push(`Invalid art export recipe: ${image.url}`);
    } catch (error) { errors.push(`${image.url}: ${error.message}`); }
  }
  for (const sample of samples) {
    if (declared.has(sample.file)) errors.push(`Duplicate sample file: ${sample.file}`);
    declared.add(sample.file);
    const identity = `${sample.instrument}:${sample.midi}`;
    if (identities.has(identity)) errors.push(`Duplicate sample pitch: ${identity}`);
    identities.add(identity);
    if (!['piano', 'ep', 'bass', 'kick', 'stick', 'hat'].includes(sample.instrument)
      || !Number.isInteger(sample.midi) || sample.midi < 0 || sample.midi > 127)
      errors.push(`Invalid instrument/pitch: ${sample.file}`);
    try {
      const bytes = await readFile(path.join(publicRoot, sample.file));
      if (bytes.length !== sample.bytes || createHash('sha256').update(bytes).digest('hex') !== sample.sha256)
        errors.push(`Sample checksum/size changed: ${sample.file}`);
      if (!sample.source?.trim()) errors.push(`Missing sample provenance: ${sample.file}`);
    } catch (error) { errors.push(`${sample.file}: ${error.message}`); }
  }
  const gameRoot = path.join(publicRoot, 'assets/game');
  for (const filename of [...await filesIn(gameRoot, '.png'), ...await filesIn(gameRoot, '.flac')]) {
    const url = '/' + path.relative(publicRoot, filename).split(path.sep).join('/');
    if (!declared.has(url)) errors.push(`Published asset has no declaration: ${url}`);
  }
  return errors;
}
