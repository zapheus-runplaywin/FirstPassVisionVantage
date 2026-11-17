import type { ActionPayload, GameConfig, GameEvent, Position, StreamId } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { deriveGame } from './game';
import { courtTime, lineupsAt } from './players';
import { isHelperStream, mergeStreams, streamCursors } from './streams';

const Q = 10 * 60_000;
const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };
const START: Partial<Record<Position, string>> = { GS: 'Ava', GA: 'Mia', WA: 'Kim', C: 'Zoe', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };
const HANA: StreamId = 'helper:hana';
const IRA: StreamId = 'helper:ira';
const T0 = Date.parse('2026-11-18T09:00:00.000Z');

/** An event on a stream, recorded `s` seconds after the game started. */
function ev(stream: StreamId, seq: number, s: number, type: GameEvent['type'], payload: object): GameEvent {
  return { id: `${stream}#${seq}`, gameId: 'g', stream, seq, type, payload, recordedAt: new Date(T0 + s * 1000).toISOString() } as GameEvent;
}
const clockAt = (s: number) => Q - s * 1000;
const goal = (seq: number, s: number, a: Partial<ActionPayload> = {}) =>
  ev('primary', seq, s, 'action', { period: 1, clockMs: clockAt(s), team: 'us', player: 'GA', action: 'Goal', ...a });
const sub = (stream: StreamId, seq: number, s: number, lineup: Partial<Record<Position, string>>, bench: string[]) =>
  ev(stream, seq, s, 'lineup_change', { period: 1, clockMs: clockAt(s), team: 'us', lineup, bench, detail: 'sub' });
const fix = (stream: StreamId, seq: number, s: number, target: string, patch?: object) =>
  ev(stream, seq, s, 'correction', patch ? { target, op: 'edit', patch } : { target, op: 'delete' });

