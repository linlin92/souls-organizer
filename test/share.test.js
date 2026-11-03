const test = require("node:test"), assert = require("node:assert");
const G = require("../src/gear.js"), S = require("../src/share.js");
const mk = (cls, slot, level, diamonds, refinedCount, equipped) => ({ cls, set: cls.toLowerCase(), slot, level, diamonds, refinedCount, equipped });
test("share model lists every piece, grouped by class and slot", () => {
  const P = [];
  for (let i = 0; i < 23; i++) P.push(mk("INT", "helmet", 200 - i, 3, i % 2 ? 3 : 0, i % 3 === 0));
  P.push(mk("STR", "boots", 0, 0, 0, false), mk("AGI", "weapon", 150, 2, 1, true));
  const m = S.model(P, G.recap(P));
  const tiles = m.classes.flatMap((c) => c.slots.flatMap((s) => s.tiles));
  assert.equal(tiles.length, P.length);
  assert.equal(m.total, P.length);
  assert.equal(m.classes.find((c) => c.cls === "INT").slots[0].tiles.length, 23);
  const agi = tiles.find((t) => t.sprite === "agi-weapon");
  assert.equal(agi.refined, true); // 1 icy diamond is refined +1, even when the other diamond stays gold
  assert.equal(agi.refinedCount, 1);
  assert.deepEqual(m.spriteIds.sort(), ["agi-weapon", "int-helmet", "str-boots"]);
});

test("share image collects gear sprites, class icons, diamonds, and tile crops", () => {
  const P = [mk("INT", "helmet", 200, 3, 1, true), mk("STR", "boots", 0, 0, 0, false)];
  P[0].thumb = "data:image/png;base64,iVBORw0KGgo=";
  const m = S.model(P, G.recap(P));
  const tile = m.classes.find((c) => c.cls === "INT").slots[0].tiles[0];
  assert.equal(tile.crop, P[0].thumb);
  assert.equal(m.classes.find((c) => c.cls === "STR").slots[0].tiles[0].crop, "");
  const srcs = S.assetSrcs(m, {
    spriteUrl: (id) => `icons/gear/${id}.png`,
    classUrl: (id) => `icons/class/${id}.png`,
    diamondUrl: (id) => `icons/diamonds/${id}.png`,
    crops: ["data:image/png;base64,extra"],
  });
  assert.deepEqual(srcs.slice().sort(), [
    "data:image/png;base64,extra",
    "data:image/png;base64,iVBORw0KGgo=",
    "icons/class/bow.png",
    "icons/class/hammer.png",
    "icons/class/staff.png",
    "icons/diamonds/normal.png",
    "icons/diamonds/refined.png",
    "icons/gear/int-helmet.png",
    "icons/gear/str-boots.png",
  ]);
});

test("share model carries refined per slot (overall and per class) and per-slot counts", () => {
  const P = [mk("STR", "helmet", 200, 3, 3, true), mk("STR", "helmet", 200, 3, 0, true), mk("AGI", "helmet", 100, 3, 3, true), mk("INT", "boots", 50, 2, 2, false)];
  const m = S.model(P, G.recap(P));
  const h = m.stats.slotStats.find((x) => x.slot === "helmet");
  assert.deepEqual(h.all, { total: 3, refined: 2 });
  assert.deepEqual(h.byClass, [{ total: 2, refined: 1 }, { total: 1, refined: 1 }, { total: 0, refined: 0 }]);
  assert.equal(m.classes.find((c) => c.cls === "STR").slots[0].refined, 1);
  assert.equal(m.classes.find((c) => c.cls === "STR").fullSets, 0);
  assert.ok(m.classes.flatMap((c) => c.slots.flatMap((s) => s.tiles)).every((t) => !("platinum" in t)));
});
