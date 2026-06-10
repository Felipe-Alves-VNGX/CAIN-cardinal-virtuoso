import { VIRTUES, RULES, RANK_FLAVOR } from "./data.mjs";

const MOD = "cain-cardinal-virtuoso";
const FLAG = "dossier";

/* ----------------------------------------------------------------------------
 * STATE MODEL
 * Persisted per-user as a flag on the User document:
 *   user.flags["cain-cardinal-virtuoso"].dossier = { codename, mission, virtues:{...} }
 * Each virtue slot: { bonded, affinity, rank, brokenCount, pendingBreak,
 *                     convUsed, contraUsed, quirkUses }
 * Admin (GM) reads/writes any user's flag; a player reads/writes only their own.
 * -------------------------------------------------------------------------- */

function blankSlot() {
  return {
    bonded: false, affinity: 0, rank: 0, brokenCount: 0, pendingBreak: false,
    convUsed: 0, contraUsed: 0, quirkUses: {}
  };
}

function blankDossier() {
  const virtues = {};
  for (const k of Object.keys(VIRTUES)) virtues[k] = blankSlot();
  return {
    codename: "", mission: 1, x2mod: false, gateUser: false,
    covert: 0, cat: 0, hqStock: 0, extraBonds: 0, log: [], virtues
  };
}

export function getDossier(user) {
  const raw = user.getFlag(MOD, FLAG);
  if (!raw) return blankDossier();
  // backfill any fields added after the dossier was first written
  const d = foundry.utils.mergeObject(blankDossier(), foundry.utils.deepClone(raw));
  for (const k of Object.keys(VIRTUES)) {
    d.virtues[k] = foundry.utils.mergeObject(blankSlot(), d.virtues[k] ?? {});
  }
  return d;
}

export async function setDossier(user, dossier) {
  return user.setFlag(MOD, FLAG, dossier);
}

function pushLog(d, msg) {
  d.log.push(`[M${d.mission}] ${msg}`);
  if (d.log.length > RULES.logMax) d.log.splice(0, d.log.length - RULES.logMax);
}

/* Effective minimum affinity for a rank, including broken-bond penalties. */
export function rankRequirement(slot, rank) {
  const base = RULES.rankReq[rank] ?? Infinity;
  return base + (slot.brokenCount ?? 0) * RULES.brokenPenalty;
}

/* Highest rank the current affinity qualifies for (does not auto-apply). */
export function qualifiedRank(slot) {
  let r = 0;
  for (const rank of [1, 2, 3]) if (slot.affinity >= rankRequirement(slot, rank)) r = rank;
  return r;
}

function convCap(d) { return d.x2mod ? RULES.conv.perMissionX2 : RULES.conv.perMission; }
function contraCap(d) { return d.x2mod ? RULES.contraband.perMissionX2 : RULES.contraband.perMission; }

/* Contraband collected when a mission closes: covert + ½CAT (min 2), +1 for Gate users. */
export function contrabandHaul(d) {
  const base = Math.max(RULES.contraband.haulMin, (d.covert | 0) + Math.floor((d.cat | 0) / 2));
  return base + (d.gateUser ? 1 : 0);
}

/* Bond pacing: 1 virtue after the first completed mission, +1 per mission (+ time-off bonuses). */
export function bondSlotsAllowed(d) {
  return Math.max(0, (d.mission | 0) - 1) + (d.extraBonds | 0);
}
export function bondedCount(d) {
  return Object.values(d.virtues).filter(s => s.bonded).length;
}

/* ----------------------------------------------------------------------------
 * MUTATIONS — return { ok, msg } and mutate the dossier in place.
 * -------------------------------------------------------------------------- */

function slotLocked(slot) {
  if (!slot.bonded) return "Not bonded yet.";
  if (slot.pendingBreak) return "Heart Break — bond shatters when the mission closes.";
  return null;
}

