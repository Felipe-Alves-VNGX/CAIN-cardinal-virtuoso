import { VIRTUES, RULES } from "./data.mjs";

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
    convUsed: 0, contraUsed: 0, quirkUses: {}, chat: []
  };
}

export function blankDossier() {
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

/* Append a free-text chat line to a virtue's conversation history.
   who: "op" (the operative/player) or "virtue". Capped to RULES.logMax. */
export function pushChat(d, vkey, who, text) {
  const t = String(text ?? "").trim();
  if (!t) return { ok: false, msg: "Empty message." };
  const slot = d.virtues[vkey];
  slot.chat ??= [];
  slot.chat.push({ who, text: t, ts: Date.now() });
  if (slot.chat.length > RULES.logMax) slot.chat.splice(0, slot.chat.length - RULES.logMax);
  return { ok: true, msg: t };
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
 * VIEW HELPERS (shared with the KIM client)
 * -------------------------------------------------------------------------- */

/* Reveal each portrait only once its file actually loads; drop the <img> on
   error so the glyph placeholder shows through. Handles images already cached
   (complete) before listeners attach. */
export function wirePortraits(root) {
  root?.querySelectorAll("img.cv-portrait").forEach(img => {
    const show = () => img.classList.add("ok");
    const drop = () => img.remove();
    if (img.complete) return img.naturalWidth ? show() : drop();
    img.addEventListener("load", show);
    img.addEventListener("error", drop);
  });
}

export async function foundryConfirm(content) {
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
  game.cainCardinalVirtuoso ??= {};
  // Legacy macro entry point now opens the KIM desktop (the standalone grid was retired in 1.4).
  game.cainCardinalVirtuoso.open = () => game.cainCardinalVirtuoso.openDesktop?.();
  console.log(`${MOD} | ready`);
});

// Scene-controls button (compatible with v11–v14 control shapes)
Hooks.on("getSceneControlButtons", (controls) => {
  const tool = {
    name: "cardinal-virtuoso", title: "Cardinal Virtuoso", icon: "fa-solid fa-cross",
    button: true, visible: true,
    onClick: () => (game.cainCardinalVirtuoso.openDesktop ?? game.cainCardinalVirtuoso.open)(),
    onChange: () => (game.cainCardinalVirtuoso.openDesktop ?? game.cainCardinalVirtuoso.open)()
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
