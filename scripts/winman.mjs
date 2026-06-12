/* ----------------------------------------------------------------------------
 * WindowManager — lightweight internal windows that live INSIDE the desktop
 * shell (a single Foundry Application), not as separate Foundry windows.
 * Each window is a floating .cv-window node with a draggable title bar, a close
 * box, z-index focus and a matching taskbar button. Singleton per id.
 * -------------------------------------------------------------------------- */

export class WindowManager {
  /** @param {HTMLElement} host  desktop area that hosts the windows
   *  @param {HTMLElement} taskbar  the open-window tray (#cv-task-open) */
  constructor(host, taskbar) {
    this.host = host;
    this.taskbar = taskbar;
    this.windows = new Map();   // id -> { el, taskBtn, onClose }
    this._z = 20;
    this._spawn = 0;
  }

  has(id) { return this.windows.has(id); }
  bodyEl(id) { return this.windows.get(id)?.el.querySelector(".cv-window-body") ?? null; }

  /** Open a window, or focus + refresh it if it already exists.
   *  opts: { title, icon, html, width, height, x, y, onBody, onClose } */
  open(id, opts = {}) {
    if (this.windows.has(id)) {
      if (opts.html != null) this.setHtml(id, opts.html, opts.onBody);
      this.focus(id);
      return this.windows.get(id).el;
    }

    const el = document.createElement("div");
    el.className = "cv-window";
    el.dataset.winId = id;
    el.style.width = `${opts.width ?? 360}px`;
    if (opts.height) el.style.height = `${opts.height}px`;

    // cascade so stacked windows don't perfectly overlap
    const step = (this._spawn++ % 6) * 26;
    const x = opts.x ?? 60 + step;
    const y = opts.y ?? 40 + step;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    el.innerHTML = `
      <div class="cv-window-bar">
        <span class="cv-window-ico">${opts.icon ?? ""}</span>
        <span class="cv-window-title">${opts.title ?? ""}</span>
        <button type="button" class="cv-window-close" aria-label="Close">✕</button>
      </div>
      <div class="cv-window-body"></div>`;

    this.host.appendChild(el);

    const taskBtn = document.createElement("button");
    taskBtn.type = "button";
    taskBtn.className = "cv-task-btn";
    taskBtn.textContent = opts.title ?? id;
    this.taskbar?.appendChild(taskBtn);

    const rec = { el, taskBtn, onClose: opts.onClose };
    this.windows.set(id, rec);

    el.querySelector(".cv-window-close").addEventListener("click", () => this.close(id));
    el.addEventListener("mousedown", () => this.focus(id));
    taskBtn.addEventListener("click", () => this.focus(id));
    this._wireDrag(el, el.querySelector(".cv-window-bar"));

    this.setHtml(id, opts.html ?? "", opts.onBody);
    this.focus(id);
    return el;
  }

  setHtml(id, html, onBody) {
    const body = this.bodyEl(id);
    if (!body) return;
    body.innerHTML = html;
    onBody?.(body);
  }

  focus(id) {
    const rec = this.windows.get(id);
    if (!rec) return;
    rec.el.style.zIndex = String(++this._z);
    for (const [k, r] of this.windows) r.taskBtn.classList.toggle("cv-task-active", k === id);
  }

  close(id) {
    const rec = this.windows.get(id);
    if (!rec) return;
    rec.el.remove();
    rec.taskBtn.remove();
    this.windows.delete(id);
    rec.onClose?.();
  }

  closeAll() {
    for (const id of [...this.windows.keys()]) this.close(id);
  }

  _wireDrag(el, handle) {
    handle.addEventListener("mousedown", (ev) => {
      if (ev.target.closest(".cv-window-close")) return;
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const hostRect = this.host.getBoundingClientRect();
      const offX = ev.clientX - rect.left;
      const offY = ev.clientY - rect.top;

      const move = (e) => {
        let nx = e.clientX - hostRect.left - offX;
        let ny = e.clientY - hostRect.top - offY;
        nx = Math.max(0, Math.min(nx, this.host.clientWidth - 40));
        ny = Math.max(0, Math.min(ny, this.host.clientHeight - 24));
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }
}
