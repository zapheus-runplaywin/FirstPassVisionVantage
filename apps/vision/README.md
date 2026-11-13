# FirstPass Vision

The coach's live view. A coach or manager picks their club, signs in with
Google (the same account as FirstPass HQ), taps one of their team's games and
follows it live.

How it gets the game:

- `src/lib/games.ts` lists recent games the member may see, pairs with the
  chosen game (`pair_game`, using the game's code) and reads its primary
  stream from `game_events` in pages.
- `src/live/feed.ts` keeps the game up to date: the private Realtime topic
  `game:<id>` is the fast path; reads fill any gap, check every 5 s while
  live updates are down, and every 30 s regardless.
- `src/live/log.ts` holds the events by seq and shows only the unbroken run
  from seq 1, so a missed event never silently changes a number.
- `src/live/summary.ts` works out score, quarter and clock with
  `@firstpass/engine`, and when to warn that the numbers may be behind.

What the database lets Vision do is tested in FirstPassHQ,
`supabase/tests/vision-coach-view.sql`.

Clubs are listed in `app.json` under `expo.extra.clubs`, as in Vantage. Each
club's Supabase project must allow the redirect URL
`firstpass-vision://auth-callback`.
