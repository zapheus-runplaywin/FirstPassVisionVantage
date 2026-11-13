import type { GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { stream } from '../../live/__tests__/fixtures';
import { onCourt, lossesThisQuarter } from '../markers';
import { buildModel } from '../possessions';
import { tiles } from '../tiles';

const lineup = { GS: 'Priya', GA: 'Jade', WA: 'Kim', C: 'Tess', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };

/** Builds a log from a list of our centre-pass outcomes: 'g' goal, 'm' miss to them, 'l' given away, 'f' they won it. */
function game(pattern: string, period = 1) {
  const s = stream();
  const ev: GameEvent[] = [s.start(1), s.ev('lineup_change', { period: 1, clockMs: 600_000, team: 'us', lineup, bench: [], detail: '' })];
  for (let p = 2; p <= period; p++) ev.push(s.end(p - 1), s.start(p));
  let clock = 590_000;
  for (const c of pattern) {
    const t = (clock -= 1000);
    ev.push(s.act(period, t, { team: 'us', action: 'Receive', player: 'C' }));
    if (c === 'g') ev.push(s.act(period, t, { team: 'us', action: 'Goal', player: 'GS' }));
    if (c === 'm') ev.push(s.act(period, t, { team: 'us', action: 'Miss', player: 'GS', rebound: 'theirs' }));
    if (c === 'l') ev.push(s.act(period, t, { team: 'us', action: 'Lost it', player: 'WA', at: { x: 0.8, y: 0.2 } }));
    if (c === 'f') ev.push(s.act(period, t, { team: 'them', action: 'Won it', at: { x: 0.5, y: 0.5 } }));
    if (c !== 'g') ev.push(s.act(period, t, { team: 'them', action: 'Goal' }));
  }
  return { s, ev };
}

const tile = (pattern: string, key: string) => tiles(buildModel(game(pattern).ev)).find((t) => t.key === key)!;

describe('tiles', () => {
  it('shows CP to goal with its count, greyed until 8 centre passes', () => {
    const early = tile('ggl', 'cp');
    expect(early).toMatchObject({ figure: '67%', count: '2 of 3', early: true, need: '3 of 8 needed', trend: '', arrow: null });
    const ready = tile('gggggglm', 'cp');
    expect(ready).toMatchObject({ figure: '75%', count: '6 of 8', early: false, trend: 'last 8: 6 of 8' });
  });

  it('shows an arrow only when the last 8 are 20 points away from the game', () => {
    expect(tile('gggggggggggglllllll', 'cp').arrow).toBe('worse down');
    expect(tile('lllllllgggggggg', 'cp').arrow).toBe('better up');
    expect(tile('glglglglglglglgl', 'cp').arrow).toBeNull();
  });

  it('counts shooting by shots, needing five', () => {
    expect(tile('ggmm', 'shooting')).toMatchObject({ figure: '50%', count: '2 of 4', early: true, need: '4 of 5 shots' });
    expect(tile('gggmm', 'shooting')).toMatchObject({ figure: '60%', early: false });
  });

  it('counts gains to goal from possessions we won', () => {
    const s = stream();
    const ev: GameEvent[] = [s.start(1)];
    for (let i = 0; i < 4; i++) {
      ev.push(s.act(1, 500_000, { team: 'them', action: 'Receive' }), s.act(1, 500_000, { team: 'us', action: 'Won it', player: 'GD' }));
      ev.push(s.act(1, 500_000, { team: 'us', action: i < 3 ? 'Goal' : 'Miss', player: 'GS', rebound: 'theirs' }));
      if (i === 3) ev.push(s.act(1, 500_000, { team: 'them', action: 'Goal' }));
    }
    const t = tiles(buildModel(ev)).find((x) => x.key === 'gain')!;
    expect(t).toMatchObject({ figure: '75%', count: '3 of 4', early: true });
  });

  it('counts turnover to goal from possessions they gave away', () => {
    const s = stream();
    const ev: GameEvent[] = [s.start(1), s.act(1, 1, { team: 'them', action: 'Receive' }), s.act(1, 1, { team: 'them', action: 'Lost it' }), s.act(1, 1, { team: 'us', action: 'Goal' })];
    expect(tiles(buildModel(ev)).find((x) => x.key === 'turnover')).toMatchObject({ figure: '100%', count: '1 of 1' });
  });

  it('counts unforced turnovers this quarter and in the game, not forced ones', () => {
    const t = tile('glflgl', 'unforced');
    expect(t).toMatchObject({ figure: '3', count: 'this quarter · 3 in the game', early: true });
  });

  it('shows dashes, not NaN, before anything happens', () => {
    for (const t of tiles(buildModel([]))) {
      expect(t.figure).not.toContain('NaN');
      expect(t.early).toBe(true);
    }
  });
});

describe('onCourt', () => {
  it('marks a shooter hot when this quarter is 20 points above their game', () => {
    const { s, ev } = game('mmmmmm');
    ev.push(s.end(1), s.start(2));
    for (let i = 0; i < 5; i++) ev.push(s.act(2, 500_000, { team: 'us', action: 'Receive' }), s.act(2, 500_000, { team: 'us', action: 'Goal', player: 'GS' }));
    const gs = onCourt(buildModel(ev)).find((p) => p.position === 'GS')!;
    expect(gs).toMatchObject({ name: 'Priya', mark: 'hot', detail: '5 of 5 this quarter' });
  });

  it('marks a shooter cold when this quarter is 20 points below', () => {
    const { s, ev } = game('gggggg');
    ev.push(s.end(1), s.start(2));
    for (let i = 0; i < 5; i++) ev.push(s.act(2, 500_000, { team: 'us', action: 'Receive' }), s.act(2, 500_000, { team: 'us', action: 'Miss', player: 'GS', rebound: 'theirs' }), s.act(2, 500_000, { team: 'them', action: 'Goal' }));
    expect(onCourt(buildModel(ev)).find((p) => p.position === 'GS')!.mark).toBe('cold');
  });

  it('needs five shots this quarter before marking a shooter', () => {
    expect(onCourt(buildModel(game('gggg').ev)).find((p) => p.position === 'GS')).toMatchObject({ mark: null, detail: '4 of 4 this quarter' });
  });

  it('marks others by gains minus unforced losses this quarter', () => {
    const { ev } = game('llg');
    const wa = onCourt(buildModel(ev)).find((p) => p.position === 'WA')!;
    expect(wa).toMatchObject({ name: 'Kim', mark: 'cold', detail: '0 gains · 2 lost' });

    const s = stream();
    const log: GameEvent[] = [s.start(1), s.ev('lineup_change', { period: 1, clockMs: 600_000, team: 'us', lineup, bench: [], detail: '' })];
    for (let i = 0; i < 2; i++) log.push(s.act(1, 1, { team: 'them', action: 'Receive' }), s.act(1, 1, { team: 'us', action: 'Won it', player: 'GD' }), s.act(1, 1, { team: 'us', action: 'Goal', player: 'GS' }));
    expect(onCourt(buildModel(log)).find((p) => p.position === 'GD')).toMatchObject({ mark: 'hot', detail: '2 gains · 0 lost' });
  });

  it('leaves a position empty when no lineup was logged', () => {
    expect(onCourt(buildModel([])).every((p) => p.name === null && p.mark === null)).toBe(true);
  });
});

describe('lossesThisQuarter', () => {
  it('lists our losses this quarter, forced and unforced, with where they happened', () => {
    const { s, ev } = game('lf', 1);
    expect(lossesThisQuarter(buildModel(ev))).toEqual([
      { forced: false, at: { x: 0.8, y: 0.2 } },
      { forced: true, at: { x: 0.5, y: 0.5 } },
    ]);
    ev.push(s.end(1), s.start(2));
    expect(lossesThisQuarter(buildModel(ev))).toEqual([]);
  });
});
