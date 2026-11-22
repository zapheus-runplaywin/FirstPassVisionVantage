import type { ActionPayload, GameConfig, GameEvent, Position } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { netPoints } from './netPoints';
import { addLines, emptyLine, netPointsPer10, playerKey, playerLines, seasonPlayers, shootingPercent, type SeasonGame } from './season';

const Q = 10 * 60_000;
const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };
const START: Partial<Record<Position, string>> = { GS: 'Ava', GA: 'Mia', WA: 'Kim', C: 'Zoe', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };

let seq = 0;
function ev(type: GameEvent['type'], payload: object): GameEvent {
  seq++;
  return { id: `e${seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: '2026-11-13T09:00:00.000Z' } as GameEvent;
}
const min = (m: number) => m * 60_000;
const at = (m: number) => Q - min(m);
const start = (period: number) => ev('period_start', { period, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' });
const end = (period: number) => ev('period_end', { period, clockMs: 0 });
const lineup = (period: number, clockMs: number, l: Partial<Record<Position, string>>) =>
  ev('lineup_change', { period, clockMs, team: 'us', lineup: l, bench: [], detail: 'x' });
const act = (period: number, clockMs: number, a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>) =>
  ev('action', { period, clockMs, player: null, ...a });

/** One quarter: Mia (GA) shoots 2 from 3 and is subbed for Jo at 6 minutes; Sam intercepts; Zoe loses one and gives a penalty. */
function gameOne(names: Partial<Record<Position, string>> = START): GameEvent[] {
  seq = 0;
  return [
    start(1),
    lineup(1, Q, names),
    act(1, at(1), { team: 'us', action: 'Receive', player: 'WA' }),
    act(1, at(1), { team: 'us', action: 'Feed', player: 'WA' }),
    act(1, at(1), { team: 'us', action: 'Goal', player: 'GA' }),
    act(1, at(2), { team: 'us', action: 'Miss', player: 'GA', rebound: 'ours' }),
    act(1, at(2), { team: 'us', action: 'Goal', player: 'GA' }),
    act(1, at(3), { team: 'us', action: 'Won it', player: 'GD', cause: 'Intercept' }),
    act(1, at(3), { team: 'us', action: 'Touch', player: 'GK' }),
    act(1, at(4), { team: 'us', action: 'Lost it', player: 'C' }),
    act(1, at(5), { team: 'us', action: 'Penalty', player: 'C' }),
    act(1, at(5), { team: 'them', action: 'Goal', player: 'GS' }),
    lineup(1, at(6), { ...names, GA: 'Jo' }),
    act(1, at(7), { team: 'us', action: 'Goal', player: 'GA' }),
    act(1, at(8), { team: 'us', action: 'Won it', player: '?', cause: 'Pickup' }),
    end(1),
  ];
}

describe('playerLines', () => {
  it('gives each player what they did while the lineup named them', () => {
    const lines = playerLines(config, gameOne());
    expect(lines.Mia).toMatchObject({ courtMs: min(6), quarters: 1, positions: ['GA'], goals: 2, shots: 3 });
    expect(lines.Jo).toMatchObject({ courtMs: min(4), quarters: 1, positions: ['GA'], goals: 1, shots: 1 });
    expect(lines.Kim).toMatchObject({ feeds: 1, receives: 1, courtMs: Q });
    expect(lines.Sam).toMatchObject({ gains: 1, intercepts: 1 });
    expect(lines.Ruby).toMatchObject({ touches: 1, gains: 0 });
    expect(lines.Zoe).toMatchObject({ turnovers: 1, penalties: 1 });
    expect(Object.keys(lines).sort()).toEqual(['Ava', 'Jo', 'Kim', 'Lily', 'Mia', 'Ruby', 'Sam', 'Zoe']);
  });

  it('leaves out the other team and actions with no player', () => {
    const lines = playerLines(config, gameOne());
    const gains = Object.values(lines).reduce((n, l) => n + l.gains, 0);
    expect(gains).toBe(1);
    expect(Object.values(lines).reduce((n, l) => n + l.goals, 0)).toBe(3);
  });

  it('agrees with Net Points by player', () => {
    const log = gameOne();
    const lines = playerLines(config, log);
    for (const [name, points] of Object.entries(netPoints(log).byPlayer)) expect(lines[name]?.netPoints).toBeCloseTo(points, 5);
  });

  it('counts the quarters and positions a player had', () => {
    seq = 0;
    const log = [start(1), lineup(1, Q, START), end(1), lineup(1, 0, { ...START, GS: 'Mia', GA: 'Ava' }), start(2), end(2)];
    const lines = playerLines(config, log);
    expect(lines.Mia).toMatchObject({ courtMs: 2 * Q, quarters: 2, positions: ['GS', 'GA'] });
  });

  it('gives nobody anything when no lineup was recorded', () => {
    seq = 0;
    expect(playerLines(config, [start(1), act(1, at(1), { team: 'us', action: 'Goal', player: 'GA' }), end(1)])).toEqual({});
  });
});

describe('seasonPlayers', () => {
  const game = (id: string, playedAt: string, events: GameEvent[], label = `v ${id}`): SeasonGame => ({ id, label, playedAt, config, events });

  it('adds a player\'s games together, oldest game first', () => {
    const season = seasonPlayers([game('b', '2026-05-09T02:00:00Z', gameOne()), game('a', '2026-05-02T02:00:00Z', gameOne())]);
    const mia = season.find((p) => p.name === 'Mia')!;
    expect(mia.games.map((g) => g.id)).toEqual(['a', 'b']);
    expect(mia.total).toMatchObject({ courtMs: min(12), quarters: 2, goals: 4, shots: 6, positions: ['GA'] });
    expect(mia.total.netPoints).toBeCloseTo(mia.games[0]!.line.netPoints * 2, 5);
  });

  it('matches a name between games whatever its case and spacing, and shows the latest spelling', () => {
    const season = seasonPlayers([
      game('a', '2026-05-02T02:00:00Z', gameOne({ ...START, GA: 'mia  chen' })),
      game('b', '2026-05-09T02:00:00Z', gameOne({ ...START, GA: ' Mia Chen' })),
    ]);
    const mia = season.filter((p) => playerKey(p.name) === 'mia chen');
    expect(mia).toHaveLength(1);
    expect(mia[0]!.name).toBe('Mia Chen');
    expect(mia[0]!.total.shots).toBe(6);
  });

  it('lists a player only in the games they were named in', () => {
    const season = seasonPlayers([game('a', '2026-05-02T02:00:00Z', gameOne()), game('b', '2026-05-09T02:00:00Z', gameOne({ ...START, WA: 'Tess' }))]);
    expect(season.find((p) => p.name === 'Tess')!.games.map((g) => g.id)).toEqual(['b']);
    expect(season.find((p) => p.name === 'Kim')!.games.map((g) => g.id)).toEqual(['a']);
  });

  it('puts the most time on court first', () => {
    const season = seasonPlayers([game('a', '2026-05-02T02:00:00Z', gameOne())]);
    expect(season.at(-1)!.name).toBe('Jo');
    expect(season[0]!.total.courtMs).toBe(Q);
  });

  it('is empty for no games', () => {
    expect(seasonPlayers([])).toEqual([]);
  });
});

describe('rates', () => {
  it('adds two lines', () => {
    const a = { ...emptyLine(), goals: 2, shots: 3, courtMs: 1000, netPoints: 1.5, positions: ['GA'] as Position[] };
    const b = { ...emptyLine(), goals: 1, shots: 1, courtMs: 500, netPoints: -0.5, positions: ['GS', 'GA'] as Position[] };
    expect(addLines(a, b)).toMatchObject({ goals: 3, shots: 4, courtMs: 1500, netPoints: 1, positions: ['GS', 'GA'] });
  });

  it('gives shooting as a whole percentage, or nothing without a shot', () => {
    expect(shootingPercent({ goals: 2, shots: 3 })).toBe(67);
    expect(shootingPercent({ goals: 0, shots: 0 })).toBeNull();
  });

  it('gives Net Points per 10 minutes, but not for under 5 minutes on court', () => {
    expect(netPointsPer10({ netPoints: 12, courtMs: min(40) })).toBe(3);
    expect(netPointsPer10({ netPoints: -4.5, courtMs: min(15) })).toBe(-3);
    expect(netPointsPer10({ netPoints: 8, courtMs: min(4) })).toBeNull();
  });
});
