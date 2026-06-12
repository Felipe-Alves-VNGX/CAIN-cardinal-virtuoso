# Changelog

## 1.4.0 — Phase 4: KIM chat client
- **It's a chat now.** The tracker is reimagined as *KIM* (Kinda Important
  Messages) — a Warframe-1999 / MSN-style messenger. Each virtue is a contact.
- **Windows live inside the desktop.** A lightweight internal window manager
  hosts draggable windows *within* the SEER//TEMERITY terminal (no more separate
  Foundry windows popping out). Each window gets a taskbar button; drag by the
  title bar, click to focus, close box on the right.
- **Three faithful windows**:
  - *Contacts* — your avatar + 9 virtues as contacts, each with portrait, an
    MSN-style status dot and a relationship label (Offline → Acquaintance →
    Friendly → Trusted → Inseparable, or 💔 Heartbroken). Footer carries codename,
    bond slots, HQ stock and End Mission / Time Off.
  - *Profile* — large avatar, relationship status, affinity/bond progress, INTEL
    (likes/dislikes/food), Contraband and Quirks controls, GM admin ±, and NOTES
    (that contact's event history).
  - *Conversation* — a real chat log with a free-text field (write as yourself or
    as the virtue; saved to history). At the end the GM marks the Conversation
    outcome (Liked/Disliked topic, Went well, Connection).
- **Rules unchanged.** All affinity/bond/contraband/quirk logic is reused as-is;
  only the view layer changed. The classic grid (`game.cainCardinalVirtuoso.open()`)
  still works as a macro fallback for deep admin/meta editing.
- KIM.EXE replaces DOSSIER.EXE on the desktop and Start menu.

## 1.3.0 — Phase 3: Virtue Portraits
- **Convention-based portraits**: each virtue card now auto-loads
  `img/virtues/<key>.webp` (e.g. `img/virtues/justice.webp`) — just drop the
  files in, no code edits needed. The `portrait` field in `data.mjs` remains as
  an optional per-virtue override.
- **Graceful fallback**: a missing or broken portrait file shows the Roman-numeral
  glyph placeholder as before, with no broken-image icon flash. Portraits reveal
  only once their file confirms loaded.
- Portrait overlays the glyph in a fixed 26×26 avatar slot, preserving the
  Win95 inset chrome.

## 1.2.0 — Höllvania '99 OS Shell
- **Desktop launcher**: the scene-controls button now opens the *SEER//TEMERITY Terminal*
  — a Win95-style desktop with wallpaper, icons and a taskbar.
- **Boot sequence**: animated terminal log plays on first open (click to skip).
  Lines reveal one by one; CAIN link blinks amber until connected.
- **DOSSIER.EXE icon**: double-click on the desktop (or Start menu) opens the
  affinity tracker as before. `game.cainCardinalVirtuoso.open()` still works for macros.
- **Start menu**: classic Win95 popup with SEER//TEMERITY side-banner.
  Contains DOSSIER.EXE, SEER.NFO (about dialog) and Shut Down.
- **Taskbar**: Start button, open-window tray, live clock (updates every 15s).
- **Singleton desktop**: opening via scene button while the terminal is already
  open brings it to front instead of spawning a second window.
- Portrait image infrastructure prepared: each virtue has a `portrait` slot
  (empty by default) — drop images in `img/virtues/<key>.webp` for Phase 3.

## 1.1.0 — Harpocrates rules, complete
- **3 new virtues**: Chastity (The Restraint), Sobriety (The Resolute) and
  Absolution (The Mourner), with likes/dislikes/foods from the Harpocrates Dossier.
- **Quirks**: per-virtue affinity triggers as one-click buttons (with per-mission
  caps where the dossier sets them, e.g. Faith's claw game 1×, Fortitude's
  human kills 2×).
- **Bond reactions**: linking or upgrading a virtue now automatically applies its
  rivals' penalties (e.g. bonding Charity → Justice −10) and fans' bonuses
  (e.g. bonding Faith → Chastity +3). Fortitude reacts to *everyone*.
- **Bond pacing**: 1 new virtue per completed mission (+1 per time off).
  GMs bypass; can be disabled in settings.
- **Heart Break reworked**: at −5 the bond is flagged 💔 and locked, and only
  resets when the mission closes (per the dossier), instead of instantly.
- **Contraband economy**: gifts and hate-mail now spend HQ stock; closing a
  mission collects covert + ½CAT (min 2, +1 for Gate users), capped at 6.
- **Time off** (X2 mod): applies rank-ups, resets limits and grants an extra
  bond slot without closing the mission.
- **Admin adjust**: GM-only ± affinity control per virtue for table rulings.
- **Event log**: every affinity change is logged per dossier (last 40 entries).
- **Rank requirements** now default to the dossier's 5/10/18 (was 3/8/15).
  Existing worlds keep their stored setting — update it manually if desired.
- Bond rank tooltips with the dossier's relationship flavor text.

## 1.0.1
- First automated release; no gameplay changes.
- Install via manifest URL and auto-update now work (manifest/download
  URLs are stamped into module.json at release time).

## 1.0.0
- Initial prototype: SEER+TEMERITY affinity/bond tracker as a Foundry VTT module.
- Per-player isolated dossiers persisted via User flags; GM Admin Overwatch.
- Conversation, Contraband (incl. hate-mail), broken-bond and rank-up logic.
- Win95-style desktop window chrome.
