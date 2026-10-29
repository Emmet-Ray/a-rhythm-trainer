// "Moon Buns": a lilac corner bakery with a crescent sign, a brick-oven chimney and a roof cat.
pal({
  k: "#2b1740",                                   // ink
  W: "#4a2a74", V: "#6a3d9a", v: "#8a5cc0", q: "#b894ec", // lilac walls
  p: "#ff7fa8", P: "#c9487a",                     // pink
  R: "#8a3a30", O: "#d9643c", o: "#ff9a62", u: "#ffc890", // bread / oven
  a: "#c98a2e", L: "#f2b84a", l: "#ffe27a", w: "#fffaf0", // butter light
  n: "#1f5f66", M: "#2f9a86", m: "#7fe0b0",       // mint
  e: "#bb9b82", C: "#e6cfae", c: "#fff3dc",       // cream plaster
  B: "#ffcfae", b: "#f5ab8a",                     // peach backdrop
  r: "#ff5d6c",
})
ramps("kWVvq", "kPp", "kROou", "kaLlw", "knMm", "keCc")

// ---------------------------------------------------------------- small parts
sprite("_dentil", `
  LL..
  aa..`)
sprite("_brick", `
  cccccccC
  cccccccC
  cccccccC
  CCCCCCCC
  cccCcccc
  cccCcccc
  cccCcccc
  CCCCCCCC`)
sprite("_siding", `
  vvvvvvvv
  vvvvvvvv
  vvvvvvvv
  vvvvvvvv
  VVVVVVVV
  vvvvvvvv`)
sprite("_awning", `
  PPPPCCCC
  ppppcccc
  ppppcccc
  ppppcccc
  ppppcccc
  ppppcccc
  .pp..cc.`)

// window goods, 7x7, bottom row sits on the shelf
sprite("_loaf", `
  .......
  ..ooo..
  .ouooO.
  .oooOO.
  .ooOOO.
  .ROOOR.
  .RRRRR.`)
sprite("_croissant", `
  .......
  ..ouo..
  .ouoOo.
  ouOoOou
  .oOoOo.
  ..ROR..
  .......`)
sprite("_donut", `
  .......
  ..ppp..
  .pwpPp.
  .pP.Pp.
  .pPPPp.
  ..ooo..
  .......`)
sprite("_pie", `
  .......
  .......
  .uuuuu.
  uooooOO
  .OOOOO.
  .RRRRR.
  .......`)
sprite("_cupcake", `
  ..ppp..
  .pwpPp.
  .PPPPP.
  .cCcCc.
  .cCcCc.
  ..CcC..
  .......`)
sprite("_baguette", `
  .....uo
  ....uoO
  ...uoO.
  ..uoO..
  .uoO...
  uoO....
  oO.....`)
group("goods", ["_loaf", "_loaf", "_croissant", "_donut", "_pie", "_cupcake", "_baguette"])

sprite("_plant", `
  .m.m..
  mMmm.m
  .mMmm.
  ..Mm..
  .pppp.
  .PppP.
  ..PP..`)

sprite("_moon_win", { w: 19, h: 19 },
  circ(9, 9, 9, "L"), circ(9, 9, 7, "l"), circ(7, 7, 4, "w"),
  hline(2, 9, 15, "L"), vline(9, 2, 15, "L"), ring(9, 9, 7, "a"), ring(9, 9, 9, "a"),
  shade([10, 10, 9, 9]))

sprite("_bell", `
  .a.
  LLL
  LlL
  aLa`)
sprite("_bulb_y", "l\nL")
sprite("_bulb_p", "p\nP")
sprite("_bulb_m", "m\nM")
group("bulbs", ["_bulb_y", "_bulb_p", "_bulb_m", "_bulb_y"])

sprite("_steam_a", `
  .w.
  www
  .w.`)
sprite("_steam_b", "w")
group("steam", ["_steam_a", "_steam_b", "_steam_b"])

sprite("_spark", `
  .l.
  lwl
  .l.`)
sprite("_dot", "w")
group("sparks", ["_spark", "_dot", "_dot", "_dot"])

