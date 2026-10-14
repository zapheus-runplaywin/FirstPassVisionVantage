# Supabase

Database migrations and Edge Functions for the FirstPass backend (Supabase, Sydney region).

- `migrations/` SQL migrations: clubs and roles, teams and players, games, the event log, pairing, row-level security
- `functions/` Edge Functions (PlayHQ import, snapshots): not yet written
- `test/` SQL tests that run on a plain Postgres with stand-ins for Supabase's `auth` and `realtime` schemas

## How the log works

Clients never write `events` directly. Vantage calls `append_events(game_id, stream, events)`,
which checks the recorder lease, ignores duplicates (so a resend is harmless) and returns the
highest contiguous `seq` stored, which the tablet uses to clear its outbox. An insert trigger
broadcasts primary-stream events to the private Realtime topic `game:<id>`; a paired member
(`pair_game(code)`) may subscribe to it. Shadow streams are stored, never broadcast.

## Running the tests

Needs `psql` and a Postgres you can create databases on:

```bash
supabase/test/run.sh -h localhost -U postgres
```

CI runs the same script against a Postgres 16 service on every push.

## Applying to a project

With the Supabase CLI linked to the project: `supabase db push`. The `realtime.messages`
policy migration applies itself only where Realtime exists.
