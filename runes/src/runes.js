// Rune inventory reader. Only Legendary (red frame) and Legendary with a Divine (gold frame) are kept.
// Pure functions on {width,height,data(RGBA)} so the same code runs in the browser and in Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Runes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const RUNES = [
    { id: "penetration", name: "Rune of Penetration" },
    { id: "dodging", name: "Rune of Dodging" },
    { id: "accuracy", name: "Rune of Accuracy" },
    { id: "resistance", name: "Rune of Resistance" },
    { id: "steel", name: "Rune of Steel" },
    { id: "peace", name: "Rune of Peace" },
    { id: "onslaught", name: "Rune of Onslaught" },
    { id: "defense", name: "Rune of Defense" },
    { id: "life", name: "Rune of Life" },
    { id: "fatality", name: "Rune of Fatality" },
    { id: "protection", name: "Rune of Protection" },
    { id: "iron-wall", name: "Rune of the Iron Wall" },
  ];
  const DIVINES = [
    { id: "grasp", name: "Grim Reaper's Grasp", short: "Grasp" },
    { id: "mod", name: "Might of Desperation", short: "MoD" },
    { id: "pot", name: "Potential", short: "Pot" },
    { id: "reincarnation", name: "Reincarnation", short: "Reincarnation" },
    { id: "survival", name: "Survival Will", short: "Survival" },
    { id: "regen", name: "Regeneration of Life", short: "Regen" },
  ];

  function hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max ? d / max : 0, max];
  }
  function px(img, x, y) {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
  }
  // Area-average resample into an n x n RGBA float array.
  function resample(img, x0, y0, w, h, n) {
    const out = new Float32Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const xa = x0 + (w * i) / n, xb = x0 + (w * (i + 1)) / n;
      const ya = y0 + (h * j) / n, yb = y0 + (h * (j + 1)) / n;
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let y = Math.max(0, Math.floor(ya)); y < Math.min(img.height, Math.ceil(yb)); y++) {
        for (let x = Math.max(0, Math.floor(xa)); x < Math.min(img.width, Math.ceil(xb)); x++) {
          const p = px(img, x, y); r += p[0]; g += p[1]; b += p[2]; a += p[3]; c++;
        }
      }
      const o = (j * n + i) * 4;
      if (c) { out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c; out[o + 3] = a / c; }
    }
    return out;
  }
  function isFrame(r, g, b) {
    const [h, s, v] = hsv(r, g, b);
    if (v < 0.4 || s < 0.35) return 0;
    if (h >= 22 && h <= 58) return 1; // gold: Legendary with a Divine
    if (h < 16 || h > 345) return 2; // red: Legendary
    return 0;
  }
  // Sparkles are pale star glints on the glow. The gold or red background, and the glyph, are darker or more saturated.
  function isSparkle(r, g, b) {
    const [, s, v] = hsv(r, g, b);
    if (v >= 0.9 && s < 0.5) return true;
    return Math.min(r, g, b) > 168 && v > 0.82;
  }
  function bands(prof, min, minLen) {
    const out = [];
    let s = -1;
    for (let i = 0; i <= prof.length; i++) {
      const on = i < prof.length && prof[i] >= min;
      if (on && s < 0) s = i;
      if (!on && s >= 0) { if (i - s >= minLen) out.push([s, i]); s = -1; }
    }
    return out;
  }
  // A phone screenshot has gold down the edge of the screen, outside the inventory. Count tiles inside the panel only.
  function panelSpan(img) {
    const W = img.width, H = img.height, D = img.data;
    const col = new Float32Array(W);
    const step = H > 900 ? 2 : 1;
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (isFrame(D[i], D[i + 1], D[i + 2])) col[x]++;
    }
    let xs = bands(col, Math.max(8, (H / step) * 0.012), Math.max(6, Math.round(W * 0.01)));
    xs = xs.filter((b) => b[1] - b[0] >= W * 0.045);
    // A phone screenshot draws a thin gold line on the screen edge, outside the inventory.
    // That strip is narrower than a tile. Leaving it in keeps every row "on" and the real tiles are missed.
    const widest = xs.reduce((m, b) => Math.max(m, b[1] - b[0]), 0);
    xs = xs.filter((b) => {
      const w = b[1] - b[0];
      const touches = b[0] <= 4 || b[1] >= W - 4;
      return !(touches && w < W * 0.12 && w < widest * 0.45);
    });
    if (xs.length < 1) return [0, W];
    const groups = [];
    let g = [xs[0]];
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i][0] - g[g.length - 1][1];
      const wide = Math.max(g[g.length - 1][1] - g[g.length - 1][0], xs[i][1] - xs[i][0]);
      if (gap < wide * 0.42) g.push(xs[i]);
      else { groups.push(g); g = [xs[i]]; }
    }
    groups.push(g);
    groups.sort((a, b) => (b[b.length - 1][1] - b[0][0]) - (a[a.length - 1][1] - a[0][0]));
    const best = groups[0];
    return [Math.max(0, best[0][0] - 6), Math.min(W, best[best.length - 1][1] + 6)];
  }
  function frameSpan(img, y0, y1, x0, x1) {
    const W = img.width, D = img.data;
    let a = W, z = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      if (isFrame(D[i], D[i + 1], D[i + 2])) { if (x < a) a = x; if (x > z) z = x; }
    }
    return z > a ? z - a : 0;
  }
  function findGrid(img) {
    const W = img.width, H = img.height, D = img.data;
    const span = panelSpan(img);
    const spanW = span[1] - span[0];
    const row = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let n = 0;
      for (let x = span[0]; x < span[1]; x++) { const i = (y * W + x) * 4; if (isFrame(D[i], D[i + 1], D[i + 2])) n++; }
      row[y] = n;
    }
    const ys = bands(row, Math.max(8, spanW * 0.02), 8);
    if (ys.length < 2) return null;
    const tall = ys.filter((b) => b[1] - b[0] >= Math.max(28, H * 0.012));
    if (tall.length < 2) return null;
    // Buttons under the grid are shorter, and one glued pair of rows is taller. The height that repeats is a tile.
    const clusters = [];
    for (const b of tall) {
      const h = b[1] - b[0];
      const c = clusters.find((k) => Math.abs(k.h - h) < k.h * 0.18);
      if (c) { c.n++; c.sum += h; c.h = c.sum / c.n; }
      else clusters.push({ h, n: 1, sum: h });
    }
    clusters.sort((a, b) => (b.n * b.n * b.h) - (a.n * a.n * a.h));
    const med = clusters[0].h;
    const full = tall.filter((b) => { const h = b[1] - b[0]; return h > med * 0.80 && h < med * 1.28; });
    if (!full.length) return null;
    const rowW = Math.max(...full.map((b) => frameSpan(img, b[0], b[1], span[0], span[1])));
    const cutBands = tall.filter((b) => {
      const h = b[1] - b[0];
      // A short band is a cropped rune row only when it is as wide as the grid. The Filter button is narrower.
      return h > med * 0.4 && h <= med * 0.80 && frameSpan(img, b[0], b[1], span[0], span[1]) > rowW * 0.62;
    });
    // The upper half of the frame. The top edge alone misses a column, and the red symbol lower down can glue two tiles together.
    const col = new Float32Array(W);
    for (const b of full) {
      const y1 = b[0] + Math.max(4, (b[1] - b[0]) * 0.5);
      for (let y = b[0]; y < y1; y++) for (let x = span[0]; x < span[1]; x++) {
        const i = (y * W + x) * 4;
        if (isFrame(D[i], D[i + 1], D[i + 2])) col[x]++;
      }
    }
    let xs = bands(col, Math.max(3, full.length * 2), 6);
    if (xs.length < 3) return null;
    // Keep the run of columns whose width matches the tile.
    const widths = xs.map((b) => b[1] - b[0]).sort((a, b) => a - b);
    const mw = widths[widths.length >> 1];
    xs = xs.filter((b) => { const w = b[1] - b[0]; return w > mw * 0.55 && w < mw * 1.7; });
    if (xs.length < 3) return null;
    const pitch = (xs[xs.length - 1][0] - xs[0][0]) / (xs.length - 1);
    return { rows: full, cols: xs, tile: med, pitch, cutBands };
  }
  function gradeOf(img, rect) {
    // The tile background decides the grade. A yellow glow is a Divine; a red glow is a plain Legendary.
    // Sparkles are left out, so a glint cannot flip the colour.
    let gold = 0, red = 0;
    const add = (x0, x1, y0, y1) => {
      for (let y = Math.floor(rect.y + rect.h * y0); y < rect.y + rect.h * y1; y++) {
        for (let x = Math.floor(rect.x + rect.w * x0); x < rect.x + rect.w * x1; x++) {
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
          const p = px(img, x, y);
          if (isSparkle(p[0], p[1], p[2])) continue;
          const k = isFrame(p[0], p[1], p[2]);
          if (k === 1) gold++;
          else if (k === 2) red++;
        }
      }
    };
    add(0.0, 0.16, 0.28, 0.72); // left glow, away from the Divine badge and the E
    add(0.28, 0.62, 0.0, 0.16); // top glow, away from the +level
    add(0.84, 1.0, 0.2, 0.62); // right glow, above the E
    if (gold + red < 12) return "other";
    if (gold > red * 1.5) return "divine";
    if (red > gold * 1.5) return "legendary";
    return "other";
  }
  // Red glyph only. A passing sparkle, or the gold glow that brightens and dims around a Divine, is left out.
  // The grey stone stays, so the holes in a swirl or a target still count.
  function inkRaw(arr, n) {
    const v = new Float32Array(n * n);
    const use = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const r = arr[i * 4], g = arr[i * 4 + 1], b = arr[i * 4 + 2], a = arr[i * 4 + 3];
      if (a < 20 || isSparkle(r, g, b)) continue;
      const [h, s] = hsv(r, g, b);
      if (s > 0.28 && h >= 18 && h <= 70) continue;
      use[i] = 1;
      v[i] = Math.max(0, r - Math.max(g, b));
    }
    return { v, use };
  }
  // Pixels that differ between the icons count more than the parts they share.
  function distinct(raws, n, pick) {
    const w = new Float32Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) {
      let m = 0, c = 0;
      for (const r of raws) { const x = pick(r, i); if (x == null) continue; m += x; c++; }
      if (!c) continue;
      m /= c;
      let s = 0;
      for (const r of raws) { const x = pick(r, i); if (x == null) continue; const d = x - m; s += d * d; }
      w[i] = Math.sqrt(s / c);
      if (w[i] > max) max = w[i];
    }
    const scale = max || 1;
    for (let i = 0; i < n; i++) w[i] = 0.35 + 0.65 * (w[i] / scale);
    return w;
  }
  function inkScore(shot, tmpl, w) {
    const n = shot.v.length;
    let c = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) {
      if (!shot.use[i] || !tmpl.use[i]) continue;
      c++; sa += shot.v[i]; sb += tmpl.v[i];
    }
    if (c < n * 0.45) return -1;
    sa /= c; sb /= c;
    let s = 0, na = 0, nb = 0;
    for (let i = 0; i < n; i++) {
      if (!shot.use[i] || !tmpl.use[i]) continue;
      const a = (shot.v[i] - sa) * w[i], b = (tmpl.v[i] - sb) * w[i];
      s += a * b; na += a * a; nb += b * b;
    }
    return s / (Math.sqrt(na * nb) || 1);
  }
  function prepDivine(image) {
    const n = 18;
    const arr = resample(image, image.width * 0.22, image.height * 0.18, image.width * 0.56, image.height * 0.6, n);
    const dark = new Float32Array(n * n);
    const idx = [];
    for (let i = 0; i < n * n; i++) {
      if (arr[i * 4 + 3] <= 80) continue;
      const lum = (arr[i * 4] + arr[i * 4 + 1] + arr[i * 4 + 2]) / 3;
      dark[i] = 255 - lum;
      idx.push(i);
    }
    return { n, arr, dark, idx };
  }
  function slideScore(big, bn, tmpl, w) {
    const { n, arr, dark, idx } = tmpl;
    if (idx.length < 8) return -1;
    let best = -1;
    for (let oy = 0; oy <= bn - n; oy += 2) for (let ox = 0; ox <= bn - n; ox += 2) {
      const keep = [];
      for (const i of idx) {
        const y = (i / n) | 0, x = i - y * n;
        const o = ((oy + y) * bn + (ox + x)) * 4;
        if (isSparkle(big[o], big[o + 1], big[o + 2])) continue;
        keep.push(i);
      }
      if (keep.length < idx.length * 0.55) continue;
      let ar = 0, ag = 0, ab = 0, br = 0, bg = 0, bb = 0, ad = 0, bd = 0;
      for (const i of keep) {
        const y = (i / n) | 0, x = i - y * n;
        const o = ((oy + y) * bn + (ox + x)) * 4, t = i * 4;
        ar += arr[t]; ag += arr[t + 1]; ab += arr[t + 2];
        br += big[o]; bg += big[o + 1]; bb += big[o + 2];
        ad += dark[i]; bd += 255 - (big[o] + big[o + 1] + big[o + 2]) / 3;
      }
      const c = keep.length;
      ar /= c; ag /= c; ab /= c; br /= c; bg /= c; bb /= c; ad /= c; bd /= c;
      let cs = 0, cna = 0, cnb = 0, ds = 0, dna = 0, dnb = 0;
      for (const i of keep) {
        const y = (i / n) | 0, x = i - y * n;
        const o = ((oy + y) * bn + (ox + x)) * 4, t = i * 4;
        const dr = arr[t] - ar, dg = arr[t + 1] - ag, db = arr[t + 2] - ab;
        const er = big[o] - br, eg = big[o + 1] - bg, eb = big[o + 2] - bb;
        cs += dr * er + dg * eg + db * eb;
        cna += dr * dr + dg * dg + db * db;
        cnb += er * er + eg * eg + eb * eb;
        const wi = w ? w[i] : 1;
        const a = (dark[i] - ad) * wi;
        const b = (255 - (big[o] + big[o + 1] + big[o + 2]) / 3 - bd) * wi;
        ds += a * b; dna += a * a; dnb += b * b;
      }
      const color = cs / (Math.sqrt(cna * cnb) || 1);
      const shape = ds / (Math.sqrt(dna * dnb) || 1);
      // Colour keeps the badge's own paint; the dark shape is the part that differs between Divines.
      const sc = color * 0.45 + shape * 0.55;
      if (sc > best) best = sc;
    }
    return best;
  }
  function rank(list) {
    list.sort((a, b) => b.score - a.score);
    return list;
  }
  function buildMatcher(runeIcons, divineIcons) {
    const N = 40;
    const runes = runeIcons.map((ic) => Object.assign({ id: ic.id, name: ic.name }, inkRaw(resample(ic.image, ic.image.width * 0.18, ic.image.height * 0.12, ic.image.width * 0.64, ic.image.height * 0.7, N), N)));
    const runeW = distinct(runes, N * N, (r, i) => (r.use[i] ? r.v[i] : null));
    const divines = divineIcons.map((ic) => Object.assign({ id: ic.id, name: ic.name, short: ic.short }, prepDivine(ic.image)));
    const dn = divines[0].dark.length;
    const divineW = distinct(divines, dn, (d, i) => (d.dark[i] ? d.dark[i] : null));
    return { runes, divines, runeW, divineW, N };
  }
  function matchRune(matcher, img, rect) {
    const N = matcher.N;
    let best = null;
    let bestTop = -Infinity;
    // the stone sits inside the frame; a one-step nudge covers a slightly off crop
    for (const ox of [-0.04, 0, 0.04]) for (const oy of [-0.04, 0, 0.04]) {
      const shot = inkRaw(resample(img, rect.x + rect.w * (0.22 + ox), rect.y + rect.h * (0.16 + oy), rect.w * 0.56, rect.h * 0.58, N), N);
      const scored = matcher.runes.map((r) => ({ id: r.id, name: r.name, score: inkScore(shot, r, matcher.runeW) }));
      if (!scored.length) continue;
      const top = Math.max(...scored.map((s) => s.score));
      if (top > bestTop) { bestTop = top; best = scored; }
    }
    return rank(best || []);
  }
  function matchDivine(matcher, img, rect) {
    const bn = 48;
    const big = resample(img, rect.x - rect.w * 0.06, rect.y + rect.h * 0.52, rect.w * 0.55, rect.h * 0.52, bn);
    return rank(matcher.divines.map((d) => ({ id: d.id, name: d.name, short: d.short, score: slideScore(big, bn, d, matcher.divineW) })));
  }
  // The E badge is black. A dim glow darkens the corner too, but less: up to 0.36 dark, the badge 0.55 or more.
  function equipped(img, rect) {
    let n = 0, dark = 0;
    const x0 = rect.x + rect.w * 0.7, x1 = rect.x + rect.w * 0.98, y0 = rect.y + rect.h * 0.7, y1 = rect.y + rect.h * 0.98;
    for (let y = Math.floor(y0); y < y1; y += 1) for (let x = Math.floor(x0); x < x1; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const p = px(img, x, y); n++;
      if (Math.max(p[0], p[1], p[2]) < 55) dark++;
    }
    return n > 8 && dark / n > 0.45;
  }
  // The white number in the tile's bottom corner is how many copies. No number, and an E, are one rune.
  // templates: [{d, f:number[140]}] from the same digit shapes the gear and artifact pages use.
  const COPY_W = 10, COPY_H = 14;
  function copyGlyph(mask, mw, c) {
    const f = new Float32Array(COPY_W * COPY_H);
    for (let gy = 0; gy < COPY_H; gy++) for (let gx = 0; gx < COPY_W; gx++) {
      const sx0 = c.xA + (gx * c.w) / COPY_W, sx1 = c.xA + ((gx + 1) * c.w) / COPY_W;
      const sy0 = c.yA + (gy * c.h) / COPY_H, sy1 = c.yA + ((gy + 1) * c.h) / COPY_H;
      let a = 0, t = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0), wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
        if (wx <= 0 || wy <= 0 || y < 0 || x < 0 || y >= mask.length / mw || x >= mw) continue;
        t += wx * wy;
        if (mask[y * mw + x]) a += wx * wy;
      }
      f[gy * COPY_W + gx] = t ? a / t : 0;
    }
    let ll = 0, n = 0;
    for (let y = 7; y < 12; y++) for (let x = 0; x < 4; x++) { ll += f[y * COPY_W + x]; n++; }
    return { f, ll: ll / n };
  }
  function rankDigit(f, templates) {
    const per = {};
    for (const t of templates) {
      let d = 0;
      const tf = t.f;
      for (let i = 0; i < f.length; i++) { const e = f[i] - tf[i]; d += e * e; }
      d /= f.length;
      if (per[t.d] === undefined || d < per[t.d]) per[t.d] = d;
    }
    return Object.entries(per).sort((a, b) => a[1] - b[1]);
  }
  function readCopies(img, rect, templates) {
    // A printed stack number wins. No number is one rune, and so is an equipped E.
    if (!templates || !templates.length) return 1;
    const x0 = Math.max(0, Math.round(rect.x + rect.w * 0.55));
    const x1 = Math.min(img.width, Math.round(rect.x + rect.w * 1.02));
    const y0 = Math.max(0, Math.round(rect.y + rect.h * 0.55));
    const y1 = Math.min(img.height, Math.round(rect.y + rect.h * 1.05));
    const w = x1 - x0, h = y1 - y0;
    if (w < 8 || h < 8) return 1;
    const m = new Uint8Array(w * h);
    let dark = 0, seenN = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const yy = y0 + y, xx = x0 + x;
      const i = (yy * img.width + xx) * 4;
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      seenN++;
      if (mx < 50) dark++;
      if (mn > 150 && mx - mn < 80) m[y * w + x] = 1;
    }
    // The same black E badge, caught when the letter itself is too small for the equipped check.
    if (seenN && dark / seenN > 0.35) return 1;
    const seen = new Uint8Array(m.length);
    const comps = [];
    for (let i = 0; i < m.length; i++) {
      if (!m[i] || seen[i]) continue;
      const st = [i]; seen[i] = 1;
      let xA = w, yA = h, xB = -1, yB = -1, cn = 0;
      while (st.length) {
        const k = st.pop(), x = k % w, y = (k / w) | 0;
        cn++;
        if (x < xA) xA = x; if (x > xB) xB = x; if (y < yA) yA = y; if (y > yB) yB = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const kk = yy * w + xx;
          if (m[kk] && !seen[kk]) { seen[kk] = 1; st.push(kk); }
        }
      }
      const cw = xB - xA + 1, ch = yB - yA + 1;
      if (ch >= 5 && cw >= 3 && cn >= 12 && ch <= rect.h * 0.45 && cw / ch <= 1.25) comps.push({ xA, yA, xB, yB, w: cw, h: ch });
    }
    comps.sort((a, b) => a.xA - b.xA);
    let text = "";
    for (const c of comps) {
      const g = copyGlyph(m, w, c);
      const ranked = rankDigit(g.f, templates);
      if (!ranked.length || ranked[0][1] > 0.16) continue;
      let digit = ranked[0][0];
      const second = ranked[1];
      const fiveOrSix = second && ((digit === "5" && second[0] === "6") || (digit === "6" && second[0] === "5"));
      // A 6 keeps ink down its left side. A 5 leaves that side empty, and the two shapes sit close together.
      if (fiveOrSix && g.ll >= 0.30) digit = "6";
      else if (fiveOrSix && g.ll <= 0.22) digit = "5";
      text += digit;
    }
    if (!text) return 1;
    const value = parseInt(text, 10);
    return Number.isFinite(value) ? value : 1;
  }
  function analyze(img, matcher, templates) {
    const g = findGrid(img);
    if (!g) return { tiles: [], error: "I could not find a rune grid. Use a screenshot of Inventory, Rune, with Legendary filtered on." };
    // The inventory shows four full rows. A row cut off at the edge, or sitting behind the Filter button, is not one of them.
    const rows = g.rows.slice(0, 4);
    const tiles = [];
    rows.forEach((row, ri) => {
      g.cols.forEach((col, ci) => {
        const rect = { x: col[0], y: row[0], w: col[1] - col[0], h: row[1] - row[0] };
        const grade = gradeOf(img, rect);
        if (grade === "other") return;
        const runes = matchRune(matcher, img, rect);
        if (!runes[0]) return;
        const tile = { row: ri, col: ci, rect, grade, copies: readCopies(img, rect, templates), equipped: equipped(img, rect), flags: [], runeId: runes[0].id, runeName: runes[0].name, runeScore: runes[0].score, runeMargin: runes[0].score - (runes[1] ? runes[1].score : 0) };
        // A stack number can cover part of the glyph and pull the score down. A clear gap to the next rune still names it.
        // A close call, or a very low score, still needs a check.
        if (tile.runeScore < 0.45 || (tile.runeMargin < 0.08 && tile.runeScore < 0.82) || (tile.runeScore < 0.55 && tile.runeMargin < 0.12)) tile.flags.push("Not sure which rune");
        if (grade === "divine") {
          const div = matchDivine(matcher, img, rect);
          if (div[0]) {
            tile.divineId = div[0].id; tile.divineName = div[0].name; tile.divineShort = div[0].short;
            tile.divineScore = div[0].score; tile.divineMargin = div[0].score - (div[1] ? div[1].score : 0);
            if (tile.divineScore < 0.55 || tile.divineMargin < 0.08) tile.flags.push("Not sure which Divine");
          } else tile.flags.push("Not sure which Divine");
        }
        tiles.push(tile);
      });
    });
    const first = rows[0][0], last = rows[rows.length - 1][1], pitch = g.tile;
    const x0 = Math.max(0, g.cols[0][0] - 6);
    const x1 = Math.min(img.width, g.cols[g.cols.length - 1][1] + 6);
    const skipped = [];
    // The crop is the ignored row itself, across the same columns as the rows that were read.
    // Column bounds can miss a tile at the edge, so the crop follows the frames in the ignored row itself.
    const rowSpan = (y0, y1) => {
      let min = img.width, max = -1;
      const yA = Math.max(0, y0 | 0), yB = Math.min(img.height, Math.ceil(y1));
      for (let y = yA; y < yB; y += 2) {
        for (let x = 0; x < img.width; x += 2) {
          const i = (y * img.width + x) * 4;
          if (!isFrame(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
          if (x < min) min = x;
          if (x > max) max = x;
        }
      }
      if (max < 0) return [x0, x1];
      return [Math.max(0, Math.min(x0, min - 10)), Math.min(img.width, Math.max(x1, max + 10))];
    };
    const add = (kind, y0, y1) => {
      const y = Math.max(0, Math.floor(y0));
      const yb = Math.min(img.height, Math.ceil(y1));
      if (yb - y < 8) return;
      const span = rowSpan(y, yb);
      if (span[1] - span[0] < 8) return;
      skipped.push({ kind, x: span[0], y, w: span[1] - span[0], h: yb - y });
    };
    // Only a band sitting against the four rows is a rune row. Gold lines further down are the filter button, not tiles.
    // The crop covers the whole leftover row, not only the thin frame band, so the ignored tiles are visible.
    for (const b of g.cutBands) {
      if (b[1] <= first + 6 && first - b[0] < pitch * 1.4) add("top", Math.max(0, Math.min(b[0], first - pitch) - 2), first - 2);
      else if (b[0] >= last - 4 && b[0] - last < pitch * 1.3) {
        const y0 = last + 2;
        let y1 = Math.max(b[1] + 2, y0 + pitch);
        const next = g.cutBands.find((c) => c[0] > b[1] + 4);
        if (next) y1 = Math.min(y1, next[0] - 2);
        add(img.height - b[1] < pitch * 0.55 ? "bottom-crop" : "filter", y0, y1);
      }
    }
    for (const b of g.rows.slice(4)) add("past-four", b[0], b[1]);
    // A row half-hidden behind Filter Applied can be only a thin strip of frame, too short to be a cut band.
    // If that strip is about as wide as the grid, show it as skipped and do not read it.
    const bottomNoted = skipped.some((s) => s.kind === "filter" || s.kind === "bottom-crop" || s.kind === "past-four");
    if (!bottomNoted && g.cols.length) {
      const gridW = g.cols[g.cols.length - 1][1] - g.cols[0][0];
      const yA = Math.round(last + pitch * 0.22);
      const yB = Math.min(img.height, Math.round(last + pitch * 0.72));
      if (yB - yA >= 8 && frameSpan(img, yA, yB, 0, img.width) > gridW * 0.55) add("filter", yA, yB);
    }
    return { tiles, skipped, rows: rows.length, cols: g.cols.length };
  }
  function tally(tiles) {
    const byDivine = {};
    for (const d of DIVINES) byDivine[d.id] = 0;
    const byRune = {};
    for (const r of RUNES) byRune[r.id] = { id: r.id, name: r.name, legendary: 0, divine: 0, divines: {} };
    const copiesOf = (t) => (Number.isFinite(t.copies) ? t.copies : 1);
    for (const t of tiles) {
      const n = copiesOf(t);
      if (t.divineId && byDivine[t.divineId] != null) byDivine[t.divineId] += n;
      const b = byRune[t.runeId];
      if (!b) continue;
      if (t.grade === "divine") { b.divine += n; if (t.divineId) b.divines[t.divineId] = (b.divines[t.divineId] || 0) + n; }
      else b.legendary += n;
    }
    return {
      mod: byDivine.mod, pot: byDivine.pot, byDivine,
      legendary: tiles.reduce((s, t) => s + (t.grade === "legendary" ? copiesOf(t) : 0), 0),
      divine: tiles.reduce((s, t) => s + (t.grade === "divine" ? copiesOf(t) : 0), 0),
      byRune: RUNES.map((r) => byRune[r.id]).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  return { RUNES, DIVINES, analyze, tally, buildMatcher, findGrid, gradeOf, matchRune, matchDivine };
});