sprite("_cat", `
  k...k..
  kk.kk..
  kmkmk..
  kkkkk..
  .kkkk..
  .kkkkk.
  .kkkkkk`)
sprite("_bird", `
  .k.
  kkk
  ..k`)

// ---------------------------------------------------------------- the shop
sprite("shop", { w: 104, h: 100, outline: "k", layers: true },
  layer("walls",
    pattern("_siding", 0, 0, 104, 40),
    pattern("_brick", 0, 40, 104, 60),
    rect(0, 0, 104, 4, "L"), hline(0, 4, 104, "a"), pattern("_dentil", 0, 5, 104, 2),
    rect(0, 38, 104, 3, "L"), hline(0, 41, 104, "a"),
    rect(0, 91, 104, 9, "n"), hline(0, 91, 104, "m"), vline(26, 92, 8, "k"), vline(52, 92, 8, "k"), vline(78, 92, 8, "k")),

  layer("upstairs",
    // crescent sign plate
    rect(14, 10, 48, 22, "W"), box(14, 10, 48, 22, "L"),
    px(15, 11, "l"), px(60, 11, "l"), px(15, 30, "l"), px(60, 30, "l"),
    circ(25, 21, 7, "l"), circ(28, 19, 6, "W"), px(22, 17, "w"),
    text(46, 14, "MOON", "l", { align: "c", shadow: "a" }),
    text(46, 22, "BUNS", "p", { align: "c", shadow: "P" }),
    // round window
    stamp("_moon_win", 70, 12),
    rect(68, 29, 23, 3, "L"), hline(68, 31, 23, "a"),
    stamp("_plant", 71, 23), stamp("_plant", 82, 23, { flip: "x" }),
    // drainpipe
    rect(98, 0, 4, 40, "M"), vline(101, 0, 40, "n"), vline(99, 0, 40, "m"), hline(97, 20, 6, "n"),
    // little vent
    rect(3, 14, 8, 8, "W"), box(3, 14, 8, 8, "L"), hline(4, 16, 6, "V"), hline(4, 18, 6, "V"), hline(4, 20, 6, "V")),

  layer("storefront",
    // shop window
    rect(5, 56, 62, 36, "W"), rect(7, 58, 58, 32, "L"), grad(7, 58, 58, 32, "lLLa"),
    tile("goods", 10, 62, 7, 1, { seed: 1 }), hline(8, 69, 56, "W"),
    tile("goods", 10, 71, 7, 1, { seed: 2 }), hline(8, 78, 56, "W"),
    tile("goods", 10, 80, 7, 1, { seed: 3 }), rect(5, 87, 62, 5, "V"), hline(5, 87, 62, "v"),
    vline(35, 58, 29, "W"),
    // door
    rect(72, 52, 26, 40, "W"), rect(74, 54, 22, 38, "M"), grad(74, 54, 22, 38, "mMMn", "v", 0.3),
    circ(85, 65, 6, "l"), circ(83, 63, 3, "w"), ring(85, 65, 6, "n"),
    box(77, 74, 16, 6, "n"), box(77, 82, 16, 8, "n"),
    px(94, 78, "L"), px(94, 79, "L"),
    rect(78, 40, 14, 8, "c"), box(78, 40, 14, 8, "C"), text(85, 42, "OPEN", "r", { align: "c" }),
    // awning
    pattern("_awning", 2, 46, 72, 10),
    stamp("_bell", 81, 49)),

  layer("awning_shadow", { shade: true }, rect(2, 56, 72, 2, "k")),
  layer("glow", { light: true, density: 0.5 }, circ(36, 74, 20, "k")),
)

// ---------------------------------------------------------------- roof & street props
// brick oven chimney with a pizza-peel hatch
sprite("chimney", { w: 18, h: 36, outline: "k" },
  pattern("_brick", 0, 4, 18, 32),
  rect(0, 4, 18, 3, "R"), hline(0, 6, 18, "k"),
  rect(-1, 0, 20, 5, "O"), hline(0, 0, 18, "o"), hline(0, 4, 18, "R"),
  rect(4, 18, 10, 12, "W"), rect(5, 19, 8, 10, "O"), rect(6, 21, 6, 8, "l"), rect(7, 23, 4, 6, "a"),
  shade([0, 4, 6, 32], 1, 0.5), shade([13, 4, 5, 32]))

