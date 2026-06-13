/* ----------------------------------------------------------------------------
 * KIM — "Kinda Important Messages" chat client (Warframe-1999 / MSN style).
 * Renders the affinity tracker as faithful chat windows INSIDE the desktop
 * shell, driven by a WindowManager. The rules layer (cardinal-virtuoso.mjs) is
 * reused unchanged — KIM is only a view + controller.
 * -------------------------------------------------------------------------- */
import { VIRTUES, RANK_FLAVOR, RULES } from "./data.mjs";
import {
  getDossier, setDossier, wirePortraits,
  applyConversation, applyContraband, applyQuirk, applyAdjustment,
  toggleBond, endMission, timeOff, pushChat,
  rankRequirement, qualifiedRank, bondedCount, bondSlotsAllowed,
  contrabandHaul, blankDossier, foundryConfirm
} from "./cardinal-virtuoso.mjs";

const MOD = "cain-cardinal-virtuoso";
const T   = (name) => `modules/${MOD}/templates/${name}`;

function renderTpl(path, data) {
  const fn = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
  return fn(path, data);
}

function portraitPath(key, v) {
  return `modules/${MOD}/${v.portrait || `img/virtues/${key}.webp`}`;
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

/* Match a CAIN bond item name (e.g. "Charity") to a module virtue key. */
function virtueKeyByName(name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return Object.keys(VIRTUES).find(k => VIRTUES[k].name.toLowerCase() === n) ?? null;
}

/* The compendium Item id that a CAIN bond entry's bondId points at. */
function bondSourceId(item) {
  const src = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? "";
  return String(src).split(".").pop();
}

/* Read a linked CAIN character actor's started bonds → { virtueKey: currentLevel }.
   CAIN stores levels in actor.system.bonds[{bondId, currentLevel}]; each bondId
   resolves to an embedded `bond` item whose name maps to one of our virtues. */
function actorBondLevels(actor) {
  const out = {};
  const bonds = actor?.system?.bonds;
  if (!Array.isArray(bonds)) return out;
  const items = Array.from(actor.items ?? []).filter(it => it.type === "bond");
  for (const b of bonds) {
    const item = items.find(it => bondSourceId(it) === b.bondId)
      ?? items.find(it => virtueKeyByName(it.name));
    const key = item ? virtueKeyByName(item.name) : null;
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
  }

  teardown() {
    if (this._onUpdateUser) Hooks.off("updateUser", this._onUpdateUser);
    if (this._onUpdateActor) Hooks.off("updateActor", this._onUpdateActor);
    this._onUpdateUser = null;
    this._onUpdateActor = null;
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

  /* KIM is authoritative: push each virtue's current rank to the linked CAIN
     character's bond currentLevel, so the sheet edits itself as bonds grow. */
  async syncActorBonds(d) {
    const actor = this.targetActor;
    const bonds = actor?.system?.bonds;
    if (!Array.isArray(bonds) || !bonds.length) return;
    const items = Array.from(actor.items ?? []).filter(it => it.type === "bond");
    let changed = false;
    const next = bonds.map(b => {
      const item = items.find(it => bondSourceId(it) === b.bondId);
      const key = item ? virtueKeyByName(item.name) : null;
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
    const d = getDossier(this.targetUser);
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
        reqNext: slot.bonded && slot.rank < 3 ? rankRequirement(slot, slot.rank + 1) : null
      };
    });
    const ctx = {
      me: { name: this.targetUser.name, avatar: this.targetUser.avatar },
      isGM: game.user.isGM, canWrite: this.canWrite(),
      mission: d.mission, codename: d.codename, hqStock: d.hqStock, x2mod: d.x2mod,
      bondsUsed: bondedCount(d), bondsAllowed: bondSlotsAllowed(d),
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
    const d = getDossier(this.targetUser);
    const v = VIRTUES[key];
    const { bondedKeys } = this.bondInfo();
    const slot = bondedKeys.has(key) ? { ...d.virtues[key], bonded: true } : d.virtues[key];
    const st = relStatus(slot);
    return {
      key, name: v.name, epithet: v.epithet, glyph: v.glyph, portrait: portraitPath(key, v),
      status: st.label, statusClass: st.cls, rankFlavor: RANK_FLAVOR[slot.rank] ?? "",
      bonded: slot.bonded, broken: slot.pendingBreak, affinity: slot.affinity, rank: slot.rank,
      reqNext: slot.rank < 3 ? rankRequirement(slot, slot.rank + 1) : null,
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
    const d = getDossier(this.targetUser);
    const { bondedKeys } = this.bondInfo();
    const cap = contraCap(d);
    const contacts = this.visibleEntries(bondedKeys).map(([key, v]) => {
      const slot = bondedKeys.has(key) ? { ...d.virtues[key], bonded: true } : d.virtues[key];
      return {
        key, name: v.name, status: relStatus(slot).label, bonded: slot.bonded,
        used: slot.contraUsed, selected: key === selectedKey
      };
    });
    return {
      canWrite: this.canWrite(),
      hqStock: d.hqStock, hqCap: RULES.contraband.hqCap, cap,
      contacts,
      drops: [...d.log].reverse().filter(l => l.includes("Contraband")).slice(0, 12)
    };
  }

  hqCtx() {
    const d = getDossier(this.targetUser);
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
    const d = getDossier(this.targetUser);
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
      canWrite: this.canWrite(), convUsed: slot.convUsed, convCap: convCap(d)
    };
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

  /* ── re-render every open KIM window after a state change ── */
  async refresh() {
    for (const id of [...this._open]) {
      if (!this.wm.has(id)) { this._open.delete(id); continue; }
      if (id === "kim-contacts") {
        this.wm.setHtml(id, await renderTpl(T("kim-contacts.hbs"), this.contactsCtx()), (b) => this.wireContacts(b));
      } else if (id.startsWith("kim-profile-")) {
        const key = id.slice("kim-profile-".length);
        this.wm.setHtml(id, await renderTpl(T("kim-profile.hbs"), this.profileCtx(key)), (b) => this.wireProfile(b));
      } else if (id === "kim-hq") {
        this.wm.setHtml(id, await renderTpl(T("kim-hq.hbs"), this.hqCtx()), (b) => this.wireHQ(b));
      } else if (id === "kim-contraband") {
        const body = this.wm.bodyEl(id);
        const selKey = body?.querySelector('select[name="dropVirtue"]')?.value;
        const selKind = body?.querySelector('select[name="dropKind"]')?.value;
        this.wm.setHtml(id, await renderTpl(T("kim-contraband.hbs"), this.contrabandCtx(selKey)), (b) => {
          const kindSel = b.querySelector('select[name="dropKind"]');
          if (kindSel && selKind) kindSel.value = selKind;
          this.wireContraband(b);
        });
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
      openDrop:   () => this.openContraband(),
      openHQ:     () => this.openHQ(),
      endMission: () => this.onEndMission(),
      timeOff:    () => this.onTimeOff()
    });
  }

  wireContraband(body) {
    this._delegate(body, {
      drop: (ev, el, b) => this.onDrop(b)
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
      adjust:      (ev, el, b) => this.onAdjust(el.dataset.virtue, b),
      openProfile: (ev, el) => this.openProfile(el.dataset.virtue)
    });
  }

  wireConv(body) {
    this._delegate(body, {
      send:        (ev, el, b) => this.onSend(el.dataset.virtue, b),
      conv:        (ev, el, b) => this.onConv(el.dataset.virtue, b),
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
    const d = getDossier(this.targetUser);
    const r = toggleBond(d, key, {
      isGM: game.user.isGM,
      enforcePacing: game.settings.get(MOD, "enforcePacing")
    });
    await this.commit(d, r);
  }

  async onDrop(body) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const key = body.querySelector('select[name="dropVirtue"]')?.value;
    const kind = body.querySelector('select[name="dropKind"]')?.value;
    if (!key || !kind) return;
    const d = getDossier(this.targetUser);
    await this.commit(d, applyContraband(d, key, kind));
  }

  async onQuirk(key, qIndex) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = getDossier(this.targetUser);
    await this.commit(d, applyQuirk(d, key, qIndex));
  }

  async onAdjust(key, body) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    const delta = parseInt(body.querySelector(`input[name="adj-${key}"]`)?.value, 10) || 0;
    const d = getDossier(this.targetUser);
    await this.commit(d, applyAdjustment(d, key, delta));
  }

  async onConv(key, body) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const box = body.querySelector(`.cv-conv-checks[data-virtue="${key}"]`);
    const get = (n) => !!box?.querySelector(`input[data-cv="${n}"]`)?.checked;
    const d = getDossier(this.targetUser);
    const r = applyConversation(d, key, {
      topicHit: get("dislike") ? "dislike" : (get("topic") ? "like" : null),
      goodTalk: get("good"), connectionHit: get("conn")
    });
    await this.commit(d, r);
  }

  async onSend(key, body) {
    if (!key || !this.canWrite()) return;
    const input = body.querySelector('input[name="msg"]');
    const who = body.querySelector('select[name="msgAs"]')?.value === "virtue" ? "virtue" : "op";
    const text = input?.value ?? "";
    const d = getDossier(this.targetUser);
    const r = pushChat(d, key, who, text);
    if (!r.ok) return;
    if (input) input.value = "";   // cleared before refresh so it isn't restored
    await setDossier(this.targetUser, d);
    await this.refresh();
  }

  async onEndMission() {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = getDossier(this.targetUser);

    // Preview the irreversible effects before mutating, so the user can bail out.
    const rankUps = [];
    const breaks = [];
    for (const [vkey, slot] of Object.entries(d.virtues)) {
      if (slot.pendingBreak) { breaks.push(VIRTUES[vkey].name); continue; }
      if (!slot.bonded) continue;
      const q = qualifiedRank(slot);
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
    const d = getDossier(this.targetUser);
    await this.commit(d, timeOff(d));
  }

  async onSaveHQ(body) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = getDossier(this.targetUser);
    const codename = body.querySelector('input[name="codename"]')?.value;
    if (codename != null) d.codename = codename;
    d.x2mod = !!body.querySelector('input[name="x2mod"]')?.checked;
    d.gateUser = !!body.querySelector('input[name="gateUser"]')?.checked;
    const num = (name, max, cur) => {
      const n = parseInt(body.querySelector(`input[name="${name}"]`)?.value ?? cur, 10);
      return Math.max(0, Math.min(max, isNaN(n) ? 0 : n));
    };
    d.covert = num("covert", 9, d.covert);
    d.cat = num("cat", 9, d.cat);
    d.hqStock = num("hqStock", RULES.contraband.hqCap, d.hqStock);
    await this.commit(d, { ok: true, msg: "HQ console saved." });
  }

  async onResetDossier() {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const ok = await foundryConfirm("Wipe this dossier? This cannot be undone.");
    if (!ok) return;
    await this.commit(blankDossier(), { ok: true, msg: "Dossier wiped." });
  }
}
