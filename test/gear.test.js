// node --test test/   (or: npm test)
// Reader accuracy against the hand-labelled truth in test/truth.js, merge/dedupe, recap numbers, and the "skip non-yellow tiles" rule.
const test = require("node:test"), assert = require("node:assert");
const path = require("path");
const { loadImage, root } = require("../tools/load.js");
const { matcher, G } = require("../tools/refs-node.js");
const { ROWS, SHOTS, CLASS_OF } = require("./truth.js");

const m = matcher();
const shots = {};
const A = (n) => shots[n] || (shots[n] = G.analyze(m, loadImage(path.join(root, "test/fixtures/screens", n + ".jpg"))));
const FIELDS = ["set", "slot", "cls", "diamonds", "refined", "equipped"];
const want = (tr) => ({ set: tr.set, slot: tr.slot, cls: CLASS_OF[tr.set], diamonds: tr.diamonds, refined: tr.diamonds > 0 && tr.platinum === tr.diamonds, equipped: tr.equipped });
const got = (t) => ({ set: t.set, slot: t.slot, cls: t.cls, diamonds: t.diamonds, refined: t.refined, equipped: t.equipped });
// reader misses that are known and honest: they must stay flagged "unsure" so the check step shows them
const KNOWN_MISS = {};

test("row detection: full rows are read, cut-off rows are never read", () => {
  for (const [s, exp] of Object.entries(SHOTS)) {
    const a = A(s);
    assert.deepStrictEqual(a.rows.map((r) => (r.kind === "full" ? "f" : "p")), exp.map((e) => e[0]), s + " row kinds");
    a.rows.forEach((r, ri) => { if (exp[ri][0] === "p") r.cols.forEach((c) => assert.ok(c.tile.ignored, `${s} r${ri} partial row must not be read`)); });
  }
});

test("per tile fields match the hand-labelled truth (known misses must be flagged)", () => {
  const tally = {}; let tiles = 0; const misses = [];
  for (const [s, exp] of Object.entries(SHOTS)) A(s).rows.forEach((r, ri) => {
    if (exp[ri][0] !== "f") return;
    r.cols.forEach((c, ci) => {
      const tr = ROWS[exp[ri][1]][ci];
      if (!tr) { assert.ok(c.tile.ignored, `${s} r${ri}c${ci}: empty slot must be skipped`); return; }
      assert.ok(!c.tile.ignored, `${s} r${ri}c${ci}: real tile was skipped`);
      tiles++;
      const g = got(c.tile), w = want(tr);
      for (const f of FIELDS) {
        tally[f] = tally[f] || { ok: 0, n: 0 }; tally[f].n++;
        if (g[f] === w[f]) tally[f].ok++;
        else { const key = `${s} r${ri}c${ci} ${f}`; misses.push(key); assert.ok(KNOWN_MISS[key], `${key}: got ${g[f]} want ${w[f]}`); assert.ok(c.tile.flags.length, key + " must be flagged"); }
      }
    });
  });
  console.log("# tile reads:", tiles, Object.entries(tally).map(([f, t]) => `${f} ${t.ok}/${t.n}`).join("  "));
  assert.strictEqual(tiles, 106);
  assert.deepStrictEqual(misses, Object.keys(KNOWN_MISS));
});

test("merge: 6 screenshots -> 93 unique pieces, nothing double counted or lost, in scroll order", () => {
  const mg = G.merge(["shot2", "shot3", "shot4", "shot5", "shot6"].map(A));
  const pieces = G.toPieces(mg.tiles);
  const truth = ROWS.flat();
  assert.strictEqual(pieces.length, truth.length);
  pieces.forEach((p, i) => { const t = truth[i]; assert.strictEqual(p.set + "-" + p.slot, t.set + "-" + t.slot, "piece " + i); assert.strictEqual(p.diamonds, t.diamonds); assert.strictEqual(p.equipped, t.equipped); });
  // every cut-off row is also seen in full in the next screenshot and gets linked to it (looks only: cut-off rows are never read)
  assert.strictEqual(mg.tiles.filter((t) => t.partialRow).length, 0);
});

test("merge: shot1 and shot6 are the same inventory -> same pieces, counted once", () => {
  const solo = G.toPieces(G.merge([A("shot6")]).tiles).length;
  const both = G.toPieces(G.merge([A("shot1"), A("shot6")]).tiles).length;
  assert.strictEqual(solo, 13); // rows 16, 17, 18 = 5 + 5 + 3
  assert.strictEqual(both, solo);
});

