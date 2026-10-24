import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const { orbitMapStyle, orbitThemeStyle }=await server.ssrLoadModule('/src/game/rendering/OrbitTheme.ts');
const { orbitThemes }=await server.ssrLoadModule('/src/game/catalog.ts');
await server.close();
test('地图明暗派生不修改主题、双球或界面颜色，普通主题保留原样',()=>{
 const before=structuredClone(orbitThemes);
 for(const theme of orbitThemes){
  const ui=orbitThemeStyle(theme),style=orbitMapStyle(theme);
  assert.equal(ui['--ds-primary'], '#'+style.colors.primary.toString(16).padStart(6,'0'));
  assert.equal(ui['--orbit-accent'], '#'+style.colors.warm.toString(16).padStart(6,'0'));
  if(theme.material==='matte')assert.deepEqual(style,{colors:theme.colors,backdropAlpha:0,guideAlpha:.55});
  assert.deepEqual(orbitThemeStyle(theme),ui);
 }
 assert.deepEqual(orbitThemes,before);
});
test('背景压暗可按主题独立配置，不改变道路、符号及圆周规则',()=>{
 for(const theme of orbitThemes.filter(t=>t.material==='pixel')){
  assert.ok(theme.pixelEnvironment.dimOpacity>=0&&theme.pixelEnvironment.dimOpacity<=1);
  const original=orbitMapStyle(theme);
  for(const dimOpacity of [0,.1,.3]){
   const changed=orbitMapStyle({...theme,pixelEnvironment:{...theme.pixelEnvironment,dimOpacity}});
   assert.equal(changed.backdropAlpha,dimOpacity);
   assert.deepEqual(changed.colors,original.colors);
   assert.equal(changed.guideAlpha,original.guideAlpha);
  }
 }
});
test('像素道路色阶具有稳定明暗与符号对比，双球及反馈语义独立',()=>{
 const before=structuredClone(orbitThemes);
 const luminance=color=>{
  const c=[16,8,0].map(s=>((color>>s)&255)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
 };
 for(const theme of orbitThemes){
  const style=orbitMapStyle(theme);
  if(theme.material==='matte')continue;
  assert.equal(style.colors.stage,theme.stage);
  const {seam,road,edge,mark}=style.colors;
  assert.ok(luminance(seam)<luminance(road)&&luminance(road)<luminance(edge)&&luminance(edge)<luminance(mark));
  const contrast=(luminance(mark)+.05)/(luminance(road)+.05);
  assert.ok(contrast>4.5,'符号与路面应保持足够对比');
 }
 assert.deepEqual(orbitThemes,before);
});

test('所有像素主题的公共界面一致，美术配色与背景不改变控件及反馈色',()=>{
 const pixels=orbitThemes.filter(t=>t.material==='pixel');
 for(const theme of pixels){
  assert.deepEqual(orbitThemeStyle(theme),orbitThemeStyle(pixels[0]));
  for(const key of ['pastRoadAlpha','ballFeedback','roadPalette','colors','text','muted','success','buttonBase','environment'])assert.equal(key in theme,false);
  const changed={...theme,stage:0xffffff,roadMaterial:{...theme.roadMaterial,palette:{shadow:0,face:1,edge:2,mark:3}}};
  assert.deepEqual(orbitThemeStyle(changed),orbitThemeStyle(theme));
  for(const key of ['primary','warm','error','onPrimary'])assert.equal(orbitMapStyle(changed).colors[key],orbitMapStyle(theme).colors[key]);
  assert.equal(orbitMapStyle(changed).colors.road,1);
 }
});