sprite("lamp", { w: 17, h: 66, outline: "k" },
  vline(8, 16, 50, "W"), vline(7, 16, 50, "V"), rect(4, 62, 9, 4, "W"), hline(4, 62, 9, "V"),
  hline(0, 12, 17, "V"), line(8, 16, 2, 12, "W"), line(8, 16, 14, 12, "W"),
  circ(8, 6, 6, "l"), circ(6, 4, 3, "w"), ring(8, 6, 6, "a"),
  circ(2, 14, 2, "p"), circ(14, 14, 2, "m"))

sprite("cart", { w: 30, h: 22, outline: "k" },
  rect(0, 0, 30, 4, "p"), pattern("_awning", 0, 0, 30, 6),
  vline(2, 6, 10, "W"), vline(27, 6, 10, "W"),
  rect(0, 16, 30, 3, "V"), hline(0, 16, 30, "v"),
  stamp("_loaf", 4, 9), stamp("_croissant", 11, 9), stamp("_baguette", 18, 9), stamp("_pie", 22, 9),
  circ(6, 20, 2, "n"), circ(24, 20, 2, "n"), px(6, 20, "m"), px(24, 20, "m"))

sprite("board", { w: 22, h: 20, outline: "k" },
  rect(1, 0, 20, 17, "W"), box(1, 0, 20, 17, "L"),
  text(11, 3, "FRESH", "l", { align: "c" }), text(11, 10, "HOT", "p", { align: "c" }),
  line(3, 17, 1, 19, "W"), line(18, 17, 20, 19, "W"))

sprite("mailbox", { w: 10, h: 16, outline: "k" },
  rect(0, 0, 10, 7, "r"), rect(0, 7, 10, 3, "r"), hline(0, 9, 10, "P"),
  hline(2, 3, 6, "k"), vline(4, 10, 6, "W"), vline(5, 10, 6, "V"), px(8, 1, "w"))

// ---------------------------------------------------------------- scene
scene("moon_buns", { w: 176, h: 168, bg: "B", layers: true },
  layer("backdrop",
    scatter("sparks", 0, 0, 176, 120, 26, { seed: 8 }),
    // big soft moon behind
    circ(150, 28, 16, "b"), circ(150, 28, 13, "c"), circ(156, 25, 11, "B"), circ(150, 28, 13, "c"),
    circ(156, 25, 11, "B")),

  layer("buildings",
    stamp("chimney", 108, 17),
    stamp("shop", 33, 49)),

  layer("roof",
    stamp("_cat", 50, 42), stamp("_bird", 152, 56),
    stamp("_plant", 78, 43), stamp("_plant", 120, 43, { flip: "x" }),
    // weather vane: a star on a pole
    vline(64, 28, 21, "W"), hline(60, 34, 9, "W"), circ(64, 25, 3, "l"), px(64, 25, "w"), px(61, 27, "l"), px(67, 27, "l")),

  layer("steam",
    // rising steam from the chimney
    stamp("_steam_a", 114, 12), stamp("_steam_a", 118, 6), stamp("_steam_a", 113, 1),
    stamp("_steam_b", 121, 10), stamp("_steam_b", 110, 8)),

  layer("street",
    rect(0, 150, 176, 3, "W"), hline(0, 150, 176, "V"),
    stamp("lamp", 8, 86), stamp("cart", 142, 128), stamp("board", 22, 130), stamp("mailbox", 128, 134),
    stamp("_plant", 131, 143, { flip: "x" }),
    wire(16, 90, 38, 54, 6, "W", { hang: "bulbs", every: 4, seed: 3 }),
    wire(138, 54, 168, 60, 5, "W", { hang: "bulbs", every: 4, seed: 4 })),

  layer("spill", { light: true },
    poly([40, 150, 100, 150, 108, 156, 32, 156], "k"),
    circ(16, 92, 8, "k")),
  layer("halo", { light: true, density: 0.5 },
    circ(16, 92, 18, "k"), poly([34, 150, 108, 150, 118, 160, 22, 160], "k")),
)
