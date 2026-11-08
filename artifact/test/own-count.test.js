// The export heading used to count mythic names. The on-page recap adds copies.
// Death ×3, Demonic Beast Fang ×2 and Evidence of Miracle ×2 are 24 names and 28 copies.
// A 29th accepted copy must stay in the same total. The original screenshots were not available here.
const test = require("node:test");
const assert = require("node:assert");
const Share = require("../src/share.js");
const Advisor = require("../src/advisor.js");

const NAMES = [
  ["Death", 3], ["Demonic Beast Fang", 2], ["Evidence of Miracle", 2],
  ["Turbulence Lamp of Wrath", 1], ["Abyssal Jewel", 1], ["Codex of Flame Rites Vol. 1: Fervor", 1],
  ["Cursed Chalice", 1], ["Eternal Pain", 1], ["Giant's Boomerang", 1], ["Gloves of Resonance", 1],
  ["Golden Ornament Cloak", 1], ["Harmony", 1], ["Helmet of Silence", 1], ["Mace of Judgment", 1],
  ["Mask of Madness", 1], ["Nightmare", 1], ["Noble's Pocket Watch", 1], ["Paladin Cuirass", 1],
  ["Sacred Emblem", 1], ["Scale of Balance", 1], ["Serpent's Emblem", 1], ["Shield of Earth", 1],
  ["Steel Bishop", 1], ["Tome of the Sun", 1],
];

function modelFrom(pairs, legs) {
  const tiles = pairs.map(([id, n]) => ({ id, rarity: "mythic", count: n }));
  const totals = Advisor.totals(tiles, [], "faded-artifact");
  const state = {
    mythics: Object.fromEntries(totals.mythic.map((r) => [r.id, r.total])),
    legendaryCopies: Object.fromEntries(legs || []),
  };
  return { totals, model: Share.model({ craftable: [] }, state, { artifacts: [] }) };
}

test("24 named Mythics with the stated multipliers are 28 copies, and the heading says both", () => {
  assert.strictEqual(NAMES.length, 24);
  const { totals, model } = modelFrom(NAMES);
  const reader = totals.mythic.reduce((s, r) => s + r.total, 0);
  assert.strictEqual(reader, 28);
  assert.strictEqual(model.owned.mythicTypes, 24);
  assert.strictEqual(model.owned.mythicCopies, reader);
  assert.strictEqual(model.owned.mythics.reduce((s, r) => s + r.n, 0), reader);
  assert.strictEqual(Share.countLabel("MYTHICS", model.owned.mythicCopies, model.owned.mythicTypes), "MYTHICS (28 copies, 24 types)");
});

test("a 29th accepted copy is kept in the export total and still listed on its chip", () => {
  const pairs = NAMES.map(([id, n]) => [id, id === "Death" ? n + 1 : n]);
  const { totals, model } = modelFrom(pairs);
  const reader = totals.mythic.reduce((s, r) => s + r.total, 0);
  assert.strictEqual(reader, 29);
  assert.strictEqual(model.owned.mythicTypes, 24);
  assert.strictEqual(model.owned.mythicCopies, 29);
  assert.strictEqual(model.owned.mythics.find((r) => r.name === "Death").n, 4);
  assert.strictEqual(Share.countLabel("MYTHICS", 29, 24), "MYTHICS (29 copies, 24 types)");
});

test("the legendary heading counts copies, not names, and drops the old COPIES suffix", () => {
  const { model } = modelFrom([["Death", 1]], [["Grip of Hell", 6], ["Rider's Horn", 12]]);
  assert.strictEqual(model.owned.legendaryTypes, 2);
  assert.strictEqual(model.owned.legendaryCopies, 18);
  assert.strictEqual(Share.countLabel("LEGENDARIES", 18, 2), "LEGENDARIES (18 copies, 2 types)");
  assert.strictEqual(Share.countLabel("MYTHICS", 1, 1), "MYTHICS (1)");
});
