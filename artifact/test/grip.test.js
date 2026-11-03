// Grip of Hell "should be 6, not 4" (player P113, 2026-11-03). Three phone screenshots of one inventory, taken B (top), C, A (bottom).
// In shot C the first Grip of Hell has THREE diamonds (no number), the second ONE: 4 + 2 = 6 copies. The top gem scored inner 0.69 but ring 0.49
// (a sparkle sits on the tile's left edge there), just over the 0.45 limit, so the stack was read as 2 diamonds and flagged "diamond count unsure".
// The icons are committed as base64 text (the Pages workflow decodes them), so this test decodes them itself.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const { PNG } = require("pngjs");
const root = path.join(__dirname, "..");
const V = require(path.join(root, "src/vision.js")), A = require(path.join(root, "src/advisor.js"));
const artifacts = require(path.join(root, "data/artifacts.json")), special = require(path.join(root, "data/special.json"));
const templates = require(path.join(root, "data/digits.json"));
const readPng = (f) => { let b = fs.readFileSync(f); if (b[0] !== 0x89) b = Buffer.from(b.toString("utf8").trim(), "base64"); const p = PNG.sync.read(b); return { width: p.width, height: p.height, data: p.data }; };
const load = (d) => [...artifacts, ...special].filter((a) => fs.existsSync(path.join(root, d, a.id + ".png"))).map((a) => ({ id: a.id, name: a.name, rarity: a.rarity, image: readPng(path.join(root, d, a.id + ".png")) }));
const matcher = V.buildMatcher(load("icons"), load("icons-old").filter((i) => !special.some((s) => s.id === i.id)));
const shot = (n) => V.analyze(readPng(path.join(__dirname, `fixtures/grip/shot${n}.png`)), { matcher, templates });

test("Grip of Hell (shot C): the 3-diamond tile reads 3 and the 1-diamond tile reads 1, neither is flagged", () => {
  const row = shot("C").rows.filter((r) => r.kind === "full")[2];
  const [a, b] = [row.cols[1].tile, row.cols[2].tile];
  assert.deepStrictEqual([a.name, b.name], ["Grip of Hell", "Grip of Hell"]);
  assert.deepStrictEqual([a.diamonds, b.diamonds], [3, 1]);
  assert.deepStrictEqual([a.flags, b.flags], [[], []]);
  assert.ok(!a.count && !b.count);
});

test("the 3 shots together: Grip of Hell x6 and every other total as hand-counted from the screenshots; 53 artifacts, nothing needs a check", () => {
  const m = V.merge(["B", "C", "A"].map(shot));
  const tiles = m.tiles.filter((t) => !t.ignored);
  assert.strictEqual(tiles.length, 53);
  assert.deepStrictEqual(tiles.filter((t) => t.flags.length).map((t) => t.name), []);
  const T = A.totals(tiles, artifacts, V.FADED_ID);
  const got = Object.fromEntries(T.legendary.map((r) => [r.name, r.total]));
  assert.deepStrictEqual(got, {
    "Demonic Ring": 12, "Executioner's Axe": 11, "Crystal of Eternal Healing": 10, "Earrings of Tranquility": 10, "Essence of Burning Flame": 9, "Rider's Horn": 9,
    "Dragon Hide Shield": 8, "Book of Forbidden Knowledge": 7, "Emblem of Continuance": 7, "Guardian of the Sage": 7, "Relentless Knight's Helmet": 7,
    "Blacksmith's Hammer": 6, "Fortune Coin": 6, "Grip of Hell": 6, "Mysterious Patterned Leaf": 6, "Shield of the Guardian": 6, "Soul Sand": 6,
    "Key of Dawn": 5, "Madness Talisman": 5, "Spear of the Monster Hunter": 5, "Crown of Fire": 4, "Sword of the Monster Hunter": 4, "Tome of Regeneration": 3,
    "Oath of the Past": 2, "Staff of Infinite Vitality": 2, "Ancient Inscription Tablet": 1, "Oath of Sacrifice": 1, "Steel Beast's Bone": 1,
  });
});
