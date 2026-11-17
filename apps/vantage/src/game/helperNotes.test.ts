import { liveEvents, mergeStreams } from '@firstpass/engine';
import type { GameConfig, GameEvent, Position, StreamId } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { helperEvents, nextSeq } from './helperEvents';
import { helperNotes, unseenNotes } from './helperNotes';

const Q = 10 * 60_000;
const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };
const START: Partial<Record<Position, string>> = { GS: 'Ava Lee', GA: 'Mia Chen', WA: 'Kim', C: 'Zoe', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };
const HANA: StreamId = 'helper:hana';
const T0 = Date.parse('2026-11-18T09:00:00.000Z');

function ev(stream: StreamId, seq: number, s: number, type: GameEvent['type'], payload: object): GameEvent {
  return { id: `${stream}#${seq}`, gameId: 'g', stream, seq, type, payload, recordedAt: new Date(T0 + s * 1000).toISOString() } as GameEvent;
}
const at = (s: number) => ({ period: 1, clockMs: Q - s * 1000 });

function primary(): GameEvent[] {
  return [
    ev('primary', 1, 0, 'period_start', { ...at(0), attackEnd: 'right', centrePass: 'us', mode: 'core' }),
    ev('primary', 2, 0, 'lineup_change', { ...at(0), team: 'us', lineup: START, bench: ['Jo Park'], detail: 'Starting lineup' }),
    ev('primary', 3, 0, 'clock_start', at(0)),
    ev('primary', 4, 60, 'action', { ...at(60), team: 'us', player: 'GA', action: 'Goal' }),
    ev('primary', 5, 120, 'action', { ...at(120), team: 'them', player: null, action: 'Goal' }),
    ev('primary', 6, 130, 'flag', at(130)),
  ];
}
const sub = (seq: number, s: number) =>
  ev(HANA, seq, s, 'lineup_change', { ...at(s), team: 'us', lineup: { ...START, GA: 'Jo Park' }, bench: ['Mia Chen'], detail: 'Park on at GA, Chen off' });
const fix = (seq: number, s: number, target: string, patch?: object) =>
  ev(HANA, seq, s, 'correction', patch ? { target, op: 'edit', patch } : { target, op: 'delete' });

describe('helperNotes', () => {
  it('has nothing to say when nobody helps', () => {
    expect(helperNotes(mergeStreams(primary()), config)).toEqual([]);
  });

  it('says what each change was, oldest first', () => {
    const record = mergeStreams([...primary(), sub(1, 90), fix(2, 140, 'primary#4', { action: 'Miss', rebound: 'theirs' }), fix(3, 150, 'primary#5')]);
    expect(helperNotes(record, config)).toEqual([
      { id: 'helper:hana#1', text: 'Helper sub: Park on at GA, Chen off' },
      { id: 'helper:hana#2', text: 'Helper changed: Q1 09:00 Miss · Chen GA · DREB · Storm' },
      { id: 'helper:hana#3', text: 'Helper deleted: Q1 08:00 Goal · Storm' },
    ]);
  });

  it('names the player who was in the position at the time, not after a later sub', () => {
    // The goal at 60 s was Mia Chen's; the helper subs her off at 90 s, then corrects that goal.
    const record = mergeStreams([...primary(), sub(1, 90), fix(2, 140, 'primary#4', { action: 'Miss' })]);
    expect(helperNotes(record, config)[1]?.text).toContain('Chen GA');
  });

  it('still makes sense when the event a helper changed was deleted afterwards', () => {
    const record = mergeStreams([...primary(), fix(1, 140, 'primary#4', { action: 'Miss' }), ev('primary', 7, 160, 'correction', { target: 'primary#4', op: 'delete' })]);
    expect(helperNotes(record, config)).toEqual([{ id: 'helper:hana#1', text: 'Helper changed, since deleted: Q1 09:00 Goal · Chen GA' }]);
  });

  it("covers a helper undoing their own substitution, and a change to something that isn't there", () => {
    const record = mergeStreams([...primary(), sub(1, 90), fix(2, 100, 'helper:hana#1'), fix(3, 110, 'nowhere'), fix(4, 120, 'nowhere', { action: 'Miss' })]);
    expect(helperNotes(record, config).map((n) => n.text)).toEqual([
      'Helper sub: Park on at GA, Chen off',
      'Helper deleted: Q1 08:30 Sub · Park on at GA, Chen off',
      'Helper deleted an event',
      'Helper changed an event',
    ]);
  });

  it('never reports the recorder\'s own corrections', () => {
    const record = mergeStreams([...primary(), ev('primary', 7, 160, 'correction', { target: 'primary#4', op: 'delete' })]);
    expect(helperNotes(record, config)).toEqual([]);
  });
});

describe('unseenNotes', () => {
  it('leaves out the notes already seen', () => {
    const notes = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ];
    expect(unseenNotes(notes, new Set(['a']))).toEqual([{ id: 'b', text: 'B' }]);
    expect(unseenNotes(notes, new Set())).toEqual(notes);
    expect(unseenNotes(notes, new Set(['a', 'b']))).toEqual([]);
  });
});

describe('helperEvents', () => {
  it('lists the stats, flags and substitutions that stand, not the starting lineup, the clock or the quarters', () => {
    const record = mergeStreams([...primary(), sub(1, 90), fix(2, 150, 'primary#5')]);
    expect(helperEvents(liveEvents(record)).map((e) => e.id)).toEqual(['primary#4', 'helper:hana#1', 'primary#6']);
  });

  it('goes back only as far as the list does, keeping the latest', () => {
    const many = Array.from({ length: 80 }, (_, i) => ev('primary', i + 1, i, 'flag', at(i)));
    const list = helperEvents(liveEvents(many));
    expect(list).toHaveLength(60);
    expect(list.at(-1)?.id).toBe('primary#80');
    expect(helperEvents(liveEvents(many), 5).map((e) => e.seq)).toEqual([76, 77, 78, 79, 80]);
  });
});

describe('nextSeq', () => {
  it('numbers each stream on its own', () => {
    const held = [...primary(), sub(1, 90), fix(2, 100, 'x')];
    expect(nextSeq(held, 'primary')).toBe(7);
    expect(nextSeq(held, HANA)).toBe(3);
    expect(nextSeq(held, 'helper:ira')).toBe(1);
    expect(nextSeq([], 'primary')).toBe(1);
  });
});
