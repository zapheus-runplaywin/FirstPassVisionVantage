import type { GameEvent } from '@firstpass/schema';
import { liveEvents } from './corrections';

export interface ClockState {
  period: number;
  running: boolean;
  /** Time left on the quarter clock at `now`. */
  remainingMs: number;
  /** The quarter has been ended and the next one not started. */
  inBreak: boolean;
}

/**
 * The game clock as the log says it is at wall time `now`. A running clock
 * keeps counting from the device time its start was recorded, so it is right
 * again after the app restarts.
 */
export function clockState(events: readonly GameEvent[], quarterMs: number, now: number): ClockState {
  const s: ClockState = { period: 1, running: false, remainingMs: quarterMs, inBreak: false };
  let since = 0;
  for (const e of liveEvents(events)) {
    switch (e.type) {
      case 'period_start':
        Object.assign(s, { period: e.payload.period, running: false, remainingMs: quarterMs, inBreak: false });
        break;
      case 'clock_start':
        s.running = true;
        s.remainingMs = e.payload.clockMs;
        since = Date.parse(e.recordedAt);
        break;
      case 'clock_stop':
      case 'period_end':
        s.running = false;
        s.remainingMs = e.payload.clockMs;
        s.inBreak = e.type === 'period_end';
        break;
    }
  }
  if (s.running) s.remainingMs = Math.max(0, s.remainingMs - (now - since));
  return s;
}
