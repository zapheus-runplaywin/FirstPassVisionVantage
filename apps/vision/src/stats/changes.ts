import type { Team } from '@firstpass/schema';
import { formatClock } from '../live/summary';
import type { Change, GameModel, Possession } from './possessions';
import { MIN_POSSESSIONS, TREND_GAP, WINDOW } from './tiles';

/*
 * A verdict for each lineup change, by either team, as in the prototype's
 * Changes tab. A change at an attacking or centre-court position is measured
 * by that team's scoring (goals per possession); one at a defending position
 * (GK, GD, WD) by the other team's scoring, since that is what a defender
 * changes.
 *
 * Before: the measured team's last 8 possessions before the change.
 * After: every one of their possessions since, up to the same team's next
 * change. Both sides need 8 before there is a verdict; a 20-point move is
 * "helped us" or "hurt us", anything less is "no clear effect".
 */

export type VerdictState = 'early' | 'none' | 'helped' | 'hurt';

export interface Rate {
  goals: number;
  of: number;
}

export interface Verdict {
  change: Change;
  state: VerdictState;
  /** "helped us", "hurt us", "no clear effect" or "too early, 3 of 8". */
  text: string;
  measured: Team;
  /** "our scoring" or "their scoring". */
  measure: string;
  before: Rate;
  after: Rate;
}

const DEFENDERS = new Set(['GK', 'GD', 'WD']);
const other = (t: Team): Team => (t === 'us' ? 'them' : 'us');
const done = (p: Possession) => p.outcome !== 'open';
const rateOf = (list: Possession[]): Rate => ({ goals: list.filter((p) => p.outcome === 'goal').length, of: list.length });
const ratio = (r: Rate) => (r.of ? r.goals / r.of : 0);

export const pct = (r: Rate): string => (r.of ? `${Math.round((100 * r.goals) / r.of)}%` : '–');
export const when = (c: { period: number; clockMs: number }): string => `Q${c.period} ${formatClock(c.clockMs)}`;

export function verdict(model: GameModel, change: Change): Verdict {
  const measured = DEFENDERS.has(change.position) ? other(change.team) : change.team;
  const next = model.changes.find((x) => x.team === change.team && x.index > change.index);
  const mine = (list: Possession[]) => list.filter((p) => p.team === measured && done(p));
  const before = rateOf(mine(model.possessions.slice(0, change.index)).slice(-WINDOW));
  const after = rateOf(mine(model.possessions.slice(change.index, next ? next.index : undefined)));
  const measure = measured === 'us' ? 'our scoring' : 'their scoring';
  const base = { change, measured, measure, before, after };
  if (before.of < MIN_POSSESSIONS || after.of < MIN_POSSESSIONS) {
    return { ...base, state: 'early', text: `too early, ${Math.min(after.of, MIN_POSSESSIONS)} of ${MIN_POSSESSIONS}` };
  }
  const diff = ratio(after) - ratio(before);
  if (Math.abs(diff) < TREND_GAP) return { ...base, state: 'none', text: 'no clear effect' };
  const good = measured === 'us' ? diff > 0 : diff < 0;
  return { ...base, state: good ? 'helped' : 'hurt', text: good ? 'helped us' : 'hurt us' };
}

/** Every change with its verdict, newest first. */
export function verdicts(model: GameModel): Verdict[] {
  return model.changes.map((c) => verdict(model, c)).reverse();
}

/** "their scoring 6 of 8 (75%) before, 3 of 9 (33%) after". */
export function beforeAfter(v: Verdict): string {
  return `${v.measure} ${v.before.goals} of ${v.before.of} (${pct(v.before)}) before, ${v.after.goals} of ${v.after.of} (${pct(v.after)}) after`;
}
