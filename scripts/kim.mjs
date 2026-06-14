/* ----------------------------------------------------------------------------
 * KIM — "Kinda Important Messages" chat client (Warframe-1999 / MSN style).
 * Renders the affinity tracker as faithful chat windows INSIDE the desktop
 * shell, driven by a WindowManager. The rules layer (cardinal-virtuoso.mjs) is
 * reused unchanged — KIM is only a view + controller.
 * -------------------------------------------------------------------------- */
import { VIRTUES, CANONICAL_VIRTUES, RANK_FLAVOR, RULES, GIFTS, ACHIEVEMENTS, GOOD_ENDING_REWARDS } from "./data.mjs";
import {
  getDossier, setDossier, wirePortraits,
  applyConversation, sendContraband, scoreContraband, discardContraband,
  applyQuirk, applyAdjustment, applyGift,
  requestConversation, requestQuirk, approveRequest, denyRequest,
  toggleBond, endMission, timeOff, pushChat,
  rankRequirement, baseRankReq, qualifiedRank, bondedCount, bondSlotsAllowed,
  contrabandHaul, blankDossier, foundryConfirm,
  getRankReqByVirtue, setVirtueRankReq,
  refreshAchievements, setAchievement, goodEndingTier,
  saveCustomVirtue, deleteCustomVirtue, setVirtueHidden
} from "./cardinal-virtuoso.mjs";
import { relayNotifyGM } from "./relay.mjs";

const MOD = "cain-cardinal-virtuoso";
const T   = (name) => `modules/${MOD}/templates/${name}`;
const GIFT_NAMES = Object.values(GIFTS).map(g => g.name);

function renderTpl(path, data) {
  const fn = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
  return fn(path, data);
}

function portraitPath(key, v) {
  // Only emit a path when a real portrait override exists; otherwise the
  // template falls back to the glyph and we avoid a guaranteed 404 request.
  return v.portrait ? `modules/${MOD}/${v.portrait}` : "";
}

/* Localize helpers with a safe fallback to the key if i18n isn't ready. */
function loc(key) { return game.i18n?.localize?.(key) ?? key; }
function fmt(key, data) { return game.i18n?.format?.(key, data) ?? key; }

/* bond state → relationship label shown like an MSN status. */
function relStatus(slot) {
  if (slot.pendingBreak) return { label: loc("cain-cardinal-virtuoso.rel.broken"), cls: "broken" };
  if (!slot.bonded)      return { label: loc("cain-cardinal-virtuoso.rel.offline"), cls: "off" };
  return [
    { label: loc("cain-cardinal-virtuoso.rel.r0"), cls: "r0" },
    { label: loc("cain-cardinal-virtuoso.rel.r1"), cls: "r1" },
    { label: loc("cain-cardinal-virtuoso.rel.r2"), cls: "r2" },
    { label: loc("cain-cardinal-virtuoso.rel.r3"), cls: "r3" }
  ][slot.rank] ?? { label: loc("cain-cardinal-virtuoso.rel.online"), cls: "r0" };
}

function convCap(d) { return d.x2mod ? RULES.conv.perMissionX2 : RULES.conv.perMission; }
function contraCap(d) { return d.x2mod ? RULES.contraband.perMissionX2 : RULES.contraband.perMission; }

const _norm = (s) => String(s ?? "").trim().toLowerCase();
const _stripParen = (s) => _norm(s).replace(/\s*\(.*?\)\s*/g, " ").trim();

/* Map a CAIN bond Item to a module virtue key. CAIN naming is inconsistent:
   official bonds are name="Charity" / virtueName="The Twins" (the epithet),
   while custom-built ones are name="Absolution (The Mourner)" / virtueName="Absolution".
   So we test the item's name AND virtueName against each virtue's name and epithet,
   tolerating a trailing "(epithet)" parenthetical. */
function virtueKeyForItem(item) {
  if (!item) return null;
  const name = _norm(item.name);
  const vn = _norm(item.system?.virtueName);
  const nameBase = _stripParen(item.name);
  for (const k of Object.keys(VIRTUES)) {
    const kn = _norm(VIRTUES[k].name);
    const ep = _norm(VIRTUES[k].epithet);
    if (name === kn || vn === kn || nameBase === kn) return k;
    if ((ep && (name === ep || vn === ep))) return k;
    if (name.startsWith(`${kn} `) || name.startsWith(`${kn}(`)) return k;
  }
  return null;
}

/* The id a CAIN bond entry's bondId points at: the compendium source id for
   compendium-linked bonds, or the embedded item's own id for world-built ones. */
function bondSourceId(item) {
  const src = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? "";
  return String(src).split(".").pop();
}
function bondMatchesId(item, bondId) {
  if (!item || !bondId) return false;
  return item.id === bondId || item._id === bondId || bondSourceId(item) === bondId;
}

/* Read a linked CAIN character actor's started bonds → { virtueKey: currentLevel }.
   CAIN stores levels in actor.system.bonds[{bondId, currentLevel}]; each bondId
   resolves to an embedded `bond` item whose name/virtueName maps to one of ours. */
function actorBondLevels(actor) {
  const out = {};
  const bonds = actor?.system?.bonds;
  if (!Array.isArray(bonds)) return out;
  const items = Array.from(actor.items ?? []).filter(it => it.type === "bond");
  for (const b of bonds) {
    const item = items.find(it => bondMatchesId(it, b.bondId)) ?? null;
    const key = virtueKeyForItem(item);
    if (key) out[key] = Math.max(0, Math.min(3, Number(b.currentLevel) || 0));
  }
  return out;
}

