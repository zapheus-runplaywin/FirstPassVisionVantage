import { describe, expect, it } from 'vitest';
import { stream } from '../../live/__tests__/fixtures';
import { buildModel } from '../possessions';

const lineup = { GS: 'Priya', GA: 'Jade', WA: 'Kim', C: 'Tess', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };

function setup() {
  const s = stream();
  const lu = (l: object, clockMs = 600_000) => s.ev('lineup_change', { period: 1, clockMs, team: 'us', lineup: l, bench: [], detail: '' });
  return { s, lu };
}

describe('buildModel', () => {
  it('turns a centre pass and goal into one possession from the centre pass', () => {
    const { s, lu } = setup();
    const m = buildModel([s.start(1), lu(lineup), s.act(1, 590_000, { team: 'us', action: 'Receive', player: 'C' }), s.act(1, 580_000, { team: 'us', action: 'Goal', player: 'GS' })]);
    expect(m.possessions).toHaveLength(1);
    expect(m.possessions[0]).toMatchObject({ team: 'us', source: 'centre pass', outcome: 'goal', period: 1 });
    expect(m.possessions[0]!.shots[0]).toMatchObject({ position: 'GS', player: 'Priya', goal: true });
  });

  it('records a forced loss with the winner and starts their possession from a gain', () => {
    const { s, lu } = setup();
    const at = { x: 0.8, y: 0.3 };
    const m = buildModel([
      s.start(1),
      lu(lineup),
      s.act(1, 590_000, { team: 'them', action: 'Receive' }),
      s.act(1, 580_000, { team: 'us', action: 'Won it', player: 'GD', cause: 'Intercept', at }),
      s.act(1, 570_000, { team: 'us', action: 'Goal', player: 'GA' }),
    ]);
    expect(m.possessions.map((p) => [p.team, p.source, p.outcome])).toEqual([
      ['them', 'centre pass', 'lost'],
      ['us', 'gain', 'goal'],
    ]);
    expect(m.possessions[0]!.loss).toMatchObject({ forced: true, winner: 'Sam', winnerPosition: 'GD', at });
  });

  it('records an unforced loss by our player and gives them a turnover possession', () => {
    const { s, lu } = setup();
    const m = buildModel([
      s.start(1),
      lu(lineup),
      s.act(1, 590_000, { team: 'us', action: 'Receive', player: 'C' }),
      s.act(1, 585_000, { team: 'us', action: 'Lost it', player: 'WA', cause: 'Bad pass', at: { x: 0.7, y: 0.5 } }),
      s.act(1, 575_000, { team: 'them', action: 'Miss', rebound: 'theirs' }),
    ]);
    expect(m.possessions.map((p) => [p.team, p.source, p.outcome])).toEqual([
      ['us', 'centre pass', 'lost'],
      ['them', 'turnover', 'miss'],
      ['us', 'rebound', 'open'],
    ]);
    expect(m.possessions[0]!.loss).toMatchObject({ forced: false, player: 'Kim', position: 'WA' });
  });

  it('reads OREB and DREB from the shooting team\'s side, as the engine does', () => {
    const { s } = setup();
    const m = buildModel([
      s.start(1),
      s.act(1, 590_000, { team: 'them', action: 'Receive' }),
      s.act(1, 580_000, { team: 'them', action: 'Miss', rebound: 'ours' }),
      s.act(1, 575_000, { team: 'them', action: 'Goal' }),
    ]);
    expect(m.possessions.map((p) => [p.team, p.outcome, p.shots.length])).toEqual([['them', 'goal', 2]]);
  });

  it('keeps an offensive rebound in the same possession and sends an out-of-court miss to a throw in', () => {
    const { s } = setup();
    const m = buildModel([
      s.start(1),
      s.act(1, 590_000, { team: 'us', action: 'Receive' }),
      s.act(1, 580_000, { team: 'us', action: 'Miss', player: 'GS', rebound: 'ours' }),
      s.act(1, 575_000, { team: 'us', action: 'Miss', player: 'GS', rebound: 'out' }),
    ]);
    expect(m.possessions).toHaveLength(2);
    expect(m.possessions[0]).toMatchObject({ source: 'centre pass', outcome: 'miss' });
    expect(m.possessions[0]!.shots).toHaveLength(2);
    expect(m.possessions[1]).toMatchObject({ team: 'them', source: 'throw in', outcome: 'open' });
  });

  it('places an end with no start as unknown, and closes a possession at the quarter end', () => {
    const { s } = setup();
    const m = buildModel([s.start(1), s.act(1, 590_000, { team: 'us', action: 'Goal', player: 'GS' }), s.act(1, 580_000, { team: 'them', action: 'Receive' }), s.end(1), s.start(2)]);
    expect(m.possessions.map((p) => [p.source, p.outcome])).toEqual([
      ['unknown', 'goal'],
      ['centre pass', 'period end'],
    ]);
    expect(m.period).toBe(2);
  });

  it('keeps shots with the player who took them after a sub', () => {
    const { s, lu } = setup();
    const m = buildModel([
      s.start(1),
      lu(lineup),
      s.act(1, 590_000, { team: 'us', action: 'Goal', player: 'GA' }),
      lu({ ...lineup, GA: 'Ava' }, 500_000),
      s.act(1, 490_000, { team: 'us', action: 'Goal', player: 'GA' }),
    ]);
    expect(m.possessions.flatMap((p) => p.shots.map((x) => x.player))).toEqual(['Jade', 'Ava']);
    expect(m.lineup.GA).toBe('Ava');
  });

  it('applies corrections first', () => {
    const { s } = setup();
    const lost = s.act(1, 585_000, { team: 'us', action: 'Lost it', player: 'WA' });
    const m = buildModel([s.start(1), s.act(1, 590_000, { team: 'us', action: 'Receive' }), lost, s.correction(lost.id), s.act(1, 580_000, { team: 'us', action: 'Goal', player: 'GS' })]);
    expect(m.possessions.map((p) => [p.source, p.outcome])).toEqual([['centre pass', 'goal']]);
  });

  it('ignores feeds, touches and penalties for possession', () => {
    const { s } = setup();
    const m = buildModel([
      s.start(1),
      s.act(1, 590_000, { team: 'us', action: 'Receive' }),
      s.act(1, 588_000, { team: 'us', action: 'Feed', player: 'WA' }),
      s.act(1, 587_000, { team: 'us', action: 'Touch', player: 'C' }),
      s.act(1, 586_000, { team: 'us', action: 'Penalty', player: 'GD' }),
      s.act(1, 580_000, { team: 'us', action: 'Goal', player: 'GS' }),
    ]);
    expect(m.possessions).toHaveLength(1);
  });
});
