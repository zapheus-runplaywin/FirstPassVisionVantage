# Changelog

## 0.2.1

- Video markers: `videoMarkers(config, events)` gives the game's standing events as named, coloured markers at the moment each was recorded; `placeMarkers(markers, sync)` turns those moments into frames of a video from when the video started; `markersEdl`, `markersXml` and `markersList` write the file DaVinci Resolve, Adobe Premiere Pro or a person reads. `firstClockStart`, `videoStartFrom`, `parseVideoTime` and `parseTimecode` find the video's start from what a person types. A game's state is unchanged, so break snapshots made by 0.2.0 still read.
- Season figures: `playerLines(config, events)` gives each of our players' figures for a game (time on court, shooting, feeds, gains, turnovers, penalties, rebounds, Net Points), and `seasonPlayers(games)` adds a player's games together over a season, matching names between games. `netPointsPer10` and `shootingPercent` are the rates.

## 0.2.0

- Helper statisticians: `mergeStreams(events)` gives a game's record from everything held, the primary stream with each helper's substitutions and corrections merged in by the time they were recorded. `streamCursors(events)` says how far each stream is held without a gap, and `isHelperStream(stream)` names a helper's stream. Fold the result of `mergeStreams` instead of the primary stream alone.

## 0.1.0

- First release on npm: game state from events (`deriveGame`, `applyEvent`, `initialState`), corrections (`liveEvents`), Net Points, court time, lineups, timing, review and the game file, built as CommonJS with type files.
- `ENGINE_VERSION`, the engine's version, for telling which engine made a break snapshot.
