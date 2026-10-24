import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createServer } from 'vite';
const server = await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {default:GameLevelsPage} = await server.ssrLoadModule('/src/game/ui/GameLevelList.tsx');
const {default:RhythmGamePage} = await server.ssrLoadModule('/src/pages/RhythmGamePage.tsx');
const { gameLevels }=await server.ssrLoadModule('/src/game/catalog.ts');
const { createLevelTrack }=await server.ssrLoadModule('/src/game/core/GameLevel.ts');
await server.close();
function render(path) {
  return renderToString(createElement(MemoryRouter,{initialEntries:[path]},createElement(Routes,null,
    createElement(Route,{path:'/game',element:createElement(GameLevelsPage)}),
    createElement(Route,{path:'/game/:levelId',element:createElement(RhythmGamePage)}))));
}
test('游戏目录只展示已实现关卡及挑战链接，不创建游戏舞台',()=>{
  const html=render('/game');
  assert.match(html,/href="\/game\/quarter"/);
  assert.match(html,/一拍一下，稳住基本拍/);
  assert.equal((html.match(/class="orbit-level-link"/g)??[]).length,gameLevels.length);
  assert.doesNotMatch(html,/orbit-stage|正在准备|四分与八分混合/);
});
test('关卡目录先展示音乐，再按原学习顺序展示专项；每关只出现一次',()=>{
  const html=render('/game');
  const music=html.slice(html.indexOf('aria-labelledby="music-levels-heading"'),html.indexOf('aria-labelledby="rhythm-levels-heading"'));
  const rhythm=html.slice(html.indexOf('aria-labelledby="rhythm-levels-heading"'));
  assert.match(music,/<h2[^>]*>曲目<\/h2>/);
  assert.match(rhythm,/<h2[^>]*>基础节奏<\/h2>/);
  assert.deepEqual([...music.matchAll(/href="\/game\/([^"]+)"/g)].map(match=>match[1]),gameLevels.filter(level=>level.category !== "rhythm").map(level=>level.id));
  assert.deepEqual([...rhythm.matchAll(/href="\/game\/([^"]+)"/g)].map(match=>match[1]),gameLevels.filter(level=>level.category === "rhythm").map(level=>level.id));
  assert.doesNotMatch(music,/orbit-level-credit/);
  assert.equal(new Set(gameLevels.map(level=>level.id)).size,gameLevels.length);
  assert.doesNotMatch(music,/orbit-level-number/);
  assert.equal((rhythm.match(/orbit-level-number/g)??[]).length,gameLevels.filter(level=>level.category === "rhythm").length);
  assert.equal((html.match(/class="orbit-level-art"/g)??[]).length,gameLevels.filter(level=>level.category !== "rhythm").length);
});
test('音乐关显示建议 BPM 和对应的完整乐句时长，专项不冒用统一速度',()=>{
  const html=render('/game');
  for(const level of gameLevels.filter(level=>level.category !== "rhythm")) {
    const id=level.id,bpm=level.music.recommendedBpm,seconds=Math.round(createLevelTrack(level).durationBeats*60/bpm);
    const start=html.indexOf(`href="/game/${id}"`),end=html.indexOf('</a>',start),entry=html.slice(start,end);
    assert.ok(entry.includes(`${bpm} BPM`));
    assert.ok(entry.includes(`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`));
  }
  const rhythm=html.slice(html.indexOf('aria-labelledby="rhythm-levels-heading"'));
  assert.doesNotMatch(rhythm,/BPM|orbit-level-meta/);
});
test('挑战页显示关卡名称和返回入口，未知关卡不挂载挑战',()=>{
  const html=render('/game/quarter');
  assert.match(html,/href="\/game"/);
  assert.match(html,/关卡列表/);
  assert.match(html,/<h1[^>]*>均匀四分<\/h1>/);
  assert.match(html,/orbit-stage/);
  for(const level of gameLevels) {
    assert.ok(render('/game').includes(`href="/game/${level.id}"`));
    const html=render(`/game/${level.id}`);
    const heading = renderToString(createElement('h1', null, level.title));
    assert.ok(html.includes(heading.slice(3)), 'heading preserves the escaped level title');
    assert.ok(html.includes(`完成 0 / ${createLevelTrack(level).targets.length}`));
    assert.doesNotMatch(html,/玩法说明|画面主题/);
    assert.match(html,/练习设置/);
  }
  const unknown=render('/game/unknown');
  assert.match(unknown,/未找到该关卡/);
  assert.match(unknown,/href="\/game"/);
  assert.doesNotMatch(unknown,/orbit-stage/);
});
