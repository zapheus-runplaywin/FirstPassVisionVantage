import type { ActionPayload, GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { netPoints } from './netPoints';

let seq = 0;
function envelope() {
  seq++;
  return { id: `e${seq}`, gameId: 'g', stream: 'primary' as const, seq, recordedAt: '2026-10-14T00:00:00Z' };
}

function act(a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>, period = 1): GameEvent {
  return { ...envelope(), type: 'action', payload: { period, clockMs: 0, player: null, ...a } };
}

describe('netPoints', () => {
  it('scores a centre pass, feed and goal', () => {
    const np = netPoints([
      act({ team: 'us', action: 'Receive', player: 'WA' }),
      act({ team: 'us', action: 'Feed', player: 'WA' }),
      act({ team: 'us', action: 'Goal', player: 'GS' }),
    ]);
    // Receive 1 + feed with goal assist 2 for WA, centre pass 0.5 for C, goal 2 for GS.
    expect(np.byPosition).toEqual({ WA: 3, C: 0.5, GS: 2 });
    expect(np.team).toEqual({ us: 5.5, them: 0 });
  });

  it('scores a feed with attempt and a missed goal turnover', () => {
    const np = netPoints([
      act({ team: 'us', action: 'Feed', player: 'GA' }),
      act({ team: 'us', action: 'Miss', player: 'GS', rebound: 'theirs' }),
    ]);
    expect(np.byPosition).toEqual({ GA: 1.5, GS: -9 });
    expect(np.team.them).toBe(3);
  });

  it('counts a feed once, at its best outcome, across our own rebound', () => {
    const np = netPoints([
      act({ team: 'us', action: 'Feed', player: 'WA' }),
      act({ team: 'us', action: 'Miss', player: 'GS', rebound: 'ours' }),
      act({ team: 'us', action: 'Goal', player: 'GS' }),
    ]);
    // The feed counts once, at its best outcome: a goal assist.
    expect(np.byPosition.WA).toBe(2);
  });

  it('values gains by cause and mirrors the turnover at team level', () => {
    const np = netPoints([
      act({ team: 'us', action: 'Won it', player: 'GD', cause: 'Intercept' }),
      act({ team: 'us', action: 'Won it', player: 'GK', cause: 'Rebound' }),
      act({ team: 'us', action: 'Won it', player: 'WD' }),
      act({ team: 'them', action: 'Won it', cause: 'Deflection, gain' }),
    ]);
    expect(np.byPosition).toEqual({ GD: 10, GK: 3, WD: 8 });
    expect(np.team).toEqual({ us: 21 - 8, them: -10 - 8 - 8 + 8 });
  });

  it('scores turnovers, touches and penalties', () => {
    const np = netPoints([
      act({ team: 'us', action: 'Lost it', player: 'C', cause: 'Bad pass' }),
      act({ team: 'us', action: 'Touch', player: 'WD' }),
      act({ team: 'us', action: 'Penalty', player: '?' }),
    ]);
    expect(np.byPosition).toEqual({ C: -8, WD: 4, '?': -0.5 });
  });

  it('credits players by name from the latest lineup and splits by quarter', () => {
    const np = netPoints([
      {
        ...envelope(),
        type: 'lineup_change',
        payload: { period: 1, clockMs: 0, team: 'us', lineup: { GS: 'Mia', GA: 'Jade' }, bench: [], detail: '' },
      },
      act({ team: 'us', action: 'Goal', player: 'GS' }),
      {
        ...envelope(),
        type: 'lineup_change',
        payload: { period: 2, clockMs: 0, team: 'us', lineup: { GS: 'Jade', GA: 'Mia' }, bench: [], detail: '' },
      },
      act({ team: 'us', action: 'Goal', player: 'GS' }, 2),
    ]);
    expect(np.byPlayer).toEqual({ Mia: 2, Jade: 2 });
    expect(np.byQuarter).toEqual({ 1: { us: 2, them: 0 }, 2: { us: 2, them: 0 } });
  });

  it('applies corrections and club overrides', () => {
    const goal = act({ team: 'us', action: 'Goal', player: 'GA' });
    const np = netPoints(
      [goal, { ...envelope(), type: 'correction', payload: { target: goal.id, op: 'edit', patch: { player: 'GS' } } }],
      { goal: 3 },
    );
    expect(np.byPosition).toEqual({ GS: 3 });
  });
});
