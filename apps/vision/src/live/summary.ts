import { clockState, deriveGame, gameStatus } from '@firstpass/engine';
import type { GameConfig, GameEvent, Team } from '@firstpass/schema';
import type { Connection } from './feed';

/** A running clock with no new event for this long may mean the tablet lost signal. */
export const QUIET_MS = 30_000;
/** Without live updates, the last good read may be this old before the coach is warned. */
export const OFFLINE_MS = 15_000;
/** How long after Studio last answered over the venue link it still counts as in touch (a request waits there up to 20 s). */
export const VENUE_FRESH_MS = 30_000;

export interface QuarterScore {
  period: number;
  us: number;
  them: number;
}

export interface ScoreSummary {
  names: Record<Team, string>;
  score: Record<Team, number>;
  phase: 'not started' | 'playing' | 'break' | 'full time';
  period: number;
  /** "Q3", "Q2 break", "Full time" or "Not started". */
  label: string;
  /** Quarter clock, mm:ss, as Vantage shows it. */
  clock: string;
  running: boolean;
  quarters: QuarterScore[];
  /** Who takes the next centre pass, while one is due. */
  centrePass: Team | null;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Reads a game's config as saved by Vantage, filling anything missing so an odd row cannot crash the screen. */
export function readConfig(raw: unknown): GameConfig {
  const c = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<GameConfig>;
  return {
    us: typeof c.us === 'string' && c.us.trim() ? c.us : 'Us',
    them: typeof c.them === 'string' && c.them.trim() ? c.them : 'Them',
    quarterMs: typeof c.quarterMs === 'number' && c.quarterMs > 0 ? c.quarterMs : 15 * 60_000,
    q1AttackEnd: c.q1AttackEnd === 'right' ? 'right' : 'left',
    firstCentrePass: c.firstCentrePass === 'them' ? 'them' : 'us',
  };
}

/** Score, quarter and clock from the event log alone. */
export function scoreSummary(config: GameConfig, events: readonly GameEvent[], now: number): ScoreSummary {
  const names = { us: config.us, them: config.them };
  if (events.length === 0) {
    return {
      names,
      score: { us: 0, them: 0 },
      phase: 'not started',
      period: 1,
      label: 'Not started',
      clock: formatClock(config.quarterMs),
      running: false,
      quarters: [],
      centrePass: null,
    };
  }
  const status = gameStatus(config, events, now);
  const clock = clockState(events, config.quarterMs, now);
  const state = deriveGame(config, events);
  const quarters = Object.entries(state.quarters)
    .map(([p, q]) => ({ period: Number(p), us: q.us, them: q.them }))
    .sort((a, b) => a.period - b.period);
  return {
    names,
    score: status.score,
    phase: status.phase,
    period: status.period,
    label: status.label,
    clock: formatClock(clock.remainingMs),
    running: clock.running,
    quarters,
    centrePass: status.phase === 'playing' && state.centrePassPending ? state.nextCentrePass : null,
  };
}

export type Freshness = { kind: 'fresh' } | { kind: 'quiet'; seconds: number } | { kind: 'offline'; seconds: number | null };

/** Whether the coach should be warned the numbers may be behind. */
export function freshness(
  feed: { connection: Connection; lastEventAt: number | null; lastReadAt: number | null; venueReadAt?: number | null },
  running: boolean,
  now: number,
): Freshness {
  // Studio answering over the venue link counts as being in touch, whatever the internet is doing.
  const venue = feed.venueReadAt != null && now - feed.venueReadAt <= VENUE_FRESH_MS;
  if (!venue && feed.connection !== 'live' && (feed.lastReadAt === null || now - feed.lastReadAt > OFFLINE_MS)) {
    return { kind: 'offline', seconds: feed.lastReadAt === null ? null : Math.floor((now - feed.lastReadAt) / 1000) };
  }
  if (running && feed.lastEventAt !== null && now - feed.lastEventAt > QUIET_MS) {
    return { kind: 'quiet', seconds: Math.floor((now - feed.lastEventAt) / 1000) };
  }
  return { kind: 'fresh' };
}
