// A shared rehearsal space. High windows and low props frame a quiet playing wall;
// the metronome stays in the right-hand portrait crop.
const p={cornice:'#838e87',wall:'#8f9a92',rail:'#858f88',panel:'#7f8a83',base:'#5e6862',
 glass:'#75807a',frame:'#5a635d',floor:'#a07a52',seam:'#8c6a47',sun:'#b78d5d',
 wood:'#6a4a32',paper:'#d9c9a4',metal:'#2f3438',shadow:'#765b40'};
scene('practice-room',{w:480,h:270,bg:p.wall},c=>{
 // Translate each object as a group so its support and shadow stay together.
 const at=(dx,draw)=>draw({
  rect:(x,y,...args)=>c.rect(x+dx,y,...args),
  line:(x,y,x2,y2,...args)=>c.line(x+dx,y,x2+dx,y2,...args),
  poly:(points,...args)=>c.poly(points.map((n,i)=>i%2?n:n+dx),...args),
 });
 c.rect(0,0,480,12,p.cornice);c.rect(0,11,480,1,p.frame);
 // One inset high window: a continuous frame, recessed glazing and projecting sill.
 c.rect(296,14,140,48,p.frame);
 for(const x of [300,345,390]) {
  c.rect(x,18,42,40,'#4c544f');c.rect(x+1,19,41,25,'#7c8984');
  c.rect(x+1,44,41,14,'#6c7874');
  c.line(x+8,52,x+22,24,'#97a39d');c.line(x+14,52,x+22,36,'#97a39d');
 }
 c.rect(290,62,152,5,p.base);c.rect(290,62,152,1,'#9aa49c');c.rect(292,67,148,2,p.panel);
 // Blank paper and frames; the active exercise supplies notation at runtime.
 for(const [x,y,w] of [[116,26,66],[188,30,64]]) {
  c.rect(x+2,y+2,w,36,p.panel);c.rect(x,y,w,34,p.wood);c.rect(x+2,y+2,w-4,30,'#c8bfa5');
  c.rect(x+4,y+4,2,2,'#a5523f');c.rect(x+w-6,y+4,2,2,'#a5523f');
 }
 // Wall moulding, well below the play corridor; no decorative pattern behind roads.
 c.rect(0,150,480,2,p.rail);c.rect(0,152,480,26,p.panel);
 c.rect(0,178,480,6,p.base);c.rect(0,184,480,86,p.floor);
 c.poly([290,238,340,238,322,262,268,262],p.sun);
 const seams=[192,202,214,228,244,263];
 seams.forEach((y,i)=>{
  c.line(0,y,480,y,p.seam);
  const previous=i===0?184:seams[i-1];
  for(let x=(i%2?44:97);x<480;x+=111)c.line(x,previous,x-3,y,p.seam);
 });
 // Guitar and stand form the left group.
 at(50,c=>{
 // Acoustic guitar leaning beside the bench, outside the playing wall.
 c.poly([148,235,173,235,184,241,155,241],p.shadow);
 c.line(162,190,162,233,p.metal);c.line(156,230,148,240,p.metal,2);c.line(166,230,175,240,p.metal,2);c.rect(160,190,6,2,p.metal);
 c.poly([153,191,165,188,173,196,171,207,177,217,176,229,167,236,152,236,143,229,143,216,150,207,147,200],'#7a4a28');
 c.poly([154,194,164,191,170,197,168,207,174,218,173,227,165,233,153,233,146,227,146,217,153,207,150,200],'#b5763f');
 c.poly([160,197,164,161,168,161,165,199],'#5a3a24');
 c.rect(164,156,6,8,'#4e3524');for(const y of [157,161]){c.rect(162,y,2,1,p.paper);c.rect(170,y,2,1,p.paper);}
 c.rect(158,204,6,6,p.metal);c.line(163,195,160,224,p.paper);c.rect(157,224,8,2,'#5a3a24');
 });
 at(78,c=>{
 // Snare with crossed sticks and a three-legged stand.
 c.poly([265,244,302,244,312,249,274,249],p.shadow);
 c.line(273,230,268,244,p.metal);c.line(285,230,285,247,p.metal);c.line(297,230,302,244,p.metal);
 c.rect(266,214,38,16,'#8a3d34');c.rect(266,214,38,2,p.metal);c.rect(266,229,38,2,p.metal);
 c.poly([270,210,300,210,304,213,304,215,300,217,270,217,266,215,266,213],'#d2c7ae');
 for(let x=270;x<304;x+=8)c.rect(x,218,1,8,p.metal);
 c.line(276,212,296,207,'#8a6444');c.line(280,207,298,213,'#8a6444');
 });
 // Keyboard sits farther back; architectural edges can crop, instruments should not.
 c.poly([399,214,450,214,459,219,408,219],p.shadow);
 c.line(404,178,448,214,p.metal,2);c.line(448,178,404,214,p.metal,2);
 c.rect(398,168,56,11,'#3a3f44');c.rect(400,172,52,6,p.paper);
 for(let x=404;x<452;x+=4)c.line(x,172,x,177,p.metal);
 for(let i=0;i<13;i++)if([0,1,3,4,5].includes(i%7))c.rect(403+i*4,172,2,3,p.metal);
 // Metronome on a simple plinth, with one pool of light in front.
 at(-30,c=>{
 c.poly([318,236,364,236,377,242,328,242],p.shadow);
 c.rect(318,222,46,14,p.wood);c.rect(318,222,46,1,'#8a6444');
 c.poly([329,220,335,189,344,189,351,220],'#4e3524');
 c.poly([330,218,336,190,340,190,340,218],'#8a6444');
 c.rect(338,187,4,2,'#4e3524');c.rect(352,208,2,3,p.metal);
 c.poly([333,215,337,192,342,192,347,215],p.paper);
 c.rect(329,218,22,4,p.wood);
 for(let y=196;y<214;y+=2)c.line(337,y,y%4===0?342:340,y,p.shadow);
 c.line(340,215,346,193,p.metal,1);
 c.rect(342,201,5,3,p.metal);c.rect(339,213,3,3,p.metal);
 });
});
