// SOULS Organizer: Equipment (gear) reader.
// Built on the Artifact Advisor's screenshot reader (src/vision.js, a copy): the grid finder, the digit reader for the level, the
// "E" badge reader and the resampling helpers are shared. Everything here is pure functions on {width,height,data(RGBA)} images,
// so the same code runs in the browser (canvas ImageData) and in Node (tests).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./vision.js"));
  else root.Gear = factory(root.Vision);
})(typeof self !== "undefined" ? self : this, function (V) {
  // ---------------------------------------------------------------- catalogue
  const CLASSES = {
    STR: { name: "Strength", icon: "hammer", set: "str" },
    AGI: { name: "Agility", icon: "bow", set: "agi" },
    INT: { name: "Intelligence", icon: "staff", set: "int" },
  };
  const CLASS_ORDER = ["STR", "AGI", "INT"];
  const SLOTS = ["helmet", "armor", "boots", "weapon"];
  const SLOT_NAME = { helmet: "Helmet", armor: "Armor", boots: "Boots", weapon: "Weapon" };
  // One set per class and the game has no set names, so a set is simply "STR", "AGI" or "INT" (Strength / Agility / Intelligence).
  // A full set = helmet + armor + boots + weapon of one class. These four are the only slots (no shield, no orb).
  const SETS = {
    str: { name: "STR (Strength)", cls: "STR" },
    agi: { name: "AGI (Agility)", cls: "AGI" },
    int: { name: "INT (Intelligence)", cls: "INT" },
  };
  const SPRITES = []; // [{id:'str-helmet', set:'str', slot:'helmet'}]
  for (const s of Object.keys(SETS)) for (const sl of SLOTS) SPRITES.push({ id: s + "-" + sl, set: s, slot: sl });

  // ---------------------------------------------------------------- geometry (fractions of the tile; tiles are normalised to ~161 px)
  const T = 161.46;
  const CLS = { x: 11, y: 11, scale: 0.97 }; // class icon, top left (px at 161)
  const SPR = { scale: 1.225, cx: 83, cy: 82 }; // sprites are drawn 1.225x, centred
  const GEM = { cx: 0.165, cy: [0.825, 0.633, 0.44], scale: 0.67 }; // diamonds stack up the left side from the bottom; 3 slots (the 4th place holds the class icon)
  const FLAG = { cls: 0.55, clsMargin: 0.15, spr: 0.5, sprMargin: 0.08, gem: 0.5, gemNo: 0.46, numConf: V.FLAG.numConf };
  const FLAG_TXT = {
    sprite: "Not sure which piece this is, please pick",
    cls: "Not sure of the class icon, please pick",
    mismatch: "Class icon and set do not match, please check",
    gem: "Diamond count unsure",
    gemColour: "Diamond colour unclear (platinum or gold?), please check",
    differs: "Screenshots disagree on this piece (probably taken at different times)",
  };

  // ---------------------------------------------------------------- template helpers
  // normalised tile image + rect (so every offset below is in px of a 161-px tile)
  function norm(img, rect) {
    const n = V.normTile(img, rect);
    return { img: n.img, rect: n.rect, scale: rect.w / T };
  }
  // zero-mean normalised correlation of a template (list of {x,y,c:[r,g,b]}) placed at (ox,oy) in the image
  function zncc(img, px, ox, oy) {
    const n = px.length;
    let sm0 = 0, sm1 = 0, sm2 = 0, tm0 = 0, tm1 = 0, tm2 = 0;
    const W = img.width, H = img.height, d = img.data;
    for (let k = 0; k < n; k++) {
      const p = px[k], x = ox + p.x, y = oy + p.y;
      if (x < 0 || y < 0 || x >= W || y >= H) return -1;
      const i = (y * W + x) * 4;
      sm0 += p.c[0]; sm1 += p.c[1]; sm2 += p.c[2]; tm0 += d[i]; tm1 += d[i + 1]; tm2 += d[i + 2];
    }
    sm0 /= n; sm1 /= n; sm2 /= n; tm0 /= n; tm1 /= n; tm2 /= n;
    let sab = 0, saa = 0, sbb = 0;
    for (let k = 0; k < n; k++) {
      const p = px[k], i = ((oy + p.y) * W + (ox + p.x)) * 4;
      const a0 = p.c[0] - sm0, a1 = p.c[1] - sm1, a2 = p.c[2] - sm2, b0 = d[i] - tm0, b1 = d[i + 1] - tm1, b2 = d[i + 2] - tm2;
      sab += a0 * b0 + a1 * b1 + a2 * b2; saa += a0 * a0 + a1 * a1 + a2 * a2; sbb += b0 * b0 + b1 * b1 + b2 * b2;
    }
    return sab / Math.sqrt(saa * sbb + 1e-9);
  }
  // best score over a +-r px search around (ox,oy), coarse then fine
  function bestAround(img, px, ox, oy, r) {
    let best = -2, bx = ox, by = oy;
    const step = r > 2 ? 2 : 1;
    for (let dy = -r; dy <= r; dy += step) for (let dx = -r; dx <= r; dx += step) { const s = zncc(img, px, ox + dx, oy + dy); if (s > best) { best = s; bx = ox + dx; by = oy + dy; } }
    if (step > 1) { const cx = bx, cy = by; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const s = zncc(img, px, cx + dx, cy + dy); if (s > best) { best = s; bx = cx + dx; by = cy + dy; } } }
    return { score: best, x: bx, y: by };
  }
  // area-average an RGBA image scaled by `s` -> {w,h,rgb,alpha} (alpha is the share of opaque source pixels)
  function scaled(ref, s) {
    const w = Math.max(1, Math.round(ref.width * s)), h = Math.max(1, Math.round(ref.height * s));
    const rgb = new Float32Array(w * h * 3), al = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = x / s, x1 = (x + 1) / s, y0 = y / s, y1 = (y + 1) / s;
      let r = 0, g = 0, b = 0, a = 0, wt = 0;
      for (let yy = Math.floor(y0); yy < Math.min(ref.height, Math.ceil(y1)); yy++) for (let xx = Math.floor(x0); xx < Math.min(ref.width, Math.ceil(x1)); xx++) {
        const i = (yy * ref.width + xx) * 4, aa = ref.data[i + 3] / 255;
        r += ref.data[i] * aa; g += ref.data[i + 1] * aa; b += ref.data[i + 2] * aa; a += aa; wt++;
      }
      const o = y * w + x;
      if (a > 0) { rgb[o * 3] = r / a; rgb[o * 3 + 1] = g / a; rgb[o * 3 + 2] = b / a; }
      al[o] = wt ? a / wt : 0;
    }
    return { w, h, rgb, al };
  }
  function opaquePixels(sc, ox, oy, keep, step) {
    const px = [];
    for (let y = 0; y < sc.h; y += step) for (let x = 0; x < sc.w; x += step) {
      const o = y * sc.w + x;
      if (sc.al[o] < 0.97) continue;
      const tx = ox + x, ty = oy + y;
      if (keep && !keep(tx, ty)) continue;
      px.push({ x: tx, y: ty, c: [sc.rgb[o * 3], sc.rgb[o * 3 + 1], sc.rgb[o * 3 + 2]] });
    }
    return px;
  }

  // ---------------------------------------------------------------- matcher
  // refs: { sprites: {id: image}, classes: {hammer,bow,staff: image}, diamonds: {normal, refined: image}, digits: templates }
  function buildMatcher(refs) {
    // parts of a tile that sit over the sprite and must not take part in the sprite match: class icon, level text, the diamond strip, the E badge
    const occluded = (x, y) => (x < 58 && y < 56) || (y < 48) || (x < 48 && y > 56) || (x > 112 && y > 108);
    const sprites = [];
    for (const sp of SPRITES) {
      const img = refs.sprites[sp.id];
      if (!img) continue;
      const sc = scaled(img, SPR.scale);
      const ox = Math.round(SPR.cx - sc.w / 2), oy = Math.round(SPR.cy - sc.h / 2);
      sprites.push(Object.assign({}, sp, { px: opaquePixels(sc, ox, oy, (x, y) => !occluded(x, y), 3) }));
    }
    const classes = [];
    for (const k of CLASS_ORDER) {
      const sc = scaled(refs.classes[CLASSES[k].icon], CLS.scale);
      classes.push({ cls: k, px: opaquePixels(sc, 0, 0, null, 1), w: sc.w, h: sc.h });
    }
    const gem = {};
    for (const [k, img] of Object.entries(refs.diamonds)) { const sc = scaled(img, GEM.scale); gem[k] = { px: opaquePixels(sc, 0, 0, null, 1), w: sc.w, h: sc.h }; }
    return { sprites, classes, gem };
  }

  // ---------------------------------------------------------------- tile fields
  function matchSprite(m, img) {
    const out = [];
    for (const s of m.sprites) { const r = bestAround(img, s.px, 0, 0, 4); out.push({ id: s.id, set: s.set, slot: s.slot, score: r.score }); }
    out.sort((a, b) => b.score - a.score);
    return out;
  }
  function matchClass(m, img) {
    const out = m.classes.map((c) => ({ cls: c.cls, score: bestAround(img, c.px, CLS.x, CLS.y, 4).score }));
    out.sort((a, b) => b.score - a.score);
    return out;
  }
  const isPale = (r, g, b) => b >= 150 && b >= r - 6 && g >= r - 6; // refined diamond: pale blue-white
  const isGold = (r, g, b) => r >= 150 && g / r >= 0.94 && b / r >= 0.28 && b / r <= 0.66; // normal diamond: bright yellow face
  // -> { n, refined, kinds:[...bottom-up], scores:[...], unsure }
  function readDiamonds(m, img) {
    const scores = [], kinds = [];
    const DN = 64;
    for (let k = 0; k < 3; k++) {
      let best = -2, bk = "normal", bpos = null;
      for (const name of Object.keys(m.gem)) {
        const g = m.gem[name];
        const ox = Math.round(GEM.cx * T - g.w / 2), oy = Math.round(GEM.cy[k] * T - g.h / 2);
        const r = bestAround(img, g.px, ox, oy, 3);
        if (r.score > best) { best = r.score; bk = name; bpos = r; }
      }
      scores.push(best);
      // colour of the gem face at the best position (share of pale vs gold pixels over the rhombus core)
      let pale = 0, gold = 0, n = 0;
      const g = m.gem.normal;
      if (bpos) for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        const dx = Math.abs(x - g.w / 2) / (g.w / 2), dy = Math.abs(y - g.h / 2) / (g.h / 2);
        if (dx + dy > 0.75) continue;
        const px = bpos.x + x - Math.round((bpos.x - Math.round(GEM.cx * T - g.w / 2))) + Math.round((bpos.x - Math.round(GEM.cx * T - g.w / 2)));
        const X = bpos.x + x, Y = bpos.y + y;
        if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) continue;
        const i = (Y * img.width + X) * 4, r = img.data[i], gg = img.data[i + 1], b = img.data[i + 2];
        n++; if (isPale(r, gg, b)) pale++; else if (isGold(r, gg, b)) gold++;
      }
      kinds.push(n && pale > gold ? "refined" : "normal");
    }
    // gems stack from the bottom: count the leading slots that are clearly gems
    let cnt = 0;
    while (cnt < 3 && scores[cnt] >= FLAG.gem) cnt++;
    const unsure = cnt < 3 && scores[cnt] > FLAG.gemNo; // the first non-gem slot is neither clearly empty nor clearly a gem
    const refined = kinds.slice(0, cnt).filter((k) => k === "refined").length;
    return { n: cnt, refined, kinds: kinds.slice(0, cnt), scores, unsure };
  }
  const mythicLike = (img) => V.rarityOf(img, { x: 0, y: 0, w: img.width, h: img.height });

  // ---------------------------------------------------------------- one tile
  function readTile(m, srcImg, srcRect, row) {
    const tile = { flags: [], ignored: false };
    const partial = row.kind !== "full";
    if (partial) { tile.ignored = true; tile.cutOff = true; return tile; }
    if (row.kind === "bottom") { /* never read */ }
    const { img, rect } = norm(srcImg, srcRect);
    const ra = V.rarityOf(srcImg, srcRect);
    if (ra.rarity !== "mythic") { tile.ignored = true; tile.notMythic = true; return tile; }
    if (V.looksBlurred(srcImg, srcRect, null)) { tile.ignored = true; tile.blurred = true; return tile; }
    // tile as its own image so the template offsets are plain pixel coordinates
    const t = cropTile(img, rect);
    const sp = matchSprite(m, t), cl = matchClass(m, t);
    tile.set = sp[0].set; tile.slot = sp[0].slot; tile.spriteScore = sp[0].score; tile.spriteMargin = sp[0].score - sp[1].score;
    tile.alts = sp.slice(0, 3).map((x) => ({ id: x.id, score: +x.score.toFixed(3) }));
    tile.cls = cl[0].cls; tile.clsScore = cl[0].score; tile.clsMargin = cl[0].score - cl[1].score;
    const eq = V.isEquipped(t, { x: 0, y: 0, w: t.width, h: t.height });
    tile.equipped = eq;
    const d = readDiamonds(m, t);
    // A tile is refined or not as a whole (the game never mixes platinum and gold on one tile), so the colour is decided by majority.
    // A split read (some platinum, some gold) is a misread: majority wins, and the tile is flagged. An exact tie counts as not refined.
    const split = d.refined > 0 && d.refined < d.n;
    tile.diamonds = d.n; tile.gemKinds = d.kinds; tile.gemScores = d.scores.map((s) => +s.toFixed(2));
    tile.refinedCount = d.refined * 2 > d.n ? d.n : 0;
    tile.refined = tile.refinedCount > 0;
    tile.gemSplit = split;
    tile.gemUnsure = d.unsure;
    tile.flags = flagsOf(tile);
    return tile;
  }
  function flagsOf(t) {
    const f = [];
    if (t.spriteScore < FLAG.spr || t.spriteMargin < FLAG.sprMargin) f.push(FLAG_TXT.sprite);
    if (t.clsScore < FLAG.cls || t.clsMargin < FLAG.clsMargin) f.push(FLAG_TXT.cls);
    else if (t.set && SETS[t.set] && SETS[t.set].cls !== t.cls && !(t.spriteScore < FLAG.spr || t.spriteMargin < FLAG.sprMargin)) f.push(FLAG_TXT.mismatch);
    if (t.gemUnsure) f.push(FLAG_TXT.gem);
    if (t.gemSplit) f.push(FLAG_TXT.gemColour);
    return f;
  }
  function cropTile(img, rect) {
    const w = Math.round(rect.w), h = Math.round(rect.h), data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.round(rect.x) + x, sy = Math.round(rect.y) + y, o = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) { data[o + 3] = 255; continue; }
      const i = (sy * img.width + sx) * 4;
      data[o] = img.data[i]; data[o + 1] = img.data[i + 1]; data[o + 2] = img.data[i + 2]; data[o + 3] = 255;
    }
    return { width: w, height: h, data };
  }

  // ---------------------------------------------------------------- whole screenshot
  function analyze(m, img) {
    const g = V.findGrid(img);
    if (!g) return { rows: [], height: img.height, tileH: 0, error: "no grid" };
    const gr = V.gridRows(g);
    const W = img.width, tileH = g.tile;
    const rows = gr.filter((r) => r.visBottom - r.visTop >= 0.3 * tileH).map((row) => {
      const cols = [];
      for (let c = 0; c < 5; c++) {
        const rect = V.tileRect(W, row, c);
        cols.push({ col: c, rect, thumb: V.thumb(img, rect, row, W), tile: readTile(m, img, rect, row) });
      }
      return { kind: row.kind, top: row.top, bottom: row.bottom, visTop: row.visTop, visBottom: row.visBottom, cols };
    });
    return { rows, height: img.height, tileH, error: null };
  }

  // ---------------------------------------------------------------- merge (row alignment across overlapping screenshots)
  const SAME_ROW = 0.68, SAME_WORST = 0.45, PART_ROW = 0.45, PART_WORST = 0.30;
  // Consecutive screenshots overlap by whole rows, so rows of two shots line up at ONE constant row shift. For every pair of shots, the shift
  // whose overlap matches best (and contradicts nowhere) is taken; only rows on that shift are merged. A row that merely looks like another
  // row (two items of the same kind) can therefore never be merged by accident, and nothing is double counted.
  // Two FULL rows are the same row when their readings agree tile by tile (an unsure tile counts as a wildcard) and they also look alike.
  // A cut-off row is never read, so it is only compared by looks, loosely, and it can never veto a shift on its own.
  const sig = (t) => [t.set, t.slot, t.diamonds, t.refinedCount, t.equipped ? 1 : 0].join("|");
  function rowRel(ra, rb) {
    const th = V.rowSimilarity(ra, rb);
    if (th.d === -1) return { rel: "none", d: -1 };
    if (ra.kind === "full" && rb.kind === "full") {
      let cmp = 0, diff = 0;
      for (let c = 0; c < 5; c++) {
        const x = ra.cols[c].tile, y = rb.cols[c].tile;
        if (x.ignored || y.ignored || x.flags.length || y.flags.length) continue;
        cmp++; if (sig(x) !== sig(y)) diff++;
      }
      if (cmp >= 3 ? diff === 0 && th.d > SAME_ROW : th.d > SAME_ROW && th.worst > SAME_WORST) return { rel: "same", d: th.d };
      return { rel: "diff", d: th.d };
    }
    return th.d > PART_ROW && th.worst > PART_WORST ? { rel: "same", d: th.d } : { rel: "none", d: th.d };
  }
  function merge(analyses) {
    const nodes = [];
    analyses.forEach((an, si) => an.rows.forEach((row, ri) => nodes.push({ si, ri, row, id: nodes.length })));
    const parent = nodes.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const shotsOf = nodes.map((n) => new Set([n.si]));
    const log = [], pairs = [];
    for (let a = 0; a < analyses.length; a++) for (let b = a + 1; b < analyses.length; b++) {
      const A = analyses[a].rows, B = analyses[b].rows;
      const rel = A.map((ra) => B.map((rb) => rowRel(ra, rb)));
      let best = null;
      for (let s = -(A.length - 1); s <= B.length - 1; s++) { // row i of A == row i+s of B
        let full = 0, part = 0, bad = 0, dsum = 0;
        for (let i = 0; i < A.length; i++) {
          const j = i + s;
          if (j < 0 || j >= B.length) continue;
          const r = rel[i][j];
          if (r.rel === "same") { (A[i].kind === "full" && B[j].kind === "full" ? full++ : part++); dsum += r.d; } else if (r.rel === "diff") bad++;
        }
        const score = full * 10 + part;
        if (score > 0 && bad === 0 && (!best || score > best.score || (score === best.score && dsum > best.dsum))) best = { s, score, dsum };
      }
      if (!best) continue;
      for (let i = 0; i < A.length; i++) {
        const j = i + best.s;
        if (j < 0 || j >= B.length) continue;
        const r = rel[i][j];
        if (r.rel === "same") {
          const ia = nodes.findIndex((n) => n.si === a && n.ri === i), ib = nodes.findIndex((n) => n.si === b && n.ri === j);
          pairs.push({ i: ia, j: ib, d: r.d, loose: !(A[i].kind === "full" && B[j].kind === "full") });
          log.push({ a: [a, i], b: [b, j], d: +r.d.toFixed(2), shift: best.s });
        }
      }
    }
    pairs.sort((p, q) => q.d - p.d);
    const hasFull = nodes.map((n) => n.row.kind === "full");
    for (const { i, j, loose } of pairs) {
      const a = find(i), b = find(j);
      if (a === b || [...shotsOf[b]].some((s) => shotsOf[a].has(s))) continue;
      if (loose && hasFull[a] && hasFull[b]) continue; // a by-looks match with a cut-off row may attach that row to a group, but never joins two groups of read rows
      parent[b] = a; hasFull[a] = hasFull[a] || hasFull[b]; shotsOf[b].forEach((s) => shotsOf[a].add(s));
    }
    const groups = new Map();
    nodes.forEach((n) => { const k = find(n.id); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
    const out = [];
    let duplicates = 0, partialOnly = 0;
    const nFlags = (m) => m.row.cols.reduce((a, c) => a + (c.tile && !c.tile.ignored ? c.tile.flags.length : 0), 0);
    const ordered = [...groups.values()].map((mm) => ({ mm, pos: Math.min(...mm.map((n) => n.si * 1000 + n.ri)) })).sort((x, y) => x.pos - y.pos);
    for (const { mm: members } of ordered) {
      members.sort((p, q) => (q.row.kind === "full") - (p.row.kind === "full") || nFlags(p) - nFlags(q) || Math.round(q.row.visBottom - q.row.visTop) - Math.round(p.row.visBottom - p.row.visTop));
      const rep = members[0];
      duplicates += members.length - 1;
      if (rep.row.kind !== "full") { partialOnly++; out.push({ partialRow: true, src: { shot: rep.si + 1, row: rep.ri, seenIn: members.map((x) => x.si + 1) } }); continue; }
      for (let c = 0; c < 5; c++) {
        const tile = Object.assign({}, rep.row.cols[c].tile);
        tile.flags = tile.flags.slice();
        tile.src = { shot: rep.si + 1, row: rep.ri, col: c, seenIn: members.map((x) => x.si + 1) };
        if (!tile.ignored) {
          const views = members.filter((x) => x.row.kind === "full" && !x.row.cols[c].tile.ignored).map((x) => x.row.cols[c].tile);
          if (views.length > 1) consensus(tile, views);
        }
        out.push(tile);
      }
    }
    return { tiles: out, duplicatesDropped: duplicates, partialOnly, rowMatches: log };
  }
  // an unsure field is replaced by a clean read of the same tile from another full view; two sure but different reads are flagged
  function consensus(tile, views) {
    const clean = (v) => !v.flags.length;
    const other = views.find((v) => v !== tile && clean(v));
    if (tile.flags.length && other) {
      Object.assign(tile, { set: other.set, slot: other.slot, spriteScore: other.spriteScore, spriteMargin: other.spriteMargin, cls: other.cls, clsScore: other.clsScore, clsMargin: other.clsMargin,
        diamonds: other.diamonds, refinedCount: other.refinedCount, refined: other.refined, gemSplit: other.gemSplit, gemKinds: other.gemKinds, gemUnsure: false, equipped: other.equipped });
      tile.flags = [];
    }
    const sure = views.filter(clean);
    const sig = (v) => [v.set, v.slot, v.cls, v.diamonds, v.refinedCount, v.equipped].join("|");
    if (new Set(sure.map(sig)).size > 1 && !tile.flags.includes(FLAG_TXT.differs)) tile.flags.push(FLAG_TXT.differs);
  }

  // ---------------------------------------------------------------- pieces and the recap
  // merged tiles -> list of pieces {id,cls,set,slot,diamonds,refined,equipped,flags}
  function toPieces(tiles) {
    let id = 0;
    return tiles.filter((t) => !t.ignored && !t.partialRow && t.slot).map((t) => ({
      id: ++id, cls: t.cls, set: t.set, slot: t.slot, diamonds: t.diamonds || 0, refinedCount: t.refinedCount || 0, // already all-or-none (see readTile)
      equipped: !!t.equipped, flags: (t.flags || []).slice(), src: t.src,
    }));
  }
  // refined is a whole-tile property: platinum on the majority of the diamonds (a tile never really mixes them)
  const isRefined = (p) => p.diamonds > 0 && p.refinedCount * 2 > p.diamonds;
  function recap(pieces) {
    const newC = () => ({ total: 0, refined: 0, plain: 0, equipped: 0, spare: 0, slots: {}, slotStats: Object.fromEntries(SLOTS.map((s) => [s, { total: 0, refined: 0 }])), sets: {} });
    const R = { total: pieces.length, byClass: {}, refined: 0, plain: 0, noDiamonds: 0, transc: { 0: 0, 1: 0, 2: 0, 3: 0 }, equipped: 0, spare: 0,
      slotStats: Object.fromEntries(SLOTS.map((s) => [s, { total: 0, refined: 0 }])) };
    for (const c of CLASS_ORDER) R.byClass[c] = newC();
    for (const p of pieces) {
      const C = R.byClass[p.cls] || (R.byClass[p.cls] = newC());
      C.total++;
      const ref = isRefined(p);
      if (p.diamonds === 0) R.noDiamonds++; else if (ref) { R.refined++; C.refined++; } else { R.plain++; C.plain++; }
      if (R.slotStats[p.slot]) { R.slotStats[p.slot].total++; C.slotStats[p.slot].total++; if (ref) { R.slotStats[p.slot].refined++; C.slotStats[p.slot].refined++; } }
      R.transc[Math.min(3, p.diamonds)]++;
      if (p.equipped) { R.equipped++; C.equipped++; } else { R.spare++; C.spare++; }
      (C.slots[p.slot] = C.slots[p.slot] || []).push(p);
      const S = (C.sets[p.set] = C.sets[p.set] || { n: 0, slots: {} });
      S.n++; (S.slots[p.slot] = S.slots[p.slot] || []).push(p);
    }
    for (const c of Object.keys(R.byClass)) for (const sl of Object.keys(R.byClass[c].slots)) R.byClass[c].slots[sl].sort(pieceOrder);
    return R;
  }
  // strongest first: diamonds, then refined, then equipped
  function pieceOrder(a, b) { return b.diamonds - a.diamonds || b.refinedCount - a.refinedCount || (b.equipped ? 1 : 0) - (a.equipped ? 1 : 0); }
  // Complete sets: for each class, how many full sets (helmet + armor + boots + weapon) can be made from the pieces you own
  function completeSets(pieces) {
    const out = {};
    for (const c of CLASS_ORDER) {
      const n = SLOTS.map((sl) => pieces.filter((p) => p.cls === c && p.slot === sl).length);
      out[c] = { complete: Math.min(...n), perSlot: Object.fromEntries(SLOTS.map((sl, i) => [sl, n[i]])) };
    }
    return out;
  }

  // A refined set is one Helmet, Armor, Boots, and Weapon of that class, each refined.
  // The count is the shortest refined slot, because that slot is what stops the next set.
  function refinedSets(pieces) {
    const out = {};
    for (const c of CLASS_ORDER) {
      const perSlot = {};
      for (const sl of SLOTS) perSlot[sl] = pieces.filter((p) => p.cls === c && p.slot === sl && isRefined(p)).length;
      out[c] = { complete: Math.min(...SLOTS.map((sl) => perSlot[sl])), perSlot };
    }
    return out;
  }
  // Steps are in order. A later step is not the aim until every earlier step is met.
  const ADVICE_STEPS = [
    { aim: "AGI to 3 refined sets", needs: [["AGI", 3]] },
    { aim: "INT and STR to at least 1 refined set each", needs: [["INT", 1], ["STR", 1]] },
    { aim: "INT to 4 refined sets, and STR to 2", needs: [["INT", 4], ["STR", 2]] },
    { aim: "the final goal: STR 5, INT 10, and AGI 3 refined sets", needs: [["STR", 5], ["INT", 10], ["AGI", 3]] },
  ];
  const slotList = (slots) => {
    const names = slots.map((sl) => SLOT_NAME[sl]);
    if (names.length <= 1) return names[0] || "";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  };
  // "short 3 + 1 Helmet": the other slots already support 2 sets, so 3 full sets remain to a goal of 5, plus the 1 Helmet that is behind those 2.
  function gapNote(perSlot, need) {
    const floor = Math.min(...SLOTS.map((sl) => perSlot[sl]));
    if (floor >= need) return "done";
    const above = SLOTS.map((sl) => perSlot[sl]).filter((n) => n > floor);
    const plateau = above.length ? Math.min(need, Math.min(...above)) : floor;
    const setsLeft = need - plateau;
    const extra = SLOTS.filter((sl) => perSlot[sl] < plateau).map((sl) => `${plateau - perSlot[sl]} ${SLOT_NAME[sl]}`).join(", ");
    if (setsLeft && extra) return `short ${setsLeft} + ${extra}`;
    if (setsLeft) return `short ${setsLeft}`;
    return `short ${extra}`;
  }
  function advice(pieces) {
    const owned = refinedSets(pieces);
    const rowFor = (cls, need) => {
      const have = owned[cls].complete, perSlot = owned[cls].perSlot;
      const blocking = SLOTS.filter((sl) => perSlot[sl] < need).sort((a, b) => perSlot[a] - perSlot[b] || SLOTS.indexOf(a) - SLOTS.indexOf(b));
      return { cls, need, have, short: Math.max(0, need - have), met: have >= need, perSlot, blocking, note: gapNote(perSlot, need) };
    };
    const steps = ADVICE_STEPS.map((st, i) => {
      const rows = st.needs.map(([cls, need]) => rowFor(cls, need));
      return { step: i + 1, aim: st.aim, rows, met: rows.every((r) => r.met) };
    });
    const current = steps.find((s) => !s.met) || null;
    const finalRows = steps[steps.length - 1].rows;
    let chase = null;
    if (current) {
      const open = current.rows.filter((r) => !r.met);
      const pick = open.slice().sort((a, b) => b.short - a.short)[0];
      const floor = Math.min(...pick.blocking.map((sl) => pick.perSlot[sl]));
      const slots = pick.blocking.filter((sl) => pick.perSlot[sl] === floor);
      const behind = pick.blocking.filter((sl) => pick.perSlot[sl] > floor);
      const covered = SLOTS.filter((sl) => pick.perSlot[sl] >= pick.need);
      chase = {
        cls: pick.cls, have: pick.have, need: pick.need, short: pick.short, perSlot: pick.perSlot,
        slots, slotText: slotList(slots), slotHave: floor,
        behind, behindText: slotList(behind), covered, coveredText: slotList(covered),
      };
    }
    return { owned, steps, current, finalRows, chase, done: !current };
  }

  return { CLASSES, CLASS_ORDER, SLOTS, SLOT_NAME, SETS, SPRITES, FLAG, FLAG_TXT, buildMatcher, readTile, analyze, merge, toPieces, recap, completeSets, refinedSets, advice, isRefined, pieceOrder, matchSprite, matchClass, readDiamonds, cropTile, norm };
});
