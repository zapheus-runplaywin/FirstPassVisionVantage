import type { ActionPayload, GameConfig, GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { timingRows, timingTable } from './timing';

const Q = 15 * 60_000;
const T0 = Date.parse('2026-10-25T09:00:00Z');
const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };

let seq = 0;
function ev(type: GameEvent['type'], payload: object, atMs: number): GameEvent {
  seq++;
  return { id: `t${seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: new Date(T0 + atMs).toISOString() } as GameEvent;
}
function act(a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>, atMs: number, clockMs = Q - atMs + 5_000): GameEvent {
  return ev('action', { period: 1, clockMs, player: null, ...a }, atMs);
}

function game(): GameEvent[] {
  seq = 0;
  return [
    ev('period_start', { period: 1, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' }, 0),
    ev('lineup_change', { period: 1, clockMs: Q, team: 'us', lineup: { GS: 'Ava Lee', GA: 'Mia Tran', C: 'Zoe Hart' }, bench: [], detail: 'Starting seven' }, 1_000),
    ev('clock_start', { period: 1, clockMs: Q }, 5_000),
    act({ team: 'us', action: 'Receive', player: 'C' }, 6_250),
    act({ team: 'us', action: 'Goal', player: 'GS', at: { x: 0.95, y: 0.5 } }, 12_000),
    act({ team: 'them', action: 'Receive' }, 20_000),
    act({ team: 'us', action: 'Won it', player: 'GA', cause: 'Intercept', at: { x: 0.5, y: 0.2 } }, 31_500),
    act({ team: 'us', action: 'Miss', player: 'GA', rebound: 'theirs' }, 40_000),
    act({ team: 'them', action: 'Goal' }, 52_000),
  ];
}

describe('timingRows', () => {
  it('times every event from the opening whistle', () => {
    const rows = timingRows(config, game());
    expect(rows.map((r) => r.sinceStartS)).toEqual([-5, -4, 0, 1.25, 7, 15, 26.5, 35, 47]);
    expect(rows[3]).toMatchObject({ quarter: 1, gameClock: '14:59', recordedAt: '2026-10-25T09:00:06.250Z' });
  });

  it('names the player on court and the event in plain words', () => {
    const rows = timingRows(config, game());
    expect(rows[3]).toMatchObject({ team: 'Thunder', position: 'C', player: 'Zoe Hart', event: 'Centre pass received' });
    expect(rows[6]).toMatchObject({ position: 'GA', player: 'Mia Tran', event: 'Won it', cause: 'Intercept', third: 'centre' });
    expect(rows[7]).toMatchObject({ event: 'Miss', rebound: 'theirs' });
    expect(rows[1]).toMatchObject({ event: 'Sub', team: 'Thunder', note: 'Starting seven' });
    expect(rows[5]).toMatchObject({ team: 'Storm', position: '', player: '' });
  });

  it('marks goals that came from a centre pass', () => {
    const rows = timingRows(config, game());
    expect(rows[4]).toMatchObject({ event: 'Goal', third: 'attacking', centrePassGoal: 'yes' });
    // Their centre pass was turned over by our intercept, so their goal is not a conversion.
    expect(rows[8]).toMatchObject({ event: 'Goal', team: 'Storm', centrePassGoal: 'no' });
    expect(rows[6]!.centrePassGoal).toBe('');
  });

  it('applies corrections: deleted events go, edited ones keep their original time', () => {
    const events = game();
    const intercept = events[6]!;
    const miss = events[7]!;
    events.push(ev('correction', { target: miss.id, op: 'delete' }, 60_000));
    events.push(ev('correction', { target: intercept.id, op: 'edit', patch: { player: 'GS' } }, 61_000));
    const rows = timingRows(config, events);
    expect(rows.map((r) => r.seq)).not.toContain(miss.seq);
    expect(rows.find((r) => r.seq === intercept.seq)).toMatchObject({ player: 'Ava Lee', edited: 'yes', sinceStartS: 26.5 });
    expect(rows.some((r) => r.event === 'correction')).toBe(false);
  });

  it('times from the first event when the clock was never started', () => {
    seq = 0;
    const rows = timingRows(config, [act({ team: 'us', action: 'Touch', player: 'C' }, 3_000), act({ team: 'us', action: 'Feed', player: 'C' }, 4_500)]);
    expect(rows.map((r) => r.sinceStartS)).toEqual([0, 1.5]);
  });

  it('returns nothing for an empty log', () => {
    expect(timingRows(config, [])).toEqual([]);
  });
});

describe('timingTable', () => {
  it('writes a header and one line per row', () => {
    const lines = timingTable(timingRows(config, game())).trimEnd().split('\n');
    expect(lines[0]).toBe('seq,recorded_at,since_start_s,quarter,game_clock,team,position,player,event,cause,rebound,third,centre_pass_goal,edited,note');
    expect(lines).toHaveLength(10);
    expect(lines[4]).toBe('4,2026-10-25T09:00:06.250Z,1.25,1,14:59,Thunder,C,Zoe Hart,Centre pass received,,,,,,');
  });

  it('quotes commas and quotes in CSV, and flattens tabs and newlines in TSV', () => {
    seq = 0;
    const rows = timingRows(config, [ev('lineup_change', { period: 2, clockMs: 0, team: 'us', lineup: {}, bench: [], detail: 'Mia "M" on, Jade\toff\nlate' }, 0)]);
    expect(timingTable(rows)).toMatch(/,"Mia ""M"" on, Jade\toff\nlate"\n$/);
    const tsv = timingTable(rows, '\t').trimEnd().split('\n');
    expect(tsv).toHaveLength(2);
    expect(tsv[1]!.split('\t')).toHaveLength(15);
    expect(tsv[1]!.endsWith('Mia "M" on, Jade off late')).toBe(true);
  });
});
