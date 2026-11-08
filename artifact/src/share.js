// Share image: a PNG summary of the advice for Discord (Dimensional Essences, What artifact you can craft?, what the player owns).
// model() is pure (no DOM, testable in Node); draw() paints it on a canvas in the browser (no network, no server: the icons are the site's own files).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Share = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const URL_TEXT = "linlin92.github.io/souls-organizer";
  const W = 1100, PAD = 36;
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  // One number when every name is a single copy. Both numbers when copies and names disagree, so the heading cannot be read as a loss.
  function countLabel(name, copies, types) {
    if (copies === types) return `${name} (${copies})`;
    return `${name} (${copies} copies, ${types} types)`;
  }

  // ---------- model ----------
  // V = Advisor.view(res); state = { mythics: {id: copies}, legendaryCopies: {id: copies} }; data = { artifacts }
  function model(V, state, data, opts) {
    const byId = Object.fromEntries(data.artifacts.map((a) => [a.id, a]));
    const nm = (id) => (byId[id] ? byId[id].name : id);
    const L = V.craftable || [];
    const can = { count: L.length, rows: L.map((x) => ({ id: x.id, name: x.name, group: x.group, have: x.have, qty: x.qty, ingredient: x.ingredient, owned: x.owned || 0, gk: x.gk || "" })) };
    // what the player owns: every Mythic (copies), and the Legendaries a Mythic recipe uses first, most copies first
    const ingr = new Set(data.artifacts.flatMap((a) => (a.ingredients || []).map((g) => g.id)));
    const mythics = Object.entries(state.mythics || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ id, name: nm(id), n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const primals = Object.entries(state.primals || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ id, name: nm(id), n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const legs = Object.entries(state.legendaryCopies || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ id, name: nm(id), n, key: ingr.has(id) }))
      .sort((a, b) => (b.key - a.key) || b.n - a.n || a.name.localeCompare(b.name));
    const sum = (rows) => rows.reduce((s, r) => s + r.n, 0);
    // The parenthetical is copies, the same total the on-page recap adds up. Types stay beside it when a name is owned more than once,
    // so "Death ×3" is not mistaken for a missing row. Every id with n > 0 is listed; nothing is dropped between the accepted inventory and the chips.
    const owned = {
      mythics, mythicCopies: sum(mythics), mythicTypes: mythics.length,
      primals, primalCopies: sum(primals), primalTypes: primals.length,
      legendaries: legs, legendaryCopies: sum(legs), legendaryTypes: legs.length,
    };
    return { essence: (opts && opts.essence != null ? opts.essence : V.hero && V.hero.have != null ? V.hero.have : 0), pvp: !!V.pvp, can, owned, url: URL_TEXT };
  }

  // ---------- canvas drawing ----------
  const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const HEAD = '"Cinzel","Trajan Pro","Palatino Linotype","Book Antiqua",Palatino,"Iowan Old Style",Georgia,serif';
  // the site's own palette (CSS variables of :root) plus the few literal tones its stylesheet already uses
  const DEFAULT_THEME = { bg: "#14100b", panel: "#201912", panel2: "#2a241b", line: "#4d3f27", line2: "#5a4a2e", gold: "#e3b95b", gold2: "#c99a3b", ink: "#f0e6d2", mut: "#a89a7c", ok: "#9bd37a",
    mythic: "#dfa856", legendary: "#d98560", primal: "#88e4e0", frame: "#17120c", onGold: "#1b1208", goldLight: "#f0d487" };
  function themeFromCss(el) {
    const cs = getComputedStyle(el || document.documentElement), t = { ...DEFAULT_THEME };
    for (const k of ["bg", "panel", "panel2", "line", "line2", "gold", "gold2", "ink", "mut", "ok", "mythic", "legendary", "primal"]) { const v = cs.getPropertyValue("--" + k).trim(); if (v) t[k] = v; }
    return t;
  }
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  const font = (c, w, px, fam) => { c.font = `${w} ${px}px ${fam || SANS}`; };
  function fit(c, text, maxW) { if (c.measureText(text).width <= maxW) return text; let s = text; while (s.length > 1 && c.measureText(s + "\u2026").width > maxW) s = s.slice(0, -1); return s.trimEnd() + "\u2026"; }
  const rarityColor = (T, r) => (r === "legendary" ? T.legendary : r === "primal" ? T.primal : r === "ui" ? T.line2 : T.mythic);
  function frame(c, T, img, x, y, s, rarity, bw) {
    bw = bw || Math.max(2, Math.round(s / 20));
    c.save(); rr(c, x, y, s, s, s * 0.14); c.fillStyle = T.frame; c.fill(); c.lineWidth = bw; c.strokeStyle = rarityColor(T, rarity); rr(c, x + bw / 2, y + bw / 2, s - bw, s - bw, s * 0.14); c.stroke();
    if (img) { const p = bw + s * 0.05, d = s - 2 * p; c.drawImage(img, x + p, y + p, d, d); }
    c.restore();
  }
  // a pill (badge) with text; returns its width. style: "mut" (outlined grey) | "gold" | "solid" (gold fill, dark text) | "ok"
  function pill(c, T, text, x, y, h, px, style, align) {
    font(c, "600", px); const tw = c.measureText(text).width, w = Math.ceil(tw + h * 0.9); const x0 = align === "right" ? x - w : x;
    c.save(); rr(c, x0, y, w, h, h / 2);
    if (style === "solid") { c.fillStyle = T.gold; c.fill(); }
    else if (style === "gold") { c.fillStyle = "rgba(227,185,91,.10)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.gold2; c.stroke(); }
    else if (style === "never") { c.fillStyle = "rgba(150,60,54,.14)"; c.fill(); c.lineWidth = 2; c.strokeStyle = "#8a4742"; c.stroke(); }
    else if (style === "caution") { c.fillStyle = "rgba(255,179,92,.08)"; c.fill(); c.lineWidth = 2; c.strokeStyle = "rgba(255,179,92,.55)"; c.stroke(); }
    else if (style === "ok") { c.fillStyle = "rgba(155,211,122,.10)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.gold2; c.stroke(); }
    else { c.fillStyle = "rgba(0,0,0,.25)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.line2; c.stroke(); }
    c.fillStyle = style === "solid" ? T.onGold : style === "gold" ? T.gold : style === "ok" ? T.ok : style === "never" ? "#e59a90" : style === "caution" ? "#ffb35c" : T.mut; c.textBaseline = "middle"; c.textAlign = "left"; c.fillText(text, x0 + (w - tw) / 2, y + h / 2 + 1); c.restore();
    return w;
  }
  // craft rows: 2 columns, 76px each. Mythic chips: 4 columns, the name wraps to 2 lines instead of being cut. Legendary tiles: 60px, as many per line as fit.
  const cell = { w: (W - 2 * PAD - 12) / 2, h: 76, gap: 8 };
  const canRows = (n) => Math.ceil(n / 2);
  const CHIP = { cols: 4, h: 46, gap: 8, icon: 36 };
  // the largest font (from px down to min) at which the name fits in maxLines lines; returns { px, lines }. Nothing is ever cut off.
  function nameLines(c, name, maxW, px, min, maxLines, weight) {
    for (let p = px; p >= min; p--) {
      font(c, weight, p); const words = String(name).split(/\s+/), lines = []; let cur = "";
      for (const w of words) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
      if (cur) lines.push(cur);
      if (lines.length <= maxLines && lines.every((l) => c.measureText(l).width <= maxW)) return { px: p, lines };
    }
    font(c, weight, min); return { px: min, lines: [fit(c, name, maxW)] };
  }
  function chipGrid(c, T, items, imgs, x0, y0, draw, rarity) {
    const w = (W - 2 * PAD - (CHIP.cols - 1) * CHIP.gap) / CHIP.cols, rows = Math.ceil(items.length / CHIP.cols);
    if (draw) items.forEach((it, i) => {
      const x = x0 + (i % CHIP.cols) * (w + CHIP.gap), y = y0 + Math.floor(i / CHIP.cols) * (CHIP.h + CHIP.gap);
      c.save(); rr(c, x, y, w, CHIP.h, 10); c.fillStyle = "rgba(0,0,0,.25)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.line2; c.stroke(); c.restore();
      frame(c, T, imgs[it.id], x + 5, y + (CHIP.h - CHIP.icon) / 2, CHIP.icon, rarity || "mythic", 2);
      const cnt = it.n > 1 ? "\u00d7" + it.n : ""; font(c, "700", 19); const cw = cnt ? c.measureText(cnt).width + 8 : 0;
      const tx = x + 5 + CHIP.icon + 8, mw = w - (tx - x) - 6 - cw, nl = nameLines(c, it.name, mw, 18, 14, 2, "600");
      font(c, "600", nl.px); c.fillStyle = T.ink; c.textAlign = "left"; c.textBaseline = "middle";
      nl.lines.forEach((l, k) => c.fillText(l, tx, y + CHIP.h / 2 + 1 + (k - (nl.lines.length - 1) / 2) * (nl.px + 2)));
      if (cnt) { font(c, "700", 19); c.fillStyle = T.gold; c.textAlign = "right"; c.fillText(cnt, x + w - 8, y + CHIP.h / 2 + 1); }
    });
    return { rows, h: rows ? rows * CHIP.h + (rows - 1) * CHIP.gap : 0 };
  }
  function legGrid(c, T, items, imgs, x0, y0, draw) {
    const S = 60, GAPX = 10, GAPY = 12, cols = Math.floor((W - 2 * PAD + GAPX) / (S + GAPX)); const rows = Math.ceil(items.length / cols);
    if (draw) items.forEach((it, i) => {
      const x = x0 + (i % cols) * (S + GAPX), y = y0 + Math.floor(i / cols) * (S + GAPY);
      frame(c, T, imgs[it.id], x, y, S, "legendary", 3);
      const t = "\u00d7" + it.n; font(c, "800", 17); const w = Math.ceil(c.measureText(t).width + 12);
      c.save(); rr(c, x + S - w + 7, y + S - 15, w, 24, 12); c.fillStyle = T.gold; c.fill(); c.lineWidth = 3; c.strokeStyle = T.panel; c.stroke();
      c.fillStyle = T.onGold; c.textBaseline = "middle"; c.textAlign = "center"; c.fillText(t, x + S - w / 2 + 7, y + S - 3); c.restore();
    });
    return { rows, h: rows ? rows * S + (rows - 1) * GAPY : 0 };
  }

  // Paints the model. cv: a canvas element (browser) / anything with getContext; imgs: { id: Image } (missing icons are left empty); essImg / noahImg: ui icons.
  // Returns the height used. Call once with draw=false to measure, then set the canvas size and call again with draw=true (render() does both).
  function paint(c, T, m, imgs, ui, draw) {
    let y = 0;
    const text = (s, x, yy, px, w, col, fam, al) => { font(c, w, px, fam); c.fillStyle = col; c.textAlign = al || "left"; c.textBaseline = "alphabetic"; c.fillText(s, x, yy); };
    if (draw) { c.fillStyle = T.bg; c.fillRect(0, 0, W, 6000); const g = c.createLinearGradient(0, 0, 0, 420); g.addColorStop(0, "rgba(227,185,91,.10)"); g.addColorStop(1, "rgba(227,185,91,0)"); c.fillStyle = g; c.fillRect(0, 0, W, 420); }
    // header: Noah + title (left), Dimensional Essences (right)
    y = PAD;
    if (draw) {
      if (ui.noah) c.drawImage(ui.noah, PAD, y + 4, 72, 72);
      text("SOULS Artifact Advisor", PAD + 88, y + 38, 38, "700", T.ink, HEAD);
      text(m.pvp ? "Craft order for a PvP player" : "What to craft next", PAD + 88, y + 74, 24, "500", T.mut);
      const bw = 360, bx = W - PAD - bw;
      c.save(); rr(c, bx, y, bw, 88, 14); c.fillStyle = "rgba(0,0,0,.3)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.gold2; c.stroke(); c.restore();
      text("DIMENSIONAL ESSENCE", bx + 20, y + 30, 18, "700", T.mut);
      if (ui.ess) c.drawImage(ui.ess, bx + 20, y + 40, 38, 43);
      text(fmt(m.essence), bx + 68, y + 76, 44, "700", T.gold, HEAD);
    }
    y += 88 + 26;
    // What artifact you can craft?
    const cnt = m.can;
    if (draw) {
      text("What artifact you can craft?", PAD, y + 28, 30, "700", T.ink, HEAD);
      font(c, "700", 30, HEAD); const tw = c.measureText("What artifact you can craft?").width;
      pill(c, T, String(cnt.count), PAD + tw + 18, y + 3, 34, 21, "gold");
    }
    y += 42;
    if (draw) text(cnt.count ? `${cnt.count} Mythic${cnt.count > 1 ? "s" : ""} you have the Legendary artifacts for right now. Not everything here is worth crafting.` : "Nothing yet. A Mythic needs several copies of its Legendary artifact, so keep collecting.", PAD, y + 20, 21, "500", T.mut);
    y += 34;
    if (cnt.rows.length) {
      cnt.rows.forEach((r, i) => {
        if (!draw) return;
        const cx = PAD + (i % 2) * (cell.w + 12), cy = y + Math.floor(i / 2) * (cell.h + cell.gap);
        c.save(); rr(c, cx, cy, cell.w, cell.h, 10); c.fillStyle = "rgba(0,0,0,.25)"; c.fill(); c.lineWidth = 2; c.strokeStyle = T.line2; c.stroke(); c.restore();
        frame(c, T, imgs[r.id], cx + 10, cy + 10, 56, "mythic", 3);
        const tx = cx + 10 + 56 + 12, right = cx + cell.w - 12, mw = right - tx;
        // line 1: name (left) and tier badge (right); the name takes what the badge leaves
        font(c, "600", 17); const bh = 24, bw = Math.ceil(c.measureText(r.group).width + bh * 0.9);
        const nl = nameLines(c, r.name, mw - bw - 10, 23, 15, 1, "700");
        font(c, "700", nl.px); c.fillStyle = T.ink; c.textAlign = "left"; c.textBaseline = "alphabetic"; c.fillText(nl.lines[0], tx, cy + 31);
        pill(c, T, r.group, right, cy + 12, bh, 17, r.gk === "never" || r.gk === "caution" ? r.gk : "mut", "right");
        // line 2: Have x/y Ingredient (left), copies owned (right)
        font(c, "500", 19); const own = r.owned ? `own ${r.owned}` : "", ow = own ? c.measureText(own).width + 12 : 0;
        const hv = nameLines(c, `Have ${r.have}/${r.qty} ${r.ingredient}`, mw - ow, 19, 15, 1, "500");
        font(c, "500", hv.px); c.fillStyle = T.mut; c.textAlign = "left"; c.fillText(hv.lines[0], tx, cy + 58);
        if (own) { font(c, "600", 19); c.fillStyle = T.gold2; c.textAlign = "right"; c.fillText(own, right, cy + 58); }
      });
      y += canRows(cnt.rows.length) * (cell.h + cell.gap) - cell.gap;
    }
    y += 30;
    // what the player owns
    const o = m.owned;
    if (draw) text("What you own", PAD, y + 28, 30, "700", T.ink, HEAD);
    y += 46;
    if (draw) text(countLabel("MYTHICS", o.mythicCopies, o.mythicTypes), PAD, y + 18, 19, "700", T.mut);
    y += 28;
    if (o.mythics.length) { const f = chipGrid(c, T, o.mythics, imgs, PAD, y, draw); y += f.h; }
    else { if (draw) text("No Mythics yet", PAD, y + 20, 21, "500", T.mut); y += 28; }
    if (o.primals && o.primals.length) {
      y += 26;
      if (draw) text(countLabel("PRIMALS", o.primalCopies, o.primalTypes), PAD, y + 18, 19, "700", T.primal || T.mut);
      y += 28;
      const f = chipGrid(c, T, o.primals, imgs, PAD, y, draw, "primal"); y += f.h;
    }
    y += 26;
    if (draw) text(countLabel("LEGENDARIES", o.legendaryCopies, o.legendaryTypes), PAD, y + 18, 19, "700", T.mut);
    y += 28;
    if (o.legendaries.length) { const g = legGrid(c, T, o.legendaries, imgs, PAD, y, draw); y += g.h; }
    else { if (draw) text("No Legendaries yet", PAD, y + 20, 21, "500", T.mut); y += 28; }
    y += 28;
    // footer
    if (draw) {
      c.fillStyle = T.line2; c.fillRect(PAD, y, W - 2 * PAD, 2);
      text("Which artifact to craft next", PAD, y + 44, 22, "500", T.mut);
      text(m.url, W - PAD, y + 44, 24, "700", T.gold, SANS, "right");
    }
    y += 66;
    return y;
  }
  function neededIds(m) { const s = new Set(); m.can.rows.forEach((r) => s.add(r.id)); m.owned.mythics.forEach((x) => s.add(x.id)); (m.owned.primals || []).forEach((x) => s.add(x.id)); m.owned.legendaries.forEach((x) => s.add(x.id)); return [...s]; }
  // browser: loads the icons (same origin) and draws. urlOf(id) -> icon URL. Resolves a canvas.
  async function render(m, o) {
    const T = o.theme || themeFromCss();
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    if (document.fonts && document.fonts.load) { try { await Promise.all([document.fonts.load('700 38px "Cinzel"'), document.fonts.load("700 24px " + SANS)]); } catch (e) { /* the fallback serif is used */ } }
    const imgs = {}; await Promise.all(neededIds(m).map(async (id) => { imgs[id] = await load(o.iconUrl(id)); }));
    const ui = { ess: await load(o.essenceUrl), noah: await load(o.noahUrl) };
    const cv = document.createElement("canvas"); cv.width = W; cv.height = 10; let c = cv.getContext("2d");
    const H = Math.ceil(paint(c, T, m, imgs, ui, false));
    cv.width = W; cv.height = H; c = cv.getContext("2d"); c.imageSmoothingQuality = "high";
    paint(c, T, m, imgs, ui, true);
    return cv;
  }
  const toBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("The picture could not be made"))), "image/png"));
  return { URL_TEXT, WIDTH: W, model, render, toBlob, themeFromCss, DEFAULT_THEME, neededIds, fmt, countLabel };
});
