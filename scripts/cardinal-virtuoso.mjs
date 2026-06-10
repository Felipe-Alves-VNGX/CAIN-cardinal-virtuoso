import { VIRTUES, RULES } from "./data.mjs";

const MOD = "cain-cardinal-virtuoso";
const FLAG = "dossier";

/* ----------------------------------------------------------------------------
 * STATE MODEL
 * Persisted per-user as a flag on the User document:
 *   user.flags["cain-cardinal-virtuoso"].dossier = { codename, mission, virtues:{...} }
 * Each virtue slot: { bonded, affinity, rank, brokenCount, convUsed, contraUsed }
 * Admin (GM) reads/writes any user's flag; a player reads/writes only their own.
 * -------------------------------------------------------------------------- */

function blankSlot() {
  return { bonded: false, affinity: 0, rank: 0, brokenCount: 0, convUsed: 0, contraUsed: 0 };
}

function blankDossier() {
  const virtues = {};
  for (const k of Object.keys(VIRTUES)) virtues[k] = blankSlot();
  return { codename: "", mission: 1, x2mod: false, hqStock: 0, virtues };
}

export function getDossier(user) {
  const raw = user.getFlag(MOD, FLAG);
  if (!raw) return blankDossier();
  // backfill any new virtue keys
  const d = foundry.utils.deepClone(raw);
  d.virtues ??= {};
  for (const k of Object.keys(VIRTUES)) d.virtues[k] ??= blankSlot();
  return d;
}

export async function setDossier(user, dossier) {
  return user.setFlag(MOD, FLAG, dossier);
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

/* ----------------------------------------------------------------------------
 * MUTATIONS — return { ok, msg } and mutate the dossier in place.
 * -------------------------------------------------------------------------- */

export function applyConversation(d, vkey, { topicHit, goodTalk, connectionHit }) {
  const slot = d.virtues[vkey];
  if (!slot.bonded) return { ok: false, msg: "Not bonded yet." };
  if (slot.convUsed >= convCap(d)) return { ok: false, msg: `Conversation limit reached (${convCap(d)}/mission).` };
  let delta = 0;
  if (topicHit === "like") delta += RULES.conv.topic;
  if (topicHit === "dislike") delta += RULES.conv.dislike;
  if (goodTalk) delta += RULES.conv.goodTalk;
  if (connectionHit) delta += RULES.conv.connection;
  slot.affinity += delta;
  slot.convUsed += 1;
  return finalize(slot, `Conversation: ${delta >= 0 ? "+" : ""}${delta} affinity.`);
}

export function applyContraband(d, vkey, kind) {
  const slot = d.virtues[vkey];
  const isHate = kind === "hatemail";
  if (!slot.bonded && !isHate) return { ok: false, msg: "Not bonded (only hate-mail allowed)." };
  if (!isHate && slot.contraUsed >= contraCap(d))
    return { ok: false, msg: `Contraband limit reached (${contraCap(d)}/mission).` };
  let delta = 0;
  switch (kind) {
    case "favorite": delta = RULES.contraband.favorite; break;
    case "like": delta = RULES.contraband.like; break;
    case "dislike": delta = RULES.contraband.dislike; break;
    case "neutral": delta = RULES.contraband.neutral; break;
    case "hatemail": delta = Math.min(0, RULES.contraband.dislike); break; // only ever down
  }
  slot.affinity += delta;
  if (!isHate) slot.contraUsed += 1;
  return finalize(slot, `Contraband (${kind}): ${delta >= 0 ? "+" : ""}${delta} affinity.`);
}

function finalize(slot, msg) {
  let extra = "";
  if (slot.affinity <= RULES.brokenAt) {
    slot.brokenCount += 1;
    slot.affinity = 0;
    slot.rank = 0;
    extra = ` ⚠ BOND BROKEN — reset to 0, requirements +${RULES.brokenPenalty}.`;
  }
  return { ok: true, msg: msg + extra };
}

/* End of mission: apply rank-ups (affinity must meet requirement) and reset counters. */
export function endMission(d) {
  const ups = [];
  for (const [vkey, slot] of Object.entries(d.virtues)) {
    if (!slot.bonded) continue;
    const q = qualifiedRank(slot);
    if (q > slot.rank) { ups.push(`${VIRTUES[vkey].name} → Bond ${q}`); slot.rank = q; }
    slot.convUsed = 0;
    slot.contraUsed = 0;
  }
  d.mission += 1;
  return ups;
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
      broken: slot.affinity <= RULES.brokenAt
    };
  });
  return {
    isGM, user: { id: user.id, name: user.name },
    codename: d.codename, mission: d.mission, x2mod: d.x2mod, hqStock: d.hqStock,
    convCap: convCap(d), contraCap: contraCap(d),
    virtues
  };
}

