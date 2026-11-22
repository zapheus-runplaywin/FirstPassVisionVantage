import { deriveGame, netPoints } from '@firstpass/engine';
import { describe, expect, it } from 'vitest';
import { Q, config, stream } from '../../live/__tests__/fixtures';
import { gameReport, minutes } from '../report';

/*
 * The game report: the same figures the engine gives Vantage, laid out as
 * tables, with a Game row once there is more than one quarter, and plain
 * words where a table has nothing in it.
 */

const LINEUP = { GS: 'Ava Lee', GA: 'Mia Chen', WA: 'Kim Tran', C: 'Zoe Hall', WD: 'Lily Ross', GD: 'Sam Wood', GK: 'Ruby Shaw' };

function twoQuarters() {
  const s = stream();
  return [
    s.start(1),
    s.ev('lineup_change', { period: 1, clockMs: Q, team: 'us', lineup: LINEUP, bench: [], detail: 'Starting lineup' }),
    s.clockStart(1, Q, 0),
    s.act(1, Q - 5_000, { team: 'us', player: 'C', action: 'Receive' }),
    s.act(1, Q - 20_000, { team: 'us', player: 'GS', action: 'Goal' }),
    s.act(1, Q - 30_000, { team: 'them', action: 'Receive' }),
    s.act(1, Q - 40_000, { team: 'us', player: 'GD', action: 'Won it', cause: 'Intercept' }),
    s.act(1, Q - 60_000, { team: 'us', player: 'GA', action: 'Miss', rebound: 'theirs' }),
    s.act(1, Q - 90_000, { team: 'them', action: 'Goal' }),
    s.clockStop(1, 0, Q),
    s.end(1, Q),
    s.start(2, Q + 60_000),
    s.clockStart(2, Q, Q + 60_000),
    s.act(2, Q - 5_000, { team: 'us', player: 'C', action: 'Receive' }),
    s.act(2, Q - 15_000, { team: 'us', player: 'WA', action: 'Lost it', cause: 'Bad pass' }),
    s.act(2, Q - 30_000, { team: 'us', player: 'GS', action: 'Goal' }),
    s.clockStop(2, 0, 2 * Q + 60_000),
    s.end(2, 2 * Q + 60_000),
  ];
}

const table = (report: ReturnType<typeof gameReport>, title: string) => report.tables.find((t) => t.title === title)!;

describe('gameReport', () => {
  const events = twoQuarters();
  const report = gameReport(config, events);
  const state = deriveGame(config, events);

  it('has a row per quarter and a Game row that adds them up', () => {
    const rows = table(report, 'By quarter').rows;
    expect(rows.map((r) => r[0])).toEqual(['Q1', 'Q2', 'Game']);
    expect(rows[0]![1]).toBe(`${state.quarters[1]!.us}–${state.quarters[1]!.them}`);
    expect(rows[2]![1]).toBe(`${state.score.us}–${state.score.them}`);
    expect(rows[2]![1]).toBe('2–1');
    // Shooting for the game: Ava 2 of 2, Mia 0 of 1.
    expect(rows[2]![3]).toBe('67%');
    // Centre passes to goal: scored from in Q1, lost in Q2.
    expect(rows.map((r) => r[2])).toEqual(['1/1', '0/1', '1/2']);
    expect(rows[2]![4]).toBe(String(state.gains));
    expect(rows[2]![5]).toBe(String(state.unforced));
  });

  it('lists shooters by who shot most, with the positions they shot from', () => {
    expect(table(report, 'Shooters').rows).toEqual([
      ['Ava Lee (GS)', '2 of 2', '100%'],
      ['Mia Chen (GA)', '0 of 1', '0%'],
    ]);
  });

  it('gives every player in the lineup their time on court', () => {
    const rows = table(report, 'Time on court').rows;
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r[0] === 'Ava Lee')).toEqual(['Ava Lee', '20:00', 'GS']);
  });

  it('shows the same Net Points as the engine, players first and then the teams', () => {
    const np = netPoints(events);
    const rows = table(report, 'Net Points').rows;
    expect(rows.at(-2)).toEqual(['Thunder', String(np.team.us)]);
    expect(rows.at(-1)).toEqual(['Storm', String(np.team.them)]);
    for (const [name, value] of Object.entries(np.byPlayer)) expect(rows).toContainEqual([name, String(value)]);
    const values = rows.slice(0, -2).map((r) => Number(r[1]));
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('counts the other team\'s rebound for them', () => {
    expect(table(report, 'Rebounds').rows).toContainEqual(['Storm', '0', '1']);
  });

  it('leaves out a deleted event', () => {
    const s = stream();
    const withDelete = [s.start(1), s.act(1, Q - 5_000, { team: 'us', player: 'GS', action: 'Goal' }), s.correction('e2')];
    expect(table(gameReport(config, withDelete), 'By quarter').rows[0]![1]).toBe('0–0');
  });
});

describe('an empty game', () => {
  it('has no rows and says so in words', () => {
    const report = gameReport(config, []);
    for (const t of report.tables) {
      expect(t.rows).toEqual([]);
      expect(t.empty).not.toBe('');
    }
    expect(report.unforcedByThird).toBe('');
  });

  it('has no Game row for a single quarter', () => {
    const s = stream();
    expect(table(gameReport(config, [s.start(1)]), 'By quarter').rows.map((r) => r[0])).toEqual(['Q1']);
  });
});

describe('minutes', () => {
  it('writes time on court as minutes and seconds', () => {
    expect(minutes(0)).toBe('0:00');
    expect(minutes(750_000)).toBe('12:30');
    expect(minutes(-5)).toBe('0:00');
  });
});
