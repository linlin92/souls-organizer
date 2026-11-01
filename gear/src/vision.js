// Screenshot reader for the SOULS Inventory > Artifact grid.
// Pure functions on {width,height,data(RGBA)} images, so the same code runs in the browser
// (canvas ImageData) and in Node (pngjs) for tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Vision = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // ---- layout constants (fractions of screenshot width; the game UI scales with width) ----
  const COL_CENTERS = [0.1586, 0.3277, 0.4968, 0.666, 0.8351];
  const TILE = 0.1522; // tile width = height
  const PITCH = 0.17125; // row pitch
  // Tile rectangle used for matching/reading. Measured from the dark gaps between tiles (pitch 184px, tile 161px at 1080px wide) and
  // confirmed by a small search maximising the icon match score of the 63 labelled tiles (sharp optimum: 63/63 ids, mean score 0.87).
  const GEO = { pitchX: 0.1704, w: 0.1495, dy: 0 };
  const OUTER_BANDS = [[0.09, 0.235], [0.765, 0.91]]; // outer columns (the Filter pill never covers them)
  // Filter pill (covers the middle of the bottom partial row), as fractions of width
  const PILL = { x0: 0.3, x1: 0.7, y0: 1.31, y1: 1.43 };
  const VIEW = { top: 0.567, bottom: 1.435 }; // visible grid viewport (fractions of width)
  const N = 64; // matching resolution
  const IGNORE_PREFIX = "ignore-"; // template ids of free items that are silently skipped when seen (e.g. Adventurer's Chronicle)
  const FADED_ID = "faded-artifact"; // what the 2 fodder Legendaries turn into when a 2-diamond transcend is reset; never a recipe ingredient

  // ---------- small image helpers ----------
  function px(img, x, y) {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  }
  // Area-average resample of a source rectangle into an n x m RGB float array.
  function resample(img, x0, y0, w, h, n, m) {
    m = m || n;
    const out = new Float32Array(n * m * 3);
    for (let oy = 0; oy < m; oy++) {
      const sy0 = y0 + (oy * h) / m, sy1 = y0 + ((oy + 1) * h) / m;
      for (let ox = 0; ox < n; ox++) {
        const sx0 = x0 + (ox * w) / n, sx1 = x0 + ((ox + 1) * w) / n;
        let r = 0, g = 0, b = 0, wt = 0;
        for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
          if (sy < 0 || sy >= img.height) continue;
          const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
          for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
            if (sx < 0 || sx >= img.width) continue;
            const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
            const i = (sy * img.width + sx) * 4, ww = wx * wy;
            r += img.data[i] * ww; g += img.data[i + 1] * ww; b += img.data[i + 2] * ww; wt += ww;
          }
        }
        const o = (oy * n + ox) * 3;
        if (wt > 0) { out[o] = r / wt; out[o + 1] = g / wt; out[o + 2] = b / wt; }
      }
    }
    return out;
  }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx];
  }

  // ---------- 1. row detection ----------
  // Rows are separated by dark panel-coloured gaps. We find the gap runs in the outer columns,
  // fit the grid phase with the known pitch, then classify every grid row as full / partial / empty.
  function findRows(img) {
    const g = findGrid(img);
    if (g) { const rows = gridRows(g); if (rows.length) return { rows, grid: g, tile: g.tile, generic: true }; }
    return findRowsLegacy(img);
  }
  function findRowsLegacy(img) {
    const W = img.width, H = img.height;
    const D = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let dark = 0, tot = 0;
      for (const [a, b] of OUTER_BANDS) {
        for (let x = Math.floor(a * W); x < Math.floor(b * W); x += 2) {
          const i = (y * W + x) * 4;
          if (Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) < 80) dark++;
          tot++;
        }
      }
      D[y] = dark / tot;
    }
    const lo = Math.floor(0.4 * W), hi = Math.min(H - 1, Math.floor(1.6 * W));
    const runs = [];
    let s = -1;
    for (let y = lo; y <= hi + 1; y++) {
      const d = y <= hi && D[y] > 0.95;
      if (d && s < 0) s = y;
      if (!d && s >= 0) { runs.push([s, y - 1]); s = -1; }
    }
    const P = PITCH * W;
    const gaps = runs.filter(([a, b]) => b - a + 1 >= 0.07 * P && b - a + 1 <= 0.2 * P);
    if (!gaps.length) return { rows: [], P, D, error: "no tile grid found (is this the Inventory > Artifact screen?)" };
    // phase vote
    let best = null;
    for (const [g] of gaps) {
      let votes = 0;
      for (const [o] of gaps) {
        let d = Math.abs(((o - g) % P + P) % P);
        d = Math.min(d, P - d);
        if (d < 0.04 * P) votes++;
      }
      if (!best || votes > best.votes) best = { g, votes };
    }
    const lens = gaps.map(([a, b]) => b - a + 1).sort((p, q) => p - q);
    const Lg = lens[Math.floor(lens.length / 2)];
    // refine phase = mean of the voters
    const voters = gaps.filter(([o]) => { let d = Math.abs(((o - best.g) % P + P) % P); d = Math.min(d, P - d); return d < 0.04 * P; });
    let sum = 0;
    for (const [o] of voters) { let d = ((o - best.g) % P + P) % P; if (d > P / 2) d -= P; sum += d; }
    const phase = best.g + sum / voters.length;
    const tileH = TILE * W;
    const rows = [];
    // gap k starts at phase + k*P; tile top = gap start + Lg; tile bottom = next gap start
    const k0 = Math.floor((0.35 * W - phase) / P) - 1, k1 = Math.ceil((1.55 * W - phase) / P) + 1;
    for (let k = k0; k <= k1; k++) {
      const top = phase + k * P + Lg;
      const bottom = top + tileH;
      const vTop = VIEW.top * W, vBot = VIEW.bottom * W;
      if (bottom < vTop + 0.12 * tileH || top > vBot - 0.12 * tileH) continue;
      let vs = -1, ve = -1;
      for (let y = Math.max(0, Math.floor(Math.max(top, vTop))); y < Math.min(H, Math.ceil(Math.min(bottom, vBot))); y++) {
        if (D[y] < 0.9) { if (vs < 0) vs = y; ve = y; }
      }
      if (vs < 0 || ve - vs < 0.1 * tileH) continue; // empty/blank
      const tol = 0.04 * tileH;
      const topCut = vs > top + tol || top < vTop - tol, botCut = ve < bottom - tol || bottom > vBot + tol;
      rows.push({
        top, bottom, visTop: Math.max(top, vs), visBottom: Math.min(bottom, ve + 1),
        kind: topCut ? "top" : botCut ? "bottom" : "full",
      });
    }
    return { rows, P, Lg, phase, D };
  }

  // ---------- 1b. generic grid finder (any crop, scale or window) ----------
  // The tiles are the big square blobs of saturated frame colour on the dark panel. We measure their size, fit the 5-column lattice
  // to their edges (sub-pixel, on the full resolution mask), and derive every other measurement from the tile size, so a tight crop,
  // a phone popup (blurred background) and a whole emulator window (title bar, side toolbar) all give the same kind of grid.
  const GAP_RATIO = GEO.w / GEO.pitchX; // tile width / column pitch
  const ROW_RATIO = PITCH / GEO.pitchX; // row pitch / column pitch
  const isColored = (r, g, b) => Math.max(r, g, b) >= 70; // 'not panel-dark': the gaps between tiles are the dark panel colour
  function coloredMask(img) {
    const W = img.width, H = img.height, d = img.data, m = new Uint8Array(W * H);
    for (let i = 0, p = 0; p < W * H; p++, i += 4) m[p] = isColored(d[i], d[i + 1], d[i + 2]) ? 1 : 0;
    return m;
  }
  const medianOf = (a) => { const v = a.slice().sort((p, q) => p - q); return v[v.length >> 1]; };
  // tile-sized, roughly square blobs of the low-resolution mask
  function findBlobs(mask, W, H) {
    const f = Math.max(1, Math.round(W / 450)), lw = Math.ceil(W / f), lh = Math.ceil(H / f);
    const low = new Uint8Array(lw * lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      let c = 0, n = 0;
      for (let yy = y * f; yy < Math.min(H, (y + 1) * f); yy++) for (let xx = x * f; xx < Math.min(W, (x + 1) * f); xx++) { c += mask[yy * W + xx]; n++; }
      low[y * lw + x] = c >= 0.4 * n ? 1 : 0;
    }
    const lab = new Int32Array(lw * lh), blobs = [], stack = [];
    for (let s0 = 0; s0 < low.length; s0++) {
      if (!low[s0] || lab[s0]) continue;
      const id = blobs.length + 1;
      let x0 = lw, x1 = -1, y0 = lh, y1 = -1, area = 0;
      stack.push(s0); lab[s0] = id;
      while (stack.length) {
        const p = stack.pop(), x = p % lw, y = (p / lw) | 0;
        area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= lw || ny >= lh) continue;
          const q = ny * lw + nx;
          if (low[q] && !lab[q]) { lab[q] = id; stack.push(q); }
        }
      }
      blobs.push({ x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
    }
    return { f, blobs };
  }
  // consecutive-index lattice from a list of centres: returns {pitch, idx[]} (index relative to the first centre)
  function latticeIndex(cs, size) {
    const s = cs.slice().sort((a, b) => a - b), diffs = [];
    for (let i = 1; i < s.length; i++) { const d = s[i] - s[i - 1]; if (d >= 1.05 * size && d <= 1.5 * size) diffs.push(d); }
    return diffs.length ? medianOf(diffs) : 0;
  }
  // sub-pixel edge position inside [a,b) of a 0..1 profile: a rising edge (gap -> tile) or a falling edge (tile -> gap)
  function edgeAt(prof, a, b, rising) {
    a = Math.max(0, Math.round(a)); b = Math.min(prof.length, Math.round(b));
    let s = 0;
    for (let i = a; i < b; i++) s += rising ? 1 - prof[i] : prof[i];
    return a + s;
  }
  function findGrid(img) {
    const W = img.width, H = img.height, mask = coloredMask(img);
    const { f, blobs } = findBlobs(mask, W, H);
    const sq = blobs.filter((b) => b.w >= 8 && b.h >= 8 && b.w / b.h > 0.85 && b.w / b.h < 1.18 && b.area >= 0.55 * b.w * b.h);
    if (sq.length < 3) return null;
    // tile size = the largest cluster of equal-sized squares
    let best = null;
    for (const a of sq) {
      const grp = sq.filter((b) => Math.abs(b.w - a.w) <= 0.1 * a.w && Math.abs(b.h - a.h) <= 0.1 * a.w);
      if (!best || grp.length * a.w * a.w > best.length * best[0].w * best[0].w) best = grp; // ORGANIZER: area-weighted, so the tile frames win over the (more numerous) small diamonds
    }
    if (best.length < 3) return null;
    const S = medianOf(best.map((b) => (b.w + b.h) / 2));
    const mem = best.map((b) => ({ cx: (b.x0 + b.x1 + 1) / 2, cy: (b.y0 + b.y1 + 1) / 2 }));
    // columns
    const px0 = latticeIndex(mem.map((m) => m.cx), S);
    if (!px0) return null;
    let cmin = Math.min(...mem.map((m) => m.cx));
    let ks = mem.map((m) => Math.round((m.cx - cmin) / px0));
    let kBest = 0, kCnt = -1;
    for (let k0 = 0; k0 <= Math.max(...ks); k0++) { const n = ks.filter((k) => k >= k0 && k < k0 + 5).length; if (n > kCnt) { kCnt = n; kBest = k0; } }
    const keep = mem.filter((m, i) => ks[i] >= kBest && ks[i] < kBest + 5);
    ks = keep.map((m) => Math.round((m.cx - cmin) / px0) - kBest);
    // columns missing at the left/right edge of the member list are still columns 0..4: anchor on the first assigned one
    const fit1 = (xs, is) => { const n = xs.length, mi = is.reduce((a, b) => a + b, 0) / n, mx = xs.reduce((a, b) => a + b, 0) / n; let sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sxx += (is[i] - mi) ** 2; sxy += (is[i] - mi) * (xs[i] - mx); } const sl = sxx > 0 ? sxy / sxx : px0; return { p: sl, a: mx - sl * mi }; };
    const fx = fit1(keep.map((m) => m.cx), ks);
    const pLow = Math.abs(fx.p - px0) < 0.1 * px0 ? fx.p : px0;
    // low-res centre of column c = fx.a + c*pLow  (c = 0..4); rows
    const yMin = Math.min(...keep.map((m) => m.cy)), yMax = Math.max(...keep.map((m) => m.cy));
    const py0 = latticeIndex(keep.map((m) => m.cy), S) || pLow * ROW_RATIO;
    const rks = keep.map((m) => Math.round((m.cy - yMin) / py0));
    // ---- refine on the full-resolution mask: the dark gutters between the tiles are long straight lines ----
    const Sf = S * f;
    // centre of the longest run of >=90% dark lines inside [a,b) of a dark-fraction profile (or null)
    const gutter = (prof, a, b) => {
      a = Math.max(0, Math.round(a)); b = Math.min(prof.length, Math.round(b));
      let bs = -1, bl = 0, s0 = -1;
      for (let i = a; i <= b; i++) {
        const d = i < b && prof[i] >= 0.9;
        if (d && s0 < 0) s0 = i;
        if (!d && s0 >= 0) { if (i - s0 > bl) { bl = i - s0; bs = s0; } s0 = -1; }
      }
      return bl >= 0.04 * Sf && bl <= 0.4 * Sf ? bs + bl / 2 : null;
    };
    const rowsK = [...new Set(rks)].sort((p, q) => p - q);
    const darkCols = new Float32Array(W);
    let nLines = 0;
    for (const k of rowsK) {
      const cy = (yMin + k * py0) * f;
      for (let y = Math.max(0, Math.round(cy - 0.4 * Sf)); y < Math.min(H, Math.round(cy + 0.4 * Sf)); y++) { nLines++; for (let x = 0; x < W; x++) if (!mask[y * W + x]) darkCols[x]++; }
    }
    for (let x = 0; x < W; x++) darkCols[x] /= Math.max(1, nLines);
    const gx = [];
    for (let j = 1; j <= 4; j++) {
      const pred = (fx.a + (j - 0.5) * pLow) * f;
      const c = gutter(darkCols, pred - 0.3 * pLow * f, pred + 0.3 * pLow * f);
      gx.push(c);
    }
    const gxi = [1, 2, 3, 4].filter((j, i) => gx[i] !== null);
    let pitch, a0; // a0 = centre of column 0
    if (gxi.length >= 2) { const g = fit1(gxi.map((j) => gx[j - 1]), gxi); pitch = g.p; a0 = g.a + 0.5 * pitch; } // gutter j (between columns j-1 and j) sits at g.a + j*pitch
    else { pitch = pLow * f; a0 = fx.a * f; }
    if (!(pitch > 0) || Math.abs(pitch - pLow * f) > 0.12 * pitch) return null;
    const w = GAP_RATIO * pitch;
    // row gutters over the interior of the five columns
    const darkRows = new Float32Array(H);
    for (let y = 0; y < H; y++) { let c = 0, n = 0; for (let col = 0; col < 5; col++) for (let x = Math.round(a0 + col * pitch - 0.4 * w); x < Math.round(a0 + col * pitch + 0.4 * w); x++) { if (x >= 0 && x < W) { if (!mask[y * W + x]) c++; n++; } } darkRows[y] = n ? c / n : 0; }
    const pitchY0 = pitch * ROW_RATIO, gy = [];
    const kMin = rowsK[0], kMax = rowsK[rowsK.length - 1];
    for (let k = kMin - 1; k <= kMax; k++) {
      // gutter between lattice row k and k+1 (row index k from yMin)
      const pred = (yMin + (k + 0.5) * py0) * f;
      const c = gutter(darkRows, pred - 0.3 * pitchY0, pred + 0.3 * pitchY0);
      if (c !== null) gy.push({ k, c });
    }
    // robust phase/pitch: consecutive gutters one pitch apart vote, stray dark runs (viewport edges) are dropped
    let pY = pitchY0, ph;
    const dif = [];
    for (let i = 1; i < gy.length; i++) if (gy[i].k - gy[i - 1].k === 1) { const d = gy[i].c - gy[i - 1].c; if (Math.abs(d - pitchY0) < 0.06 * pitchY0) dif.push(d); }
    if (dif.length) pY = medianOf(dif);
    if (gy.length) {
      const m = medianOf(gy.map((r) => r.c - r.k * pY));
      const inl = gy.filter((r) => Math.abs(r.c - r.k * pY - m) < 0.05 * pY);
      if (inl.length >= 2) { const g = fit1(inl.map((r) => r.c), inl.map((r) => r.k)); if (Math.abs(g.p - pY) < 0.03 * pY) { pY = g.p; ph = g.a - 0.5 * pY; } }
      if (ph === undefined) ph = m - 0.5 * pY; // gutter k sits between rows k and k+1
    } else ph = yMin * f;
    return { W, H, mask, data: img.data, f, S: Sf, tile: w, pitch, pitchY: pY, colX: [0, 1, 2, 3, 4].map((c) => a0 + c * pitch), rowY0: ph, rowBase: 0 };
  }
  // all lattice rows that carry tiles; kind = full / top-cut / bottom-cut
  function gridRows(g) {
    const { W, H, mask, tile: w, pitchY: P } = g;
    const geo = { cx: g.colX, w };
    const x0 = g.colX[0] - w / 2, x4 = g.colX[4] - w / 2;
    const prof = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      // the last row of the grid may have fewer than 5 tiles: take the better of the two outer columns
      let best = 0;
      for (const xs of [x0, x4]) {
        let c = 0, n = 0;
        for (let x = Math.round(xs + 0.05 * w); x < Math.round(xs + 0.95 * w); x++) { if (x >= 0 && x < W) { const q = (y * W + x) * 4; if (Math.max(g.data[q], g.data[q + 1], g.data[q + 2]) >= 46) c++; n++; } } // dark green tiles are only a little brighter than the panel
        if (n) best = Math.max(best, c / n);
      }
      prof[y] = best;
    }
    // rows: index relative so that row 0 has centre rowY0 (the first measured row index is the base)
    const kLo = Math.floor((0 - g.rowY0) / P) - 1, kHi = Math.ceil((H - g.rowY0) / P) + 1;
    const cand = [];
    for (let k = kLo; k <= kHi; k++) {
      const top = g.rowY0 + k * P - w / 2, bottom = top + w;
      let vs = -1, ve = -1;
      // the visible part of the row: the first stretch of lines that carry tile pixels (stops at a real dark gap, e.g. where the
      // grid window fades out and the bar below begins)
      let on = 0, last = -1;
      for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, Math.ceil(bottom)); y++) {
        if (prof[y] >= 0.3) { if (vs >= 0 && y - last > 0.08 * w) break; if (vs < 0) vs = y; ve = y; last = y; on++; }
      }
      if (vs >= 0 && on < 0.75 * (ve - vs + 1)) vs = -1; // ragged (title text, icons floating on the panel): not a tile row
      // a real grid row has the dark gutters between its columns (a blurred background or a toolbar does not)
      let gut = 0;
      if (vs >= 0) for (let j = 1; j <= 4; j++) {
        const gxc = (g.colX[j - 1] + g.colX[j]) / 2, hw = 0.2 * (g.pitch - w);
        let dk = 0, n = 0;
        for (let y = vs; y <= ve; y++) for (let x = Math.round(gxc - hw); x <= Math.round(gxc + hw); x++) { if (x >= 0 && x < W) { if (!mask[y * W + x]) dk++; n++; } }
        if (n && dk / n >= 0.7) gut++;
      }
      cand.push({ k, top, bottom, vs, ve, gut, ok: vs >= 0 && ve - vs >= 0.1 * w && gut >= 2 });
    }
    // keep the contiguous run of valid rows that contains the strongest (most visible) row
    let bestRun = null, run = [];
    for (const c of cand.concat([{ ok: false }])) {
      if (c.ok) run.push(c);
      else { if (run.length) { const sc = run.reduce((s, r) => s + (r.ve - r.vs), 0); if (!bestRun || sc > bestRun.sc) bestRun = { run, sc }; run = []; } }
    }
    if (!bestRun) return [];
    const tol = 0.04 * w;
    // tiles cut by the grid window are the last rows: whatever follows a cut row (tab buttons, bar) is not a grid row
    const kindOf = (c) => ((c.vs > c.top + tol || c.top < -tol) ? "top" : (c.ve < c.bottom - tol || c.bottom > H + tol) ? "bottom" : "full");
    let run2 = bestRun.run;
    const fulls = run2.map((c, i) => (kindOf(c) === "full" ? i : -1)).filter((i) => i >= 0);
    if (fulls.length) run2 = run2.slice(Math.max(0, fulls[0] - 1), Math.min(run2.length, fulls[fulls.length - 1] + 2));
    return run2.map((c) => {
      const topCut = c.vs > c.top + tol || c.top < -tol, botCut = c.ve < c.bottom - tol || c.bottom > H + tol;
      const row = { top: c.top, bottom: c.bottom, visTop: Math.max(c.top, c.vs), visBottom: Math.min(c.bottom, c.ve + 1), kind: topCut ? "top" : botCut ? "bottom" : "full", geo };
      // the Filter pill floats over the middle of a row cut by the grid window (not by the image edge)
      if (row.kind === "bottom" && c.bottom <= H + tol) {
        const vb = row.visBottom, cxm = g.colX[2];
        row.pill = { x0: cxm - 1.34 * w, x1: cxm + 1.34 * w, y0: vb - 0.84 * w, y1: vb - 0.03 * w };
      }
      return row;
    });
  }

  function tileRect(W, row, col) {
    if (row.geo) return { x: row.geo.cx[col] - row.geo.w / 2, y: row.top, w: row.geo.w, h: row.geo.w };
    const G = GEO;
    const cx = (0.5 + (col - 2) * G.pitchX) * W, w = G.w * W;
    return { x: cx - w / 2, y: row.top + G.dy * W, w, h: w };
  }

  // ---------- 2. rarity (frame colour) ----------
  function rarityOf(img, rect) {
    const a = resample(img, rect.x, rect.y, rect.w, rect.h, N);
    const pts = [];
    const add = (x0, x1, y0, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pts.push(a.slice((y * N + x) * 3, (y * N + x) * 3 + 3)); };
    add(3, 6, 16, 28); add(26, 38, 3, 6); add(58, 61, 40, 56);
    const med = [0, 1, 2].map((c) => { const v = pts.map((p) => p[c]).sort((p, q) => p - q); return v[v.length >> 1]; });
    const [h, s, v] = rgb2hsv(med[0], med[1], med[2]);
    let r = "other";
    if (s > 0.5 && h >= 22 && h <= 52) r = "mythic";
    else if (s > 0.55 && (h < 22 || h >= 345)) r = "legendary";
    else if (s > 0.4 && h >= 165 && h <= 210) r = "primal";
    return { rarity: r, hsv: [h, s, v] };
  }

  // ---------- 3. icon matching ----------
  // mask out the areas the game draws on top of the icon (level text, count/E badge, diamonds)
  const MASK = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N, fy = y / N;
    const ok = fx > 0.06 && fx < 0.94 && fy > 0.06 && fy < 0.94 &&
      !(fx > 0.5 && fy < 0.27) && !(fx > 0.6 && fy > 0.65) && !(fx < 0.2 && fy > 0.4);
    MASK[y * N + x] = ok ? 1 : 0;
  }
  const CELLROW = []; // pixel row (0..N-1) of every masked cell, in vector order
  for (let i = 0; i < N * N; i++) if (MASK[i]) CELLROW.push((i / N) | 0);
  function maskedVec(arr) {
    const v = [];
    for (let i = 0; i < N * N; i++) if (MASK[i]) v.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
    return Float32Array.from(v);
  }
  function center(v) {
    const n = v.length / 3, m = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) m[c] += v[i * 3 + c];
    for (let c = 0; c < 3; c++) m[c] /= n;
    const o = new Float32Array(v.length);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = v[i * 3 + c] - m[c];
    return o;
  }
  const groupOf = (id) => (id.startsWith("legendary") || id === FADED_ID || id.startsWith(IGNORE_PREFIX) ? "legendary" : id.startsWith("primal") ? "primal" : "mythic");
  // icons: [{id, name, rarity, image:{width,height,data}}]; several entries may share one id (e.g. composite + old icon), the best one counts
  // fallbackIcons (optional): the first icon set, only consulted for a tile the main set is not confident about (it would be flagged) and only used when it is more confident
  function buildMatcher(icons, fallbackIcons) {
    const m = buildOne(icons);
    if (fallbackIcons && fallbackIcons.length) m.fallback = buildOne(fallbackIcons);
    return m;
  }
  function buildOne(icons) {
    const raw = icons.map((ic) => ({ ic, v: center(maskedVec(resample(ic.image, 0, 0, ic.image.width, ic.image.height, N))) }));
    const means = {};
    for (const g of ["mythic", "legendary", "primal"]) {
      const list = raw.filter((r) => groupOf(r.ic.id) === g);
      const m = new Float32Array(list[0] ? list[0].v.length : 0);
      list.forEach((r) => r.v.forEach((x, i) => (m[i] += x / list.length)));
      means[g] = m;
    }
    const T = raw.map((r) => {
      const g = groupOf(r.ic.id);
      const v = r.v.map((x, i) => x - means[g][i]);
      const nrm = Math.hypot(...[0]) || Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return { id: r.ic.id, name: r.ic.name, group: g, v: v.map((x) => x / nrm), vraw: v };
    });
    return { T, means };
  }
  // band = [a,b] fraction of the tile height that is actually visible (partial rows); default whole tile
  function matchTile(matcher, img, rect, group, band) {
    const a = matchCore(matcher, img, rect, group, band);
    if (!matcher.fallback || (a[0].score >= FLAG.idScore && a[0].score - (a[1] ? a[1].score : 0) >= FLAG.idMargin)) return a;
    const b = matchCore(matcher.fallback, img, rect, group, band);
    return b[0].score > a[0].score && b[0].score >= FLAG.idScore && b[0].score - (b[1] ? b[1].score : 0) >= FLAG.idMargin ? b : a;
  }
  function matchCore(matcher, img, rect, group, band) {
    const v0 = center(maskedVec(resample(img, rect.x, rect.y, rect.w, rect.h, N)));
    const v = v0.map((x, i) => x - matcher.means[group][i]);
    const valid = [];
    for (let i = 0; i < CELLROW.length; i++) {
      const fy = CELLROW[i] / N;
      valid.push(!band || (fy >= band[0] && fy < band[1]));
    }
    let nv = 0;
    for (let i = 0; i < valid.length; i++) if (valid[i]) for (let c = 0; c < 3; c++) nv += v[i * 3 + c] * v[i * 3 + c];
    nv = Math.sqrt(nv) || 1;
    const scores = [];
    for (const t of matcher.T) {
      if (t.group !== group) continue;
      let s = 0, nt = 0;
      for (let i = 0; i < valid.length; i++) if (valid[i]) for (let c = 0; c < 3; c++) { const k = i * 3 + c; s += v[k] * t.vraw[k]; nt += t.vraw[k] * t.vraw[k]; }
      scores.push({ id: t.id, name: t.name, score: s / (nv * (Math.sqrt(nt) || 1)) });
    }
    const bestById = new Map();
    for (const sc of scores) { const o = bestById.get(sc.id); if (!o || sc.score > o.score) bestById.set(sc.id, sc); }
    const uniq = [...bestById.values()];
    uniq.sort((a, b) => b.score - a.score);
    return uniq;
  }

  // ---------- 4. glyphs: level "+NN", copy count, equipped badge, diamonds ----------
  const GW = 10, GH = 14;
  // masks: "level" = pale-yellow text, "count" = white text, "gem" = orange transcend diamonds
  function isLevelPx(r, g, b) { return r > 205 && g > 170 && r - b > 45; }
  function isCountPx(r, g, b) { return Math.min(r, g, b) > 195; }
  // softer versions for resampled (blurred, JPEG) tiles: text strokes only reach ~150-190 there
  function isLevelPxSoft(r, g, b) { return r > 170 && g > 140 && r - b > 35; }
  function isCountPxSoft(r, g, b) { return Math.min(r, g, b) > 145 && Math.max(r, g, b) - Math.min(r, g, b) < 80; }
  function isGemPx(r, g, b) { return r > 225 && g > 100 && g < 215 && b < 100; }
  function regionMask(img, rect, fr, test, outlined, darkT) {
    darkT = darkT || 75;
    const x0 = Math.round(rect.x + fr[0] * rect.w), x1 = Math.round(rect.x + fr[2] * rect.w);
    const y0 = Math.round(rect.y + fr[1] * rect.h), y1 = Math.round(rect.y + fr[3] * rect.h);
    const w = x1 - x0, h = y1 - y0, m = new Uint8Array(w * h);
    const dark = (xx, yy) => {
      if (yy < 0 || yy >= img.height || xx < 0 || xx >= img.width) return false;
      const i = (yy * img.width + xx) * 4;
      return Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) < darkT;
    };
    const R = Math.max(2, Math.round(0.026 * rect.w));
    const near = (xx, yy, dx, dy) => { for (let k = 1; k <= R; k++) if (dark(xx + dx * k, yy + dy * k)) return true; return false; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const yy = y0 + y, xx = x0 + x;
      if (yy < 0 || yy >= img.height || xx < 0 || xx >= img.width) continue;
      const i = (yy * img.width + xx) * 4;
      if (!test(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
      if (outlined && !((near(xx, yy, -1, 0) && near(xx, yy, 1, 0)) || (near(xx, yy, 0, -1) && near(xx, yy, 0, 1)))) continue;
      m[y * w + x] = 1;
    }
    return { m, w, h, x0, y0 };
  }
  function components(mask, grow) {
    const { m, w, h } = mask;
    let d = m;
    if (grow) { // dilate by 1 so anti-aliased glyph pieces join
      d = new Uint8Array(m.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x])
        for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) d[yy * w + xx] = 1;
        }
    }
    const seen = new Uint8Array(m.length), comps = [];
    for (let i = 0; i < d.length; i++) {
      if (!d[i] || seen[i]) continue;
      const st = [i]; seen[i] = 1;
      let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
      while (st.length) {
        const k = st.pop(), x = k % w, y = (k / w) | 0;
        n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const kk = yy * w + xx;
          if (d[kk] && !seen[kk]) { seen[kk] = 1; st.push(kk); }
        }
      }
      comps.push({ x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
    }
    return comps;
  }
  function glyphFeature(mask, c) {
    // bbox-normalised GWxGH area-average of the (un-dilated) mask
    const f = new Float32Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const sx0 = c.x0 + (gx * c.w) / GW, sx1 = c.x0 + ((gx + 1) * c.w) / GW;
      const sy0 = c.y0 + (gy * c.h) / GH, sy1 = c.y0 + ((gy + 1) * c.h) / GH;
      let a = 0, t = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0), wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
        if (wx <= 0 || wy <= 0) continue;
        t += wx * wy; if (mask.m[y * mask.w + x]) a += wx * wy;
      }
      f[gy * GW + gx] = t ? a / t : 0;
    }
    return { f, aspect: c.w / c.h };
  }
  const REG = {
    level: { fr: [0.42, 0.11, 0.9, 0.30], test: isLevelPx, soft: isLevelPxSoft, minH: 0.11, grow: 1 },
    count: { fr: [0.5, 0.62, 0.99, 0.99], test: isCountPx, soft: isCountPxSoft, minH: 0.1, grow: 1 },
  };
  // returns glyph components (digits only, left to right) with features
  // The glyph/badge readers are tuned on tiles of about NORM_W px (1080 px wide screenshots). A tile from a screenshot of any other
  // size (a phone screenshot, a re-compressed or rescaled one) is first resampled to that size (bilinear up, area-average down).
  const NORM_W = 161.46;
  function normTile(img, rect) {
    const sc = rect.w / NORM_W;
    if (Math.abs(sc - 1) < 0.04) return { img, rect };
    const N = Math.round(NORM_W), data = new Uint8ClampedArray(N * N * 4);
    if (sc > 1) {
      const t = resample(img, rect.x, rect.y, rect.w, rect.h, N, N);
      for (let i = 0, j = 0; i < N * N; i++, j += 3) { data[i * 4] = t[j]; data[i * 4 + 1] = t[j + 1]; data[i * 4 + 2] = t[j + 2]; data[i * 4 + 3] = 255; }
    } else {
      const st = rect.w / N;
      for (let oy = 0; oy < N; oy++) for (let ox = 0; ox < N; ox++) {
        const fx = rect.x + (ox + 0.5) * st - 0.5, fy = rect.y + (oy + 0.5) * st - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, o = (oy * N + ox) * 4;
        for (let c = 0; c < 3; c++) {
          const g = (xx, yy) => img.data[((Math.min(img.height - 1, Math.max(0, yy)) * img.width) + Math.min(img.width - 1, Math.max(0, xx))) * 4 + c];
          data[o + c] = (g(x0, y0) * (1 - ax) + g(x0 + 1, y0) * ax) * (1 - ay) + (g(x0, y0 + 1) * (1 - ax) + g(x0 + 1, y0 + 1) * ax) * ay;
        }
        data[o + 3] = 255;
      }
    }
    return { img: { width: N, height: N, data }, rect: { x: 0, y: 0, w: N, h: N } };
  }
  // a "+" sign (cross: filled centre row and column, empty corners) is never part of a copy number or level
  function isPlusGlyph(f, aspect) {
    if (aspect < 0.6 || aspect > 1.4) return false;
    const avg = (x0, x1, y0, y1) => { let a = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { a += f[y * GW + x]; n++; } return a / n; };
    const corners = Math.max(avg(0, 3, 0, 4), avg(GW - 3, GW, 0, 4), avg(0, 3, GH - 4, GH), avg(GW - 3, GW, GH - 4, GH));
    return corners < 0.15 && avg(0, GW, 5, 9) > 0.55 && avg(3, 7, 0, GH) > 0.55;
  }
  // Third, last-resort reading for DIM digits (a screenshot of a screenshot, a dark or strongly compressed phone picture): the digit is a neutral
  // grey (not bright white), still ringed by the dark outline. It is only tried when the normal bright-white reading found no digit at all.
  const DIM_MIN_FILL = 0.28;
  function isCountPxDim(r, g, b) { return Math.min(r, g, b) >= 88 && Math.max(r, g, b) - Math.min(r, g, b) <= 60; }
  function pickGlyphs(mask, rect, R) {
    let comps = components(mask, R.grow).filter((c) => c.h >= R.minH * rect.h && c.h <= 0.3 * rect.h && c.w >= 0.045 * rect.h && c.w <= 0.15 * rect.h && c.w / c.h >= 0.3 && c.w / c.h <= 1.1);
    if (!comps.length) return [];
    const maxH = Math.max(...comps.map((c) => c.h));
    comps = comps.filter((c) => c.h >= 0.8 * maxH).sort((a, b) => a.x0 - b.x0);
    // glyphs must sit in one line
    const y0 = comps[0].y0;
    comps = comps.filter((c) => Math.abs(c.y0 - y0) < 0.25 * maxH);
    return comps.map((c) => Object.assign({ box: c }, glyphFeature(mask, c))).filter((g) => !isPlusGlyph(g.f, g.aspect));
  }
  // Every way of cutting the digits out of a tile, most trusted first. [0] is the normal reading (bright white digit). The others are only
  // meant for a tile whose normal reading is unsure: a grey digit that touches a pale icon part (soft threshold, and without joining
  // neighbouring pixels), or, if nothing at all was found, a small dim grey digit in the bottom-right corner.
  function readGlyphVariants(img, rect, kind) {
    const nt = normTile(img, rect), resampled = nt.img !== img;
    img = nt.img; rect = nt.rect;
    const R = REG[kind];
    const out = [];
    const first = pickGlyphs(regionMask(img, rect, R.fr, resampled ? R.soft : R.test, true, resampled ? 110 : 75), rect, R);
    out.push({ name: "normal", glyphs: first });
    if (kind !== "count") return out;
    // the count sits hard in the tile's bottom-right corner; when nothing was found normally, a guess elsewhere is just icon texture
    const ox = Math.round(R.fr[0] * rect.w), oy = Math.round(R.fr[1] * rect.h);
    const corner = (list) => list.filter((g) => (ox + g.box.x1) / rect.w >= 0.78 && (oy + g.box.y1) / rect.h >= 0.78);
    const only = first.length ? (l) => l : corner;
    const soft = regionMask(img, rect, R.fr, R.soft, true, 110);
    const split = Object.assign({}, R, { grow: 0 });
    out.push({ name: "soft-split", glyphs: only(pickGlyphs(soft, rect, split)) });
    out.push({ name: "soft", glyphs: only(pickGlyphs(soft, rect, R)) });
    if (first.length) out.push({ name: "normal-split", glyphs: pickGlyphs(regionMask(img, rect, R.fr, resampled ? R.soft : R.test, true, resampled ? 110 : 75), rect, split) });
    if (out.some((v) => v.glyphs.length)) return out;
    // a real digit is a solid stroke shape (its mask fills 40-60% of its box); sparse grey specks of icon art or JPEG noise (about 14%)
    // are not digits, so a last-resort guess that is mostly empty is dropped instead of read as a number
    const dim = corner(pickGlyphs(regionMask(img, rect, R.fr, isCountPxDim, true, 110), rect, split)).filter((g) => g.box.n / (g.box.w * g.box.h) >= DIM_MIN_FILL);
    dim.forEach((g) => (g.dim = true));
    out.push({ name: "dim", glyphs: dim });
    return out;
  }
  function readGlyphs(img, rect, kind) {
    const v = readGlyphVariants(img, rect, kind).find((x) => x.glyphs.length);
    return v ? v.glyphs : [];
  }
  function classifyGlyph(g, templates) {
    // templates: [{d, f:[...], aspect}] -> {digit, dist, margin}
    let best = null, second = null;
    const perDigit = {};
    for (const t of templates) {
      let d = 0;
      for (let i = 0; i < g.f.length; i++) { const e = g.f[i] - t.f[i]; d += e * e; }
      d = d / g.f.length + 0.3 * Math.abs(g.aspect - t.aspect);
      if (perDigit[t.d] === undefined || d < perDigit[t.d]) perDigit[t.d] = d;
    }
    const arr = Object.entries(perDigit).sort((a, b) => a[1] - b[1]);
    best = arr[0]; second = arr[1];
    return { digit: best ? best[0] : null, dist: best ? best[1] : 9, margin: second ? second[1] - best[1] : 9 };
  }
  function classifyAll(gl, t) {
    const cl = gl.map((g) => classifyGlyph(g, t));
    const value = parseInt(cl.map((c) => c.digit).join(""), 10);
    // confidence: worst glyph (distance small, margin large)
    const conf = Math.min(...cl.map((c) => Math.min(1, Math.max(0, 1 - c.dist / 0.12)) * Math.min(1, c.margin / 0.03)));
    return { value, glyphs: gl.length, conf, cl };
  }
  // one reading of a number at one rect: the first way of cutting the glyphs that is sure, else the most confident one
  function readNumberOnce(img, rect, kind, templates) {
    let vars = readGlyphVariants(img, rect, kind).filter((v) => v.glyphs.length);
    // ORGANIZER: gear levels are up to 3 digits; a 4th glyph at the left is the bold "+" sign the plus filter missed (e.g. when it touches pale artwork)
    if (kind === "level") vars.forEach((v) => { if (v.glyphs.length === 4) v.glyphs = v.glyphs.slice(1); });
    // another way of cutting the glyphs only counts if it finds as many digits as the normal one (never drops or invents a digit)
    if (vars.length && vars[0].name === "normal") vars = vars.filter((v) => v.glyphs.length === vars[0].glyphs.length);
    if (!vars.length) return { value: null, glyphs: 0, conf: 1 };
    const t = templates && templates[kind] ? templates[kind] : [];
    let best = null;
    for (const v of vars) {
      if (!t.length || v.glyphs.length > 3) { if (!best) best = { value: null, glyphs: v.glyphs.length, conf: 0, raw: v.glyphs }; continue; }
      const r = classifyAll(v.glyphs, t); r.variant = v.name;
      // a lone blob found only by a loose cut (sparkle, glow, pale art) that looks like no digit at all (no real digit is ever this far from every template) is not a number
      if (v.name !== "normal" && v.glyphs.length === 1 && r.cl[0].dist > 0.13) continue;
      if (!best || best.value === null || r.conf > best.conf) best = r;
      if (best.conf >= FLAG.numConf) break; // the normal reading is trusted as soon as it is sure; others are only tried when it is not
    }
    return best || { value: null, glyphs: 0, conf: 1 };
  }
  // A sure reading is final. An unsure one (a digit touching a sparkle, pale art or JPEG noise can flip 2<->3 or 8<->6 on a sub-pixel shift of the
  // tile) is read again with the tile nudged by a fraction of a pixel in 8 directions; the value most of the readings agree on wins, and the
  // the result always stays flagged as unsure, but now shows the likelier value.
  const JIT = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  function readNumber(img, rect, kind, templates) {
    const first = readNumberOnce(img, rect, kind, templates);
    if (first.value === null || first.conf >= FLAG.numConf) return first;
    const step = Math.max(0.5, rect.w * 0.006), runs = [first];
    for (let i = 1; i < JIT.length; i++) {
      const r = readNumberOnce(img, { x: rect.x + JIT[i][0] * step, y: rect.y + JIT[i][1] * step, w: rect.w, h: rect.h }, kind, templates);
      if (r.value !== null) runs.push(r);
    }
    const votes = new Map();
    for (const r of runs) { const v = votes.get(r.value) || { n: 0, w: 0, best: r }; v.n++; v.w += r.conf + 0.05; if (r.conf > v.best.conf) v.best = r; votes.set(r.value, v); }
    let win = null;
    for (const v of votes.values()) if (!win || v.w > win.w) win = v;
    const out = Object.assign({}, win.best);
    const agree = win.n / runs.length;
    out.conf = Math.min(FLAG.numConf * 0.99, win.best.conf * (agree > 0.5 ? 1 : agree)); // a vote only picks the likelier value: it never makes an unsure read sure, so it stays flagged
    out.agree = agree;
    return out;
  }
  function isEquipped(img, rect) {
    ({ img, rect } = normTile(img, rect));
    const m = regionMask(img, rect, [0.66, 0.74, 0.92, 0.94], (r, g, b) => Math.max(r, g, b) < 50);
    let n = 0; for (let i = 0; i < m.m.length; i++) n += m.m[i];
    return n / m.m.length > 0.45;
  }
  // Transcend diamonds: small orange rhombi stacked bottom-up in a column at the left edge of the tile, in three fixed slots.
  // The tile is first area-resampled to a fixed DN x DN grid (so the result does not depend on the screenshot's resolution or
  // JPEG noise). Each slot is then scored by SHAPE: the share of a rhombus-shaped window that is bright yellow-orange (relative
  // colour ratios, not fixed RGB cut-offs), versus the share of the dark outline just around it. The icon's own orange glow
  // fills the surroundings too, so it never scores as a gem. A stack is counted bottom-up; if a slot is neither clearly a gem
  // nor clearly empty the tile is flagged instead of guessed.
  const DN = 128, DIA_CX = 0.155, DIA_SLOTS = [0.84, 0.64, 0.45], DIA_HW = 0.075, DIA_HH = 0.085;
  function isGemPixel(r, g, b) { return r >= 190 && g >= 80 && g / r >= 0.38 && g / r <= 0.97 && b / r < 0.55; }
  function slotMetrics(t, cy) {
    let inN = 0, inY = 0;
    const side = [[0, 0], [0, 0], [0, 0], [0, 0]]; // outline just outside the rhombus: left, right, above, below
    for (let y = 0; y < DN; y++) for (let x = 0; x < DN; x++) {
      const dx = Math.abs(x / DN - DIA_CX) / DIA_HW, dy = Math.abs(y / DN - cy) / DIA_HH, d = dx + dy;
      if (d > 1.6 || (d > 0.9 && d <= 1.15)) continue;
      const i = (y * DN + x) * 3, p = isGemPixel(t[i], t[i + 1], t[i + 2]);
      if (d <= 0.9) { inN++; if (p) inY++; } else { const k = dx > dy ? (x / DN < DIA_CX ? 0 : 1) : (y / DN < cy ? 2 : 3); side[k][0]++; if (p) side[k][1]++; }
    }
    const sh = side.map((q) => (q[0] ? q[1] / q[0] : 0));
    // ring: the worst side (the left side normally carries the tile's frame glow); open: the worst of right / above / below, which a lone gem keeps clear
    return { inner: inY / inN, ring: Math.max(...sh), open: Math.max(sh[1], sh[2], sh[3]), above: sh[2], below: sh[3] };
  }
  // -> "yes" | "no" | "maybe"
  function slotState(m, slot) {
    // a gem scores 0.44-0.55 (its lower half is dark red, so never near 1), an empty slot 0-0.12
    if (m.inner < 0.18) return "no";
    if (m.inner < 0.25) return m.ring <= 0.45 ? "maybe" : "no"; // a gem-coloured blob that is too small / dim to be sure: ask, do not guess zero
    // A gem stacked ABOVE another one (slot 1, 2) stands alone: the pixels to its right, above and below are not gem-coloured (measured on every
    // labelled tile: 0.00-0.20). The Essence orb's own fire glow fills slot 1 as well (a "+30" orb showed 2 diamonds with 1 real one): there
    // the surroundings are gem-coloured too (0.43-0.72), so the slot is no gem; in between it is a question, not a guess.
    if (slot > 0 && m.open !== undefined) {
      if (m.open > 0.34) return "no";
      if (m.open > 0.26) return "maybe";
    }
    if (m.inner >= 0.3 && m.ring <= 0.45) return "yes";
    // a strong gem (0.40+, real ones are 0.44-0.55) in the bottom slot with a sparkle or frame glow beside it (ring up to 0.6) is still a gem; no
    // empty bottom slot in any labelled tile scores above 0.06 there
    if (slot === 0 && m.inner >= 0.4 && m.ring <= 0.6) return "yes";
    return "maybe";
  }
  // -> { n, unsure }: n = gems counted bottom-up; unsure when the first slot that is not a gem is ambiguous
  function detectDiamonds(img, rect) {
    const t = resample(img, rect.x, rect.y, rect.w, rect.h, DN, DN);
    const st = DIA_SLOTS.map((cy, k) => slotState(slotMetrics(t, cy), k));
    let n = 0; while (n < 3 && st[n] === "yes") n++;
    // gems stack from the bottom, so whatever sits above an empty slot (icon glow, art) is not a gem and is ignored
    return { n, unsure: n < 3 && st[n] === "maybe", st };
  }
  function countDiamonds(img, rect) { return detectDiamonds(img, rect).n; }


  // ---------- 5. whole-screenshot analysis, de-duplication, merge ----------
  const TH = 24; // thumbnail size for row comparison
  const FLAG = { idScore: 0.4, idMargin: 0.1, numConf: 0.5 };
  // Two sure but different copy numbers for one tile almost always mean the screenshots show different inventory states (taken at different times or
  // in different sessions, e.g. before and after a craft), not a misread; the wording says so. Keeps the word "copy" (editing the number clears it).
  const FLAG_DIFFERS = "copy number differs between screenshots (probably taken at different times or in different sessions)";

  function thumb(img, rect, row, W) {
    const t = resample(img, rect.x, rect.y, rect.w, rect.h, TH);
    const valid = new Uint8Array(TH * TH);
    for (let gy = 0; gy < TH; gy++) {
      const y0 = rect.y + (gy * rect.h) / TH, y1 = rect.y + ((gy + 1) * rect.h) / TH;
      // partial rows: skip the faded strip next to the cut edge
      const mTop = row.kind === "top" ? 0.12 * rect.h : 0, mBot = row.kind === "bottom" ? 0.12 * rect.h : 0;
      const okBand = y0 >= row.visTop + mTop - 0.5 && y1 <= row.visBottom - mBot + 0.5;
      for (let gx = 0; gx < TH; gx++) {
        const x0 = rect.x + (gx * rect.w) / TH, x1 = rect.x + ((gx + 1) * rect.w) / TH;
        const pl = row.geo ? row.pill : { x0: PILL.x0 * W, x1: PILL.x1 * W, y0: PILL.y0 * W, y1: PILL.y1 * W };
        const inPill = !!pl && x1 > pl.x0 && x0 < pl.x1 && y1 > pl.y0 && y0 < pl.y1;
        valid[gy * TH + gx] = okBand && !inPill ? 1 : 0;
      }
    }
    return { t, valid };
  }

  // an empty inventory slot: no texture at all (luminance spread of the icon area below ~8, real icons are 20+)
  function flatTile(img, rect, band) {
    let n = 0, s1 = 0, s2 = 0;
    const y0 = rect.y + rect.h * Math.max(0.2, band ? band[0] : 0), y1 = rect.y + rect.h * Math.min(0.6, band ? band[1] : 1);
    for (let y = Math.floor(y0); y < y1; y += 2) for (let x = Math.floor(rect.x + rect.w * 0.2); x < rect.x + rect.w * 0.8; x += 2) {
      const i = (y * img.width + x) * 4, l = 0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2];
      n++; s1 += l; s2 += l * l;
    }
    if (n < 4) return false;
    const m = s1 / n;
    return Math.sqrt(Math.max(0, s2 / n - m * m)) < 8;
  }

  // A real tile has a crisp frame and artwork. A glow in the blurred background behind the popup (a dim gold haze with a faint sparkle) has no
  // sharp edges: the share of sharp luminance steps over the icon area is ~0.2 there, 0.43+ on every real tile of the fixtures. The check
  // only looks at the visible part of a cut-off tile.
  const SHARP_MIN = 0.3;
  function sharpShare(img, rect, band) {
    const NX = 48, f0 = Math.max(0.15, band ? band[0] : 0), f1 = Math.min(0.85, band ? band[1] : 1);
    if (f1 - f0 < 0.2) return null; // too little of the tile is visible to judge
    const x0 = rect.x + rect.w * 0.15, sw = rect.w * 0.7, y0 = rect.y + rect.h * f0, sh = rect.h * (f1 - f0);
    const NY = Math.max(8, Math.round(NX * (f1 - f0) / 0.7)), L = new Float32Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x = Math.min(img.width - 1, Math.max(0, Math.round(x0 + (sw * i) / NX))), y = Math.min(img.height - 1, Math.max(0, Math.round(y0 + (sh * j) / NY)));
      const q = (y * img.width + x) * 4;
      L[j * NX + i] = 0.3 * img.data[q] + 0.59 * img.data[q + 1] + 0.11 * img.data[q + 2];
    }
    let hi = 0, n = 0;
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = L[j * NX + i]; if (Math.abs(L[j * NX + i + 1] - a) + Math.abs(L[(j + 1) * NX + i] - a) > 24) hi++; n++; }
    return hi / n;
  }
  const looksBlurred = (img, rect, band) => { const v = sharpShare(img, rect, band); return v !== null && v < SHARP_MIN; };

  function readTile(img, rect, row, ctx) {
    const W = img.width;
    const ra = rarityOf(img, rect);
    const partial = row.kind !== "full";
    const band = partial ? [Math.max(0, (row.visTop - rect.y) / rect.h), Math.min(1, (row.visBottom - rect.y) / rect.h)] : null;
    // The frame colour decides Mythic (gold) vs Legendary (red), but a dimmed or partly visible tile, or a hue near the boundary, makes
    // that call shaky: then both groups are matched and the better icon match wins (a tile of another rarity matches neither well).
    const [hh, ss, vv] = ra.hsv;
    const shaky = (ra.rarity === "mythic" && hh < 27) || (ra.rarity === "legendary" && hh > 13);
    let rarity = ra.rarity, sc;
    const tile = { rarity, partial, kind: row.kind, flags: [] };
    // A row that the popup window (or the screenshot edge) cuts through is never read, never flagged and never counted: its count and Transcendence
    // sit at the bottom of the tile, so anything read there is a guess (a half-hidden Mace of Judgment or Evidence of Miracle showed up as a
    // "needs check, number none" row). The same artifact shows whole in the next overlapping screenshot, or the player adds it by hand.
    if (partial) { tile.ignored = true; tile.blurred = true; tile.cutOff = true; return tile; }
    // "other" (Epic, Rare, an empty slot, or a Legendary so dim/glowing that it fell out of both frame colours) stays skipped: promoting weak
    // guesses there made the same bottom row read differently in two screenshots and broke the row merge
    if (ra.rarity === "other") { tile.ignored = true; return tile; }
    // The Filter pill floats over the middle of a row cut by the grid window: a tile it touches shows part of the pill (dark bar, the word
    // Filter, the funnel) over its artwork, so any match is a guess (it once turned a Mace of Judgment into a second Fervor). Skip it
    // quietly; the same artifact shows whole in the next overlapping screenshot.
    if (row.kind === "bottom") {
      const pl = row.geo ? row.pill : { x0: PILL.x0 * W, x1: PILL.x1 * W, y0: PILL.y0 * W, y1: PILL.y1 * W };
      if (pl && rect.x + rect.w > pl.x0 && rect.x < pl.x1 && rect.y + rect.h > pl.y0 && rect.y < pl.y1) { tile.ignored = true; tile.blurred = true; tile.underPill = true; return tile; }
    }
    // a blurred glow outside the popup is not a tile (never matched, never flagged)
    if (!partial && looksBlurred(img, rect, band)) { tile.ignored = true; tile.blurred = true; return tile; }
    if (shaky) {
      const a = matchTile(ctx.matcher, img, rect, "mythic", band), b = matchTile(ctx.matcher, img, rect, "legendary", band);
      // the frame colour stays the default; the other group only wins when its icon match is clearly better
      const own = ra.rarity === "mythic" ? a : b, alt = ra.rarity === "mythic" ? b : a, altName = ra.rarity === "mythic" ? "legendary" : "mythic";
      let first = own, second = alt, fr = ra.rarity;
      if (alt[0].score >= FLAG.idScore && alt[0].score >= own[0].score + 0.1) { first = alt; second = own; fr = altName; }
      rarity = fr; tile.rarity = fr; sc = first;
      tile.otherGroupScore = second[0].score; // how well the other rarity group matched
      // if the two groups nearly tie, the margin is small and the tile is flagged for the player to pick
      if (first[0].score - second[0].score < 0.05) sc = first.map((x, i) => (i === 0 ? Object.assign({}, x, { margin: 0 }) : x));
    } else sc = matchTile(ctx.matcher, img, rect, ra.rarity, band);
    tile.id = sc[0].id; tile.name = sc[0].name; tile.idScore = sc[0].score; tile.idMargin = sc[0].margin === 0 ? 0 : sc[0].score - sc[1].score;
    tile.alts = sc.slice(0, 3).map((x) => ({ id: x.id, name: x.name, score: +x.score.toFixed(3) }));
    tile.equipped = false; tile.count = null; tile.diamonds = 0;
    // a known free item (never a recipe material): skipped silently, not listed, not flagged, not counted
    if (tile.id.startsWith(IGNORE_PREFIX) && tile.idScore >= FLAG.idScore) { tile.ignored = true; tile.ignoreKind = "free item"; return tile; }
    if (tile.idScore < FLAG.idScore || tile.idMargin < FLAG.idMargin) tile.flags.push("Not sure which artifact, please pick");
    const seeBottom = !partial || (band[1] > 0.97 && band[0] < 0.62);
    if (seeBottom) {
      tile.equipped = isEquipped(img, rect);
      if (!tile.equipped) {
        const r = readNumber(img, rect, "count", ctx.templates);
        if (r.value !== null) { tile.count = r.value; tile.countConf = r.conf; if (r.conf < FLAG.numConf) tile.flags.push("copy number unsure"); }
        else if (r.glyphs > 0) { tile.flags.push("copy number unreadable"); }
      }
    } else tile.flags.push("bottom of tile cut off (no copy count)");
    if (tile.id === FADED_ID) tile.diamonds = 0; // fodder never has diamonds
    else if (rarity === "legendary" && (!partial || (band[0] < 0.4 && band[1] > 0.9))) {
      const d = detectDiamonds(img, rect);
      tile.diamonds = d.n;
      if (d.unsure) tile.flags.push("diamond count unsure");
    }
    if (partial) tile.flags.push("only partly visible in this screenshot");
    return tile;
  }

  function analyze(img, ctx) {
    const fr = findRows(img);
    const W = img.width;
    const tileH = fr.tile || TILE * W;
    // rows with only a sliver visible (<30% of the tile) cannot be read or compared, skip them
    const rows = fr.rows.filter((r) => r.visBottom - r.visTop >= 0.3 * tileH).map((row) => {
      const cols = [];
      for (let c = 0; c < 5; c++) {
        const rect = tileRect(W, row, c);
        cols.push({ col: c, rect, thumb: thumb(img, rect, row, W), tile: readTile(img, rect, row, ctx) });
      }
      return { kind: row.kind, top: row.top, bottom: row.bottom, visTop: row.visTop, visBottom: row.visBottom, cols };
    });
    return { rows, height: img.height, tileH, error: fr.error };
  }

  // A screenshot is only called cut off when the picture itself slices through a row of tiles (a tile reaches past the top or the
  // bottom edge of the image). The list window of the game fades out at its own edges, and a short or wide screen (an emulator, say)
  // simply shows fewer rows: that is a normal screenshot, so the number of complete rows does not matter.
  function cropCheck(analysis) {
    const H = analysis.height, tol = 0.04 * (analysis.tileH || 0);
    const clipped = analysis.rows.filter((r) => r.bottom > H + tol || r.top < -tol).length;
    return { full: analysis.rows.filter((r) => r.kind === "full").length, clipped, cropped: clipped > 0 };
  }

  // similarity of two rows seen in different screenshots: mean zero-mean normalised correlation of the
  // 5 tile thumbnails over cells valid in both (invariant to the dimming near the edges of the viewport).
  function rowSimilarity(a, b) {
    let sum = 0, cols = 0, cells = 0, worst = 1;
    for (let c = 0; c < 5; c++) {
      const A = a.cols[c].thumb, B = b.cols[c].thumb;
      const idx = [];
      for (let i = 0; i < TH * TH; i++) if (A.valid[i] && B.valid[i]) idx.push(i);
      if (idx.length < 60) continue;
      const lum = (T, i) => (T.t[i * 3] + T.t[i * 3 + 1] + T.t[i * 3 + 2]) / 3;
      let ma = 0, mb = 0;
      for (const i of idx) { ma += lum(A, i); mb += lum(B, i); }
      ma /= idx.length; mb /= idx.length;
      let sab = 0, saa = 0, sbb = 0;
      for (const i of idx) { const x = lum(A, i) - ma, y = lum(B, i) - mb; sab += x * y; saa += x * x; sbb += y * y; }
      const r = sab / (Math.sqrt(saa * sbb) || 1);
      sum += r; cols++; cells += idx.length; worst = Math.min(worst, r);
    }
    return cols >= 2 && cells >= 200 ? { d: sum / cols, cols, cells, worst } : { d: -1, cols, cells, worst: -1 };
  }

  const SAME_ROW = 0.68, SAME_WORST = 0.45; // mean / worst-column correlation above which two rows are the same row
  // analyses: [{rows}] one per screenshot (any order). Returns merged tile list + log.
  function merge(analyses) {
    const nodes = [];
    analyses.forEach((an, si) => an.rows.forEach((row, ri) => nodes.push({ si, ri, row, id: nodes.length })));
    const parent = nodes.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const log = [], pairs = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].si === nodes[j].si) continue;
      const r = rowSimilarity(nodes[i].row, nodes[j].row);
      if (r.d > SAME_ROW && r.worst > SAME_WORST) {
        pairs.push({ i, j, d: r.d });
        log.push({ a: [nodes[i].si, nodes[i].ri], b: [nodes[j].si, nodes[j].ri], d: +r.d.toFixed(2) });
      }
    }
    // strongest matches first; a group never takes two rows of the same screenshot (they are different rows by definition), so a weak
    // look-alike match cannot chain two adjacent rows into one and drop one of them
    const shots = nodes.map((n) => new Set([n.si]));
    pairs.sort((p, q) => q.d - p.d);
    for (const { i, j } of pairs) {
      const a = find(i), b = find(j);
      if (a === b || [...shots[b]].some((s) => shots[a].has(s))) continue;
      parent[b] = a; shots[b].forEach((s) => shots[a].add(s));
    }
    const groups = new Map();
    nodes.forEach((n) => { const k = find(n.id); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
    const out = [];
    let duplicates = 0;
    for (const members of groups.values()) {
      // prefer a full row, then the row with the fewest flags (a clean reading of the same tiles beats one that asks), then the most visible one
      // (heights are compared whole pixels: two full rows differ by float noise only, which must not pick the representative)
      const nFlags = (m) => m.row.cols.reduce((a, c) => a + (c.tile && !c.tile.ignored ? c.tile.flags.length : 0), 0);
      members.sort((p, q) => (q.row.kind === "full") - (p.row.kind === "full") || nFlags(p) - nFlags(q) || Math.round(q.row.visBottom - q.row.visTop) - Math.round(p.row.visBottom - p.row.visTop));
      const rep = members[0];
      duplicates += members.length - 1;
      // a partial-only row: merge the top-cut and bottom-cut views if both exist (count from bottom view, level from top view)
      for (let c = 0; c < 5; c++) {
        const tile = Object.assign({}, rep.row.cols[c].tile);
        tile.flags = tile.flags.slice();
        tile.src = { shot: rep.si + 1, row: rep.ri, col: c, seenIn: members.map((m) => m.si + 1) };
        // a diamond count the representative was unsure about is taken from another full view of the same tile that read it cleanly
        // (the tile is identical in every screenshot; only the read differed, e.g. a sparkle beside the gem)
        if (rep.row.kind === "full" && members.length > 1 && !tile.ignored && tile.id && tile.flags.includes("diamond count unsure")) {
          const clean = members.find((m) => m !== rep && m.row.kind === "full" && m.row.cols[c].tile.id === tile.id && !m.row.cols[c].tile.ignored && !m.row.cols[c].tile.flags.includes("diamond count unsure"));
          if (clean) { tile.diamonds = clean.row.cols[c].tile.diamonds; tile.flags = tile.flags.filter((f) => f !== "diamond count unsure"); }
        }
        // the same tile seen in several screenshots must give one copy number: when the readings differ, the surest one wins; two sure but different
        // readings are never silently averaged - the tile is flagged for a manual check
        if (rep.row.kind === "full" && members.length > 1 && !tile.ignored && tile.id && !tile.equipped && tile.count != null) {
          const seen = members.filter((m) => m.row.kind === "full" && m.row.cols[c].tile.id === tile.id && !m.row.cols[c].tile.ignored && !m.row.cols[c].tile.equipped && m.row.cols[c].tile.count != null).map((m) => m.row.cols[c].tile);
          const best = seen.reduce((a, b) => ((b.countConf || 0) > (a.countConf || 0) ? b : a), tile);
          const sure = seen.filter((t) => (t.countConf || 0) >= FLAG.numConf);
          if (best.count !== tile.count) {
            tile.count = best.count; tile.countConf = best.countConf;
            tile.flags = tile.flags.filter((f) => f !== "copy number unsure");
            if ((best.countConf || 0) < FLAG.numConf) tile.flags.push("copy number unsure");
          }
          if (new Set(sure.map((t) => t.count)).size > 1 && !tile.flags.some((f) => /differs between screenshots/.test(f))) tile.flags.push(FLAG_DIFFERS);
        }
        if (rep.row.kind !== "full" && members.length > 1 && !tile.ignored) {
          const other = members.find((m) => m !== rep && m.row.kind !== "full" && m.row.kind !== rep.row.kind);
          if (other) {
            const o = other.row.cols[c].tile;
            const top = rep.row.kind === "bottom" ? tile : o, bot = rep.row.kind === "bottom" ? o : tile;
            if (!o.ignored && o.id === tile.id) {
              tile.count = bot.count; tile.equipped = bot.equipped || tile.equipped; tile.diamonds = Math.max(top.diamonds, bot.diamonds);
              tile.flags = tile.flags.filter((f) => !/cut off|partly visible/.test(f));
              tile.partial = false;
            }
          }
        }
        out.push(tile);
      }
    }
    // stable order: by first screenshot and row position
    out.sort((a, b) => a.src.shot - b.src.shot || a.src.row - b.src.row || a.src.col - b.src.col);
    return { tiles: out, duplicatesDropped: duplicates, rowMatches: log };
  }

  // Same rule as Advisor.tileCopies: N (printed number, default 1) x (1 diamond = 2, 2 = 2, 3 = 4; no diamonds = 1).
  const copiesOf = (t) => (t.count > 0 ? t.count : 1) * (t.diamonds > 0 ? { 1: 2, 2: 2, 3: 4 }[Math.min(3, t.diamonds)] : 1);
  // Turn merged tiles into the advisor's state.
  function toState(tiles) {
    const mythics = {}, legendaryCopies = {};
    let faded = 0;
    for (const t of tiles) {
      if (t.ignored || !t.id) continue;
      if (t.id === FADED_ID) { faded += t.count > 0 ? t.count : 1; continue; } // fodder only: never counts toward any recipe's Legendary copies
      if (t.rarity === "mythic") mythics[t.id] = (mythics[t.id] || 0) + (t.count > 0 ? t.count : 1); // unequipped Mythics stack: a tile with printed N = N owned (no number / equipped = 1); level not checked (assumed maxed)
      else if (t.rarity === "legendary") legendaryCopies[t.id] = (legendaryCopies[t.id] || 0) + copiesOf(t);
    }
    return { mythics, legendaryCopies, fadedFodder: faded };
  }

  return { FLAG_DIFFERS, looksBlurred, sharpShare, rarityOf, slotState, slotMetrics: (img, rect) => { const t = resample(img, rect.x, rect.y, rect.w, rect.h, DN, DN); return DIA_SLOTS.map((cy) => slotMetrics(t, cy)); }, findRowsLegacy, findRows, findGrid, gridRows, FADED_ID, IGNORE_PREFIX, analyze, merge, cropCheck, toState, rowSimilarity, thumb, readTile, FLAG, readGlyphs, readGlyphVariants, isPlusGlyph, readNumber, isEquipped, countDiamonds, detectDiamonds, normTile, REG, COL_CENTERS, TILE, PITCH, PILL, VIEW, N, px, resample, rgb2hsv, findRows, tileRect, rarityOf, buildMatcher, matchTile, groupOf };
});
