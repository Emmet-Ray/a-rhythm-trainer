// Rainy-night outpost: a brick smithy and a two-floor wooden house over a dug-out cave.
// Lit with lighting(): chandelier, candle, gem lamps, furnace, a cave torch and a crimson glow.
pal({
  k: "#0b0b10", a: "#1b1e27", A: "#2a2e39", q: "#45536f",
  d: "#6b4a2e", D: "#4e3420", c: "#4a3322", C: "#36251a",
  g: "#46a843", G: "#2b7232", r: "#a32e2e", R: "#6e1c1f",
  t: "#73737e", T: "#4b4b56", w: "#7a5634", W: "#5a3e26", b: "#3a2616", l: "#b08a58",
  o: "#b04a3c", O: "#6e2a24", i: "#56698e",
  y: "#ffd86a", Y: "#ff9a3a", e: "#ff4a4a", u: "#3b5ba8", v: "#3f8f4f",
})

// ---------------------------------------------------------------- tiles
sprite("_brick", `
  tttTtttT
  TTTTTTTT
  tTtttTtt
  TTTTTTTT`)
sprite("_plank", `
  wwwwwwwW
  wwwwwwwW
  WWWWWWWW`)
sprite("_shingle", `
  ooooOo
  OOOOOO
  oOoooo
  OOOOOO`)
sprite("_drop", `
  .q
  .q
  q.
  q.`)

// ---------------------------------------------------------------- lit props
sprite("torch", `
  .y.
  yYy
  .Y.
  .b.
  .b.`, lamp(1, 1, { r: 72, color: "#ffb35c" }))

sprite("chandelier", { mx: "c" }, `
  .......b
  .......b
  y......y
  b......b
  bbbbbbbb
  ...bbbbb`, lamp(0, 2, { r: 60, color: "#ffc070" }), lamp(7, 2, { r: 60, color: "#ffc070" }))

sprite("candle", `
  .y.
  .Y.
  .l.
  lll`, lamp(1, 0, { r: 34, color: "#ffc070" }))

sprite("gem", "e\ne\nb", lamp(0, 0, { r: 30, color: "#ff6a50", power: 0.75 }))

sprite("furnace", `
  .TTTTTTTTTT.
  TttttttttttT
  TtTTTTTTTTtT
  TtTYYyyYYTtT
  TtTYyyyyYTtT
  TtTYYYYYYTtT
  TttttttttttT
  TTTTTTTTTTTT`, lamp(6, 4, { r: 48, color: "#ff9a40" }))

// ---------------------------------------------------------------- furniture
sprite("anvil", `
  bbbbbbb
  .bbbbb.
  ..bbb..
  .bbbbb.`)
sprite("table", `
  llllllllll
  .b......b.
  .b......b.
  .b......b.`)
sprite("chest", `
  .llllll.
  lOOOOOOl
  llllyyll
  lOOOOOOl
  llllllll`)
sprite("bookshelf", { w: 16, h: 22 },
  rect(0, 0, 16, 22, "W"), box(0, 0, 16, 22, "b"),
  (c) => {
    const r = c.rng(4);
    for (const y of [2, 9, 16]) {
      for (let x = 2; x < 14; x++) if (r() < 0.8) c.vline(x, y, 5, "uvroi"[Math.floor(r() * 5)]);
      c.hline(1, y + 5, 14, "b");
    }
  })

const fence = (x, y, w, h) => (c) => {
  c.hline(x, y + 1, w, "W");
  for (let i = x; i < x + w; i += 3) c.vline(i, y, h, "w");
}

// ---------------------------------------------------------------- scene
const cave = [100, 123, 198, 123, 196, 150, 200, 175, 195, 200, 185, 222, 165, 240, 145, 244,
  118, 232, 98, 216, 82, 200, 72, 182, 76, 168, 92, 156, 100, 148];

