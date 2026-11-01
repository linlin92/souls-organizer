(async function () {
  // cache-busting: SOULS_V is the one shared version (set in index.html, bumped on every deploy by tools/bump-version.js); data is also always revalidated
  const SV = window.SOULS_V || "";
  const vq = (p) => (SV ? p + "?v=" + encodeURIComponent(SV) : p);
  const load = (p) => fetch(vq(p), { cache: "no-cache" }).then((r) => r.json());
  const data = {
    artifacts: await load("data/artifacts.json"),
    rules: await load("data/rules.json"),
    upgrade: await load("data/upgrade_cost.json"),
  };
  const NOTES = (await load("data/priority_notes.json")).notes; // Yustian's per-Mythic priority sheet (display only)
  const special = await load("data/special.json"); // Faded Artifact (fodder): recognised so it is never mistaken for a real artifact
  const templates = [...data.artifacts, ...special]; // everything the reader can recognise (incl. skipped free items)
  const everything = [...data.artifacts, ...special.filter((a) => !a.ignore)]; // everything the user can pick or add
  const digits = await load("data/digits.json");
  const byId = Object.fromEntries(everything.map((a) => [a.id, a]));
  const rulesItems = Advisor.ruleItems(data.rules); // every Mythic any tier asks for (highest cumulative total)
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const ESS_IMG = vq("icons/ui/dimensional-essence.png");
  const money = (n) => `<span class="ess"><img src="${ESS_IMG}" alt="" width="26" height="30">${esc(n)}</span>`;
  const rar = (id) => (/^(mythic|legendary|primal)-/.exec(id) || [0, "mythic"])[1];
  const A_ICON = (id, name) => `<img class="ai" src="icons/${id}.png${SV ? "?v=" + SV : ""}" alt="" width="20" height="20">${name}`;
  const H = (t) => Advisor.render(t, "html");
  const pnote = (id) => (/^mythic-/.test(id) && NOTES[id] ? `<small class="pn">${esc(NOTES[id])}</small>` : ""); // small subtitle under a Mythic's name
  // The advice cards: recommended next step, what is missing, extra crafts, tips (all from Advisor.view)
  // Subtitle of the first recommended craft. "Save again" is only advice with SAVE_LIMIT (14000) or less left.
  function heroTail(h) {
    const more = h.items.length - 1;
    if (more > 0) return `Max it right away, then craft the next one. You can afford ${more} more.${h.saveAfter ? " After the last one, save your Dimensional Essences again." : ""}`;
    if (h.saveAfter) return "Max it right away, then save your Dimensional Essences again.";
    return `Max it right away. Nothing else is ready to craft yet${h.canAfford > 0 ? `, but you can afford ${h.canAfford} more once its copies are there` : ""}.`;
  }
  // Compact rows (Also recommended / Next to craft): 40px icon | bold name + pills | optional right-side chip; muted lines under the name.
  // craft order: 1st, 2nd, 3rd ... (the order the plan lists the crafts in)
  const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
  const ob = (n, big) => `<span class="ob${big ? " big" : ""}" aria-label="Step ${n}">Step ${n}</span>`;
  // an additional copy of an artifact you already own is titled "Craft your 2nd ..." (ordinal = owned + 1)
  const rowTitle = (name, copy) => (copy > 1 ? craftTitle(name, copy) : name);
  const craftTitle = (name, copy, lead) => `${lead || "Craft"} ${copy > 1 ? `your ${ordinal(copy)} ` : ""}${name}`;
  const pill = (t, hl) => `<span class="pl${hl ? " hl" : ""}">${esc(t)}</span>`;
  const essChip = (n) => `<span class="ec"><img src="${ESS_IMG}" alt="" width="16" height="18">${esc(n)}</span>`;
  const aiImg = (id) => `<img class="ai" src="icons/${id}.png${SV ? "?v=" + SV : ""}" alt="" width="16" height="16">`;
  const lstRow = (x, pills, notes, side, order) => `<li><span class="frame r-${rar(x.id)}"><img src="icons/${x.id}.png${SV ? "?v=" + SV : ""}" alt=""></span><div class="rb"><div class="rt">${order ? ob(order) : ""}<b>${esc(x.title || x.name)}</b>${pills.join("")}</div>${notes.join("")}</div>${side || ""}</li>`;
  // one short line for what an entry of Next to craft still needs
  function needLine(n) {
    const bits = n.short.map((m) => `Need ${m.short} more ${aiImg(m.id)}${esc(m.name)} (${m.have}/${m.need})${m.copies > 1 ? ` for each of ${m.copies} copies` : ""}`);
    if (n.gate) {
      if (!n.gate.reqOk) bits.push(`Own ${n.gate.requires.map((r) => `${aiImg(r.id)}${esc(r.name)}`).join(", ")} first`);
      if (n.gate.flames < n.gate.minFlames) bits.push(`Need ${n.gate.minFlames} spare ${aiImg("legendary-18")}Essence of Burning Flame (${Advisor.flameHave(n.gate.flames, n.gate.equippedFlames)})`);
    }
    if (n.essenceShort > 0) bits.push(`Need ${essChip(n.essenceShort)} more`);
    if (!bits.length) bits.push("Ready to craft");
    return `<small class="need${n.short.length || n.gate || n.essenceShort > 0 ? "" : " ok"}">${bits.join(" · ")}</small>`;
  }
  const FOCUS = { pvp: "PvP-Focus", pve: "PvE-Focus" };
  const focusPill = (f) => pill(FOCUS[f]);
  // group label of an item: Basic / Intermediate / Advanced / Optional for advanced / PvP-Focus / PvE-Focus / Late (never "Tier N")
  const groupOf = (tier, optional, focus) => (focus ? FOCUS[focus] : optional && tier === 3 ? "Optional for advanced" : (Advisor.TIER_NAMES[tier] || "Tier " + tier));
  const groupPill = (tier, optional, focus) => pill(groupOf(tier, optional, focus), !!optional);
  const alsoRow = (x, i) => lstRow({ ...x, title: rowTitle(x.name, x.copy) }, [x.pool ? pill("Optional", true) : groupPill(x.tier, x.optional, x.focus), ...(x.ahead ? [pill("Crafting ahead", true)] : [])], pnote(x.id) ? [pnote(x.id)] : [], essChip(x.cost), i + 2);
  const nextRow = (n) => lstRow({ ...n, title: rowTitle(n.name, n.copyNo) }, [n.pool ? pill("Optional", true) : "", ...(n.pool ? [] : [groupPill(n.tier, n.optional, n.focus)]), ...(n.need > 1 && !n.pool ? [pill(`${n.owned}/${n.need} owned`)] : [])].filter(Boolean), [...(pnote(n.id) ? [pnote(n.id)] : []), needLine(n)]);
  const groupedNeed = (list) => { const by = new Map(); for (const m of list || []) { if (!by.has(m.ingredientId)) by.set(m.ingredientId, { m, n: 0 }); by.get(m.ingredientId).n++; } return [...by.values()].map(({ m, n }) => `<small class="need">Need ${m.short} more ${aiImg(m.ingredientId)}${esc(m.ingredient)} (${m.have}/${m.need})${n > 1 ? ` for each of ${n} copies` : ""}</small>`).join(""); };
  // "What artifact you can craft?": closed by default, inside the Recommended card; lists every Mythic whose Legendary ingredients the player has
  let CAN_OPEN = false;
  const LAST = {}; // per advice box (#out, #out2): what the share image is made from
  const GROUP_PILL = { "Don't craft": "never", "Consider very carefully": "caution" };
  function canHTML(V) {
    const L = V.craftable || [];
    const row = (x) => {
      const note = pnote(x.id) && (x.gk === "never" || x.gk === "caution") ? [pnote(x.id)] : [];
      const have = [`Have ${x.have}/${x.qty} ${esc(x.ingredient)}`, x.can > 1 ? `enough for ${x.can}` : "", x.owned ? `you own ${x.owned}` : ""].filter(Boolean).join(" · ");
      const side = x.affordable ? `<span class="enough" title="You have enough Dimensional Essences for one craft">\u2713 Essences</span>` : `<span class="enough no" title="Essences needed for one craft">Need ${essChip(x.essenceShort)}</span>`;
      return lstRow(x, [pill(x.group, x.gk === "never" || x.gk === "caution" ? false : !!x.optional)].map((p) => (GROUP_PILL[x.group] ? p.replace('class="pl"', `class="pl ${GROUP_PILL[x.group]}"`) : p)), [...note, `<small class="need">${have}</small>`], side);
    };
    const share = `<div class="share" role="group" aria-label="Share this advice as a picture"><button type="button" class="primary" data-share="native" hidden>Share image</button><button type="button" data-share="copy" hidden>Copy image</button><button type="button" data-share="dl">Download PNG</button><span class="share-msg" role="status" aria-live="polite"></span></div>`;
    const body = L.length ? `<p class="can-sub">${L.length} Mythic${L.length > 1 ? "s" : ""} you have the Legendary artifacts for right now. Not everything here is worth crafting, see the badges.</p>${share}<ul class="lst can-list">${L.map(row).join("")}</ul>`
      : `<p class="can-empty">Nothing yet. A Mythic needs several copies of its Legendary artifact, so keep collecting. Your Priority List shows what to aim for.</p>${share}`;
    return `<details class="can"${CAN_OPEN ? " open" : ""}><summary><span class="can-t">What artifact you can craft?</span><span class="can-n">${L.length}</span><span class="can-ch" aria-hidden="true"></span></summary><div class="can-body">${body}</div></details>`;
  }
  function renderAdvice(el, res, extras, state) {
    const V = Advisor.view(res), h = V.hero;
    LAST[el.id] = { V, state: state || {}, essence: res.essenceStart };
    let out = V.progress.length ? `<p class="prog">${esc(V.progress.join(" "))}</p>` : "";
    const nameOf = (id) => (byId[id] ? byId[id].name : id);
    if (V.skipped.length) out += `<p class="skipbar" id="skipbar">Skipped: ${V.skipped.map((id) => esc(nameOf(id))).join(", ")}. <button type="button" class="link" data-act="resetSkips">Reset</button></p>`;
    const chg = h.kind === "craft" ? `<button type="button" class="chg" data-act="chg" data-id="${h.items[0].id}" title="Skip this one and show the next artifact" aria-label="Change recommendation: skip this one and show the next artifact">Change</button>` : "";
    const tag = `<div class="rec-top"><div class="rec-tag">★ ${h.kind === "craft" ? "Recommended to craft" : "Recommended next step"}</div>${chg}</div>`;
    if (h.kind === "craft") {
      const first = h.items[0];
      const meanwhile = h.ahead && !h.pool && V.priority.length;
      if (meanwhile) out += `<h4>Priority (${h.waitingFor === "copies" ? "waiting for copies" : "not complete yet"})</h4><ul class="lst next prio">${V.priority.map(nextRow).join("")}</ul>`;
      out += `<div class="rec">${tag}<div class="rec-body"><span class="frame r-${rar(first.id)}"><img src="icons/${first.id}.png${SV ? "?v=" + SV : ""}" alt="">${ob(1, true)}</span><div><h3>${esc(craftTitle(first.name, first.copy, meanwhile ? "Meanwhile, craft" : "Craft"))}</h3><div class="rt">${meanwhile ? groupPill(first.tier, first.optional, first.focus) + pill("Crafting ahead", true) : ""}</div>${pnote(first.id) ? `<p class="pn-row">${pnote(first.id)}</p>` : ""}<p>${meanwhile ? `${groupOf(h.waitingTier)} is ${h.waitingFor === "copies" ? "waiting for copies" : "not complete yet"}. Meanwhile you have enough Dimensional Essences to craft ${esc(first.name)}. ` : ""}${meanwhile ? "" : h.pool ? (h.waitingTier === null ? "Every tier is done, so while you have plenty of Dimensional Essences this optional one (not on a tier) is worth crafting. " : `${groupOf(h.waitingTier)} is ${h.waitingFor === "copies" ? "waiting for copies (see What's missing)" : "not complete yet (see below)"}, so while you have plenty of Dimensional Essences this optional one (not on a tier) is worth crafting. `) : h.ahead ? `${groupOf(h.waitingTier)} is ${h.waitingFor === "copies" ? "waiting for copies (see What's missing)" : "not complete yet (see below)"}, so this is the next one you can craft. ` : ""}${heroTail(h)}</p></div></div>
        <div class="rec-cost"><div><small>${h.items.length > 1 ? "Cost of all" : "Cost"}</small>${money(h.cost)}</div><div><small>Left after</small>${money(h.left)}</div></div>${canHTML(V)}</div>`;
      if (h.items.length > 1) out += `<h4>Also recommended to craft</h4><ul class="lst also">${h.items.slice(1).map(alsoRow).join("")}</ul>`;
    } else if (h.kind === "save") {
      out += `<div class="rec">${tag}<div class="rec-body"><span class="frame r-ui"><img src="${ESS_IMG}" alt=""></span><div><h3>Save your Dimensional Essences</h3><p>Don't craft yet. Each artifact needs all of its copies first.</p></div></div>
        <div class="rec-cost"><div><small>You have</small>${money(h.have)}</div><div><small>Each artifact costs</small>${money(h.per)}</div></div>${canHTML(V)}</div>`;
    } else {
      out += `<div class="rec">${tag}<div class="rec-body"><span class="frame r-ui"><img src="${ESS_IMG}" alt=""></span><div><h3>You're all set!</h3><p>Everything on the list is done.</p></div></div>${canHTML(V)}</div>`;
    }
    if (V.next.length) out += `<h4>Next to craft</h4><ul class="lst next">${V.next.map(nextRow).join("")}</ul>`;
    if (V.missing.length) out += `<h4>What's missing</h4><ul class="miss">${V.missing.map((m) => `<li>${H(Advisor.art(m.id, m.name))}${m.focus ? ` (${FOCUS[m.focus]})` : ""}: ${H(m.text)}.</li>`).join("")}</ul>`;
    if (V.tips.length) out += `<h4>Tip</h4><ul class="miss">${V.tips.map((t) => `<li>${H(t)}</li>`).join("")}</ul>`;
    if (V.caution.length) out += `<p class="note">Consider very carefully before crafting ${V.caution.length > 1 ? V.caution.slice(0, -1).map(esc).join(", ") + " or " + esc(V.caution[V.caution.length - 1]) : V.caution.map(esc).join("")}, because of the cost and the future Primals yet to come. They are never suggested automatically.</p>`;
    for (const x of extras || []) out += `<p class="note">${x}</p>`;
    el.innerHTML = out;
    const cd = el.querySelector("details.can"); if (cd) cd.addEventListener("toggle", () => { CAN_OPEN = cd.open; });
    shareInit(el);
  }

  // ---------- share image: a PNG of the advice for Discord (canvas in the browser, no network) ----------
  // Share is offered whenever the browser has navigator.share (the files check happens on the click, with the real picture, because some browsers only answer
  // canShare({files}) truthfully for a real image). Copy only where an image can really be put on the clipboard.
  const NATIVE_OK = typeof navigator.share === "function";
  const COPY_OK = (() => {
    try {
      if (!(navigator.clipboard && typeof navigator.clipboard.write === "function" && typeof window.ClipboardItem === "function")) return false;
      if (typeof ClipboardItem.supports === "function" && ClipboardItem.supports("image/png") === false) return false;
      return true;
    } catch (e) { return false; }
  })();
  let COPY_BROKEN = false; // set when a copy was refused once: the button is hidden from then on
  const SHARE_NAME = "souls-craft-advice.png";
  function shareInit(el) {
    el.querySelectorAll('[data-share="native"]').forEach((b) => { b.hidden = !NATIVE_OK; });
    el.querySelectorAll('[data-share="copy"]').forEach((b) => { b.hidden = !COPY_OK || COPY_BROKEN; });
    if (CAN_OPEN) shareWarm(el);
  }
  // The picture is drawn ahead of time (when the section is open) and kept per advice, so a tap on Copy / Share / Download needs no drawing time
  // and the browser's "user just clicked" permission is still valid. A new advice makes a new picture.
  function shareBlob(box) {
    const L = LAST[box.id]; if (!L) return Promise.reject(new Error("Get advice first"));
    if (L.blob) return L.blob;
    const m = Share.model(L.V, L.state, data, { essence: L.essence });
    L.blob = Share.render(m, { iconUrl: (id) => `icons/${id}.png${SV ? "?v=" + SV : ""}`, essenceUrl: ESS_IMG, noahUrl: vq("icons/ui/noah.png") }).then(Share.toBlob);
    L.blob.catch(() => { if (L.blob) L.blob = null; });
    return L.blob;
  }
  function shareWarm(box) { try { shareBlob(box).catch(() => {}); } catch (e) { /* the click will say what went wrong */ } }
  let SHARE_URL = null;
  function shareSay(msg, text, link) {
    if (!msg) return; msg.textContent = text || "";
    if (link) { const a = document.createElement("a"); a.href = link.href; a.target = "_blank"; a.rel = "noopener"; a.textContent = link.text; msg.append(" ", a); }
  }
  document.addEventListener("toggle", (e) => { const d = e.target; if (d && d.matches && d.matches("details.can") && d.open) { const box = d.closest("#out, #out2"); if (box) shareWarm(box); } }, true);
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-share]"); if (!b) return;
    const box = b.closest("#out, #out2"), msg = b.parentElement.querySelector(".share-msg"), say = (t, l) => shareSay(msg, t, l);
    if (!box) return;
    const act = b.dataset.share; b.disabled = true; say("Making the picture\u2026");
    const lastBlobUrl = (blob) => { if (SHARE_URL) URL.revokeObjectURL(SHARE_URL); SHARE_URL = URL.createObjectURL(blob); return SHARE_URL; };
    try {
      if (act === "copy") {
        // the Blob goes in as a promise (made inside the click) so Chrome and Safari keep the click's permission while the picture is drawn
        try { await navigator.clipboard.write([new ClipboardItem({ "image/png": shareBlob(box) })]); say("Copied. Paste it into Discord."); }
        catch (err) {
          if (err && err.name === "AbortError") { say(""); return; }
          COPY_BROKEN = true; document.querySelectorAll('[data-share="copy"]').forEach((x) => { x.hidden = true; });
          say("This browser does not let a page copy a picture. Use Download PNG" + (NATIVE_OK ? " or Share image." : "."));
        }
      } else if (act === "native") {
        const blob = await shareBlob(box), file = new File([blob], SHARE_NAME, { type: "image/png" });
        let can = false; try { can = !navigator.canShare || navigator.canShare({ files: [file] }); } catch (err) { can = false; }
        if (!can) { say("This browser cannot share a picture file. Use Download PNG.", { href: lastBlobUrl(blob), text: "Or open the picture and press and hold it to save." }); return; }
        try { await navigator.share({ files: [file], title: "SOULS Artifact Advisor" }); say("Shared."); }
        catch (err) { say(err && err.name === "AbortError" ? "" : "Could not share the picture. Use Download PNG."); }
      } else {
        const blob = await shareBlob(box), url = lastBlobUrl(blob);
        if ("download" in HTMLAnchorElement.prototype) {
          const a = document.createElement("a"); a.href = url; a.download = SHARE_NAME; document.body.appendChild(a); a.click(); a.remove();
          say("Saved as " + SHARE_NAME + ".", { href: url, text: "Nothing saved? Open the picture and press and hold it." });
        } else { window.open(url, "_blank", "noopener"); say("Press and hold the picture to save it.", { href: url, text: "Open the picture" }); }
      }
    } catch (err) {
      say("Could not make the picture" + (err && err.message ? " (" + err.message + ")" : "") + ". Please try again.");
    } finally { b.disabled = false; }
  });

  // ---------- manual entry (fallback) ----------
  const row = (label, id, ph, sub) => `<label class="f"><span class="fl">${label}${sub || ""}</span><input id="${id}" type="text" inputmode="numeric" autocomplete="off" placeholder="${ph || ""}"></label>`;
  // The manual lists hold EVERY Mythic and Legendary of the data set (the two Primals and the free Adventurer's Chronicle are left out),
  // alphabetical. "(PvP)" marks the Mythics the priority list only wants for PvP players.
  const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });
  const mythicList = data.artifacts.filter((a) => a.rarity === "Mythic").sort(byName);
  const primalList = data.artifacts.filter((a) => a.rarity === "Primal").sort(byName);
  const legendList = data.artifacts.filter((a) => a.rarity === "Legendary").sort(byName);
  const pvpOnly = (id) => { const l = rulesItems.filter((i) => i.id === id); return l.length > 0 && l.every((i) => i.focus === "pvp"); };
  // Each rarity section has a tab bar by class (Yustian's class list, stored as "class" in data/artifacts.json); under the active tab a compact grid
  // of cards (icon, name, small number input), A-Z. All panels stay in the DOM (only hidden), so typed values survive switching tabs.
  const CLASSES = ["Dealer", "Tanker", "Healer", "Supporter", "Neutral"].map((c) => [c, `<img class="ci" src="${vq("icons/ui/class-" + c.toLowerCase() + ".png")}" alt="" width="20" height="20">`]);
  const card = (a, label, id) => `<label class="f cardf"><img class="ai" src="icons/${a.id}.png${SV ? "?v=" + SV : ""}" alt="" width="40" height="40"><span class="fl">${esc(label)}</span><input id="${id}" type="text" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="${esc(label)}, how many"></label>`;
  function tabsFor(box, key, list, labelOf, prefix) {
    const groups = CLASSES.map(([c, ic]) => ({ c, ic, l: list.filter((a) => a.class === c) })).filter((g) => g.l.length);
    box.innerHTML = `<div class="tabs" role="tablist" aria-label="${key} artifacts by class">${groups.map((g, i) => `<button type="button" role="tab" class="tab" id="tab_${key}_${g.c}" aria-controls="pnl_${key}_${g.c}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${g.ic} ${g.c} <small>(${g.l.length})</small></button>`).join("")}</div>` +
      groups.map((g, i) => `<div role="tabpanel" class="tabpanel" id="pnl_${key}_${g.c}" aria-labelledby="tab_${key}_${g.c}" tabindex="0" ${i === 0 ? "" : "hidden"}><div class="cards">${g.l.map((a) => card(a, labelOf(a), prefix + a.id)).join("")}</div></div>`).join("");
    const tabs = [...box.querySelectorAll('[role="tab"]')];
    const pick = (t, focus) => { tabs.forEach((x) => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; box.querySelector("#" + x.getAttribute("aria-controls")).hidden = !on; }); if (focus) t.focus(); };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => pick(t));
      t.addEventListener("keydown", (e) => {
        const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
        if (to !== undefined) { e.preventDefault(); pick(tabs[to], true); }
      });
    });
  }
  tabsFor($("mythics"), "mythic", mythicList, (a) => `${a.name}${pvpOnly(a.id) ? " (PvP-Focus)" : ""}`, "m_");
  const fodder = special.filter((a) => !a.ignore && a.rarity === "Legendary"); // the Faded Artifact stays pickable (it shows in the list as fodder)
  const pickLegend = [...legendList, ...fodder].sort(byName);
  const pickable = [...primalList, ...mythicList, ...pickLegend]; // dropdowns and the add box: Primal, then Mythic, then Legendary, each A-Z (no Adventurer's Chronicle)
  const legIds = legendList.map((a) => a.id);
  tabsFor($("legs"), "legendary", legendList, (a) => a.name, "l_");
  const FLAME = "legendary-18";
  // "Change recommendation": artifacts skipped from Step 1, per advice box (screenshots: out, manual form: out2). Cleared by Get advice, new inputs or Reset.
  const SK = { out: [], out2: [] };
  // clicks inside an advice box: Change recommendation skips the current Step 1 artifact, Reset brings them all back; rerun() plans again
  function wireSkips(el, rerun) {
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const list = SK[el.id];
      if (b.dataset.act === "chg") { const id = b.dataset.id; if (!id || list.includes(id)) return; list.push(id); }
      else if (b.dataset.act === "resetSkips") list.length = 0;
      else return;
      rerun();
      const nb = el.querySelector("button.chg") || el.querySelector("button[data-act=resetSkips]"); if (nb) nb.focus({ preventScroll: true });
    });
  }
  let advised2 = false;
  const runManual = () => $("f").requestSubmit ? $("f").requestSubmit() : $("f").dispatchEvent(new Event("submit", { cancelable: true }));
  $("f").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!keep2) SK.out2.length = 0;
    keep2 = false;
    const errors = [];
    const num = (id, label, max, allowEmpty) => { const r = Advisor.parseCount($(id).value, { label, max, allowEmpty }); if (!r.ok) errors.push(r.error); return r.value || 0; };
    const essence = num("essence2", "Dimensional Essences", 999999999, false);
    const mythics = {};
    mythicList.forEach((a) => { const v = num("m_" + a.id, a.name + " owned", 20, true); if (v > 0) mythics[a.id] = v; });
    const legendaryCopies = {};
    legIds.forEach((id) => (legendaryCopies[id] = num("l_" + id, byId[id].name + " copies", 999, true)));
    if (errors.length) { $("out2").innerHTML = `<div class="note">Please fix this first:<br>- ${errors.map(esc).join("<br>- ")}</div>`; return; }
    // one question: the Essence of Burning Flame copies typed here are also the spare (not equipped) flames
    const res = Advisor.advise(data, { essence, spareEssenceFlames: legendaryCopies[FLAME] || 0, mythics, legendaryCopies, pvp: $("pvp2").checked, skip: SK.out2 });
    renderAdvice($("out2"), res, [], { mythics, legendaryCopies });
    advised2 = true;
  });

  // ---------- screenshot reading ----------
  let items = []; // editable "what I read" list
  let ignoredCount = 0; // lower-rarity artifacts that were left out
  let filter = "all", query = "";
  let uid = 0;
  // The reference pictures are many small files (about 140). A picture that fails to load (a flaky phone connection) must never be
  // dropped quietly: the artifact it stands for could then not be recognised and its tile would be matched to the next best, wrong
  // artifact (a Noble's Pocket Watch read as Warrior's Axe). So loads are limited to a few at a time, each is tried again, and anything
  // still missing is tried once more when the player presses Read; if it is still missing the player is told which ones.
  const SETS = [{ dir: "icons/", list: templates, got: new Map() }, { dir: "icons-old/", list: data.artifacts, got: new Map() }]; // composite icons; first icon set (fallback)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function loadIconData(src) {
    let err;
    for (let k = 0; k < 3; k++) {
      try { return toImageData(await loadImage(k ? src + (src.includes("?") ? "&" : "?") + "r=" + k : src)); } catch (e) { err = e; await sleep(250 * (k + 1)); }
    }
    throw err;
  }
  async function loadSets() {
    const todo = [];
    for (const S of SETS) for (const a of S.list) if (!S.got.has(a.id)) todo.push({ S, a });
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const { S, a } = todo[next++];
        try { S.got.set(a.id, { id: a.id, name: a.name, rarity: a.rarity, image: await loadIconData(vq(S.dir + a.id + ".png")) }); } catch (e) { /* stays missing; reported by unreadable() */ }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  }
  const unreadable = () => templates.filter((a) => !SETS[0].got.has(a.id) && !SETS[1].got.has(a.id)); // no picture at all: cannot be recognised
  const missingAny = () => SETS.some((S) => S.list.some((a) => !S.got.has(a.id)));
  const buildCtx = () => ({ matcher: Vision.buildMatcher(...SETS.map((S) => S.list.filter((a) => S.got.has(a.id)).map((a) => S.got.get(a.id)))), templates: digits });
  let ctxCache = null, ctxBuiltFor = -1;
  const getCtx = async (retry) => {
    if (retry && missingAny()) await loadSets();
    const n = SETS[0].got.size + SETS[1].got.size;
    if (!ctxCache || ctxBuiltFor !== n) { ctxCache = buildCtx(); ctxBuiltFor = n; }
    return ctxCache;
  };
  const ctxP = loadSets().then(() => getCtx(false));
  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  function toImageData(img) {
    const c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    return { width: d.width, height: d.height, data: d.data };
  }
  function cropUrl(src, rect) {
    const c = document.createElement("canvas"); c.width = 96; c.height = 96;
    c.getContext("2d").drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, 96, 96);
    return c.toDataURL("image/png");
  }

  const MAX_SIDE = 8000; // bigger images exceed what a browser canvas can read reliably
  const readImage = async (file) => {
    if (file.type && !/^image\//.test(file.type)) throw new Error("it is not a picture");
    if (!file.size) throw new Error("the file is empty");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url).catch(() => { throw new Error("it could not be opened"); });
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error("the picture is empty");
      if (w > MAX_SIDE || h > MAX_SIDE) throw new Error("the picture is too big. Please use a normal phone screenshot.");
      let idata;
      try { idata = toImageData(img); } catch (e) { throw new Error("the picture is too big for this browser"); }
      return { img, idata };
    } finally { URL.revokeObjectURL(url); }
  };
  // ---------- picking screenshots: drag and drop, thumbnails, clear all ----------
  let selected = [];
  const fileKey = (f) => [f.name, f.size, f.lastModified].join("|");
  let thumbUrls = [];
  function renderPicked() {
    thumbUrls.forEach((u) => URL.revokeObjectURL(u)); thumbUrls = [];
    $("picked").hidden = !selected.length;
    $("pickedCount").textContent = `${selected.length} ${selected.length === 1 ? "screenshot" : "screenshots"} selected`;
    $("thumbs").innerHTML = selected.map((f, i) => {
      const isImg = /^image\//.test(f.type || "");
      const u = isImg ? URL.createObjectURL(f) : ""; if (u) thumbUrls.push(u);
      return `<li>${isImg ? `<img src="${u}" alt="Screenshot ${esc(f.name)}">` : `<span class="file">${esc(f.name)}</span>`}<button class="x" type="button" data-i="${i}" aria-label="Remove ${esc(f.name)}" title="Remove"><svg class="xi" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button><span class="fname">${esc(f.name)}</span></li>`;
    }).join("");
  }
  function setSelected(list) {
    selected = list;
    try { const dt = new DataTransfer(); list.forEach((f) => dt.items.add(f)); $("files").files = dt.files; } catch (e) { /* the list above is what gets read */ }
    renderPicked();
  }
  // after choosing screenshots, bring the selected list and the Read button into view
  const showPicked = () => { if (selected.length) afterLayout(() => $("read").scrollIntoView({ behavior: smooth(), block: "center" })); };
  $("files").addEventListener("change", () => { selected = [...$("files").files]; renderPicked(); showPicked(); });
  $("clearAll").addEventListener("click", () => { setSelected([]); $("files").value = ""; setStatus(""); });
  $("thumbs").addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (b) setSelected(selected.filter((_, i) => i !== +b.dataset.i)); });
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "dragend"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("over");
    const have = new Set(selected.map(fileKey));
    setSelected([...selected, ...[...(e.dataTransfer ? e.dataTransfer.files : [])].filter((f) => !have.has(fileKey(f)))]);
    showPicked();
  });

  // ---------- the step list on the left ----------
  const stepLinks = [...document.querySelectorAll("#stepper a[data-step]")];
  const stepDone = (n, on) => { const a = stepLinks[n - 1]; if (on) a.dataset.state = "done"; else delete a.dataset.state; };
  // scroll-spy: the step whose card fills most of the visible page (below the sticky bar on a phone) is the current one
  const secs = ["sec-upload", "sec-check", "sec-advice"].map($);
  const bar = $("stepper");
  let locked = 0, lockY = null, lockTimer = 0, tick = 0;
  const stickyH = () => (getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().height : 0);
  const setCurrent = (n) => stepLinks.forEach((a, i) => (i === n ? a.setAttribute("aria-current", "step") : a.removeAttribute("aria-current")));
  const spy = () => {
    tick = 0;
    document.documentElement.style.setProperty("--sticky", Math.round(stickyH()) + "px");
    if (locked) { // a click on a step: keep it until the page is scrolled by hand
      if (lockY === null) { clearTimeout(lockTimer); lockTimer = setTimeout(() => (lockY = window.scrollY), 150); return; }
      if (Math.abs(window.scrollY - lockY) < 60) return;
      locked = 0; lockY = null;
    }
    const top = stickyH(), vh = window.innerHeight;
    let best = 0, bestA = -1;
    secs.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const a = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, top));
      if (a > bestA + 1) { best = i; bestA = a; }
    });
    const doc = document.documentElement;
    if (window.scrollY < 4) best = 0;
    else if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) { const r = secs[2].getBoundingClientRect(); if (r.bottom > top && r.top < vh) best = 2; }
    setCurrent(best);
  };
  const queueSpy = () => { if (!tick) tick = requestAnimationFrame(spy); };
  window.addEventListener("scroll", queueSpy, { passive: true });
  window.addEventListener("resize", queueSpy);
  stepLinks.forEach((a, i) => a.addEventListener("click", () => { locked = 1; lockY = null; setCurrent(i); clearTimeout(lockTimer); lockTimer = setTimeout(() => (lockY = window.scrollY), 400); }));
  spy();
  // Moving on by itself (phones especially): smooth scroll to the top of a step card, below the sticky step bar (CSS scroll-padding), and
  // mark that step as the current one until the page is scrolled by hand. Plain jump when the visitor prefers reduced motion.
  const smooth = () => (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
  function goStep(n) {
    locked = 1; lockY = null; setCurrent(n); clearTimeout(lockTimer); lockTimer = setTimeout(() => (lockY = window.scrollY), 700);
    secs[n].scrollIntoView({ behavior: smooth(), block: "start" });
  }
  const afterLayout = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  // the Dimensional Essences box in the advice card and the one in the manual form always show the same number
  [["essence", "essence2"], ["essence2", "essence"]].forEach(([from, to]) => $(from).addEventListener("input", () => { $(to).value = $(from).value; }));
  // "Priority List": a view-only guide (native <dialog>: focus is trapped, Esc closes, focus returns to the button)
  const prioDlg = $("prioDlg");
  $("prioBtn").addEventListener("click", () => {
    if (!$("prioBody").innerHTML) {
      const res = Advisor.advise(data, { mythics: {}, legendaryCopies: {}, essence: 0, spareEssenceFlames: 0, pvp: false });
      $("prioBody").innerHTML = listHTML(res, true);
    }
    prioDlg.showModal();
    $("prioBody").scrollTop = 0;
  });
  $("prioClose").addEventListener("click", () => prioDlg.close());
  prioDlg.addEventListener("click", (e) => { if (e.target === prioDlg) prioDlg.close(); }); // a click on the backdrop

  // floating "back to top" button (phones only, shown after scrolling)
  const toTop = $("toTop");
  const showTop = () => { toTop.hidden = window.scrollY < 400; };
  window.addEventListener("scroll", showTop, { passive: true });
  toTop.addEventListener("click", () => { window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); const s = document.querySelector("#modeSw [aria-checked=true]"); if (s) s.focus({ preventScroll: true }); });
  showTop();

  // ---------- Screenshot | Manual switch (a radiogroup in the header; remembered in the URL hash #manual and in localStorage) ----------
  const HOWTO = {
    screenshot: ["Upload your Artifact inventory (Mythic and Legendary).", "Overlap is fine, you may check later.", "Enter your Dimensional Essences.", "Tap Get advice to see your next step."],
    manual: ["Enter your Dimensional Essences.", "Pick a class tab and type how many of each Mythic and Legendary you have.", "Tick PvP if you play it.", "Tap Get advice to see your next step."],
  };
  const modeBtns = [...document.querySelectorAll("#modeSw [role=radio]")];
  const setMode = (m, o) => {
    o = o || {};
    if (m !== "manual") m = "screenshot";
    document.documentElement.setAttribute("data-mode", m);
    modeBtns.forEach((b) => { const on = b.dataset.mode === m; b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; });
    $("howto").querySelector("ol").innerHTML = HOWTO[m].map((t) => `<li>${t}</li>`).join("");
    try { localStorage.setItem("souls-mode", m); } catch (e) { /* private mode: the hash still remembers it */ }
    if (!o.fromHash) {
      if (m === "manual") history.replaceState(null, "", "#manual");
      else if (/^#(manual|sec-manual)$/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
    }
    if (o.focus) modeBtns.find((b) => b.dataset.mode === m).focus();
    queueSpy();
  };
  modeBtns.forEach((b, i) => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
    b.addEventListener("keydown", (e) => {
      const to = { ArrowRight: (i + 1) % 2, ArrowDown: (i + 1) % 2, ArrowLeft: (i + 1) % 2, ArrowUp: (i + 1) % 2, Home: 0, End: 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); setMode(modeBtns[to].dataset.mode, { focus: true }); }
    });
  });
  setMode(document.documentElement.getAttribute("data-mode"), { fromHash: true });
  window.addEventListener("hashchange", () => {
    if (/^#(manual|sec-manual)$/.test(location.hash)) setMode("manual", { fromHash: true });
    else if (/^#(screenshot|sec-upload|sec-check|sec-advice)$/.test(location.hash)) setMode("screenshot", { fromHash: true });
  });

  const setNotes = (list) => { $("notes").innerHTML = list.length ? "<ul>" + list.map((n) => `<li class="${n.cls}">${esc(n.text)}</li>`).join("") + "</ul>" : ""; };
  const setStatus = (t, err) => { $("status").textContent = t; $("status").className = err ? "err" : "muted"; };

  $("read").addEventListener("click", async () => {
    const files = selected.length ? selected : [...$("files").files];
    if (!files.length) { setStatus("Please choose your screenshots first.", true); return; }
    $("read").disabled = true;
    const notes = [];
    try {
      setStatus("Getting ready…");
      await ctxP;
      const ctx = await getCtx(true); // pictures that failed to load earlier are fetched again here
      const lost = unreadable();
      if (lost.length) notes.push({ cls: "warn", text: `${lost.length > 1 ? "Some of my reference pictures" : "One of my reference pictures"} could not be loaded (${lost.slice(0, 6).map((a) => a.name).join(", ")}${lost.length > 6 ? ", …" : ""}), so ${lost.length > 1 ? "those artifacts" : "that artifact"} may be read as something else. Please check your connection, press Read again, and check the list carefully.` });
      const analyses = [], sources = [];
      for (let i = 0; i < files.length; i++) {
        const name = files[i].name || `file ${i + 1}`;
        setStatus(`Reading screenshot ${i + 1} of ${files.length}…`);
        await new Promise((r) => setTimeout(r, 20));
        try {
          const { img, idata } = await readImage(files[i]);
          const an = Vision.analyze(idata, ctx);
          if (an.error) throw new Error(an.error);
          const cc = Vision.cropCheck(an);
          if (cc.topCut) notes.push({ cls: "warn", text: `The top row in "${name}" is not being read clearly, so those artifacts were left out. Please add a clearer screenshot that shows the top row fully visible.` });
          else if (cc.cropped) notes.push({ cls: "warn", text: `"${name}" seems to be cut off at the edge. If an artifact is missing from the list, please add another screenshot that shows it.` });
          analyses.push(an); sources.push(img);
        } catch (e) {
          notes.push({ cls: "err", text: `I could not use "${name}": ${e.message}.` });
        }
      }
      items = []; ignoredCount = 0;
      const finish = (msg, err) => { SK.out.length = 0; setNotes(notes); renderItems(); setStatus(msg, err); stepDone(1, !err); stepDone(2, false); stepDone(3, false); if (!err) afterLayout(() => goStep(1)); };
      if (!analyses.length) {
        $("summary").textContent = "";
        emptyAdvice($("out"), "Your advice will show up here.");
        return finish("Sorry, I could not read any of your screenshots. Please use screenshots of your Artifact inventory.", true);
      }
      const merged = Vision.merge(analyses);
      let ignored = 0, skippedFree = 0; // skippedFree: known free items, skipped silently
      for (const t of merged.tiles) {
        if (t.ignored) { if (t.ignoreKind || t.blurred) skippedFree++; else ignored++; continue; }
        const an = analyses[t.src.shot - 1];
        const rect = an.rows[t.src.row].cols[t.src.col].rect;
        items.push({
          uid: ++uid, id: t.id, rarity: t.rarity, count: t.count, diamonds: t.diamonds, equipped: t.equipped,
          flags: t.flags, idScore: t.idScore, alts: t.alts, thumb: cropUrl(sources[t.src.shot - 1], rect), src: t.src,
        });
      }
      if (!items.length) {
        $("summary").textContent = "";
        emptyAdvice($("out"), "Your advice will show up here.");
        return finish("Sorry, I found no Primal, Mythic, or Legendary artifacts. Is this your Artifact inventory? You can also add artifacts by hand.", true);
      }
      ignoredCount = ignored;
      const flagged = items.filter((x) => x.flags.length).length;
      items.sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0)); // low-confidence tiles first (stable sort keeps screenshot order)
      const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
      $("summary").innerHTML = `I found <b>${pl(items.length, "artifact")}</b> in your ${pl(analyses.length, "screenshot")}.`;
      finish(notes.length ? "Done, but please read the notes below." : "Done. Please check the list below.", false);
    } catch (e) {
      console.error(e); setNotes(notes); setStatus("Sorry, something went wrong while reading your screenshots. Please try again.", true);
    } finally { $("read").disabled = false; }
  });

  function artifactSelect(it) {
    const opt = (a) => `<option value="${a.id}" ${a.id === it.id ? "selected" : ""}>${esc(a.name)}</option>`;
    const grp = (label, list) => `<optgroup label="${label}">${list.map(opt).join("")}</optgroup>`;
    const extra = pickable.some((a) => a.id === it.id) ? "" : (byId[it.id] ? opt(byId[it.id]) : ""); // e.g. the Faded Artifact keeps its own entry
    return `<select data-f="id">${extra}${grp("Primal", primalList)}${grp("Mythic", mythicList)}${grp("Legendary", pickLegend)}</select>`;
  }
  // "Your totals": same-name tiles added up (3 Death tiles = Death x3); the per-tile rows below stay editable
  function renderTotals() {
    const el = $("totals");
    el.hidden = !items.length;
    if (!items.length) { el.innerHTML = ""; return; }
    const T = Advisor.totals(items, data.artifacts, Vision.FADED_ID);
    const li = (r) => `<li class="r-${rar(r.id)}"><img class="ai" src="icons/${r.id}.png${SV ? "?v=" + SV : ""}" alt="" width="20" height="20">${esc(r.name)} <b>×${r.total}</b></li>`;
    const grp = (title, list) => list.length ? `<h3 class="g">${title}</h3><ul>${list.map(li).join("")}</ul>` : "";
    el.innerHTML = `<h3 class="t">Your totals <span class="muted" style="font-weight:400;font-family:system-ui,sans-serif;font-size:.85rem">(copies of the same artifact are added together)</span></h3>${grp("Primal", T.primal)}${grp("Mythic", T.mythic)}${grp("Legendary", T.legendary)}${T.fodder ? `<div class="muted">Faded Artifact ×${T.fodder} (not used for crafting)</div>` : ""}`;
  }
  const collapsed = { primal: false, mythic: false, legendary: false }; // section open/closed state of the Check list
  function renderItems() {
    renderTotals();
    const tb = $("items").querySelector("tbody");
    const has = items.length > 0;
    $("items").hidden = !has; $("wrap").hidden = !has; $("search").hidden = !has; $("seg").hidden = !has;
    const flagged = items.filter((x) => x.flags.length).length;
    $("chips").hidden = !has;
    const setChip = (k, n) => { const c = $("chips").querySelector(`[data-k=${k}]`); c.querySelector("b").textContent = n; c.classList.toggle("zero", n === 0); };
    setChip("total", items.length); setChip("check", flagged); setChip("ignored", ignoredCount);
    $("fAll").textContent = `All (${items.length})`; $("fCheck").textContent = `Needs check (${flagged})`;
    $("fAll").setAttribute("aria-pressed", filter === "all"); $("fCheck").setAttribute("aria-pressed", filter === "check");
    const q = query.trim().toLowerCase();
    const shown = (it) => (filter === "all" || it.flags.length > 0) && (!q || (byId[it.id] ? byId[it.id].name : "").toLowerCase().includes(q));
    const nShown = items.filter(shown).length;
    $("showing").textContent = has ? (nShown === items.length ? "" : `Showing ${nShown} of ${items.length}.`) : "";
    const rowHtml = (it, hide) => `<tr data-u="${it.uid}" class="${it.flags.length ? "flag" : ""}" ${hide ? "hidden" : ""}>
      <td class="thumb">${it.thumb ? `<img src="${it.thumb}" alt="">` : ""}</td>
      <td data-l="Artifact"><div class="nm"><img class="ai" src="icons/${it.id}.png${SV ? "?v=" + SV : ""}" alt="" width="32" height="32">${artifactSelect(it)}</div><span class="pill r-${it.rarity}">${it.rarity === "mythic" ? "Mythic" : it.rarity === "legendary" ? "Legendary" : it.rarity === "primal" ? "Primal" : esc(it.rarity)}</span></td>
      <td data-l="Number shown"><input type="number" inputmode="numeric" min="1" max="${MAX_COUNT}" step="1" data-f="count" value="${it.count == null ? "" : it.count}" placeholder="none" aria-label="Number shown"></td>
      <td data-l="Transcendence"><input type="number" inputmode="numeric" min="0" max="3" step="1" data-f="diamonds" value="${it.diamonds || 0}" aria-label="Transcendence"></td>
      <td data-l="Copies">${it.id === Vision.FADED_ID ? `<b>×${it.count > 0 ? it.count : 1}</b><div class="muted">not used for crafting</div>` : `<b>${Advisor.tileCopies(it)}</b>`}</td>
      <td class="chk" data-l="Check">${it.flags.length ? "Please check this one." : ""}${it.flags.some((f) => /differs between screenshots/.test(f)) ? `<small>Your screenshots show different numbers for this one, probably because they were taken at different times or in different sessions. Please pick the number that is right now.</small>` : ""}</td>
      <td class="rm acts">${it.flags.length ? `<button class="ok" data-act="ok" title="This row is right, nothing to fix"><span class="tick" aria-hidden="true">\u2713</span>Confirm</button>` : ""}<button class="sec" data-act="rm" title="not in my inventory">Remove row</button></td></tr>`;
    // The list is grouped into collapsible Mythic and Legendary sections (header: count and how many need a check). Rows that need a check come
    // first inside each section; the filters and the search work across both, and a section with nothing to show is left out.
    const grpOf = (it) => (it.rarity === "primal" ? "primal" : it.rarity === "mythic" ? "mythic" : "legendary");
    tb.innerHTML = [["primal", "Primal"], ["mythic", "Mythic"], ["legendary", "Legendary"]].map(([g, label]) => {
      const list = items.filter((it) => grpOf(it) === g).map((x, i) => [x, i]).sort((a, b) => (b[0].flags.length > 0) - (a[0].flags.length > 0) || a[1] - b[1]).map((x) => x[0]);
      if (!list.length) return "";
      const open = !collapsed[g], vis = list.filter(shown).length, nChk = list.filter((x) => x.flags.length).length;
      const count = vis < list.length ? `${vis} of ${list.length}` : String(list.length);
      return `<tr class="grp r-${g}" data-g="${g}" ${vis ? "" : "hidden"}><td colspan="7"><button type="button" class="grp-h" data-act="grp" data-g="${g}" aria-expanded="${open}" aria-label="${label}: ${count} ${list.length === 1 ? "artifact" : "artifacts"}${nChk ? `, ${nChk} need${nChk === 1 ? "s" : ""} a check` : ""}"><span class="chev" aria-hidden="true"></span><span class="gt">${label}</span><span class="gc">${count}</span>${nChk ? `<span class="gn">${nChk} needs check</span>` : ""}</button></td></tr>`
        + list.map((it) => rowHtml(it, !open || !shown(it))).join("");
    }).join("");
    const ready = has && flagged === 0;
    $("checkNext").hidden = !ready;
    $("checkNextMsg").textContent = ready ? "All checked. Your list is ready." : "";
    stepDone(2, false);
  }
  $("search").addEventListener("input", () => { query = $("search").value; renderItems(); });
  $("fAll").addEventListener("click", () => { filter = "all"; renderItems(); });
  $("fCheck").addEventListener("click", () => { filter = "check"; renderItems(); });
  const MAX_COUNT = 999;
  const rowMsg = (t) => { $("rowmsg").textContent = t || ""; };
  $("items").addEventListener("change", (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    const it = items.find((x) => x.uid === +tr.dataset.u); const f = e.target.dataset.f;
    rowMsg("");
    if (f === "id") { it.id = e.target.value; it.rarity = Vision.groupOf(it.id); it.flags = it.flags.filter((x) => !/artifact/.test(x)); it.alts = []; }
    else if (f === "count" || f === "diamonds") {
      const raw = e.target.value.trim();
      let v = null, bad = "";
      if (f === "count" && raw === "") v = null; // blank = no printed number (counts as 1)
      else if (!/^\d+$/.test(raw)) bad = f === "count" ? "Number shown must be a whole number from 1 to " + MAX_COUNT + ". Leave it empty if the artifact shows no number." : "Transcendence must be a whole number from 0 to 3.";
      else {
        v = parseInt(raw, 10);
        if (f === "count" && (v < 1 || v > MAX_COUNT)) bad = "Number shown must be from 1 to " + MAX_COUNT + ". Leave it empty if the artifact shows no number.";
        if (f === "diamonds" && v > 3) bad = "Transcendence must be from 0 to 3.";
      }
      if (bad) { rowMsg(`${byId[it.id].name}: ${bad} I kept the old value.`); renderItems(); return; }
      it[f] = v; it.flags = it.flags.filter((x) => !(f === "count" ? /copy/ : /diamond/).test(x));
    }
    renderItems();
  });
  $("items").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    if (b.dataset.act === "grp") {
      const g = b.dataset.g; collapsed[g] = !collapsed[g]; renderItems();
      const nb = $("items").querySelector(`button[data-act=grp][data-g=${g}]`); if (nb) nb.focus({ preventScroll: true });
      return;
    }
    const u = +b.closest("tr").dataset.u;
    if (b.dataset.act === "rm") { items = items.filter((x) => x.uid !== u); rowMsg(""); renderItems(); }
    else if (b.dataset.act === "ok") {
      // "Confirm": the player looked and the row is right. Its needs-check flag goes away (warning, row colour and the Needs check count follow).
      const it = items.find((x) => x.uid === u); if (!it) return;
      it.flags = []; rowMsg("");
      const rows = [...$("items").querySelectorAll("tbody tr[data-u]")]; const k = rows.findIndex((r) => +r.dataset.u === u);
      renderItems();
      // keep the keyboard where it was: the next row that still needs a check, else the Get advice button
      const nxt = [...$("items").querySelectorAll("tbody tr[data-u]")].slice(Math.max(k, 0)).find((r) => !r.hidden && r.querySelector("[data-act=ok]"));
      if (nxt) nxt.querySelector("[data-act=ok]").focus({ preventScroll: true });
      else if (!$("checkNext").hidden) $("goAdvice").focus({ preventScroll: true });
      else $("fAll").focus({ preventScroll: true });
    }
  });
  $("goAdvice").addEventListener("click", () => goStep(2));

  // "+ add a tile I missed": search any artifact (Mythic, Legendary or Primal) by name, nothing is added by a stray click
  // forgiving match: ignores case, apostrophes and a trailing plural s ("Orb of Priests" finds "Orb of Priest"; "Warriors Axe" finds "Warrior's Axe")
  const norm = (s) => s.toLowerCase().replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").map((w) => (w.length > 3 ? w.replace(/s$/, "") : w)).join(" ");
  const namesOf = (a) => [a.name, ...(a.aliases || []), ...(a.rarity === "Primal" ? [`Primal ${a.name}`] : [])];
  const sugg = pickable.flatMap((a) => namesOf(a).map((n, i) => ({ n, a, i })));
  const rank = (x) => (x.a.rarity === "Primal" ? 0 : x.a.rarity === "Mythic" ? 1 : 2);
  sugg.sort((p, q) => rank(p) - rank(q) || byName({ name: p.n }, { name: q.n }));
  $("artList").innerHTML = sugg.map(({ n, a, i }) => `<option value="${esc(n)}">${esc(a.rarity)}${i ? " (" + esc(a.name) + ")" : ""}</option>`).join("");
  $("addItem").addEventListener("click", () => { $("addPanel").hidden = !$("addPanel").hidden; if (!$("addPanel").hidden) $("addName").focus(); });
  $("addGo").addEventListener("click", () => {
    const q = $("addName").value.trim().toLowerCase();
    const msg = (t) => ($("addMsg").textContent = t);
    if (!q) return msg("Type an artifact name, then pick it from the list.");
    const nq = norm(q);
    const exact = pickable.filter((a) => namesOf(a).some((n) => norm(n) === nq));
    const part = pickable.filter((a) => namesOf(a).some((n) => norm(n).includes(nq)));
    const hit = exact.length === 1 ? exact[0] : part.length === 1 ? part[0] : null;
    if (!hit) return msg(part.length ? `Several artifacts match "${q}". Please pick one from the list.` : `I don't know an artifact called "${$("addName").value.trim()}".`);
    const rarity = Vision.groupOf(hit.id);
    items.push({ uid: ++uid, id: hit.id, rarity, count: null, diamonds: 0, equipped: false, flags: ["added by hand"], alts: [] });
    $("addName").value = ""; filter = "all"; query = ""; $("search").value = ""; msg(`Added ${hit.name}. Please set its number and Transcendence in the list.`);
    renderItems();
    $("wrap").scrollTop = $("wrap").scrollHeight;
  });

  // spare flames come only from the artifact rows: unequipped Essence of Burning Flame copies (3\u25c6 counts as 4); the Faded Artifact is a different row and never counts
  const equippedFlames = () => items.filter((x) => x.id === FLAME && x.equipped).reduce((s, x) => s + Advisor.tileCopies(x), 0);
  const spareFlames = () => items.filter((x) => x.id === FLAME && !x.equipped).reduce((s, x) => s + Advisor.tileCopies(x), 0);
  function stateFromItems() {
    const mythics = {}, primals = {}, legendaryCopies = {};
    for (const it of items) {
      if (it.id === Vision.FADED_ID) continue; // fodder: never counts toward any recipe's Legendary copies
      if (it.rarity === "mythic") mythics[it.id] = (mythics[it.id] || 0) + Advisor.mythicCopies(it);
      else if (it.rarity === "primal") primals[it.id] = (primals[it.id] || 0) + Advisor.mythicCopies(it);
      else if (it.rarity === "legendary") legendaryCopies[it.id] = (legendaryCopies[it.id] || 0) + Advisor.tileCopies(it);
    }
    return { mythics, primals, legendaryCopies };
  }
  // The list of the whole priority sheet, grouped like Yustian's list. readonly = the "Priority List" guide: no Done/Missing pills, no needs.
  const CAREFUL_NOTE = "Because of the cost and the future Primals yet to come. They are never suggested automatically.";
  const DONT_NOTE = "These are never suggested.";
  const PRIMALS = data.rules.caution.map((c) => [c.id, c.name]); // Consider very carefully: Primal Mace of Judgment, Primal Staff of Bloodlord, World Tree Branch
  const DONT = data.rules.never.map((c) => [c.id, c.name]); // Don't craft: Codex Vol. 3 Serenity, Oblivion, Primal Claw, Staff of Bloodlord
  const stRow = (s, tierPill, extra, ro) => `<li><span class="frame r-${rar(s.id)}"><img src="icons/${s.id}.png${SV ? "?v=" + SV : ""}" alt=""></span><div class="rb"><div class="rt one"><b class="an" title="${esc(s.name)}">${esc(s.name)}</b>${tierPill || ""}</div>${pnote(s.id)}${extra || ""}</div>${ro ? "" : s.done ? `<span class="st done">&#10003; Done</span>` : `<span class="st miss">Missing</span>`}</li>`;
  const haveLine = (s) => (!s.done && s.need > 1 ? `<small class="need">You have ${s.owned} of ${s.need}</small>` : "");
  const copyPill = (s) => (s.need > 1 ? pill(`${ordinal(s.need)} copy`) : "");
  function listHTML(res, ro) {
    const listGroup = (name, items, extraNote) => (items.length ? `<h5 class="tg">${esc(name)}</h5>${extraNote ? `<p class="muted gnote">${esc(extraNote)}</p>` : ""}<ul class="lst al">${items.map((s) => stRow(s, copyPill(s), ro ? "" : haveLine(s) + (s.done ? "" : groupedNeed(s.missing)), ro)).join("")}</ul>` : "");
    const out = res.tiers.map((t) => {
      const all = t.items || [];
      if (t.tier === 3) return listGroup(groupOf(3), all.filter((s) => !s.optional)) + listGroup(groupOf(3, true), all.filter((s) => s.optional), "Optional for advanced players, these never hold anything up.");
      if (t.tier === 4) {
        const order = ro ? ["pvp", "pve"] : (all[0] && all[0].focus === "pve") ? ["pve", "pvp"] : ["pvp", "pve"];
        return order.map((f) => listGroup(FOCUS[f], all.filter((s) => s.focus === f))).join("");
      }
      return listGroup(groupOf(t.tier), all, t.locked ? "Opens when about 90% of Advanced and PvP/PvE-Focus (without the optional ones) is owned." : "");
    }).join("");
    if (!out) return "";
    const dont = `<h5 class="tg">Don't craft</h5><p class="muted gnote">${esc(DONT_NOTE)}</p><ul class="lst al careful dont">${DONT.map(([id, name]) => stRow({ id, name }, "", "", true)).join("")}</ul>`;
    const careful = `<h5 class="tg">Consider very carefully</h5><p class="muted gnote">${esc(CAREFUL_NOTE)}</p><ul class="lst al careful caution">${PRIMALS.map(([id, name]) => stRow({ id, name }, "", NOTES[id] && !/^mythic-/.test(id) ? `<small class="pn">${esc(NOTES[id])}</small>` : "", true)).join("")}</ul>`;
    return out + dont + careful;
  }
  const emptyAdvice = (el, t) => { el.innerHTML = `<p class="empty">${esc(t)}</p>`; };
  const perArtifact = data.rules.craftCost + data.upgrade.spentToReach[String(data.rules.maxLevel)];
  $("howList").innerHTML = [
    "I go through the priority list from Basic to Advanced, based on my own opinion. You're free to follow it or ask for other recommendations; it's not a must-follow list.",
    `Each artifact you craft costs ${perArtifact} Dimensional Essences, including maxing it. Craft only if you have enough copies and essences. Some exceptions, such as ${A_ICON("legendary-04", "Soul Sand")}, ${A_ICON("legendary-12", "Book of Forbidden Knowledge")} and ${A_ICON("legendary-18", "Essence of Burning Flame")}, have specific uses when kept as Legendary.`,
    "Mythic artifacts you already own are counted as maxed.",
    "Legendary copies: 1◆ = 2 copies, 2◆ = 2 copies + 2 Faded Artifacts, 3◆ = 4 copies + 2 Faded Artifacts. Faded Artifacts are not counted.",
    "Always keep 6 to 8 spare Essence of Burning Flame before crafting the specific Mythic artifact.",
  ].map((t) => `<li>${/<img /.test(t) ? t : esc(t)}</li>`).join("");
  let advised = false;
  // runAdvice(scroll): Get advice (scroll to the result) or a re-run after Change recommendation / Reset (stay where you are)
  function runAdvice(scroll) {
    $("details").innerHTML = ""; $("detailsBox").hidden = true;
    if (!items.length) { emptyAdvice($("out"), "Please read your screenshots first, or add your artifacts by hand."); return; }
    const errors = [];
    const ess = Advisor.parseCount($("essence").value, { label: "Dimensional Essences" });
    if (!ess.ok) errors.push(ess.error);
    if (errors.length) { $("out").innerHTML = `<div class="note">Please fix this first:<br>- ${errors.map(esc).join("<br>- ")}</div>`; return; }
    const st = Object.assign(stateFromItems(), { essence: ess.value, spareEssenceFlames: spareFlames(), equippedEssenceFlames: equippedFlames(), pvp: $("pvp").checked, skip: SK.out });
    const res = Advisor.advise(data, st);
    const extras = [];
    const unsure = items.filter((x) => x.flags.length && ["legendary-32", "legendary-33"].includes(x.id)).length;
    if (unsure) extras.push(`Please check the ${A_ICON("legendary-33", "Oath of Sacrifice")} and ${A_ICON("legendary-32", "Key of Dawn")} marked above. The advice depends on them.`);
    const topWarn = [...$("notes").querySelectorAll(".warn")].some((n) => /top row/.test(n.textContent));
    if (topWarn) extras.push("The top row of a screenshot was not read. Add a clearer one that shows that row fully visible if an artifact is missing.");
    else if ($("notes").querySelector(".warn")) extras.push("One of your screenshots seems cut off at the edge, so an artifact may be missing.");
    renderAdvice($("out"), res, extras, st);
    // "See every artifact on the list": EVERY group of the list, named like Yustian's list (Basic, Intermediate, Advanced, Optional for advanced,
    // PvP-Focus, PvE-Focus, Late, Don't craft, Consider very carefully), never "Tier N". An additional copy says which copy it is ("2nd copy").
    const groups = listHTML(res, false);
    const poolGroup = (res.pool || []).length && groups ? `<h5 class="tg">Optional</h5><ul class="lst al">${res.pool.map((s) => stRow({ id: s.id, name: s.name, done: s.done, need: s.need, owned: s.owned }, "", haveLine(s) + (s.done || s.have >= s.qty ? "" : `<small class="need">Need ${s.qty - s.have} more ${aiImg(s.ingredientId)}${esc(s.ingredient)} (${s.have}/${s.qty})</small>`))).join("")}</ul>` : "";
    const tierRows = groups;
    $("details").innerHTML = tierRows ? tierRows + poolGroup : "";
    $("detailsBox").hidden = !tierRows;
    stepDone(1, true); stepDone(2, true); stepDone(3, true);
    advised = true;
    if (scroll) afterLayout(() => $("out").scrollIntoView({ behavior: smooth(), block: "start" }));
  }
  $("advise").addEventListener("click", () => { SK.out.length = 0; runAdvice(true); });
  wireSkips($("out"), () => runAdvice(false));
  // new inputs mean a new plan: skips are cleared and the shown advice follows
  const inputsChanged = () => { if (SK.out.length) { SK.out.length = 0; if (advised) runAdvice(false); } };
  $("essence").addEventListener("input", inputsChanged); $("pvp").addEventListener("change", inputsChanged);
  $("items").addEventListener("change", inputsChanged); $("addGo").addEventListener("click", inputsChanged);
  // manual form: same behaviour
  let keep2 = false;
  wireSkips($("out2"), () => { keep2 = true; runManual(); });
  $("f").addEventListener("input", () => { if (SK.out2.length) { SK.out2.length = 0; if (advised2) { keep2 = true; runManual(); } } });
  $("f").addEventListener("change", () => { if (SK.out2.length) { SK.out2.length = 0; if (advised2) { keep2 = true; runManual(); } } });
  // every collapsible section: aria-expanded on its summary follows the open state (the gold chevron itself is CSS)
  document.querySelectorAll("details").forEach((d) => {
    const sm = d.querySelector(":scope > summary");
    if (!sm) return;
    const sync = () => sm.setAttribute("aria-expanded", d.open ? "true" : "false");
    d.addEventListener("toggle", sync); sync();
  });
  window.__souls = { get items() { return items; } };
})();
