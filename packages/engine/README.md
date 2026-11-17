# @firstpass/engine

FirstPass's stats engine: pure functions that fold a game's events (`@firstpass/schema`) into the figures FirstPass Vantage, Vision, HQ and Studio show. Every app uses the same engine, so they always agree on the same events.

```ts
import { deriveGame, netPoints, courtTime, ENGINE_VERSION } from '@firstpass/engine';

const state = deriveGame(config, events); // score, shooting by position and player, centre passes, gains, turnovers, quarters
const points = netPoints(events);         // Net Points by team, quarter, position and player
const time = courtTime(events, config.quarterMs); // time on court by player, position and quarter
```

- Pass the game's record: `mergeStreams(everything you hold)`, the `primary` stream with each helper statistician's substitutions and corrections (`helper:<userId>` streams) merged in. A game with no helper is just its `primary` stream. Shadow streams are for comparing statisticians and never count; `mergeStreams` leaves them out.
- `deriveGame`, `netPoints` and `courtTime` apply corrections themselves (`liveEvents`), so pass the whole log, corrections included.
- Players are keyed by the name recorded in the lineup (`lineup_change` events); actions record a position, and the engine credits whoever was in that position at the time.
- `applyEvent(state, event)` folds one live event onto a state, such as a break snapshot's `state`. A correction can change an event from before the snapshot, though, so fold the whole log again with `deriveGame` once you have it.
- A break snapshot in HQ records the `ENGINE_VERSION` that made it (`engineVersion`). If a snapshot's major version differs from yours, ignore its state and fold the events instead.

Built as CommonJS (ES2022) with type files, so it loads with `require()` or `import` in Node 22 or newer.

All rights reserved: published for FirstPass's own apps only (see LICENSE).
