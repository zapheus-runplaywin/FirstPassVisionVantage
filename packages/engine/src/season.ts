import { POSITIONS, type GameConfig, type GameEvent, type Position } from '@firstpass/schema';
import { liveEvents } from './corrections';
import { deriveGame } from './game';
import { netPoints } from './netPoints';
import { courtTime, lineupsAt } from './players';

/*
 * One player's figures for a game, and the same figures added up over the
 * games of a season. Both come from the event logs with the functions the
 * live views use (deriveGame, courtTime, netPoints), so a season view always
 * agrees with what each game's report showed.
 *
 * Actions record a position, not a person; the lineup says who held it. So a
 * player has figures only for the time a lineup named them, and a game with
 * no lineup recorded gives none.
 */

export interface PlayerLine {
  /** Game-clock time on court, in ms. */
  courtMs: number;
  /** Quarters in which they were on court. */
  quarters: number;
  /** Positions played, in court order. */
  positions: Position[];
  goals: number;
  shots: number;
  feeds: number;
  /** Centre pass receives. */
  receives: number;
  gains: number;
  intercepts: number;
  /** Touches: deflections that did not win the ball. */
  touches: number;
  turnovers: number;
  penalties: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  netPoints: number;
}

export function emptyLine(): PlayerLine {
  return {
    courtMs: 0,
    quarters: 0,
    positions: [],
    goals: 0,
    shots: 0,
    feeds: 0,
    receives: 0,
    gains: 0,
    intercepts: 0,
    touches: 0,
    turnovers: 0,
    penalties: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    netPoints: 0,
  };
}

const COUNTS = ['courtMs', 'quarters', 'goals', 'shots', 'feeds', 'receives', 'gains', 'intercepts', 'touches', 'turnovers', 'penalties', 'offensiveRebounds', 'defensiveRebounds', 'netPoints'] as const;

const inCourtOrder = (positions: Iterable<Position>): Position[] => {
  const have = new Set(positions);
  return POSITIONS.filter((p) => have.has(p));
};

/** Two lines added together, such as two games of a season. */
export function addLines(a: PlayerLine, b: PlayerLine): PlayerLine {
  const out = emptyLine();
  for (const k of COUNTS) out[k] = a[k] + b[k];
  out.netPoints = Math.round(out.netPoints * 10) / 10;
  out.positions = inCourtOrder([...a.positions, ...b.positions]);
  return out;
}

/** Each of our players' figures for one game, by the name the lineup gave them. */
export function playerLines(config: GameConfig, events: readonly GameEvent[]): Record<string, PlayerLine> {
  const out: Record<string, PlayerLine> = {};
  const positions: Record<string, Set<Position>> = {};
  const line = (name: string): PlayerLine => (out[name] ??= emptyLine());
  const at = (name: string, p: Position): void => void (positions[name] ??= new Set()).add(p);

  for (const [name, t] of Object.entries(courtTime(events, config.quarterMs))) {
    const l = line(name);
    l.courtMs = t.totalMs;
    l.quarters = Object.values(t.byPeriod).filter((ms) => ms > 0).length;
    for (const p of Object.keys(t.byPosition) as Position[]) at(name, p);
  }

  const state = deriveGame(config, events);
  for (const [name, s] of Object.entries(state.shotsByPlayer)) {
    const l = line(name);
    l.goals = s.goals;
    l.shots = s.attempts;
    for (const p of s.positions) at(name, p);
  }
  for (const [name, r] of Object.entries(state.reboundsByPlayer)) {
    const l = line(name);
    l.offensiveRebounds = r.offensive;
    l.defensiveRebounds = r.defensive;
  }

  const lineups = lineupsAt(events);
  for (const e of liveEvents(events)) {
    if (e.type !== 'action' || e.payload.team !== 'us') continue;
    const pos = e.payload.player;
    if (!pos || pos === '?') continue;
    const name = lineups.get(e.id)?.[pos];
    if (!name) continue;
    const l = line(name);
    at(name, pos);
    switch (e.payload.action) {
      case 'Feed':
        l.feeds++;
        break;
      case 'Receive':
        l.receives++;
        break;
      case 'Won it':
        l.gains++;
        if (e.payload.cause === 'Intercept') l.intercepts++;
        break;
      case 'Touch':
        l.touches++;
        break;
      case 'Lost it':
        l.turnovers++;
        break;
      case 'Penalty':
        l.penalties++;
        break;
      default:
        break;
    }
  }

  for (const [name, points] of Object.entries(netPoints(events).byPlayer)) line(name).netPoints = Math.round(points * 10) / 10;
  for (const [name, set] of Object.entries(positions)) line(name).positions = inCourtOrder(set);
  return out;
}

/** A game of the season: what to call it, and its record. */
export interface SeasonGame {
  id: string;
  /** Such as "v Swans" or "Round 4 v Swans". */
  label: string;
  /** When it was played, for ordering (ISO). */
  playedAt: string;
  config: GameConfig;
  events: readonly GameEvent[];
}

export interface SeasonPlayer {
  /** The name as the latest game's lineup spelt it. */
  name: string;
  /** Their games, oldest first; only games in which a lineup named them. */
  games: { id: string; label: string; playedAt: string; line: PlayerLine }[];
  total: PlayerLine;
}

/** A name for matching between games: the statistician may type "Mia C" one week and "mia c " the next. */
export const playerKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Every player's games and totals over the season's games, most time on court
 * first. A player is matched between games by name, ignoring case and spacing.
 */
export function seasonPlayers(games: readonly SeasonGame[]): SeasonPlayer[] {
  const byKey = new Map<string, SeasonPlayer>();
  const ordered = [...games].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  for (const g of ordered) {
    // Two spellings of one name in the same game count as one player.
    const inGame = new Map<string, { name: string; line: PlayerLine }>();
    for (const [name, l] of Object.entries(playerLines(g.config, g.events))) {
      const key = playerKey(name);
      if (!key) continue;
      const had = inGame.get(key);
      inGame.set(key, had ? { name: had.name, line: addLines(had.line, l) } : { name: name.trim().replace(/\s+/g, ' '), line: l });
    }
    for (const [key, { name, line }] of inGame) {
      const p = byKey.get(key) ?? { name, games: [], total: emptyLine() };
      p.name = name;
      p.games.push({ id: g.id, label: g.label, playedAt: g.playedAt, line });
      p.total = addLines(p.total, line);
      byKey.set(key, p);
    }
  }
  return [...byKey.values()].sort((a, b) => b.total.courtMs - a.total.courtMs || a.name.localeCompare(b.name));
}

/** Goals as a share of shots, 0 to 100, or null with no shots. */
export const shootingPercent = (l: Pick<PlayerLine, 'goals' | 'shots'>): number | null => (l.shots ? Math.round((100 * l.goals) / l.shots) : null);

/**
 * Net Points for every 10 minutes on court, to one decimal place, so players
 * with different court time can be read side by side. Null under 5 minutes on
 * court, where the rate means nothing.
 */
export function netPointsPer10(l: Pick<PlayerLine, 'netPoints' | 'courtMs'>): number | null {
  if (l.courtMs < 5 * 60_000) return null;
  return Math.round((l.netPoints / (l.courtMs / 600_000)) * 10) / 10;
}
