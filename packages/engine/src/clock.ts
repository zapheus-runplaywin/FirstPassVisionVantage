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

/**
 * The event that sets the quarter clock to `clockMs` (to match the official
 * scoring clock) without changing whether it is running: a running clock is
 * restarted from the new time, a stopped one is stopped at it. Clamped to the
 * quarter length.
 */
export function setClockEvent(
  clock: Pick<ClockState, 'period' | 'running'>,
  clockMs: number,
  quarterMs: number,
): { type: 'clock_start' | 'clock_stop'; payload: { period: number; clockMs: number } } {
  const ms = Math.round(Math.max(0, Math.min(quarterMs, clockMs)));
  return { type: clock.running ? 'clock_start' : 'clock_stop', payload: { period: clock.period, clockMs: ms } };
}

/**
 * The quarter end to delete to carry on playing a quarter that was ended by
 * mistake: the latest one still standing, if no later quarter has started.
 */
export function resumableEnd(events: readonly GameEvent[]): string | null {
  let end: string | null = null;
  for (const e of liveEvents(events)) {
    if (e.type === 'period_end') end = e.id;
    else if (e.type === 'period_start') end = null;
  }
  return end;
}
