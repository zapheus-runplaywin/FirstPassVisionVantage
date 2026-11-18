# FirstPass Vantage: Stream Deck keys

A Stream Deck plugin that turns a 32-key Stream Deck XL into the keys for Vantage's game screen. The statistician taps
where on the court, and presses who, what and the detail on the keys.

There are no pages or folders. Every key keeps its place for the whole game:

| Row | Keys |
|---|---|
| 1 | Our seven positions (GS, GA, WA, C, WD, GD, GK) with the player's name, and **who?** for an unknown player |
| 2 | The eight actions: Goal, Miss, Won it, Lost it, Receive, Feed, Touch, Penalty |
| 3 | The optional detail for the action just pressed: how the ball was lost (8 keys) or won (5), or who got the rebound after a miss (3). Dark the rest of the time |
| 4 | The other team, Skip detail, Mark moment, Undo, the score, who has the ball, the clock (press to start or stop), End quarter |

Only row 3 changes its labels, and only to answer the action just pressed. After a rebound we took, row 1 asks who took
it, with the likely players lit.

The colours match the buttons on the screen: white is what the rules of netball expect next, slate works, near-black
with grey text works but looks wrong for the state of play, gold is already chosen, orange wants attention, and a black
key does nothing right now. **End quarter** takes two presses within three seconds, because a key is easier to hit by
accident than a button on the screen.

Where it happened (the court), substitutions, corrections, the clock setting and the quarter break all stay on the
screen. During a break the keys rest.

## What you need

- A Mac with Apple silicon, the Stream Deck app 7.1 or later, and a Stream Deck XL (8 by 4 keys). The Stream Deck app
  doesn't run on an iPad or an Android tablet, so the keys work from a Mac only.
- Vantage running on the same Mac (the iPad app runs on Apple silicon Macs), with **Use Stream Deck keys** turned on
  on its Home screen.

## Install

1. Double-click `com.runplaywin.firstpass-vantage.streamDeckPlugin`. Every pull request's **CI** run keeps one under
   **Artifacts** ("Stream Deck plugin"); `pnpm --filter @firstpass/vantage-deck pack` makes one in `dist/`.
2. In the Stream Deck app, make a new profile for the XL and drag **Vantage key** (under **FirstPass Vantage**) onto
   all 32 keys. Dragging it once and then copying and pasting it onto the rest is quickest. There is nothing to set on
   any of them: each key works out which of the 32 it is from where it sits.
3. In Vantage on the same Mac, turn on **Use Stream Deck keys** on Home and open a game. The top of the game screen
   shows **Stream Deck on**.

Until Vantage is open on a game, the first key says **Open Vantage** and the rest are dark.

## How it works

Vantage decides what every key says and what a press means (`apps/vantage/src/game/deck.ts`); the plugin knows nothing
about netball. It listens on this computer only (`127.0.0.1`, port 38427). Vantage connects and sends the 32 labels
whenever they change, and the plugin sends back the id of each key pressed:

```
Vantage to plugin: { "v": 1, "type": "keys", "keys": [32 of { "id", "title", "look" }] }
plugin to Vantage: { "v": 1, "type": "press", "id": "action:Goal" }
```

Nothing leaves the computer. The plugin refuses connections from web pages on other sites, takes one Vantage at a time
(the newest), and holds nothing about the game beyond the labels on the keys. Vantage ignores a press of a key that is
no longer showing, so a key pressed just as row 3 changed can't answer a question that is no longer being asked.

## Working on it

```bash
pnpm --filter @firstpass/vantage-deck typecheck
pnpm --filter @firstpass/vantage-deck test      # includes an end-to-end run against a stand-in Stream Deck app
pnpm --filter @firstpass/vantage-deck build     # writes com.runplaywin.firstpass-vantage.sdPlugin/bin/plugin.js
pnpm --filter @firstpass/vantage-deck validate
```

With the Stream Deck app in developer mode (`pnpm exec streamdeck dev`), `pnpm --filter @firstpass/vantage-deck link`
installs the folder in place and `restart` reloads it after a build. Logs are in the plugin's `logs/` folder.

It uses Elgato's official SDK (`@elgato/streamdeck` v3), the same as FirstPass Studio's plugin.