export class KimController {
  constructor(wm, targetUserId) {
    this.wm = wm;
    this.targetUserId = targetUserId ?? game.user.id;
    this._open = new Set();   // KIM window ids currently open
    // Live-sync: re-render open windows when the viewed dossier flag changes
    // anywhere (GM editing a player, the player's own second client, etc.).
    this._onUpdateUser = (user, changes) => {
      if (user.id !== this.targetUserId) return;
      if (!foundry.utils.hasProperty(changes, `flags.${MOD}.dossier`)) return;
      this.refresh();
    };
    Hooks.on("updateUser", this._onUpdateUser);
    // Also re-render when the linked CAIN character changes (new bond started,
    // currentLevel edited on the sheet) so the contact list stays current.
    this._onUpdateActor = (actor) => {
      if (actor.id && actor.id === this.targetActor?.id) this.refresh();
    };
    Hooks.on("updateActor", this._onUpdateActor);
    // Adding/removing/renaming a bond Item on the sheet does NOT fire updateActor,
    // so a new bond would never show up. Watch the embedded Item lifecycle too.
    this._onItem = (item) => {
      if (item?.type !== "bond") return;
      const actorId = item.parent?.id ?? item.actor?.id ?? null;
      if (actorId && actorId === this.targetActor?.id) this.refresh();
    };
    Hooks.on("createItem", this._onItem);
    Hooks.on("deleteItem", this._onItem);
    Hooks.on("updateItem", this._onItem);
  }

  teardown() {
    if (this._onUpdateUser) Hooks.off("updateUser", this._onUpdateUser);
    if (this._onUpdateActor) Hooks.off("updateActor", this._onUpdateActor);
    if (this._onItem) {
      Hooks.off("createItem", this._onItem);
      Hooks.off("deleteItem", this._onItem);
      Hooks.off("updateItem", this._onItem);
    }
    this._onUpdateUser = null;
    this._onUpdateActor = null;
    this._onItem = null;
  }

  get targetUser() { return game.users.get(this.targetUserId) ?? game.user; }
  get targetActor() { return this.targetUser?.character ?? null; }
  canWrite() { return game.user.isGM || this.targetUserId === game.user.id; }

  /* Which virtues the viewer sees: players see only their character's started
     bonds; the GM keeps full access to all 9 for admin. */
  bondInfo() {
    const actor = this.targetActor;
    const levels = actorBondLevels(actor);
    return { actor, levels, bondedKeys: new Set(Object.keys(levels)) };
  }
  visibleEntries(bondedKeys) {
    const all = Object.entries(VIRTUES);
    return game.user.isGM ? all : all.filter(([k]) => bondedKeys.has(k));
  }

  /* Fold the linked sheet's started bonds into a dossier in memory: a bond that
     exists on the CAIN sheet counts as bonded here, and its currentLevel seeds
     the rank (never lowering an already-higher KIM rank). KIM stays authoritative
     on rank afterwards. No write happens here — callers persist on user action. */
  applySheetBonds(d) {
    const levels = actorBondLevels(this.targetActor);
    for (const [key, lvl] of Object.entries(levels)) {
      const slot = d.virtues[key];
      if (!slot || slot.pendingBreak) continue;
      slot.bonded = true;
      if (lvl > (slot.rank ?? 0)) slot.rank = lvl;
    }
    return d;
  }

  /* The viewed dossier with sheet bonds already folded in (read path). */
  syncedDossier() {
    return this.applySheetBonds(getDossier(this.targetUser));
  }

  /* KIM is authoritative: push each virtue's current rank to the linked CAIN
     character's bond currentLevel, so the sheet edits itself as bonds grow. */
  async syncActorBonds(d) {
    const actor = this.targetActor;
    const bonds = actor?.system?.bonds;
    if (!Array.isArray(bonds) || !bonds.length) return;
    const items = Array.from(actor.items ?? []).filter(it => it.type === "bond");
    let changed = false;
    const next = bonds.map(b => {
      const item = items.find(it => bondMatchesId(it, b.bondId));
      const key = virtueKeyForItem(item);
      if (!key) return b;
      const level = Math.max(0, Math.min(3, d.virtues[key]?.rank ?? 0));
      if (level !== b.currentLevel) { changed = true; return { ...b, currentLevel: level }; }
      return b;
    });
    if (!changed) return;
    try { await actor.update({ "system.bonds": next }); }
    catch (e) { console.warn(`${MOD} | could not sync bond levels to actor`, e); }
  }

  /* ── context builders ── */
  contactsCtx() {
    const d = this.syncedDossier();
    const { actor, bondedKeys } = this.bondInfo();
    const contacts = this.visibleEntries(bondedKeys).map(([key, v]) => {
      const slot = bondedKeys.has(key) ? { ...d.virtues[key], bonded: true } : d.virtues[key];
      const st = relStatus(slot);
      return {
        key, name: v.name, epithet: v.epithet, glyph: v.glyph,
        portrait: portraitPath(key, v),
        status: st.label, statusClass: st.cls,
        bonded: slot.bonded, broken: slot.pendingBreak,
        affinity: slot.affinity, rank: slot.rank,
        reqNext: slot.bonded && slot.rank < 3 ? rankRequirement(slot, slot.rank + 1, key) : null
      };
    });
    const ctx = {
      me: { name: this.targetUser.name, avatar: this.targetUser.avatar },
      isGM: game.user.isGM, canWrite: this.canWrite(),
      mission: d.mission, codename: d.codename, hqStock: d.hqStock, x2mod: d.x2mod,
      bondsUsed: bondedCount(d), bondsAllowed: bondSlotsAllowed(d),
      bondsOver: bondedCount(d) > bondSlotsAllowed(d),
      contacts,
      noCharacter: !game.user.isGM && !actor,
      noBonds: !game.user.isGM && !!actor && bondedKeys.size === 0
    };
    if (game.user.isGM) {
      ctx.allUsers = game.users.filter(u => !u.isGM).map(u => ({
        id: u.id, name: u.name, active: u.active, selected: u.id === this.targetUserId
      }));
    }
    return ctx;
  }

  profileCtx(key) {
    const d = this.syncedDossier();
    const v = VIRTUES[key];
    const { bondedKeys } = this.bondInfo();
    const slot = bondedKeys.has(key) ? { ...d.virtues[key], bonded: true } : d.virtues[key];
    const st = relStatus(slot);
    const reqNext = slot.rank < 3 ? rankRequirement(slot, slot.rank + 1, key) : null;
    const affPct = (!reqNext || reqNext <= 0)
      ? 100 : Math.max(0, Math.min(100, Math.round((slot.affinity / reqNext) * 100)));
    return {
      key, name: v.name, epithet: v.epithet, glyph: v.glyph, portrait: portraitPath(key, v),
      status: st.label, statusClass: st.cls, rankFlavor: RANK_FLAVOR[slot.rank] ?? "",
      bonded: slot.bonded, broken: slot.pendingBreak, affinity: slot.affinity, rank: slot.rank,
      affPct, affCrit: slot.pendingBreak || slot.affinity < 0,
      reqNext,
      bondText: v.bonds[slot.rank] ?? "",
      likes: v.likes, dislikes: v.dislikes, food: v.food, blasphemy: v.blasphemy,
      quirks: (v.quirks ?? []).map((q, i) => ({
        index: i, label: q.label, deltaStr: `${q.delta >= 0 ? "+" : ""}${q.delta}`,
        good: q.delta >= 0, perMission: q.perMission, used: slot.quirkUses[i] ?? 0
      })),
      notes: [...d.log].reverse().filter(l => l.includes(v.name)),
      canWrite: this.canWrite(), isGM: game.user.isGM, hqStock: d.hqStock
    };
  }

