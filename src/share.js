// Share image: a compact PNG of the Equipment recap for Discord. EVERY piece is shown as a small tile (sprite, diamonds, E).
// model() is pure (no DOM, tested in Node); render() paints it on a canvas in the browser (no network, no server: the sprites are the site's own files).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Share = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const W = 1100, PAD = 36;
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const CLASS_NAME = { STR: "Strength", AGI: "Agility", INT: "Intelligence" };
  const SLOT_NAME = { helmet: "Helmet", armor: "Armor", boots: "Boots", weapon: "Weapon" };
  const SLOTS = ["helmet", "armor", "boots", "weapon"];
  const CLASSES = ["STR", "AGI", "INT"];
  const spriteId = (p) => String(p.cls || "").toLowerCase() + "-" + p.slot;
  const order = (a, b) => b.diamonds - a.diamonds || b.refinedCount - a.refinedCount || (b.equipped ? 1 : 0) - (a.equipped ? 1 : 0);

  // ---------- model ----------
  // pieces: [{cls, slot, diamonds, refinedCount, equipped}]; R: Gear.recap(pieces)
  function model(pieces, R, opts) {
    // The top refinedCount diamonds are icy. The ones below them stay gold (+2 refined = 2 icy, 1 gold).
    const tile = (p) => { const d = Math.min(3, p.diamonds || 0), refinedCount = Math.min(d, p.refinedCount || 0); return { sprite: spriteId(p), diamonds: d, refinedCount, refined: refinedCount > 0, equipped: !!p.equipped }; };
    const classes = CLASSES.map((cls) => {
      const mine = pieces.filter((p) => p.cls === cls);
      return {
        cls, name: CLASS_NAME[cls], total: mine.length, fullSets: Math.min(...SLOTS.map((sl) => mine.filter((p) => p.slot === sl).length)),
        slots: SLOTS.map((slot) => { const tiles = mine.filter((p) => p.slot === slot).sort(order).map(tile); return { slot, name: SLOT_NAME[slot], tiles, refined: tiles.filter((t) => t.refined).length }; }).filter((s) => s.tiles.length),
      };
    });
    const C = (c) => R.byClass[c];
    return {
      title: "SOULS Gear Advisor", sub: "Equipment", date: (opts && opts.date) || "", total: pieces.length,
      stats: {
        byClass: CLASSES.map((c) => ({ cls: c, name: CLASS_NAME[c], total: C(c).total, refined: C(c).refined, plain: C(c).plain, equipped: C(c).equipped, spare: C(c).spare })),
        slotStats: SLOTS.map((sl) => ({ slot: sl, name: SLOT_NAME[sl], all: R.slotStats[sl], byClass: CLASSES.map((c) => R.byClass[c].slotStats[sl]) })),
        refined: R.refined, plain: R.plain, noDiamonds: R.noDiamonds, transc: [0, 1, 2, 3].map((d) => R.transc[d] || 0),
        equipped: R.equipped, spare: R.spare,
      },
      classes,
      spriteIds: [...new Set(pieces.map(spriteId))],
    };
  }

  // ---------- canvas drawing ----------
  const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const HEAD = '"Cinzel","Trajan Pro","Palatino Linotype","Book Antiqua",Palatino,"Iowan Old Style",Georgia,serif';
  // the site's own palette (CSS variables of :root); nothing new
  const DEFAULT_THEME = { bg: "#14100b", panel: "#201912", panel2: "#2a241b", line: "#4d3f27", line2: "#5a4a2e", gold: "#e3b95b", gold2: "#c99a3b", ink: "#f0e6d2", mut: "#a89a7c", ok: "#9bd37a", mythic: "#dfa856", frame: "#17120c", onGold: "#1b1208" };
  function themeFromCss(el) {
    const cs = getComputedStyle(el || document.documentElement), t = { ...DEFAULT_THEME };
    for (const k of ["bg", "panel", "panel2", "line", "line2", "gold", "gold2", "ink", "mut", "ok", "mythic"]) { const v = cs.getPropertyValue("--" + k).trim(); if (v) t[k] = v; }
    return t;
  }
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  const font = (c, w, px, fam) => { c.font = `${w} ${px}px ${fam || SANS}`; };
  // Refined vs normal diamonds must be easy to tell apart: normal = saturated gold, refined (platinum) = icy pale blue-white.
  const GOLD = { hi: "#ffd54a", lo: "#f09a00", edge: "#7a4a00" }, ICE = { hi: "#f4fcff", lo: "#9fd6f2", edge: "#3f8ab5" };
  function gem(c, T, cx, cy, r, refined) {
    const K = refined ? ICE : GOLD;
    c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r * 0.85, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r * 0.85, cy); c.closePath();
    const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, K.hi); g.addColorStop(1, K.lo);
    c.fillStyle = g; c.fill(); c.lineJoin = "round"; c.lineWidth = 1.6; c.strokeStyle = K.edge; c.stroke();
  }
  const TILE = 64, GAP = 8, LABEL_W = 170;
  function tile(c, T, t, imgs, x, y) {
    c.save();
    rr(c, x, y, TILE, TILE, 9); c.fillStyle = T.frame; c.fill(); c.lineWidth = 2.5; c.strokeStyle = T.mythic; rr(c, x + 1.25, y + 1.25, TILE - 2.5, TILE - 2.5, 8); c.stroke();
    const img = imgs[t.sprite];
    if (img) { const box = TILE - 14, s = Math.min(box / img.width, box / img.height); const w = img.width * s, h = img.height * s; c.drawImage(img, x + (TILE - w) / 2 + 3, y + (TILE - h) / 2 + 3, w, h); }
    for (let i = 0; i < t.diamonds; i++) gem(c, T, x + 10, y + TILE - 12 - i * 15, 7, i >= t.diamonds - (t.refinedCount || 0));
    if (t.equipped) { rr(c, x + TILE - 19, y + TILE - 19, 16, 16, 4); c.fillStyle = T.bg; c.fill(); c.lineWidth = 1.5; c.strokeStyle = T.line2; c.stroke(); font(c, "800", 12, HEAD); c.fillStyle = T.ink; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("E", x + TILE - 11, y + TILE - 10.5); }
    c.restore();
  }
  const perRow = () => Math.floor((W - 2 * PAD - LABEL_W + GAP) / (TILE + GAP));
  // Paints the model. Returns the height used. Call with draw=false to measure, then size the canvas and call again with draw=true (render() does both).
  function paint(c, T, m, imgs, draw) {
    let y = PAD;
    const text = (s, x, yy, px, w, col, fam, al) => { font(c, w, px, fam); c.fillStyle = col; c.textAlign = al || "left"; c.textBaseline = "alphabetic"; c.fillText(s, x, yy); };
    if (draw) { c.fillStyle = T.bg; c.fillRect(0, 0, W, 8000); const g = c.createLinearGradient(0, 0, 0, 420); g.addColorStop(0, "rgba(227,185,91,.10)"); g.addColorStop(1, "rgba(227,185,91,0)"); c.fillStyle = g; c.fillRect(0, 0, W, 420); }
    // header
    if (draw) {
      text(m.title, PAD, y + 38, 40, "700", T.ink, '"Palatino Linotype", Palatino, Georgia, serif');
      text(`${m.sub} \u00b7 ${fmt(m.total)} piece${m.total === 1 ? "" : "s"}`, PAD, y + 76, 24, "500", T.mut);
      if (m.date) text(m.date, W - PAD, y + 38, 20, "500", T.mut, SANS, "right");
    }
    y += 100;
    // class totals
    const cw = (W - 2 * PAD - 24) / 3, ch = 104;
    m.stats.byClass.forEach((k, i) => {
      if (!draw) return;
      const x = PAD + i * (cw + 12);
      c.save(); rr(c, x, y, cw, ch, 12); c.fillStyle = "rgba(0,0,0,.28)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.gold2; c.stroke(); c.restore();
      text(k.cls, x + 18, y + 34, 24, "700", T.gold, HEAD); text(k.name.toUpperCase(), x + 18, y + 58, 14, "700", T.mut);
      text(fmt(k.total), x + cw - 18, y + 52, 46, "700", T.ink, HEAD, "right");
      text(`Refined ${k.refined} \u00b7 Normal ${k.plain}`, x + 18, y + 80, 16, "500", T.mut);
      text(`Equipped ${k.equipped} \u00b7 Spare ${k.spare}`, x + 18, y + 98, 16, "500", T.mut);
    });
    y += ch + 14;
    // refined | transcendence | equipped
    const s = m.stats, qw = (W - 2 * PAD - 24) / 3, lines = 4, qh = 40 + lines * 25 + 8;
    const cells = [
      ["GEAR TYPE", [[`Refined`, s.refined], [`Normal`, s.plain], [`Not yet Upgrade`, s.noDiamonds]]],
      ["TRANSCENDENCE", s.transc.map((n, d) => [d ? "\u25c6".repeat(d) : "None", n])],
      ["EQUIPPED", [["Equipped", s.equipped], ["Spare", s.spare]]],
    ];
    cells.forEach(([head, rows], i) => {
      if (!draw) return;
      const x = PAD + i * (qw + 12);
      c.save(); rr(c, x, y, qw, qh, 12); c.fillStyle = "rgba(0,0,0,.25)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.line2; c.stroke(); c.restore();
      text(head, x + 16, y + 28, 14, "700", T.mut);
      rows.forEach(([label, n], k) => { text(label, x + 16, y + 56 + k * 25, 18, "500", T.ink); text(fmt(n), x + qw - 16, y + 56 + k * 25, 18, "700", i === 0 && k === 0 ? ICE.hi : T.gold, SANS, "right"); });
    });
    y += qh + 14;
    // refined per slot: slot x (all, STR, AGI, INT), "refined / pieces"
    const rowH = 30, th = 78 + 5 * rowH - 8;
    if (draw) {
      c.save(); rr(c, PAD, y, W - 2 * PAD, th, 12); c.fillStyle = "rgba(0,0,0,.25)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.line2; c.stroke(); c.restore();
      text("REFINED PER SLOT", PAD + 16, y + 28, 14, "700", T.mut); text("refined / pieces", W - PAD - 16, y + 28, 14, "500", T.mut, SANS, "right");
      const xs = [W - PAD - 16 - 3 * 150, W - PAD - 16 - 2 * 150, W - PAD - 16 - 150, W - PAD - 16];
      ["ALL", "STR", "AGI", "INT"].forEach((h, i) => text(h, xs[i], y + 54, 14, "700", i ? T.gold : T.mut, SANS, "right"));
      c.fillStyle = T.line; c.fillRect(PAD + 16, y + 62, W - 2 * PAD - 32, 1);
      const rows = [...s.slotStats.map((r) => [r.name, [r.all, ...r.byClass]]), ["All slots", [{ total: m.total, refined: s.refined }, ...s.byClass.map((k) => ({ total: k.total, refined: k.refined }))]]];
      rows.forEach(([name, vals], k) => {
        const yy = y + 86 + k * rowH, last = k === rows.length - 1;
        if (last) { c.fillStyle = T.line2; c.fillRect(PAD + 16, yy - 22, W - 2 * PAD - 32, 1); }
        text(name, PAD + 16, yy, 19, last ? "700" : "600", T.ink);
        vals.forEach((v, i) => {
          font(c, "500", 19); const tail = `/ ${v.total}`, tw = c.measureText(tail).width;
          text(tail, xs[i], yy, 19, "500", T.mut, SANS, "right"); text(String(v.refined), xs[i] - tw - 6, yy, 21, "800", ICE.hi, SANS, "right");
        });
      });
    }
    y += th + 24;
    // class sections, every piece as a tile
    const pr = perRow();
    for (const k of m.classes) {
      if (!k.total) continue;
      if (draw) {
        text(`${k.name} (${k.cls})`, PAD, y + 26, 28, "700", T.gold, HEAD);
        text(`${k.total} piece${k.total === 1 ? "" : "s"} \u00b7 ${k.fullSets} full set${k.fullSets === 1 ? "" : "s"}`, W - PAD, y + 26, 20, "500", T.mut, SANS, "right");
        c.fillStyle = T.line2; c.fillRect(PAD, y + 38, W - 2 * PAD, 2);
      }
      y += 54;
      for (const sl of k.slots) {
        const rows = Math.ceil(sl.tiles.length / pr);
        if (draw) {
          text(sl.name, PAD, y + 28, 20, "700", T.ink); text(`${sl.tiles.length} piece${sl.tiles.length === 1 ? "" : "s"}`, PAD, y + 50, 16, "500", T.mut);
          text(`${sl.refined} refined`, PAD, y + 70, 16, "700", ICE.hi);
          sl.tiles.forEach((t, i) => tile(c, T, t, imgs, PAD + LABEL_W + (i % pr) * (TILE + GAP), y + Math.floor(i / pr) * (TILE + GAP)));
        }
        y += rows * (TILE + GAP) + 6;
      }
      y += 14;
    }
    // legend
    if (draw) {
      c.fillStyle = T.line2; c.fillRect(PAD, y, W - 2 * PAD, 2);
      const ly = y + 38; let x = PAD;
      gem(c, T, x + 9, ly - 6, 9, false); text("gold = normal", x + 26, ly, 18, "600", T.ink); x += 190;
      gem(c, T, x + 9, ly - 6, 9, true); text("icy white-blue = refined", x + 26, ly, 18, "600", T.ink); x += 280;
      text("E = equipped", x, ly, 18, "500", T.mut);
    }
    y += 70;
    return y;
  }
  // browser: loads the sprites (same origin) and draws. spriteUrl(id) -> URL. Resolves a canvas.
  async function render(m, o) {
    const T = o.theme || themeFromCss();
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    if (document.fonts && document.fonts.load) { try { await Promise.all([document.fonts.load('700 40px "Cinzel"'), document.fonts.load("700 24px " + SANS)]); } catch (e) { /* the fallback serif is used */ } }
    const imgs = {}; await Promise.all(m.spriteIds.map(async (id) => { imgs[id] = await load(o.spriteUrl(id)); }));
    const cv = document.createElement("canvas"); cv.width = W; cv.height = 10; let c = cv.getContext("2d");
    const H = Math.ceil(paint(c, T, m, imgs, false));
    cv.width = W; cv.height = H; c = cv.getContext("2d"); c.imageSmoothingQuality = "high";
    paint(c, T, m, imgs, true);
    return cv;
  }
  const toBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("The picture could not be made"))), "image/png"));
  return { WIDTH: W, TILE, model, render, toBlob, themeFromCss, DEFAULT_THEME, fmt, perRow, spriteId };
});
