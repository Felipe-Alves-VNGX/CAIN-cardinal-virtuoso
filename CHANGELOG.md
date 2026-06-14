# Changelog

## 1.11.0 — GM-gated affinity actions & contraband send/review flow
- **Affinity actions are now GM-only.** Players can no longer self-score their
  own bonds. In Conversation, the "speak as Bond" selector and the
  end-of-talk / mark-result block are hidden from players, and player messages
  always post as themselves. Quirks become GM-only as well (both the profile
  template and the `onQuirk` guard).
- **Dead Drop reworked into a send-then-review flow.** Players now send actual
  (non-gift) inventory items as contraband. Sending spends one HQ stock unit and
  a per-mission slot, consumes one unit of the item, and queues it **without**
  applying any affinity. Gifts keep their special automated flow.
- **New GM-only "Review Contraband" window.** The GM scores queued items by
  category (Favorite/Like/Neutral/Dislike) or by a free value, which applies the
  affinity and dequeues the entry; Discard drops an entry without scoring.
- Adds `dossier.contrabandQueue` plus `sendContraband` / `scoreContraband` /
  `discardContraband`, with en + pt-BR localization and styles.

## 1.10.0 — Player-view hardening & desktop UX polish
- **HQ Console balance levers are GM-only.** The X2 mod, Gate user, Covert, CAT
  and HQ-stock fields (plus Wipe Dossier) are gated behind `isGM` and enforced on
  save; players can only edit their own codename.
- **Desktop UX polish.** Adds a window focus cue and minimize buttons, makes the
  profile affinity more prominent, surfaces empty-stock and over-bond-limit
  warnings, widens the window cascade, and removes the guaranteed 404s for
  missing virtue portraits.

## 1.9.0 — Special <3 Achievements & Good Ending Points
- **New Achievements window** (🏆 in the contacts footer). Tracks the dossier's
  "Special <3" achievements in two groups: the 13 good endings (the nine Bond-3
  milestones plus the four story beats) and the bad/special endings. Players see
  it read-only; the GM toggles the subjective ones with a checkbox, while the
  objective ones detect automatically.
- **Auto-detection.** Bond-3 achievements, "Beso de Tres", "Heart Breaker"
  (4+ broken bonds), "The Fumbler" (−15 affinity in one mission) and "Nothing
  Loves the Hunter" (5 missions with no bond) all unlock on their own and stick
  once earned — a later broken bond or counter reset can't revoke them.
- **Good Ending Points.** Each good achievement adds one point to the party's
  shared total (counted once across all players). The window shows the live
  total on a threshold bar with the 4/8/10/12/16 reward ladder, highlighting the
  tier the party has reached.

## 1.8.0 — Contraband gifts from the sheet, automated
- **Gift items live on the character sheet.** A world Item compendium
  ("Cardinal Virtuoso — Gifts") is created and populated automatically (GM, on
  load) with the six dossier gifts — Heartfelt Note, Page of One-liners, Apology
  Note, Heated Blanket, Well-Organized Journal and the 5-Hour Deployment Pass.
  Each carries a module flag linking it back to its rules effect; drag one onto a
  player's CAIN sheet and it becomes a giftable contraband item. Re-run anytime
  via `game.cainCardinalVirtuoso.installGifts()`.
- **Dead Drop gifts from inventory.** The Dead Drop now lists the gift items the
  contact actually owns on their sheet. Giving one applies its automated effect
  and spends one unit from the inventory (deletes at zero).
- **Automated gift effects.** Heartfelt Note ranks the bond up if affinity
  already meets the next minimum (else +1). Heated Blanket gives +2 (+1 within
  12h of deployment, via a checkbox). 5-Hour Deployment Pass gives +12. Page of
  One-liners queues a Meet-Up that ignores a disliked topic (+1D noted). Apology
  Note softens affinity losses (−2 first, −1 after) through the current and next
  mission. Well-Organized Journal warns you before the first affinity-lowering
  action each mission, letting you rethink.

