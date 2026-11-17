# Changelog

## 0.2.0

- Helper statisticians: `mergeStreams(events)` gives a game's record from everything held, the primary stream with each helper's substitutions and corrections merged in by the time they were recorded. `streamCursors(events)` says how far each stream is held without a gap, and `isHelperStream(stream)` names a helper's stream. Fold the result of `mergeStreams` instead of the primary stream alone.

## 0.1.0

- First release on npm: game state from events (`deriveGame`, `applyEvent`, `initialState`), corrections (`liveEvents`), Net Points, court time, lineups, timing, review and the game file, built as CommonJS with type files.
- `ENGINE_VERSION`, the engine's version, for telling which engine made a break snapshot.
