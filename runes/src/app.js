(async function () {
  const $ = (id) => document.getElementById(id);
  const loadImage = (src) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      res(g.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => rej(new Error(src));
    img.src = src;
  });
  const fileImage = (file) => new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      res(g.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(file.name)); };
    img.src = url;
  });
  const runeIcons = await Promise.all(Runes.RUNES.map(async (r) => ({ ...r, image: await loadImage("icons/" + r.id + ".png") })));
  const divineIcons = await Promise.all(Runes.DIVINES.map(async (r) => ({ ...r, image: await loadImage("icons/divine/" + r.id + ".png") })));
  const matcher = Runes.buildMatcher(runeIcons, divineIcons);
  const digits = await fetch("data/digits.json").then((r) => { if (!r.ok) throw new Error("digits"); return r.json(); });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let picked = [];
  let lastTally = null;
  const NATIVE_OK = typeof navigator.share === "function";
  const COPY_OK = (() => {
    try {
      if (!(navigator.clipboard && typeof navigator.clipboard.write === "function" && typeof window.ClipboardItem === "function")) return false;
      if (typeof ClipboardItem.supports === "function" && ClipboardItem.supports("image/png") === false) return false;
      return true;
    } catch (e) { return false; }
  })();
  let COPY_BROKEN = false;
  const SHARE_NAME = "souls-organizer-runes.png";
  let LAST = { blob: null, previewUrl: null };
  let SHARE_URL = null;
  const divineIds = new Set(Runes.DIVINES.map((d) => d.id));
  const iconUrl = (id) => (divineIds.has(id) ? "icons/divine/" + id + ".png" : "icons/" + id + ".png");
  $("files").addEventListener("change", () => { picked = [...$("files").files]; $("status").textContent = picked.length ? picked.length + " screenshot" + (picked.length > 1 ? "s" : "") + " ready." : ""; });
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); });
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    picked = [...e.dataTransfer.files].filter((f) => /^image\//.test(f.type));
    $("status").textContent = picked.length ? picked.length + " screenshot" + (picked.length > 1 ? "s" : "") + " ready." : "Those files are not images.";
  });
  function shareModel() {
    return Share.model(lastTally, Runes.DIVINES, { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) });
  }
  function shareInit() {
    $("out").querySelectorAll('[data-share="native"]').forEach((b) => { b.hidden = !NATIVE_OK; });
    $("out").querySelectorAll('[data-share="copy"]').forEach((b) => { b.hidden = !COPY_OK || COPY_BROKEN; });
  }
  function shareBlob() {
    if (!lastTally) return Promise.reject(new Error("Read your screenshots first"));
    if (LAST.blob) return LAST.blob;
    const p = Share.render(shareModel(), { iconUrl: (id) => iconUrl(id), logoUrl: "icons/logo.png" }).then(Share.toBlob);
    LAST.blob = p;
    p.catch(() => { if (LAST.blob === p) LAST.blob = null; });
    p.then((b) => {
      if (LAST.blob !== p) return;
      if (LAST.previewUrl) URL.revokeObjectURL(LAST.previewUrl);
      LAST.previewUrl = URL.createObjectURL(b);
      const im = $("sharePrev");
      if (im) { im.src = LAST.previewUrl; im.hidden = false; }
    }).catch(() => {});
    return p;
  }
  function shareWarm() { LAST.blob = null; if (LAST.previewUrl) { URL.revokeObjectURL(LAST.previewUrl); LAST.previewUrl = null; } try { shareBlob().catch(() => {}); } catch (e) { /* the click says what went wrong */ } }
  function shareSay(msg, text, link) {
    if (!msg) return;
    msg.textContent = text || "";
    if (link) { const a = document.createElement("a"); a.href = link.href; a.target = "_blank"; a.rel = "noopener"; a.textContent = link.text; msg.append(" ", a); }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-share]"); if (!b) return;
    const msg = b.parentElement.querySelector(".share-msg"), say = (t, l) => shareSay(msg, t, l);
    const act = b.dataset.share; b.disabled = true; say("Making the picture…");
    const lastBlobUrl = (blob) => { if (SHARE_URL) URL.revokeObjectURL(SHARE_URL); SHARE_URL = URL.createObjectURL(blob); return SHARE_URL; };
    try {
      if (act === "copy") {
        try { await navigator.clipboard.write([new ClipboardItem({ "image/png": shareBlob() })]); say("Copied. Paste it into Discord."); }
        catch (err) {
          if (err && err.name === "AbortError") { say(""); return; }
          COPY_BROKEN = true; document.querySelectorAll('[data-share="copy"]').forEach((x) => { x.hidden = true; });
          say("This browser does not let a page copy a picture. Use Download PNG" + (NATIVE_OK ? " or Share image." : "."));
        }
      } else if (act === "native") {
        const blob = await shareBlob(), file = new File([blob], SHARE_NAME, { type: "image/png" });
        let can = false; try { can = !navigator.canShare || navigator.canShare({ files: [file] }); } catch (err) { can = false; }
        if (!can) { say("This browser cannot share a picture file. Use Download PNG.", { href: lastBlobUrl(blob), text: "Or open the picture and press and hold it to save." }); return; }
        try { await navigator.share({ files: [file], title: "SOULS Rune Advisor" }); say("Shared."); }
        catch (err) { say(err && err.name === "AbortError" ? "" : "Could not share the picture. Use Download PNG."); }
      } else {
        const blob = await shareBlob(), url = lastBlobUrl(blob);
        const a = document.createElement("a"); a.href = url; a.download = SHARE_NAME; document.body.appendChild(a); a.click(); a.remove();
        say("Saved as " + SHARE_NAME + ".", { href: url, text: "Nothing saved? Open the picture and press and hold it." });
      }
    } catch (err) {
      say("Could not make the picture" + (err && err.message ? " (" + err.message + ")" : "") + ". Please try again.");
    } finally { b.disabled = false; }
  });
  const SKIP_LABEL = {
    top: "Top row, cut off",
    "bottom-crop": "Bottom row, cropped",
    filter: "Bottom row, behind Filter Applied",
    "past-four": "Row below the first four",
  };
  function cropDataUrl(img, rect) {
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const w = Math.max(1, Math.min(img.width - x, Math.ceil(rect.x + rect.w) - x));
    const h = Math.max(1, Math.min(img.height - y, Math.ceil(rect.y + rect.h) - y));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const out = g.createImageData(w, h);
    const src = img.data;
    for (let row = 0; row < h; row++) {
      const s = ((y + row) * img.width + x) * 4;
      out.data.set(src.subarray(s, s + w * 4), row * w * 4);
    }
    g.putImageData(out, 0, 0);
    return c.toDataURL("image/png");
  }
  function skippedSection(skipped) {
    if (!skipped.length) return "";
    const kinds = [...new Set(skipped.map((s) => s.kind))];
    const groups = kinds.map((kind) => {
      const files = skipped.filter((s) => s.kind === kind).map((s) => {
        const label = SKIP_LABEL[kind] || kind;
        const shot = s.img && s.rect ? `<img class="crop" src="${cropDataUrl(s.img, s.rect)}" alt="${esc(label + " in " + s.file)}">` : "";
        return `<li><span class="file">${esc(s.file)}</span>${shot}</li>`;
      }).join("");
      return `<h3>${esc(SKIP_LABEL[kind] || kind)}</h3><ul>${files}</ul>`;
    }).join("");
    const summary = kinds.map((k) => SKIP_LABEL[k] || k).join(" · ");
    return `<details class="leftout"><summary>Skipped runes <span class="kinds">${esc(summary)}</span></summary><div class="body">${groups}</div></details>`;
  }
  function render(tiles, notes, skipped, repeats) {
    const skippedHtml = skippedSection(skipped || []);
    const t = Runes.tally(tiles);
    const divines = Runes.DIVINES.map((d) => {
      const n = t.byDivine[d.id] || 0;
      return `<div class="dline${n ? "" : " zero"}"><img src="icons/divine/${d.id}.png" alt=""><b>${n}</b><span>${esc(d.name)}</span></div>`;
    }).join("");
    const rows = t.byRune.map((b) => {
      const n = b.legendary + b.divine;
      if (!n) return "";
      const chips = [];
      if (b.legendary) chips.push(`<span class="chip basic"><span>Legendary</span><b>${b.legendary}</b></span>`);
      for (const d of Runes.DIVINES) {
        const c = b.divines[d.id] || 0;
        if (!c) continue;
        chips.push(`<span class="chip"><img src="icons/divine/${d.id}.png" alt=""><span>${esc(d.name)}</span><b>${c}</b></span>`);
      }
      return `<article class="rune"><img class="stone" src="icons/${b.id}.png" alt=""><div class="name">${esc(b.name)}</div><b class="total">${n}</b><div class="break">${chips.join("")}</div></article>`;
    }).join("");
    $("out").hidden = false;
    $("out").innerHTML = `
      <h2>What you have</h2>
      <p class="muted">${t.divine} Legendary with a Divine, ${t.legendary} Legendary without a Divine.</p>
      ${repeats ? `<p class="muted">${repeats} repeated ${repeats === 1 ? "row was" : "rows were"} already in another screenshot, so ${repeats === 1 ? "it was" : "they were"} counted once.</p>` : ""}
      <div class="divines">${divines}</div>
      ${notes.length ? `<div class="notes">${notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}</div>` : ""}
      ${skippedHtml}
      <h2 style="margin-top:1rem">By rune</h2>
      ${rows || "<p class='muted'>No Legendary runes in this screenshot.</p>"}
      <h2 style="margin-top:1rem">Share image</h2>
      <p class="muted">One picture of these totals, to keep track in Discord.</p>
      <div class="share" role="group" aria-label="Share the totals as a picture"><button type="button" data-share="native" hidden>Share image</button><button type="button" class="ghost" data-share="copy" hidden>Copy image</button><button type="button" class="ghost" data-share="dl">Download PNG</button><span class="share-msg" role="status" aria-live="polite"></span></div>
      <img class="prev" id="sharePrev" alt="Preview of the share image" hidden>`;
    lastTally = t;
    shareInit();
    shareWarm();
  }
  $("read").addEventListener("click", async () => {
    if (!picked.length) { $("status").textContent = "Choose a screenshot first."; return; }
    $("read").disabled = true;
    $("status").textContent = "Reading…";
    const tiles = [];
    const notes = [];
    const skipped = [];
    const seenRows = new Set();
    let repeats = 0;
    const rowKey = (rowTiles) => rowTiles.slice().sort((a, b) => a.col - b.col).map((t) => [t.col, t.runeId, t.grade, t.divineId || "", t.copies].join(":")).join("|");
    try {
      for (const file of picked) {
        const img = await fileImage(file);
        const an = Runes.analyze(img, matcher, digits.count);
        if (an.error) { notes.push(file.name + ": " + an.error); continue; }
        const byRow = new Map();
        for (const t of an.tiles) {
          const list = byRow.get(t.row) || [];
          list.push(t);
          byRow.set(t.row, list);
        }
        for (const rowTiles of byRow.values()) {
          const key = rowKey(rowTiles);
          if (seenRows.has(key)) { repeats++; continue; }
          seenRows.add(key);
          tiles.push(...rowTiles);
        }
        for (const s of an.skipped || []) skipped.push({ kind: s.kind, file: file.name, img, rect: s });
      }
      if (!tiles.length && !notes.length && !skipped.length) notes.push("I found no Legendary runes. Filter the inventory to Legendary and Legend (Mythic Option).");
      render(tiles, notes, skipped, repeats);
      const tally = Runes.tally(tiles);
      const bits = Runes.DIVINES.filter((d) => tally.byDivine[d.id]).map((d) => tally.byDivine[d.id] + " " + d.short);
      $("status").textContent = bits.length ? bits.join(", ") + "." : "No Legendary runes.";
    } catch (e) {
      $("status").textContent = "Sorry, that screenshot could not be read.";
    } finally { $("read").disabled = false; }
  });
})();
