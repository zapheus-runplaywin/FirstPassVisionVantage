import type { ActionPayload, CourtEnd, EntryMode, GameConfig, GameEvent, Position, Team } from '@firstpass/schema';
import { liveEvents, type LiveEvent } from './corrections';
import { zoneOf, type Third } from './geometry';

/** How the team that has the ball got it; decides whether a goal counts as centre pass to goal. */
export type ChainStart = 'centre pass' | 'rebound' | 'throw in' | 'gain' | 'turnover';

export interface QuarterStats {
  us: number;
  them: number;
  /** Our gains (opposition turnovers we won). */
  gains: number;
  /** Our turnovers. */
  unforced: number;
  /** Our shots. */
  shots: number;
  goals: number;
  /** Our centre passes received, and how many of them ended in a goal. */
  centrePasses: number;
  centrePassGoals: number;
}

export interface GameState {
  period: number;
  attackEnd: CourtEnd;
  mode: EntryMode;
  score: Record<Team, number>;
  /** Who takes the next centre pass. */
  nextCentrePass: Team;
  /** True after a goal or at a quarter start, until the centre pass is received. */
  centrePassPending: boolean;
  /** Who has the ball, if known. */
  possession: Team | null;
  chain: { team: Team; from: ChainStart } | null;
  shotsByPosition: Partial<Record<Position, { attempts: number; goals: number }>>;
  /** Our shots by the player who was in that position when the shot was taken. */
  shotsByPlayer: Record<string, { attempts: number; goals: number; positions: Position[] }>;
  centrePass: Record<Team, { received: number; goals: number }>;
  gains: number;
  unforced: number;
  /** Where our turnovers happened; 'unknown' when no court position was tapped. */
  unforcedByThird: Partial<Record<Third | 'unknown', number>>;
  turnoversByPosition: Partial<Record<Position | '?', number>>;
  quarters: Record<number, QuarterStats>;
  /** Our lineup after the latest change, if any was logged. */
  lineup: Partial<Record<Position, string>> | null;
}

export function initialState(config: GameConfig): GameState {
  return {
    period: 1,
    attackEnd: config.q1AttackEnd,
    mode: 'core',
    score: { us: 0, them: 0 },
    nextCentrePass: config.firstCentrePass,
    centrePassPending: true,
    possession: null,
    chain: null,
    shotsByPosition: {},
    shotsByPlayer: {},
    centrePass: { us: { received: 0, goals: 0 }, them: { received: 0, goals: 0 } },
    gains: 0,
    unforced: 0,
    unforcedByThird: {},
    turnoversByPosition: {},
    quarters: {},
    lineup: null,
  };
}

const other = (team: Team): Team => (team === 'us' ? 'them' : 'us');

function quarter(state: GameState): QuarterStats {
  return (state.quarters[state.period] ??= {
    us: 0,
    them: 0,
    gains: 0,
    unforced: 0,
    shots: 0,
    goals: 0,
    centrePasses: 0,
    centrePassGoals: 0,
  });
}

/**
 * Apply one live event. Mutates and returns `state` for speed in long games;
 * use `deriveGame` for a fresh state from a whole log.
 */
export function applyEvent(state: GameState, event: LiveEvent): GameState {
  switch (event.type) {
    case 'period_start': {
      const { period, attackEnd, centrePass, mode } = event.payload;
      state.period = period;
      state.attackEnd = attackEnd;
      state.mode = mode;
      state.nextCentrePass = centrePass;
      state.centrePassPending = true;
      state.possession = null;
      state.chain = null;
      quarter(state);
      return state;
    }
    case 'lineup_change':
      if (event.payload.team === 'us') state.lineup = { ...event.payload.lineup };
      return state;
    case 'action':
      applyAction(state, event.payload);
      return state;
    default:
      return state;
  }
}

function applyAction(state: GameState, a: ActionPayload): void {
  const team = a.team;
  const opponent = other(team);
  const q = quarter(state);

  switch (a.action) {
    case 'Receive':
      state.possession = team;
      state.centrePassPending = false;
      state.chain = { team, from: 'centre pass' };
      state.centrePass[team].received++;
      if (team === 'us') q.centrePasses++;
      return;

    case 'Goal':
    case 'Miss': {
      const goal = a.action === 'Goal';
      if (team === 'us') {
        if (a.player && a.player !== '?') {
          const s = (state.shotsByPosition[a.player] ??= { attempts: 0, goals: 0 });
          s.attempts++;
          if (goal) s.goals++;
          const name = state.lineup?.[a.player];
          if (name) {
            const p = (state.shotsByPlayer[name] ??= { attempts: 0, goals: 0, positions: [] });
            p.attempts++;
            if (goal) p.goals++;
            if (!p.positions.includes(a.player)) p.positions.push(a.player);
          }
        }
        q.shots++;
        if (goal) q.goals++;
      }
      if (goal) {
        state.score[team]++;
        q[team]++;
        if (state.chain?.team === team && state.chain.from === 'centre pass') {
          state.centrePass[team].goals++;
          if (team === 'us') q.centrePassGoals++;
        }
        state.nextCentrePass = opponent;
        state.centrePassPending = true;
        state.possession = null;
        state.chain = null;
      } else if (a.rebound === 'ours') {
        // An offensive rebound keeps the same possession chain going.
        state.possession = team;
        state.chain ??= { team, from: 'rebound' };
      } else if (a.rebound === 'theirs') {
        state.possession = opponent;
        state.chain = { team: opponent, from: 'rebound' };
      } else if (a.rebound === 'out') {
        state.possession = opponent;
        state.chain = { team: opponent, from: 'throw in' };
      }
      return;
    }

    case 'Won it':
      state.possession = team;
      state.centrePassPending = false;
      state.chain = { team, from: 'gain' };
      if (team === 'us') {
        state.gains++;
        q.gains++;
      }
      return;

    case 'Lost it':
      state.possession = opponent;
      state.centrePassPending = false;
      state.chain = { team: opponent, from: 'turnover' };
      if (team === 'us') {
        state.unforced++;
        q.unforced++;
        const third = a.at ? zoneOf(a.at).third : 'unknown';
        state.unforcedByThird[third] = (state.unforcedByThird[third] ?? 0) + 1;
        if (a.player) state.turnoversByPosition[a.player] = (state.turnoversByPosition[a.player] ?? 0) + 1;
      }
      return;

    case 'Feed':
    case 'Touch':
    case 'Penalty':
      // Recorded for Net Points; possession does not change.
      return;
  }
}

/** Fold a whole event log (corrections included) into the game state. */
export function deriveGame(config: GameConfig, events: readonly GameEvent[]): GameState {
  let state = initialState(config);
  for (const event of liveEvents(events)) state = applyEvent(state, event);
  return state;
}

/**
 * What the break review offers for the next quarter before the statistician
 * confirms or flips it. Teams change ends every quarter, so the next end is the
 * opposite of the one actually played (including any flip made at the last
 * break). Centre passes keep alternating across the break.
 */
export function nextPeriodDefaults(state: GameState): { period: number; attackEnd: CourtEnd; centrePass: Team } {
  return {
    period: state.period + 1,
    attackEnd: state.attackEnd === 'left' ? 'right' : 'left',
    centrePass: state.nextCentrePass,
  };
}
