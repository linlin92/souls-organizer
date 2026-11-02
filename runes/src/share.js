// Share image: a PNG of the rune totals for Discord.
// model() is pure; render() paints it on a canvas in the browser from the site's own icons.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Share = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const URL_TEXT = "linlin92.github.io/souls-organizer";
  const W = 1100, PAD = 36;
  const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const HEAD = '"Cinzel","Trajan Pro","Palatino Linotype","Book Antiqua",Palatino,"Iowan Old Style",Georgia,serif';
  const DEFAULT_THEME = { bg: "#14100b", panel: "#201912", line: "#4d3f27", line2: "#5a4a2e", gold: "#e3b95b", gold2: "#c99a3b", ink: "#f0e6d2", mut: "#a89a7c", frame: "#17120c", onGold: "#1b1208" };

  function model(tally, divines, opts) {
    const byRune = (tally.byRune || []).filter((b) => b.legendary + b.divine > 0).map((b) => ({
      id: b.id, name: b.name, total: b.legendary + b.divine, legendary: b.legendary,
      divines: divines.filter((d) => b.divines && b.divines[d.id]).map((d) => ({ id: d.id, name: d.name, n: b.divines[d.id] })),
    }));
    return {
      title: "SOULS Rune Advisor",
      date: (opts && opts.date) || "",
      url: URL_TEXT,
      divine: tally.divine || 0,
      legendary: tally.legendary || 0,
      divines: divines.map((d) => ({ id: d.id, name: d.name, n: (tally.byDivine && tally.byDivine[d.id]) || 0 })),
      runes: byRune,
    };
  }

  function themeFromCss(el) {
    const cs = getComputedStyle(el || document.documentElement), t = { ...DEFAULT_THEME };
    for (const k of Object.keys(DEFAULT_THEME)) { const v = cs.getPropertyValue("--" + k).trim(); if (v) t[k] = v; }
    return t;
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  const font = (c, w, px, fam) => { c.font = `${w} ${px}px ${fam || SANS}`; };
  function fit(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && c.measureText(s + "\u2026").width > maxW) s = s.slice(0, -1);
    return s.trimEnd() + "\u2026";
  }

  function chipBox(c, label, n, hasIcon) {
    font(c, "600", 18);
    const tw = c.measureText(label).width;
    font(c, "700", 18);
    const nw = c.measureText(String(n)).width;
    return Math.ceil((hasIcon ? 32 : 14) + tw + 8 + nw + 14);
  }
  // Lays chips out and, when draw is set, paints them. Returns the block height.
  function chips(c, T, items, imgs, x, y, maxW, draw) {
    const h = 34, gap = 8;
    let cx = 0, cy = 0;
    for (const it of items) {
      const w = chipBox(c, it.label, it.n, !!it.icon);
      if (cx > 0 && cx + w > maxW) { cx = 0; cy += h + gap; }
      if (draw) {
        const x0 = x + cx, y0 = y + cy;
        c.save(); rr(c, x0, y0, w, h, h / 2); c.fillStyle = "rgba(0,0,0,.28)"; c.fill(); c.lineWidth = 2; c.strokeStyle = it.basic ? T.line2 : T.gold2; c.stroke(); c.restore();
        let tx = x0 + 14;
        if (it.icon && imgs[it.icon]) { c.drawImage(imgs[it.icon], x0 + 6, y0 + 6, 22, 22); tx = x0 + 32; }
        font(c, "600", 18); c.fillStyle = T.ink; c.textAlign = "left"; c.textBaseline = "middle";
        const labelW = c.measureText(it.label).width;
        c.fillText(it.label, tx, y0 + h / 2 + 1);
        font(c, "700", 18); c.fillStyle = T.gold;
        c.fillText(String(it.n), tx + labelW + 8, y0 + h / 2 + 1);
      }
      cx += w + gap;
    }
    return cy + h;
  }

  function paint(c, T, m, imgs, logo, draw) {
    let y = PAD;
    const text = (s, x, yy, px, w, col, fam, al) => { font(c, w, px, fam); c.fillStyle = col; c.textAlign = al || "left"; c.textBaseline = "alphabetic"; c.fillText(s, x, yy); };
    if (draw) {
      c.fillStyle = T.bg; c.fillRect(0, 0, W, 8000);
      const g = c.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, "rgba(227,185,91,.10)"); g.addColorStop(1, "rgba(227,185,91,0)"); c.fillStyle = g; c.fillRect(0, 0, W, 360);
      if (logo) { rr(c, PAD, y, 72, 72, 16); c.save(); c.clip(); c.drawImage(logo, PAD, y, 72, 72); c.restore(); }
      text(m.title, PAD + 88, y + 34, 40, "700", T.ink, HEAD);
      text(m.divine + " with a Divine  ·  " + m.legendary + " without a Divine", PAD + 88, y + 70, 22, "500", T.mut);
      if (m.date) text(m.date, W - PAD, y + 34, 20, "500", T.mut, SANS, "right");
    }
    y += 96;
    const cols = 3, gap = 12, cw = (W - 2 * PAD - gap * (cols - 1)) / cols, ch = 78;
    m.divines.forEach((d, i) => {
      const x = PAD + (i % cols) * (cw + gap), yy = y + Math.floor(i / cols) * (ch + gap);
      if (!draw) return;
      c.save(); rr(c, x, yy, cw, ch, 12); c.fillStyle = d.n ? "rgba(0,0,0,.28)" : "rgba(0,0,0,.14)"; c.fill(); c.lineWidth = 2; c.strokeStyle = d.n ? T.gold2 : T.line; c.stroke(); c.restore();
      if (imgs[d.id]) c.drawImage(imgs[d.id], x + 14, yy + 15, 48, 48);
      text(String(d.n), x + 74, yy + 46, 32, "700", d.n ? T.gold : T.mut, HEAD);
      font(c, "700", 32, HEAD); const countW = c.measureText(String(d.n)).width;
      font(c, "600", 18); c.fillStyle = d.n ? T.ink : T.mut; c.textAlign = "left"; c.textBaseline = "middle";
      const nameX = x + 74 + countW + 12;
      c.fillText(fit(c, d.name, x + cw - 14 - nameX), nameX, yy + 40);
    });
    y += Math.ceil(m.divines.length / cols) * (ch + gap) + 18;
    if (draw) { text("BY RUNE", PAD, y + 8, 16, "700", T.mut); c.fillStyle = T.line2; c.fillRect(PAD, y + 20, W - 2 * PAD, 2); }
    y += 36;
    const icon = 56;
    for (const r of m.runes) {
      const items = [];
      if (r.legendary) items.push({ label: "Legendary", n: r.legendary, basic: true });
      for (const d of r.divines) items.push({ label: d.name, n: d.n, icon: d.id });
      const block = chips(c, T, items, imgs, PAD + icon + 16, y + 46, W - 2 * PAD - icon - 16, false);
      const rowH = Math.max(icon + 16, 46 + block);
      if (draw) {
        if (imgs[r.id]) c.drawImage(imgs[r.id], PAD, y + 4, icon, icon);
        text(r.name, PAD + icon + 16, y + 28, 24, "700", T.ink);
        text(String(r.total), W - PAD, y + 28, 28, "700", T.gold, HEAD, "right");
        chips(c, T, items, imgs, PAD + icon + 16, y + 46, W - 2 * PAD - icon - 16, true);
      }
      y += rowH + 14;
    }
    if (!m.runes.length) { if (draw) text("No Legendary runes.", PAD, y + 24, 22, "500", T.mut); y += 40; }
    y += 8;
    if (draw) {
      c.fillStyle = T.line2; c.fillRect(PAD, y, W - 2 * PAD, 2);
      text("Legendary and Legendary with a Divine", PAD, y + 40, 20, "500", T.mut);
      text(m.url, W - PAD, y + 40, 22, "700", T.gold, SANS, "right");
    }
    y += 62;
    return y;
  }

  function neededIds(m) {
    const s = new Set(m.divines.map((d) => d.id));
    m.runes.forEach((r) => { s.add(r.id); r.divines.forEach((d) => s.add(d.id)); });
    return [...s];
  }
  async function render(m, o) {
    const T = o.theme || themeFromCss();
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    if (document.fonts && document.fonts.load) { try { await Promise.all([document.fonts.load('700 40px "Cinzel"'), document.fonts.load("700 24px " + SANS)]); } catch (e) { /* the fallback serif is used */ } }
    const imgs = {};
    await Promise.all(neededIds(m).map(async (id) => { imgs[id] = await load(o.iconUrl(id)); }));
    const logo = o.logoUrl ? await load(o.logoUrl) : null;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = 10;
    let c = cv.getContext("2d");
    const H = Math.ceil(paint(c, T, m, imgs, logo, false));
    cv.width = W; cv.height = H; c = cv.getContext("2d"); c.imageSmoothingQuality = "high";
    paint(c, T, m, imgs, logo, true);
    return cv;
  }
  const toBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("The picture could not be made"))), "image/png"));
  return { URL_TEXT, WIDTH: W, model, render, toBlob, themeFromCss };
});
