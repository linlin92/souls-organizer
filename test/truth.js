// Hand-labelled ground truth. Labelled by viewing enlarged crops of the screenshots (NOT copied from the reader's output).
// Row format per tile: "class-slot level diamonds/platinum E|-"   (class: str|agi|int; slot: helmet|armor|boots|weapon)
// Tiles in a row are listed left to right. All tiles are yellow (mythic).
const R = (s) => s.split(",").map((x) => { const [id, lv, d, e] = x.trim().split(/\s+/); const [set, slot] = id.split("-"); const [dn, pl] = d.split("/").map(Number);
  return { set, slot, level: +lv, diamonds: dn, platinum: pl, equipped: e === "E" }; });
const ROWS = [
  /* G0  shot2 r0 */ R("int-armor 200 3/3 E, int-boots 200 3/3 E, int-armor 200 3/3 E, int-helmet 200 3/3 E, int-weapon 200 3/3 E"),
  /* G1  shot2 r1 */ R("agi-boots 200 3/3 E, agi-armor 200 3/3 E, agi-weapon 200 3/3 E, str-boots 200 3/3 E, str-armor 200 3/3 E"),
  /* G2  shot2 r2 */ R("str-helmet 200 3/3 E, str-weapon 200 3/3 E, int-boots 200 3/3 E, int-armor 200 3/3 E, int-helmet 200 3/3 E"),
  /* G3  shot2 r3 */ R("int-weapon 200 3/3 E, int-armor 190 3/3 E, agi-boots 200 3/3 E, agi-boots 200 3/3 E, agi-helmet 200 3/3 E"),
  /* G4  shot3 r0 */ R("agi-weapon 200 3/3 E, agi-armor 100 3/3 E, int-boots 200 3/3 E, int-armor 200 3/3 E, int-helmet 200 3/3 E"),
  /* G5  shot3 r1 */ R("int-weapon 200 3/3 E, int-armor 200 3/3 E, int-helmet 200 3/3 E, int-weapon 200 3/3 E, int-boots 170 3/3 E"),
  /* G6  shot3 r2 */ R("agi-helmet 200 3/3 E, agi-weapon 200 3/3 E, agi-armor 190 3/3 E, str-boots 200 3/3 E, str-armor 200 3/3 E"),
  /* G7  shot3 r3 */ R("str-weapon 200 3/3 E, agi-helmet 200 3/3 E, agi-helmet 200 3/3 E, agi-weapon 200 3/3 E, agi-boots 180 3/3 E"),
  /* G8  shot4 r0 */ R("int-boots 200 3/3 E, int-helmet 200 3/3 E, int-armor 200 3/0 E, int-helmet 200 3/0 E, int-weapon 200 3/0 E"),
  /* G9  shot4 r1 */ R("agi-weapon 200 3/0 E, str-helmet 200 3/0 E, int-weapon 200 3/0 E, int-boots 200 3/0 E, int-armor 200 3/0 E"),
  /* G10 shot4 r2 */ R("int-helmet 200 3/0 E, int-weapon 200 3/0 E, int-boots 200 3/0 E, int-boots 170 3/0 E, int-boots 200 3/0 E"),
  /* G11 shot4 r3 */ R("int-armor 200 3/0 E, int-helmet 200 3/0 E, int-weapon 200 3/0 E, str-boots 200 3/0 E, str-armor 200 3/0 E"),
  /* G12 shot5 r0 */ R("str-helmet 200 3/0 E, agi-armor 200 3/0 E, agi-weapon 200 3/0 E, int-weapon 200 3/0 E, int-weapon 200 3/0 E"),
  /* G13 shot5 r1 */ R("agi-armor 200 3/0 E, agi-weapon 200 3/0 E, int-helmet 200 3/0 E, str-armor 200 3/0 E, str-helmet 200 3/0 E"),
  /* G14 shot5 r2 */ R("int-weapon 200 3/0 E, int-armor 200 3/0 E, int-armor 200 3/0 E, str-armor 200 3/0 E, str-helmet 200 3/0 E"),
  /* G15 shot5 r3 */ R("str-weapon 200 3/0 E, str-weapon 180 2/0 E, agi-boots 160 2/0 E, str-boots 160 1/0 E, int-boots 150 0/0 E"),
  /* G16 shot6 r1 */ R("agi-helmet 150 0/0 E, agi-boots 122 0/0 E, agi-armor 100 0/0 E, agi-boots 150 0/0 E, agi-helmet 150 0/0 E"),
  /* G17 shot6 r2 */ R("int-boots 150 0/0 E, agi-armor 150 0/0 E, str-boots 150 0/0 E, str-boots 150 0/0 E, int-helmet 150 0/0 E"),
  /* G18 shot6 r3 */ R("int-helmet 150 0/0 E, str-weapon 150 0/0 E, agi-boots 0 0/0 -"),
];
const CLASS_OF = { str: "STR", agi: "AGI", int: "INT" };
// which global rows each screenshot shows, in order, and whether the last/first one is cut off by the viewport
// kind: f = full row (read), p = partial row (must NOT be read). shot1 == shot6 (same inventory, scrolled to the end, different background)
const SHOTS = {
  shot1: [["p", 15], ["f", 16], ["f", 17], ["f", 18]],
  shot2: [["f", 0], ["f", 1], ["f", 2], ["f", 3], ["p", 4]],
  shot3: [["f", 4], ["f", 5], ["f", 6], ["f", 7], ["p", 8]],
  shot4: [["f", 8], ["f", 9], ["f", 10], ["f", 11], ["p", 12]],
  shot5: [["f", 12], ["f", 13], ["f", 14], ["f", 15], ["p", 16]],
  shot6: [["p", 15], ["f", 16], ["f", 17], ["f", 18]],
};
module.exports = { ROWS, SHOTS, CLASS_OF };
