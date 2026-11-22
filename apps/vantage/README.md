# FirstPass Vantage

The statistician's app for entering stats during a game: Android tablets first, and an iPad or a Mac from TestFlight ([docs/testflight.md](../../docs/testflight.md)). Games are saved on the device as they are entered and sent to the club when there is signal.

## Signing in

Members sign in the way they do in FirstPass HQ. Google works everywhere. **Sign in with Apple** shows on an iPad or a Mac only, as in HQ (`src/lib/apple.ts`), and needs this app's store id on the club's Apple provider ([docs/testflight.md](../../docs/testflight.md), step 3). Android stays Google only.

## Keyboard shortcuts

For a statistician at a Mac, or at a tablet with a keyboard attached. Turn on **Use keyboard shortcuts** on Home; it is off by default.

The keyboard is laid out as the [Stream Deck](../../plugins/vantage-deck/README.md) is: the keyboard's four rows, eight keys from the left, are the deck's four rows of eight keys, and each key means what the deck key in its place means at that moment.

| Keys | What they do |
|---|---|
| `1 2 3 4 5 6 7 8` | Our seven positions (GS, GA, WA, C, WD, GD, GK), and **who?** for an unknown player |
| `Q W E R T Y U I` | The eight actions: Goal, Miss, Won it, Lost it, Receive, Feed, Touch, Penalty |
| `A S D F G H J K` | The optional detail for the action just pressed: how the ball was lost (8 keys) or won (5), or who got the rebound after a miss (3) |
| `Z X C V` | The other team, Skip detail, Mark moment, Undo |
| `M` and `,` | Start or stop the clock, and End quarter (two presses within three seconds) |

Backspace undoes too. Where it happened is still a tap or a click on the court. **Keys** at the top of the game screen shows what every key does right now. Substitutions, corrections, the clock setting and the quarter break stay on the screen, and the keys rest while one of those is open.

A held key counts once: the same key counts again only after it has been quiet for 0.6 seconds, so a held Undo can't take back event after event.

How it works: `src/game/keyboard.ts` maps a key to a deck key, and `src/game/deck.ts` decides what that key means. React Native can't hear a hardware key on an iPad or a Mac except through a text box, so `src/components/KeyCatcher.tsx` is a hidden one that never shows the on-screen keyboard.

## Video markers

**Export**, then **Video markers**, makes a file that puts a named marker on every event in DaVinci Resolve or Premiere Pro, or a plain list of times. Type how far into the video the first quarter starts, pick the frames a second and what to mark. See [docs/video-markers.md](../../docs/video-markers.md).
