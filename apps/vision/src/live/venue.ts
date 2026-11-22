import { readVenueEvents, type VenueFetch, type VenueLink } from '@firstpass/ui';
import type { GameEvent } from '@firstpass/schema';
import { fromBroadcast } from './log';

/*
 * The venue link, for the phone app (packages/ui/src/venue.ts): at a venue
 * that streams with FirstPass Studio, the statistician's tablet hands each
 * event straight to the Studio Mac over the venue's network, and this reads
 * them from Studio the same way, so the coach keeps up when the venue's
 * internet is slow.
 *
 * It only ever adds to what the club's database gives (feed.ts): the game,
 * its setup and names still come from the club, Studio gives events for the
 * game on its scoreboard only, and the club's copy of an event always wins.
 * Not in a browser: a web page can't ask Studio for them.
 */

/** How long one request waits at Studio for the next event. */
export const VENUE_WAIT_S = 20;
/** How soon to ask again when Studio isn't reached, and when it isn't on this game. */
export const VENUE_RETRY_MS = 5_000;
export const VENUE_OTHER_GAME_MS = 15_000;
/** A pause after an answer that brought nothing new, so a hole Studio can't fill is never asked for in a loop. */
export const VENUE_IDLE_MS = 1_000;

export interface VenueFollow {
  stop(): void;
}

/**
 * Reads a game's events from Studio until stopped. `after()` is how far the
 * game is held with no hole; `onEvents` gets each batch (validated as the
 * club's broadcasts are); `onLost` is called when Studio stops answering or
 * isn't on this game.
 */
export function followVenue(opts: {
  link: VenueLink;
  gameId: string;
  after: () => number;
  onEvents: (events: GameEvent[]) => void;
  onLost: () => void;
  fetch: VenueFetch;
  newSignal?: () => { signal: { readonly aborted: boolean }; abort(): void };
  sleep?: (ms: number) => Promise<void>;
}): VenueFollow {
  let stopped = false;
  let current: { abort(): void } | null = null;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const newSignal = opts.newSignal ?? (() => new AbortController());

  const run = async () => {
    // How far Studio has been read, which may be past a hole the club will fill.
    let cursor = opts.after();
    while (!stopped) {
      cursor = Math.max(cursor, opts.after());
      const ctl = newSignal();
      current = ctl;
      const got = await readVenueEvents(opts.link, opts.gameId, cursor, VENUE_WAIT_S, opts.fetch, ctl.signal);
      current = null;
      if (stopped) return;
      if (!got.ok) {
        opts.onLost();
        // Removed in Studio's Devices: asking again won't help until this phone connects again.
        if (got.reason === 'not-allowed' || got.reason === 'other-recorder') return;
        await sleep(got.reason === 'not-followed' ? VENUE_OTHER_GAME_MS : VENUE_RETRY_MS);
        continue;
      }
      const events = [...got.events, ...got.helper].map(fromBroadcast).filter((e): e is GameEvent => e !== null && e.gameId === opts.gameId);
      let top = cursor;
      for (const e of events) if (e.stream === 'primary' && e.seq > top) top = e.seq;
      opts.onEvents(events);
      if (top === cursor) await sleep(VENUE_IDLE_MS);
      cursor = top;
    }
  };
  void run();

  return {
    stop() {
      stopped = true;
      current?.abort();
    },
  };
}
