import type { ActionPayload, GameConfig, GameEvent, Position } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { deriveGame } from './game';
import { courtTime, lineupsAt } from './players';

const Q = 10 * 60_000;
const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };
const START: Partial<Record<Position, string>> = { GS: 'Ava', GA: 'Mia', WA: 'Kim', C: 'Zoe', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };

let seq = 0;
function ev(type: GameEvent['type'], payload: object): GameEvent {
  seq++;
  return { id: `e${seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: '2026-11-13T09:00:00.000Z' } as GameEvent;
}
const min = (m: number) => m * 60_000;
const at = (m: number) => Q - min(m); // clock time m minutes into a quarter
const start = (period: number) => ev('period_start', { period, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' });
const end = (period: number, clockMs = 0) => ev('period_end', { period, clockMs });
const lineup = (period: number, clockMs: number, l: Partial<Record<Position, string>>, bench: string[] = []) =>
  ev('lineup_change', { period, clockMs, team: 'us', lineup: l, bench, detail: 'x' });
const act = (period: number, clockMs: number, a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>) =>
  ev('action', { period, clockMs, player: null, ...a });
const del = (target: string) => ev('correction', { target, op: 'delete' });

function opening(): GameEvent[] {
  seq = 0;
  return [start(1), lineup(1, Q, START, ['Jo'])];
}

describe('courtTime', () => {
  it('gives everyone a full quarter when nobody comes off', () => {
    const t = courtTime([...opening(), end(1)], Q);
    expect(Object.keys(t).sort()).toEqual(['Ava', 'Kim', 'Lily', 'Mia', 'Ruby', 'Sam', 'Zoe']);
    expect(t.Ava).toEqual({ totalMs: Q, byPosition: { GS: Q }, byPeriod: { 1: Q } });
  });

  it('splits a quarter at a rolling sub, by game clock', () => {
    const log = [...opening(), lineup(1, at(4), { ...START, GA: 'Jo' }, ['Mia']), end(1)];
    const t = courtTime(log, Q);
    expect(t.Mia?.totalMs).toBe(min(4));
    expect(t.Jo).toEqual({ totalMs: min(6), byPosition: { GA: min(6) }, byPeriod: { 1: min(6) } });
    expect(t.Ava?.totalMs).toBe(Q);
  });

  it('a sub while the clock is stopped mid-quarter counts from that clock time', () => {
    const log = [
      ...opening(),
      ev('clock_start', { period: 1, clockMs: Q }),
      ev('clock_stop', { period: 1, clockMs: at(7) }),
      lineup(1, at(7), { ...START, GK: 'Jo' }, ['Ruby']),
      ev('clock_start', { period: 1, clockMs: at(7) }),
      end(1),
    ];
    const t = courtTime(log, Q);
    expect(t.Ruby?.totalMs).toBe(min(7));
    expect(t.Jo?.totalMs).toBe(min(3));
  });

  it('a position swap moves both players to their new positions', () => {
    const log = [...opening(), lineup(1, at(5), { ...START, GA: 'Kim', WA: 'Mia' }), end(1)];
    const t = courtTime(log, Q);
    expect(t.Mia?.byPosition).toEqual({ GA: min(5), WA: min(5) });
    expect(t.Kim?.byPosition).toEqual({ WA: min(5), GA: min(5) });
    expect(t.Ava?.byPosition).toEqual({ GS: Q });
  });

  it('a change made in the break takes effect from the start of the next quarter', () => {
    const log = [...opening(), end(1), lineup(1, Q, { ...START, C: 'Jo' }, ['Zoe']), start(2), end(2)];
    const t = courtTime(log, Q);
    expect(t.Zoe).toEqual({ totalMs: Q, byPosition: { C: Q }, byPeriod: { 1: Q } });
    expect(t.Jo).toEqual({ totalMs: Q, byPosition: { C: Q }, byPeriod: { 2: Q } });
  });

  it('a break change carrying the next quarter and its start time is the same', () => {
    const log = [...opening(), end(1), lineup(2, Q, { ...START, C: 'Jo' }, ['Zoe']), start(2), end(2)];
    expect(courtTime(log, Q).Jo?.byPeriod).toEqual({ 2: Q });
  });

  it('counts a quarter ended early only up to the clock time it ended', () => {
    const t = courtTime([...opening(), end(1, at(8))], Q);
    expect(t.Ava?.totalMs).toBe(min(8));
  });

  it('counts a quarter in play up to the clock now, or the last event without it', () => {
    const log = [...opening(), act(1, at(3), { team: 'us', action: 'Goal', player: 'GS' })];
    expect(courtTime(log, Q, at(6)).Ava?.totalMs).toBe(min(6));
    expect(courtTime(log, Q).Ava?.totalMs).toBe(min(3));
  });

  it('a deleted sub is as if it never happened', () => {
    const base = opening();
    const sub = lineup(1, at(4), { ...START, GA: 'Jo' }, ['Mia']);
    const t = courtTime([...base, sub, del(sub.id), end(1)], Q);
    expect(t.Mia?.totalMs).toBe(Q);
    expect(t.Jo).toBeUndefined();
  });

  it('adds up across quarters', () => {
    const log = [...opening(), end(1), start(2), lineup(2, at(2), { ...START, GS: 'Jo' }, ['Ava']), end(2)];
    const t = courtTime(log, Q);
    expect(t.Ava).toEqual({ totalMs: Q + min(2), byPosition: { GS: Q + min(2) }, byPeriod: { 1: Q, 2: min(2) } });
  });

  it('ignores the opposition lineup', () => {
    const log = [...opening(), ev('lineup_change', { period: 1, clockMs: at(1), team: 'them', lineup: { GS: 'X' }, bench: [], detail: '' }), end(1)];
    expect(courtTime(log, Q).X).toBeUndefined();
  });
});

describe('lineupsAt and shots by player', () => {
  it('keeps each shot with the player who took it, after a sub', () => {
    const log = [
      ...opening(),
      act(1, at(1), { team: 'us', action: 'Goal', player: 'GA' }),
      act(1, at(2), { team: 'us', action: 'Miss', player: 'GA', rebound: 'theirs' }),
      lineup(1, at(5), { ...START, GA: 'Jo' }, ['Mia']),
      act(1, at(6), { team: 'us', action: 'Goal', player: 'GA' }),
      act(1, at(7), { team: 'us', action: 'Goal', player: '?' }),
    ];
    const state = deriveGame(config, log);
    expect(state.shotsByPlayer).toEqual({
      Mia: { attempts: 2, goals: 1, positions: ['GA'] },
      Jo: { attempts: 1, goals: 1, positions: ['GA'] },
    });
    expect(state.shotsByPosition.GA).toEqual({ attempts: 3, goals: 2 });

    const names = lineupsAt(log);
    expect(names.get(log[2]!.id)?.GA).toBe('Mia');
    expect(names.get(log[5]!.id)?.GA).toBe('Jo');
  });

  it('lists every position a player shot from', () => {
    const log = [
      ...opening(),
      act(1, at(1), { team: 'us', action: 'Goal', player: 'GA' }),
      lineup(1, at(5), { ...START, GA: 'Ava', GS: 'Mia' }),
      act(1, at(6), { team: 'us', action: 'Goal', player: 'GS' }),
    ];
    expect(deriveGame(config, log).shotsByPlayer.Mia).toEqual({ attempts: 2, goals: 2, positions: ['GA', 'GS'] });
  });
});
