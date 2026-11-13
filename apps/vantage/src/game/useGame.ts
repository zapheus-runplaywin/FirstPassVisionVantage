import { clockState, deriveGame, QUARTERS, reviewGame, type GameState, type ReviewIssue } from '@firstpass/engine';
import type { EventOf, GameConfig, GameEvent, GameEventType, Position } from '@firstpass/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendEvent, getGame, loadEvents } from '../lib/db';
import { uuidv7 } from '../lib/uuid';

export interface Game {
  id: string;
  config: GameConfig;
  events: GameEvent[];
  state: GameState;
  /** Our bench after the latest lineup change. */
  bench: string[];
  /** Flags, amber actions, chain checks, and long gaps in the current quarter (every quarter at full time). */
  issues: ReviewIssue[];
  /** Ids of actions that carry an amber dot. */
  amberIds: ReadonlySet<string>;
  append<T extends GameEventType>(type: T, payload: EventOf<T>['payload']): EventOf<T>;
}

/** Loads a game from the device and keeps its derived state in step with every new event. */
export function useGame(id: string): Game | null {
  const [saved] = useState(() => getGame(id));
  const [events, setEvents] = useState<GameEvent[]>(() => (saved ? loadEvents(id) : []));

  // The log as of the last write, so several events in one handler get consecutive seqs.
  const log = useRef(events);

  const append = useCallback(
    <T extends GameEventType>(type: T, payload: EventOf<T>['payload']): EventOf<T> => {
      const prev = log.current;
      const created = {
        id: uuidv7(),
        gameId: id,
        stream: 'primary',
        seq: (prev[prev.length - 1]?.seq ?? 0) + 1,
        type,
        payload,
        recordedAt: new Date().toISOString(),
      } as EventOf<T>;
      appendEvent(created);
      log.current = [...prev, created];
      setEvents(log.current);
      return created;
    },
    [id],
  );

  return useMemo(() => {
    if (!saved) return null;
    const state = deriveGame(saved.config, events);
    // At full time the audit covers every quarter; at other breaks, the one just played.
    const fullTime = state.period >= QUARTERS && clockState(events, saved.config.quarterMs, Date.now()).inBreak;
    const issues = reviewGame(saved.config, events, fullTime ? 'all' : state.period);
    const amberIds = new Set(issues.flatMap((i) => (i.kind === 'amber' || i.kind === 'flag' ? [i.event.id] : [])));
    return { id, config: saved.config, events, state, bench: benchOf(events), issues, amberIds, append };
  }, [saved, events, id, append]);
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

export function shortName(label: string | undefined): string {
  if (!label) return '';
  const parts = label.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? '');
}

export function lineupOf(state: GameState): Partial<Record<Position, string>> {
  return state.lineup ?? {};
}