export function applyConversation(d, vkey, { topicHit, goodTalk, connectionHit }) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  if (slot.convUsed >= convCap(d)) return { ok: false, msg: `Conversation limit reached (${convCap(d)}/mission).` };
  let delta = 0;
  if (topicHit === "like") delta += RULES.conv.topic;
  if (topicHit === "dislike") delta += RULES.conv.dislike;
  if (goodTalk) delta += RULES.conv.goodTalk;
  if (connectionHit) delta += RULES.conv.connection;
  slot.affinity += delta;
  slot.convUsed += 1;
  return finalize(d, vkey, `${VIRTUES[vkey].name} — Conversation: ${delta >= 0 ? "+" : ""}${delta} affinity.`);
}

export function applyContraband(d, vkey, kind) {
  const slot = d.virtues[vkey];
  const isHate = kind === "hatemail";
  if (!slot.bonded && !isHate) return { ok: false, msg: "Not bonded (only hate-mail allowed)." };
  if (slot.pendingBreak) return { ok: false, msg: "Heart Break — bond shatters when the mission closes." };
  if (!isHate && slot.contraUsed >= contraCap(d))
    return { ok: false, msg: `Contraband limit reached (${contraCap(d)}/mission).` };
  if (d.hqStock <= 0) return { ok: false, msg: "No contraband in HQ stock." };
  let delta = 0;
  switch (kind) {
    case "favorite": delta = RULES.contraband.favorite; break;
    case "like": delta = RULES.contraband.like; break;
    case "dislike": delta = RULES.contraband.dislike; break;
    case "neutral": delta = RULES.contraband.neutral; break;
    case "hatemail": delta = Math.min(0, RULES.contraband.dislike); break; // only ever down
  }
  slot.affinity += delta;
  d.hqStock -= 1;
  if (!isHate) slot.contraUsed += 1;
  return finalize(d, vkey, `${VIRTUES[vkey].name} — Contraband (${kind}): ${delta >= 0 ? "+" : ""}${delta} affinity.`);
}

export function applyQuirk(d, vkey, qIndex) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  const quirk = VIRTUES[vkey].quirks?.[qIndex];
  if (!quirk) return { ok: false, msg: "Unknown quirk." };
  const used = slot.quirkUses[qIndex] ?? 0;
  if (quirk.perMission && used >= quirk.perMission)
    return { ok: false, msg: `Quirk limit reached (${quirk.perMission}/mission).` };
  slot.affinity += quirk.delta;
  slot.quirkUses[qIndex] = used + 1;
  return finalize(d, vkey, `${VIRTUES[vkey].name} — Quirk "${quirk.label}": ${quirk.delta >= 0 ? "+" : ""}${quirk.delta} affinity.`);
}

/* Admin-only free adjustment (table rulings, undocumented quirks). */
export function applyAdjustment(d, vkey, delta) {
  const slot = d.virtues[vkey];
  if (!slot.bonded) return { ok: false, msg: "Not bonded yet." };
  if (!delta) return { ok: false, msg: "Adjustment is 0." };
  slot.affinity += delta;
  return finalize(d, vkey, `${VIRTUES[vkey].name} — Admin adjustment: ${delta >= 0 ? "+" : ""}${delta} affinity.`);
}

/* Bonding/upgrading a virtue makes its rivals (or fans) react. */
function reactToBond(d, changedKey, why) {
  const notes = [];
  for (const [vkey, slot] of Object.entries(d.virtues)) {
    if (vkey === changedKey || !slot.bonded || slot.pendingBreak) continue;
    const reactions = VIRTUES[vkey].bondReactions ?? {};
    const delta = reactions[changedKey] ?? reactions["*"];
    if (!delta) continue;
    slot.affinity += delta;
    const r = finalize(d, vkey,
      `${VIRTUES[vkey].name} reacts to your ${why} with ${VIRTUES[changedKey].name}: ${delta >= 0 ? "+" : ""}${delta} affinity.`);
    notes.push(r.msg);
  }
  return notes;
}

