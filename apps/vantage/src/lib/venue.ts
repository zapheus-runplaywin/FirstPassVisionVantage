import { pairVenue, sendVenueEvents, VENUE_BATCH, venueFromText, venueToText, type VenueFetch, type VenueLink, type VenueRefusal } from '@firstpass/ui';
import { useEffect, useState } from 'react';
import { getGame, getKv, loadUnsent, setKv } from './db';
import { currentSyncState } from './sync';

/*
 * The venue link (packages/ui/src/venue.ts): on the venue's own network this
 * tablet also hands each event straight to the FirstPass Studio Mac, so the
 * stream's graphics, and a coach's phone reading from Studio, keep up when
 * the venue's internet is slow.
 *
 * It never replaces the outbox (sync.ts): HQ still gets every event, and
 * nothing here waits for Studio or holds the statistician up. Studio takes
 * events only for the game on its scoreboard; anything else it refuses, and
 * this just tries again later. Events go only over Studio's secure link.
 *
 * Off until someone connects this tablet to a Studio (Home, Venue link).
 */

const VENUE_KV = 'venueLink';

/** The Studio this tablet is connected to, if any. */
export function venueLink(): VenueLink | null {
  return venueFromText(getKv(VENUE_KV));
}

export function setVenueLink(link: VenueLink | null): void {
  setKv(VENUE_KV, link ? venueToText(link) : '');
  // A new Studio, or none: what was known of the old one no longer holds.
  resetVenue();
}

const realFetch: VenueFetch = (url, init) => fetch(url, init as RequestInit);

/** Asks the Studio at `typed` to allow this tablet, and keeps the link once someone there presses Allow. */
export async function connectVenue(typed: string, onWaiting: () => void, cancelled: () => boolean, fetcher: VenueFetch = realFetch): Promise<string | null> {
  const got = await pairVenue({ typed, name: 'FirstPass Vantage', fetch: fetcher, onWaiting, cancelled });
  if (!got.ok) return got.message;
  setVenueLink(got.link);
  return null;
}

/**
 * 'off'      not connected to a Studio, or a game kept on this tablet only;
 * 'sending'  Studio has every event so far;
 * 'waiting'  Studio is there, but this isn't the game on its scoreboard;
 * 'away'     Studio isn't answering (not on its network, or it is closed);
 * 'stopped'  Studio won't take this tablet's events: `why` says which.
 */
export type VenueState =
  | { kind: 'off' }
  | { kind: 'sending' }
  | { kind: 'waiting' }
  | { kind: 'away' }
  | { kind: 'stopped'; why: 'not-allowed' | 'other-recorder' };

/** How soon to try again when Studio didn't take the events. */
export const VENUE_RETRY_MS = 5_000;
export const VENUE_WAITING_RETRY_MS = 15_000;

const states = new Map<string, VenueState>();
const listeners = new Map<string, Set<(s: VenueState) => void>>();
const running = new Set<string>();
const again = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** How far Studio has each game's stream from this tablet, by game. */
const through = new Map<string, number>();

function publish(gameId: string, state: VenueState): void {
  const prev = states.get(gameId);
  states.set(gameId, state);
  if (prev && prev.kind === state.kind) return;
  for (const fn of listeners.get(gameId) ?? []) fn(state);
}

export function currentVenueState(gameId: string): VenueState | undefined {
  return states.get(gameId);
}

function retry(gameId: string, ms: number, fetcher: VenueFetch): void {
  clearTimeout(timers.get(gameId));
  timers.set(
    gameId,
    setTimeout(() => void sendToVenue(gameId, fetcher), ms),
  );
}

/** Forgets everything held about a game's sending, for tests and when the link changes. */
export function resetVenue(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  states.clear();
  through.clear();
  running.clear();
  again.clear();
}

/**
 * Hands Studio whatever it doesn't have of this tablet's stream for one game.
 * Safe to call after every event: one runs at a time per game, and a call
 * during a run makes it look once more when it ends. Never throws.
 */
export async function sendToVenue(gameId: string, fetcher: VenueFetch = realFetch): Promise<void> {
  const link = venueLink();
  const game = getGame(gameId);
  // A game kept on this tablet only isn't in HQ, so Studio can't be following it.
  if (!link || !game || !game.clubCode) return publish(gameId, { kind: 'off' });
  // HQ said this tablet no longer records the game: its events aren't the record, so Studio isn't given them.
  const sync = currentSyncState(gameId);
  if (sync?.kind === 'lease lost' || sync?.kind === 'refused') return publish(gameId, { kind: 'stopped', why: 'other-recorder' });
  const was = states.get(gameId);
  if (was?.kind === 'stopped') return;
  if (running.has(gameId)) {
    again.add(gameId);
    return;
  }
  running.add(gameId);
  clearTimeout(timers.get(gameId));
  try {
    const primary = game.ownStream === 'primary';
    const refused = (reason: VenueRefusal): void => {
      if (reason === 'not-allowed' || reason === 'other-recorder') return publish(gameId, { kind: 'stopped', why: reason });
      publish(gameId, { kind: reason === 'not-followed' ? 'waiting' : 'away' });
      retry(gameId, reason === 'not-followed' ? VENUE_WAITING_RETRY_MS : VENUE_RETRY_MS, fetcher);
    };
    let have = through.get(gameId);
    if (have === undefined) {
      // Studio says how far it has the game (a helper's stream starts from its first event: Studio drops ones it holds).
      const asked = await sendVenueEvents(link, gameId, [], fetcher);
      if (!asked.ok) return refused(asked.reason);
      have = primary ? asked.throughSeq : 0;
    }
    for (;;) {
      const batch = loadUnsent(gameId, game.ownStream, have, VENUE_BATCH);
      if (batch.length === 0) break;
      const sent = await sendVenueEvents(link, gameId, batch, fetcher);
      if (!sent.ok) {
        through.delete(gameId);
        return refused(sent.reason);
      }
      const last = batch[batch.length - 1]?.seq ?? have;
      // Studio's answer is where the primary stream reaches there; if it didn't move, ask afresh next time.
      const next: number = primary ? sent.throughSeq : last;
      if (next <= have) {
        through.delete(gameId);
        return refused('unreachable');
      }
      have = next;
      through.set(gameId, have);
    }
    through.set(gameId, have);
    publish(gameId, { kind: 'sending' });
  } finally {
    running.delete(gameId);
    if (again.delete(gameId)) void sendToVenue(gameId, fetcher);
  }
}

/** Keeps Studio up to date with one game while its screen is open, and says how that is going. */
export function useVenue(gameId: string, eventCount: number): VenueState {
  const [state, setState] = useState<VenueState>(() => states.get(gameId) ?? { kind: 'off' });
  useEffect(() => {
    const set = listeners.get(gameId) ?? new Set();
    set.add(setState);
    listeners.set(gameId, set);
    return () => {
      set.delete(setState);
      clearTimeout(timers.get(gameId));
    };
  }, [gameId]);
  useEffect(() => {
    void sendToVenue(gameId);
  }, [gameId, eventCount]);
  return state;
}

/** What the game screen says about the venue link, or null when there is nothing to say. */
export function venueLabel(s: VenueState): string | null {
  switch (s.kind) {
    case 'off':
      return null;
    case 'sending':
      return 'Studio: live';
    case 'waiting':
      return 'Studio: not this game';
    case 'away':
      return 'Studio: not reached';
    case 'stopped':
      return s.why === 'not-allowed' ? 'Studio: connect again' : 'Studio: stopped';
  }
}
