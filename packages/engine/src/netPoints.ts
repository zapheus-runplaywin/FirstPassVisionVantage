import type { ActionPayload, GameEvent, PlayerRef, Position, Team } from '@firstpass/schema';
import { liveEvents } from './corrections';

/**
 * Nissan Net Points values, from the published Suncorp Super Netball scoring
 * system (Champion Data tables Matt shared, 2026-11-13). Clubs can re-weight
 * any of them by passing overrides to `netPoints`.
 */
export const NET_POINTS = {
  intercept: 10,
  blockToAdvantage: 10,
  deflectionWithGain: 8,
  pickup: 8,
  defensiveRebound: 6,
  /** Rebound offensive (teammate attempt): a teammate's miss won back. */
  offensiveReboundTeammate: 3,
  /** Rebound offensive (own attempt), and an offensive rebound whose rebounder is not named. */
  offensiveReboundOwn: 1,
  deflectionNoGain: 4,
  goal: 2,
  feedWithGoalAssist: 2,
  feedWithAttempt: 1.5,
  centrePassReceive: 1,
  feedNoAttempt: 0.5,
  centrePass: 0.5,
  penalty: -0.5,
  /** Missed goal (regained): the shooting team got the rebound, or it is not recorded yet. */
  missedGoal: -1,
  turnover: -8,
  missedGoalTurnover: -8,
  interceptedTurnover: -10,
  /**
   * A gain whose cause is still blank (an amber dot). Not in the published
   * table; scored as a deflection with gain until the cause is filled in.
   */
  gainNoCause: 8,
} as const;

export type NetPointsTable = Record<keyof typeof NET_POINTS, number>;

export interface NetPoints {
  team: Record<Team, number>;
  byQuarter: Record<number, Record<Team, number>>;
  /** Our players by position, including '?' for unknown players. */
  byPosition: Partial<Record<PlayerRef, number>>;
  /** Our players by name, when a lineup change has said who plays where. */
  byPlayer: Record<string, number>;
}

const other = (team: Team): Team => (team === 'us' ? 'them' : 'us');

function gainValue(a: ActionPayload, v: NetPointsTable): number {
  switch (a.cause) {
    case 'Intercept':
      return v.intercept;
    case 'Block':
      return v.blockToAdvantage;
    case 'Deflection, gain':
      return v.deflectionWithGain;
    case 'Pickup':
      return v.pickup;
    case 'Rebound':
      return v.defensiveRebound;
    default:
      return v.gainNoCause;
  }
}

/**
 * Net Points for a whole event log. Opposition points are team-level only,
 * as are our turnovers that were logged as their gain (the log does not say
 * which of ours lost it). Offensive rebounds are not scored: the rebound
 * prompt records who got the ball, not which player.
 */
export function netPoints(events: readonly GameEvent[], overrides: Partial<NetPointsTable> = {}): NetPoints {
  const v: NetPointsTable = { ...NET_POINTS, ...overrides };
  const result: NetPoints = { team: { us: 0, them: 0 }, byQuarter: {}, byPosition: {}, byPlayer: {} };
  let period = 1;
  let lineup: Partial<Record<Position, string>> = {};
  /** The last feed in the current possession, upgraded if a shot follows. */
  let feed: { team: Team; player: PlayerRef | null; credited: number } | null = null;

  const credit = (team: Team, player: PlayerRef | null, points: number): void => {
    if (points === 0) return;
    result.team[team] += points;
    const q = (result.byQuarter[period] ??= { us: 0, them: 0 });
    q[team] += points;
    if (team !== 'us' || !player) return;
    result.byPosition[player] = (result.byPosition[player] ?? 0) + points;
    const name = player === '?' ? undefined : lineup[player];
    if (name) result.byPlayer[name] = (result.byPlayer[name] ?? 0) + points;
  };

  for (const event of liveEvents(events)) {
    if (event.type === 'period_start') {
      period = event.payload.period;
      feed = null;
      continue;
    }
    if (event.type === 'lineup_change') {
      if (event.payload.team === 'us') lineup = { ...event.payload.lineup };
      continue;
    }
    if (event.type !== 'action') continue;

    const a = event.payload;
    period = a.period;
    const { team, player } = a;
    const opponent = other(team);

    switch (a.action) {
      case 'Receive':
        credit(team, player, v.centrePassReceive);
        // The centre pass itself is always taken by the C.
        credit(team, 'C', v.centrePass);
        feed = null;
        break;

      case 'Feed':
        credit(team, player, v.feedNoAttempt);
        feed = { team, player, credited: v.feedNoAttempt };
        break;

      case 'Goal':
      case 'Miss': {
        const goal = a.action === 'Goal';
        // A miss the other team gets (their rebound, or out of court) is a missed goal
        // turnover (-8) instead of a missed goal regained (-1).
        const lost = !goal && (a.rebound === 'theirs' || a.rebound === 'out');
        credit(team, player, goal ? v.goal : lost ? v.missedGoalTurnover : v.missedGoal);
        if (feed?.team === team) {
          // Feed values replace each other: the best outcome of the feed counts.
          const value = Math.max(feed.credited, goal ? v.feedWithGoalAssist : v.feedWithAttempt);
          credit(team, feed.player, value - feed.credited);
          feed.credited = value;
        }
        // A missed shot keeps the possession only on our rebound.
        if (goal || a.rebound !== 'ours') feed = null;
        // A defensive rebound goes to the player who took it, when the second tap named them.
        if (!goal && a.rebound === 'theirs') credit(opponent, opponent === 'us' ? (a.rebounder ?? null) : null, v.defensiveRebound);
        if (!goal && a.rebound === 'ours') {
          const by = team === 'us' ? (a.rebounder ?? null) : null;
          const teammate = by !== null && by !== '?' && player !== null && player !== '?' && by !== player;
          credit(team, by, teammate ? v.offensiveReboundTeammate : v.offensiveReboundOwn);
        }
        break;
      }

      case 'Won it':
        credit(team, player, gainValue(a, v));
        credit(opponent, null, a.cause === 'Intercept' ? v.interceptedTurnover : v.turnover);
        feed = null;
        break;

      case 'Lost it':
        credit(team, player, v.turnover);
        feed = null;
        break;

      case 'Touch':
        credit(team, player, v.deflectionNoGain);
        break;

      case 'Penalty':
        credit(team, player, v.penalty);
        break;
    }
  }
  return result;
}
