import type { ActionPayload, GameConfig, GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { reviewGame } from './review';
import { gameStatus } from './status';

const Q = 10 * 60_000;
const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };
const T0 = Date.parse('2026-11-13T09:00:00Z');

let seq = 0;
function ev(type: GameEvent['type'], payload: object, atMs = 0): GameEvent {
  seq++;
  return { id: `r${seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: new Date(T0 + atMs).toISOString() } as GameEvent;
}
const start = (period: number) => ev('period_start', { period, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' });
const end = (period: number) => ev('period_end', { period, clockMs: 0 });
const act = (period: number, clockMs: number, a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>) =>
  ev('action', { period, clockMs, player: null, ...a });

function twoQuarters(): GameEvent[] {
  seq = 0;
  return [
    start(1),
    act(1, Q - 10_000, { team: 'us', action: 'Receive', player: 'C' }),
    // 60 s with nothing in Q1
    act(1, Q - 70_000, { team: 'us', action: 'Goal', player: 'GS' }),
    end(1),
    start(2),
    act(2, Q - 5_000, { team: 'them', action: 'Receive' }),
    // 50 s with nothing in Q2
    act(2, Q - 55_000, { team: 'us', action: 'Won it', player: 'GD' }),
    ev('flag', { period: 2, clockMs: Q - 60_000 }),
  ];
}

describe('reviewGame', () => {
  it('lists long gaps only in the quarter asked for', () => {
    const log = twoQuarters();
    expect(reviewGame(config, log, 1).filter((i) => i.kind === 'long gap')).toEqual([{ kind: 'long gap', event: log[2], gapMs: 60_000 }]);
    expect(reviewGame(config, log, 2).filter((i) => i.kind === 'long gap').map((i) => i.event.id)).toEqual([log[6]!.id]);
  });

  it('lists long gaps in every quarter for the post-game audit, never across a break', () => {
    const log = twoQuarters();
    const gaps = reviewGame(config, log, 'all').filter((i) => i.kind === 'long gap');
    expect(gaps.map((i) => i.event.id)).toEqual([log[2]!.id, log[6]!.id]);
  });

  it('lists flags and amber actions from every quarter, whatever quarter is asked for', () => {
    const log = twoQuarters();
    const kinds = (p: number | 'all') => reviewGame(config, log, p).filter((i) => i.kind !== 'long gap').map((i) => [i.kind, i.event.id]);
    // The gain has no cause (amber) and the flag stands on its own.
    expect(kinds(1)).toEqual([
      ['amber', log[6]!.id],
      ['flag', log[7]!.id],
    ]);
    expect(kinds('all')).toEqual(kinds(1));
  });
});

describe('gameStatus', () => {
  it('follows a game from the first quarter to full time', () => {
    seq = 0;
    const log: GameEvent[] = [start(1), act(1, Q - 1000, { team: 'us', action: 'Goal', player: 'GS' })];
    expect(gameStatus(config, log, T0)).toEqual({ phase: 'playing', period: 1, score: { us: 1, them: 0 }, label: 'Q1' });
    log.push(end(1));
    expect(gameStatus(config, log, T0)).toMatchObject({ phase: 'break', label: 'Q1 break' });
    for (const p of [2, 3, 4]) log.push(start(p), end(p));
    log.push(act(4, 0, { team: 'them', action: 'Goal' }));
    expect(gameStatus(config, log, T0)).toEqual({ phase: 'full time', period: 4, score: { us: 1, them: 1 }, label: 'Full time' });
  });

  it('is back in play when the last quarter end is deleted', () => {
    seq = 0;
    const log: GameEvent[] = [start(1), end(1), start(2), end(2), start(3), end(3), start(4)];
    const last = end(4);
    log.push(last, ev('correction', { target: last.id, op: 'delete' }));
    expect(gameStatus(config, log, T0)).toMatchObject({ phase: 'playing', label: 'Q4' });
  });
});
