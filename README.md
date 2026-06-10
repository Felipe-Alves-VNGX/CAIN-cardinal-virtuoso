# CAIN — Cardinal Virtuoso (Affinity Tracker)

Fan-made **SEER + TEMERITY** affinity/bond tracker for the CAIN TTRPG, as a Foundry VTT module.
Per-player isolated dossiers, Warframe-1999 CRT aesthetic. Players log Conversation and
Contraband on themselves; affinity, bond rank and broken-bond logic resolve automatically.
State persists via flags on each User document.

## Install
**Via manifest URL (recommended):** in Foundry, go to *Add-on Modules → Install Module* and paste:
```
https://github.com/Felipe-Alves-VNGX/CAIN-cardinal-virtuoso/releases/latest/download/module.json
```
Updates are picked up automatically when a new release is published.

**Manually:** download `module.zip` from the [latest release](https://github.com/Felipe-Alves-VNGX/CAIN-cardinal-virtuoso/releases/latest)
and extract it into `Data/modules/cain-cardinal-virtuoso/`, or copy this folder there directly.

Then:
1. Enable it in your world (**Game Settings → Manage Modules**).
2. Open via the **Cardinal Virtuoso** button in the Token scene-controls,
   or run the macro: `game.cainCardinalVirtuoso.open()`.

## Releases
Publishing is automated: merging to `main` with a changed `version` in `module.json`
creates a GitHub release with `module.zip` and a stamped `module.json` attached
(see `.github/workflows/release.yml`). Bump the version and update `CHANGELOG.md`
in the same PR; merges without a version bump don't release.

## Who sees what (isolation)
- A **player** opening the tracker sees and edits **only their own** dossier.
- The **GM** gets an *ADMIN OVERWATCH* dropdown to view/edit any operative's dossier.
- Persistence is on `user.flags["cain-cardinal-virtuoso"].dossier`. Players can write their
  own User flag; the GM can write anyone's. No extra permissions to configure.

## Mechanics (fan-made SEER+TEMERITY)
All 9 virtues are tracked: the Vol. 1 six plus Chastity, Sobriety and Absolution
from the Harpocrates Dossier.

- **LINK / BONDED**: toggle a bond with a virtue (starts at affinity 0). Bond pacing
  is enforced: 1 new virtue per completed mission (+1 per time off); GMs bypass.
  Linking or upgrading a virtue triggers its rivals' **bond reactions**
  (e.g. bonding Charity → Justice −10; bonding Faith → Chastity +3).
- **Conversation** (1×/mission, 2× with X2 mod): tick any of LIKE TOPIC +2 / WENT WELL +2 /
  CONNECTION +2 (or DISLIKE −2), then *LOG CONVERSATION* once.
- **Contraband** (2×/mission, 3× with X2 mod): FAV/LIKE +3, NEUTRAL +1, DISLIKE −3.
  Every gift (and hate-mail) spends 1 HQ stock. Closing a mission collects
  covert + ½CAT (min 2, +1 for Gate users), capped at 6 in HQ.
  Hate-mail to unbonded virtues can only lower affinity and ignores the gift limit.
- **Quirks**: per-virtue triggers as one-click buttons (some with per-mission caps).
  The GM also gets a free ± adjust per virtue for table rulings.
- **Heart Break**: affinity ≤ −5 flags the bond 💔 and locks it; when the mission
  closes it resets to unbonded/0 and raises that virtue's requirements by +3.
- **Close Mission**: applies earned rank-ups (affinity must meet the requirement),
  clears broken bonds, collects the contraband haul and resets per-mission counters.
- **Time Off** (X2 mod only): rank-ups + limit reset + 1 extra bond slot,
  without closing the mission.
- Every affinity change lands in a per-dossier **event log** (last 40 entries).

## Settings
**Game Settings → Configure Settings → Cardinal Virtuoso**:
- *Affinity requirements per rank* — default `5,10,18` (Harpocrates Dossier).
- *Enforce bond pacing* — disable to allow free linking, as in v1.0.

## Roadmap notes
- Storage is Foundry-native flags by design. A SQLite export (for cross-system / Power BI use)
  could be a later server-side feature, kept separate from the in-world tracker.
- Logic is isolated in `applyConversation/applyContraband/endMission`; a future socketlib-based
  player→GM relay can reuse them unchanged.
