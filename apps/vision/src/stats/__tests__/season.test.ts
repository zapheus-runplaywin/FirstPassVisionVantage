import { emptyLine, type PlayerLine, type SeasonPlayer } from '@firstpass/engine';
import { describe, expect, it } from 'vitest';
import { ROUND_HEAD, SEASON_HEAD, courtMinutes, extrasLine, playhqScores, roundRows, seasonRows, withPlayhq, type PlayhqGame } from '../season';

const line = (over: Partial<PlayerLine>): PlayerLine => ({ ...emptyLine(), ...over });
const min = (m: number) => m * 60_000;

const one = line({ courtMs: min(40), quarters: 4, positions: ['GS', 'GA'], goals: 18, shots: 24, gains: 1, turnovers: 3, penalties: 2, netPoints: 22.5 });
const two = line({ courtMs: min(20), quarters: 2, positions: ['GA'], goals: 6, shots: 6, turnovers: 4, penalties: 1, netPoints: -4 });
const mia: SeasonPlayer = {
  name: 'Mia Chen',
  games: [
    { id: 'a', label: '2 May v Swans', playedAt: '2026-05-02T02:00:00Z', line: one },
    { id: 'b', label: '9 May v Hawks', playedAt: '2026-05-09T02:00:00Z', line: two },
  ],
  total: line({ courtMs: min(60), quarters: 6, positions: ['GS', 'GA'], goals: 24, shots: 30, gains: 1, turnovers: 7, penalties: 3, netPoints: 18.5, intercepts: 1, feeds: 12 }),
};
const sam: SeasonPlayer = {
  name: 'Sam Lee',
  games: [{ id: 'a', label: '2 May v Swans', playedAt: '2026-05-02T02:00:00Z', line: line({ courtMs: min(4), positions: ['GK'], gains: 2, netPoints: 16 }) }],
  total: line({ courtMs: min(4), quarters: 1, positions: ['GK'], gains: 2, netPoints: 16 }),
};

describe('seasonRows', () => {
  it('gives each athlete a row under the heading', () => {
    const rows = seasonRows([mia, sam]);
    expect(rows[0]).toEqual(['Mia Chen', '2', '60 min', '24/30 80%', '1', '7', '+18.5', '+3.1']);
    expect(rows[0]).toHaveLength(SEASON_HEAD.length);
  });

  it('shows a dash for no shots, and no rate under 5 minutes on court', () => {
    expect(seasonRows([sam])[0]).toEqual(['Sam Lee', '1', '4 min', '–', '2', '0', '+16', '–']);
  });

  it('writes a minus and a nought plainly', () => {
    const flat = { ...sam, total: line({ courtMs: min(30), netPoints: 0 }) };
    const down = { ...sam, total: line({ courtMs: min(30), netPoints: -6 }) };
    expect(seasonRows([flat])[0]!.slice(-2)).toEqual(['0', '0']);
    expect(seasonRows([down])[0]!.slice(-2)).toEqual(['−6', '−2']);
  });
});

describe('roundRows', () => {
  it('lists an athlete\'s games oldest first, then the season', () => {
    const rows = roundRows(mia);
    expect(rows.map((r) => r[0])).toEqual(['2 May v Swans', '9 May v Hawks', 'Season']);
    expect(rows[0]).toEqual(['2 May v Swans', '40 min', 'GS GA', '18/24 75%', '1', '3', '2', '+22.5']);
    expect(rows[1]).toEqual(['9 May v Hawks', '20 min', 'GA', '6/6 100%', '0', '4', '1', '−4']);
    expect(rows[2]).toHaveLength(ROUND_HEAD.length);
  });

  it('leaves the season row off for one game', () => {
    expect(roundRows(sam).map((r) => r[0])).toEqual(['2 May v Swans']);
  });
});

describe('extrasLine', () => {
  it('says only what there was', () => {
    expect(extrasLine(mia.total)).toBe('1 intercept · 12 feeds · 6 quarters played');
    expect(extrasLine(line({ offensiveRebounds: 1, touches: 2, receives: 1 }))).toBe('1 centre pass receive · 1 rebound · 2 touches');
    expect(extrasLine(emptyLine())).toBe('');
  });
});

it('rounds court time to whole minutes', () => {
  expect(courtMinutes(min(12) + 29_000)).toBe('12 min');
  expect(courtMinutes(min(12) + 31_000)).toBe('13 min');
});

/*
 * Games nobody recorded join the season from PlayHQ's scoresheet, which has
 * shooting only. They must never look like recorded games, and never bend the
 * figures that come from recorded ones.
 */
