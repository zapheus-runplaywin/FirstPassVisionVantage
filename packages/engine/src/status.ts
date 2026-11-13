import type { GameConfig, GameEvent, Team } from '@firstpass/schema';
import { clockState } from './clock';
import { deriveGame } from './game';

/** Quarters in a game; the break after the last one is full time. */
export const QUARTERS = 4;

export interface GameStatus {
  phase: 'playing' | 'break' | 'full time';
  period: number;
  score: Record<Team, number>;
  /** For a games list, e.g. "Full time", "Q2 break", "Q3". */
  label: string;
}

/** Where a game is up to, from its log alone. */
export function gameStatus(config: GameConfig, events: readonly GameEvent[], now = Date.now()): GameStatus {
  const clock = clockState(events, config.quarterMs, now);
  const { score } = deriveGame(config, events);
  const phase = clock.inBreak ? (clock.period >= QUARTERS ? 'full time' : 'break') : 'playing';
  const label = phase === 'full time' ? 'Full time' : phase === 'break' ? `Q${clock.period} break` : `Q${clock.period}`;
  return { phase, period: clock.period, score, label };
}
