import { liveEvents } from '@firstpass/engine';
import type { CourtPoint, GameEvent, Position, Team } from '@firstpass/schema';

/*
 * The game as a list of possessions, which is what the coach's figures are
 * made from. A possession belongs to one team and starts with how they got
 * the ball:
 *   centre pass  a Receive after a goal or at a quarter start
 *   gain         they won it (intercept, deflection, pickup, rebound in play)
 *   turnover     the other team gave it away (unforced)
 *   rebound      they took the rebound after the other team missed
 *   throw in     the other team's miss went out
 *   unknown      the log shows an end with no start (a missed tap)
 * and ends with a goal, a loss (forced when the other team won it, unforced
 * when given away), a miss that went to the other team, or the quarter end.
 * An offensive rebound keeps the possession going. Like the engine's
 * deriveGame, a miss's rebound is read from the shooting team's side:
 * 'ours' is an OREB (the shooters kept it), 'theirs' a DREB. Feed, Touch and Penalty
 * don't change who has the ball. Corrections are applied first.
 */

export type Source = 'centre pass' | 'gain' | 'turnover' | 'rebound' | 'throw in' | 'unknown';
export type Outcome = 'goal' | 'lost' | 'miss' | 'open' | 'period end';

export interface Shot {
  team: Team;
  period: number;
  clockMs: number;
  position: Position | null;
  /** Our shooter's name from the lineup at the time, when known. */
  player: string | null;
  goal: boolean;
  at: CourtPoint | null;
}

export interface Loss {
  /** True when the other team won it, false when it was given away. */
  forced: boolean;
  /** Our position and player who lost it (unforced only; a forced loss records the winner). */
  position: Position | null;
  player: string | null;
  /** Who won it, for a forced loss by the opposition to us. */
  winnerPosition: Position | null;
  winner: string | null;
  at: CourtPoint | null;
}

export interface Possession {
  team: Team;
  period: number;
  /** Quarter clock when it started. */
  clockMs: number;
  source: Source;
  outcome: Outcome;
  shots: Shot[];
  loss: Loss | null;
}

export type Lineup = Partial<Record<Position, string>>;

/** One player change from a lineup_change event: on court at a position, replacing someone. */
export interface Change {
  team: Team;
  period: number;
  clockMs: number;
  position: Position;
  on: string;
  off: string;
  /** How many possessions came before it: the index of the first possession after it. */
  index: number;
}

export interface GameModel {
  possessions: Possession[];
  /** Player changes in log order, both teams (the opposition's when the tablet records names). */
  changes: Change[];
  /** Our current lineup, from the latest lineup change. */
  lineup: Lineup;
  /** Their current lineup, when the tablet records their names. */
  theirLineup: Lineup;
  /** The quarter the log is up to. */
  period: number;
}

const other = (t: Team): Team => (t === 'us' ? 'them' : 'us');
const pos = (p: string | null | undefined): Position | null => (p && p !== '?' ? (p as Position) : null);

export function buildModel(events: readonly GameEvent[]): GameModel {
  const possessions: Possession[] = [];
  const changes: Change[] = [];
  let open: Possession | null = null;
  let lineup: Lineup = {};
  let theirLineup: Lineup = {};
  let period = 1;

  /** Ends the open possession, if any, at a quarter boundary. */
  const closeOpen = (): void => {
    if (open && open.outcome === 'open') open.outcome = 'period end';
    open = null;
  };
  const start = (team: Team, source: Source, p: number, clockMs: number): Possession => {
    closeOpen();
    open = { team, period: p, clockMs, source, outcome: 'open', shots: [], loss: null };
    possessions.push(open);
    return open;
  };
  /** The possession an end belongs to: the open one if it is this team's, else a new one we can't place. */
  const current = (team: Team, p: number, clockMs: number): Possession =>
    open && open.outcome === 'open' && open.team === team && open.period === p ? open : start(team, 'unknown', p, clockMs);

  for (const e of liveEvents(events)) {
    switch (e.type) {
      case 'period_start':
        closeOpen();
        period = e.payload.period;
        break;
      case 'period_end':
        closeOpen();
        break;
      case 'lineup_change': {
        const before = e.payload.team === 'us' ? lineup : theirLineup;
        const after = { ...e.payload.lineup };
        for (const position of Object.keys(after) as Position[]) {
          const on = after[position];
          const off = before[position];
          if (on && off && on !== off) changes.push({ team: e.payload.team, period: e.payload.period, clockMs: e.payload.clockMs, position, on, off, index: possessions.length });
        }
        if (e.payload.team === 'us') lineup = after;
        else theirLineup = after;
        break;
      }
      case 'action': {
        const a = e.payload;
        const p = a.period;
        period = p;
        const at = a.at ?? null;
        const position = a.team === 'us' ? pos(a.player) : null;
        const player = position ? (lineup[position] ?? null) : null;
        switch (a.action) {
          case 'Receive':
            start(a.team, 'centre pass', p, a.clockMs);
            break;
          case 'Goal':
          case 'Miss': {
            const poss = current(a.team, p, a.clockMs);
            const goal = a.action === 'Goal';
            poss.shots.push({ team: a.team, period: p, clockMs: a.clockMs, position, player, goal, at });
            if (goal) {
              poss.outcome = 'goal';
              open = null;
            } else if (a.rebound === 'theirs') {
              poss.outcome = 'miss';
              start(other(a.team), 'rebound', p, a.clockMs);
            } else if (a.rebound === 'out') {
              poss.outcome = 'miss';
              start(other(a.team), 'throw in', p, a.clockMs);
            }
            break;
          }
          case 'Won it': {
            const loser = current(other(a.team), p, a.clockMs);
            loser.outcome = 'lost';
            loser.loss = { forced: true, position: null, player: null, winnerPosition: position, winner: player, at };
            start(a.team, 'gain', p, a.clockMs);
            break;
          }
          case 'Lost it': {
            const loser = current(a.team, p, a.clockMs);
            loser.outcome = 'lost';
            loser.loss = { forced: false, position, player, winnerPosition: null, winner: null, at };
            start(other(a.team), 'turnover', p, a.clockMs);
            break;
          }
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
  }
  return { possessions, changes, lineup, theirLineup, period };
}

export function shotsOf(list: readonly Possession[]): Shot[] {
  return list.flatMap((p) => p.shots);
}

/** A comparable game time: later in the game is larger. */
export function gameTime(period: number, clockMs: number): number {
  return period * 10_000_000 - clockMs;
}