export function toggleBond(d, vkey, { isGM = false, enforcePacing = true } = {}) {
  const slot = d.virtues[vkey];
  if (slot.pendingBreak) return { ok: false, msg: "Heart Break — wait for the mission to close before re-linking." };
  if (slot.bonded) {
    slot.bonded = false;
    pushLog(d, `${VIRTUES[vkey].name}: bond severed.`);
    return { ok: true, msg: `${VIRTUES[vkey].name}: bond severed.` };
  }
  if (enforcePacing && !isGM && bondedCount(d) >= bondSlotsAllowed(d)) {
    return {
      ok: false,
      msg: `No bond slots available (${bondedCount(d)}/${bondSlotsAllowed(d)}). Complete a mission (or take time off) to link a new virtue.`
    };
  }
  slot.bonded = true;
  pushLog(d, `${VIRTUES[vkey].name}: bond established.`);
  const notes = reactToBond(d, vkey, "new bond");
  return { ok: true, msg: [`${VIRTUES[vkey].name}: bond established.`, ...notes].join(" ") };
}

function finalize(d, vkey, msg) {
  const slot = d.virtues[vkey];
  let extra = "";
  if (!slot.pendingBreak && slot.affinity <= RULES.brokenAt && slot.bonded) {
    slot.pendingBreak = true;
    slot.brokenCount += 1;
    extra = ` 💔 HEART BREAK — bond shatters at mission close; requirements +${RULES.brokenPenalty}.`;
  }
  pushLog(d, msg + extra);
  return { ok: true, msg: msg + extra };
}

/* Shared by endMission/timeOff: apply earned rank-ups and their bond reactions. */
function applyRankUps(d) {
  const ups = [];
  for (const [vkey, slot] of Object.entries(d.virtues)) {
    if (!slot.bonded || slot.pendingBreak) continue;
    const q = qualifiedRank(slot);
    if (q > slot.rank) { slot.rank = q; ups.push(vkey); pushLog(d, `${VIRTUES[vkey].name} → Bond ${q}.`); }
  }
  for (const vkey of ups) reactToBond(d, vkey, "bond upgrade");
  return ups;
}

function resetCounters(d) {
  for (const slot of Object.values(d.virtues)) {
    slot.convUsed = 0;
    slot.contraUsed = 0;
    slot.quirkUses = {};
  }
}

/* End of mission: rank-ups, broken-bond cleanup, contraband haul, counter reset. */
export function endMission(d) {
  const ups = applyRankUps(d);
  for (const [vkey, slot] of Object.entries(d.virtues)) {
    if (!slot.pendingBreak) continue;
    slot.pendingBreak = false;
    slot.bonded = false;
    slot.affinity = 0;
    slot.rank = 0;
    pushLog(d, `${VIRTUES[vkey].name}: broken bond cleared — may be re-linked from scratch.`);
  }
  resetCounters(d);
  const haul = contrabandHaul(d);
  const stored = Math.min(RULES.contraband.hqCap, d.hqStock + haul);
  pushLog(d, `Mission ${d.mission} closed. Contraband haul +${haul} (stock ${stored}/${RULES.contraband.hqCap}).`);
  d.hqStock = stored;
  d.mission += 1;
  return { ups: ups.map(k => `${VIRTUES[k].name} → Bond ${d.virtues[k].rank}`), haul };
}

/* X2 mod downtime: rank-ups + counter reset + an extra bond slot, without closing a mission. */
export function timeOff(d) {
  if (!d.x2mod) return { ok: false, msg: "Time off requires the X2 Text Speed Mod." };
  const ups = applyRankUps(d);
  resetCounters(d);
  d.extraBonds = (d.extraBonds | 0) + 1;
  pushLog(d, `Time off taken: limits reset, +1 bond slot.`);
  return {
    ok: true,
    msg: ups.length
      ? `Time off: rank-ups — ${ups.map(k => `${VIRTUES[k].name} → Bond ${d.virtues[k].rank}`).join(", ")}. +1 bond slot.`
      : "Time off: limits reset, +1 bond slot. No rank-ups."
  };
}