  contrabandCtx(selectedKey) {
    const d = this.syncedDossier();
    const { bondedKeys } = this.bondInfo();
    const cap = contraCap(d);
    const contacts = this.visibleEntries(bondedKeys).map(([key, v]) => {
      const slot = bondedKeys.has(key) ? { ...d.virtues[key], bonded: true } : d.virtues[key];
      return {
        key, name: v.name, status: relStatus(slot).label, bonded: slot.bonded,
        used: slot.contraUsed, selected: key === selectedKey
      };
    });
    const gifts = this.ownedGifts(this.targetActor);
    const items = this.ownedContraband(this.targetActor);
    const pending = (d.contrabandQueue ?? []).map(e => ({
      id: e.id, item: e.item, glyph: e.glyph,
      name: VIRTUES[e.vkey]?.name ?? e.vkey
    }));
    return {
      canWrite: this.canWrite(), isGM: game.user.isGM,
      hqStock: d.hqStock, hqCap: RULES.contraband.hqCap, cap,
      contacts,
      dropRecipients: contacts.filter(c => c.bonded),
      items, hasItems: items.length > 0,
      giftRecipients: contacts.filter(c => c.bonded),
      gifts, hasGifts: gifts.length > 0,
      pending, hasPending: pending.length > 0,
      drops: [...d.log].reverse().filter(l => l.includes("Contraband") || GIFT_NAMES.some(n => l.includes(n))).slice(0, 12)
    };
  }

  /* Non-gift inventory items the target carries on their CAIN sheet — these are
     the contraband a player can send for the GM to score. Gift-flagged items are
     excluded (they keep their own automated Dead Drop flow). */
  ownedContraband(actor) {
    if (!actor) return [];
    const out = [];
    for (const it of actor.items ?? []) {
      if (it.type !== "item") continue;
      const giftKey = it.getFlag?.(MOD, "gift") ?? it.flags?.[MOD]?.gift;
      if (giftKey && GIFTS[giftKey]) continue;
      out.push({ itemId: it.id, name: it.name, qty: it.system?.quantity ?? 1 });
    }
    return out;
  }

  /* GM contraband review: the queue of items players sent but the GM hasn't
     scored yet, plus the standard category shortcuts for the score buttons. */
  contrabandReviewCtx() {
    const d = this.syncedDossier();
    const r = RULES.contraband;
    const queue = (d.contrabandQueue ?? []).map(e => ({
      id: e.id, item: e.item, glyph: e.glyph,
      name: VIRTUES[e.vkey]?.name ?? e.vkey
    }));
    const requests = (d.requestQueue ?? []).map(rq => {
      const v = VIRTUES[rq.vkey];
      let detail = "";
      if (rq.kind === "conversation") {
        const p = rq.payload ?? {};
        const parts = [];
        if (p.topicHit === "like") parts.push(loc("cain-cardinal-virtuoso.conv.likedTopic"));
        if (p.topicHit === "dislike") parts.push(loc("cain-cardinal-virtuoso.conv.dislikedTopic"));
        if (p.goodTalk) parts.push(loc("cain-cardinal-virtuoso.conv.wentWell"));
        if (p.connectionHit) parts.push(loc("cain-cardinal-virtuoso.conv.connection"));
        detail = parts.join(" · ") || loc("cain-cardinal-virtuoso.req.noOutcome");
      } else if (rq.kind === "quirk") {
        detail = v?.quirks?.[rq.payload?.qIndex]?.label ?? "";
      }
      return { id: rq.id, kind: rq.kind, name: v?.name ?? rq.vkey, glyph: v?.glyph ?? "?", detail };
    });
    return {
      isGM: game.user.isGM, who: this.targetUser.name,
      queue, hasQueue: queue.length > 0,
      requests, hasRequests: requests.length > 0,
      cats: [
        { kind: "favorite", label: loc("cain-cardinal-virtuoso.drop.favorite"), delta: `+${r.favorite}` },
        { kind: "like",     label: loc("cain-cardinal-virtuoso.drop.like"),     delta: `+${r.like}` },
        { kind: "neutral",  label: loc("cain-cardinal-virtuoso.drop.neutral"),  delta: `+${r.neutral}` },
        { kind: "dislike",  label: loc("cain-cardinal-virtuoso.drop.dislike"),  delta: `${r.dislike}` }
      ]
    };
  }

  /* Contraband gift items the target carries on their CAIN sheet — inventory
     items ("item") that carry this module's gift flag. The flag links the item
     to a GIFTS entry whose automated effect fires when the gift is dropped. */
  ownedGifts(actor) {
    if (!actor) return [];
    const out = [];
    for (const it of actor.items ?? []) {
      if (it.type !== "item") continue;
      const giftKey = it.getFlag?.(MOD, "gift") ?? it.flags?.[MOD]?.gift;
      const g = giftKey && GIFTS[giftKey];
      if (!g) continue;
      out.push({
        itemId: it.id, giftKey, name: it.name || g.name, glyph: g.glyph,
        qty: it.system?.quantity ?? 1, cost: g.cost, desc: g.desc,
        fresh: g.effect?.kind === "flat" && g.effect?.freshBonus
      });
    }
    return out;
  }

  /* Consume one unit of an inventory item: decrement quantity, or delete when
     the last one is spent. The player owns their own actor, so this is allowed. */
  async consumeItem(item) {
    if (!item) return;
    const qty = item.system?.quantity ?? 1;
    if (qty > 1) await item.update({ "system.quantity": qty - 1 });
    else await item.delete();
  }

