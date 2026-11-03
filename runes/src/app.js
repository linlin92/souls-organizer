// Rune page, same three steps as Equipment: upload, check, recap.
// Reading stays in runes.js. This file only collects tiles, lets you fix them, and redraws the recap.
(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const R = Runes;
  const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const copyCount = (t) => (Number.isFinite(t.copies) && t.copies > 0 ? t.copies : 1);
  const runeById = (id) => R.RUNES.find((r) => r.id === id);
  const divineById = (id) => R.DIVINES.find((d) => d.id === id);

  function loadImageData(src) {
    return new Promise((res, rej) => {
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
  }
  async function loadData(src) {
    let err;
    for (let k = 0; k < 3; k++) {
      try { return await loadImageData(k ? src + "?r=" + k : src); }
      catch (e) { err = e; await sleep(250 * (k + 1)); }
    }
    throw err;
  }
  const refsP = (async () => {
    const runeIcons = await Promise.all(R.RUNES.map(async (r) => ({ ...r, image: await loadData("icons/" + r.id + ".png") })));
    const divineIcons = await Promise.all(R.DIVINES.map(async (r) => ({ ...r, image: await loadData("icons/divine/" + r.id + ".png") })));
    const matcher = R.buildMatcher(runeIcons, divineIcons);
    const digits = await fetch("data/digits.json").then((r) => { if (!r.ok) throw new Error("digits"); return r.json(); });
    return { matcher, templates: digits.count };
  })();
  refsP.catch(() => {});

  let items = [];
  let skipped = [];
  let uid = 0, filter = "check", skippedOpen = false;
  const open = new Set(["overview"]);

  // ---------- picking screenshots ----------
  let selected = [], thumbUrls = [];
  const fileKey = (f) => [f.name, f.size, f.lastModified].join("|");
  function renderPicked() {
    thumbUrls.forEach((u) => URL.revokeObjectURL(u)); thumbUrls = [];
    $("picked").hidden = !selected.length;
    $("pickedCount").textContent = `${pl(selected.length, "screenshot")} selected`;
    $("thumbs").innerHTML = selected.map((f, i) => {
      const isImg = /^image\//.test(f.type || ""), u = isImg ? URL.createObjectURL(f) : ""; if (u) thumbUrls.push(u);
      return `<li>${isImg ? `<img src="${u}" alt="Screenshot ${esc(f.name)}">` : `<span class="file">${esc(f.name)}</span>`}<button class="x" type="button" data-i="${i}" aria-label="Remove ${esc(f.name)}" title="Remove"><svg class="xi" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button><span class="fname">${esc(f.name)}</span></li>`;
    }).join("");
  }
  function setSelected(list) {
    selected = list;
    try { const dt = new DataTransfer(); list.forEach((f) => dt.items.add(f)); $("files").files = dt.files; } catch (e) { /* the list above is what gets read */ }
    renderPicked();
  }
  $("files").addEventListener("change", () => { selected = [...$("files").files]; renderPicked(); setStatus(""); });
  $("clearAll").addEventListener("click", () => { setSelected([]); $("files").value = ""; setStatus(""); });
  $("thumbs").addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (b) setSelected(selected.filter((_, i) => i !== +b.dataset.i)); });
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "dragend"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("over");
    const have = new Set(selected.map(fileKey));
    setSelected([...selected, ...[...(e.dataTransfer ? e.dataTransfer.files : [])].filter((f) => !have.has(fileKey(f)))]);
  });

  const MAX_SIDE = 8000;
  function fileImage(file) {
    return new Promise((res, rej) => {
      if (file.type && !/^image\//.test(file.type)) { rej(new Error("it is not a picture")); return; }
      if (!file.size) { rej(new Error("the file is empty")); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) throw new Error("the picture is empty");
          if (w > MAX_SIDE || h > MAX_SIDE) throw new Error("the picture is too big. Please use a normal phone screenshot.");
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          const g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, w, h);
          URL.revokeObjectURL(url);
          res(d);
        } catch (e) {
          URL.revokeObjectURL(url);
          rej(e instanceof Error && e.name === "Error" && e.message ? e : new Error("the picture is too big for this browser"));
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("it could not be opened")); };
      img.src = url;
    });
  }
  function cropCanvas(img, rect) {
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
    return c;
  }
  const cropDataUrl = (img, rect) => cropCanvas(img, rect).toDataURL("image/png");
  function thumbUrl(img, rect) {
    try {
      const c = cropCanvas(img, rect);
      const s = document.createElement("canvas");
      s.width = 96; s.height = 96;
      s.getContext("2d").drawImage(c, 0, 0, 96, 96);
      return s.toDataURL("image/png");
    } catch (e) { return null; }
  }
  const setNotes = (list) => { $("notes").innerHTML = list.length ? "<ul>" + list.map((n) => `<li class="${n.cls}">${esc(n.text)}</li>`).join("") + "</ul>" : ""; };
  const setStatus = (t, err) => { $("status").textContent = t; $("status").className = err ? "err" : "muted"; };

  const SKIP_LABEL = {
    top: "Top row, cut off",
    "bottom-crop": "Bottom row, cropped",
    filter: "Bottom row, behind Filter Applied",
    "past-four": "Row below the first four",
  };
  function skippedSection(list) {
    if (!list.length) return "";
    const kinds = [...new Set(list.map((s) => s.kind))];
    const groups = kinds.map((kind) => {
      const files = list.filter((s) => s.kind === kind).map((s) => {
        const label = SKIP_LABEL[kind] || kind;
        const shot = s.crop ? `<img class="crop" src="${s.crop}" alt="${esc(label + " in " + s.file)}">` : "";
        return `<li><span class="file">${esc(s.file)}</span>${shot}</li>`;
      }).join("");
      return `<h3>${esc(SKIP_LABEL[kind] || kind)}</h3><ul>${files}</ul>`;
    }).join("");
    const summary = kinds.map((k) => SKIP_LABEL[k] || k).join(" · ");
    return `<details class="leftout"${skippedOpen ? " open" : ""}><summary>Skipped Runes <span class="kinds">${esc(summary)}</span></summary><div class="body">${groups}</div></details>`;
  }
  $("skipped").addEventListener("toggle", (e) => { const d = e.target; if (d && d.matches && d.matches("details.leftout")) skippedOpen = d.open; }, true);

  const rowKey = (rowTiles) => rowTiles.slice().sort((a, b) => a.col - b.col).map((t) => [t.col, t.runeId, t.grade, t.divineId || "", t.copies].join(":")).join("|");
  $("read").addEventListener("click", async () => {
    const files = selected.length ? selected : [...$("files").files];
    if (!files.length) { setStatus("Please choose your screenshots first.", true); return; }
    $("read").disabled = true;
    const notes = [];
    try {
      setStatus("Getting ready\u2026");
      let refs;
      try { refs = await refsP; } catch (e) { setStatus("My reference pictures could not be loaded. Please check your connection and reload the page.", true); return; }
      const found = [];
      const skippedNow = [];
      const seenRows = new Set();
      let repeats = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = file.name || `file ${i + 1}`;
        setStatus(`Reading screenshot ${i + 1} of ${files.length}\u2026`);
        await sleep(20);
        try {
          const img = await fileImage(file);
          const an = R.analyze(img, refs.matcher, refs.templates);
          if (an.error) { notes.push({ cls: "err", text: `${name}: ${an.error}` }); continue; }
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
            for (const t of rowTiles) {
              found.push({
                uid: ++uid, runeId: t.runeId, runeName: t.runeName, grade: t.grade, copies: t.copies, equipped: !!t.equipped,
                divineId: t.divineId || "", divineName: t.divineName || "", divineShort: t.divineShort || "",
                flags: (t.flags || []).slice(), thumb: thumbUrl(img, t.rect), file: name,
              });
            }
          }
          for (const s of an.skipped || []) skippedNow.push({ kind: s.kind, file: name, crop: cropDataUrl(img, s) });
        } catch (e) { notes.push({ cls: "err", text: `I could not use "${name}": ${e.message || "it could not be opened"}.` }); }
      }
      items = found;
      skipped = skippedNow;
      if (repeats) notes.push({ cls: "muted", text: `${repeats} repeated ${repeats === 1 ? "row was" : "rows were"} already in another screenshot, so ${repeats === 1 ? "it was" : "they were"} counted once.` });
      if (skipped.length) notes.push({ cls: "warn", text: `${pl(skipped.length, "row")} ${skipped.length === 1 ? "was" : "were"} left out (cut off, behind Filter Applied, or below the first four). ${skipped.length === 1 ? "It is" : "They are"} shown under Check pieces.` });
      if (!items.length) {
        if (!notes.length) notes.push({ cls: "warn", text: "I found no Legendary runes. Filter the inventory to Legendary and Legend (Mythic Option)." });
        finish(notes, "Sorry, I found no Legendary runes. Filter the inventory to Legendary and Legend (Mythic Option). You can also add a rune by hand.", true);
        return;
      }
      items.sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0));
      filter = "check";
      if (skipped.length) skippedOpen = true;
      finish(notes, notes.some((n) => n.cls !== "muted") ? "Done, but please read the notes below." : "Done. Check the runes below, then see your recap.", false);
      const dest = $("sec-check");
      dest.focus({ preventScroll: true });
      dest.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    } catch (e) {
      console.error(e); setNotes(notes); setStatus("Sorry, something went wrong while reading your screenshots. Please try again.", true);
    } finally { $("read").disabled = false; }
  });
  function finish(notes, msg, err) { setNotes(notes); setStatus(msg, err); renderAll(); }

  // ---------- Check list ----------
  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(label)}</option>`;
  function pieceRow(p) {
    const flagged = p.flags.length;
    const runeOpts = R.RUNES.map((r) => opt(r.id, r.name, p.runeId)).join("");
    const divineOpts = opt("", "Choose", p.divineId || "") + R.DIVINES.map((d) => opt(d.id, d.name, p.divineId || "")).join("");
    const thumb = p.thumb
      ? `<img class="th" src="${p.thumb}" alt="Tile from your screenshot">`
      : `<img class="th icon" src="icons/${esc(p.runeId)}.png" alt="">`;
    return `<li class="pc${flagged ? " flag" : ""}" data-u="${p.uid}">
      ${thumb}
      <div>
        ${flagged ? `<p class="why">${esc(p.flags.join(" \u00b7 "))}</p>` : ""}
        <div class="fields">
          <label class="span">Rune<select data-f="rune">${runeOpts}</select></label>
          <label>Grade<select data-f="grade">${opt("legendary", "Legendary", p.grade)}${opt("divine", "Divine", p.grade)}</select></label>
          <label>Copies<input data-f="copies" type="number" min="1" max="999" inputmode="numeric" value="${copyCount(p)}"></label>
          <label class="span">Divine<select data-f="divine"${p.grade === "divine" ? "" : " disabled"}>${divineOpts}</select></label>
          <label class="eq"><input data-f="equipped" type="checkbox"${p.equipped ? " checked" : ""}> Equipped</label>
        </div>
        ${p.file ? `<p class="src">${esc(p.file)}</p>` : ""}
      </div>
      <div class="acts">${flagged ? `<button type="button" class="ok" data-act="ok"><span class="tick">\u2713</span> Looks right</button>` : ""}<button type="button" data-act="rm">Remove</button></div>
    </li>`;
  }
  function renderCheck() {
    const has = items.length > 0, flagged = items.filter((x) => x.flags.length).length;
    const copies = items.reduce((s, t) => s + copyCount(t), 0);
    $("chips").hidden = !has; $("seg").hidden = !has;
    const setChip = (k, n) => { const c = $("chips").querySelector(`[data-k=${k}]`); c.querySelector("b").textContent = n; c.classList.toggle("zero", n === 0); };
    setChip("total", copies); setChip("check", flagged); setChip("ignored", skipped.length);
    $("summary").innerHTML = has ? `I found <b>${pl(copies, "rune")}</b>.${flagged ? ` <b>${flagged}</b> ${flagged === 1 ? "needs" : "need"} a check.` : " Nothing needs a check."}` : "";
    $("fAll").setAttribute("aria-pressed", filter === "all"); $("fCheck").setAttribute("aria-pressed", filter === "check");
    const ready = has && flagged === 0;
    $("checkNext").hidden = !ready;
    $("checkNextMsg").textContent = ready ? "All checked. Your list is ready." : "";
    const list = filter === "check" ? items.filter((x) => x.flags.length) : items;
    $("skipped").innerHTML = skippedSection(skipped);
    if (!list.length) { $("plist").innerHTML = has ? `<li class="muted">Nothing needs a check.</li>` : ""; return; }
    const buckets = new Map();
    for (const p of list) { if (!buckets.has(p.runeId)) buckets.set(p.runeId, []); buckets.get(p.runeId).push(p); }
    const order = [...buckets.keys()].sort((a, b) => (runeById(a) ? runeById(a).name : a).localeCompare(runeById(b) ? runeById(b).name : b));
    $("plist").innerHTML = order.map((id) => {
      const rows = buckets.get(id);
      const ordered = rows.slice().sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0) || a.uid - b.uid);
      const n = rows.reduce((s, t) => s + copyCount(t), 0);
      const name = (runeById(id) && runeById(id).name) || rows[0].runeName || id;
      return `<li class="clsgrp"><h3><img src="icons/${esc(id)}.png" alt="">${esc(name)}<span class="n">${pl(n, "rune")}</span></h3><ul class="plist">${ordered.map(pieceRow).join("")}</ul></li>`;
    }).join("");
  }
  const scrollBehavior = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  function listOrder() {
    const name = (id) => { const r = runeById(id); return r ? r.name : id; };
    const ids = [...new Set(items.map((p) => p.runeId))].sort((a, b) => name(a).localeCompare(name(b)));
    const out = [];
    for (const id of ids) out.push(...items.filter((p) => p.runeId === id).sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0) || a.uid - b.uid));
    return out;
  }
  // After a confirm or an edit, move to the next row that still needs a check. When none are left, open the recap.
  function scrollAfterRow(uid) {
    const order = listOrder();
    const i = order.findIndex((p) => p.uid === uid);
    const current = i >= 0 ? order[i] : null;
    const later = order.slice(i + 1).find((p) => p.flags.length);
    const earlier = order.slice(0, Math.max(i, 0)).find((p) => p.flags.length);
    const next = later || (current && current.flags.length ? null : earlier);
    const behavior = scrollBehavior();
    if (next) {
      const li = $("plist").querySelector(`[data-u="${next.uid}"]`);
      if (li) {
        li.scrollIntoView({ behavior, block: "center" });
        const btn = li.querySelector("[data-act=ok]");
        if (btn) btn.focus({ preventScroll: true });
      }
    } else if (!items.some((p) => p.flags.length)) {
      $("sec-recap").scrollIntoView({ behavior, block: "start" });
    }
  }
  $("goRecap").addEventListener("click", () => { $("sec-recap").scrollIntoView({ behavior: scrollBehavior(), block: "start" }); });
  $("fAll").addEventListener("click", () => { filter = "all"; renderCheck(); });
  $("fCheck").addEventListener("click", () => { filter = "check"; renderCheck(); });
  $("addItem").addEventListener("click", () => {
    const first = R.RUNES[0];
    items.push({ uid: ++uid, runeId: first.id, runeName: first.name, grade: "legendary", copies: 1, equipped: false, divineId: "", divineName: "", divineShort: "", flags: [], thumb: null, manual: true });
    filter = "all"; renderAll();
    const li = $("plist").querySelector(`[data-u="${uid}"]`); if (li) li.scrollIntoView({ block: "center" });
  });
  const itemOf = (el) => { const li = el.closest("li[data-u]"); return li ? items.find((x) => x.uid === +li.dataset.u) : null; };
  function applyDivine(p, id) {
    const d = divineById(id);
    if (!d) { p.divineId = ""; p.divineName = ""; p.divineShort = ""; p._keepDivine = null; return; }
    p.divineId = d.id; p.divineName = d.name; p.divineShort = d.short;
    p._keepDivine = { id: d.id, name: d.name, short: d.short };
  }
  $("plist").addEventListener("input", (e) => {
    if (e.target.dataset.f !== "copies") return;
    const p = itemOf(e.target); if (!p) return;
    if (!/^\d+$/.test(e.target.value)) return;
    const n = parseInt(e.target.value, 10);
    if (n >= 1) { p.copies = Math.min(999, n); renderRecap(); invalidateShare(); }
  });
  $("plist").addEventListener("change", (e) => {
    const f = e.target.dataset.f, p = itemOf(e.target); if (!f || !p) return;
    const hadFlags = p.flags.length > 0;
    const li = e.target.closest("li");
    if (f === "rune") {
      p.runeId = e.target.value;
      const r = runeById(p.runeId);
      p.runeName = r ? r.name : p.runeId;
      const img = li.querySelector("img.th.icon");
      if (img) img.src = "icons/" + p.runeId + ".png";
      renderCheck();
      const again = $("plist").querySelector(`[data-u="${p.uid}"] [data-f="rune"]`);
      if (again) again.focus();
    } else if (f === "grade") {
      p.grade = e.target.value;
      if (p.grade !== "divine") {
        if (p.divineId) p._keepDivine = { id: p.divineId, name: p.divineName, short: p.divineShort };
        p.divineId = ""; p.divineName = ""; p.divineShort = "";
      } else if (!p.divineId && p._keepDivine) applyDivine(p, p._keepDivine.id);
      const sel = li.querySelector('[data-f="divine"]');
      sel.disabled = p.grade !== "divine";
      sel.value = p.divineId || (p.grade !== "divine" && p._keepDivine ? p._keepDivine.id : "");
    } else if (f === "divine") {
      applyDivine(p, e.target.value);
      if (p.divineId && p.grade !== "divine") {
        p.grade = "divine";
        const g = li.querySelector('[data-f="grade"]'); if (g) g.value = "divine";
        e.target.disabled = false;
      }
    } else if (f === "copies") {
      let n = parseInt(e.target.value, 10);
      if (!Number.isFinite(n) || n < 1) n = 1;
      p.copies = Math.min(999, n);
      e.target.value = String(p.copies);
    } else if (f === "equipped") p.equipped = e.target.checked;
    renderRecap(); invalidateShare();
    if (hadFlags) scrollAfterRow(p.uid);
  });
  $("plist").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return; const p = itemOf(b); if (!p) return;
    const id = p.uid;
    if (b.dataset.act === "ok") p.flags = [];
    else if (b.dataset.act === "rm") items = items.filter((x) => x !== p);
    renderAll();
    if (b.dataset.act === "ok") scrollAfterRow(id);
    else if (!items.some((x) => x.flags.length)) $("sec-recap").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  });

  // ---------- Recap ----------
  const det = (key, title, n, meta, body, icon) => `<details class="x" data-k="${esc(key)}"${open.has(key) ? " open" : ""}><summary>${icon ? `<img class="si" src="${icon}" alt="">` : ""}<span class="t">${esc(title)}</span>${meta ? `<span class="m">${esc(meta)}</span>` : ""}<span class="n">${n}</span></summary><div class="body">${body}</div></details>`;
  const barRows = (rows) => { const max = Math.max(1, ...rows.map((r) => r[1])); return rows.map(([l, n]) => `<div class="br"><span>${esc(l)}</span><span class="t"><i style="width:${Math.round((n / max) * 100)}%"></i></span><b>${n}</b></div>`).join(""); };
  function recapHtml(tally) {
    const total = tally.legendary + tally.divine;
    const eq = items.reduce((s, t) => s + (t.equipped ? copyCount(t) : 0), 0);
    const tiles = `<div class="tiles"><div class="tile"><div class="k">Runes</div><div class="v">${total}</div></div><div class="tile"><div class="k">With a Divine</div><div class="v">${tally.divine}</div><div class="s">Gold frame</div></div><div class="tile"><div class="k">Without a Divine</div><div class="v">${tally.legendary}</div><div class="s">Legendary</div></div></div>`;
    const divines = `<div class="divines">${R.DIVINES.map((d) => {
      const n = tally.byDivine[d.id] || 0;
      return `<div class="dline${n ? "" : " zero"}"><img src="icons/divine/${d.id}.png" alt=""><b>${n}</b><span>${esc(d.name)}</span></div>`;
    }).join("")}</div>`;
    const equipped = `<div class="stat"><h4>Equipped or spare</h4>${barRows([["Equipped", eq], ["Spare", Math.max(0, total - eq)]])}</div>`;
    let html = det("overview", "Overview", total, "", tiles + divines + equipped);
    for (const b of tally.byRune) {
      const n = b.legendary + b.divine;
      if (!n) continue;
      const chips = [];
      if (b.legendary) chips.push(`<span class="rchip basic"><span>Legendary</span><b>${b.legendary}</b></span>`);
      let assigned = 0;
      for (const d of R.DIVINES) {
        const c = b.divines[d.id] || 0;
        if (!c) continue;
        assigned += c;
        chips.push(`<span class="rchip"><img src="icons/divine/${d.id}.png" alt=""><span>${esc(d.name)}</span><b>${c}</b></span>`);
      }
      if (b.divine > assigned) chips.push(`<span class="rchip"><span>Divine, not chosen</span><b>${b.divine - assigned}</b></span>`);
      const eqR = items.filter((t) => t.runeId === b.id && t.equipped).reduce((s, t) => s + copyCount(t), 0);
      html += det("rune-" + b.id, b.name, n, eqR ? `${eqR} equipped` : "", `<div class="rchips">${chips.join("")}</div>`, "icons/" + b.id + ".png");
    }
    return html;
  }
  function renderRecap() {
    const el = $("recap");
    if (!items.length) { el.innerHTML = `<p class="muted">Your recap will show up here.</p>`; return; }
    el.innerHTML = `<div class="bar"><button type="button" id="expAll">Expand all</button><button type="button" id="colAll">Collapse all</button></div>` + recapHtml(R.tally(items)) + shareHtml();
    shareInit();
  }
  $("recap").addEventListener("toggle", (e) => { const d = e.target; if (d && d.matches && d.matches("details.x[data-k]")) { if (d.open) open.add(d.dataset.k); else open.delete(d.dataset.k); if (d.dataset.k === "share" && d.open) shareWarm(); } }, true);
  $("recap").addEventListener("click", (e) => {
    if (e.target.closest("#expAll")) $("recap").querySelectorAll("details.x").forEach((d) => { d.open = true; });
    else if (e.target.closest("#colAll")) $("recap").querySelectorAll("details.x").forEach((d) => { d.open = false; });
  });
  function renderAll() { renderCheck(); renderRecap(); invalidateShare(); }

  // ---------- share image ----------
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
  let warmTimer = 0;
  let SHARE_URL = null;
  const shareHtml = () => `<details class="x" data-k="share"${open.has("share") ? " open" : ""}><summary><span class="t">Share image</span><span class="m">for Discord</span><span class="n">PNG</span></summary><div class="body">
    <p class="hint">One picture of these totals, to keep track in Discord.</p>
    <div class="share" role="group" aria-label="Share the totals as a picture"><button type="button" class="primary" data-share="native" hidden>Share image</button><button type="button" data-share="copy" hidden>Copy image</button><button type="button" data-share="dl">Download PNG</button><span class="share-msg" role="status" aria-live="polite"></span></div>
    <img class="prev" id="sharePrev" alt="Preview of the share image" hidden></div></details>`;
  function shareInit() {
    $("recap").querySelectorAll('[data-share="native"]').forEach((b) => { b.hidden = !NATIVE_OK; });
    $("recap").querySelectorAll('[data-share="copy"]').forEach((b) => { b.hidden = !COPY_OK || COPY_BROKEN; });
    if (open.has("share")) shareWarm();
  }
  function invalidateShare() { LAST.blob = null; if (LAST.previewUrl) { URL.revokeObjectURL(LAST.previewUrl); LAST.previewUrl = null; } clearTimeout(warmTimer); if (open.has("share") && items.length) warmTimer = setTimeout(() => shareWarm(), 400); }
  function shareModel() {
    return Share.model(R.tally(items), R.DIVINES, { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) });
  }
  function shareBlob() {
    if (!items.length) return Promise.reject(new Error("Read your screenshots first"));
    if (LAST.blob) return LAST.blob;
    const p = Share.render(shareModel(), { iconUrl: (id) => (divineById(id) ? "icons/divine/" + id + ".png" : "icons/" + id + ".png"), logoUrl: "icons/logo.png" }).then(Share.toBlob);
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
  function shareWarm() { try { shareBlob().catch(() => {}); } catch (e) { /* the click says what went wrong */ } }
  function shareSay(msg, text, link) {
    if (!msg) return;
    msg.textContent = text || "";
    if (link) { const a = document.createElement("a"); a.href = link.href; a.target = "_blank"; a.rel = "noopener"; a.textContent = link.text; msg.append(" ", a); }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-share]"); if (!b) return;
    const msg = b.parentElement.querySelector(".share-msg"), say = (t, l) => shareSay(msg, t, l);
    const act = b.dataset.share; b.disabled = true; say("Making the picture\u2026");
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
        if ("download" in HTMLAnchorElement.prototype) {
          const a = document.createElement("a"); a.href = url; a.download = SHARE_NAME; document.body.appendChild(a); a.click(); a.remove();
          say("Saved as " + SHARE_NAME + ".", { href: url, text: "Nothing saved? Open the picture and press and hold it." });
        } else { window.open(url, "_blank", "noopener"); say("Press and hold the picture to save it.", { href: url, text: "Open the picture" }); }
      }
    } catch (err) {
      say("Could not make the picture" + (err && err.message ? " (" + err.message + ")" : "") + ". Please try again.");
    } finally { b.disabled = false; }
  });

  window.__runes = {
    setItems: (list) => {
      items = list.map((p) => ({ flags: [], thumb: null, grade: "legendary", copies: 1, equipped: false, divineId: "", runeId: R.RUNES[0].id, runeName: R.RUNES[0].name, ...p, uid: ++uid }));
      filter = "all"; renderAll();
    },
    items: () => items,
    open: (k) => { open.add(k); renderRecap(); },
    tally: () => R.tally(items),
  };
  renderAll();
})();
