import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const { ballTemplate } = await server.ssrLoadModule('/src/game-content/shared/ballTemplate.ts');
const { paintPixelBall, createPixelBallTextures } = await server.ssrLoadModule('/src/game/rendering/OrbitBalls.ts');
await server.close();
function surface() {
  return { pixels: new Map(), clearRect() { this.pixels.clear(); }, fillRect(x,y,w,h) { assert.equal(w,1); assert.equal(h,1); this.pixels.set(`${x},${y}`,this.fillStyle); } };
}
test('统一模板保留14格造型、透明留白及双球身份；轮廓覆盖不改变内部切面', () => {
  assert.equal(ballTemplate.rows.length,14);
  for (const row of ballTemplate.rows) assert.match(row,/^[.OSBLHC]{14}$/);
  const jade=surface(), amber=surface(), outlined=surface();
  paintPixelBall(jade,ballTemplate,false); paintPixelBall(amber,ballTemplate,true); paintPixelBall(outlined,ballTemplate,false,0x111d2a);
  assert.deepEqual([...jade.pixels.keys()],[...amber.pixels.keys()]);
  assert.deepEqual([...jade.pixels.keys()],[...outlined.pixels.keys()]);
  for (const [point,color] of jade.pixels) {
    const [x,y]=point.split(',').map(Number); assert.ok(x>=14&&x<28&&y>=14&&y<28);
    const role=ballTemplate.rows[y-14][x-14];
    assert.equal(outlined.pixels.get(point),role==='O'?'#111d2a':color);
    if (!['O','C'].includes(role)) assert.notEqual(amber.pixels.get(point),color);
  }
  assert.ok([...jade.pixels.values()].includes('#dcebc8'));
  assert.ok([...amber.pixels.values()].includes('#f1dfae'));
});
test('主题往返复用纹理，双球身份和轮廓分离，缓存不跨场景', () => {
  let created=0;
  const scene={textures:{createCanvas(key,width,height){created++;return {key,width,height,context:surface(),setSmoothPixelArt(){},refresh(){}};}}};
  const get=createPixelBallTextures(scene,ballTemplate);
  const first=get(false); assert.equal(first.width,42);assert.equal(first.height,42);
  assert.equal(get(false,{}),first);assert.equal(get(false,{outline:ballTemplate.outline}),first);
  assert.notEqual(get(true),first);const rain=get(false,{outline:0x111d2a});assert.notEqual(rain,first);
  assert.equal(get(false),first);assert.equal(get(false,{outline:0x111d2a}),rain);assert.equal(created,3);
  const otherScene={textures:{createCanvas:scene.textures.createCanvas}};
  assert.notEqual(createPixelBallTextures(otherScene,ballTemplate)(false),first);
});

// Fixed hashes of decoded, accepted PNG pixels; independent of the editable template.
test('生成像素与已验收宝石逐像素一致', () => {
  const cases = [[false, 1121578, "280225487a744713468c598f879b9f96c09543ad8d94bd4ecd03a5734ef6d8c1"], [true, 1121578, "7a26e0d7e140f432b12e33ff0997d8e392575d553b505c4dbb1c8f8bf62bccf4"], [false, 1319722, "82ad1f12cf69796772c9fc1b1976e51abc118ce2aea4e9c4f6bc696a4d74ed55"], [true, 1319722, "d65318733e27d20a3cbd68bbb74823bf366f2aaea46054aeaa22888df31b68e4"]];
  for (const [warm,outline,hash] of cases) {
    const ctx=surface(), rgba=Buffer.alloc(14*14*4);
    paintPixelBall(ctx,ballTemplate,warm,outline);
    for (let y=0;y<14;y++) for (let x=0;x<14;x++) {
      const color=ctx.pixels.get(`${x+14},${y+14}`); if (!color) continue;
      const rgb=parseInt(color.slice(1),16), offset=(y*14+x)*4;
      rgba.set([rgb>>16&255,rgb>>8&255,rgb&255,255],offset);
    }
    assert.equal(createHash('sha256').update(rgba).digest('hex'),hash);
  }
});
