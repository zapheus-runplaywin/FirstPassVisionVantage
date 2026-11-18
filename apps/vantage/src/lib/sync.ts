import type { GameEvent } from '@firstpass/schema';
import { AppState } from 'react-native';
import { useEffect, useState } from 'react';
import { getGame, getKv, loadUnsent, markSynced, setKv } from './db';
import { client, clientFor } from './supabase';
import { findClub } from './clubs';
import { classify, messageOf } from './errors';
import { uuidv7 } from './uuid';

/*
 * The outbox. Every event is saved on the device first; this worker sends
 * what the server has not confirmed, in seq order, and clears up to the seq
 * the server reports. When the club can't be reached, retries back off from
 * 0.5 s to 8 s and restart when the app comes to the foreground. When HQ
 * answers with a refusal (no Statistician role, stood down, game finished)
 * it stops and shows HQ's reason; the next event or a return to the app
 * asks once more, in case the role has been given back. The statistician
 * never waits on it.
 *
 * A game sends its own stream: 'primary' from the tablet recording it, or
 * the helper's stream ('helper:<id>') from a tablet helping with it. A
 * helper never creates the game; HQ already has it.
 */

export type SyncState =
  | { kind: 'off' }
  | { kind: 'signed out' }
  | { kind: 'local only' }
  | { kind: 'synced' }
  | { kind: 'queued'; count: number }
  | { kind: 'offline'; count: number; since: number }
  | { kind: 'lease lost' }
  | { kind: 'refused'; message: string };

const BATCH = 200;
const listeners = new Map<string, Set<(s: SyncState) => void>>();
const states = new Map<string, SyncState>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const delays = new Map<string, number>();
const running = new Set<string>();

function publish(gameId: string, state: SyncState): void {
  states.set(gameId, state);
  for (const fn of listeners.get(gameId) ?? []) fn(state);
}

/** The last state published for a game, if any. */
export function currentSyncState(gameId: string): SyncState | undefined {
  return states.get(gameId);
}

export function deviceId(): string {
  let id = getKv('deviceId');
  if (!id) {
    id = uuidv7();
    setKv('deviceId', id);
  }
  return id;
}

/** Sends everything unsent for one game. Safe to call often; runs one at a time per game. */
export async function syncGame(gameId: string): Promise<void> {
  const game = getGame(gameId);
  if (!game) return;
  const club = findClub(game.clubCode);
  if (!club) return publish(gameId, { kind: game.clubCode ? 'off' : 'local only' });
  const supabase = clientFor(club);
  if (running.has(gameId)) return;
  running.add(gameId);
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return publish(gameId, { kind: 'signed out' });

    const helping = game.ownStream !== 'primary';
    let pairCode = game.pairCode;
    if (!pairCode && !helping) {
      const created = await supabase.rpc('create_game', {
        p_id: game.id,
        p_config: game.config,
        p_device_id: deviceId(),
        p_team_id: game.teamId,
        p_fixture_id: game.fixtureId,
      });
      if (created.error) throw created.error;
      pairCode = (created.data as { pair_code: string }).pair_code;
      markSynced(game.id, game.ackedSeq, pairCode);
    }

    let acked = game.ackedSeq;
    for (;;) {
      const batch: GameEvent[] = loadUnsent(gameId, game.ownStream, acked, BATCH);
      if (batch.length === 0) break;
      const res = await supabase.rpc('append_game_events', { p_game_id: gameId, p_stream: game.ownStream, p_events: batch });
      if (res.error) throw res.error;
      const confirmed = res.data as number;
      if (confirmed <= acked) throw new Error('server did not advance');
      acked = confirmed;
      markSynced(gameId, acked, null);
      publish(gameId, { kind: 'queued', count: loadUnsent(gameId, game.ownStream, acked, BATCH).length });
    }
    delays.delete(gameId);
    publish(gameId, { kind: 'synced' });
  } catch (err) {
    const message = messageOf(err);
    if (/recorder lease/.test(message)) return publish(gameId, { kind: 'lease lost' });
    const problem = classify(err);
    if (problem.kind === 'refused') {
      clearTimeout(timers.get(gameId));
      delays.delete(gameId);
      return publish(gameId, problem);
    }
    const count = loadUnsent(gameId, game.ownStream, getGame(gameId)?.ackedSeq ?? 0, 10_000).length;
    const prev = states.get(gameId);
    const since = prev?.kind === 'offline' ? prev.since : Date.now();
    publish(gameId, { kind: 'offline', count, since });
    const delay = Math.min(8000, (delays.get(gameId) ?? 250) * 2);
    delays.set(gameId, delay);
    clearTimeout(timers.get(gameId));
    timers.set(
      gameId,
      setTimeout(() => void syncGame(gameId), delay),
    );
  } finally {
    running.delete(gameId);
  }
}

/** The sync state of one game, kicked whenever `events` changes or the app returns. */
export function useSync(gameId: string, eventCount: number): SyncState {
  const [state, setState] = useState<SyncState>(() => states.get(gameId) ?? ({ kind: client() ? 'queued' : 'off', count: 0 } as SyncState));
  useEffect(() => {
    const set = listeners.get(gameId) ?? new Set();
    set.add(setState);
    listeners.set(gameId, set);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncGame(gameId));
    return () => {
      set.delete(setState);
      sub.remove();
    };
  }, [gameId]);
  useEffect(() => {
    void syncGame(gameId);
  }, [gameId, eventCount]);
  return state;
}

export function syncLabel(s: SyncState): string {
  switch (s.kind) {
    case 'off':
      return 'Saved on device';
    case 'signed out':
      return 'Not signed in';
    case 'local only':
      return 'Local game';
    case 'synced':
      return 'Synced';
    case 'queued':
      return `${s.count} queued`;
    case 'offline':
      return Date.now() - s.since > 30_000 ? `Offline · ${s.count} queued` : `${s.count} queued`;
    case 'lease lost':
      return 'Another device has taken over';
    case 'refused':
      return `Not sent: ${s.message}`;
  }
}
