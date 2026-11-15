# Backend

The database Vantage and Vision talk to is each club's own FirstPass project, the same one
FirstPass HQ uses. Its schema, migrations and deploy workflow live in the
[FirstPassHQ](https://github.com/zapheus-runplaywin/FirstPassHQ) repository (`supabase/migrations`,
the live game stats migration adds `games`, `game_events`, `game_members` and `game_snapshots`).

What the apps call, in order:

- `is_statistician()` whether the signed-in member may record games.
- `game_lineup(p_team_id)` this season's athletes in a squad or team.
- `create_game(p_id, p_config, p_device_id, p_team_id, p_fixture_id)` makes the game and takes the recorder lease; returns the row with its `pair_code`.
- `append_game_events(p_game_id, p_stream, p_events)` appends a batch and returns the highest unbroken `seq`.
- `follow_game(p_game_id)` lets a coach or manager (Vision) follow any game they may see, by its id.
- `pair_game(p_code, p_as_shadow)` pairs a shadow statistician with a live game by its code.
- `save_game_snapshot(p_game_id, p_through_seq, p_engine_version, p_state)` at each break.
- Realtime topic `game:<id>` carries primary events to paired members.

Clubs are listed in each app's `app.json` under `expo.extra.clubs` (`code`, `name`, `supabaseUrl`,
`anonKey`), the same list as HQ's `src/constants/clubs.ts`.

`migrations/` and `functions/` here stay empty: the schema belongs to HQ. If a migration is ever added here,
it grants its own tables' access; see "Database migrations" in `AGENTS.md`. CI checks it with
`scripts/check-migration-security.py`.
