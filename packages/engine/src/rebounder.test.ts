import type { ActionPayload, GameConfig, GameEvent, Position } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { liveEvents } from './corrections';
import { deriveGame } from './game';
import { netPoints } from './netPoints';
import { rebounderChoices, weRebounded } from './rebound';
import { timingRows } from './timing';

/*
 * The second tap after a miss names which of our players took the rebound,
 * when we got the ball: OREB + GS|GA, DREB + GD|GK (Matt, 2026-11-13).
 */

const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: 600_000, q1AttackEnd: 'right', firstCentrePass: 'us' };
const LINEUP: Partial<Record<Position, string>> = { GS: 'Ava', GA: 'Mia', WA: 'Kim', C: 'Zoe', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };
let seq = 0;
const ev = (type: GameEvent['type'], payload: object): GameEvent =>
  ({ id: `b${++seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: '2026-11-13T09:00:00.000Z' }) as GameEvent;
const act = (a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>) => ev('action', { period: 1, clockMs: 500_000, player: null, ...a });
const opening = () => {
  seq = 0;
  return [
    ev('period_start', { period: 1, clockMs: 600_000, attackEnd: 'right', centrePass: 'us', mode: 'core' }),
    ev('lineup_change', { period: 1, clockMs: 600_000, team: 'us', lineup: LINEUP, bench: ['Jo'], detail: 'Starting lineup' }),
  ];
};

describe('rebounderChoices', () => {
  it('offers our shooters after our OREB and our keepers after our DREB', () => {
    expect(rebounderChoices('ours', 'us')).toEqual(['GS', 'GA']);
    expect(rebounderChoices('theirs', 'them')).toEqual(['GD', 'GK']);
  });

  it('offers nothing when they got the ball, it went out, or the rebound is not set', () => {
    expect(rebounderChoices('theirs', 'us')).toEqual([]);
    expect(rebounderChoices('ours', 'them')).toEqual([]);
    expect(rebounderChoices('out', 'us')).toEqual([]);
    expect(rebounderChoices(null, 'us')).toEqual([]);
    expect(weRebounded('ours', 'us')).toBe(true);
    expect(weRebounded('theirs', 'them')).toBe(true);
    expect(weRebounded('out', 'them')).toBe(false);
    expect(weRebounded(undefined, 'us')).toBe(false);
  });
});

describe('rebounds in the game state', () => {
  it('counts both teams’ rebounds and ours by player, named by the lineup at the time', () => {
    const log = [
      ...opening(),
      act({ team: 'us', action: 'Miss', player: 'GS', rebound: 'ours', rebounder: 'GA' }),
      act({ team: 'them', action: 'Miss', rebound: 'theirs', rebounder: 'GK' }),
      act({ team: 'them', action: 'Miss', rebound: 'ours' }),
      act({ team: 'us', action: 'Miss', player: 'GA', rebound: 'theirs' }),
      ev('lineup_change', { period: 1, clockMs: 400_000, team: 'us', lineup: { ...LINEUP, GK: 'Jo' }, bench: ['Ruby'], detail: 'x' }),
      act({ team: 'them', action: 'Miss', rebound: 'theirs', rebounder: 'GK' }),
      act({ team: 'them', action: 'Miss', rebound: 'theirs', rebounder: '?' }),
      act({ team: 'us', action: 'Miss', player: 'GS', rebound: 'out' }),
    ];
    const s = deriveGame(config, log);
    expect(s.rebounds).toEqual({ us: { offensive: 1, defensive: 3 }, them: { offensive: 1, defensive: 1 } });
    expect(s.reboundsByPlayer).toEqual({
      Mia: { offensive: 1, defensive: 0 },
      Ruby: { offensive: 0, defensive: 1 },
      Jo: { offensive: 0, defensive: 1 },
    });
  });

  it('old games without a rebounder still count team rebounds', () => {
    const s = deriveGame(config, [...opening(), act({ team: 'them', action: 'Miss', rebound: 'theirs' })]);
    expect(s.rebounds.us.defensive).toBe(1);
    expect(s.reboundsByPlayer).toEqual({});
  });
});

describe('editing a rebound', () => {
  it('can add or change the rebounder', () => {
    const log = [...opening(), act({ team: 'them', action: 'Miss', rebound: 'theirs' })];
    const miss = log[2]!;
    log.push(ev('correction', { target: miss.id, op: 'edit', patch: { rebounder: 'GD' } }));
    expect(deriveGame(config, log).reboundsByPlayer).toEqual({ Sam: { offensive: 0, defensive: 1 } });
  });

  it('drops the rebounder when an edit says the opposition got the ball after all', () => {
    const log = [...opening(), act({ team: 'them', action: 'Miss', rebound: 'theirs', rebounder: 'GK' })];
    log.push(ev('correction', { target: log[2]!.id, op: 'edit', patch: { rebound: 'ours' } }));
    const live = liveEvents(log).at(-1)!;
    expect(live.type === 'action' && live.payload.rebounder).toBe(null);
    expect(deriveGame(config, log).reboundsByPlayer).toEqual({});
  });

  it('drops the rebounder when the miss is edited into another action', () => {
    const log = [...opening(), act({ team: 'us', action: 'Miss', player: 'GS', rebound: 'ours', rebounder: 'GA' })];
    log.push(ev('correction', { target: log[2]!.id, op: 'edit', patch: { action: 'Goal' } }));
    const live = liveEvents(log).at(-1)!;
    expect(live.type === 'action' && live.payload.rebounder).toBe(null);
  });
});

describe('Net Points for rebounds', () => {
  it('credits our defensive rebound to the player who took it', () => {
    const np = netPoints([...opening(), act({ team: 'them', action: 'Miss', rebound: 'theirs', rebounder: 'GK' })]);
    expect(np.byPlayer.Ruby).toBe(6);
    expect(np.byPosition.GK).toBe(6);
    expect(np.team.us).toBe(6);
  });

  it('keeps an unnamed defensive rebound at team level', () => {
    const np = netPoints([...opening(), act({ team: 'them', action: 'Miss', rebound: 'theirs' })]);
    expect(np.team.us).toBe(6);
    expect(np.byPlayer).toEqual({});
  });

  it('scores an offensive rebound 0 by default, and the club value when set', () => {
    const log = [...opening(), act({ team: 'us', action: 'Miss', player: 'GS', rebound: 'ours', rebounder: 'GA' })];
    expect(netPoints(log).byPlayer.Mia).toBeUndefined();
    expect(netPoints(log, { offensiveRebound: 3 }).byPlayer.Mia).toBe(3);
  });
});

describe('timing table', () => {
  it('names the rebounder with their position', () => {
    const log = [
      ...opening(),
      act({ team: 'them', action: 'Miss', rebound: 'theirs', rebounder: 'GD' }),
      act({ team: 'them', action: 'Miss', rebound: 'theirs', rebounder: '?' }),
      act({ team: 'them', action: 'Miss', rebound: 'theirs' }),
    ];
    expect(timingRows(config, log).slice(-3).map((r) => r.rebounder)).toEqual(['GD Sam', '?', '']);
  });
});
