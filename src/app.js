(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const G = Gear;
  const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const spriteUrl = (id) => `icons/gear/${id}.png`;

  // ---------- reference pictures (12 gear sprites, 3 class icons, 2 diamonds, the digit templates) ----------
  function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  function toImageData(img) {
    const c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    return { width: d.width, height: d.height, data: d.data };
  }
  async function loadData(src) { let err; for (let k = 0; k < 3; k++) { try { return toImageData(await loadImage(k ? src + "?r=" + k : src)); } catch (e) { err = e; await sleep(250 * (k + 1)); } } throw err; }
  let refsError = null;
  const matcherP = (async () => {
    const sprites = {}, classes = {}, diamonds = {};
    await Promise.all([
      ...G.SPRITES.map(async (s) => { sprites[s.id] = await loadData(spriteUrl(s.id)); }),
      ...["hammer", "bow", "staff"].map(async (c) => { classes[c] = await loadData(`icons/class/${c}.png`); }),
      ...["normal", "refined"].map(async (d) => { diamonds[d] = await loadData(`icons/diamonds/${d}.png`); }),
    ]);
    const digits = await fetch("data/digits.json", { cache: "no-cache" }).then((r) => r.json());
    return G.buildMatcher({ sprites, classes, diamonds, digits });
  })().catch((e) => { refsError = e; throw e; });
  matcherP.catch(() => {});

  // ---------- state ----------
  let items = []; // the editable list of pieces
  let ignored = { skipped: 0, partialRows: 0 };
  let uid = 0, filter = "check";
  const open = new Set(["overview"]); // open/closed state of the recap sections survives a re-render

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
  $("files").addEventListener("change", () => { selected = [...$("files").files]; renderPicked(); });
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
  async function readImage(file) {
    if (file.type && !/^image\//.test(file.type)) throw new Error("it is not a picture");
    if (!file.size) throw new Error("the file is empty");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url).catch(() => { throw new Error("it could not be opened"); });
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error("the picture is empty");
      if (w > MAX_SIDE || h > MAX_SIDE) throw new Error("the picture is too big. Please use a normal phone screenshot.");
      let idata; try { idata = toImageData(img); } catch (e) { throw new Error("the picture is too big for this browser"); }
      return { img, idata };
    } finally { URL.revokeObjectURL(url); }
  }
  function cropUrl(src, rect) {
    const c = document.createElement("canvas"); c.width = 96; c.height = 96;
    c.getContext("2d").drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, 96, 96);
    return c.toDataURL("image/png");
  }
  const setNotes = (list) => { $("notes").innerHTML = list.length ? "<ul>" + list.map((n) => `<li class="${n.cls}">${esc(n.text)}</li>`).join("") + "</ul>" : ""; };
  const setStatus = (t, err) => { $("status").textContent = t; $("status").className = err ? "err" : "muted"; };

  $("read").addEventListener("click", async () => {
    const files = selected.length ? selected : [...$("files").files];
    if (!files.length) { setStatus("Please choose your screenshots first.", true); return; }
    $("read").disabled = true;
    const notes = [];
    try {
      setStatus("Getting ready\u2026");
      let matcher;
      try { matcher = await matcherP; } catch (e) { setStatus("My reference pictures could not be loaded. Please check your connection and reload the page.", true); return; }
      const analyses = [], sources = [];
      for (let i = 0; i < files.length; i++) {
        const name = files[i].name || `file ${i + 1}`;
        setStatus(`Reading screenshot ${i + 1} of ${files.length}\u2026`);
        await sleep(20);
        try {
          const { img, idata } = await readImage(files[i]);
          const an = G.analyze(matcher, idata);
          if (an.error) throw new Error(an.error === "no grid" ? "I could not find the Equipment tiles" : an.error);
          analyses.push(an); sources.push(img);
        } catch (e) { notes.push({ cls: "err", text: `I could not use "${name}": ${e.message}.` }); }
      }
      items = []; ignored = { skipped: 0, partialRows: 0 };
      if (!analyses.length) { finish(notes, "Sorry, I could not read any of your screenshots. Please use screenshots of your Equipment inventory.", true); return; }
      const merged = G.merge(analyses);
      for (const t of merged.tiles) { if (t.partialRow) ignored.partialRows++; else if (t.ignored && !t.cutOff) ignored.skipped++; }
      for (const t of G.toPieces(merged.tiles)) {
        const rect = analyses[t.src.shot - 1].rows[t.src.row].cols[t.src.col].rect;
        items.push({
          uid: ++uid, cls: t.cls, set: t.set, slot: t.slot, level: t.level || 0, diamonds: t.diamonds || 0, refinedCount: t.refinedCount || 0, equipped: !!t.equipped,
          flags: t.flags.slice(), thumb: cropUrl(sources[t.src.shot - 1], rect), src: t.src,
        });
      }
      if (ignored.partialRows) notes.push({ cls: "warn", text: `${pl(ignored.partialRows, "row")} ${ignored.partialRows === 1 ? "was" : "were"} cut off in every screenshot it appears in, so ${ignored.partialRows === 1 ? "it was" : "they were"} not read. If a piece is missing, add a screenshot that shows that row in full.` });
      if (ignored.skipped) notes.push({ cls: "muted", text: `Skipped ${pl(ignored.skipped, "tile")} that ${ignored.skipped === 1 ? "is" : "are"} not yellow (Mythic) or empty.` });
      if (!items.length) { finish(notes, "Sorry, I found no yellow (Mythic) gear. Is this your Equipment inventory? You can also add pieces by hand.", true); return; }
      items.sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0)); // unsure pieces first (stable: screenshot order otherwise)
      filter = items.some((x) => x.flags.length) ? "check" : "all";
      finish(notes, notes.some((n) => n.cls !== "muted") ? "Done, but please read the notes below." : "Done. Check the pieces below, then see your recap.", false);
      $("sec-recap").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    } catch (e) {
      console.error(e); setNotes(notes); setStatus("Sorry, something went wrong while reading your screenshots. Please try again.", true);
    } finally { $("read").disabled = false; }
  });
  function finish(notes, msg, err) { setNotes(notes); setStatus(msg, err); renderAll(); }

  // ---------- Check list ----------
  const CLS = G.CLASS_ORDER, SLOTS = G.SLOTS;
  const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? " selected" : ""}>${esc(label)}</option>`;
  const refKind = (p) => (p.diamonds === 0 ? "none" : G.isRefined(p) ? "refined" : "plain");
  function pieceRow(p) {
    const flagged = p.flags.length;
    const kinds = [["plain", "Normal (gold)"], ["refined", "Refined (platinum)"]];
    return `<li class="pc${flagged ? " flag" : ""}" data-u="${p.uid}">
      ${p.thumb ? `<img class="th" src="${p.thumb}" alt="Tile from your screenshot">` : `<span class="th"></span>`}
      <div>
        ${flagged ? `<p class="why">${esc(p.flags.join(" \u00b7 "))}</p>` : ""}
        <div class="fields">
          <label>Class<select data-f="cls">${CLS.map((c) => opt(c, c, p.cls)).join("")}</select></label>
          <label>Slot<select data-f="slot">${SLOTS.map((s) => opt(s, G.SLOT_NAME[s], p.slot)).join("")}</select></label>
          <label>Level<input data-f="level" type="number" inputmode="numeric" min="0" max="200" step="1" value="${p.level}"></label>
          <label>Diamonds<select data-f="diamonds">${[0, 1, 2, 3].map((n) => opt(n, n, p.diamonds)).join("")}</select></label>
          <label>Diamond type<select data-f="ref"${p.diamonds ? "" : " disabled"}>${kinds.map(([v, l]) => opt(v, l, refKind(p) === "none" ? "plain" : refKind(p))).join("")}</select></label>
          <label class="eq"><input data-f="equipped" type="checkbox"${p.equipped ? " checked" : ""}> Equipped</label>
        </div>
      </div>
      <div class="acts">${flagged ? `<button type="button" class="ok" data-act="ok"><span class="tick">\u2713</span> Looks right</button>` : ""}<button type="button" data-act="rm">Remove</button></div>
    </li>`;
  }
  function renderCheck() {
    const has = items.length > 0, flagged = items.filter((x) => x.flags.length).length;
    $("chips").hidden = !has; $("seg").hidden = !has;
    const setChip = (k, n) => { const c = $("chips").querySelector(`[data-k=${k}]`); c.querySelector("b").textContent = n; c.classList.toggle("zero", n === 0); };
    setChip("total", items.length); setChip("check", flagged); setChip("ignored", ignored.skipped);
    $("summary").innerHTML = has ? `I found <b>${pl(items.length, "piece")}</b>.${flagged ? ` <b>${flagged}</b> ${flagged === 1 ? "needs" : "need"} a check.` : " Nothing needs a check."}` : "Your pieces will show up here after you read your screenshots.";
    $("fAll").setAttribute("aria-pressed", filter === "all"); $("fCheck").setAttribute("aria-pressed", filter === "check");
    const list = filter === "check" ? items.filter((x) => x.flags.length) : items;
    $("plist").innerHTML = list.length ? list.map(pieceRow).join("") : has ? `<li class="muted">Nothing needs a check. Switch to All to see every piece.</li>` : "";
  }
  $("fAll").addEventListener("click", () => { filter = "all"; renderCheck(); });
  $("fCheck").addEventListener("click", () => { filter = "check"; renderCheck(); });
  $("addItem").addEventListener("click", () => {
    items.push({ uid: ++uid, cls: "INT", set: "int", slot: "helmet", level: 0, diamonds: 0, refinedCount: 0, equipped: false, flags: [], thumb: null, manual: true });
    filter = "all"; renderAll();
    const li = $("plist").querySelector(`[data-u="${uid}"]`); if (li) li.scrollIntoView({ block: "center" });
  });
  const itemOf = (el) => { const li = el.closest("li[data-u]"); return li ? items.find((x) => x.uid === +li.dataset.u) : null; };
  $("plist").addEventListener("change", (e) => {
    const f = e.target.dataset.f, p = itemOf(e.target); if (!f || !p) return;
    if (f === "cls") { p.cls = e.target.value; p.set = p.cls.toLowerCase(); }
    else if (f === "slot") p.slot = e.target.value;
    else if (f === "level") { const v = Math.round(Number(e.target.value)); p.level = Number.isFinite(v) ? Math.max(0, Math.min(200, v)) : 0; e.target.value = p.level; }
    else if (f === "diamonds") { const was = refKind(p) === "refined"; p.diamonds = +e.target.value; p.refinedCount = was ? p.diamonds : 0; } // refined is always the whole tile
    else if (f === "ref") p.refinedCount = e.target.value === "refined" ? p.diamonds : 0;
    else if (f === "equipped") p.equipped = e.target.checked;
    if (f === "diamonds") { const li = e.target.closest("li"); li.querySelector('[data-f="ref"]').disabled = !p.diamonds; li.querySelector('[data-f="ref"]').value = refKind(p) === "none" ? "plain" : refKind(p); }
    renderRecap(); invalidateShare();
  });
  $("plist").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return; const p = itemOf(b); if (!p) return;
    if (b.dataset.act === "ok") p.flags = [];
    else if (b.dataset.act === "rm") items = items.filter((x) => x !== p);
    renderAll();
  });

  // ---------- Recap ----------
  const gemsHtml = (p) => `<span class="dm" aria-label="${p.diamonds} diamond${p.diamonds === 1 ? "" : "s"}${p.refinedCount ? `, ${p.refinedCount} platinum` : ""}">${[0, 1, 2].map((i) => (i < p.diamonds ? `<span class="${i < p.refinedCount ? "p" : "g"}">\u25c6</span>` : `<span class="o">\u25c7</span>`)).join("")}</span>`;
  const sig = (p) => [p.level, p.diamonds, p.refinedCount, p.equipped ? 1 : 0].join("|");
  function groupPieces(list) {
    const m = new Map();
    for (const p of list) { const k = sig(p); if (!m.has(k)) m.set(k, { p, n: 0 }); m.get(k).n++; }
    return [...m.values()].sort((a, b) => G.pieceOrder(a.p, b.p));
  }
  const pieceLi = ({ p, n }) => {
    const kind = refKind(p);
    return `<li><span class="ic"><img src="${spriteUrl(p.cls.toLowerCase() + "-" + p.slot)}" alt="" width="34" height="34"></span><div><span class="lv">${p.level ? "+" + p.level : "Level 0"}</span> ${gemsHtml(p)} ${kind === "refined" ? `<span class="chipx ref">Refined</span>` : ""} ${p.equipped ? `<span class="chipx eq">Equipped</span>` : `<span class="chipx spare">Spare</span>`}</div>${n > 1 ? `<span class="mult">\u00d7${n}</span>` : "<span></span>"}</li>`;
  };
  const det = (key, cls, title, n, meta, body) => `<details class="x ${cls}" data-k="${key}"${open.has(key) ? " open" : ""}><summary><span class="t">${esc(title)}</span>${meta ? `<span class="m">${meta}</span>` : ""}<span class="n">${n}</span></summary><div class="body">${body}</div></details>`;
  const barRows = (rows) => { const max = Math.max(1, ...rows.map((r) => r[1])); return rows.map(([l, n]) => `<div class="br"><span>${esc(l)}</span><span class="t"><i style="width:${Math.round((n / max) * 100)}%"></i></span><b>${n}</b></div>`).join(""); };
  const slotTable = (R) => {
    const cell = (st) => `<td><b>${st.refined}</b> / ${st.total}</td>`;
    const all = { total: R.total, refined: R.refined };
    return `<div class="stat wide"><h4>Refined per slot <span class="m">(refined / pieces)</span></h4><div class="tw"><table class="st"><thead><tr><th scope="col">Slot</th><th scope="col">All</th>${CLS.map((c) => `<th scope="col" title="${G.CLASSES[c].name}">${c}</th>`).join("")}</tr></thead><tbody>${SLOTS.map((sl) => `<tr><th scope="row">${G.SLOT_NAME[sl]}</th>${cell(R.slotStats[sl])}${CLS.map((c) => cell(R.byClass[c].slotStats[sl])).join("")}</tr>`).join("")}<tr class="tot"><th scope="row">All slots</th>${cell(all)}${CLS.map((c) => cell({ total: R.byClass[c].total, refined: R.byClass[c].refined })).join("")}</tr></tbody></table></div><p class="hint">${SLOTS.map((sl) => `${G.SLOT_NAME[sl]}: ${pl(R.slotStats[sl].total, "piece")}, ${R.slotStats[sl].refined} refined`).join(" \u00b7 ")}</p></div>`;
  };
  function recapHtml(R) {
    const T = R.total;
    const cls = (c) => R.byClass[c];
    const tiles = `<div class="tiles"><div class="tile"><div class="k">Pieces</div><div class="v">${T}</div><div class="s">max level +${R.maxLevel}</div></div>${CLS.map((c) => `<div class="tile cls"><div class="k">${c} \u00b7 ${G.CLASSES[c].name}</div><div class="v">${cls(c).total}</div><div class="s">Refined ${cls(c).refined} \u00b7 Equipped ${cls(c).equipped}</div></div>`).join("")}</div>`;
    const stats = slotTable(R) + `<div class="stats">
      <div class="stat"><h4>Refined or not</h4>${barRows([["Refined (platinum)", R.refined], ["Normal (gold)", R.plain], ["No diamonds", R.noDiamonds]])}</div>
      <div class="stat"><h4>Transcendence (diamonds)</h4>${barRows([0, 1, 2, 3].map((d) => [d ? "\u25c6".repeat(d) + " (" + d + ")" : "None (0)", R.transc[d]]))}</div>
      <div class="stat"><h4>Equipped or spare</h4>${barRows([["Equipped", R.equipped], ["Spare", R.spare]])}</div>
      <div class="stat"><h4>Level</h4>${barRows(R.levels.map((l) => [l.label, l.n]))}</div></div>`;
    const sets = G.completeSets(items);
    const setLine = `<p class="hint">Full sets (helmet + armor + boots + weapon of one class): ${CLS.map((c) => `${c} (${G.CLASSES[c].name}) <b>${sets[c].complete}</b>`).join(" \u00b7 ")}</p>`;
    let html = det("overview", "ov", "Overview", T, "", tiles + stats + setLine);
    for (const c of CLS) {
      const C = cls(c); if (!C.total) continue;
      const slots = SLOTS.filter((s) => C.slots[s] && C.slots[s].length).map((s) => det(`${c}-${s}`, "sl", G.SLOT_NAME[s], C.slots[s].length, `${C.slotStats[s].refined} refined`, `<ul class="pl">${groupPieces(C.slots[s]).map(pieceLi).join("")}</ul>`)).join("");
      html += det(c, "cl", `${G.CLASSES[c].name} (${c})`, C.total, `Refined ${C.refined} \u00b7 Equipped ${C.equipped}`, slots);
    }
    return html;
  }
  function renderRecap() {
    const el = $("recap");
    if (!items.length) { el.innerHTML = `<p class="muted">Your recap will show up here.</p>`; return; }
    const R = G.recap(items);
    el.innerHTML = `<div class="bar"><button type="button" id="expAll">Expand all</button><button type="button" id="colAll">Collapse all</button></div>` + recapHtml(R) + shareHtml();
    shareInit();
  }
  $("recap").addEventListener("toggle", (e) => { const d = e.target; if (d && d.matches && d.matches("details.x[data-k]")) { if (d.open) open.add(d.dataset.k); else open.delete(d.dataset.k); if (d.dataset.k === "share" && d.open) shareWarm(); } }, true);
  $("recap").addEventListener("click", (e) => {
    if (e.target.closest("#expAll")) { $("recap").querySelectorAll("details.x").forEach((d) => { d.open = true; }); }
    else if (e.target.closest("#colAll")) { $("recap").querySelectorAll("details.x").forEach((d) => { d.open = false; }); }
  });
  function renderAll() { renderCheck(); renderRecap(); invalidateShare(); }

  // ---------- share image: a PNG of the recap for Discord (canvas in the browser, no network) ----------
  // Share is offered whenever the browser has navigator.share (the files check happens on the click, with the real picture, because some browsers only answer
  // canShare({files}) truthfully for a real image). Copy only where an image can really be put on the clipboard (and it is hidden after a refusal).
  // The picture is drawn ahead of time (when the section opens) and kept, so a tap on Copy / Share / Download needs no drawing time and the
  // browser's "user just clicked" permission is still valid.
  const NATIVE_OK = typeof navigator.share === "function";
  const COPY_OK = (() => {
    try {
      if (!(navigator.clipboard && typeof navigator.clipboard.write === "function" && typeof window.ClipboardItem === "function")) return false;
      if (typeof ClipboardItem.supports === "function" && ClipboardItem.supports("image/png") === false) return false;
      return true;
    } catch (e) { return false; }
  })();
  let COPY_BROKEN = false;
  const SHARE_NAME = "souls-organizer-equipment.png";
  let LAST = { blob: null, previewUrl: null };
  let warmTimer = 0;
  const shareHtml = () => `<details class="x" data-k="share"${open.has("share") ? " open" : ""}><summary><span class="t">Share image</span><span class="m">for Discord</span><span class="n">PNG</span></summary><div class="body">
    <p class="hint">One picture with the totals and every piece, to keep track in Discord.</p>
    <div class="share" role="group" aria-label="Share the recap as a picture"><button type="button" class="primary" data-share="native" hidden>Share image</button><button type="button" data-share="copy" hidden>Copy image</button><button type="button" data-share="dl">Download PNG</button><span class="share-msg" role="status" aria-live="polite"></span></div>
    <img class="prev" id="sharePrev" alt="Preview of the share image" hidden></div></details>`;
  function shareInit() {
    $("recap").querySelectorAll('[data-share="native"]').forEach((b) => { b.hidden = !NATIVE_OK; });
    $("recap").querySelectorAll('[data-share="copy"]').forEach((b) => { b.hidden = !COPY_OK || COPY_BROKEN; });
    if (open.has("share")) shareWarm();
  }
  function invalidateShare() { LAST.blob = null; if (LAST.previewUrl) { URL.revokeObjectURL(LAST.previewUrl); LAST.previewUrl = null; } clearTimeout(warmTimer); if (open.has("share") && items.length) warmTimer = setTimeout(() => shareWarm(), 400); }
  function shareBlob() {
    if (!items.length) return Promise.reject(new Error("Read your screenshots first"));
    if (LAST.blob) return LAST.blob;
    const m = Share.model(items, G.recap(items), { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) });
    const p = Share.render(m, { spriteUrl }).then(Share.toBlob);
    LAST.blob = p; p.catch(() => { if (LAST.blob === p) LAST.blob = null; });
    p.then((b) => { if (LAST.blob !== p) return; if (LAST.previewUrl) URL.revokeObjectURL(LAST.previewUrl); LAST.previewUrl = URL.createObjectURL(b); const im = $("sharePrev"); if (im) { im.src = LAST.previewUrl; im.hidden = false; } }).catch(() => {});
    return p;
  }
  function shareWarm() { try { shareBlob().catch(() => {}); } catch (e) { /* the click will say what went wrong */ } }
  let SHARE_URL = null;
  function shareSay(msg, text, link) {
    if (!msg) return; msg.textContent = text || "";
    if (link) { const a = document.createElement("a"); a.href = link.href; a.target = "_blank"; a.rel = "noopener"; a.textContent = link.text; msg.append(" ", a); }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-share]"); if (!b) return;
    const msg = b.parentElement.querySelector(".share-msg"), say = (t, l) => shareSay(msg, t, l);
    const act = b.dataset.share; b.disabled = true; say("Making the picture\u2026");
    const lastBlobUrl = (blob) => { if (SHARE_URL) URL.revokeObjectURL(SHARE_URL); SHARE_URL = URL.createObjectURL(blob); return SHARE_URL; };
    try {
      if (act === "copy") {
        // the Blob goes in as a promise (made inside the click) so Chrome and Safari keep the click's permission while the picture is drawn
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
        try { await navigator.share({ files: [file], title: "SOULS Organizer" }); say("Shared."); }
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

  // for tests and the preview script
  window.__organizer = { setItems: (list) => { items = list.map((p) => ({ uid: ++uid, flags: [], thumb: null, ...p })); filter = "all"; renderAll(); }, items: () => items, open: (k) => { open.add(k); renderRecap(); } };
  renderAll();
})();