test("merge: order of the screenshots does not matter", () => {
  const names = ["shot2", "shot3", "shot4", "shot5", "shot6"];
  const fwd = G.toPieces(G.merge(names.map(A)).tiles).length;
  const rev = G.toPieces(G.merge(names.slice().reverse().map(A)).tiles).length;
  const all6 = G.toPieces(G.merge(["shot6", "shot4", "shot1", "shot2", "shot5", "shot3"].map(A)).tiles).length; // shuffled, including the duplicate shot1
  assert.strictEqual(fwd, 93); assert.strictEqual(rev, 93); assert.strictEqual(all6, 93);
});

test("recap totals equal the hand count", () => {
  const R = G.recap(G.toPieces(G.merge(["shot2", "shot3", "shot4", "shot5", "shot6"].map(A)).tiles));
  const t = ROWS.flat();
  assert.strictEqual(R.total, 93);
  for (const [set, cls] of [["str", "STR"], ["agi", "AGI"], ["int", "INT"]]) assert.strictEqual(R.byClass[cls].total, t.filter((x) => x.set === set).length);
  assert.strictEqual(R.refined, t.filter((x) => x.diamonds > 0 && x.platinum === x.diamonds).length);
  assert.strictEqual(R.plain, t.filter((x) => x.diamonds > 0 && x.platinum === 0).length);
  assert.strictEqual(R.equipped, t.filter((x) => x.equipped).length);
  assert.strictEqual(R.spare, 1);
  for (const d of [0, 1, 2, 3]) assert.strictEqual(R.transc[d], t.filter((x) => x.diamonds === d).length, "transcendence " + d);
});

test("non-yellow tiles are skipped (synthetic: red/blue swapped copy of shot2, no real non-mythic sample exists)", () => {
  const img = loadImage(path.join(root, "test/fixtures/screens/shot2.jpg"));
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) { const r = d[i]; d[i] = d[i + 2]; d[i + 2] = r; }
  const a = G.analyze(m, { width: img.width, height: img.height, data: d });
  const read = a.rows.flatMap((r) => r.cols).filter((c) => !c.tile.ignored);
  assert.strictEqual(read.length, 0);
});

test("refined is all-or-none per tile: majority wins, no 'mixed' anywhere", () => {
  const P = [{ cls: "INT", set: "int", slot: "helmet", level: 1, diamonds: 3, refinedCount: 2, equipped: true }, { cls: "INT", set: "int", slot: "helmet", level: 1, diamonds: 3, refinedCount: 1, equipped: true },
    { cls: "INT", set: "int", slot: "helmet", level: 1, diamonds: 3, refinedCount: 3, equipped: true }, { cls: "INT", set: "int", slot: "helmet", level: 1, diamonds: 0, refinedCount: 0, equipped: true }];
  assert.deepStrictEqual(P.map(G.isRefined), [true, false, true, false]);
  const R = G.recap(P);
  assert.strictEqual(R.refined, 2); assert.strictEqual(R.plain, 1); assert.strictEqual(R.noDiamonds, 1);
  assert.ok(!("mixed" in R) && !("mixed" in R.byClass.INT) && G.isMixed === undefined);
  // every tile read from the real screenshots is all platinum or all gold
  for (const s of ["shot2", "shot3", "shot4", "shot5", "shot6"]) for (const r of A(s).rows) for (const c of r.cols) { const x = c.tile; if (x.ignored) continue; assert.ok(x.refinedCount === 0 || x.refinedCount === x.diamonds, s); }
});

test("only four slots, 12 sprites, sets are named STR / AGI / INT", () => {
  assert.deepStrictEqual(G.SLOTS, ["helmet", "armor", "boots", "weapon"]);
  assert.strictEqual(G.SPRITES.length, 12);
  assert.ok(!G.SPRITES.some((s) => /shield|orb/i.test(s.id)));
  assert.deepStrictEqual(Object.values(G.SETS).map((s) => s.name), ["STR (Strength)", "AGI (Agility)", "INT (Intelligence)"]);
});

