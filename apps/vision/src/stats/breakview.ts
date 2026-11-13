import type { Card } from './alerts';
import { rank } from './alerts';
import { shotsOf, type GameModel, type Possession } from './possessions';
import { MIN_SHOTS } from './tiles';

/*
 * The break view's "Say this" points, as in the prototype: up to three, the
 * quarter's cards first (act cards, then the biggest gap), topped up with
 * the quarter's conversion figures that are furthest from the game figure.
 * There is no season baseline yet, so the game so far is the comparison.
 */

export interface SayPoint {
  headline: string;
  count: string;
  anchor: string;
}

export const SAY_POINTS = 3;

const FIGURES: { subject: string; label: string; source?: Possession['source'] }[] = [
  { subject: 'cp', label: 'CP to goal', source: 'centre pass' },
  { subject: 'gain', label: 'Gain to goal', source: 'gain' },
  { subject: 'turnover', label: 'Turnover to goal', source: 'turnover' },
  { subject: 'shooting', label: 'Shooting' },
];

const pct = (g: number, n: number) => (n ? `${Math.round((100 * g) / n)}%` : '–');

function figure(list: Possession[], source?: Possession['source']) {
  if (!source) {
    const shots = shotsOf(list);
    return { goals: shots.filter((s) => s.goal).length, of: shots.length };
  }
  const mine = list.filter((p) => p.source === source);
  return { goals: mine.filter((p) => p.outcome === 'goal').length, of: mine.length };
}

export function sayPoints(cards: readonly Card[], model: GameModel, period: number): SayPoint[] {
  // One point per subject: a card that retired and came back counts once, at its strongest.
  const raised = rank(cards.filter((c) => c.period === period)).filter((c, i, all) => all.findIndex((x) => x.subject === c.subject) === i);
  const points: SayPoint[] = raised.slice(0, SAY_POINTS).map((c) => ({ headline: c.headline, count: c.count, anchor: c.anchor }));
  if (points.length >= SAY_POINTS) return points;

  const ours = model.possessions.filter((p) => p.team === 'us' && p.outcome !== 'open');
  const quarter = ours.filter((p) => p.period === period);
  const extras = FIGURES.filter((f) => !raised.some((c) => c.subject === f.subject))
    .map((f) => {
      const q = figure(quarter, f.source);
      const game = figure(ours, f.source);
      const gap = q.of && game.of ? q.goals / q.of - game.goals / game.of : 0;
      return { q, game, gap, f };
    })
    .filter((x) => x.q.of >= MIN_SHOTS)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  for (const { q, game, gap, f } of extras) {
    if (points.length >= SAY_POINTS) break;
    points.push({
      headline: `${f.label} this quarter: ${pct(q.goals, q.of)}`,
      count: `${q.goals} of ${q.of}, ${pct(game.goals, game.of)} for the game`,
      anchor: Math.round(gap * 100) === 0 ? 'level with the game' : gap < 0 ? 'below the game figure' : 'above the game figure',
    });
  }
  return points;
}

/** Goals each team scored in a quarter, and its possessions. */
export function quarterLine(model: GameModel, period: number) {
  const inQ = model.possessions.filter((p) => p.period === period && p.outcome !== 'open');
  const goals = (team: 'us' | 'them') => inQ.filter((p) => p.team === team && p.outcome === 'goal').length;
  return { us: goals('us'), them: goals('them'), possessions: inQ.length };
}
