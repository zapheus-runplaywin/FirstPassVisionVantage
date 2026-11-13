import type { GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { stream } from '../../live/__tests__/fixtures';
import { candidates, CHANGE_TTL_MS, GAP, MAX_LIVE, rank, runAlerts, visibleLive } from '../alerts';
import { buildModel } from '../possessions';
import { rally, US } from './rally';

const lineup = { GS: 'Priya', GA: 'Jade', WA: 'Kim', C: 'Tess', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };

/**
 * Our centre passes, 20 s of game time apart: 'g' goal by GS, 'a' goal by GA,
 * 'm' GS miss to them, 'n' GA miss to them, 'l' WA gives it away in the
 * attacking third, 'c' in the centre third. Their reply is always a goal, so
 * every possession of ours starts from a centre pass.
 */
function game(quarters: string[], opts: { lineupAt?: { period: number; clockMs: number; lineup: object } } = {}) {
  const s = stream();
  const ev: GameEvent[] = [];
  quarters.forEach((pattern, qi) => {
    const period = qi + 1;
    ev.push(s.start(period));
    if (period === 1) ev.push(s.ev('lineup_change', { period: 1, clockMs: 600_000, team: 'us', lineup, bench: [], detail: '' }));
    let clock = 600_000;
    for (const c of pattern) {
      clock -= 20_000;
      const lu = opts.lineupAt;
      if (lu && lu.period === period && lu.clockMs >= clock && lu.clockMs < clock + 20_000) {
        ev.push(s.ev('lineup_change', { period, clockMs: lu.clockMs, team: 'us', lineup: lu.lineup, bench: [], detail: '' }));
      }
      ev.push(s.act(period, clock, { team: 'us', action: 'Receive', player: 'C' }));
      if (c === 'g' || c === 'a') ev.push(s.act(period, clock - 5_000, { team: 'us', action: 'Goal', player: c === 'g' ? 'GS' : 'GA' }));
      else {
        if (c === 'm' || c === 'n') ev.push(s.act(period, clock - 5_000, { team: 'us', action: 'Miss', player: c === 'm' ? 'GS' : 'GA', rebound: 'theirs' }));
        if (c === 'l') ev.push(s.act(period, clock - 5_000, { team: 'us', action: 'Lost it', player: 'WA', at: { x: 0.8, y: 0.4 } }));
        if (c === 'c') ev.push(s.act(period, clock - 5_000, { team: 'us', action: 'Lost it', player: 'C', at: { x: 0.5, y: 0.4 } }));
        ev.push(s.act(period, clock - 10_000, { team: 'them', action: 'Goal' }));
        continue;
      }
      ev.push(s.act(period, clock - 10_000, { team: 'them', action: 'Receive' }), s.act(period, clock - 15_000, { team: 'them', action: 'Goal' }));
    }
    ev.push(s.end(period, 0));
  });
  return ev;
}

describe('candidates', () => {
  it('raises nothing until there are 8 centre passes behind a figure', () => {
    expect(candidates(buildModel(game(['ggggggm'])))).toEqual([]);
  });

  it('says CP to goal has dropped when the last 8 are well below the game', () => {
    const c = candidates(buildModel(game(['gggggggggggg' + 'mmmmmggg'])));
    expect(c.find((x) => x.subject === 'cp')).toMatchObject({ kind: 'trend', headline: 'CP to goal has dropped', count: '3 of 8 (38%), was 75%', anchor: 'this quarter' });
  });

  it('names a cold shooter, an act card', () => {
    const c = candidates(buildModel(game(['gggggggg', 'mmmmmg'])));
    expect(c.find((x) => x.subject === 'shooter:Priya')).toMatchObject({ kind: 'act', headline: 'Priya (GS) is cold', count: '1 of 6 (17%) this quarter, 64% for the game' });
  });

  it('flags giving it away in the attacking third, not the centre third', () => {
    expect(candidates(buildModel(game(['ggggglll']))).map((c) => c.subject)).toContain('attacking-third');
    expect(candidates(buildModel(game(['gggggccc']))).map((c) => c.subject)).not.toContain('attacking-third');
  });

  it('anchors a window that starts at one of our changes to the change', () => {
    const ev = game(['ggggggggggggggggnnnnnnnn'], { lineupAt: { period: 1, clockMs: 280_000, lineup: { ...lineup, GA: 'Ava' } } });
    const c = candidates(buildModel(ev)).find((x) => x.subject === 'cp');
    expect(c?.anchor).toBe('since our GA change, Q1 04:40');
  });
});

describe('rank', () => {
  it('puts act cards first, then the biggest gap', () => {
    const r = rank([
      { subject: 'a', kind: 'trend', gap: 0.5, headline: '', count: '', anchor: '' },
      { subject: 'b', kind: 'act', gap: 0.2, headline: '', count: '', anchor: '' },
      { subject: 'c', kind: 'act', gap: 0.4, headline: '', count: '', anchor: '' },
    ]);
    expect(r.map((x) => x.subject)).toEqual(['c', 'b', 'a']);
  });
});

describe('runAlerts', () => {
  it('raises a card once the gap passes 20 points, with when it was raised', () => {
    const { live, log } = runAlerts(game(['gggggggggggg' + 'mmmmmggg']));
    const cp = log.find((c) => c.subject === 'cp');
    expect(cp).toBeDefined();
    expect(cp!.gap).toBeGreaterThanOrEqual(GAP);
    expect(cp!.createdWhen).toMatch(/^Q1 \d\d:\d\d$/);
    expect(live.map((c) => c.subject)).toContain('cp');
  });

  it('keeps one live card per subject and updates its numbers', () => {
    const { log } = runAlerts(game(['gggggggggggg' + 'mmmmmmm']));
    expect(log.filter((c) => c.subject === 'cp')).toHaveLength(1);
  });

  it('waits 90 s of game time between new cards', () => {
    const { log } = runAlerts(game(['ggggggggggggggg' + 'llllllll']));
    const times = log.map((c) => c.createdAt).sort((a, b) => a - b);
    expect(times.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(90_000);
  });

  it('never shows more than three live cards', () => {
    const { live, log } = runAlerts(game(['gggggggggggggggg', 'lllllllllnnnnnnnnmmmmmmm']));
    expect(log.length).toBeGreaterThan(MAX_LIVE);
    expect(live.length).toBeLessThanOrEqual(MAX_LIVE);
  });

  it('retires a card when its rule stops holding', () => {
    const { live, log } = runAlerts(game(['gggggggggggg' + 'mmmmm' + 'gggggggggggggggg']));
    const cp = log.find((c) => c.subject === 'cp')!;
    expect(cp.retiredWhen).toMatch(/^Q1 /);
    expect(live.some((c) => c.subject === 'cp')).toBe(false);
  });

  it('hides a dismissed subject\'s live card for the rest of that quarter only, keeping the history', () => {
    const { live, log } = runAlerts(game(['gggggggggggg' + 'mmmmmggg']));
    expect(visibleLive(live, new Map([['cp', 1]]), 1).some((c) => c.subject === 'cp')).toBe(false);
    expect(visibleLive(live, new Map([['cp', 1]]), 2).some((c) => c.subject === 'cp')).toBe(true);
    expect(visibleLive(live, new Map(), 1).some((c) => c.subject === 'cp')).toBe(true);
    expect(log.some((c) => c.subject === 'cp')).toBe(true);
  });

  it('gives the same card the same id on every replay, so stars and dismissals stick', () => {
    const ev = game(['gggggggggggg' + 'mmmmmggg']);
    expect(runAlerts(ev).log.map((c) => c.id)).toEqual(runAlerts(ev).log.map((c) => c.id));
  });

  it('is empty for an empty game', () => {
    expect(runAlerts([])).toEqual({ live: [], log: [] });
  });
});

describe('change verdict cards', () => {
  const ourGA = { before: 16, team: 'us' as const, lineup: { ...US, GA: 'Mia' } };

  it('raises an act card when a change has helped, with the before and after', () => {
    const c = candidates(buildModel(rally('xxxxxxgg' + 'gggggggx', 'g'.repeat(16), { changes: [ourGA] })));
    expect(c.find((x) => x.subject.startsWith('change:'))).toMatchObject({
      subject: 'change:us:GA:16',
      kind: 'act',
      headline: 'Our GA change is helping us',
      count: 'our scoring 2 of 8 (25%) before, 7 of 8 (88%) after',
      anchor: 'Mia on for Jade, Q1 07:13',
      ttlMs: CHANGE_TTL_MS,
    });
  });

  it('retires it after five minutes of game time and does not raise it again', () => {
    // 5 s between possessions, so the verdict holds for well over five minutes.
    const ev = rally('xxxxxxgg' + 'g'.repeat(40), 'g'.repeat(48), { changes: [ourGA], stepMs: 5_000 });
    const { live, log } = runAlerts(ev);
    const cards = log.filter((c) => c.subject === 'change:us:GA:16');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.retiredWhen).not.toBeNull();
    expect(live.some((c) => c.subject === 'change:us:GA:16')).toBe(false);
    expect(candidates(buildModel(ev)).some((c) => c.subject === 'change:us:GA:16')).toBe(true);
  });
});
