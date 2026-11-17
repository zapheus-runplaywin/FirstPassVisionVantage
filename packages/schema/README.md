# @firstpass/schema

FirstPass's event model. Every game is an append-only log of events: FirstPass Vantage records them, and FirstPass Vision, HQ and Studio read them. `@firstpass/engine` turns them into the game's figures.

```ts
import { POSITIONS, type GameConfig, type GameEvent } from '@firstpass/schema';
```

- Each event has an envelope (`id`, `gameId`, `stream`, `seq`, `type`, `payload`, `recordedAt`).
- `stream` is `primary` for the recording statistician, `helper:<userId>` for a helper statistician (substitutions and corrections only, which count in the game's record), or `shadow:<userId>` for a shadow statistician (a private second record, which never counts). Within a stream, `seq` is gapless.
- Nothing is edited in place: Undo, Delete and Edit are `correction` events that point at the event they change.

Built as CommonJS (ES2022) with type files, so it loads with `require()` or `import` in Node 22 or newer.

All rights reserved: published for FirstPass's own apps only (see LICENSE).