describe('withPlayhq', () => {
  const swans: PlayhqGame = {
    id: 'f1',
    label: '25 Apr v Kites',
    playedAt: '2026-04-25T02:00:00Z',
    us: 41,
    them: 38,
    players: [
      { name: ' mia  CHEN ', positions: ['GA', 'GS', 'Bench'], goals: 20, shots: 25 },
      { name: 'Ava New', positions: ['C'], goals: 0, shots: null },
    ],
  };
  const goalsOnly: PlayhqGame = { id: 'f2', label: '16 May v Owls', playedAt: '2026-05-16T02:00:00Z', us: 30, them: 30, players: [{ name: 'Mia Chen', positions: [], goals: 12, shots: null }] };

  it('changes nothing with no games from PlayHQ', () => {
    expect(withPlayhq([mia, sam], [])).toEqual([mia, sam]);
    expect(seasonRows(withPlayhq([mia, sam], []))).toEqual(seasonRows([mia, sam]));
  });

  it('adds a game to the athlete of the same name, in date order, marked as PlayHQ\'s', () => {
    const [first] = withPlayhq([mia, sam], [swans]);
    expect(first!.name).toBe('Mia Chen');
    expect(first!.games.map((g) => [g.id, !!g.playhq])).toEqual([
      ['playhq:f1', true],
      ['a', false],
      ['b', false],
    ]);
    expect(first!.games[0]!.line.positions).toEqual(['GS', 'GA']);
  });

  it('adds shooting to the total and leaves court time, gains and Net Points as recorded', () => {
    const [first] = withPlayhq([mia, sam], [swans]);
    expect(first!.total).toEqual({ ...mia.total, goals: 44, shots: 55 });
    expect(seasonRows([first!])[0]).toEqual(['Mia Chen', '3', '60 min', '44/55 80%', '1', '7', '+18.5', '+3.1']);
  });

  it('keeps goals with no attempts out of the percentage, and shows them on the game\'s row', () => {
    const [first] = withPlayhq([mia], [goalsOnly]);
    expect(first!.total).toEqual(mia.total);
    expect(roundRows(first!).map((r) => r.slice(0, 4))).toEqual([
      ['2 May v Swans', '40 min', 'GS GA', '18/24 75%'],
      ['9 May v Hawks', '20 min', 'GA', '6/6 100%'],
      ['16 May v Owls · PlayHQ', '–', '', '12 goals'],
      ['Season', '60 min', 'GS GA', '24/30 80%'],
    ]);
  });

  it('shows dashes, not noughts, for what PlayHQ does not know', () => {
    const rows = roundRows(withPlayhq([mia], [swans])[0]!);
    expect(rows[0]).toEqual(['25 Apr v Kites · PlayHQ', '–', 'GS GA', '20/25 80%', '–', '–', '–', '–']);
    expect(rows[0]).toHaveLength(ROUND_HEAD.length);
  });

  it('lists someone only PlayHQ names, after everyone with court time, with dashes', () => {
    const all = withPlayhq([sam, mia], [swans]);
    expect(all.map((p) => p.name)).toEqual(['Mia Chen', 'Sam Lee', 'Ava New']);
    expect(seasonRows(all)[2]).toEqual(['Ava New', '1', '–', '–', '–', '–', '–', '–']);
    expect(roundRows(all[2]!)).toEqual([['25 Apr v Kites · PlayHQ', '–', 'C', '–', '–', '–', '–', '–']]);
  });

  it('never counts more goals than attempts', () => {
    const odd: PlayhqGame = { ...goalsOnly, players: [{ name: 'Mia Chen', positions: [], goals: 5, shots: 3 }] };
    expect(withPlayhq([], [odd])[0]!.total).toMatchObject({ goals: 5, shots: 5 });
  });

  it('says one goal plainly and skips a nameless player', () => {
    const one: PlayhqGame = { ...goalsOnly, players: [{ name: 'Mia Chen', positions: [], goals: 1, shots: null }, { name: '  ', positions: [], goals: 9, shots: 9 }] };
    const all = withPlayhq([], [one]);
    expect(all).toHaveLength(1);
    expect(roundRows(all[0]!)[0]![3]).toBe('1 goal');
  });

  it('does not change the players it was given', () => {
    const before = JSON.stringify([mia, sam]);
    withPlayhq([mia, sam], [swans, goalsOnly]);
    expect(JSON.stringify([mia, sam])).toBe(before);
  });

  it('writes the scores oldest first', () => {
    expect(playhqScores([goalsOnly, swans])).toBe('25 Apr v Kites 41–38 · 16 May v Owls 30–30');
  });
});
