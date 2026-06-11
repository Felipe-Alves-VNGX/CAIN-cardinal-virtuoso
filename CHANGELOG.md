# Changelog

## 1.2.0 — Höllvania '99 OS Shell
- **Desktop launcher**: the scene-controls button now opens the *SEER//TEMERITY Terminal*
  — a Win95-style desktop with wallpaper, icons and a taskbar.
- **Boot sequence**: animated terminal log plays on first open (click to skip).
  Lines reveal one by one; CAIN link blinks amber until connected.
- **DOSSIER.EXE runs inside the desktop**: the tracker now opens as a draggable
  internal Win95 window within the terminal — its titlebar buttons (_ □ ✕)
  minimize to the taskbar, maximize and close for real. One instance at a time;
  reopening restores/focuses it. `game.cainCardinalVirtuoso.open()` still opens
  the standalone Foundry window for macros.
- **Start menu**: classic Win95 popup with SEER//TEMERITY side-banner.
  Contains DOSSIER.EXE, SEER.NFO (about dialog) and Shut Down.
- **Taskbar**: Start button, open-window buttons (click to minimize/restore
  DOSSIER.EXE), live clock (updates every 15s).
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
