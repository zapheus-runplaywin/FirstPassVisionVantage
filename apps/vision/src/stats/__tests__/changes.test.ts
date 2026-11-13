import { describe, expect, it } from 'vitest';
import { beforeAfter, verdict, verdicts } from '../changes';
import { buildModel } from '../possessions';
import { rally, THEM, US } from './rally';

const g = (n: number) => 'g'.repeat(n);
const ourGA = { before: 16, team: 'us' as const, lineup: { ...US, GA: 'Mia' } };

describe('lineup changes', () => {
  it('records who came on and off, and not the starting lineups', () => {
    const m = buildModel(rally('xxxxxxgg' + 'ggg', g(11), { changes: [ourGA] }));
    expect(m.changes).toEqual([{ team: 'us', period: 1, clockMs: expect.any(Number), position: 'GA', on: 'Mia', off: 'Jade', index: 16 }]);
    expect(m.lineup.GA).toBe('Mia');
    expect(m.theirLineup.GD).toBe('Chloe');
  });
});

describe('verdict', () => {
  it('waits for 8 possessions after the change', () => {
    const m = buildModel(rally('xxxxxxgg' + 'ggg', g(11), { changes: [ourGA] }));
    expect(verdict(m, m.changes[0]!)).toMatchObject({ state: 'early', text: 'too early, 3 of 8', measure: 'our scoring' });
  });

  it('waits for 8 possessions before the change too', () => {
    const m = buildModel(rally('xgg' + g(8), g(11), { changes: [{ ...ourGA, before: 6 }] }));
    expect(verdict(m, m.changes[0]!)).toMatchObject({ state: 'early', before: { goals: 2, of: 3 } });
  });

  it('says our attacking change helped when our scoring rose 20 points', () => {
    const m = buildModel(rally('xxxxxxgg' + 'gggggggx', g(16), { changes: [ourGA] }));
    const v = verdict(m, m.changes[0]!);
    expect(v).toMatchObject({ state: 'helped', text: 'helped us', measured: 'us', before: { goals: 2, of: 8 }, after: { goals: 7, of: 8 } });
    expect(beforeAfter(v)).toBe('our scoring 2 of 8 (25%) before, 7 of 8 (88%) after');
  });

  it('measures a defender change by the other team, so their scoring falling is good for us', () => {
    const ourGK = { before: 16, team: 'us' as const, lineup: { ...US, GK: 'Zoe' } };
    const m = buildModel(rally(g(16), g(8) + 'xxxxxxgg', { changes: [ourGK] }));
    expect(verdict(m, m.changes[0]!)).toMatchObject({ state: 'helped', measured: 'them', measure: 'their scoring' });
  });

  it('says their defender change hurt us when our scoring fell', () => {
    const theirGD = { before: 16, team: 'them' as const, lineup: { ...THEM, GD: 'Sophie' } };
    const m = buildModel(rally(g(8) + 'xxxxxxgg', g(16), { changes: [theirGD] }));
    expect(verdict(m, m.changes[0]!)).toMatchObject({ state: 'hurt', text: 'hurt us', measured: 'us' });
  });

  it('calls a small move no clear effect', () => {
    const m = buildModel(rally('ggggxxxx' + 'gggggxxx', g(16), { changes: [ourGA] }));
    expect(verdict(m, m.changes[0]!)).toMatchObject({ state: 'none', text: 'no clear effect' });
  });

  it("stops the after window at that team's next change, and lists changes newest first", () => {
    const next = { before: 26, team: 'us' as const, lineup: { ...US, GA: 'Mia', WA: 'Ava' } };
    const m = buildModel(rally('xxxxxxgg' + g(16), g(24), { changes: [ourGA, next] }));
    const [second, first] = verdicts(m);
    expect(first).toMatchObject({ change: { position: 'GA' }, state: 'early', after: { of: 5 } });
    expect(second).toMatchObject({ change: { position: 'WA', on: 'Ava', off: 'Kim' }, before: { goals: 7, of: 8 } });
  });
});
