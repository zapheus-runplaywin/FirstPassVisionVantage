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

What the Live screen shows, from `src/stats/`:

- `possessions.ts` turns the log into possessions: who had the ball, how
  they got it (centre pass, gain, turnover, rebound, throw in) and how it
  ended (goal, forced or unforced loss, miss).
- `tiles.ts` makes the five conversion tiles: CP to goal, gain to goal,
  turnover to goal, shooting, and unforced turnovers. Each shows its count
  and the last eight, and stays grey ("too early") until there are 8
  possessions (5 shots). An arrow shows only when the last eight are 20
  points away from the game figure. There is no season baseline yet.
- `markers.ts` gives hot and cold on the on-court strip (shooters: this
  quarter's goals of attempts against their game, from 5 shots; everyone
  else: gains minus unforced losses this quarter, at +2 or -2) and our losses
  this quarter for the mini court (forced orange-red, unforced gold).

What the database lets Vision do is tested in FirstPassHQ,
`supabase/tests/vision-coach-view.sql`.

Clubs are listed in `app.json` under `expo.extra.clubs`, as in Vantage. Each
club's Supabase project must allow the redirect URL
`firstpass-vision://auth-callback`.