/* ----------------------------------------------------------------------------
 * APPLICATION (ApplicationV2 when available, else legacy Application)
 * -------------------------------------------------------------------------- */

const AppV2 = foundry.applications?.api?.ApplicationV2;
const Handlebars2 = foundry.applications?.api?.HandlebarsApplicationMixin;

function buildContext(user, isGM) {
  const d = getDossier(user);
  const virtues = Object.entries(VIRTUES).map(([key, v]) => {
    const slot = d.virtues[key];
    return {
      key, ...v,
      ...slot,
      reqNext: slot.rank < 3 ? rankRequirement(slot, slot.rank + 1) : null,
      qualified: qualifiedRank(slot),
      bondText: v.bonds[slot.rank] ?? "",
      rankFlavor: RANK_FLAVOR[slot.rank] ?? "",
      broken: slot.pendingBreak,
      quirks: (v.quirks ?? []).map((q, i) => ({
        ...q, index: i,
        deltaStr: `${q.delta >= 0 ? "+" : ""}${q.delta}`,
        good: q.delta >= 0,
        used: slot.quirkUses[i] ?? 0
      }))
    };
  });
  return {
    isGM, user: { id: user.id, name: user.name },
    codename: d.codename, mission: d.mission, x2mod: d.x2mod, gateUser: d.gateUser,
    covert: d.covert, cat: d.cat, hqStock: d.hqStock,
    convCap: convCap(d), contraCap: contraCap(d),
    bondsUsed: bondedCount(d), bondsAllowed: bondSlotsAllowed(d),
    nextHaul: contrabandHaul(d),
    log: [...d.log].reverse(),
    virtues
  };
}

let CardinalApp;

const ACTIONS = () => ({
  toggleBond: CardinalApp_onToggleBond,
  conv: CardinalApp_onConv,
  contra: CardinalApp_onContra,
  quirk: CardinalApp_onQuirk,
  adjust: CardinalApp_onAdjust,
  endMission: CardinalApp_onEndMission,
  timeOff: CardinalApp_onTimeOff,
  saveMeta: CardinalApp_onSaveMeta,
  reset: CardinalApp_onReset,
  pickUser: CardinalApp_onPickUser
});

if (AppV2 && Handlebars2) {
  CardinalApp = class extends Handlebars2(AppV2) {
    static DEFAULT_OPTIONS = {
      id: "cain-cardinal-virtuoso-app",
      classes: ["cv-app"],
      tag: "div",
      window: { title: "CARDINAL VIRTUOSO // SEER-TEMERITY", resizable: true, icon: "fa-solid fa-cross" },
      position: { width: 720, height: 760 },
      actions: ACTIONS()
    };
    static PARTS = { body: { template: `modules/${MOD}/templates/dossier.hbs` } };

    constructor(options = {}) {
      super(options);
      this.targetUserId = options.targetUserId ?? game.user.id;
    }
    get targetUser() { return game.users.get(this.targetUserId) ?? game.user; }

    async _prepareContext() {
      const ctx = buildContext(this.targetUser, game.user.isGM);
      if (game.user.isGM) {
        ctx.allUsers = game.users.filter(u => !u.isGM).map(u => ({
          id: u.id, name: u.name, active: u.active, selected: u.id === this.targetUserId
        }));
      }
      return ctx;
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const root = this.element;
      const sel = root.querySelector('[data-action="pickUser"]');
      if (sel) sel.addEventListener("change", (ev) => CardinalApp_onPickUser.call(this, ev, ev.currentTarget));
    }
  };
} else {
  // Legacy fallback (v11/early v12)
  CardinalApp = class extends Application {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "cain-cardinal-virtuoso-app",
        classes: ["cv-app"],
        title: "CARDINAL VIRTUOSO // SEER-TEMERITY",
        template: `modules/${MOD}/templates/dossier.hbs`,
        width: 720, height: 760, resizable: true
      });
    }
    constructor(options = {}) { super(options); this.targetUserId = options.targetUserId ?? game.user.id; }
    get targetUser() { return game.users.get(this.targetUserId) ?? game.user; }
    getData() {
      const ctx = buildContext(this.targetUser, game.user.isGM);
      if (game.user.isGM) ctx.allUsers = game.users.filter(u => !u.isGM)
        .map(u => ({ id: u.id, name: u.name, active: u.active, selected: u.id === this.targetUserId }));
      return ctx;
    }
    activateListeners(html) {
      super.activateListeners(html);
      const root = html[0] ?? html;
      const map = ACTIONS();
      root.querySelectorAll("[data-action]").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "click";
        el.addEventListener(evt, ev => map[el.dataset.action]?.call(this, ev, el));
      });
    }
  };
}

