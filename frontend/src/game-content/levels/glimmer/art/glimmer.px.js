// Twilight bands keep the central play corridor quiet. The path, remaining daylight
// and five foreground fireflies sit inside the right-hand portrait crop.
const p = {
 sky: '#1c2433', blue: '#232c3c', violet: '#2d3444', dusk: '#3c3d4a',
 glow: '#6e5a55', light: '#a8836a', hill: '#29313d',
 field: '#1f2829', path: '#27332f', grass: '#3a4a3e', firefly: '#e8d79a',
};
scene('dusk-field', { w: 480, h: 270, bg: p.sky }, c => {
 c.poly([0,54,85,54,85,55,221,55,221,54,340,54,340,56,480,56,480,270,0,270],p.blue);
 c.poly([0,105,129,105,129,104,270,104,270,106,407,106,407,105,480,105,480,270,0,270],p.violet);
 c.poly([0,145,154,145,154,146,303,146,303,144,416,144,416,145,480,145,480,270,0,270],p.dusk);
 // A single low cloud, no stars or decorative noise.
 c.poly([25,135,61,132,102,132,118,134,170,134,192,138,25,138],p.violet);
 // Remaining daylight follows the horizon rather than forming a floating disk.
 c.poly([180,187,200,187,200,183,224,183,224,181,253,181,253,179,418,179,418,181,450,181,450,183,480,183,480,198,180,198],p.glow);
 for (let x=254;x<418;x+=4) c.rect(x,179,2,2,p.dusk);
 c.poly([300,189,310,189,310,187,324,187,324,185,366,185,366,187,377,187,377,189,385,189,385,198,300,198],p.light);
 c.poly([0,191,48,186,91,188,141,181,191,187,245,184,295,190,340,190,386,187,433,190,480,184,480,270,0,270],p.hill);
 c.poly([0,205,70,201,144,205,209,199,280,204,340,201,402,205,480,199,480,270,0,270],p.field);
 // A narrow path catches the last ambient light as it bends into the field.
 c.poly([249,270,272,249,308,234,326,217,338,201,342,201,335,220,320,238,296,253,285,270],p.path);
 for (const [x,y,h] of [[18,266,8],[52,254,6],[95,268,10],[173,257,5],[221,269,8],[360,263,7],[409,252,6],[451,267,9]]) {
  c.line(x,y,x-3,y-h,p.grass);
  c.line(x,y,x+2,y-h-2,p.path);
 }
 for (const [x,y] of [[318,214],[342,228],[366,209],[388,238],[304,247],[140,224],[62,241]]) {
  c.line(x-1,y,x+1,y,p.glow); c.line(x,y-1,x,y+1,p.glow);
  c.rect(x,y,1,1,p.firefly);
 }
});
