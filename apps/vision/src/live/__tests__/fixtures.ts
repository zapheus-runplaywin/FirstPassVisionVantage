import type { ActionPayload, GameConfig, GameEvent } from '@firstpass/schema';

export const Q = 10 * 60_000;
export const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };
export const T0 = Date.parse('2026-11-13T09:00:00Z');

/** Builds a primary stream with seq 1, 2, 3 for game 'g'. */
export function stream() {
  let seq = 0;
  const ev = (type: GameEvent['type'], payload: object, atMs = 0): GameEvent => {
    seq++;
    return { id: `e${seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: new Date(T0 + atMs).toISOString() } as GameEvent;
  };
  return {
    ev,
    start: (period: number, atMs = 0) => ev('period_start', { period, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' }, atMs),
    clockStart: (period: number, clockMs: number, atMs: number) => ev('clock_start', { period, clockMs }, atMs),
    clockStop: (period: number, clockMs: number, atMs: number) => ev('clock_stop', { period, clockMs }, atMs),
    end: (period: number, atMs = 0) => ev('period_end', { period, clockMs: 0 }, atMs),
    act: (period: number, clockMs: number, a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>, atMs = 0) =>
      ev('action', { period, clockMs, player: null, ...a }, atMs),
    correction: (target: string, atMs = 0) => ev('correction', { target, op: 'delete' }, atMs),
  };
}