/** Q1 under way: quarter start, starting lineup, clock start, then a GA goal at 60 s and another at 180 s. */
function primary(): GameEvent[] {
  return [
    ev('primary', 1, 0, 'period_start', { period: 1, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' }),
    ev('primary', 2, 0, 'lineup_change', { period: 1, clockMs: Q, team: 'us', lineup: START, bench: ['Jo'], detail: 'Starting lineup' }),
    ev('primary', 3, 0, 'clock_start', { period: 1, clockMs: Q }),
    goal(4, 60),
    goal(5, 180),
  ];
}
const ids = (events: GameEvent[]) => events.map((e) => e.id);

describe('isHelperStream', () => {
  it('names a helper stream and nothing else', () => {
    expect(isHelperStream('helper:hana')).toBe(true);
    expect(isHelperStream('primary')).toBe(false);
    expect(isHelperStream('shadow:hana')).toBe(false);
  });
});

describe('mergeStreams', () => {
  it('is the primary stream in seq order when nobody helps', () => {
    const p = primary();
    expect(mergeStreams([p[4], p[0], p[2], p[1], p[3]] as GameEvent[])).toEqual(p);
    expect(mergeStreams([])).toEqual([]);
  });

  it('leaves a shadow statistician out entirely', () => {
    const shadow = ev('shadow:ira', 1, 30, 'action', { period: 1, clockMs: clockAt(30), team: 'them', player: null, action: 'Goal' });
    expect(mergeStreams([...primary(), shadow])).toEqual(primary());
    expect(deriveGame(config, mergeStreams([...primary(), shadow])).score).toEqual({ us: 2, them: 0 });
  });

  it("puts a helper's substitution before the first play recorded after it", () => {
    const log = [...primary(), sub(HANA, 1, 120, { ...START, GA: 'Jo' }, ['Mia'])];
    const merged = mergeStreams(log);
    expect(ids(merged)).toEqual(['primary#1', 'primary#2', 'primary#3', 'primary#4', 'helper:hana#1', 'primary#5']);
    // The goal before the sub stays Mia's; the one after it is Jo's.
    const lineups = lineupsAt(merged);
    expect(lineups.get('primary#4')?.GA).toBe('Mia');
    expect(lineups.get('primary#5')?.GA).toBe('Jo');
    const state = deriveGame(config, merged);
    expect(state.lineup?.GA).toBe('Jo');
    expect(state.score.us).toBe(2);
  });

  it("counts the helper's substitution in time on court, by the game clock it carries", () => {
    const merged = mergeStreams([...primary(), sub(HANA, 1, 120, { ...START, GA: 'Jo' }, ['Mia'])]);
    const t = courtTime(merged, Q, clockAt(300));
    expect(t.Mia?.totalMs).toBe(120_000);
    expect(t.Jo?.totalMs).toBe(180_000);
  });

  it("applies a helper's corrections: a delete and an edit", () => {
    const deleted = mergeStreams([...primary(), fix(HANA, 1, 200, 'primary#5')]);
    expect(deriveGame(config, deleted).score.us).toBe(1);
    const edited = mergeStreams([...primary(), fix(HANA, 1, 200, 'primary#4', { action: 'Miss', rebound: 'theirs' })]);
    expect(deriveGame(config, edited).score.us).toBe(1);
  });

  it('a correction recorded after everything goes at the end', () => {
    const merged = mergeStreams([...primary(), fix(HANA, 1, 999, 'primary#4')]);
    expect(ids(merged).at(-1)).toBe('helper:hana#1');
  });

  it('when the recorder and the helper both change one event, the later change wins', () => {
    const helperFirst = [...primary(), fix(HANA, 1, 200, 'primary#4', { player: 'GS' }), fix('primary', 6, 210, 'primary#4', { player: 'WA' })];
    expect(lineupOfGoal(mergeStreams(helperFirst))).toBe('WA');
    const helperLast = [...primary(), fix('primary', 6, 200, 'primary#4', { player: 'WA' }), fix(HANA, 1, 210, 'primary#4', { player: 'GS' })];
    expect(lineupOfGoal(mergeStreams(helperLast))).toBe('GS');
  });

  it('a helper event recorded at the same instant as a primary one goes after it', () => {
    const merged = mergeStreams([...primary(), sub(HANA, 1, 60, { ...START, GA: 'Jo' }, ['Mia'])]);
    expect(ids(merged)).toEqual(['primary#1', 'primary#2', 'primary#3', 'primary#4', 'helper:hana#1', 'primary#5']);
    expect(lineupsAt(merged).get('primary#4')?.GA).toBe('Mia');
  });

  it('merges two helpers who took turns, each by the time recorded', () => {
    const log = [
      ...primary(),
      sub(HANA, 1, 30, { ...START, GA: 'Jo' }, ['Mia']),
      sub(IRA, 1, 120, START, ['Jo']),
      fix(IRA, 2, 200, 'primary#5'),
    ];
    const merged = mergeStreams(log);
    expect(ids(merged)).toEqual(['primary#1', 'primary#2', 'primary#3', 'helper:hana#1', 'primary#4', 'helper:ira#1', 'primary#5', 'helper:ira#2']);
    expect(lineupsAt(merged).get('primary#4')?.GA).toBe('Jo');
    expect(deriveGame(config, merged).score.us).toBe(1);
  });

  it('gives the same record whatever order the events arrived in, and with repeats', () => {
    const log = [...primary(), sub(HANA, 1, 120, { ...START, GA: 'Jo' }, ['Mia']), fix(HANA, 2, 200, 'primary#5'), sub(IRA, 1, 250, START, ['Jo'])];
    const expected = mergeStreams(log);
    const shuffled = [...log].reverse();
    expect(mergeStreams(shuffled)).toEqual(expected);
    expect(mergeStreams([...log, ...shuffled])).toEqual(expected);
  });

  it('uses only the unbroken run of each stream, so a missing event never changes a stat', () => {
    const p = primary();
    // Primary seq 4 has not arrived: seq 5 waits for it.
    expect(ids(mergeStreams([p[0], p[1], p[2], p[4]] as GameEvent[]))).toEqual(['primary#1', 'primary#2', 'primary#3']);
    // The helper's seq 1 has not arrived: their seq 2 (a delete) waits for it.
    const waiting = mergeStreams([...p, fix(HANA, 2, 200, 'primary#5')]);
    expect(waiting).toEqual(p);
    expect(deriveGame(config, waiting).score.us).toBe(2);
    // Once it arrives, both count.
    const arrived = mergeStreams([...p, fix(HANA, 2, 200, 'primary#5'), sub(HANA, 1, 120, { ...START, GA: 'Jo' }, ['Mia'])]);
    expect(deriveGame(config, arrived).score.us).toBe(1);
  });

  it('ignores anything on a helper stream that is not a substitution or a correction', () => {
    const stray = ev(HANA, 1, 100, 'action', { period: 1, clockMs: clockAt(100), team: 'them', player: null, action: 'Goal' });
    const clock = ev(HANA, 2, 110, 'clock_stop', { period: 1, clockMs: clockAt(110) });
    const merged = mergeStreams([...primary(), stray, clock, fix(HANA, 3, 200, 'primary#5')]);
    expect(ids(merged)).toEqual(['primary#1', 'primary#2', 'primary#3', 'primary#4', 'primary#5', 'helper:hana#3']);
    expect(deriveGame(config, merged).score).toEqual({ us: 1, them: 0 });
  });

  it('does not change the events it is given', () => {
    const log = [...primary(), fix(HANA, 1, 200, 'primary#5')];
    const copy = JSON.parse(JSON.stringify(log)) as GameEvent[];
    mergeStreams(log);
    expect(log).toEqual(copy);
  });
});

/** Which position the first goal is credited to after corrections (the second goal stays GA's). */
function lineupOfGoal(merged: GameEvent[]): string | undefined {
  const shots = deriveGame(config, merged).shotsByPosition;
  return Object.keys(shots).find((p) => p !== 'GA' && (shots[p as Position]?.goals ?? 0) > 0);
}

describe('streamCursors', () => {
  it('says how far each stream is held without a gap', () => {
    const p = primary();
    const log = [p[0], p[1], p[2], p[4], sub(HANA, 1, 120, START, []), fix(HANA, 2, 200, 'x'), fix(IRA, 2, 210, 'x')] as GameEvent[];
    expect(streamCursors(log)).toEqual({ primary: 3, 'helper:hana': 2, 'helper:ira': 0 });
    expect(streamCursors([])).toEqual({});
  });
});
