# The venue link

At a venue that streams with FirstPass Studio, the internet is often the slowest part of game day.
The venue link lets a game's events travel over the venue's own network as well:

- **Vantage** (the statistician's tablet) hands each event straight to the Studio Mac, as well as
  sending it to the club's FirstPass HQ, so the stream's FirstPass figures keep up.
- **The Vision phone app** (a coach's phone) reads the game's events from Studio, as well as from
  the club, so the coach keeps up too. Vision in a browser can't: it stays on the internet.

HQ still receives every event from Vantage exactly as before and stays the record. Nothing about
the outbox changes, and Vantage never waits for Studio.

## What it needs

- Studio's **secure phone link** turned on (Studio > Devices tab), and the club signed in under
  **FirstPass HQ** on the same tab.
- The game on Studio's scoreboard. Studio takes and gives events only for the game it already
  follows from the club's HQ, so the club's rules about who may see a game still decide.
- The tablet and phone on the venue's network. Studio's secure name is looked up on the internet,
  so a little internet is still needed, at least when the app first reaches Studio.

## Connecting a device

1. In Vantage, on Home under **Venue link** (in Vision, **Venue link** at the foot of the games
   list), type the six letters of Studio's secure link. Studio's Devices tab shows them, for
   example `k3f9x2` in `https://k3f9x2.studio.firstpass.pivt.au:8443`.
2. Press **Connect**. The Studio Mac asks *Allow "FirstPass Vantage" to use the venue link?*
3. Someone at the Mac presses **Allow**. The device keeps a key from then on.

**Disconnect** in the app forgets the key. **Remove** in Studio's Devices list takes the device
away from Studio's side; the app then says **connect again**.

## What you see

Vantage shows a **Venue link** pill on the game screen:

| Pill | Meaning |
| --- | --- |
| live | Studio has every event so far |
| not this game | Studio is there, but another game (or none) is on its scoreboard; Vantage tries again every 15 seconds |
| not reached | Studio isn't answering; Vantage tries again every 5 seconds |
| connect again | The device was removed in Studio's Devices |
| stopped | HQ has this game from another tablet, so this tablet's events aren't given to Studio |

Vision's connection chip says **Live on venue link** while Studio is answering, and the "can't
reach the club's database" warning stays away while it does.

## How it stays safe

- **Only over https.** The apps refuse any address that isn't https, and Studio refuses these
  routes over plain http, so a game's events (about athletes, many under 18) never cross the
  venue's Wi-Fi unencrypted.
- **A person allows each device**, at the Mac, and can remove it.
- **The key opens two routes and nothing else**: sending a game's events and reading them. It
  can't change Studio's scoreboard or scene, and it reads no other FirstPass stats.
- **Ids only.** Events hold athlete ids, not names; names and the game's setup come from the
  club's HQ, which checks who is asking as always.
- **The club's copy wins.** Studio holds venue-link events apart and never saves them; when HQ
  sends its own copy it replaces them, in Studio and in Vision. A tablet whose events turn out
  not to be HQ's (another tablet took the game over) is no longer listened to for that game.

## For developers

The protocol is in `packages/ui/src/venue.ts` (pairing, sending, reading; fetch is passed in).
Vantage's sender is `apps/vantage/src/lib/venue.ts`; Vision's reader is
`apps/vision/src/live/venue.ts`, feeding `GameFeed.receiveVenue()`. Studio's side is
`venuelink.ts`, `hqstats.ts` and `devices.ts` (kind `stats`) in FirstPassStudio.

Not yet tried on real devices or at a venue.
