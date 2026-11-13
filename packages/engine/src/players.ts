import { POSITIONS, type GameEvent, type Position } from '@firstpass/schema';
import { liveEvents } from './corrections';

export type Lineup = Partial<Record<Position, string>>;

/**
 * Our lineup as it stood when each action was recorded, keyed by event id.
 * Actions record a position, not a person, so this is how a shot by "GA" in
 * Q1 stays with the player who was GA then, after later subs and swaps.
 */
export function lineupsAt(events: readonly GameEvent[]): Map<string, Lineup> {
  const out = new Map<string, Lineup>();
  let lineup: Lineup = {};
  for (const e of liveEvents(events)) {
    if (e.type === 'lineup_change' && e.payload.team === 'us') lineup = { ...e.payload.lineup };
    else if (e.type === 'action') out.set(e.id, lineup);
  }
  return out;
}

export interface CourtTime {
  /** Game-clock time on court, in ms. */
  totalMs: number;
  byPosition: Partial<Record<Position, number>>;
  byPeriod: Record<number, number>;
}

/**
 * How long each of our players has been on court, by game clock (stoppages
 * do not count), split by position and by quarter.
 *
 * A stint starts when the quarter starts or when a player comes on, and ends
 * when they go off, swap position, or the quarter ends. Lineup changes made
 * during a break take effect from the start of the next quarter, whatever
 * time they carry. `remainingMs` is the quarter clock now, for a quarter
 * still being played; without it an unfinished quarter counts up to its last
 * recorded clock time.
 */
export function courtTime(events: readonly GameEvent[], quarterMs: number, remainingMs?: number): Record<string, CourtTime> {
  const out: Record<string, CourtTime> = {};
  let lineup: Lineup = {};
  let period = 1;
  let inBreak = true;
  /** Clock time each position's current player came on, this quarter. */
  let since: Partial<Record<Position, number>> = {};
  let lastClock = quarterMs;

  const close = (pos: Position, at: number): void => {
    const name = lineup[pos];
    const from = since[pos];
    if (!name || from === undefined) return;
    const ms = Math.max(0, from - at);
    const t = (out[name] ??= { totalMs: 0, byPosition: {}, byPeriod: {} });
    t.totalMs += ms;
    t.byPosition[pos] = (t.byPosition[pos] ?? 0) + ms;
    t.byPeriod[period] = (t.byPeriod[period] ?? 0) + ms;
  };
  const openAll = (at: number): void => {
    since = Object.fromEntries(POSITIONS.map((p) => [p, at]));
  };

  for (const e of liveEvents(events)) {
    if ('clockMs' in e.payload && !inBreak) lastClock = e.payload.clockMs;
    switch (e.type) {
      case 'period_start':
        period = e.payload.period;
        inBreak = false;
        lastClock = quarterMs;
        openAll(quarterMs);
        break;
      case 'period_end':
        if (!inBreak) for (const p of POSITIONS) close(p, e.payload.clockMs);
        inBreak = true;
        since = {};
        break;
      case 'lineup_change': {
        if (e.payload.team !== 'us') break;
        const next = e.payload.lineup;
        if (!inBreak) {
          const at = e.payload.clockMs;
          for (const p of POSITIONS) {
            if (next[p] === lineup[p]) continue;
            close(p, at);
            since[p] = at;
          }
        }
        lineup = { ...next };
        break;
      }
      default:
        break;
    }
  }
  if (!inBreak) for (const p of POSITIONS) close(p, remainingMs ?? lastClock);
  return out;
}
