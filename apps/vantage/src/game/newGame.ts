import type { EntryMode, GameConfig, GameEvent, Position } from '@firstpass/schema';
import { createGame } from '../lib/db';
import { uuidv7 } from '../lib/uuid';

/** The detail on the lineup recorded at setup; Undo never removes it. */
export const STARTING_LINEUP = 'Starting lineup';

/** Saves a new game with its first quarter and starting lineup, and returns its id. */
export function startNewGame(
  config: GameConfig,
  mode: EntryMode,
  lineup: Partial<Record<Position, string>>,
  bench: string[],
  club: { clubId: string | null; teamId: string | null } = { clubId: null, teamId: null },
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
  createGame({ id, config, createdAt: recordedAt, ...club, pairCode: null, ackedSeq: 0 }, events);
  return id;
}
