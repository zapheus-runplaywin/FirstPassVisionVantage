import type { ActionPayload, GameConfig, GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { deriveGame } from './game';
import { reboundKind, reboundLabel, reboundTeam } from './rebound';

/*
 * Rebounds are recorded as OREB ('ours': the shooting team gets its own miss
 * back) or DREB ('theirs': the other team collects it), from the shooting
 * team's side, for both teams' shots (Matt, 2026-11-13).
 */

const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: 600_000, q1AttackEnd: 'right', firstCentrePass: 'them' };
let seq = 0;
const ev = (type: GameEvent['type'], payload: object): GameEvent =>
  ({ id: `r${++seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: '2026-11-13T09:00:00Z' }) as GameEvent;
const act = (a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>) => ev('action', { period: 1, clockMs: 500_000, player: null, ...a });
const start = () => ev('period_start', { period: 1, clockMs: 600_000, attackEnd: 'right', centrePass: 'them', mode: 'core' });

describe('rebounds', () => {
  it('OREB on our miss keeps the ball with us', () => {
    const s = deriveGame(config, [start(), act({ team: 'us', action: 'Receive' }), act({ team: 'us', action: 'Miss', player: 'GS', rebound: 'ours' })]);
    expect(s.possession).toBe('us');
    expect(s.chain).toEqual({ team: 'us', from: 'centre pass' });
  });

  it('DREB on our miss gives the ball to them', () => {
    const s = deriveGame(config, [start(), act({ team: 'us', action: 'Miss', player: 'GS', rebound: 'theirs' })]);
    expect(s.possession).toBe('them');
    expect(s.chain).toEqual({ team: 'them', from: 'rebound' });
  });

  it('OREB on their miss keeps the ball with them', () => {
    const s = deriveGame(config, [start(), act({ team: 'them', action: 'Receive' }), act({ team: 'them', action: 'Miss', rebound: 'ours' })]);
    expect(s.possession).toBe('them');
    expect(s.chain).toEqual({ team: 'them', from: 'centre pass' });
  });

  it('DREB on their miss gives the ball to us', () => {
    const s = deriveGame(config, [start(), act({ team: 'them', action: 'Miss', rebound: 'theirs' })]);
    expect(s.possession).toBe('us');
    expect(s.chain).toEqual({ team: 'us', from: 'rebound' });
  });

  it('a miss that goes out gives the other team a throw in', () => {
    const s = deriveGame(config, [start(), act({ team: 'them', action: 'Miss', rebound: 'out' })]);
    expect(s.chain).toEqual({ team: 'us', from: 'throw in' });
  });
});

describe('rebound labels', () => {
  const names = { us: 'Thunder', them: 'Storm' };

  it('names the team that gets the ball after our miss', () => {
    expect(reboundLabel('ours', 'us', names)).toBe('OREB · Thunder');
    expect(reboundLabel('theirs', 'us', names)).toBe('DREB · Storm');
    expect(reboundTeam('ours', 'us')).toBe('us');
    expect(reboundTeam('theirs', 'us')).toBe('them');
  });

  it('names the team that gets the ball after their miss', () => {
    expect(reboundLabel('ours', 'them', names)).toBe('OREB · Storm');
    expect(reboundLabel('theirs', 'them', names)).toBe('DREB · Thunder');
    expect(reboundTeam('ours', 'them')).toBe('them');
    expect(reboundTeam('theirs', 'them')).toBe('us');
  });

  it('gives the button text whichever team shot', () => {
    expect(reboundKind('ours')).toBe('OREB');
    expect(reboundKind('theirs')).toBe('DREB');
    expect(reboundKind('out')).toBe('Out');
  });

  it('says Out for a miss that goes out of court', () => {
    expect(reboundLabel('out', 'us', names)).toBe('Out');
    expect(reboundTeam('out', 'them')).toBeNull();
  });
});
