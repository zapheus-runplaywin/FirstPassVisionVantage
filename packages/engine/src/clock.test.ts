import type { GameEvent } from '@firstpass/schema';
import { expect, it } from 'vitest';
import { clockState } from './clock';

const Q = 15 * 60_000;
let seq = 0;
function ev(type: GameEvent['type'], payload: object, at: number): GameEvent {
  seq++;
  return { id: `c${seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: new Date(at).toISOString() } as GameEvent;
}

it('counts down from the recorded start and holds when stopped', () => {
  const start = Date.parse('2026-10-14T00:00:00Z');
  const events = [
    ev('period_start', { period: 1, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' }, start),
    ev('clock_start', { period: 1, clockMs: Q }, start),
  ];
  expect(clockState(events, Q, start + 61_000)).toEqual({ period: 1, running: true, remainingMs: Q - 61_000, inBreak: false });

  events.push(ev('clock_stop', { period: 1, clockMs: Q - 61_000 }, start + 61_000));
  expect(clockState(events, Q, start + 500_000).remainingMs).toBe(Q - 61_000);
});

it('enters the break at period end and resets at the next period start', () => {
  const t = 0;
  const events = [ev('period_end', { period: 1, clockMs: 0 }, t)];
  expect(clockState(events, Q, t)).toMatchObject({ inBreak: true, running: false, remainingMs: 0 });
  events.push(ev('period_start', { period: 2, clockMs: Q, attackEnd: 'left', centrePass: 'them', mode: 'core' }, t));
  expect(clockState(events, Q, t)).toEqual({ period: 2, running: false, remainingMs: Q, inBreak: false });
});

it('never runs below zero', () => {
  const events = [ev('clock_start', { period: 1, clockMs: 1000 }, 0)];
  expect(clockState(events, Q, 10_000).remainingMs).toBe(0);
});
