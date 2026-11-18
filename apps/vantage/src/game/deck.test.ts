import { deriveGame, toAttackPoint, zoneOf, type GameState } from '@firstpass/engine';
import { ACTIONS, CAUSES_LOST, CAUSES_WON, POSITIONS, type GameConfig, type GameEvent, type Position } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { DECK_KEYS, deckKeys, deckPress, type DeckInput, type DeckKey } from './deck';
import { ACTION_GRID, emptyPending, type Pending } from './entry';

const Q = 10 * 60_000;
const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };
const START: Partial<Record<Position, string>> = { GS: 'Ava Lee', GA: 'Mia Chen', WA: 'Kim Tran', C: 'Zoe Hall', WD: 'Lily Ross', GD: 'Sam Wood', GK: 'Ruby Shaw' };

function ev(seq: number, type: GameEvent['type'], payload: object): GameEvent {
  return { id: `e${seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: new Date(Date.UTC(2026, 10, 18, 9, 0, seq)).toISOString() } as GameEvent;
}
const at = { period: 1, clockMs: Q };

function stateOf(mode: 'core' | 'full', more: GameEvent[] = []): GameState {
  return deriveGame(config, [
    ev(1, 'period_start', { ...at, attackEnd: 'right', centrePass: 'us', mode }),
    ev(2, 'lineup_change', { ...at, team: 'us', lineup: START, bench: ['Jo Park'], detail: 'Starting lineup' }),
    ev(3, 'clock_start', at),
    ...more,
  ]);
}

function input(over: Partial<DeckInput> = {}): DeckInput {
  return {
    pending: null,
    state: stateOf('full'),
    lineup: START,
    names: { us: 'Thunder', them: 'Storm' },
    period: 1,
    clockText: '06:12',
    running: true,
    timeUp: false,
    inBreak: false,
    endArmed: false,
    ...over,
  };
}
const pend = (over: Partial<Pending>): Pending => ({ ...emptyPending(), ...over });
const row = (keys: DeckKey[], n: number) => keys.slice((n - 1) * 8, n * 8);
const titles = (keys: DeckKey[]) => keys.map((k) => k.title);

describe('deckKeys', () => {
  it('is always 32 keys, whatever is being entered', () => {
    const stages: (Pending | null)[] = [
      null,
      pend({ team: 'us', player: 'GA', stage: 'what' }),
      pend({ team: 'us', player: 'GA', action: 'Lost it', stage: 'cause' }),
      pend({ team: 'us', player: 'GA', action: 'Won it', stage: 'cause' }),
      pend({ team: 'us', player: 'GA', action: 'Miss', stage: 'rebound' }),
      pend({ team: 'us', player: 'GA', action: 'Miss', rebound: 'ours', stage: 'rebounder' }),
    ];
    for (const pending of stages) expect(deckKeys(input({ pending }))).toHaveLength(DECK_KEYS);
    expect(deckKeys(input({ inBreak: true }))).toHaveLength(DECK_KEYS);
  });

  it('puts our seven positions and "who?" on row 1, named from the lineup', () => {
    const keys = row(deckKeys(input()), 1);
    expect(keys.map((k) => k.id)).toEqual([...POSITIONS.map((p) => `pick:us:${p}`), 'pick:us:?']);
    expect(keys[0]?.title).toBe('GS\nLee');
    expect(keys[7]?.title).toBe('?\nwho?');
  });

  it('keeps every action in its place on row 2, in the same order as the screen', () => {
    expect(titles(row(deckKeys(input()), 2))).toEqual([...ACTION_GRID]);
    expect(titles(row(deckKeys(input({ pending: pend({ team: 'them', stage: 'what' }) })), 2))).toEqual([...ACTION_GRID]);
    expect(new Set(ACTION_GRID)).toEqual(new Set(ACTIONS));
  });

  it('has no actions to press until someone is picked', () => {
    expect(row(deckKeys(input()), 2).every((k) => k.look === 'off' && k.id === '')).toBe(true);
    expect(row(deckKeys(input({ pending: pend({ team: 'us', player: 'C', stage: 'what' }) })), 2).every((k) => k.id !== '')).toBe(true);
  });

  it('turns the Full-only actions off in Core mode', () => {
    const keys = row(deckKeys(input({ state: stateOf('core'), pending: pend({ team: 'us', player: 'C', stage: 'what' }) })), 2);
    expect(keys.filter((k) => k.look === 'off').map((k) => k.title)).toEqual(['Feed', 'Touch', 'Penalty']);
  });

  it('lights what the rules expect: a centre pass receive first', () => {
    const keys = row(deckKeys(input({ pending: pend({ team: 'us', player: 'C', stage: 'what' }) })), 2);
    expect(keys.find((k) => k.title === 'Receive')?.look).toBe('lit');
    expect(keys.find((k) => k.title === 'Goal')?.look).toBe('dim');
  });

  it('marks the chosen player, and dims positions that cannot be where the court was tapped', () => {
    const point = toAttackPoint({ x: 0.95, y: 0.5 }, 'right');
    const keys = row(deckKeys(input({ pending: pend({ at: point, zone: zoneOf(point), screen: { x: 0.95, y: 0.5 }, team: 'us', player: 'GS', stage: 'what' }) })), 1);
    expect(keys.find((k) => k.id === 'pick:us:GS')?.look).toBe('selected');
    expect(keys.find((k) => k.id === 'pick:us:GK')?.look).toBe('dim');
    expect(keys.find((k) => k.id === 'pick:us:?')?.look).toBe('plain');
  });

  it('leaves row 3 dark until an action asks for a detail', () => {
    expect(row(deckKeys(input()), 3).every((k) => k.look === 'off')).toBe(true);
    expect(row(deckKeys(input({ pending: pend({ team: 'us', player: 'C', stage: 'what' }) })), 3).every((k) => k.look === 'off')).toBe(true);
  });

  it('relabels row 3 with how the ball was lost: all eight causes, no second page', () => {
    const keys = row(deckKeys(input({ pending: pend({ team: 'us', player: 'WA', action: 'Lost it', stage: 'cause' }) })), 3);
    expect(keys.map((k) => k.id)).toEqual(CAUSES_LOST.map((c) => `cause:${c}`));
    expect(keys[0]?.title).toBe('Bad\npass');
    expect(keys[7]?.title).toBe('Out of\ncourt');
  });

  it('relabels row 3 with how the ball was won', () => {
    const keys = row(deckKeys(input({ pending: pend({ team: 'us', player: 'GD', action: 'Won it', stage: 'cause' }) })), 3);
    expect(keys.map((k) => k.id)).toEqual([...CAUSES_WON.map((c) => `cause:${c}`), '', '', '']);
  });

  it('relabels row 3 with who got the rebound, from the shooting team\'s side', () => {
    const ours = row(deckKeys(input({ pending: pend({ team: 'us', player: 'GS', action: 'Miss', stage: 'rebound' }) })), 3);
    expect(titles(ours).slice(0, 3)).toEqual(['OREB\nThunder', 'DREB\nStorm', 'Out\nof court']);
    const theirs = row(deckKeys(input({ pending: pend({ team: 'them', action: 'Miss', stage: 'rebound' }) })), 3);
    expect(titles(theirs).slice(0, 3)).toEqual(['OREB\nStorm', 'DREB\nThunder', 'Out\nof court']);
  });

  it('asks who took our rebound on row 1, with the likely players lit', () => {
    const keys = deckKeys(input({ pending: pend({ team: 'us', player: 'GS', action: 'Miss', rebound: 'ours', stage: 'rebounder' }) }));
    const who = row(keys, 1);
    expect(who.map((k) => k.id)).toEqual([...POSITIONS.map((p) => `rebounder:${p}`), 'rebounder:?']);
    expect(who.filter((k) => k.look === 'lit').map((k) => k.id)).toEqual(['rebounder:GS', 'rebounder:GA']);
    expect(who[0]?.title).toBe('OREB GS\nLee');
    expect(row(keys, 3).every((k) => k.look === 'off')).toBe(true);
  });

  it('offers Skip only while a detail is being asked for', () => {
    const skip = (pending: Pending | null) => row(deckKeys(input({ pending })), 4)[1];
    expect(skip(null)).toMatchObject({ id: '', look: 'off' });
    expect(skip(pend({ team: 'us', player: 'C', stage: 'what' }))).toMatchObject({ id: '', look: 'off' });
    expect(skip(pend({ team: 'us', player: 'C', action: 'Lost it', stage: 'cause' }))).toMatchObject({ id: 'skip', look: 'plain' });
  });

  it('shows the score, the ball and the clock on row 4', () => {
    const goal = ev(4, 'action', { period: 1, clockMs: Q - 5000, team: 'us', player: 'GS', action: 'Goal' });
    const keys = row(deckKeys(input({ state: stateOf('full', [goal]) })), 4);
    expect(titles(keys)).toEqual(['Storm\n(team)', 'Skip\ndetail', 'Mark\nmoment', 'Undo\nlast', 'Thunder 1\nStorm 0', 'Ball\nCP Storm', 'Q1 06:12\nStop', 'End\nquarter']);
    expect(keys[4]?.id).toBe('');
    expect(keys[5]?.id).toBe('');
  });

  it('shows the clock stopped, and End quarter lit at time up', () => {
    const stopped = row(deckKeys(input({ running: false })), 4);
    expect(stopped[6]).toMatchObject({ id: 'clock', title: 'Q1 06:12\nStart', look: 'alert' });
    const up = row(deckKeys(input({ running: false, timeUp: true, clockText: '00:00' })), 4);
    expect(up[7]).toMatchObject({ id: 'endQuarter', look: 'lit' });
  });

  it('asks for a second press before ending the quarter', () => {
    expect(row(deckKeys(input({ endArmed: true })), 4)[7]).toEqual({ id: 'endQuarter', title: 'Press\nagain', look: 'alert' });
  });

  it('shortens long names to fit a key', () => {
    const keys = deckKeys(input({ names: { us: 'West Coast Thunder', them: 'Northern Storm' }, lineup: { ...START, GS: 'Alexandria Montgomery-Smith' } }));
    for (const k of keys) for (const line of k.title.split('\n')) expect(line.length).toBeLessThanOrEqual(13);
    expect(keys[0]?.title).toBe('GS\nMontgome…');
  });

  it('rests during a break: nothing to press, the score still showing', () => {
    const keys = deckKeys(input({ inBreak: true }));
    expect(keys.every((k) => k.id === '')).toBe(true);
    expect(keys.filter((k) => k.look !== 'off').map((k) => k.title)).toEqual(['Thunder 0\nStorm 0', 'After Q1\nbreak']);
  });
});

describe('deckPress', () => {
  const what = deckKeys(input({ pending: pend({ team: 'us', player: 'C', stage: 'what' }) }));
  const cause = deckKeys(input({ pending: pend({ team: 'us', player: 'C', action: 'Lost it', stage: 'cause' }) }));
  const rebound = deckKeys(input({ pending: pend({ team: 'us', player: 'GS', action: 'Miss', stage: 'rebound' }) }));
  const rebounder = deckKeys(input({ pending: pend({ team: 'us', player: 'GS', action: 'Miss', rebound: 'ours', stage: 'rebounder' }) }));

  it('reads every key that is showing', () => {
    expect(deckPress('pick:us:GS', what)).toEqual({ kind: 'pick', team: 'us', player: 'GS' });
    expect(deckPress('pick:us:?', what)).toEqual({ kind: 'pick', team: 'us', player: '?' });
    expect(deckPress('pick:them', what)).toEqual({ kind: 'pick', team: 'them', player: null });
    expect(deckPress('action:Won it', what)).toEqual({ kind: 'action', action: 'Won it' });
    expect(deckPress('cause:Bad pass', cause)).toEqual({ kind: 'cause', cause: 'Bad pass' });
    expect(deckPress('rebound:theirs', rebound)).toEqual({ kind: 'rebound', rebound: 'theirs' });
    expect(deckPress('rebounder:GA', rebounder)).toEqual({ kind: 'rebounder', player: 'GA' });
    expect(deckPress('skip', cause)).toEqual({ kind: 'skip' });
    for (const kind of ['flag', 'undo', 'clock', 'endQuarter'] as const) expect(deckPress(kind, what)).toEqual({ kind });
  });

  it('every key on the deck that can be pressed means something', () => {
    for (const keys of [deckKeys(input()), what, cause, rebound, rebounder]) {
      for (const k of keys) if (k.id) expect(deckPress(k.id, keys)).not.toBeNull();
    }
  });

  it('ignores a press of a key that is no longer showing', () => {
    // Row 3 went dark as the key was pressed: the cause must not attach to the next event.
    expect(deckPress('cause:Bad pass', what)).toBeNull();
    expect(deckPress('rebound:ours', cause)).toBeNull();
    expect(deckPress('rebounder:GS', what)).toBeNull();
    expect(deckPress('skip', what)).toBeNull();
    expect(deckPress('pick:us:GS', rebounder)).toBeNull();
  });

  it('ignores keys that are off, keys that only show something, and anything it does not know', () => {
    const none = deckKeys(input());
    expect(deckPress('action:Goal', none)).toBeNull();
    expect(deckPress('', none)).toBeNull();
    expect(deckPress('launch:missiles', none)).toBeNull();
    expect(deckPress('pick:us:XX', [{ id: 'pick:us:XX', title: 'x', look: 'plain' }])).toBeNull();
    expect(deckPress('action:Dance', [{ id: 'action:Dance', title: 'x', look: 'plain' }])).toBeNull();
    expect(deckPress('undo', deckKeys(input({ inBreak: true })))).toBeNull();
  });
});
