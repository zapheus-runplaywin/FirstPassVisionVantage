import { describe, expect, it } from 'vitest';
import type { Card } from '../alerts';
import { quarterLine, sayPoints } from '../breakview';
import { matchUps } from '../markers';
import { buildModel } from '../possessions';
import { rally, THEM, US } from './rally';

const card = (subject: string, kind: 'act' | 'trend', gap: number, period = 1): Card => ({
  subject,
  kind,
  gap,
  headline: subject,
  count: '',
  anchor: '',
  id: `${subject}@1`,
  period,
  createdAt: 1,
  createdWhen: 'Q1 05:00',
  retiredWhen: null,
});

describe('sayPoints', () => {
  const model = buildModel(rally('ggggxxxx', g(8)));

  it("puts the quarter's cards first, act cards before trends, and keeps to three", () => {
    const cards = [card('a', 'trend', 0.5), card('b', 'act', 0.2), card('c', 'trend', 0.3), card('d', 'act', 0.4), card('old', 'act', 0.9, 2)];
    expect(sayPoints(cards, model, 1).map((p) => p.headline)).toEqual(['d', 'b', 'a']);
  });

  it('makes one point per subject when a card came back in the same quarter', () => {
    const again = { ...card('cp', 'trend', 0.25), id: 'cp@2' };
    expect(sayPoints([card('cp', 'trend', 0.3), again, card('b', 'act', 0.2)], model, 1).map((p) => p.headline).slice(0, 2)).toEqual(['b', 'cp']);
  });

  it('tops up with the quarter figures furthest from the game, skipping ones a card covers', () => {
    const two = buildModel(rally('gggggggg', g(8), { period: 1 }).concat());
    const points = sayPoints([card('cp', 'trend', 0.3)], two, 1);
    expect(points[0]!.headline).toBe('cp');
    // CP to goal is covered by its card; shooting is the only other figure with 5 or more.
    expect(points.slice(1)).toEqual([{ headline: 'Shooting this quarter: 100%', count: '8 of 8, 100% for the game', anchor: 'level with the game' }]);
  });

  it('says so when there is nothing yet', () => {
    expect(sayPoints([], buildModel(rally('gg', 'gg')), 1)).toEqual([]);
  });
});

describe('quarterLine', () => {
  it("counts each team's goals and the possessions in the quarter", () => {
    expect(quarterLine(buildModel(rally('ggxx', 'gggx')), 1)).toEqual({ us: 2, them: 3, possessions: 8 });
  });
});

describe('matchUps', () => {
  it('pairs each of ours with the player they line up on, and when each came on', () => {
    const ev = rally('gggg', 'gggg', { changes: [{ before: 4, team: 'them', lineup: { ...THEM, GK: 'Zara' } }] });
    const rows = matchUps(buildModel(ev));
    expect(rows[0]).toMatchObject({ ours: { position: 'GS', name: US.GS, since: 'since the start' }, theirs: { position: 'GK', name: 'Zara', since: 'on since Q1 09:13' } });
    expect(rows.map((r) => r.theirs.position)).toEqual(['GK', 'GD', 'WD', 'C', 'WA', 'GA', 'GS']);
  });
});

function g(n: number) {
  return 'g'.repeat(n);
}