let CardinalApp;

if (AppV2 && Handlebars2) {
  CardinalApp = class extends Handlebars2(AppV2) {
    static DEFAULT_OPTIONS = {
      id: "cain-cardinal-virtuoso-app",
      classes: ["cv-app"],
      tag: "div",
      window: { title: "CARDINAL VIRTUOSO // SEER-TEMERITY", resizable: true, icon: "fa-solid fa-cross" },
      position: { width: 720, height: 760 },
      actions: {
        toggleBond: CardinalApp_onToggleBond,
        conv: CardinalApp_onConv,
        contra: CardinalApp_onContra,
        endMission: CardinalApp_onEndMission,
        saveMeta: CardinalApp_onSaveMeta,
        reset: CardinalApp_onReset,
        pickUser: CardinalApp_onPickUser
      }
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
      root.querySelectorAll("[data-action]").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "click";
        el.addEventListener(evt, ev => {
          const a = el.dataset.action;
          const map = { toggleBond: CardinalApp_onToggleBond, conv: CardinalApp_onConv,
            contra: CardinalApp_onContra, endMission: CardinalApp_onEndMission,
            saveMeta: CardinalApp_onSaveMeta, reset: CardinalApp_onReset, pickUser: CardinalApp_onPickUser };
          map[a]?.call(this, ev, el);
        });
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

/* ---- action handlers ---- */
async function CardinalApp_onToggleBond(ev, target) {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const vkey = target.dataset.virtue;
  const d = getDossier(this.targetUser);
  d.virtues[vkey].bonded = !d.virtues[vkey].bonded;
  await persist(this, d, `${VIRTUES[vkey].name}: bond ${d.virtues[vkey].bonded ? "established" : "severed"}.`);
}
async function CardinalApp_onConv(ev, target) {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const vkey = target.dataset.virtue;
  const root = this.element?.[0] ?? this.element;
  const box = root.querySelector(`.cv-conv-checks[data-virtue="${vkey}"]`);
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
async function CardinalApp_onEndMission() {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const d = getDossier(this.targetUser);
  const ups = endMission(d);
  await persist(this, d, ups.length ? `Mission closed. Rank-ups: ${ups.join(", ")}` : "Mission closed. No rank-ups.");
}
async function CardinalApp_onSaveMeta(ev, target) {
  if (!canWrite(this)) return ui.notifications.warn("No clearance.");
  const root = this.element?.[0] ?? this.element; // jQuery (legacy) or HTMLElement (v2)
  const d = getDossier(this.targetUser);
  d.codename = root.querySelector('[name="codename"]')?.value ?? d.codename;
  d.x2mod = root.querySelector('[name="x2mod"]')?.checked ?? d.x2mod;
  const hq = parseInt(root.querySelector('[name="hqStock"]')?.value ?? d.hqStock, 10);
  d.hqStock = Math.max(0, Math.min(RULES.contraband.hqCap, isNaN(hq) ? 0 : hq));
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
Hooks.once("init", () => {
  Handlebars.registerHelper("gt", (a, b) => Number(a) > Number(b));
  game.settings.register(MOD, "rankReq", {
    name: "Affinity requirements per rank (I,II,III)",
    hint: "Comma-separated minimum affinity for ranks I, II, III. Default 3,8,15.",
    scope: "world", config: true, type: String, default: "3,8,15",
    onChange: v => {
      const p = String(v).split(",").map(n => parseInt(n.trim(), 10));
      if (p.length === 3 && p.every(n => !isNaN(n))) { RULES.rankReq = { 1: p[0], 2: p[1], 3: p[2] }; }
    }
  });
  const p = String(game.settings.settings.get(`${MOD}.rankReq`)?.default ?? "3,8,15").split(",").map(n => parseInt(n, 10));
  if (p.length === 3) RULES.rankReq = { 1: p[0], 2: p[1], 3: p[2] };
});

Hooks.once("ready", () => {
  const stored = game.settings.get(MOD, "rankReq");
  const p = String(stored).split(",").map(n => parseInt(n.trim(), 10));
  if (p.length === 3 && p.every(n => !isNaN(n))) RULES.rankReq = { 1: p[0], 2: p[1], 3: p[2] };
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
