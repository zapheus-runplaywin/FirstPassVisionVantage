import { streamCursors } from '@firstpass/engine';
import type { GameConfig, GameEvent, StreamId } from '@firstpass/schema';
import { AppState } from 'react-native';
import { useEffect, useState } from 'react';
import { findClub } from './clubs';
import { getGame, loadEvents, saveHelpedGame, saveRemoteEvents, setHelperOn } from './db';
import { messageOf } from './errors';
import { clientFor, currentClub } from './supabase';

/*
 * A helper statistician: a second person who does the substitutions and the
 * corrections so the one recording the game can keep their eyes on the play.
 *
 * The recorder turns the helper on for a game (setHelper). The helper joins
 * with the game's pair code (joinAsHelper) and from then on writes their own
 * stream, 'helper:<their id>', through the same outbox as a recorded game
 * (sync.ts). HQ takes only substitutions and corrections on that stream.
 *
 * Each tablet also needs the other's events: the helper sees what was
 * recorded, the recorder sees what the helper changed. pullGame reads the
 * streams this tablet does not write and keeps copies on the device, and
 * useRemote does that every few seconds while a game is open. Both need
 * signal; a game recorded with none simply has no helper until it returns.
 */

const PAGE = 1000;
/** How often an open game reads the other tablet's events. */
export const PULL_MS = 3_000;
/** After this long without a good read, what is on screen may be out of date. */
export const STALE_MS = 15_000;

/** A row of public.game_events, as PostgREST returns it. */
interface EventRow {
  game_id: string;
  stream: string;
  seq: number;
  id: string;
  type: string;
  payload: unknown;
  recorded_at: string;
}
const COLS = 'game_id, stream, seq, id, type, payload, recorded_at';

function fromRow(r: EventRow): GameEvent {
  return { id: r.id, gameId: r.game_id, stream: r.stream, seq: r.seq, type: r.type, payload: r.payload, recordedAt: r.recorded_at } as GameEvent;
}

type Client = ReturnType<typeof clientFor>;

/**
 * What the club holds beyond `cursors` (how far each stream is held here):
 * the primary stream when `withPrimary`, in pages, and every helper stream.
 */
async function fetchBeyond(supabase: Client, gameId: string, cursors: Record<string, number>, withPrimary: boolean): Promise<GameEvent[]> {
  const out: GameEvent[] = [];
  if (withPrimary) {
    let after = cursors.primary ?? 0;
    for (;;) {
      const res = await supabase.from('game_events').select(COLS).eq('game_id', gameId).eq('stream', 'primary').gt('seq', after).order('seq').limit(PAGE);
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as EventRow[];
      out.push(...rows.map(fromRow));
      if (rows.length < PAGE) break;
      after = (rows[rows.length - 1] as EventRow).seq;
    }
  }
  // A game has a few dozen substitutions and corrections at most, so one read.
  const res = await supabase.from('game_events').select(COLS).eq('game_id', gameId).like('stream', 'helper:%').order('stream').order('seq').limit(PAGE);
  if (res.error) throw res.error;
  for (const r of (res.data ?? []) as EventRow[]) if (r.seq > (cursors[r.stream] ?? 0)) out.push(fromRow(r));
  return out;
}

const listeners = new Map<string, Set<() => void>>();
const pulling = new Map<string, Promise<number>>();
const lastGood = new Map<string, number>();

/** Calls `fn` whenever a read brings new events for the game. Returns the unsubscribe. */
export function onRemoteEvents(gameId: string, fn: () => void): () => void {
  const set = listeners.get(gameId) ?? new Set();
  set.add(fn);
  listeners.set(gameId, set);
  return () => {
    set.delete(fn);
  };
}

/**
 * Reads the events this tablet does not write and keeps them on the device:
 * for the recorder, the helper's; for a helper, the recorder's and any
 * earlier helper's. Returns how many were new. Safe to call often; one read
 * at a time per game. Throws when the club can't be reached or says no.
 */