  /* Well-Organized Journal: warn before the first affinity-lowering action each
     mission. Returns false if the player rethinks (cancels). Consumes the
     once-per-mission warning either way. */
  async journalGate(d, key, willLower) {
    if (!willLower) return true;
    const slot = d.virtues[key];
    if (!slot?.buffs?.journal || slot.buffs.journalWarnedThisMission) return true;
    slot.buffs.journalWarnedThisMission = true;
    const ok = await foundryConfirm(fmt("cain-cardinal-virtuoso.gift.journalWarn", { name: VIRTUES[key].name }));
    await setDossier(this.targetUser, d); // persist the consumed warning regardless
    if (!ok) await this.refresh();
    return ok;
  }

  hqCtx() {
    const d = this.syncedDossier();
    return {
      canWrite: this.canWrite(), isGM: game.user.isGM,
      codename: d.codename, mission: d.mission,
      x2mod: d.x2mod, gateUser: d.gateUser,
      covert: d.covert, cat: d.cat,
      hqStock: d.hqStock, hqCap: RULES.contraband.hqCap,
      nextHaul: contrabandHaul(d),
      bondsUsed: bondedCount(d), bondsAllowed: bondSlotsAllowed(d)
    };
  }

  convCtx(key) {
    const d = this.syncedDossier();
    const v = VIRTUES[key];
    const slot = d.virtues[key];
    const st = relStatus(slot);
    const chat = (slot.chat ?? []).map(m => ({
      who: m.who === "op" ? this.targetUser.name : v.name,
      text: m.text, cls: m.who === "op" ? "op" : "virtue"
    }));
    return {
      key, name: v.name, glyph: v.glyph, portrait: portraitPath(key, v),
      status: st.label, statusClass: st.cls, chat,
      canWrite: this.canWrite(), isGM: game.user.isGM,
      convUsed: slot.convUsed, convCap: convCap(d)
    };
  }

  /* Per-bond affinity tracker + personality. Players see it read-only; the GM
     edits each virtue's Bond I/II/III minimum-affinity requirements here. */
  trackerCtx() {
    const d = this.syncedDossier();
    const { actor, bondedKeys } = this.bondInfo();
    const overrides = getRankReqByVirtue();
    const bonds = this.visibleEntries(bondedKeys).map(([key, v]) => {
      const slot = bondedKeys.has(key) ? { ...d.virtues[key], bonded: true } : d.virtues[key];
      const reqs = [1, 2, 3].map(r => baseRankReq(r, key));
      const scale = Math.max(reqs[2], slot.affinity, 1);
      const pct = (n) => Math.max(0, Math.min(100, Math.round((n / scale) * 100)));
      return {
        key, name: v.name, epithet: v.epithet, glyph: v.glyph, portrait: portraitPath(key, v),
        bonded: slot.bonded, broken: slot.pendingBreak, affinity: slot.affinity, rank: slot.rank,
        affPct: pct(slot.affinity),
        ticks: [1, 2, 3].map((r, i) => ({
          rank: r, value: reqs[i], pct: pct(reqs[i]), reached: slot.affinity >= reqs[i]
        })),
        req1: reqs[0], req2: reqs[1], req3: reqs[2],
        custom: !!overrides[key],
        likes: v.likes, dislikes: v.dislikes, food: v.food, blasphemy: v.blasphemy,
        bondLevels: [0, 1, 2, 3].map(r => ({ rank: r, text: v.bonds[r] ?? "", current: r === slot.rank }))
      };
    });
    return {
      isGM: game.user.isGM, canWrite: this.canWrite(), bonds,
      noCharacter: !game.user.isGM && !actor,
      noBonds: !game.user.isGM && !!actor && bonds.length === 0
    };
  }

  /* Distinct "good" achievements unlocked across the whole party (each counts
     once — players cannot repeat an achievement for extra points). */
  goodEndingPoints() {
    const goodKeys = new Set(ACHIEVEMENTS.filter(a => a.group === "good").map(a => a.key));
    const unlocked = new Set();
    for (const u of game.users) {
      if (u.isGM) continue;
      const dd = getDossier(u);
      for (const k of Object.keys(dd.achievements ?? {})) if (goodKeys.has(k)) unlocked.add(k);
    }
    return unlocked.size;
  }

  /* Achievements window: per-achievement unlock state for the viewed dossier,
     the shared Good Ending Point total and the reward ladder. Players read-only;
     the GM toggles subjective achievements. */
  achievementsCtx() {
    const d = this.syncedDossier();
    refreshAchievements(d); // reflect current auto state in the view (persisted on commit)
    const mine = d.achievements ?? {};
    const toRow = (a) => ({
      key: a.key, name: a.name, desc: a.desc, auto: !!a.auto, unlocked: !!mine[a.key]
    });
    const good = ACHIEVEMENTS.filter(a => a.group === "good").map(toRow);
    const bad = ACHIEVEMENTS.filter(a => a.group === "bad").map(toRow);
    const gep = this.goodEndingPoints();
    const tier = goodEndingTier(gep);
    const goodUnlocked = good.filter(a => a.unlocked).length;
    const maxReward = GOOD_ENDING_REWARDS[GOOD_ENDING_REWARDS.length - 1].points;
    return {
      isGM: game.user.isGM, canWrite: this.canWrite(),
      good, bad, gep,
      gepPct: Math.max(0, Math.min(100, Math.round((gep / maxReward) * 100))),
      goodUnlocked, goodTotal: good.length,
      pct: good.length ? Math.round((goodUnlocked / good.length) * 100) : 0,
      tierPoints: tier?.points ?? 0,
      rewards: GOOD_ENDING_REWARDS.map(r => ({
        points: r.points, pct: Math.round((r.points / maxReward) * 100), text: r.text,
        reached: gep >= r.points, current: r.points === (tier?.points ?? -1)
      })),
      noCharacter: !game.user.isGM && !this.targetActor
    };
  }