## 1.7.0 — Live bond sync & per-virtue affinity trackers
- **New bonds appear automatically.** KIM now watches the embedded `bond` Item
  lifecycle (`createItem`/`deleteItem`/`updateItem`) on the linked CAIN character,
  not just `updateActor` — so starting a Virtue bond on the sheet makes the
  contact show up live, with no reopen. A sheet bond also counts as bonded inside
  KIM (its `currentLevel` seeds the rank), so Conversation/Contraband/Quirks work
  immediately without a manual "add contact" step. KIM stays authoritative on rank.
  Bond→virtue matching is now robust to CAIN's inconsistent naming: it resolves a
  bond by its embedded/compendium id and maps it via both item name and
  `virtueName` (so official `Charity`/"The Twins" and custom
  `Absolution (The Mourner)`/`Absolution` items both resolve correctly).
- **Per-virtue affinity trackers.** Bond I/II/III minimum-affinity requirements
  can now differ per Virtue (the dossier's per-bond "MINIMUM AFFINITY TRACKER"),
  instead of one global 5/10/18. Overrides persist in a world setting and feed
  rank-up logic everywhere.
- **New Bond Trackers window** (📊 in the contacts footer). Both GM and players
  see, per bond: a visual affinity tracker with the I/II/III thresholds and the
  current affinity, the Virtue's personality (likes/dislikes/food/blasphemy) and
  its per-rank bond abilities. The GM edits each Virtue's three thresholds inline;
  players view read-only.

## 1.6.0 — Usability: localization, safer End Mission & inline state
- **Real localization (i18n).** All KIM/desktop UI text — buttons, labels,
  hints, statuses, empty states, INTEL/NOTES headers and relationship labels —
  now resolves through `lang/en.json` / `lang/pt-BR.json`, so Português (Brasil)
  finally renders end to end. Retro flavor (boot sequence, `.EXE` icons, the
  SEER//TEMERITY brand) stays in English by design. *Known gap:* the in-world
  event log and toast notifications are still English — they're stored strings
  filtered by substring, so they'll move once the log is restructured.
- **End Mission asks first.** Closing a mission is irreversible (rank-ups,
  broken-bond resets, contraband haul), so it now shows a confirmation listing
  the rank-ups to apply, the bonds about to be cleared and the haul to collect,
  before advancing the mission.
- **State visible where you act.** The contact list now shows each bonded
  Virtue's affinity, bond rank and next-rank requirement inline, and the Dead
  Drop recipient list shows each contact's contraband uses left this mission
  (used/cap), so limits are clear before an action is denied.

## 1.5.0 — CAIN sheet integration, HQ Console & live sync
- **CAIN character integration.** KIM now reads the character linked to each
  player (`user.character`) and shows *only* the Virtue bonds that character has
  started on their CAIN sheet — players see just their contacts; the GM keeps
  all 9 for admin. Bonds are matched by Virtue name (e.g. Charity ↔ "The Twins").
  KIM is authoritative on bond level: whenever a Virtue ranks up, the character
  sheet's `currentLevel` is edited automatically, and the contact list refreshes
  live when a bond is added or its level changes on the sheet. Players with no
  linked sheet or no started bonds get a clear empty-state message.
- **HQ Console window** (⚙ HQ in the contacts footer) for the deep meta the old
  grid used to own: codename, X2 mod, Gate user, Covert/CAT counts, manual HQ
  stock, plus the next-haul/bond readout and a Wipe Dossier control. Codename in
  the contacts footer is now read-only (edit it here).
- **Live sync.** KIM windows re-render automatically when the viewed dossier
  changes anywhere — a GM editing a player, or the player's own second client —
  via `updateUser`/`updateActor` hooks, with proper teardown when the desktop closes.
- **Classic grid retired.** All affinity/bond/contraband/quirk logic is reused
  as-is; only the view layer changed. The standalone dossier grid is gone —
  `game.cainCardinalVirtuoso.open()` now opens the KIM desktop.

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
  - *Dead Drop* — a dedicated contraband window: pick a recipient + package type,
    see live HQ stock and recent drops, send. Reachable from DROP.EXE on the
    desktop/Start menu, the contacts footer, or a contact's profile.
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
