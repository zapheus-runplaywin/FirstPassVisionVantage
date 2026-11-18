import type { EntryMode, GameConfig, GameEvent, Position } from '@firstpass/schema';
import { createGame } from '../lib/db';
import { uuidv7 } from '../lib/uuid';
import { STARTING_LINEUP } from './names';

export { STARTING_LINEUP };

/** Saves a new game with its first quarter and starting lineup, and returns its id. */
export function startNewGame(
  config: GameConfig,
  mode: EntryMode,
  lineup: Partial<Record<Position, string>>,
  bench: string[],
  club: { clubCode: string | null; teamId: string | null; fixtureId: string | null } = { clubCode: null, teamId: null, fixtureId: null },
): string {
  const id = uuidv7();
  const recordedAt = new Date().toISOString();
  const base = { gameId: id, stream: 'primary' as const, recordedAt };
  const events: GameEvent[] = [
    {
      ...base,
      id: uuidv7(),
      seq: 1,
      type: 'period_start',
      payload: { period: 1, clockMs: config.quarterMs, attackEnd: config.q1AttackEnd, centrePass: config.firstCentrePass, mode },
    },
    {
      ...base,
      id: uuidv7(),
      seq: 2,
      type: 'lineup_change',
      payload: { period: 1, clockMs: config.quarterMs, team: 'us', lineup, bench, detail: STARTING_LINEUP },
    },
  ];
  createGame({ id, config, createdAt: recordedAt, ...club, pairCode: null, ackedSeq: 0, ownStream: 'primary', helperOn: false }, events);
  return id;
}
