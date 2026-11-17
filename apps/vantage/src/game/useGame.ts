import { clockState, deriveGame, mergeStreams, QUARTERS, reviewGame, type GameState, type ReviewIssue } from '@firstpass/engine';
import type { EventOf, GameConfig, GameEvent, GameEventType, Position, StreamId } from '@firstpass/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendEvent, getGame, loadEvents } from '../lib/db';
import { onRemoteEvents } from '../lib/helper';
import { uuidv7 } from '../lib/uuid';
import { nextSeq } from './helperEvents';

export interface Game {
  id: string;
  config: GameConfig;
  /**
   * The game's record: the primary stream with a helper statistician's
   * substitutions and corrections merged in. Everything on screen is folded
   * from this.
   */
  events: GameEvent[];
  /** The stream this tablet writes: 'primary' when recording the game, 'helper:<id>' when helping with it. */
  ownStream: StreamId;
  /** How many events this tablet has written, so the outbox knows when there is more to send. */
  ownCount: number;
  state: GameState;
  /** Our bench after the latest lineup change. */
  bench: string[];
  /** Flags, amber actions, chain checks, and long gaps in the current quarter (every quarter at full time). */
  issues: ReviewIssue[];
  /** Ids of actions that carry an amber dot. */
  amberIds: ReadonlySet<string>;
  append<T extends GameEventType>(type: T, payload: EventOf<T>['payload']): EventOf<T>;
}

/**
 * Loads a game from the device and keeps its derived state in step with every
 * new event: the ones written here, and the other tablet's as they are read
 * from the club (lib/helper.ts).
 */
export function useGame(id: string): Game | null {
  const [saved] = useState(() => getGame(id));
  // Everything held, every stream.
  const [held, setHeld] = useState<GameEvent[]>(() => (saved ? loadEvents(id) : []));
  const ownStream: StreamId = saved?.ownStream ?? 'primary';

  // What is held as of the last write, so several events in one handler get consecutive seqs.
  const log = useRef(held);

  useEffect(
    () =>
      onRemoteEvents(id, () => {
        log.current = loadEvents(id);
        setHeld(log.current);
      }),
    [id],
  );

  const append = useCallback(
    <T extends GameEventType>(type: T, payload: EventOf<T>['payload']): EventOf<T> => {
      const prev = log.current;
      const created = {
        id: uuidv7(),
        gameId: id,
        stream: ownStream,
        seq: nextSeq(prev, ownStream),
        type,
        payload,
        recordedAt: new Date().toISOString(),
      } as EventOf<T>;
      appendEvent(created);
      log.current = [...prev, created];
      setHeld(log.current);
      return created;
    },
    [id, ownStream],
  );

  return useMemo(() => {
    if (!saved) return null;
    const events = mergeStreams(held);
    const state = deriveGame(saved.config, events);
    // At full time the audit covers every quarter; at other breaks, the one just played.
    const fullTime = state.period >= QUARTERS && clockState(events, saved.config.quarterMs, Date.now()).inBreak;
    const issues = reviewGame(saved.config, events, fullTime ? 'all' : state.period);
    const amberIds = new Set(issues.flatMap((i) => (i.kind === 'amber' || i.kind === 'flag' ? [i.event.id] : [])));
    const ownCount = held.reduce((n, e) => (e.stream === ownStream ? n + 1 : n), 0);
    return { id, config: saved.config, events, ownStream, ownCount, state, bench: benchOf(events), issues, amberIds, append };
  }, [saved, held, id, append, ownStream]);
}

function benchOf(events: readonly GameEvent[]): string[] {
  const deleted = new Set(events.flatMap((e) => (e.type === 'correction' && e.payload.op === 'delete' ? [e.payload.target] : [])));
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'lineup_change' && e.payload.team === 'us' && !deleted.has(e.id)) return e.payload.bench;
  }
  return [];
}

/** Re-renders every `ms` while `active`, for the running clock. */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return active ? now : Date.now();
}

export function useClock(game: Game | null) {
  const probe = game ? clockState(game.events, game.config.quarterMs, Date.now()) : null;
  const now = useNow(!!probe?.running);
  return game ? clockState(game.events, game.config.quarterMs, now) : null;
}

export { shortName } from './names';

export function lineupOf(state: GameState): Partial<Record<Position, string>> {
  return state.lineup ?? {};
}
