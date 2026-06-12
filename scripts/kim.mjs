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
  rankRequirement, bondedCount, bondSlotsAllowed
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

/* bond state → relationship label shown like an MSN status. */
function relStatus(slot) {
  if (slot.pendingBreak) return { label: "💔 Heartbroken", cls: "broken" };
  if (!slot.bonded)      return { label: "Offline", cls: "off" };
  return [
    { label: "Acquaintance", cls: "r0" },
    { label: "Friendly",     cls: "r1" },
    { label: "Trusted",      cls: "r2" },
    { label: "Inseparable",  cls: "r3" }
  ][slot.rank] ?? { label: "Online", cls: "r0" };
}

function convCap(d) { return d.x2mod ? RULES.conv.perMissionX2 : RULES.conv.perMission; }

export class KimController {
  constructor(wm, targetUserId) {
    this.wm = wm;
    this.targetUserId = targetUserId ?? game.user.id;
    this._open = new Set();   // KIM window ids currently open
  }

  get targetUser() { return game.users.get(this.targetUserId) ?? game.user; }
  canWrite() { return game.user.isGM || this.targetUserId === game.user.id; }

  /* ── context builders ── */
  contactsCtx() {
    const d = getDossier(this.targetUser);
    const contacts = Object.entries(VIRTUES).map(([key, v]) => {
      const slot = d.virtues[key];
      const st = relStatus(slot);
      return {
        key, name: v.name, epithet: v.epithet, glyph: v.glyph,
        portrait: portraitPath(key, v),
        status: st.label, statusClass: st.cls,
        bonded: slot.bonded, broken: slot.pendingBreak
      };
    });
    const ctx = {
      me: { name: this.targetUser.name, avatar: this.targetUser.avatar },
      isGM: game.user.isGM, canWrite: this.canWrite(),
      mission: d.mission, codename: d.codename, hqStock: d.hqStock, x2mod: d.x2mod,
      bondsUsed: bondedCount(d), bondsAllowed: bondSlotsAllowed(d),
      contacts
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
    const slot = d.virtues[key];
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
      title: `${VIRTUES[key].name} — Profile`, icon: "▤", width: 340,
      html, onBody: (b) => this.wireProfile(b),
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
      saveMeta:   (ev, el, b) => this.onSaveMeta(b),
      endMission: () => this.onEndMission(),
      timeOff:    () => this.onTimeOff()
    });
  }

  wireProfile(body) {
    this._delegate(body, {
      toggleBond:  (ev, el) => this.onToggleBond(el.dataset.virtue),
      contra:      (ev, el) => this.onContra(el.dataset.virtue, el.dataset.kind),
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

  async onContra(key, kind) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
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
    const { ups, haul } = endMission(d);
    await setDossier(this.targetUser, d);
    ui.notifications.info(ups.length
      ? `Mission closed. Rank-ups: ${ups.join(", ")}. Haul +${haul}.`
      : `Mission closed. No rank-ups. Haul +${haul}.`);
    await this.refresh();
  }

  async onTimeOff() {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = getDossier(this.targetUser);
    await this.commit(d, timeOff(d));
  }

  async onSaveMeta(body) {
    if (!this.canWrite()) return ui.notifications.warn("No clearance.");
    const d = getDossier(this.targetUser);
    const v = body.querySelector('input[name="codename"]')?.value;
    if (v != null) d.codename = v;
    await this.commit(d, { ok: true, msg: "Codename saved." });
  }
}
