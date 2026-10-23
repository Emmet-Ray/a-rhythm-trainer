import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, cp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, build } from 'vite';
import { frontendRoot, localGameContentAliases, localGameContentEnabled } from '../scripts/lib/local-game-content.mjs';

test('local content is enabled by default, explicitly disabled for public builds, and rejects typos', () => {
  assert.equal(localGameContentEnabled(), true);
  assert.equal(localGameContentEnabled('0'), false);
  assert.equal(localGameContentEnabled('1'), true);
  assert.throws(() => localGameContentEnabled('true'), /must be 0.*or 1/);
});

test('optional levels and images load only in local mode; clean installs need no content package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'rhythm-content-'));
  const localDirectory = path.join(root, 'local-content/levels/local-fixture');
  const load = async (enabled) => {
    const server = await createServer({ root, configFile: false, logLevel: 'silent',
      resolve: { alias: localGameContentAliases(enabled, root) },
      server: { middlewareMode: true, watch: null, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] } });
    try { return await server.ssrLoadModule('/src/game/catalog.ts'); }
    finally { await server.close(); }
  };
  try {
    await cp(path.join(frontendRoot, 'src'), path.join(root, 'src'), { recursive: true });
    await symlink(path.join(frontendRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    assert.equal((await load(true)).gameLevels.length, 14);
    await mkdir(localDirectory, { recursive: true });
    await cp(path.join(frontendRoot, 'public/assets/game/shared/practice-room.png'), path.join(localDirectory, 'local-picture.png'));
    const fixture = `import { quarter } from '../../../src/game-content/levels/quarter/index';
      import picture from './local-picture.png?url';
      export default { ...quarter, id: 'local-fixture', title: 'LOCAL_CONTENT_SENTINEL',
        images: [{url: picture}], visualTheme: undefined };`;
    await writeFile(path.join(localDirectory, 'index.ts'), fixture);
    assert.equal((await load(false)).gameLevels.length, 14);
    const complete = await load(true);
    assert.equal(complete.gameLevels.length, 15);
    assert.ok(complete.gameImages.some(image => image.url.includes('local-picture.png')));
    for (const enabled of [false, true]) {
      const result = await build({ root, configFile: false, logLevel: 'silent', publicDir: false,
        resolve: { alias: localGameContentAliases(enabled, root) },
        build: { write: false, minify: false, assetsInlineLimit: 0,
          rollupOptions: { input: path.join(root, 'src/game/catalog.ts'), preserveEntrySignatures: 'strict' } } });
      const output = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
      const code = output.filter(file => file.type === 'chunk').map(file => file.code).join('\n');
      assert.equal(code.includes('LOCAL_CONTENT_SENTINEL'), enabled);
      assert.equal(output.some(file => file.type === 'asset' && file.fileName.includes('local-picture')), enabled);
    }
    await writeFile(path.join(localDirectory, 'index.ts'), fixture.replace("id: 'local-fixture'", "id: 'wrong-id'"));
    await assert.rejects(load(true), /id matches its directory/);
    // The same ID as a built-in must never silently replace the built-in level.
    await rm(path.join(root, 'local-content'), { recursive: true });
    const duplicate = path.join(root, 'local-content/levels/quarter');
    await mkdir(duplicate, { recursive: true });
    await writeFile(path.join(duplicate, 'index.ts'), "export { quarter as default } from '../../../src/game-content/levels/quarter/index';");
    await assert.rejects(load(true), /Duplicate game level ID: quarter/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
