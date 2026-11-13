import { describe, expect, it } from 'vitest';
import { stream } from '../../live/__tests__/fixtures';
import { courtView, group, sectorOf } from '../court';
import { buildModel } from '../possessions';
import { rally } from './rally';

const names = { us: 'Thunder', them: 'Storm' };

describe('group', () => {
  it('puts nearby points in one circle with a count, and keeps far ones apart', () => {
    const dots = group([{ x: 0.81, y: 0.41 }, { x: 0.83, y: 0.43 }, { x: 0.2, y: 0.9 }], 'unforced');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toMatchObject({ n: 2, kind: 'unforced' });
    expect(dots[0]!.at.x).toBeCloseTo(0.82);
  });
});

describe('sectorOf', () => {
  it('names close and long, left, centre and right as the engine does, for either end', () => {
    expect(sectorOf({ x: 0.97, y: 0.5 }, 'us')).toBe('Cn');
    expect(sectorOf({ x: 0.87, y: 0.5 }, 'us')).toBe('Cl');
    // y above the middle is the engine's left for a shot at our attacking end.
    expect(sectorOf({ x: 0.95, y: 0.75 }, 'us')).toBe('Ll');
    expect(sectorOf({ x: 0.95, y: 0.25 }, 'us')).toBe('Rl');
    // The same spot mirrored at the other end is the same sector for them.
    expect(sectorOf({ x: 0.05, y: 0.25 }, 'them')).toBe('Ll');
  });
});

describe('courtView', () => {
  const ev = rally('xxgg', 'xggg');

  it('shows where a team lost it, forced and unforced, with a line under it', () => {
    const v = courtView(buildModel(ev), { mode: 'lose', period: 'all', team: 'us', names });
    expect(v.legend).toEqual([
      { kind: 'unforced', label: 'unforced', count: 2 },
      { kind: 'forced', label: 'they won it', count: 0 },
    ]);
    expect(v.dots).toEqual([{ at: { x: 0.75, y: 0.5 }, kind: 'unforced', n: 2 }]);
    expect(v.line).toBe('2 of 4 possessions lost');
  });

  it('shows where we won it from their possessions', () => {
    const s = stream();
    const ev2 = [
      s.start(1),
      s.act(1, 590_000, { team: 'them', action: 'Receive', player: 'C' }),
      s.act(1, 585_000, { team: 'us', action: 'Won it', player: 'GD', at: { x: 0.2, y: 0.3 } }),
      s.act(1, 580_000, { team: 'us', action: 'Goal', player: 'GS' }),
      s.act(1, 575_000, { team: 'them', action: 'Receive', player: 'C' }),
      s.act(1, 570_000, { team: 'us', action: 'Won it', player: 'WD' }),
    ];
    const v = courtView(buildModel(ev2), { mode: 'win', period: 'all', team: 'us', names });
    expect(v.dots).toEqual([{ at: { x: 0.2, y: 0.3 }, kind: 'win', n: 1 }]);
    expect(v.unplaced).toBe(1);
    expect(v.line).toBe('2 gains in 2 Storm possessions');
    expect(courtView(buildModel(ev2), { mode: 'lose', period: 'all', team: 'them', names }).legend[1]).toEqual({ kind: 'forced', label: 'we won it', count: 2 });
  });

  it('shows shots with a percentage per sector, and filters by quarter', () => {
    const s = stream();
    const shots = [
      s.start(1),
      s.act(1, 590_000, { team: 'us', action: 'Receive', player: 'C' }),
      s.act(1, 585_000, { team: 'us', action: 'Miss', player: 'GS', rebound: 'ours', at: { x: 0.97, y: 0.5 } }),
      s.act(1, 580_000, { team: 'us', action: 'Goal', player: 'GS', at: { x: 0.97, y: 0.52 } }),
      s.end(1),
      s.start(2),
      s.act(2, 590_000, { team: 'us', action: 'Receive', player: 'C' }),
      s.act(2, 585_000, { team: 'us', action: 'Goal', player: 'GA', at: { x: 0.87, y: 0.5 } }),
    ];
    const all = courtView(buildModel(shots), { mode: 'shots', period: 'all', team: 'us', names });
    expect(all.line).toBe('2 of 3 (67%)');
    expect(all.sectors.map((x) => [x.key, x.goals, x.of])).toEqual([
      ['Cn', 1, 2],
      ['Cl', 1, 1],
    ]);
    expect(all.dots.map((d) => d.kind)).toEqual(['miss', 'goal', 'goal']);
    const q1 = courtView(buildModel(shots), { mode: 'shots', period: 1, team: 'us', names });
    expect(q1.line).toBe('1 of 2 (50%)');
    expect(courtView(buildModel(shots), { mode: 'shots', period: 1, team: 'them', names }).line).toBe('No shots yet');
  });
});
