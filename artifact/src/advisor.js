// Pure advisor logic (no DOM). Works in the browser (window.Advisor) and Node (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Advisor = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const COPIES_PER_CRAFT = 4;

  // Copies one Legendary tile counts for (Yustian's rule). Resetting a transcended tile returns ALL its copies
  // (and the essence and the fodder), so every copy counts toward the 4 crafting copies of that artifact.
  // Per transcended tile:  1 diamond = 2 copies, 2 diamonds = 2 copies (+2 fodder, not counted), 3 diamonds = 4 copies (+2 fodder, not counted).
  // A printed number N on a tile WITH diamonds means N transcended tiles at that level: copies = N x per-tile copies
  // (e.g. 3 diamonds with "2" = 2 x 4 = 8). No diamonds = the printed number, or 1 if there is none.
  // tile: {count?:number, diamonds?:number}
  const DIAMOND_COPIES = { 1: 2, 2: 2, 3: 4 };
  function tileCopies(t) {
    const n = t.count != null && t.count > 0 ? t.count : 1;
    const d = Math.min(3, t.diamonds || 0);
    return d > 0 ? n * DIAMOND_COPIES[d] : n;
  }
  // "you have 2 spare" or "you have 0 spare, 4 are equipped" (equipped copies are counted the same way as spare ones, but never count as spare)
  function flameHave(spare, equipped) {
    const e = equipped || 0;
    return `you have ${spare} spare` + (e > 0 ? `, ${e} ${e === 1 ? "is" : "are"} equipped` : "");
  }
  function legendaryCopies(tiles) {
    return tiles.reduce((s, t) => s + tileCopies(t), 0);
  }
  // Unequipped Mythics stack (Yustian): a Mythic tile with printed number N = N owned; no number (or equipped) = 1. Mythics have no diamonds.
  function mythicCopies(t) { return t.count != null && t.count > 0 ? t.count : 1; }
  // Mythics: levels are NOT checked, owning a copy counts as maxed (+50). state.mythics[id] is a count (or an array, its length is used).
  const ownedCount = (v) => (Array.isArray(v) ? v.length : v || 0);

  // "Your totals": same-name tiles are added up. tiles: [{id, rarity, count, diamonds, equipped}] -> {primal, mythic, legendary, fodder}.
  // Primal and Mythic: each tile = its printed number, or 1 (equipped / no number). Legendary: tileCopies (diamond rule). Faded Artifact (fodder) is separate, never a recipe copy.
  function totals(tiles, artifacts, fadedId) {
    const byId = Object.fromEntries(artifacts.map((a) => [a.id, a]));
    const p = {}, m = {}, l = {};
    let fodder = 0;
    for (const t of tiles) {
      if (!t.id || t.ignored) continue;
      if (fadedId && t.id === fadedId) { fodder += t.count > 0 ? t.count : 1; continue; }
      const g = t.rarity === "primal" ? p : t.rarity === "mythic" ? m : t.rarity === "legendary" ? l : null;
      if (!g) continue;
      const r = g[t.id] = g[t.id] || { id: t.id, name: byId[t.id] ? byId[t.id].name : t.id, total: 0, tiles: 0 };
      r.total += t.rarity === "legendary" ? tileCopies(t) : mythicCopies(t);
      r.tiles++;
    }
    const list = (g) => Object.values(g).sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
    return { primal: list(p), mythic: list(m), legendary: list(l), fodder };
  }

  // Strict whole-number parsing for typed fields (essence, flames, copies). Accepts 16296, 16,296 and 16.296 (a single
  // thousands separator, groups of exactly 3 digits). Rejects empty text, decimals ("12.7"), exponents ("1e9"), signs, other text, huge values.
  // Returns {ok:true, value} or {ok:false, error}.
  function parseCount(text, opts) {
    const o = Object.assign({ label: "number", max: 999999999, allowEmpty: false }, opts);
    const t = String(text == null ? "" : text).trim();
    if (t === "") return o.allowEmpty ? { ok: true, value: 0 } : { ok: false, error: `${o.label}: please type a whole number, like 16296.` };
    let n;
    if (/^\d+$/.test(t)) n = parseInt(t, 10);
    else if (/^(0|[1-9]\d{0,2}([.,])\d{3}(\2\d{3})*)$/.test(t)) n = parseInt(t.replace(/[.,]/g, ""), 10);
    else return { ok: false, error: `${o.label}: "${t}" is not a whole number. Please use digits only, like 16296 or 16,296.` };
    if (n > o.max) return { ok: false, error: `${o.label}: ${t} is too big. The most I can use is ${o.max.toLocaleString("en-US")}.` };
    return { ok: true, value: n };
  }

  // Every distinct rule item (for forms): one entry per Mythic with the highest cumulative total any tier asks for.
  function ruleItems(rules) {
    const m = new Map();
    for (const t of rules.tiers) for (const it of t.items) {
      const o = m.get(it.id);
      if (!o) m.set(it.id, { ...it });
      else { o.need = Math.max(o.need, it.need); if (it.focus !== "pvp") o.focus = o.focus === "pve" ? o.focus : null; }
    }
    return [...m.values()];
  }
  // Items of a tier in suggestion order. Everything is shown to everyone; in a tier with PvP-Focus and PvE-Focus groups
  // the player's focus goes first (PvP ticked: PvP group, then PvE; not ticked: PvE group, then PvP).
  const tierItems = (tier, pvp) => (!pvp && tier.items.some((i) => i.focus === "pve") ? [...tier.items.filter((i) => i.focus === "pve"), ...tier.items.filter((i) => i.focus !== "pve")] : tier.items);
  // Late tier: unlocked once about 90% of the non-optional items of the listed tiers are owned
  function lateOpen(rules, owned) {
    const l = rules.late;
    if (!l) return true;
    const items = rules.tiers.filter((t) => l.unlockAfterTiers.includes(t.tier)).flatMap((t) => t.items.filter((i) => !i.optional));
    if (!items.length) return true;
    return items.filter((i) => owned(i.id) >= i.need).length >= Math.ceil(items.length * l.fraction - 1e-9);
  }

  const SAVE_LIMIT = 14000; // 'save your essences' is only advised up to this much

  // data: {artifacts, rules, upgrade}
  // state: {essence, mythics:{id:ownedCount}, legendaryCopies:{id:n}, spareEssenceFlames:n, pvp:boolean}
  // Tiers are walked in order (a tier is only looked at once every earlier tier is complete); inside a tier the list order is the
  // order things are suggested. Item "need" is the cumulative total owned. PvP-only items are skipped unless state.pvp.
  function advise(data, state) {
    const byId = Object.fromEntries(data.artifacts.map((a) => [a.id, a]));
    const maxCost = data.upgrade.spentToReach[String(data.rules.maxLevel)];
    const craftCost = data.rules.craftCost;
    const cost = craftCost + maxCost;
    let essence = state.essence;
    const legendary = { ...(state.legendaryCopies || {}) };
    const pool = (data.rules.optionalPool && data.rules.optionalPool.items) || []; // untiered optional Mythics, after tier 4
    // "Change recommendation": artifacts the player skipped are never crafted by the plan (so never Step 1) and are left out of the lists;
    // everything else is planned as if they were not there, so cost, left-after and the steps follow the next eligible artifact.
    const skipSet = new Set(state.skip || []);
    const plan = []; // actions we can do now (fully, never half)
    const blockers = []; // things missing
    const equippedFlames = state.equippedEssenceFlames || 0; // equipped copies: shown in the advice only, never counted as spare
    const flames = state.spareEssenceFlames || 0; // spare (not equipped) Essence of Burning Flame copies, diamond-counted
    const mythicOwned = (id) => ownedCount((state.mythics || {})[id]);
    // Extra copies (2nd, 3rd) are only for the artifacts in rules.extraCopiesOk (Lamp, Death, Fang). For every other artifact they wait until
    // no useful first copy is left: no unowned, not-yet-planned artifact in any open tier (or the optional pool). Never / caution artifacts are in no tier.
    const extraOk = new Set(data.rules.extraCopiesOk || []);
    const firstIds = [...new Set([...data.rules.tiers.filter((t) => !t.late || lateOpen(data.rules, mythicOwned)).flatMap((t) => t.items.map((i) => i.id)), ...pool.map((i) => i.id)])];
    const firstLeft = () => firstIds.some((id) => !skipSet.has(id) && mythicOwned(id) === 0 && !plan.some((a) => a.itemId === id)); // a skipped artifact is not a 'useful first copy' anyone waits for

    function evalItem(item, reserve, extraOwned, noWait) {
      const a = byId[item.id];
      const owned = mythicOwned(item.id) + (extraOwned || 0);
      const status = { id: item.id, name: a.name, short: item.short, need: item.need, owned, maxed: Math.min(owned, item.need), pvp: item.focus === "pvp", focus: item.focus || null, optional: item.optional || null, actions: [], missing: [], dupDeferred: false };
      const wait = !noWait && item.need > 1 && !extraOk.has(item.id) && owned < item.need && firstLeft(); // extra copies of this artifact wait behind the first copies
      // craft missing copies (owned copies are assumed maxed)
      const pool = reserve ? legendary : { ...legendary };
      for (let i = owned; i < item.need; i++) {
        if (wait && i >= 1) { status.dupDeferred = true; break; } // kept in the list, but not suggested yet
        const ing = a.ingredients[0];
        const have = pool[ing.id] || 0;
        if (have >= ing.qty) {
          pool[ing.id] = have - ing.qty; // reserve
          status.actions.push({ type: "craft+max", cost, copy: i + 1, ingredient: byId[ing.id].name, ingredientId: ing.id });
        } else status.missing.push({ ingredient: byId[ing.id].name, ingredientId: ing.id, have, need: ing.qty, short: ing.qty - have });
      }
      status.done = owned >= item.need;
      return status;
    }
    function spend(st, tier) {
      if (skipSet.has(st.id)) return;
      for (const act of st.actions) {
        if (act.cost <= essence) { essence -= act.cost; plan.push({ ...act, item: st.name, itemId: st.id, tier, pvp: !!st.pvp, focus: st.focus, optional: st.optional || null, pool: false, ahead: false }); act.affordable = true; }
        else act.affordable = false; // never half-upgrade: wait until it can be fully paid
      }
      if (!st.done && st.missing.length === 0 && st.actions.length && !st.actions.every((x) => x.affordable)) st.essenceShort = cost - essence;
    }

    const tiers = [];
    let current = null; // number of the first incomplete tier
    const lateOk = lateOpen(data.rules, mythicOwned);
    for (const t of data.rules.tiers) {
      // tiers after the current one are not walked for advice, but their items are still listed (owned / missing) for "See every artifact on the list"
      const preview = () => tierItems(t, !!state.pvp).map((it) => evalItem(it, false));
      if (t.late && !lateOk) { tiers.push({ tier: t.tier, evaluated: false, locked: true, items: preview(), done: false }); continue; }
      if (current !== null) { tiers.push({ tier: t.tier, evaluated: false, items: preview(), done: false }); continue; }
      const items = [];
      for (const it of tierItems(t, !!state.pvp)) {
        // gated item (Fervor): needs other Mythics owned and spare Essence of Burning Flames; without them nothing is reserved or crafted
        const gated = !!(it.requires || it.spareFlames);
        const reqOk = !it.requires || Object.entries(it.requires).every(([id, n]) => mythicOwned(id) >= n);
        const sf = it.spareFlames || { min: 0, ideal: 0 };
        const flamesOk = flames >= sf.min;
        const eligible = !gated || (reqOk && flamesOk);
        // an optional item ("good to have once most things are done") is only crafted once every other item of its tier is owned
        const othersOwned = !it.optional || tierItems(t, !!state.pvp).every((o) => o.optional || mythicOwned(o.id) >= o.need);
        const skippedIt = skipSet.has(it.id); // skipped: planned as if it were not there (reserves no Legendary copies, blocks nothing)
        const st = evalItem(it, eligible && othersOwned && !skippedIt);
        if (gated) st.gate = { reqOk, flames, equippedFlames, minFlames: sf.min, idealFlames: sf.ideal, eligible, requires: it.requires ? Object.keys(it.requires).map((id) => ({ id, name: byId[id].name })) : [] };
        if (!st.done) {
          if (!skippedIt) st.missing.forEach((m) => blockers.push({ tier: t.tier, item: st.name, itemId: st.id, ...m }));
          if (eligible && othersOwned) spend(st, t.tier);
        }
        items.push(st);
      }
      // optional items never hold up the tier
      const done = items.every((x) => x.done || x.optional);
      tiers.push({ tier: t.tier, evaluated: true, items, done });
      if (!done) current = t.tier;
    }
    // Saving is only advice while essence is low. With more than SAVE_LIMIT essence left after the current tier, keep going: walk on
    // (the current tier first, for anything that was held back, then the later tiers, in order, PvP / Fervor / Evidence of Miracle rules as
    // usual) crafting what is fully craftable and affordable, while the essence before each craft is above SAVE_LIMIT. Items whose
    // Legendary copies are the ones a blocked item is collecting stay untouched.
    const ahead = [];
    // The optional pool comes last in the same walk. When every tier is done only the optional extras (Orb of Priests, the pool) are left.
    const walk = (pool.length ? [...data.rules.tiers, { tier: "Optional", pool: true, items: pool }] : data.rules.tiers).filter((t) => !t.late || lateOk);
    if ((current !== null || pool.length) && essence > SAVE_LIMIT) {
      const keep = new Set(blockers.map((b) => b.ingredientId));
      const planned = {};
      plan.forEach((a) => (planned[a.itemId] = (planned[a.itemId] || 0) + 1));
      // twice: the second run offers the extra copies that waited, once the first run left no useful first copy
      outer: for (const t of [...walk, ...walk]) {
        if (!t.pool && current !== null && t.tier < current) continue;
        for (const it of tierItems(t, !!state.pvp)) {
          if (essence <= SAVE_LIMIT) break outer;
          if (skipSet.has(it.id)) continue;
          const have = mythicOwned(it.id) + (planned[it.id] || 0);
          if (have >= it.need) continue;
          if (keep.has(byId[it.id].ingredients[0].id)) continue;
          const gated = !!(it.requires || it.spareFlames);
          const reqOk = !it.requires || Object.entries(it.requires).every(([id, n]) => mythicOwned(id) + (planned[id] || 0) >= n);
          const sf = it.spareFlames || { min: 0, ideal: 0 };
          if (gated && !(reqOk && flames >= sf.min)) continue;
          // copies already reserved by the plan (current tier) are not available a second time
          const st = evalItem(it, true, planned[it.id] || 0);
          for (const act of st.actions) {
            if (essence <= SAVE_LIMIT || act.cost > essence) break;
            essence -= act.cost;
            planned[it.id] = (planned[it.id] || 0) + 1;
            const entry = { ...act, item: st.name, itemId: st.id, tier: t.tier, pvp: !!st.pvp, focus: st.focus, optional: st.optional || null, pool: !!t.pool, ahead: current !== null && (!!t.pool || t.tier > current) };
            plan.push(entry); ahead.push(entry);
          }
        }
      }
    }
    // Extra copies of the current tier that waited for the first copies: once the plan holds every useful first copy they are offered here
    // (the current tier is not subject to the SAVE_LIMIT walk above).
    if (current !== null && firstIds.length && !firstLeft()) {
      const ct = tiers.find((x) => x.tier === current), rt = data.rules.tiers.find((x) => x.tier === current), planned2 = {};
      plan.forEach((x) => (planned2[x.itemId] = (planned2[x.itemId] || 0) + 1));
      for (const it of tierItems(rt, !!state.pvp)) {
        const k = ct.items.findIndex((x) => x.id === it.id);
        if (k < 0 || !ct.items[k].dupDeferred || it.requires || it.spareFlames || skipSet.has(it.id)) continue;
        if (it.optional && !tierItems(rt, !!state.pvp).every((o) => o.optional || mythicOwned(o.id) >= o.need)) continue;
        const st = evalItem(it, true, planned2[it.id] || 0);
        if (!st.done) { st.missing.forEach((m) => blockers.push({ tier: rt.tier, item: st.name, itemId: st.id, ...m })); spend(st, rt.tier); }
        ct.items[k] = st;
      }
    }
    // After "Change recommendation": never fall back to "Save your Dimensional Essences" while something is still craftable and affordable. The holds that
    // normally keep it waiting (extra copies behind first copies, the SAVE_LIMIT, the late-tier gate, optional items waiting for their tier, copies another
    // blocked item is collecting) are relaxed and the next craftable artifact is taken by priority: tiers in order, then the optional pool, then any other
    // Mythic. Don't craft / Consider very carefully artifacts are in none of those lists and are never picked. A real gate (Fervor's spare flames) stays.
    if (skipSet.size && !plan.length && essence >= cost) {
      const done = {};
      const seq = data.rules.tiers.map((t) => ({ tier: t.tier, pool: false, items: tierItems(t, !!state.pvp) })).concat(pool.length ? [{ tier: "Optional", pool: true, items: pool }] : []);
      const listed = new Set(data.rules.tiers.flatMap((t) => t.items.map((i) => i.id)).concat(pool.map((i) => i.id), (data.rules.never || []).map((n) => n.id), (data.rules.caution || []).map((n) => n.id)));
      const others = data.artifacts.filter((a) => a.rarity === "Mythic" && a.ingredients.length && !listed.has(a.id)).map((a) => ({ id: a.id, need: 1, short: a.name }));
      if (others.length) seq.push({ tier: "Optional", pool: true, items: others });
      for (const t of seq) for (const it of t.items) {
        if (skipSet.has(it.id) || essence < cost) continue;
        if (mythicOwned(it.id) + (done[it.id] || 0) >= it.need) continue;
        if (it.requires && !Object.entries(it.requires).every(([id, n]) => mythicOwned(id) + (done[id] || 0) >= n)) continue;
        if (it.spareFlames && flames < it.spareFlames.min) continue;
        const st = evalItem(it, true, done[it.id] || 0, true);
        for (const act of st.actions) {
          if (act.cost > essence) break;
          essence -= act.cost; done[it.id] = (done[it.id] || 0) + 1;
          plan.push({ ...act, item: st.name, itemId: st.id, tier: t.tier, pvp: !!st.pvp, focus: st.focus, optional: st.optional || null, pool: !!t.pool, ahead: false, relaxed: true, affordable: true });
        }
      }
    }
    // "Next to craft": the next 2-3 artifacts in tier order that are not owned and not in the plan above, each with what is missing
    // (copies and/or Dimensional Essences). Items of the current tier were already evaluated above; later tiers are evaluated now on
    // what is left after the plan (copies reserved, essence spent).
    // "Priority": when the very first craft is a later-tier item done ahead (the current tier is blocked), the unmet items of the
    // current tier are listed first, as priority rows, and are not repeated in Next to craft
    const priority = [];
    if (plan.length && plan[0].ahead && current !== null) {
      const ct = tiers.find((x) => x.tier === current), pl = {};
      plan.forEach((a) => (pl[a.itemId] = (pl[a.itemId] || 0) + 1));
      for (const st of ct.items) {
        if (priority.length >= 6) break;
        if (st.done || st.optional || pl[st.id]) continue;
        if (st.dupDeferred && !st.actions.length && !st.missing.length) continue;
        const gate = st.gate && !st.gate.eligible ? st.gate : null;
        if (!st.missing.length && !gate) continue;
        priority.push({ id: st.id, name: st.name, copyNo: st.owned + 1, tier: current, pvp: st.pvp, focus: st.focus, optional: null, need: st.need, owned: st.owned, missing: st.missing, gate, essenceShort: 0, ready: false });
      }
    }
    // Next to craft is built twice: in full, and without the Priority rows (what the page shows under them)
    const buildNext = (skip) => {
    const next = [];
    {
      const planned = {};
      plan.forEach((a) => (planned[a.itemId] = (planned[a.itemId] || 0) + 1));
      const seen = new Set([...skip, ...skipSet]);
      let avail = essence;
      outerN: for (const t of data.rules.tiers) {
        if (t.late && !lateOk) continue;
        for (const it of tierItems(t, !!state.pvp)) {
          if (next.length >= 3) break outerN;
          if (seen.has(it.id)) continue;
          const tt = tiers.find((x) => x.tier === t.tier);
          let st, gate = null, copyNo = 1;
          if (tt && tt.evaluated) {
            st = tt.items.find((x) => x.id === it.id);
            if (!st || st.done) continue;
            if (st.dupDeferred && !st.actions.length && !st.missing.length) continue; // only waiting extra copies left
            const inPlan = planned[it.id] || 0;
            if (st.owned + inPlan >= it.need) continue; // every copy of it is already in the plan
            copyNo = st.owned + inPlan + 1;
            const open = st.missing.length + st.actions.filter((a) => !a.affordable).length;
            if (inPlan && !open) continue;
            gate = st.gate && !st.gate.eligible ? st.gate : null;
            if (!open && !gate) continue;
          } else {
            const planOwned = planned[it.id] || 0;
            if (mythicOwned(it.id) + planOwned >= it.need) continue;
            const gated = !!(it.requires || it.spareFlames);
            const reqOk = !it.requires || Object.entries(it.requires).every(([id, n]) => mythicOwned(id) + (planned[id] || 0) >= n);
            const sf = it.spareFlames || { min: 0, ideal: 0 };
            const eligible = !gated || (reqOk && flames >= sf.min);
            st = evalItem(it, eligible, planOwned);
            if (st.dupDeferred && !st.actions.length && !st.missing.length) continue;
            copyNo = st.owned + 1;
            if (gated && !eligible) gate = { reqOk, flames, equippedFlames, minFlames: sf.min, idealFlames: sf.ideal, eligible, requires: it.requires ? Object.keys(it.requires).map((id) => ({ id, name: byId[id].name })) : [] };
          }
          seen.add(it.id);
          const ready = st.missing.length === 0 && !gate; // all copies there
          const crafts = st.actions.filter((a) => a.affordable !== true).length;
          const essenceShort = Math.max(0, cost - avail);
          if (ready && crafts) avail = Math.max(0, avail - cost * 1);
          next.push({ id: st.id, name: st.name, copyNo, tier: t.tier, pvp: st.pvp, focus: st.focus, optional: it.optional || null, need: it.need, owned: st.owned,
            missing: st.missing, gate, essenceShort: ready && crafts ? essenceShort : 0, ready });
        }
      }
    }
    // Optional pool: only offered once there is plenty of essence (same rule as the multi-craft walk), after every tier item
    if (pool.length && state.essence > SAVE_LIMIT) {
      const planned = {};
      plan.forEach((a) => (planned[a.itemId] = (planned[a.itemId] || 0) + 1));
      let avail = essence;
      for (const it of pool) {
        if (next.length >= 3) break;
        if (skipSet.has(it.id)) continue;
        const planOwned = planned[it.id] || 0;
        if (mythicOwned(it.id) + planOwned >= it.need) continue;
        const st = evalItem(it, true, planOwned);
        const ready = st.missing.length === 0;
        const crafts = st.actions.length;
        const essenceShort = Math.max(0, cost - avail);
        if (ready && crafts) avail = Math.max(0, avail - cost);
        next.push({ id: st.id, name: st.name, copyNo: st.owned + 1, tier: "Optional", pool: true, pvp: false, optional: it.optional || "optional", need: it.need, owned: st.owned, missing: st.missing, gate: null, essenceShort: ready && crafts ? essenceShort : 0, ready });
      }
    }
    return next;
    };
    const next = buildNext([]), nextRest = priority.length ? buildNext(priority.map((x) => x.id)) : next;
    // the pool as a list for the details table
    const poolList = pool.map((it) => {
      const a = byId[it.id], ing = a.ingredients[0], have = (state.legendaryCopies || {})[ing.id] || 0, owned = mythicOwned(it.id);
      return { id: it.id, name: a.name, need: it.need, owned, done: owned >= it.need, optional: it.optional || "optional", ingredient: byId[ing.id].name, ingredientId: ing.id, have, qty: ing.qty, inPlan: plan.some((x) => x.itemId === it.id) };
    });
    // "What artifact you can craft?": every Mythic whose Legendary ingredients the player owns right now (ingredients only; the plan above is unchanged).
    // Primals are not Mythics and are left out. Each entry carries its list group so the UI can badge it (Don't craft / Consider very carefully included).
    const groupFor = (id) => {
      if ((data.rules.never || []).some((n) => n.id === id)) return { group: "Don't craft", gk: "never", order: 9 };
      if ((data.rules.caution || []).some((n) => n.id === id)) return { group: "Consider very carefully", gk: "caution", order: 8 };
      for (const t of data.rules.tiers) { const it = t.items.find((i) => i.id === id); if (it) return { group: it.focus ? (it.focus === "pvp" ? "PvP-Focus" : "PvE-Focus") : it.optional && t.tier === 3 ? "Optional for advanced" : TIER_NAMES[t.tier] || "Tier " + t.tier, gk: "tier", order: t.tier, optional: !!it.optional, focus: it.focus || null }; }
      if (pool.some((i) => i.id === id)) return { group: "Optional", gk: "pool", order: 7, optional: true };
      return { group: "Other", gk: "other", order: 7 };
    };
    const ruleOrder = data.rules.tiers.flatMap((t) => t.items.map((i) => i.id));
    const craftable = data.artifacts.filter((a) => a.rarity === "Mythic" && a.ingredients.length).map((a, i) => {
      const can = Math.min(...a.ingredients.map((g) => Math.floor(((state.legendaryCopies || {})[g.id] || 0) / g.qty)));
      return { id: a.id, name: a.name, can, owned: mythicOwned(a.id), ingredient: byId[a.ingredients[0].id].name, ingredientId: a.ingredients[0].id, qty: a.ingredients[0].qty, have: ((state.legendaryCopies || {})[a.ingredients[0].id] || 0), ...groupFor(a.id), idx: ruleOrder.includes(a.id) ? ruleOrder.indexOf(a.id) : 1000 + i };
    }).filter((x) => x.can >= 1).sort((a, b) => a.order - b.order || a.idx - b.idx).map(({ idx, ...x }) => ({ ...x, affordable: state.essence >= cost, essenceShort: Math.max(0, cost - state.essence) }));
    const report = { tierDone: tiers.map((t) => t.evaluated && t.done), current, allDone: current === null };
    tiers.forEach((t, i) => (report[`tier${i + 1}Done`] = t.evaluated && t.done));
    return { skipped: [...skipSet], craftable, plan, blockers, tiers, pool: poolList, essenceLeft: essence, essenceStart: state.essence, perArtifact: cost, report, ahead, next, nextRest, priority, pvp: !!state.pvp, caution: (data.rules.caution || []).map((c) => c.name), lateOpen: lateOk };
  }

  // Advice text always uses the artifact's full name. Each mention goes through art(id, name): plain text gives the name, the
  // HTML form (fmt = "html") puts the artifact's small icon in front of it.
  const MARK0 = "\u0001", MARK1 = "\u0002";
  const art = (id, name) => `${MARK0}${id}|${name}${MARK1}`;
  const ESS = "ui/dimensional-essence"; // the Dimensional Essence icon sits in front of every essence amount
  const ess = (n) => art(ESS, String(n));
  const escHtml = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function render(text, fmt) {
    const re = new RegExp(`${MARK0}([^|]*)\\|([^${MARK1}]*)${MARK1}`, "g");
    if (fmt !== "html") return text.replace(re, (_, id, name) => name);
    return escHtml(text).replace(re, (_, id, name) => `<img class="ai" src="icons/${id}.png" alt="" width="20" height="20">${name}`);
  }
  // Missing ingredients per item. Two missing copies of the same Mythic would repeat the same line, so they are joined into one.
  function blockText(list) {
    const by = new Map();
    for (const b of list) { const k = b.ingredientId; if (!by.has(k)) by.set(k, { b, n: 0 }); by.get(k).n++; }
    return [...by.values()].map(({ b, n }) => `you need ${b.short} more ${art(b.ingredientId, b.ingredient)}${n > 1 ? ` for each of ${n} copies` : ""} (you have ${b.have} of ${b.need})`).join("; ");
  }
  const blockGroups = (res) => { const m = new Map(); for (const b of res.blockers) { if (!m.has(b.itemId)) m.set(b.itemId, { id: b.itemId, name: b.item, list: [] }); m.get(b.itemId).list.push(b); } return [...m.values()]; };
  const nth = (g) => (g.need === 2 ? " (the second one)" : g.need > 2 ? ` (${g.need} in total)` : "");
  // group names of Yustian's list (shown instead of "Tier N")
  const TIER_NAMES = { 1: "Basic", 2: "Intermediate", 3: "Advanced", 4: "PvP/PvE-Focus", 5: "Late" };
  const TN = (n) => TIER_NAMES[n] || "tier " + n;
  const joinNames = (a) => (a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || "");
  const doneText = (nums) => (nums.length === 1 ? `${TN(nums[0])} is done.` : `${joinNames(nums.map(TN))} are done.`);
  const aheadWhy = (res) => `${TN(res.report.current)} is ${res.blockers.length ? "waiting for copies" : "not complete yet"} (see below), so while you have plenty of Dimensional Essences,`;
  // What is missing for one "Next to craft" entry: copies, gate (Fervor / 2nd Evidence of Miracle) and/or Dimensional Essences.
  function nextText(n, res) {
    const bits = [];
    if (n.missing.length) bits.push(blockText(n.missing));
    if (n.gate) {
      const flame = art("legendary-18", "Essence of Burning Flame");
      if (!n.gate.reqOk) bits.push(`you must own ${n.gate.requires.map((r) => art(r.id, r.name)).join(", ")} first`);
      if (n.gate.flames < n.gate.minFlames) bits.push(`you need ${n.gate.minFlames - n.gate.flames} more spare ${flame} (${flameHave(n.gate.flames, n.gate.equippedFlames)})`);
    }
    if (n.essenceShort > 0) bits.push(`you need ${ess(n.essenceShort)} more Dimensional Essences (a craft costs ${ess(res.perArtifact)})`);
    if (!bits.length) bits.push("you have everything for it");
    return bits.join("; ");
  }
  // an artifact that is wanted more than once (Turbulence Lamp: 2 in tier 2, 4 in tier 4) says which copy this entry is about
  const HAVE_NOTE = (n) => (n.need > 1 && n.owned != null ? ` (${TN(n.tier)} wants ${n.need} in total, you have ${n.owned})` : "");
  // Missing ingredients of one entry, one line per ingredient: {id, name, short, have, need, copies}
  const groupMissing = (list) => { const by = new Map(); for (const b of list || []) { if (!by.has(b.ingredientId)) by.set(b.ingredientId, { id: b.ingredientId, name: b.ingredient, short: b.short, have: b.have, need: b.need, copies: 0 }); by.get(b.ingredientId).copies++; } return [...by.values()]; };
  const OPTIONAL_NOTE = (n) => (n.optional ? ` (optional: ${n.optional})` : "");
  // Plain, friendly wording for players. fmt: "text" (default) or "html" (escaped, with inline icons).
  function casual(res, fmt) {
    const lines = [];
    const doNow = res.plan;
    const cur = res.report.current;
    const doneTiers = res.tiers.filter((t) => t.evaluated && t.done).map((t) => t.tier);
    if (doneTiers.length) {
      const last = doneTiers[doneTiers.length - 1];
      lines.push(doneText(doneTiers));
    }
    const curT = cur === null ? null : res.tiers.find((t) => t.tier === cur);
    if (curT) {
      const left = curT.items.filter((s) => !s.done && !s.gate && !s.optional);
      const plain = left.map((s) => art(s.id, s.name) + (s.need > 1 ? ` (you have ${s.owned} of ${s.need})` : ""));
      if (plain.length) lines.push(`${cur === 1 ? `Start with ${TN(1)}` : `Next is ${TN(cur)}`}. You still need: ${plain.join(", ")}.`);
    }
    if (doNow.length) {
      const now = doNow.filter((a) => !a.ahead && !a.pool), later = doNow.filter((a) => a.ahead && !a.pool), opt = doNow.filter((a) => a.pool);
      const nm = (list) => list.map((a) => art(a.itemId, a.item)).join(" and ");
      const saveAfter = res.essenceLeft <= SAVE_LIMIT ? ", then save your Dimensional Essences again" : "";
      if (now.length) lines.push(`Craft ${nm(now)} and max ${now.length > 1 ? "them" : "it"}${later.length || opt.length ? "" : saveAfter}.`);
      if (later.length) lines.push(`${later.length === doNow.length ? "" : "Then, "}${aheadWhy(res)} craft ${nm(later)} (from ${joinNames([...new Set(later.map((a) => a.tier))].map(TN))}) and max ${later.length > 1 ? "them" : "it"}${opt.length ? "" : saveAfter}.`);
      if (opt.length) lines.push(`${opt.length === doNow.length ? "" : "Then, "}${cur === null ? "every tier is done, so" : `${TN(cur)} is waiting, so`} while you have plenty of Dimensional Essences you can also craft ${nm(opt)} (optional, not on a tier) and max ${opt.length > 1 ? "them" : "it"}${saveAfter}.`);
      lines.push(`That leaves ${ess(res.essenceLeft)} Dimensional Essences (${ess(res.essenceStart)} minus ${ess(doNow.reduce((s, a) => s + a.cost, 0))}).`);
    } else if (curT) {
      lines.push(`Don't craft yet. Save your Dimensional Essences: you have ${ess(res.essenceStart)}, and each artifact costs ${ess(res.perArtifact)} to craft and max.`);
    }
    blockGroups(res).forEach((g) => lines.push(`${art(g.id, g.name)}: ${blockText(g.list)}.`));
    if (curT) {
      for (const g of curT.items.filter((s) => s.gate && !s.done)) {
        // Fervor / 2nd Evidence of Miracle: say exactly what is missing
        const me = art(g.id, g.name) + nth(g), flame = art("legendary-18", "Essence of Burning Flame");
        const bits = [];
        if (!g.gate.reqOk) bits.push(`${g.gate.requires.map((r) => art(r.id, r.name)).join(", ")} (you must own it first)`);
        if (g.gate.flames < g.gate.minFlames) bits.push(`${g.gate.minFlames - g.gate.flames} more spare ${flame} (${flameHave(g.gate.flames, g.gate.equippedFlames)})`);
        if (g.essenceShort > 0) bits.push(`${ess(g.essenceShort)} more Dimensional Essences (you need ${ess(res.perArtifact)} and have ${ess(res.essenceLeft)})`);
        if (bits.length) lines.push(`${me} is next. You still need: ${bits.join("; ")}.`);
        else if (!doNow.some((a) => a.itemId === g.id) && !res.blockers.some((b) => b.itemId === g.id)) lines.push(`${me}: please check the full list below.`);
        if (g.gate.flames < g.gate.idealFlames) lines.push(`Tip for ${art(g.id, g.name)}: 6 to 8 spare ${flame} is fine, and 8 is ideal (one +3 and two plain).`);
      }
    }
    if (res.next && res.next.length) lines.push(`Next to craft: ${res.next.map((n) => `${art(n.id, n.name)}${n.focus ? ` (${n.focus === "pvp" ? "PvP" : "PvE"}-Focus)` : ""}${OPTIONAL_NOTE(n)}${HAVE_NOTE(n)} - ${nextText(n, res)}`).join(". ")}.`);
    if (res.report.allDone && !doNow.length) lines.push("You're all set!");
    return render(lines.join("\n"), fmt);
  }

  // The same advice as data, for the cards on the page: progress line, the recommended step, what is missing, extra crafts, tips.
  // Text fields use the same art() markers as casual(), so render(text, "html") puts the icons in.
  function view(res) {
    const cur = res.report.current;
    const doNow = res.plan;
    const curT = cur === null ? null : res.tiers.find((t) => t.tier === cur);
    const doneTiers = res.tiers.filter((t) => t.evaluated && t.done).map((t) => t.tier);
    const progress = [];
    if (doneTiers.length) progress.push(doneText(doneTiers));
    if (curT) progress.push(cur === 1 ? `You are working on ${TN(1)}.` : `Next is ${TN(cur)}.`);
    const cost = doNow.reduce((t, a) => t + a.cost, 0);
    const hero = doNow.length
      ? { kind: "craft", waitingFor: res.blockers.length ? "copies" : "other items", saveAfter: res.essenceLeft <= SAVE_LIMIT, canAfford: Math.floor(res.essenceLeft / res.perArtifact), items: doNow.map((a) => ({ id: a.itemId, name: a.item, cost: a.cost, tier: a.tier, copy: a.copy || 1, pvp: !!a.pvp, focus: a.focus || null, optional: a.optional || null, ahead: !!a.ahead, pool: !!a.pool })), ahead: !!doNow[0].ahead, pool: !!doNow[0].pool, waitingTier: cur, cost, have: res.essenceStart, left: res.essenceLeft }
      : curT ? { kind: "save", have: res.essenceStart, per: res.perArtifact } : { kind: "done" };
    const missing = [], tips = [];
    if (curT) {
      const inPlan = new Set(doNow.map((a) => a.itemId));
      for (const it of curT.items) {
        if (it.done || it.gate || it.optional || inPlan.has(it.id) || (res.skipped || []).includes(it.id)) continue;
        const mine = res.blockers.filter((b) => b.itemId === it.id);
        const text = mine.length
          ? blockText(mine)
          : it.need > 1 ? `you have ${it.owned} of ${it.need}` : "you do not have it yet";
        missing.push({ id: it.id, name: it.name, pvp: !!it.pvp, focus: it.focus || null, text });
      }
      for (const g of curT.items.filter((x) => x.gate && !x.done)) {
        const flame = art("legendary-18", "Essence of Burning Flame");
        const bits = [];
        if (!g.gate.reqOk) bits.push(`${g.gate.requires.map((r) => art(r.id, r.name)).join(", ")} (you must own it first)`);
        if (g.gate.flames < g.gate.minFlames) bits.push(`${g.gate.minFlames - g.gate.flames} more spare ${flame} (${flameHave(g.gate.flames, g.gate.equippedFlames)})`);
        if (g.essenceShort > 0) bits.push(`${ess(g.essenceShort)} more Dimensional Essences (you need ${ess(res.perArtifact)} and have ${ess(res.essenceLeft)})`);
        if (bits.length) missing.push({ id: g.id, name: g.name + nth(g), pvp: !!g.pvp, text: "you still need " + bits.join("; ") });
        if (g.gate.flames < g.gate.idealFlames) tips.push(`${art(g.id, g.name)}: 6 to 8 spare ${flame} is fine, and 8 is ideal (one +3 and two plain).`);
      }
    }
    const mapN = (n) => ({ id: n.id, name: n.name, copyNo: n.copyNo || 1, tier: n.tier, pool: !!n.pool, need: n.need, owned: n.owned, pvp: n.pvp, focus: n.focus || null, optional: n.optional, text: nextText(n, res), ready: !!n.ready, essenceShort: n.essenceShort || 0, gate: n.gate ? { reqOk: n.gate.reqOk, requires: n.gate.requires, flames: n.gate.flames, equippedFlames: n.gate.equippedFlames, minFlames: n.gate.minFlames } : null, short: groupMissing(n.missing) });
    const next = (res.nextRest || res.next || []).map(mapN), priority = (res.priority || []).map(mapN);
    const pri = new Set(priority.map((x) => x.id));
    return { skipped: res.skipped || [], craftable: res.craftable || [], progress, hero, missing: priority.length ? missing.filter((m) => !pri.has(m.id)) : missing, next, priority, tips, pvp: !!res.pvp, caution: res.caution || [] };
  }

  return { SAVE_LIMIT, TIER_NAMES, flameHave, view, render, art, totals, tileCopies, mythicCopies, legendaryCopies, ownedCount, parseCount, ruleItems, advise, casual };
});
