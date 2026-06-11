import { CardinalApp, buildContext, ACTIONS } from "./cardinal-virtuoso.mjs";

const MOD    = "cain-cardinal-virtuoso";
const AppV2  = foundry.applications?.api?.ApplicationV2;
const HbsMix = foundry.applications?.api?.HandlebarsApplicationMixin;

function clockStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderTpl(path, data) {
  const fn = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
  return fn(path, data);
}

/* ── shared instance methods (mixed into both class variants) ── */
const _deskMethods = {
  _rootEl() { return this.element?.[0] ?? this.element; },
  _desk()   { return this._rootEl()?.querySelector(".cv-desktop"); },

  _dismissBoot() {
    if (this._booted) return;
    this._booted = true;
    const el = this._rootEl()?.querySelector(".cv-boot");
    if (!el) return;
    el.classList.add("cv-boot-fade");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  },

  _toggleStart() {
    this._startOpen = !this._startOpen;
    const root = this._rootEl();
    const menu = root?.querySelector(".cv-start-menu");
    if (menu) menu.hidden = !this._startOpen;
    if (this._startOpen) {
      requestAnimationFrame(() => {
        const off = (e) => {
          if (!e.target.closest(".cv-start-menu, .cv-start-btn")) {
            this._startOpen = false;
            const m = this._rootEl()?.querySelector(".cv-start-menu");
            if (m) m.hidden = true;
          }
        };
        root?.addEventListener("click", off, { once: true });
      });
    }
  },

  _closeStart() {
    this._startOpen = false;
    const m = this._rootEl()?.querySelector(".cv-start-menu");
    if (m) m.hidden = true;
  },

  _startClock() {
    clearInterval(this._clockTimer);
    this._clockTimer = setInterval(() => {
      const el = this._rootEl()?.querySelector(".cv-clock");
      if (el) el.textContent = clockStr();
    }, 15000);
  },

  /* ── internal window manager (DOSSIER.EXE runs inside the desktop) ── */
  _zTop() { this._z = (this._z ?? 10) + 1; return String(this._z); },

  async _openDossierWin() {
    this._closeStart();
    if (this._dossierWin) {
      this._restoreWin(this._dossierWin);
      this._dossierWin.el.style.zIndex = this._zTop();
      return;
    }
    const desk = this._desk();
    if (!desk) return;
    const dw = desk.clientWidth, dh = desk.clientHeight;
    const w = Math.min(720, dw - 16), h = Math.min(600, dh - 12);
    const el = document.createElement("div");
    el.className = "cv-iwin";
    el.style.left = Math.max(8, Math.round((dw - w) / 2)) + "px";
    el.style.top = Math.max(4, Math.round((dh - h) / 3)) + "px";
    el.style.width = w + "px";
    el.style.height = h + "px";
    el.style.zIndex = this._zTop();
    desk.appendChild(el);
    const win = { id: "dossier", title: "DOSSIER.EXE", el, targetUserId: game.user.id, minimized: false, maxRect: null };
    this._dossierWin = win;
    el.addEventListener("pointerdown", () => { el.style.zIndex = this._zTop(); });
    await this._renderDossier(win);
    this._refreshTaskbar();
  },

  async _renderDossier(win) {
    const user = game.users.get(win.targetUserId) ?? game.user;
    const ctx = buildContext(user, game.user.isGM);
    if (game.user.isGM) {
      ctx.allUsers = game.users.filter(u => !u.isGM).map(u => ({
        id: u.id, name: u.name, active: u.active, selected: u.id === win.targetUserId
      }));
    }
    win.el.innerHTML = await renderTpl(`modules/${MOD}/templates/dossier.hbs`, ctx);
    this._wireDossier(win);
  },

  _wireDossier(win) {
    const self = this;
    // adapter so the dossier action handlers (which expect a CardinalApp-like
    // `this`) work against the internal window instead of a Foundry app
    const adapter = {
      get targetUserId() { return win.targetUserId; },
      set targetUserId(v) { win.targetUserId = v; },
      get targetUser() { return game.users.get(win.targetUserId) ?? game.user; },
      get element() { return win.el; },
      render: () => self._renderDossier(win)
    };
    const map = ACTIONS();
    win.el.querySelectorAll("[data-action]").forEach(el => {
      const evt = el.tagName === "SELECT" ? "change" : "click";
      el.addEventListener(evt, ev => map[el.dataset.action]?.call(adapter, ev, el));
    });

    win.el.querySelector('[data-w="min"]')?.addEventListener("click", () => this._minimizeWin(win));
    win.el.querySelector('[data-w="max"]')?.addEventListener("click", () => this._maximizeWin(win));
    win.el.querySelector('[data-w="close"]')?.addEventListener("click", () => this._closeWin(win));

    const tb = win.el.querySelector(".cv-titlebar");
    tb?.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".cv-tbtn") || win.maxRect) return;
      ev.preventDefault();
      const desk = this._desk();
      const dr = desk.getBoundingClientRect();
      const wr = win.el.getBoundingClientRect();
      const ox = ev.clientX - wr.left, oy = ev.clientY - wr.top;
      const move = (e) => {
        let x = e.clientX - dr.left - ox;
        let y = e.clientY - dr.top - oy;
        x = Math.max(60 - wr.width, Math.min(x, dr.width - 60));
        y = Math.max(0, Math.min(y, dr.height - 30));
        win.el.style.left = x + "px";
        win.el.style.top = y + "px";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  },

  _minimizeWin(win) {
    win.minimized = true;
    win.el.style.display = "none";
    this._refreshTaskbar();
  },

  _restoreWin(win) {
    win.minimized = false;
    win.el.style.display = "";
    win.el.style.zIndex = this._zTop();
    this._refreshTaskbar();
  },

  _maximizeWin(win) {
    if (win.maxRect) {
      Object.assign(win.el.style, win.maxRect);
      win.maxRect = null;
    } else {
      win.maxRect = {
        left: win.el.style.left, top: win.el.style.top,
        width: win.el.style.width, height: win.el.style.height
      };
      Object.assign(win.el.style, { left: "0px", top: "0px", width: "100%", height: "100%" });
    }
  },

  _closeWin(win) {
    win.el.remove();
    if (this._dossierWin === win) this._dossierWin = null;
    this._refreshTaskbar();
  },

  _refreshTaskbar() {
    const tray = this._rootEl()?.querySelector(".cv-task-open");
    if (!tray) return;
    tray.innerHTML = "";
    for (const win of [this._dossierWin].filter(Boolean)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cv-task-btn" + (win.minimized ? "" : " cv-task-active");
      b.textContent = `✝ ${win.title}`;
      b.addEventListener("click", () =>
        win.minimized ? this._restoreWin(win) : this._minimizeWin(win));
      tray.appendChild(b);
    }
  }
};

