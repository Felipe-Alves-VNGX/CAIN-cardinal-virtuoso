import { VIRTUES, RULES, GIFTS, ACHIEVEMENTS, GOOD_ENDING_REWARDS } from "./data.mjs";

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
    convUsed: 0, contraUsed: 0, quirkUses: {}, chat: [],
    missionLoss: 0, // total affinity lost this mission (for "The Fumbler")
    // Gift-granted buffs. apology: loss shield (−2 first, −1 after) until
    // apologyExpiresMission closes. page: ignore one disliked topic + note +1D.
    // journal: warn before the first affinity-lowering action each mission.
    buffs: {
      apology: false, apologyUsed: false, apologyExpiresMission: 0,
      page: false, journal: false, journalWarnedThisMission: false
    }
  };
}

export function blankDossier() {
  const virtues = {};
  for (const k of Object.keys(VIRTUES)) virtues[k] = blankSlot();
  return {
    codename: "", mission: 1, x2mod: false, gateUser: false,
    covert: 0, cat: 0, hqStock: 0, extraBonds: 0, log: [], virtues,
    achievements: {}, // key → true once unlocked (auto-detected or GM-toggled)
    soloMissions: 0,  // consecutive completed missions with no active bond
    // Contraband the player has sent but the GM hasn't scored yet. Each entry:
    // { id, vkey, item, glyph, ts }. Affinity is applied only when the GM scores it.
    contrabandQueue: [],
    // Requests the player sent for the GM to approve (Conversation/Quirk). Each:
    // { id, kind, vkey, payload, ts }. Affinity is applied only on approval.
    requestQueue: []
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

/* Per-virtue affinity requirement overrides (GM-configured via the Tracker
   window, persisted in the world setting "rankReqByVirtue"). Shape:
   { justice: { 1: 5, 2: 10, 3: 18 }, ... }. Missing entries fall back to the
   global RULES.rankReq. */
let RANK_REQ_BY_VIRTUE = {};
export function getRankReqByVirtue() { return RANK_REQ_BY_VIRTUE; }
/* Base (pre-broken-penalty) minimum affinity for a rank, honoring per-virtue overrides. */
export function baseRankReq(rank, vkey) {
  return RANK_REQ_BY_VIRTUE[vkey]?.[rank] ?? RULES.rankReq[rank] ?? Infinity;
}
export async function setVirtueRankReq(vkey, trip) {
  const clean = {};
  for (const rank of [1, 2, 3]) {
    const n = Number(trip?.[rank]);
    if (Number.isFinite(n) && n > 0) clean[rank] = Math.round(n);
  }
  RANK_REQ_BY_VIRTUE = { ...RANK_REQ_BY_VIRTUE, [vkey]: clean };
  try { await game.settings.set(MOD, "rankReqByVirtue", RANK_REQ_BY_VIRTUE); }
  catch (e) { console.warn(`${MOD} | could not persist per-virtue rank reqs`, e); }
}

/* Effective minimum affinity for a rank, including broken-bond penalties.
   Pass vkey to honor per-virtue overrides; without it, the global tuning applies. */
export function rankRequirement(slot, rank, vkey) {
  return baseRankReq(rank, vkey) + (slot.brokenCount ?? 0) * RULES.brokenPenalty;
}

/* Highest rank the current affinity qualifies for (does not auto-apply). */
export function qualifiedRank(slot, vkey) {
  let r = 0;
  for (const rank of [1, 2, 3]) if (slot.affinity >= rankRequirement(slot, rank, vkey)) r = rank;
  return r;
}

/* ----------------------------------------------------------------------------
 * ACHIEVEMENTS — "Special <3" endings. Auto detectors read dossier state; once
 * an achievement is unlocked it sticks (stored in d.achievements), so a later
 * broken bond or counter reset can't revoke it.
 * -------------------------------------------------------------------------- */
function autoUnlocked(d, code) {
  const rank = (k) => d.virtues[k]?.rank | 0;
  switch (code) {
    case "heartBreaker": return Object.values(d.virtues).filter(s => (s.brokenCount | 0) > 0).length >= 4;
    case "fumbler":      return Object.values(d.virtues).some(s => (s.missionLoss | 0) >= 15);
    case "hunter":       return (d.soloMissions | 0) >= 5;
    case "besoDeTres":   return (rank("sobriety") >= 3 && rank("prudence") >= 3) || (rank("chastity") >= 3 && rank("faith") >= 3);
    default:
      if (code?.startsWith("bond3:")) return rank(code.slice(6)) >= 3;
      return false;
  }
}

/* Fold any newly-satisfied auto achievements into the dossier (idempotent). */
export function refreshAchievements(d) {
  d.achievements ??= {};
  for (const a of ACHIEVEMENTS) {
    if (a.auto && autoUnlocked(d, a.auto)) d.achievements[a.key] = true;
  }
  return d.achievements;
}

/* GM toggle for subjective achievements (and overrides). */
export function setAchievement(d, key, on) {
  if (!ACHIEVEMENTS.some(a => a.key === key)) return { ok: false, msg: "Unknown achievement." };
  d.achievements ??= {};
  if (on) d.achievements[key] = true; else delete d.achievements[key];
  const a = ACHIEVEMENTS.find(a => a.key === key);
  pushLog(d, `Achievement ${on ? "unlocked" : "cleared"}: ${a.name}.`);
  return { ok: true, msg: `${a.name}: ${on ? "unlocked" : "cleared"}.` };
}

/* Reward tier reached for a given Good Ending Point total (or null). */
export function goodEndingTier(points) {
  let tier = null;
  for (const r of GOOD_ENDING_REWARDS) if (points >= r.points) tier = r;
  return tier;
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

/* Apology Note shield: when active, soften an affinity loss — by 2 the first
   time, by 1 on later losses within the buff window. Mutates the slot's buff
   state. No-op on gains or when no apology buff is active. */
function withShield(slot, delta) {
  if (delta >= 0 || !slot.buffs?.apology) return delta;
  const reduction = slot.buffs.apologyUsed ? 1 : 2;
  slot.buffs.apologyUsed = true;
  return -Math.max(0, -delta - reduction);
}

/* Pure outcome scoring for a Conversation: returns { delta, note } honoring the
   Page-of-One-liners buff (consumes it on a disliked topic) and the Apology
   shield. Does NOT touch convUsed or affinity — callers apply and finalize. */
function convDelta(slot, { topicHit, goodTalk, connectionHit }) {
  let delta = 0, note = "";
  if (topicHit === "like") delta += RULES.conv.topic;
  if (topicHit === "dislike") {
    if (slot.buffs?.page) { slot.buffs.page = false; note = " (Page of One-liners: disliked-topic penalty ignored, +1D)"; }
    else delta += RULES.conv.dislike;
  }
  if (goodTalk) delta += RULES.conv.goodTalk;
  if (connectionHit) delta += RULES.conv.connection;
  return { delta: withShield(slot, delta), note };
}

export function applyConversation(d, vkey, outcome) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  if (slot.convUsed >= convCap(d)) return { ok: false, msg: `Conversation limit reached (${convCap(d)}/mission).` };
  const { delta, note } = convDelta(slot, outcome);
  slot.affinity += delta;
  if (delta < 0) slot.missionLoss = (slot.missionLoss | 0) - delta;
  slot.convUsed += 1;
  return finalize(d, vkey, `${VIRTUES[vkey].name} — Conversation: ${delta >= 0 ? "+" : ""}${delta} affinity.${note}`);
}

/* Standard contraband category → affinity delta. */
const CONTRA_DELTA = {
  favorite: () => RULES.contraband.favorite,
  like:     () => RULES.contraband.like,
  neutral:  () => RULES.contraband.neutral,
  dislike:  () => RULES.contraband.dislike
};

/* Player action: queue an inventory item as contraband for a bonded virtue.
   Spends an HQ stock unit and a per-mission contraband slot, but applies NO
   affinity — the GM scores it later from the review window. */
export function sendContraband(d, vkey, item, glyph = "") {
  const slot = d.virtues[vkey];
  if (!slot?.bonded) return { ok: false, msg: "Not bonded yet." };
  if (slot.pendingBreak) return { ok: false, msg: "Heart Break — bond shatters when the mission closes." };
  if (slot.contraUsed >= contraCap(d))
    return { ok: false, msg: `Contraband limit reached (${contraCap(d)}/mission).` };
  if (d.hqStock <= 0) return { ok: false, msg: "No contraband in HQ stock." };
  const name = String(item ?? "").trim();
  if (!name) return { ok: false, msg: "No item selected." };
  d.hqStock -= 1;
  slot.contraUsed += 1;
  d.contrabandQueue ??= [];
  const id = `cq-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  d.contrabandQueue.push({ id, vkey, item: name, glyph: String(glyph ?? ""), ts: Date.now() });
  pushLog(d, `${VIRTUES[vkey].name} — Contraband sent: "${name}" (awaiting HQ review).`);
  return { ok: true, msg: `Sent "${name}" to ${VIRTUES[vkey].name}. Awaiting HQ review.`, id };
}

/* GM action: score a queued contraband entry. Pass a numeric `value` for a free
   adjustment, or a `kind` for the standard FAV/LIKE/NEUTRAL/DISLIKE delta.
   Applies affinity (loss softened by an active Apology Note), then dequeues. */
export function scoreContraband(d, entryId, { kind, value } = {}) {
  d.contrabandQueue ??= [];
  const idx = d.contrabandQueue.findIndex(e => e.id === entryId);
  if (idx < 0) return { ok: false, msg: "Contraband entry not found." };
  const entry = d.contrabandQueue[idx];
  const slot = d.virtues[entry.vkey];
  if (!slot) { d.contrabandQueue.splice(idx, 1); return { ok: false, msg: "Recipient no longer exists." }; }
  let delta = Number(value);
  if (!Number.isFinite(delta)) delta = CONTRA_DELTA[kind]?.() ?? 0;
  delta = withShield(slot, Math.round(delta));
  slot.affinity += delta;
  if (delta < 0) slot.missionLoss = (slot.missionLoss | 0) - delta;
  d.contrabandQueue.splice(idx, 1);
  return finalize(d, entry.vkey,
    `${VIRTUES[entry.vkey].name} — Contraband "${entry.item}" scored: ${delta >= 0 ? "+" : ""}${delta} affinity.`);
}

/* GM action: drop a queued contraband entry without scoring it. */
export function discardContraband(d, entryId) {
  d.contrabandQueue ??= [];
  const idx = d.contrabandQueue.findIndex(e => e.id === entryId);
  if (idx < 0) return { ok: false, msg: "Contraband entry not found." };
  const entry = d.contrabandQueue.splice(idx, 1)[0];
  const who = VIRTUES[entry.vkey] ? `${VIRTUES[entry.vkey].name} — ` : "";
  pushLog(d, `${who}Contraband "${entry.item}" discarded by HQ.`);
  return { ok: true, msg: `Discarded "${entry.item}".` };
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
  const qd = withShield(slot, quirk.delta);
  slot.affinity += qd;
  if (qd < 0) slot.missionLoss = (slot.missionLoss | 0) - qd;
  slot.quirkUses[qIndex] = used + 1;
  return finalize(d, vkey, `${VIRTUES[vkey].name} — Quirk "${quirk.label}": ${qd >= 0 ? "+" : ""}${qd} affinity.`);
}

/* ----------------------------------------------------------------------------
 * REQUEST RELAY — player enqueues, GM approves. Spends the per-mission slot at
 * request time (like sendContraband); deny refunds it; approve scores it.
 * -------------------------------------------------------------------------- */
function newReqId() { return `rq-${Date.now()}-${Math.floor(Math.random() * 1e4)}`; }

/* Player: request a Conversation outcome. Validates like applyConversation but
   applies NO affinity — spends the slot and queues for GM approval. */
export function requestConversation(d, vkey, outcome) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  if (slot.convUsed >= convCap(d)) return { ok: false, msg: `Conversation limit reached (${convCap(d)}/mission).` };
  slot.convUsed += 1;
  d.requestQueue ??= [];
  const id = newReqId();
  d.requestQueue.push({ id, kind: "conversation", vkey, payload: { ...outcome }, ts: Date.now() });
  pushLog(d, `${VIRTUES[vkey].name} — Conversation requested (awaiting HQ approval).`);
  return { ok: true, msg: `Conversation with ${VIRTUES[vkey].name} sent for HQ approval.`, id };
}

/* Player: request a Quirk. Validates like applyQuirk; spends the per-mission use. */
export function requestQuirk(d, vkey, qIndex) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  const quirk = VIRTUES[vkey]?.quirks?.[qIndex];
  if (!quirk) return { ok: false, msg: "Unknown quirk." };
  const used = slot.quirkUses[qIndex] ?? 0;
  if (quirk.perMission && used >= quirk.perMission)
    return { ok: false, msg: `Quirk limit reached (${quirk.perMission}/mission).` };
  slot.quirkUses[qIndex] = used + 1;
  d.requestQueue ??= [];
  const id = newReqId();
  d.requestQueue.push({ id, kind: "quirk", vkey, payload: { qIndex }, ts: Date.now() });
  pushLog(d, `${VIRTUES[vkey].name} — Quirk "${quirk.label}" requested (awaiting HQ approval).`);
  return { ok: true, msg: `Quirk "${quirk.label}" sent for HQ approval.`, id };
}

/* GM: approve a queued request — applies affinity reusing the scoring logic,
   WITHOUT re-spending the slot (already spent at request time), then dequeues. */
export function approveRequest(d, reqId) {
  d.requestQueue ??= [];
  const idx = d.requestQueue.findIndex(r => r.id === reqId);
  if (idx < 0) return { ok: false, msg: "Request not found." };
  const req = d.requestQueue[idx];
  const slot = d.virtues[req.vkey];
  if (!slot) { d.requestQueue.splice(idx, 1); return { ok: false, msg: "Recipient no longer exists." }; }
  d.requestQueue.splice(idx, 1);
  if (req.kind === "conversation") {
    const { delta, note } = convDelta(slot, req.payload ?? {});
    slot.affinity += delta;
    if (delta < 0) slot.missionLoss = (slot.missionLoss | 0) - delta;
    return finalize(d, req.vkey, `${VIRTUES[req.vkey].name} — Conversation approved: ${delta >= 0 ? "+" : ""}${delta} affinity.${note}`);
  }
  if (req.kind === "quirk") {
    const quirk = VIRTUES[req.vkey]?.quirks?.[req.payload?.qIndex];
    if (!quirk) return { ok: false, msg: "Quirk no longer exists." };
    const qd = withShield(slot, quirk.delta);
    slot.affinity += qd;
    if (qd < 0) slot.missionLoss = (slot.missionLoss | 0) - qd;
    return finalize(d, req.vkey, `${VIRTUES[req.vkey].name} — Quirk "${quirk.label}" approved: ${qd >= 0 ? "+" : ""}${qd} affinity.`);
  }
  return { ok: false, msg: "Unknown request kind." };
}

/* GM: deny a queued request — refunds the spent slot and dequeues. */
export function denyRequest(d, reqId) {
  d.requestQueue ??= [];
  const idx = d.requestQueue.findIndex(r => r.id === reqId);
  if (idx < 0) return { ok: false, msg: "Request not found." };
  const req = d.requestQueue.splice(idx, 1)[0];
  const slot = d.virtues[req.vkey];
  if (slot) {
    if (req.kind === "conversation") slot.convUsed = Math.max(0, (slot.convUsed | 0) - 1);
    if (req.kind === "quirk") {
      const qi = req.payload?.qIndex;
      slot.quirkUses[qi] = Math.max(0, (slot.quirkUses[qi] | 0) - 1);
    }
  }
  const who = VIRTUES[req.vkey]?.name ?? req.vkey;
  pushLog(d, `${who} — ${req.kind} request denied by HQ (slot refunded).`);
  return { ok: true, msg: `${req.kind} request denied.` };
}

/* Admin-only free adjustment (table rulings, undocumented quirks). */
export function applyAdjustment(d, vkey, delta) {
  const slot = d.virtues[vkey];
  if (!slot.bonded) return { ok: false, msg: "Not bonded yet." };
  if (!delta) return { ok: false, msg: "Adjustment is 0." };
  slot.affinity += delta;
  return finalize(d, vkey, `${VIRTUES[vkey].name} — Admin adjustment: ${delta >= 0 ? "+" : ""}${delta} affinity.`);
}

/* Apply a contraband gift's effect to a bonded virtue. `fresh` flags the
   12h-from-deployment bonus on the Heated Blanket. Returns { ok, msg }. */
export function applyGift(d, vkey, giftKey, { fresh = false } = {}) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  const gift = GIFTS[giftKey];
  if (!gift) return { ok: false, msg: "Unknown gift." };
  const eff = gift.effect ?? {};
  switch (eff.kind) {
    case "flat": {
      const delta = (eff.base | 0) + (fresh ? (eff.freshBonus | 0) : 0);
      slot.affinity += delta;
      return finalize(d, vkey, `${VIRTUES[vkey].name} — ${gift.name}: +${delta} affinity.`);
    }
    case "rankOrPlus": {
      const q = qualifiedRank(slot, vkey);
      if (q > slot.rank) {
        slot.rank = q;
        pushLog(d, `${VIRTUES[vkey].name} → Bond ${q} (via ${gift.name}).`);
        const notes = reactToBond(d, vkey, "bond upgrade");
        return { ok: true, msg: [`${VIRTUES[vkey].name} — ${gift.name}: Bond ↑ ${q}.`, ...notes].join(" ") };
      }
      slot.affinity += (eff.plus | 0);
      return finalize(d, vkey, `${VIRTUES[vkey].name} — ${gift.name}: +${eff.plus | 0} affinity (bond minimum not met).`);
    }
    case "buffConversation":
      slot.buffs.page = true;
      pushLog(d, `${VIRTUES[vkey].name} — ${gift.name} ready: next Meet-Up gets +1D and ignores a disliked topic.`);
      return { ok: true, msg: `${gift.name} ready for ${VIRTUES[vkey].name}: next Meet-Up gets +1D and ignores a disliked topic.` };
    case "buffApology":
      slot.buffs.apology = true;
      slot.buffs.apologyUsed = false;
      slot.buffs.apologyExpiresMission = d.mission + 1;
      pushLog(d, `${VIRTUES[vkey].name} — ${gift.name} active: affinity losses softened (−2 then −1) through mission ${d.mission + 1}.`);
      return { ok: true, msg: `${gift.name} active for ${VIRTUES[vkey].name}: affinity losses softened (−2 then −1).` };
    case "buffJournal":
      slot.buffs.journal = true;
      pushLog(d, `${VIRTUES[vkey].name} — ${gift.name} active: warning before the first affinity-lowering action each mission.`);
      return { ok: true, msg: `${gift.name} active for ${VIRTUES[vkey].name}: warning before the first affinity-lowering action each mission.` };
    default:
      return { ok: false, msg: "Gift has no defined effect." };
  }
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
    const q = qualifiedRank(slot, vkey);
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
    slot.missionLoss = 0;
    if (slot.buffs) slot.buffs.journalWarnedThisMission = false;
  }
}

/* End of mission: rank-ups, broken-bond cleanup, contraband haul, counter reset. */
export function endMission(d) {
  const hadBond = Object.values(d.virtues).some(s => s.bonded || s.pendingBreak);
  const ups = applyRankUps(d);
  // Evaluate while ranks are at their peak and counters (missionLoss, brokenCount) are intact.
  refreshAchievements(d);
  for (const [vkey, slot] of Object.entries(d.virtues)) {
    if (!slot.pendingBreak) continue;
    slot.pendingBreak = false;
    slot.bonded = false;
    slot.affinity = 0;
    slot.rank = 0;
    pushLog(d, `${VIRTUES[vkey].name}: broken bond cleared — may be re-linked from scratch.`);
  }
  resetCounters(d);
  d.soloMissions = hadBond ? 0 : (d.soloMissions | 0) + 1;
  const haul = contrabandHaul(d);
  const stored = Math.min(RULES.contraband.hqCap, d.hqStock + haul);
  pushLog(d, `Mission ${d.mission} closed. Contraband haul +${haul} (stock ${stored}/${RULES.contraband.hqCap}).`);
  d.hqStock = stored;
  d.mission += 1;
  // Apology shields lapse once their window (current + next mission) has passed.
  for (const slot of Object.values(d.virtues)) {
    if (slot.buffs?.apology && slot.buffs.apologyExpiresMission < d.mission) {
      slot.buffs.apology = false;
      slot.buffs.apologyUsed = false;
    }
  }
  refreshAchievements(d); // catches "Nothing Loves the Hunter" once soloMissions ticks up
  return { ups: ups.map(k => `${VIRTUES[k].name} → Bond ${d.virtues[k].rank}`), haul };
}

/* X2 mod downtime: rank-ups + counter reset + an extra bond slot, without closing a mission. */
export function timeOff(d) {
  if (!d.x2mod) return { ok: false, msg: "Time off requires the X2 Text Speed Mod." };
  const ups = applyRankUps(d);
  refreshAchievements(d);
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

/* GM-only: ensure a world Item compendium holding the 6 contraband gifts exists
   and is populated. Each gift carries flags["cain-cardinal-virtuoso"].gift = key
   so the Dead Drop can map it back to its automated effect. Idempotent: creates
   the pack once, fills it only while empty, so dragging gifts onto a sheet works
   out of the box. */
export async function ensureGiftCompendium() {
  if (!game.user.isGM) return;
  const name = `${MOD}-gifts`;
  const collId = `world.${name}`;
  try {
    const CC = foundry.documents?.collections?.CompendiumCollection ?? CompendiumCollection;
    let pack = game.packs.get(collId);
    if (!pack) {
      pack = await CC.createCompendium({
        type: "Item", label: "Cardinal Virtuoso — Gifts", name, package: "world"
      });
    }
    const idx = pack.index?.size ? pack.index : await pack.getIndex();
    if ((idx?.size ?? 0) > 0) return;
    const docs = Object.entries(GIFTS).map(([key, g]) => ({
      name: g.name, type: "item", img: "systems/cain/assets/items/kp.png",
      system: {
        description: `<p>${g.desc}</p>`, quantity: 1, weight: 0,
        roll: { diceNum: 1, diceSize: "d6", diceBonus: "" },
        kitPoint: 0, scripValue: g.cost, type: "Contraband",
        primaryColor: "#2a2a2a", accentColor: "#aa0000",
        secondaryColor: "#555555", textColor: "#ffffff"
      },
      flags: { [MOD]: { gift: key } }
    }));
    await Item.createDocuments(docs, { pack: collId });
    console.log(`${MOD} | gift compendium populated (${docs.length} items)`);
  } catch (e) {
    console.warn(`${MOD} | could not create/populate gift compendium`, e);
  }
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
  // Per-virtue affinity tracker overrides — edited in the KIM Tracker window, not here.
  game.settings.register(MOD, "rankReqByVirtue", {
    scope: "world", config: false, type: Object, default: {}
  });
});

Hooks.once("ready", () => {
  parseRankReq(game.settings.get(MOD, "rankReq"));
  RANK_REQ_BY_VIRTUE = game.settings.get(MOD, "rankReqByVirtue") || {};
  game.cainCardinalVirtuoso ??= {};
  // Legacy macro entry point now opens the KIM desktop (the standalone grid was retired in 1.4).
  game.cainCardinalVirtuoso.open = () => game.cainCardinalVirtuoso.openDesktop?.();
  game.cainCardinalVirtuoso.installGifts = ensureGiftCompendium;
  ensureGiftCompendium();
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
