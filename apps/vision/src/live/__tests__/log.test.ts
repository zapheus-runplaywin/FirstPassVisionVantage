import type { GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { fromBroadcast, fromRow, LiveLog } from '../log';
import { stream } from './fixtures';

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

  it('drops anything else', () => {
    expect(fromBroadcast(null)).toBeNull();
    expect(fromBroadcast('event')).toBeNull();
    expect(fromBroadcast({ ...message, seq: '1' })).toBeNull();
    expect(fromBroadcast({ ...message, id: undefined })).toBeNull();
    expect(fromBroadcast({ ...message, stream: 'shadow:u1' })).toBeNull();
  });
});
