import type { GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { clockState, resumableEnd, setClockEvent } from './clock';

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

describe('setting the clock to the official time', () => {
  const t0 = Date.parse('2026-11-13T09:00:00Z');
  const start = () => {
    seq = 0;
    return [
      ev('period_start', { period: 1, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' }, t0),
      ev('clock_start', { period: 1, clockMs: Q }, t0),
    ];
  };
  const add = (events: GameEvent[], e: ReturnType<typeof setClockEvent>, at: number) => events.push(ev(e.type, e.payload, at));

  it('a running clock keeps running from the new time', () => {
    const events = start();
    const now = t0 + 60_000;
    const clock = clockState(events, Q, now);
    add(events, setClockEvent(clock, Q - 65_000, Q), now);
    expect(clockState(events, Q, now)).toMatchObject({ running: true, remainingMs: Q - 65_000 });
    expect(clockState(events, Q, now + 10_000).remainingMs).toBe(Q - 75_000);
  });

  it('a stopped clock stays stopped at the new time', () => {
    const events = start();
    events.push(ev('clock_stop', { period: 1, clockMs: Q - 30_000 }, t0 + 30_000));
    add(events, setClockEvent(clockState(events, Q, t0 + 40_000), Q - 28_000, Q), t0 + 40_000);
    expect(clockState(events, Q, t0 + 90_000)).toMatchObject({ running: false, remainingMs: Q - 28_000 });
  });

  it('keeps the time inside the quarter and to whole ms', () => {
    expect(setClockEvent({ period: 2, running: false }, Q + 5_000, Q).payload).toEqual({ period: 2, clockMs: Q });
    expect(setClockEvent({ period: 2, running: true }, -1, Q)).toEqual({ type: 'clock_start', payload: { period: 2, clockMs: 0 } });
    expect(setClockEvent({ period: 1, running: false }, 1234.6, Q).payload.clockMs).toBe(1235);
  });

  it('is undone like any other event', () => {
    const events = start();
    events.push(ev('clock_stop', { period: 1, clockMs: Q - 30_000 }, t0 + 30_000));
    const set = ev('clock_stop', { period: 1, clockMs: Q - 90_000 }, t0 + 31_000);
    events.push(set, ev('correction', { target: set.id, op: 'delete' }, t0 + 32_000));
    expect(clockState(events, Q, t0 + 40_000).remainingMs).toBe(Q - 30_000);
  });
});

describe('resuming a quarter ended by mistake', () => {
  const t = Date.parse('2026-11-13T09:00:00Z');
  const begin = (period: number) => ev('period_start', { period, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' }, t);

  it('offers the quarter end just made, and deleting it puts the clock back where it stopped', () => {
    seq = 0;
    const events = [begin(1), ev('clock_stop', { period: 1, clockMs: 200_000 }, t), ev('period_end', { period: 1, clockMs: 200_000 }, t)];
    const id = resumableEnd(events);
    expect(id).toBe(events[2]!.id);
    events.push(ev('correction', { target: id!, op: 'delete' }, t));
    expect(clockState(events, Q, t + 99_000)).toEqual({ period: 1, running: false, remainingMs: 200_000, inBreak: false });
    expect(resumableEnd(events)).toBeNull();
  });

  it('offers nothing once the next quarter has started, or before any quarter ended', () => {
    seq = 0;
    expect(resumableEnd([begin(1)])).toBeNull();
    expect(resumableEnd([begin(1), ev('period_end', { period: 1, clockMs: 0 }, t), begin(2)])).toBeNull();
  });

  it('offers the latest end when several quarters have been played', () => {
    seq = 0;
    const events = [begin(1), ev('period_end', { period: 1, clockMs: 0 }, t), begin(2), ev('period_end', { period: 2, clockMs: 0 }, t)];
    expect(resumableEnd(events)).toBe(events[3]!.id);
  });
});
