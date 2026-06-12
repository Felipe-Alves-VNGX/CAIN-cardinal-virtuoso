import { WindowManager } from "./winman.mjs";
import { KimController } from "./kim.mjs";

const MOD    = "cain-cardinal-virtuoso";
const AppV2  = foundry.applications?.api?.ApplicationV2;
const HbsMix = foundry.applications?.api?.HandlebarsApplicationMixin;

function clockStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ── shared instance methods (mixed into both class variants) ── */
const _deskMethods = {
  _rootEl() { return this.element?.[0] ?? this.element; },

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

  /* Build the internal window manager + KIM controller against the live DOM. */
  _initShell() {
    const root = this._rootEl();
    const host = root?.querySelector(".cv-desktop");
    const tray = root?.querySelector("#cv-task-open");
    if (!host || !tray) return;
    this._wm = new WindowManager(host, tray);
    this._kim = new KimController(this._wm, game.user.id);
  }
};

/* ── action handlers ── */
function desk_openDossier() {
  this._kim?.openContacts();
  this._closeStart();
}

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
      position: { width: 920, height: 680 },
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
      this._initShell();
      this.element?.addEventListener("keydown", () => this._dismissBoot(), { once: true });
    }

    async close(opts) {
      clearInterval(this._clockTimer);
      this._wm?.closeAll();
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
        width: 920, height: 680, resizable: true
      });
    }

    constructor(opts = {}) {
      super(opts);
      this._booted = false;
      this._startOpen = false;
      this._clockTimer = null;
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
      clearInterval(this._clockTimer);
      this._clockTimer = setInterval(() => {
        const el = root.querySelector(".cv-clock");
        if (el) el.textContent = clockStr();
      }, 15000);
      this._initShell();
      root.addEventListener("keydown", () => this._dismissBoot(), { once: true });
    }

    async close(opts) {
      clearInterval(this._clockTimer);
      this._wm?.closeAll();
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