/* shared permission guard: can the current user write the target's dossier? */
function canWrite(app) {
  return game.user.isGM || app.targetUserId === game.user.id;
}
async function persist(app, dossier, note) {
  await setDossier(app.targetUser, dossier);
  if (note) ui.notifications.info(note);
  app.render(false);
}
function appRoot(app) { return app.element?.[0] ?? app.element; }

/* ---- action handlers ---- */
async function CardinalApp_onToggleBond(ev, target) {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const vkey = target.dataset.virtue;
  const d = getDossier(this.targetUser);
  const r = toggleBond(d, vkey, {
    isGM: game.user.isGM,
    enforcePacing: game.settings.get(MOD, "enforcePacing")
  });
  if (!r.ok) return ui.notifications.warn(r.msg);
  await persist(this, d, r.msg);
}
async function CardinalApp_onConv(ev, target) {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const vkey = target.dataset.virtue;
  const box = appRoot(this).querySelector(`.cv-conv-checks[data-virtue="${vkey}"]`);
  const get = (n) => !!box?.querySelector(`input[data-cv="${n}"]`)?.checked;
  const topicLike = get("topic"), topicDislike = get("dislike");
  const d = getDossier(this.targetUser);
  const r = applyConversation(d, vkey, {
    topicHit: topicDislike ? "dislike" : (topicLike ? "like" : null),
    goodTalk: get("good"), connectionHit: get("conn")
  });
  if (!r.ok) return ui.notifications.warn(r.msg);
  await persist(this, d, r.msg);
}
async function CardinalApp_onContra(ev, target) {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const vkey = target.dataset.virtue;
  const d = getDossier(this.targetUser);
  const r = applyContraband(d, vkey, target.dataset.kind);
  if (!r.ok) return ui.notifications.warn(r.msg);
  await persist(this, d, r.msg);
}
async function CardinalApp_onQuirk(ev, target) {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const vkey = target.dataset.virtue;
  const d = getDossier(this.targetUser);
  const r = applyQuirk(d, vkey, Number(target.dataset.q));
  if (!r.ok) return ui.notifications.warn(r.msg);
  await persist(this, d, r.msg);
}
async function CardinalApp_onAdjust(ev, target) {
  if (!game.user.isGM) return ui.notifications.warn("No clearance.");
  const vkey = target.dataset.virtue;
  const input = appRoot(this).querySelector(`input[name="adj-${vkey}"]`);
  const delta = parseInt(input?.value, 10) || 0;
  const d = getDossier(this.targetUser);
  const r = applyAdjustment(d, vkey, delta);
  if (!r.ok) return ui.notifications.warn(r.msg);
  await persist(this, d, r.msg);
}
async function CardinalApp_onEndMission() {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const d = getDossier(this.targetUser);
  const { ups, haul } = endMission(d);
  const note = ups.length
    ? `Mission closed. Rank-ups: ${ups.join(", ")}. Contraband haul +${haul}.`
    : `Mission closed. No rank-ups. Contraband haul +${haul}.`;
  await persist(this, d, note);
}
async function CardinalApp_onTimeOff() {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const d = getDossier(this.targetUser);
  const r = timeOff(d);
  if (!r.ok) return ui.notifications.warn(r.msg);
  await persist(this, d, r.msg);
}
async function CardinalApp_onSaveMeta(ev, target) {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const root = appRoot(this);
  const d = getDossier(this.targetUser);
  d.codename = root.querySelector('[name="codename"]')?.value ?? d.codename;
  d.x2mod = root.querySelector('[name="x2mod"]')?.checked ?? d.x2mod;
  d.gateUser = root.querySelector('[name="gateUser"]')?.checked ?? d.gateUser;
  const num = (name, max, cur) => {
    const n = parseInt(root.querySelector(`[name="${name}"]`)?.value ?? cur, 10);
    return Math.max(0, Math.min(max, isNaN(n) ? 0 : n));
  };
  d.covert = num("covert", 9, d.covert);
  d.cat = num("cat", 9, d.cat);
  d.hqStock = num("hqStock", RULES.contraband.hqCap, d.hqStock);
  await persist(this, d, "Dossier metadata saved.");
}
async function CardinalApp_onReset() {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const ok = await foundryConfirm("Wipe this dossier? This cannot be undone.");
  if (!ok) return;
  await persist(this, blankDossier(), "Dossier wiped.");
}
async function CardinalApp_onPickUser(ev, target) {
  if (!game.user.isGM) return;
  this.targetUserId = target.value;
  this.render(false);
}

