import { POSITIONS, type Position } from '@firstpass/schema';
import { shotsOf, type GameModel } from './possessions';
import { MIN_SHOTS, TREND_GAP } from './tiles';

/*
 * Hot and cold on the on-court strip, as in the prototype. Both compare this
 * quarter with the game, so they say "better or worse than usual today":
 * - shooters (GS, GA) by goals of attempts, once they have five shots this
 *   quarter: 20 points above their game rate is hot, 20 below is cold;
 * - everyone else by gains minus unforced losses this quarter: +2 or better
 *   is hot, -2 or worse is cold.
 * Players are tracked by name, so a sub's numbers stay with them.
 */

export type Mark = 'hot' | 'cold' | null;

export interface OnCourt {
  position: Position;
  name: string | null;
  mark: Mark;
  /** What the mark rests on, e.g. "4 of 5 this quarter" or "2 gains · 0 lost". */
  detail: string;
}

/** Net gains minus unforced losses for hot or cold. */
export const NET_HOT = 2;

export function onCourt(model: GameModel): OnCourt[] {
  const ours = model.possessions.filter((p) => p.team === 'us');
  const theirs = model.possessions.filter((p) => p.team === 'them');
  const q = model.period;
  return POSITIONS.map((position) => {
    const name = model.lineup[position] ?? null;
    if (!name) return { position, name, mark: null, detail: '' };
    if (position === 'GS' || position === 'GA') {
      const mine = shotsOf(ours).filter((s) => s.player === name);
      const now = mine.filter((s) => s.period === q);
      const g = (l: typeof mine) => l.filter((s) => s.goal).length;
      const detail = now.length ? `${g(now)} of ${now.length} this quarter` : '';
      if (now.length < MIN_SHOTS) return { position, name, mark: null, detail };
      const gap = g(now) / now.length - g(mine) / mine.length;
      return { position, name, mark: gap >= TREND_GAP ? 'hot' : gap <= -TREND_GAP ? 'cold' : null, detail };
    }
    const gains = theirs.filter((p) => p.period === q && p.loss?.forced && p.loss.winner === name).length;
    const lost = ours.filter((p) => p.period === q && p.loss && !p.loss.forced && p.loss.player === name).length;
    const net = gains - lost;
    return {
      position,
      name,
      mark: net >= NET_HOT ? 'hot' : net <= -NET_HOT ? 'cold' : null,
      detail: gains || lost ? `${gains} gain${gains === 1 ? '' : 's'} · ${lost} lost` : '',
    };
  });
}

/** Our losses this quarter, for the mini court. */
export function lossesThisQuarter(model: GameModel) {
  return model.possessions
    .filter((p) => p.team === 'us' && p.period === model.period && p.loss)
    .map((p) => ({ forced: p.loss!.forced, at: p.loss!.at }));
}