  virtuesCtx() {
    const hidden = new Set(game.settings.get(MOD, "hiddenVirtues") || []);
    const custom = game.settings.get(MOD, "customVirtues") || {};
    const canonical = Object.entries(CANONICAL_VIRTUES).map(([key, v]) => ({
      key, name: v.name, epithet: v.epithet, glyph: v.glyph, hidden: hidden.has(key)
    }));
    const customList = Object.entries(custom).map(([key, v]) => ({
      key, name: v.name, epithet: v.epithet, glyph: v.glyph,
      likes: (v.likes || []).join(", "), dislikes: (v.dislikes || []).join(", "),
      food: (v.food || []).join(", "), blasphemy: v.blasphemy || "",
      bond0: v.bonds?.[0] || "", bond1: v.bonds?.[1] || "", bond2: v.bonds?.[2] || "", bond3: v.bonds?.[3] || ""
    }));
    return { isGM: game.user.isGM, canonical, customList };
  }

  /* ── window openers ── */
  async openContacts() {
    const id = "kim-contacts";
    const html = await renderTpl(T("kim-contacts.hbs"), this.contactsCtx());
    this._open.add(id);
    this.wm.open(id, {
      title: "KIM", icon: "✉", width: 300, height: 520, x: 40, y: 30,
      html, onBody: (b) => this.wireContacts(b),
      onClose: () => this._open.delete(id)
    });
  }

  async openProfile(key) {
    const id = `kim-profile-${key}`;
    const html = await renderTpl(T("kim-profile.hbs"), this.profileCtx(key));
    this._open.add(id);
    this.wm.open(id, {
      title: `${VIRTUES[key].name} — ${loc("cain-cardinal-virtuoso.kim.profile")}`, icon: "▤", width: 340,
      html, onBody: (b) => this.wireProfile(b),
      onClose: () => this._open.delete(id)
    });
  }

  async openContraband(selectedKey) {
    const id = "kim-contraband";
    const html = await renderTpl(T("kim-contraband.hbs"), this.contrabandCtx(selectedKey));
    this._open.add(id);
    this.wm.open(id, {
      title: "Dead Drop", icon: "📦", width: 320, height: 460,
      html, onBody: (b) => this.wireContraband(b),
      onClose: () => this._open.delete(id)
    });
  }

  async openContrabandReview() {
    if (!game.user.isGM) return;
    const id = "kim-contra-review";
    const html = await renderTpl(T("kim-contraband-review.hbs"), this.contrabandReviewCtx());
    this._open.add(id);
    this.wm.open(id, {
      title: loc("cain-cardinal-virtuoso.review.title"), icon: "📋", width: 360, height: 480,
      html, onBody: (b) => this.wireContrabandReview(b),
      onClose: () => this._open.delete(id)
    });
  }

  async openHQ() {
    const id = "kim-hq";
    const html = await renderTpl(T("kim-hq.hbs"), this.hqCtx());
    this._open.add(id);
    this.wm.open(id, {
      title: "HQ Console", icon: "⚙", width: 320, height: 480,
      html, onBody: (b) => this.wireHQ(b),
      onClose: () => this._open.delete(id)
    });
  }

  async openTracker() {
    const id = "kim-tracker";
    const html = await renderTpl(T("kim-tracker.hbs"), this.trackerCtx());
    this._open.add(id);
    this.wm.open(id, {
      title: loc("cain-cardinal-virtuoso.track.title"), icon: "📊", width: 400, height: 580,
      html, onBody: (b) => this.wireTracker(b),
      onClose: () => this._open.delete(id)
    });
  }

  async openAchievements() {
    const id = "kim-achievements";
    const html = await renderTpl(T("kim-achievements.hbs"), this.achievementsCtx());
    this._open.add(id);
    this.wm.open(id, {
      title: loc("cain-cardinal-virtuoso.ach.title"), icon: "🏆", width: 420, height: 600,
      html, onBody: (b) => this.wireAchievements(b),
      onClose: () => this._open.delete(id)
    });
  }

  async openConv(key) {
    const id = `kim-conv-${key}`;
    const html = await renderTpl(T("kim-conversation.hbs"), this.convCtx(key));
    this._open.add(id);
    this.wm.open(id, {
      title: VIRTUES[key].name, icon: "✉", width: 360, height: 440,
      html, onBody: (b) => this.wireConv(b),
      onClose: () => this._open.delete(id)
    });
  }

  async openVirtues() {
    if (!game.user.isGM) return;
    const id = "kim-virtues";
    const html = await renderTpl(T("kim-virtues.hbs"), this.virtuesCtx());
    this._open.add(id);
    this.wm.open(id, {
      title: loc("cain-cardinal-virtuoso.virt.title"), icon: "⛨", width: 460, height: 620,
      html, onBody: (b) => this.wireVirtues(b),
      onClose: () => this._open.delete(id)
    });
  }

  /* ── re-render every open KIM window after a state change ── */
  async refresh() {
    for (const id of [...this._open]) {
      if (!this.wm.has(id)) { this._open.delete(id); continue; }
      if (id === "kim-contacts") {
        this.wm.setHtml(id, await renderTpl(T("kim-contacts.hbs"), this.contactsCtx()), (b) => this.wireContacts(b));
      } else if (id.startsWith("kim-profile-")) {
        const key = id.slice("kim-profile-".length);
        this.wm.setHtml(id, await renderTpl(T("kim-profile.hbs"), this.profileCtx(key)), (b) => this.wireProfile(b));
      } else if (id === "kim-tracker") {
        this.wm.setHtml(id, await renderTpl(T("kim-tracker.hbs"), this.trackerCtx()), (b) => this.wireTracker(b));
      } else if (id === "kim-hq") {
        this.wm.setHtml(id, await renderTpl(T("kim-hq.hbs"), this.hqCtx()), (b) => this.wireHQ(b));
      } else if (id === "kim-achievements") {
        this.wm.setHtml(id, await renderTpl(T("kim-achievements.hbs"), this.achievementsCtx()), (b) => this.wireAchievements(b));
      } else if (id === "kim-contraband") {
        const body = this.wm.bodyEl(id);
        const selKey = body?.querySelector('select[name="dropVirtue"]')?.value;
        const selItem = body?.querySelector('select[name="dropItem"]')?.value;
        this.wm.setHtml(id, await renderTpl(T("kim-contraband.hbs"), this.contrabandCtx(selKey)), (b) => {
          const itemSel = b.querySelector('select[name="dropItem"]');
          if (itemSel && selItem) itemSel.value = selItem;
          this.wireContraband(b);
        });
      } else if (id === "kim-contra-review") {
        this.wm.setHtml(id, await renderTpl(T("kim-contraband-review.hbs"), this.contrabandReviewCtx()), (b) => this.wireContrabandReview(b));
      } else if (id === "kim-virtues") {
        this.wm.setHtml(id, await renderTpl(T("kim-virtues.hbs"), this.virtuesCtx()), (b) => this.wireVirtues(b));
      } else if (id.startsWith("kim-conv-")) {
        const key = id.slice("kim-conv-".length);
        const prev = this.wm.bodyEl(id)?.querySelector('input[name="msg"]')?.value ?? "";
        this.wm.setHtml(id, await renderTpl(T("kim-conversation.hbs"), this.convCtx(key)), (b) => {
          const inp = b.querySelector('input[name="msg"]');
          if (inp) inp.value = prev;
          this.wireConv(b);
        });
      }
    }
  }

