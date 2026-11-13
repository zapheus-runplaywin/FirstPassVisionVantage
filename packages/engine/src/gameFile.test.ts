import type { GameConfig, GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { gameFile, gameFileName } from './gameFile';

const config: GameConfig = { us: 'West Coast Thunder', them: 'Storm (Men’s)', quarterMs: 600_000, q1AttackEnd: 'left', firstCentrePass: 'them' };
const events: GameEvent[] = [
  { id: 'a', gameId: 'g1', stream: 'primary', seq: 1, type: 'clock_start', payload: { period: 1, clockMs: 600_000 }, recordedAt: '2026-11-13T09:00:00.000Z' },
  { id: 'b', gameId: 'g1', stream: 'primary', seq: 2, type: 'correction', payload: { target: 'a', op: 'delete' }, recordedAt: '2026-11-13T09:00:01.000Z' },
];

describe('gameFile', () => {
  it('holds the whole log, corrections included, and reads back the same', () => {
    const file = gameFile('g1', config, events, new Date('2026-11-13T10:00:00Z'));
    expect(file).toEqual({ format: 'firstpass-game', version: 1, exportedAt: '2026-11-13T10:00:00.000Z', gameId: 'g1', config, events });
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });

  it('is a copy: later events do not change a file already made', () => {
    const log = [...events];
    const file = gameFile('g1', config, log, new Date(0));
    log.push({ ...events[0]!, id: 'c', seq: 3 });
    expect(file.events).toHaveLength(2);
  });
});

describe('gameFileName', () => {
  it('names both teams and when the game was created, safe for any file system', () => {
    expect(gameFileName(config, new Date(2026, 10, 13, 9, 5))).toBe('firstpass-west-coast-thunder-v-storm-men-s-2026-11-13-0905.json');
  });

  it('never leaves a team name empty', () => {
    expect(gameFileName({ ...config, us: '★★', them: '' }, new Date(2026, 0, 2, 3, 4))).toBe('firstpass-team-v-team-2026-01-02-0304.json');
  });
});
