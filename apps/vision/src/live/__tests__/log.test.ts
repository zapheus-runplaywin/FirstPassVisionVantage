import type { GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { fromBroadcast, fromRow, LiveLog } from '../log';
import { stream, T0 } from './fixtures';

function five(): GameEvent[] {
  const s = stream();
  return [s.start(1), s.clockStart(1, 600_000, 0), s.act(1, 590_000, { team: 'us', action: 'Receive' }), s.act(1, 580_000, { team: 'us', action: 'Goal', player: 'GS' }), s.end(1)];
}

describe('LiveLog', () => {
  it('shows events in seq order whatever order they arrive in', () => {
    const [a, b, c, d, e] = five();
    const log = new LiveLog('g');
    log.add([c!, a!, e!, b!, d!]);
    expect(log.events.map((x) => x.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(log.hasGap).toBe(false);
  });

  it('stops at a hole and reports it, then fills in when the missing event arrives', () => {
    const [a, b, c, d] = five();
    const log = new LiveLog('g');
    expect(log.add([a!, b!, d!])).toBe(true);
    expect(log.events.map((x) => x.seq)).toEqual([1, 2]);
    expect(log.unbrokenThrough).toBe(2);
    expect(log.highestSeq).toBe(4);
    expect(log.hasGap).toBe(true);
    expect(log.add([c!])).toBe(true);
    expect(log.events.map((x) => x.seq)).toEqual([1, 2, 3, 4]);
    expect(log.hasGap).toBe(false);
  });

  it('ignores duplicates, so the broadcast and a read can both deliver an event', () => {
    const [a, b] = five();
    const log = new LiveLog('g');
    log.add([a!, b!]);
    const before = log.events;
    expect(log.add([a!, b!])).toBe(false);
    expect(log.events).toBe(before);
    expect(log.events).toHaveLength(2);
  });

  it('keeps the first copy of a seq if a different event claims the same number', () => {
    const [a] = five();
    const log = new LiveLog('g');
    log.add([a!]);
    log.add([{ ...a!, id: 'other' }]);
    expect(log.events[0]!.id).toBe(a!.id);
  });

  it("merges a helper statistician's substitutions and corrections into the record", () => {
    const [a, b, c, d, e] = five();
    const fix = { id: 'h1', gameId: 'g', stream: 'helper:hana', seq: 1, type: 'correction', payload: { target: d!.id, op: 'delete' }, recordedAt: new Date(T0 + 1).toISOString() } as GameEvent;
    const log = new LiveLog('g');
    log.add([a!, b!, c!, d!, e!]);
    const before = log.events;
    expect(log.add([fix])).toBe(true);
    expect(log.events).not.toBe(before);
    expect(log.events.map((x) => x.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'h1']);
    expect(log.helperCursors).toEqual({ 'helper:hana': 1 });
    // The primary stream's own numbers are unchanged by the helper's.
    expect(log.unbrokenThrough).toBe(5);
    expect(log.highestSeq).toBe(5);
    expect(log.add([fix])).toBe(false);
  });

  it("holds a helper's event back until the ones before it arrive", () => {
    const [a] = five();
    const h = (seq: number) => ({ id: `h${seq}`, gameId: 'g', stream: 'helper:hana', seq, type: 'correction', payload: { target: 'e1', op: 'delete' }, recordedAt: new Date(T0 + seq).toISOString() }) as GameEvent;
    const log = new LiveLog('g');
    log.add([a!]);
    expect(log.add([h(2)])).toBe(false);
    expect(log.events.map((x) => x.id)).toEqual(['e1']);
    expect(log.hasGap).toBe(true);
    expect(log.helperCursors).toEqual({ 'helper:hana': 0 });
    expect(log.add([h(1)])).toBe(true);
    expect(log.events.map((x) => x.id)).toEqual(['e1', 'h1', 'h2']);
    expect(log.hasGap).toBe(false);
  });

  it('ignores a stat, a clock change or a quarter change claimed by a helper stream', () => {
    const [a] = five();
    const log = new LiveLog('g');
    log.add([a!]);
    for (const type of ['action', 'flag', 'clock_start', 'clock_stop', 'period_start', 'period_end'] as const) {
      expect(log.add([{ ...a!, id: `x-${type}`, stream: 'helper:hana', seq: 1, type } as GameEvent])).toBe(false);
    }
    expect(log.events).toHaveLength(1);
    expect(log.helperCursors).toEqual({});
  });

  it('ignores other games, shadow streams and nulls', () => {
    const [a] = five();
    const log = new LiveLog('g');
    expect(log.add([{ ...a!, gameId: 'other' }, { ...a!, stream: 'shadow:u1' }, null])).toBe(false);
    expect(log.events).toHaveLength(0);
    expect(log.hasGap).toBe(false);
  });

  it('returns a new array only when the run grows, so the screen recomputes only then', () => {
    const [a, b, , d] = five();
    const log = new LiveLog('g');
    log.add([a!]);
    const first = log.events;
    expect(log.add([d!])).toBe(false);
    expect(log.events).toBe(first);
    log.add([b!]);
    expect(log.events).not.toBe(first);
  });
});

describe('fromRow', () => {
  const row = { game_id: 'g', stream: 'primary', seq: 1, id: 'e1', type: 'action', payload: { period: 1 }, recorded_at: '2026-11-13T09:00:00Z' };

  it('maps a game_events row to an event', () => {
    expect(fromRow(row)).toEqual({ id: 'e1', gameId: 'g', stream: 'primary', seq: 1, type: 'action', payload: { period: 1 }, recordedAt: '2026-11-13T09:00:00Z' });
  });

  it('drops rows it cannot use rather than crash the coach screen', () => {
    expect(fromRow({ ...row, type: 'something_new' })).toBeNull();
    expect(fromRow({ ...row, stream: 'shadow:u1' })).toBeNull();
    expect(fromRow({ ...row, seq: 0 })).toBeNull();
    expect(fromRow({ ...row, seq: 1.5 })).toBeNull();
    expect(fromRow({ ...row, payload: null })).toBeNull();
    expect(fromRow({ ...row, recorded_at: 'not a date' })).toBeNull();
  });
});

describe('fromBroadcast', () => {
  // The shape public.broadcast_game_event sends (FirstPassHQ game stats migration).
  const message = { id: 'e1', gameId: 'g', stream: 'primary', seq: 1, type: 'period_start', payload: { period: 1 }, recordedAt: '2026-11-13T09:00:00Z' };

  it('reads the broadcast the database sends', () => {
    expect(fromBroadcast(message)).toEqual(message);
  });

  it("reads a helper's substitution or correction, and nothing else from a helper", () => {
    const fix = { ...message, id: 'h1', stream: 'helper:u1', type: 'correction', payload: { target: 'e1', op: 'delete' } };
    expect(fromBroadcast(fix)).toEqual(fix);
    expect(fromBroadcast({ ...fix, type: 'lineup_change' })).not.toBeNull();
    expect(fromBroadcast({ ...fix, type: 'action' })).toBeNull();
    expect(fromBroadcast({ ...fix, stream: 'shadow:u1' })).toBeNull();
    expect(fromBroadcast({ ...fix, stream: 'helper' })).toBeNull();
  });

  it('drops anything else', () => {
    expect(fromBroadcast(null)).toBeNull();
    expect(fromBroadcast('event')).toBeNull();
    expect(fromBroadcast({ ...message, seq: '1' })).toBeNull();
    expect(fromBroadcast({ ...message, id: undefined })).toBeNull();
    expect(fromBroadcast({ ...message, stream: 'shadow:u1' })).toBeNull();
  });
});