async function foundryConfirm(content) {
  const D = foundry.applications?.api?.DialogV2;
  if (D) return D.confirm({ window: { title: "Confirm" }, content });
  return Dialog.confirm({ title: "Confirm", content });
}

/* ----------------------------------------------------------------------------
 * REGISTRATION
 * -------------------------------------------------------------------------- */
function parseRankReq(v) {
  const p = String(v).split(",").map(n => parseInt(n.trim(), 10));
  if (p.length === 3 && p.every(n => !isNaN(n))) RULES.rankReq = { 1: p[0], 2: p[1], 3: p[2] };
}

Hooks.once("init", () => {
  Handlebars.registerHelper("gt", (a, b) => Number(a) > Number(b));
  game.settings.register(MOD, "rankReq", {
    name: "Affinity requirements per rank (I,II,III)",
    hint: "Comma-separated minimum affinity for Bond I, II, III. Harpocrates Dossier default: 5,10,18.",
    scope: "world", config: true, type: String, default: "5,10,18",
    onChange: parseRankReq
  });
  game.settings.register(MOD, "enforcePacing", {
    name: "Enforce bond pacing",
    hint: "Players may only link 1 new virtue per completed mission (plus time-off bonuses). GMs always bypass this.",
    scope: "world", config: true, type: Boolean, default: true
  });
});

Hooks.once("ready", () => {
  parseRankReq(game.settings.get(MOD, "rankReq"));
  game.cainCardinalVirtuoso = {
    open: (userId) => new CardinalApp({ targetUserId: userId ?? game.user.id }).render(true)
  };
  console.log(`${MOD} | ready`);
});

// Scene-controls button (compatible with v11–v14 control shapes)
Hooks.on("getSceneControlButtons", (controls) => {
  const tool = {
    name: "cardinal-virtuoso", title: "Cardinal Virtuoso", icon: "fa-solid fa-cross",
    button: true, visible: true,
    onClick: () => game.cainCardinalVirtuoso.open(),
    onChange: () => game.cainCardinalVirtuoso.open()
  };
  // v13+ controls is an object keyed by name; older is an array
  if (Array.isArray(controls)) {
    const token = controls.find(c => c.name === "token");
    (token?.tools ?? []).push(tool);
  } else {
    const token = controls.token ?? Object.values(controls)[0];
    if (token) { token.tools ??= {}; token.tools["cardinal-virtuoso"] = tool; }
  }
});

export { CardinalApp };