test("refined per slot (overall and per class) equals the hand count", () => {
  const R = G.recap(G.toPieces(G.merge(["shot2", "shot3", "shot4", "shot5", "shot6"].map(A)).tiles));
  const t = ROWS.flat(), ref = (x) => x.diamonds > 0 && x.platinum * 2 > x.diamonds;
  for (const sl of G.SLOTS) {
    assert.strictEqual(R.slotStats[sl].total, t.filter((x) => x.slot === sl).length, sl + " total");
    assert.strictEqual(R.slotStats[sl].refined, t.filter((x) => x.slot === sl && ref(x)).length, sl + " refined");
    for (const [set, cls] of [["str", "STR"], ["agi", "AGI"], ["int", "INT"]]) {
      assert.strictEqual(R.byClass[cls].slotStats[sl].total, t.filter((x) => x.slot === sl && x.set === set).length, cls + sl);
      assert.strictEqual(R.byClass[cls].slotStats[sl].refined, t.filter((x) => x.slot === sl && x.set === set && ref(x)).length, cls + sl + " refined");
    }
  }
  assert.strictEqual(SLOT_SUM(R, "total"), 93); assert.strictEqual(SLOT_SUM(R, "refined"), R.refined);
  const sets = G.completeSets(G.toPieces(G.merge(["shot2", "shot3", "shot4", "shot5", "shot6"].map(A)).tiles));
  for (const c of ["STR", "AGI", "INT"]) assert.strictEqual(sets[c].complete, Math.min(...G.SLOTS.map((sl) => R.byClass[c].slotStats[sl].total)));
});
function SLOT_SUM(R, k) { return G.SLOTS.reduce((a, sl) => a + R.slotStats[sl][k], 0); }

test("advice walks the refined-set steps and names the short slot", () => {
  const pcs = (cls, slot, n) => Array.from({ length: n }, () => ({ cls, slot, diamonds: 3, refinedCount: 3, equipped: true }));
  const bag = [
    ...pcs("STR", "helmet", 1), ...pcs("STR", "armor", 2), ...pcs("STR", "boots", 2), ...pcs("STR", "weapon", 2),
    ...pcs("AGI", "helmet", 4), ...pcs("AGI", "armor", 3), ...pcs("AGI", "boots", 4), ...pcs("AGI", "weapon", 4),
    ...pcs("INT", "helmet", 5), ...pcs("INT", "armor", 6), ...pcs("INT", "boots", 5), ...pcs("INT", "weapon", 4),
  ];
  const A = G.advice(bag);
  assert.deepStrictEqual(Object.fromEntries(["STR", "AGI", "INT"].map((c) => [c, A.owned[c].complete])), { STR: 1, AGI: 3, INT: 4 });
  assert.strictEqual(A.current.step, 3);
  assert.strictEqual(A.chase.cls, "STR");
  assert.deepStrictEqual(A.chase.slots, ["helmet"]);
  assert.strictEqual(A.chase.short, 1);
  assert.strictEqual(A.finalRows.find((r) => r.cls === "STR").note, "short 3 + 1 Helmet");
  assert.strictEqual(A.finalRows.find((r) => r.cls === "INT").note, "short 5 + 1 Weapon");
  assert.strictEqual(A.finalRows.find((r) => r.cls === "AGI").note, "done");
  assert.ok(A.steps[0].met && A.steps[1].met && !A.steps[2].met && !A.steps[3].met);

  const none = G.advice([]);
  assert.strictEqual(none.current.step, 1);
  assert.strictEqual(none.chase.cls, "AGI");
  assert.strictEqual(none.chase.short, 3);
  assert.deepStrictEqual(none.chase.slots, ["helmet", "armor", "boots", "weapon"]);

  const both = G.advice([...pcs("AGI", "helmet", 3), ...pcs("AGI", "armor", 3), ...pcs("AGI", "boots", 3), ...pcs("AGI", "weapon", 3)]);
  assert.strictEqual(both.current.step, 2);
  assert.strictEqual(both.chase.cls, "INT");

  const done = [...pcs("STR", "helmet", 5), ...pcs("STR", "armor", 5), ...pcs("STR", "boots", 5), ...pcs("STR", "weapon", 5), ...pcs("AGI", "helmet", 3), ...pcs("AGI", "armor", 3), ...pcs("AGI", "boots", 3), ...pcs("AGI", "weapon", 3), ...pcs("INT", "helmet", 10), ...pcs("INT", "armor", 10), ...pcs("INT", "boots", 10), ...pcs("INT", "weapon", 10)];
  assert.strictEqual(G.advice(done).done, true);
});