scene("outpost", { w: 264, h: 280, bg: "a", layers: true },
  layer("sky", { unlit: true },
    grad(0, 0, 264, 130, "Aa"),
    scatter("_drop", 0, 0, 264, 130, 70, { seed: 2 })),

  layer("cavewall", { wall: true }, poly(cave, "c"), noise(70, 120, 132, 126, "C", 0.25, 7, "c")),

  layer("ground", { solid: true },
    rect(0, 122, 264, 158, "d"),
    noise(0, 122, 264, 158, "D", 0.2, 3),
    poly(cave, "_"),
    poly([130, 166, 170, 166, 172, 169, 128, 169], "d"),          // ledge for the chest
    (c) => {
      // Grass (crimson on the left) on every dirt pixel within 2px of open space.
      const open = (x, y) => y >= 0 && y < c.h && x >= 0 && x < c.w && c.is(x, y, ".");
      const edge = [];
      for (let y = 120; y < c.h; y++)
        for (let x = 0; x < c.w; x++)
          if (c.is(x, y, "dD") && (open(x, y - 1) || open(x, y - 2) || open(x - 1, y) || open(x + 1, y) || open(x, y + 1)))
            edge.push([x, y]);
      for (const [x, y] of edge) c.px(x, y, x < 60 ? (y % 2 ? "R" : "r") : (y % 3 ? "g" : "G"));
    }),

  layer("backwall", { wall: true },
    pattern("_brick", 38, 78, 82, 42),
    pattern("_brick", 120, 26, 76, 50),
    pattern("_plank", 120, 78, 76, 42),
    rect(66, 86, 28, 16, "i"), box(66, 86, 28, 16, "b"),
    vline(73, 86, 16, "b"), vline(80, 86, 16, "b"), vline(87, 86, 16, "b"), hline(66, 93, 28, "b")),

  layer("frame", { solid: true },
    // Smithy: chimney, sloped shingle roof, left wall.
    pattern("_brick", 54, 50, 8, 22),
    clip([30, 80, 42, 68, 122, 68, 122, 80], pattern("_shingle", 30, 68, 92, 12)),
    rect(34, 80, 4, 40, "t"), rect(34, 80, 4, 40, "T"), pattern("_brick", 34, 80, 4, 40),
    // House: roof trim, side posts, upper floor with a stair hole.
    clip([110, 30, 124, 16, 194, 16, 208, 30, 198, 30, 190, 22, 128, 22, 120, 30], pattern("_shingle", 110, 16, 98, 14)),
    rect(117, 26, 4, 50, "b"), rect(195, 26, 4, 72, "b"),
    rect(117, 75, 82, 3, "b"), rect(170, 75, 22, 3, "_"),
    rect(120, 76, 77, 2, "W"), rect(170, 76, 22, 2, "_"),
    // Shared floor.
    rect(34, 120, 165, 3, "t"), noise(34, 120, 165, 3, "T", 0.4, 5)),

  layer("props",
    fence(64, 56, 54, 12), fence(199, 62, 18, 12), rect(199, 74, 18, 2, "W"),
    rect(204, 84, 11, 7, "l"), box(204, 84, 11, 7, "W"), vline(209, 78, 6, "b"),     // sign
    line(144, 120, 190, 76, "W", 2), line(144, 117, 188, 75, "l"),                   // stairs
    stamp("chandelier", 147, 30), stamp("table", 145, 66), stamp("table", 152, 109),
    stamp("candle", 157, 105), stamp("bookshelf", 175, 98),
    stamp("gem", 50, 88), stamp("gem", 110, 88),
    stamp("furnace", 52, 112), stamp("anvil", 70, 116), stamp("chest", 100, 115),
    stamp("chest", 146, 161), stamp("torch", 125, 205),
    lamp(16, 124, { r: 50, color: "#c0302a", power: 0.8 })),                         // crimson glow

  lighting({ cell: 4, sky: 0.75, skyColor: "#8a98b8", skyReach: 16, ambient: 0.02, emit: "yYe" }))