export function pullGame(gameId: string): Promise<number> {
  const running = pulling.get(gameId);
  if (running) return running;
  const job = (async () => {
    const game = getGame(gameId);
    const club = game ? findClub(game.clubCode) : null;
    if (!game || !club) return 0;
    const supabase = clientFor(club);
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Not signed in');
    const cursors = streamCursors(loadEvents(gameId));
    const events = await fetchBeyond(supabase, gameId, cursors, game.ownStream !== 'primary');
    lastGood.set(gameId, Date.now());
    // This tablet's own stream is already here, apart from when a helper picks a game up on a second device (joinAsHelper).
    const added = saveRemoteEvents(events.filter((e) => e.stream !== game.ownStream));
    if (added > 0) for (const fn of listeners.get(gameId) ?? []) fn();
    return added;
  })().finally(() => pulling.delete(gameId));
  pulling.set(gameId, job);
  return job;
}

/**
 * Recorder: turns the helper on or off for a game the club already has.
 * Throws with HQ's reason, or when the club can't be reached.
 */
export async function setHelper(gameId: string, on: boolean): Promise<void> {
  const game = getGame(gameId);
  const club = game ? findClub(game.clubCode) : null;
  if (!game || !club) throw new Error('Send this game to your club first: choose your club and sign in.');
  if (!game.pairCode) throw new Error('This game has not reached your club yet. Try again when it shows Synced.');
  const res = await clientFor(club).rpc('set_game_helper', { p_game_id: gameId, p_on: on });
  if (res.error) throw new Error(messageOf(res.error));
  setHelperOn(gameId, on);
}

/** The game row pair_game_helper returns. */
interface GameRow {
  id: string;
  config: GameConfig;
  created_at: string;
  team_id: string | null;
  fixture_id: string | null;
  pair_code: string | null;
}

/**
 * Joins a game being recorded on another tablet as its helper, by the pair
 * code on that tablet, and brings the game so far onto this device. Returns
 * the game's id. Throws with the reason when it can't: a wrong code, the
 * helper not turned on, or no Statistician role.
 */
export async function joinAsHelper(code: string): Promise<string> {
  const club = currentClub();
  if (!club) throw new Error('Choose your club first.');
  const supabase = clientFor(club);
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in first.');
  const res = await supabase.rpc('pair_game_helper', { p_code: code });
  if (res.error) throw new Error(messageOf(res.error));
  const row = res.data as GameRow | null;
  // HQ answers a wrong code with an empty row rather than an error.
  if (!row?.id) throw new Error('No live game has that code. Check it on the tablet recording the game.');

  const ownStream: StreamId = `helper:${userId}`;
  // Everything so far, this helper's own earlier changes included (picking the game up again, or on a second device),
  // so the next change takes the next number in their stream.
  const events = await fetchBeyond(supabase, row.id, streamCursors(loadEvents(row.id)), true);
  saveRemoteEvents(events);
  lastGood.set(row.id, Date.now());
  const ackedSeq = streamCursors(events.filter((e) => e.stream === ownStream))[ownStream] ?? 0;
  saveHelpedGame({
    id: row.id,
    config: row.config,
    createdAt: row.created_at,
    clubCode: club.code,
    teamId: row.team_id,
    fixtureId: row.fixture_id,
    pairCode: row.pair_code,
    ackedSeq,
    ownStream,
    helperOn: false,
  });
  return row.id;
}

export interface RemoteState {
  /** Goes up each time a read brings new events. */
  version: number;
  /** No good read for a while: what the other tablet did may not be showing. */
  stale: boolean;
}

/**
 * While `active`, reads the other tablet's events every few seconds and when
 * the app comes back to the front.
 */
export function useRemote(gameId: string, active: boolean): RemoteState {
  const [state, setState] = useState<RemoteState>({ version: 0, stale: false });
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const started = Date.now();
    const tick = () =>
      void pullGame(gameId)
        .catch(() => 0)
        .then((added) => {
          if (stopped) return;
          const stale = Date.now() - (lastGood.get(gameId) ?? started) > STALE_MS;
          setState((s) => (added > 0 || s.stale !== stale ? { version: s.version + (added > 0 ? 1 : 0), stale } : s));
        });
    tick();
    const timer = setInterval(tick, PULL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [gameId, active]);
  return state;
}