  /* ── shared mutation wrapper ── */
  async commit(d, r) {
    if (r && r.ok === false) { ui.notifications.warn(r.msg); return false; }
    refreshAchievements(d); // fold in any auto achievements before persisting
    await setDossier(this.targetUser, d);
    await this.syncActorBonds(d);
    if (r?.msg) ui.notifications.info(r.msg);
    await this.refresh();
    return true;
  }

  /* ── DOM wiring ── */
  _delegate(body, handlers) {
    body.querySelectorAll("[data-action]").forEach(el => {
      const action = el.dataset.action;
      const fn = handlers[action];
      if (!fn) return;
      const evt = el.tagName === "SELECT" ? "change" : "click";
      el.addEventListener(evt, (ev) => fn.call(this, ev, el, body));
    });
    wirePortraits(body);
  }

  wireContacts(body) {
    this._delegate(body, {
      openChat:   (ev, el) => this.openConv(el.dataset.virtue),
      openProfile:(ev, el) => { ev.stopPropagation(); this.openProfile(el.dataset.virtue); },
      pickUser:   (ev, el) => this.onPickUser(el.value),
      openDrop:    () => this.openContraband(),
      openReview:  () => this.openContrabandReview(),
      openHQ:      () => this.openHQ(),
      openTracker: () => this.openTracker(),
      openAchievements: () => this.openAchievements(),
      endMission:  () => this.onEndMission(),
      timeOff:     () => this.onTimeOff()
    });
  }

  wireTracker(body) {
    this._delegate(body, {
      saveTracker: (ev, el, b) => this.onSaveTracker(el.dataset.virtue, b),
      openProfile: (ev, el) => this.openProfile(el.dataset.virtue),
      openChat:    (ev, el) => this.openConv(el.dataset.virtue)
    });
  }

  wireAchievements(body) {
    this._delegate(body, {
      toggleAch: (ev, el) => this.onToggleAchievement(el.dataset.ach, el.checked)
    });
  }

  wireContraband(body) {
    this._delegate(body, {
      drop: (ev, el, b) => this.onSendContraband(b),
      dropGift: (ev, el, b) => this.onDropGift(b)
    });
  }

  wireContrabandReview(body) {
    this._delegate(body, {
      scoreCat: (ev, el)    => this.onScoreContraband(el.dataset.id, el.dataset.kind, null),
      scoreVal: (ev, el, b) => this.onScoreContraband(el.dataset.id, null, b),
      discardContra: (ev, el) => this.onDiscardContraband(el.dataset.id),
      approveReq: (ev, el) => this.onApproveRequest(el.dataset.id),
      denyReq:    (ev, el) => this.onDenyRequest(el.dataset.id)
    });
  }

  wireHQ(body) {
    this._delegate(body, {
      saveHQ: (ev, el, b) => this.onSaveHQ(b),
      reset:  () => this.onResetDossier()
    });
  }

  wireProfile(body) {
    this._delegate(body, {
      toggleBond:  (ev, el) => this.onToggleBond(el.dataset.virtue),
      openDrop:    (ev, el) => this.openContraband(el.dataset.virtue),
      quirk:       (ev, el) => this.onQuirk(el.dataset.virtue, Number(el.dataset.q)),
      reqQuirk:    (ev, el) => this.onRequestQuirk(el.dataset.virtue, Number(el.dataset.q)),
      adjust:      (ev, el, b) => this.onAdjust(el.dataset.virtue, b),
      openProfile: (ev, el) => this.openProfile(el.dataset.virtue)
    });
  }

