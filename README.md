# CAIN — Cardinal Virtuoso (Affinity Tracker)

Fan-made **SEER + TEMERITY** affinity/bond tracker for the CAIN TTRPG, as a Foundry VTT module.
Per-player isolated dossiers, Warframe-1999 CRT aesthetic. Players log Conversation and
Contraband on themselves; affinity, bond rank and broken-bond logic resolve automatically.
State persists via flags on each User document (Foundry's native database — no SQLite needed).

## Install
1. Copy the `cain-cardinal-virtuoso` folder into `Data/modules/` of your Foundry install
   (or zip it and use *Install Module → Manifest/Local*).
2. Enable it in your world (**Game Settings → Manage Modules**).
3. Open via the **Cardinal Virtuoso** button in the Token scene-controls,
   or run the macro: `game.cainCardinalVirtuoso.open()`.

## Who sees what (isolation)
- A **player** opening the tracker sees and edits **only their own** dossier.
- The **GM** gets an *ADMIN OVERWATCH* dropdown to view/edit any operative's dossier.
- Persistence is on `user.flags["cain-cardinal-virtuoso"].dossier`. Players can write their
  own User flag; the GM can write anyone's. No extra permissions to configure.

## Mechanics (fan-made SEER+TEMERITY)
- **LINK / BONDED**: toggle a bond with a virtue (start at affinity 0).
- **Conversation** (1×/mission, 2× with X2 mod): tick any of LIKE TOPIC +2 / WENT WELL +2 /
  CONNECTION +2 (or DISLIKE −2), then *LOG CONVERSATION* once.
- **Contraband** (2×/mission, 3× with X2 mod): FAV/LIKE +3, NEUTRAL +1, DISLIKE −3.
  Hate-mail to unbonded virtues can only lower affinity and ignores the limit.
- **Break**: affinity ≤ −5 resets it to 0, bumps brokenCount, and raises that virtue's rank
  requirements by +3 each.
- **Close Mission**: applies any earned rank-ups (affinity must meet the requirement) and
  resets per-mission counters.

## Settings
**Game Settings → Configure Settings → Cardinal Virtuoso → Affinity requirements per rank**
(default `3,8,15`). Adjust to your campaign's pacing.

## Roadmap notes
- Storage is Foundry-native flags by design. A SQLite export (for cross-system / Power BI use)
  could be a later server-side feature, kept separate from the in-world tracker.
- Logic is isolated in `applyConversation/applyContraband/endMission`; a future socketlib-based
  player→GM relay can reuse them unchanged.