/* ── action handlers ── */
function desk_openDossier() { this._openDossierWin(); }

function desk_openAbout() {
  this._closeStart();
  const version = game.modules.get(MOD)?.version ?? "?";
  const content = `<p style="font-family:monospace;font-size:12px;line-height:1.7;padding:4px 0">
    <b>CARDINAL VIRTUOSO v${version}</b><br>
    SEER//TEMERITY internal software<br>
    Fan-made Harpocrates Dossier tracker for CAIN TTRPG.<br><br>
    <i>Höllvania '99 Terminal Emulator</i>
  </p>`;
  const D = foundry.applications?.api?.DialogV2;
  if (D) D.prompt({ window: { title: "SEER.NFO" }, content });
  else Dialog.prompt({ title: "SEER.NFO", content });
}

function desk_toggleStart() { this._toggleStart(); }
function desk_shutDown()    { this.close(); }
function desk_bootDismiss() { this._dismissBoot(); }

const DESK_ACTIONS = () => ({
  openDossier: desk_openDossier,
  openAbout:   desk_openAbout,
  toggleStart: desk_toggleStart,
  shutDown:    desk_shutDown,
  bootDismiss: desk_bootDismiss
});

/* ── AppV2 variant ── */
let DesktopApp;

if (AppV2 && HbsMix) {
  DesktopApp = class extends HbsMix(AppV2) {
    static DEFAULT_OPTIONS = {
      id: "cain-desktop",
      classes: ["cv-desktop-shell"],
      tag: "div",
      window: {
        title: "SEER//TEMERITY — Höllvania '99",
        resizable: true,
        icon: "fa-solid fa-desktop"
      },
      position: { width: 960, height: 720 },
      actions: DESK_ACTIONS()
    };
    static PARTS = {
      shell: { template: `modules/${MOD}/templates/desktop.hbs` }
    };

    constructor(opts = {}) {
      super(opts);
      this._booted = false;
      this._startOpen = false;
      this._clockTimer = null;
      this._dossierWin = null;
    }

    async _prepareContext() {
      return {
        clock: clockStr(),
        booted: this._booted,
        version: game.modules.get(MOD)?.version ?? "?"
      };
    }

    _onRender(ctx, opts) {
      super._onRender?.(ctx, opts);
      this._startClock();
      this.element?.addEventListener("keydown", () => this._dismissBoot(), { once: true });
    }

    async close(opts) {
      clearInterval(this._clockTimer);
      this._dossierWin = null;
      return super.close(opts);
    }
  };
  Object.assign(DesktopApp.prototype, _deskMethods);

} else {
  /* ── Legacy (v11) variant ── */
  DesktopApp = class extends Application {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "cain-desktop",
        classes: ["cv-desktop-shell"],
        title: "SEER//TEMERITY — Höllvania '99",
        template: `modules/${MOD}/templates/desktop.hbs`,
        width: 960, height: 720, resizable: true
      });
    }

    constructor(opts = {}) {
      super(opts);
      this._booted = false;
      this._startOpen = false;
      this._clockTimer = null;
      this._dossierWin = null;
    }

    getData() {
      return {
        clock: clockStr(),
        booted: this._booted,
        version: game.modules.get(MOD)?.version ?? "?"
      };
    }

    activateListeners(html) {
      super.activateListeners(html);
      const root = html[0] ?? html;
      const map = DESK_ACTIONS();
      root.querySelectorAll("[data-action]").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "click";
        el.addEventListener(evt, ev => map[el.dataset.action]?.call(this, ev, el));
      });
      this._startClock();
      root.addEventListener("keydown", () => this._dismissBoot(), { once: true });
    }

    async close(opts) {
      clearInterval(this._clockTimer);
      this._dossierWin = null;
      return super.close(opts);
    }
  };
  Object.assign(DesktopApp.prototype, _deskMethods);
}

/* ── hooks ── */
Hooks.once("ready", () => {
  game.cainCardinalVirtuoso ??= {};
  game.cainCardinalVirtuoso.openDesktop = () => {
    const existing =
      foundry.applications?.instances?.get?.("cain-desktop") ??
      Object.values(ui.windows ?? {}).find(w => w.id === "cain-desktop");
    if (existing) { existing.bringToFront?.(); return; }
    new DesktopApp().render(true);
  };
});

export { DesktopApp };
