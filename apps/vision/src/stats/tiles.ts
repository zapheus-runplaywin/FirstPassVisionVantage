import { shotsOf, type GameModel, type Possession, type Source } from './possessions';

/*
 * The five conversion tiles on the coach's Live screen (Vision UI doc and
 * prototype). Each shows the game figure with its count, the last eight as a
 * trend, and greys out as "too early" until there is enough behind it. There
 * is no season baseline yet: it needs finished games from the same team.
 */

/** Possessions needed before a conversion figure means anything. */
export const MIN_POSSESSIONS = 8;
/** Shots needed before shooting means anything. */
export const MIN_SHOTS = 5;
/** The trend window. */
export const WINDOW = 8;
/** How far the last eight must be from the game figure to show an arrow. */
export const TREND_GAP = 0.2;

export type TileKey = 'cp' | 'gain' | 'turnover' | 'shooting' | 'unforced';

export interface Tile {
  key: TileKey;
  label: string;
  /** The big figure: a percentage, or a count for unforced turnovers. */
  figure: string;
  /** What the figure is made of, e.g. "7 of 10". */
  count: string;
  /** 0 to 1, for the bar. */
  fill: number;
  early: boolean;
  /** Why it's too early, e.g. "3 of 8 needed". */
  need: string;
  /** e.g. "last 8: 3 of 8 (38%)", empty until there are eight. */
  trend: string;
  /** Whether the last eight are clearly better or worse for us. */
  arrow: 'better up' | 'better down' | 'worse up' | 'worse down' | null;
}

const pct = (g: number, n: number): string => (n ? `${Math.round((100 * g) / n)}%` : '–');

function conversion(key: TileKey, label: string, source: Source, ours: Possession[]): Tile {
  const list = ours.filter((p) => p.source === source && p.outcome !== 'open');
  const goals = list.filter((p) => p.outcome === 'goal').length;
  const last = list.slice(-WINDOW);
  const lastGoals = last.filter((p) => p.outcome === 'goal').length;
  const early = list.length < MIN_POSSESSIONS;
  return {
    key,
    label,
    figure: pct(goals, list.length),
    count: `${goals} of ${list.length}`,
    fill: list.length ? goals / list.length : 0,
    early,
    need: `${list.length} of ${MIN_POSSESSIONS} needed`,
    trend: last.length >= WINDOW ? `last ${WINDOW}: ${lastGoals} of ${WINDOW} (${pct(lastGoals, WINDOW)})` : '',
    arrow: early || last.length < WINDOW ? null : rateArrow(lastGoals / WINDOW - goals / list.length),
  };
}

function rateArrow(gap: number): Tile['arrow'] {
  if (Math.abs(gap) < TREND_GAP) return null;
  return gap > 0 ? 'better up' : 'worse down';
}

export function tiles(model: GameModel): Tile[] {
  const ours = model.possessions.filter((p) => p.team === 'us');
  const out: Tile[] = [
    conversion('cp', 'CP to goal', 'centre pass', ours),
    conversion('gain', 'Gain to goal', 'gain', ours),
    conversion('turnover', 'Turnover to goal', 'turnover', ours),
  ];

  const shots = shotsOf(ours);
  const goals = shots.filter((s) => s.goal).length;
  const lastShots = shots.slice(-WINDOW);
  const lastGoals = lastShots.filter((s) => s.goal).length;
  const shootEarly = shots.length < MIN_SHOTS;
  out.push({
    key: 'shooting',
    label: 'Shooting',
    figure: pct(goals, shots.length),
    count: `${goals} of ${shots.length}`,
    fill: shots.length ? goals / shots.length : 0,
    early: shootEarly,
    need: `${shots.length} of ${MIN_SHOTS} shots`,
    trend: lastShots.length >= WINDOW ? `last ${WINDOW}: ${lastGoals} of ${WINDOW} (${pct(lastGoals, WINDOW)})` : '',
    arrow: shootEarly || lastShots.length < WINDOW ? null : rateArrow(lastGoals / WINDOW - goals / shots.length),
  });

  const unforced = (p: Possession) => p.loss !== null && !p.loss.forced;
  const thisQuarter = ours.filter((p) => p.period === model.period);
  const quarterCount = thisQuarter.filter(unforced).length;
  const gameCount = ours.filter(unforced).length;
  const closed = ours.filter((p) => p.outcome !== 'open');
  const last = closed.slice(-WINDOW);
  const lastCount = last.filter(unforced).length;
  const per8 = closed.length ? (gameCount / closed.length) * WINDOW : 0;
  const diff = lastCount - per8;
  out.push({
    key: 'unforced',
    label: 'Unforced turnovers',
    figure: String(quarterCount),
    count: `this quarter · ${gameCount} in the game`,
    fill: Math.min(1, quarterCount / 10),
    early: thisQuarter.length < MIN_POSSESSIONS,
    need: `${thisQuarter.length} of ${MIN_POSSESSIONS} possessions`,
    trend: last.length >= WINDOW ? `last ${WINDOW} possessions: ${lastCount}` : '',
    arrow: last.length < WINDOW || Math.abs(diff) < 1.5 ? null : diff > 0 ? 'worse up' : 'better down',
  });
  return out;
}
