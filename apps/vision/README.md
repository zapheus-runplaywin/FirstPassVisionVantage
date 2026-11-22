# FirstPass Vision

The coach's live view. A coach or manager picks their club, signs in with
Google (the same account as FirstPass HQ), taps one of their team's games and
follows it live. The iPhone and iPad app also offers Sign in with Apple, as
HQ does (`src/lib/apple.ts`); in a browser and on Android it is Google only,
so a coach who joined HQ with Apple can't yet use Vision in a browser.

After the game, **Report** at the top of the game screen shows the whole game
on one page: each quarter, the shooters, time on court, rebounds and Net
Points, from the same engine functions as Vantage's "Game so far"
(`src/stats/report.ts`). A finished game opens on its report. The games list
shows the last three days; **Earlier games** brings older ones, twenty at a
time. **Print or save** on the report opens the browser's print box, where
it can be printed or saved as a PDF, black on white; in the phone app the
button is **Share** and sends the report as text (`src/stats/reportDoc.ts`,
`src/lib/saveReport.ts`). Every copy carries a line saying it names players
and is for the coaching team only (Matt asked for the button, 22 November
2026).

**Season** on the games list opens the season so far for a team: each
athlete's figures added up over the team's finished games (games, time on
court, shooting, gains, turnovers, Net Points and Net Points per 10 minutes),
and, on tapping an athlete, each of their games in turn. It is worked out in
the app from the same events as each game's report, with the engine's
`seasonPlayers` (`src/lib/season.ts`, `src/stats/season.ts`,
`src/app/season.tsx`), so nothing new is stored and the figures agree with
the reports. It follows each game first, so HQ's rules decide what a coach or
manager can read: their own team's games only. An athlete is matched between
games by the name in the lineup, ignoring case and spacing, so a game with no
lineup recorded adds nothing and a name spelt two ways shows as two athletes.
It is for the coaching team and names players. This is the first step of the
Pathway Passport idea (issue #12): one club, one team's games, no sharing
outside the club and nothing for athletes or parents yet.

How it gets the game:

- `src/lib/games.ts` lists recent games the member may see, follows the
  chosen game by its id (`follow_game`, no pair code, so finished games open
  too) and reads its primary stream from `game_events` in pages.
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
- `alerts.ts` raises the alert cards. It replays the game at each goal,
  miss, gain, loss and quarter end, and a card appears only when a rule
  holds by 20 points (trend cards: CP, gain and turnover to goal, shooting,
  gains dried up; "You can act" cards: a shooter hot or cold, unforced
  losses in the attacking third). At most one new card per 90 s of game
  time and three live at once; a card retires itself when its rule stops
  holding. Each card says what it is measured from, such as "since our GA
  change". Stars and dismissals are kept on the device for that game
  (`src/live/useCardPrefs.ts`); a dismissal lasts for the quarter.
- `changes.ts` gives each lineup change, by either team, a verdict for the
  Changes tab. It compares the last 8 possessions before the change with
  every one since, using that team's scoring for an attacking or centre-court
  change and the other team's for GK, GD or WD. It needs 8 on each side and
  a 20-point move. A change that has helped or hurt also raises a "You can
  act" card, which retires after five minutes of game time.
- `court.ts` feeds the Court tab: where a team loses it, where it wins it, and
  its shots by sector (left, centre or right, close or long, as the engine's
  zones name them), for the whole game or one quarter.
- `markers.ts` also pairs our seven with the players they line up on for the
  On court tab, with when each came on.
- `breakview.ts` makes the break view's "Say this" points. The break view
  opens by itself at each quarter break and at full time. It ranks the
  quarter's cards first, one per subject, and tops them up with the quarter
  figures furthest from the game figure.

What the database lets Vision do is tested in FirstPassHQ,
`supabase/tests/vision-coach-view.sql`.

Clubs are listed in `app.json` under `expo.extra.clubs`, as in Vantage. Each
club's Supabase project must allow the redirect URLs
`firstpass-vision://auth-callback` (the phone app) and
`https://firstpass-vision.expo.app/auth-callback` (the web version).

## On the web

Coaches can use Vision in their phone's browser at
https://firstpass-vision.expo.app. It is published with **Actions → Deploy
web → Run workflow**, app `vision`, which tests, exports the static web
version and publishes it to Expo Hosting. The workflow runs only when pressed.

- Signing in: the whole page goes to Google and comes back to
  `/auth-callback` (`src/app/auth-callback.tsx`), which swaps Google's
  one-time code for a session and opens the page the coach was going to.
  `src/lib/webAuth.ts` is the only place a code is swapped, at most once. The
  phone app's sign-in (`src/lib/auth.ts`) doesn't change, and on the phone
  `/auth-callback` only sends the app home.
- A game is `/game?id=<id>`, not `/game/<id>`, because the web version is
  static pages and a static page can't stand for every game id. Opening a game
  follows it in HQ first (`follow_game`), so a link or a reload works, and HQ
  checks access again each time.
- A game link opened while signed out goes to sign-in with `?next=`, and only
  a page on this site is accepted there.
- The session lives in the browser's storage, as on any signed-in website.
  Sign out is on every signed-in screen and ends the session on this device
  only (`scope: 'local'`), so it never signs the person out of HQ or Vantage;
  signing out reloads the start page,
  a page brought back by the back button is loaded again, and the sign-in
  screen says not to use a shared computer.
- To try it locally: `npx expo export --platform web --output-dir dist`, then
  `npx expo serve`. Sign-in only works from an address on the club's redirect
  list.

## Video markers

Under the game report, **Video markers** makes the same files as Vantage: for DaVinci Resolve, for Premiere Pro, or a plain list. In a browser the file downloads; in the phone app it goes to the share sheet as text. See [docs/video-markers.md](../../docs/video-markers.md).