  wireConv(body) {
    this._delegate(body, {
      send:        (ev, el, b) => this.onSend(el.dataset.virtue, b),
      conv:        (ev, el, b) => this.onConv(el.dataset.virtue, b),
      reqConv:     (ev, el, b) => this.onRequestConv(el.dataset.virtue, b),
      openProfile: (ev, el) => this.openProfile(el.dataset.virtue)
    });
    const input = body.querySelector('input[name="msg"]');
    if (input) input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.onSend(input.closest("[data-virtue]")?.dataset.virtue ?? body.querySelector("[data-action='send']")?.dataset.virtue, body); }
    });
    const msgs = body.querySelector(".cv-kim-msgs");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── action handlers ── */
  async onPickUser(userId) {
    if (!game.user.isGM) return;
    this.targetUserId = userId;
    await this.refresh();
  }

  async onToggleBond(key) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = this.syncedDossier();
    const r = toggleBond(d, key, {
      isGM: game.user.isGM,
      enforcePacing: game.settings.get(MOD, "enforcePacing")
    });
    await this.commit(d, r);
  }

  async onSendContraband(body) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const key = body.querySelector('select[name="dropVirtue"]')?.value;
    const itemId = body.querySelector('select[name="dropItem"]')?.value;
    if (!key || !itemId) return;
    const item = this.targetActor?.items?.get(itemId);
    if (!item) return ui.notifications.warn(loc("cain-cardinal-virtuoso.drop.itemGone"));
    const d = this.syncedDossier();
    const r = sendContraband(d, key, item.name);
    if (r.ok === false) return ui.notifications.warn(r.msg);
    await this.consumeItem(item); // sending spends one unit, like a gift
    await this.commit(d, r);
  }

  async onScoreContraband(entryId, kind, body) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    if (!entryId) return;
    let value;
    if (!kind) {
      const raw = body?.querySelector(`input[name="val-${entryId}"]`)?.value;
      value = parseInt(raw, 10);
      if (!Number.isFinite(value)) return ui.notifications.warn(loc("cain-cardinal-virtuoso.review.needValue"));
    }
    const d = this.syncedDossier();
    await this.commit(d, scoreContraband(d, entryId, { kind, value }));
  }

  async onDiscardContraband(entryId) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    if (!entryId) return;
    const d = this.syncedDossier();
    await this.commit(d, discardContraband(d, entryId));
  }

  async onApproveRequest(reqId) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    if (!reqId) return;
    const d = this.syncedDossier();
    await this.commit(d, approveRequest(d, reqId));
  }

  async onDenyRequest(reqId) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    if (!reqId) return;
    const d = this.syncedDossier();
    await this.commit(d, denyRequest(d, reqId));
  }

  /* ── homebrew Virtue Designer (GM) ── */
  wireVirtues(body) {
    this._delegate(body, {
      toggleHidden: (ev, el) => this.onToggleHidden(el.dataset.key, el.checked),
      editCustom:   (ev, el, b) => this.fillCustomForm(b, el.dataset.key),
      deleteCustom: (ev, el) => this.onDeleteCustom(el.dataset.key),
      saveCustom:   (ev, el, b) => this.onSaveCustom(b)
    });
  }

  async onToggleHidden(key, hidden) {
    if (!game.user.isGM) return;
    await setVirtueHidden(key, !!hidden);
    await this.refresh();
  }

  async onDeleteCustom(key) {
    if (!game.user.isGM) return;
    const ok = await foundryConfirm(fmt("cain-cardinal-virtuoso.virt.delAsk", { key }));
    if (!ok) return;
    await deleteCustomVirtue(key);
    await this.refresh();
  }

  fillCustomForm(body, key) {
    const custom = game.settings.get(MOD, "customVirtues") || {};
    const v = custom[key]; if (!v) return;
    const set = (n, val) => { const el = body.querySelector(`[name="${n}"]`); if (el) el.value = val; };
    set("vkey", key); set("vname", v.name); set("vepithet", v.epithet); set("vglyph", v.glyph);
    set("vlikes", (v.likes||[]).join(", ")); set("vdislikes", (v.dislikes||[]).join(", "));
    set("vfood", (v.food||[]).join(", ")); set("vblasphemy", v.blasphemy||"");
    set("vbond0", v.bonds?.[0]||""); set("vbond1", v.bonds?.[1]||"");
    set("vbond2", v.bonds?.[2]||""); set("vbond3", v.bonds?.[3]||"");
    set("vquirks", (v.quirks||[]).map(q => `${q.label}|${q.delta}${q.perMission?`|${q.perMission}`:""}`).join("\n"));
    set("vreactions", Object.entries(v.bondReactions||{}).map(([k,dl]) => `${k}|${dl}`).join("\n"));
  }

  async onSaveCustom(body) {
    if (!game.user.isGM) return;
    const g = (n) => body.querySelector(`[name="${n}"]`)?.value?.trim() ?? "";
    const key = g("vkey").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!key) return ui.notifications.warn(loc("cain-cardinal-virtuoso.virt.needKey"));
    // A custom key may intentionally shadow a canonical Virtue (override merge in rebuildVirtues).
    const csv = (s) => s.split(",").map(x => x.trim()).filter(Boolean);
    const quirks = g("vquirks").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
      const [label, delta, perMission] = l.split("|").map(x => x?.trim());
      const q = { label: label || "?", delta: parseInt(delta, 10) || 0 };
      const pm = parseInt(perMission, 10); if (Number.isFinite(pm) && pm > 0) q.perMission = pm;
      return q;
    });
    const bondReactions = {};
    for (const l of g("vreactions").split("\n").map(x => x.trim()).filter(Boolean)) {
      const [tk, dl] = l.split("|").map(x => x?.trim());
      const n = parseInt(dl, 10); if (tk && Number.isFinite(n)) bondReactions[tk] = n;
    }
    const def = {
      name: g("vname") || key, epithet: g("vepithet"), glyph: g("vglyph") || "?", portrait: "",
      likes: csv(g("vlikes")), dislikes: csv(g("vdislikes")), food: csv(g("vfood")),
      blasphemy: g("vblasphemy") || "—",
      bonds: { 0: g("vbond0"), 1: g("vbond1"), 2: g("vbond2"), 3: g("vbond3") },
      quirks, bondReactions
    };
    await saveCustomVirtue(key, def);
    ui.notifications.info(fmt("cain-cardinal-virtuoso.virt.saved", { name: def.name }));
    await this.refresh();
  }

  /* Send an inventory gift item: apply its automated effect, then spend one. */
  async onDropGift(body) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const key = body.querySelector('select[name="giftVirtue"]')?.value;
    const itemId = body.querySelector('select[name="giftItem"]')?.value;
    const fresh = !!body.querySelector('input[name="giftFresh"]')?.checked;
    if (!key || !itemId) return;
    const item = this.targetActor?.items?.get(itemId);
    const giftKey = item?.getFlag?.(MOD, "gift") ?? item?.flags?.[MOD]?.gift;
    if (!item || !giftKey) return ui.notifications.warn(loc("cain-cardinal-virtuoso.gift.notFound"));
    const d = this.syncedDossier();
    const r = applyGift(d, key, giftKey, { fresh });
    if (r.ok === false) return ui.notifications.warn(r.msg);
    await this.consumeItem(item);
    await this.commit(d, r);
  }

  async onQuirk(key, qIndex) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    const d = this.syncedDossier();
    if (!(await this.journalGate(d, key, (VIRTUES[key].quirks?.[qIndex]?.delta ?? 0) < 0))) return;
    await this.commit(d, applyQuirk(d, key, qIndex));
  }

  async onRequestQuirk(key, qIndex) {
    if (!this.canWrite() || game.user.isGM) return;
    const d = this.syncedDossier();
    const r = requestQuirk(d, key, qIndex);
    if (await this.commit(d, r)) {
      const label = VIRTUES[key]?.quirks?.[qIndex]?.label ?? "";
      relayNotifyGM({ fromUserId: game.user.id, label: fmt("cain-cardinal-virtuoso.req.notifyQuirk", { name: VIRTUES[key].name, quirk: label }) });
    }
  }

  async onAdjust(key, body) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    const delta = parseInt(body.querySelector(`input[name="adj-${key}"]`)?.value, 10) || 0;
    const d = this.syncedDossier();
    await this.commit(d, applyAdjustment(d, key, delta));
  }

  async onConv(key, body) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    const box = body.querySelector(`.cv-conv-checks[data-virtue="${key}"]`);
    const get = (n) => !!box?.querySelector(`input[data-cv="${n}"]`)?.checked;
    const d = this.syncedDossier();
    const topicHit = get("dislike") ? "dislike" : (get("topic") ? "like" : null);
    // A disliked topic only lowers affinity if no Page of One-liners is queued.
    const willLower = topicHit === "dislike" && !d.virtues[key]?.buffs?.page && !get("good") && !get("conn");
    if (!(await this.journalGate(d, key, willLower))) return;
    const r = applyConversation(d, key, {
      topicHit, goodTalk: get("good"), connectionHit: get("conn")
    });
    await this.commit(d, r);
  }

  async onRequestConv(key, body) {
    if (!key || !this.canWrite() || game.user.isGM) return;
    const box = body.querySelector(`.cv-conv-checks[data-virtue="${key}"]`);
    const get = (n) => !!box?.querySelector(`input[data-cv="${n}"]`)?.checked;
    const d = this.syncedDossier();
    const topicHit = get("dislike") ? "dislike" : (get("topic") ? "like" : null);
    const r = requestConversation(d, key, { topicHit, goodTalk: get("good"), connectionHit: get("conn") });
    if (await this.commit(d, r)) {
      relayNotifyGM({ fromUserId: game.user.id, label: fmt("cain-cardinal-virtuoso.req.notifyConv", { name: VIRTUES[key].name }) });
    }
  }

  async onSend(key, body) {
    if (!key || !this.canWrite()) return;
    const input = body.querySelector('input[name="msg"]');
    // Only the GM may speak as the Bond; players always post as themselves.
    const who = (game.user.isGM && body.querySelector('select[name="msgAs"]')?.value === "virtue") ? "virtue" : "op";
    const text = input?.value ?? "";
    const d = this.syncedDossier();
    const r = pushChat(d, key, who, text);
    if (!r.ok) return;
    if (input) input.value = "";   // cleared before refresh so it isn't restored
    await setDossier(this.targetUser, d);
    await this.refresh();
  }

  async onEndMission() {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = this.syncedDossier();

    // Preview the irreversible effects before mutating, so the user can bail out.
    const rankUps = [];
    const breaks = [];
    for (const [vkey, slot] of Object.entries(d.virtues)) {
      if (slot.pendingBreak) { breaks.push(VIRTUES[vkey].name); continue; }
      if (!slot.bonded) continue;
      const q = qualifiedRank(slot, vkey);
      if (q > slot.rank) rankUps.push(`${VIRTUES[vkey].name} → Bond ${q}`);
    }
    const haul = contrabandHaul(d);
    const parts = [];
    if (rankUps.length)
      parts.push(`<p><b>${loc("cain-cardinal-virtuoso.confirm.endMissionRankups")}</b><br>${rankUps.join("<br>")}</p>`);
    if (breaks.length)
      parts.push(`<p><b>${loc("cain-cardinal-virtuoso.confirm.endMissionBreaks")}</b><br>${breaks.join(", ")}</p>`);
    if (!rankUps.length && !breaks.length)
      parts.push(`<p>${loc("cain-cardinal-virtuoso.confirm.endMissionNone")}</p>`);
    parts.push(`<p>${loc("cain-cardinal-virtuoso.confirm.endMissionHaul")} +${haul}</p>`);
    parts.push(`<p>${fmt("cain-cardinal-virtuoso.confirm.endMissionAsk", { mission: d.mission, next: d.mission + 1 })}</p>`);
    const ok = await foundryConfirm(parts.join(""));
    if (!ok) return;

    const { ups, haul: collected } = endMission(d);
    await setDossier(this.targetUser, d);
    await this.syncActorBonds(d);
    ui.notifications.info(ups.length
      ? `Mission closed. Rank-ups: ${ups.join(", ")}. Haul +${collected}.`
      : `Mission closed. No rank-ups. Haul +${collected}.`);
    await this.refresh();
  }

  async onTimeOff() {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = this.syncedDossier();
    await this.commit(d, timeOff(d));
  }

  async onSaveHQ(body) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = this.syncedDossier();
    const codename = body.querySelector('input[name="codename"]')?.value;
    if (codename != null) d.codename = codename;
    // Balance levers are GM-only: players may only set their codename.
    if (game.user.isGM) {
      d.x2mod = !!body.querySelector('input[name="x2mod"]')?.checked;
      d.gateUser = !!body.querySelector('input[name="gateUser"]')?.checked;
      const num = (name, max, cur) => {
        const n = parseInt(body.querySelector(`input[name="${name}"]`)?.value ?? cur, 10);
        return Math.max(0, Math.min(max, isNaN(n) ? 0 : n));
      };
      d.covert = num("covert", 9, d.covert);
      d.cat = num("cat", 9, d.cat);
      d.hqStock = num("hqStock", RULES.contraband.hqCap, d.hqStock);
    }
    await this.commit(d, { ok: true, msg: "HQ console saved." });
  }

  async onSaveTracker(key, body) {
    if (!game.user.isGM) return ui.notifications.warn(loc("cain-cardinal-virtuoso.track.noClearance"));
    if (!key) return;
    const num = (r) => parseInt(body.querySelector(`input[name="req-${key}-${r}"]`)?.value, 10);
    await setVirtueRankReq(key, { 1: num(1), 2: num(2), 3: num(3) });
    ui.notifications.info(fmt("cain-cardinal-virtuoso.track.saved", { name: VIRTUES[key].name }));
    await this.refresh();
  }

  async onToggleAchievement(key, on) {
    if (!game.user.isGM) return ui.notifications.warn(loc("cain-cardinal-virtuoso.ach.noClearance"));
    if (!key) return;
    const d = this.syncedDossier();
    await this.commit(d, setAchievement(d, key, !!on));
  }

  async onResetDossier() {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    const ok = await foundryConfirm("Wipe this dossier? This cannot be undone.");
    if (!ok) return;
    await this.commit(blankDossier(), { ok: true, msg: "Dossier wiped." });
  }
}
