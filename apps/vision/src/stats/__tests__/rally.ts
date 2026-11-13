import type { GameEvent, Team } from '@firstpass/schema';
import { Q, stream } from '../../live/__tests__/fixtures';

export const US = { GS: 'Priya', GA: 'Jade', WA: 'Kim', C: 'Tess', WD: 'Lily', GD: 'Sam', GK: 'Ruby' };
export const THEM = { GS: 'Harper', GA: 'Ellie', WA: 'Maya', C: 'Grace', WD: 'Isla', GD: 'Chloe', GK: 'Amelia' };

/** Default quarter clock between possessions. */
export const STEP_MS = 10_000;

export interface LineupAt {
  /** Inserted before this possession (0-based, counting both teams). */
  before: number;
  team: Team;
  lineup: Record<string, string>;
}

/**
 * One quarter where the ball goes back and forth: possession i is ours when i
 * is even and theirs when odd, so `ours` and `theirs` are read in turn. Each
 * letter is how that possession ended: 'g' a goal (the other team then takes
 * the centre pass), 'x' given away (the other team then has it from a
 * turnover). Lost balls are in the attacking third's middle.
 */
export function rally(ours: string, theirs: string, opts: { changes?: LineupAt[]; period?: number; stepMs?: number } = {}): GameEvent[] {
  const s = stream();
  const period = opts.period ?? 1;
  const ev: GameEvent[] = [s.start(period)];
  ev.push(s.ev('lineup_change', { period, clockMs: Q, team: 'us', lineup: US, bench: [], detail: '' }));
  ev.push(s.ev('lineup_change', { period, clockMs: Q, team: 'them', lineup: THEM, bench: [], detail: '' }));
  const n = Math.max(ours.length * 2 - 1, theirs.length * 2);
  let needCentre = true;
  for (let i = 0; i < n; i++) {
    const team: Team = i % 2 === 0 ? 'us' : 'them';
    const end = (team === 'us' ? ours : theirs)[Math.floor(i / 2)];
    if (!end) break;
    const clockMs = Q - (i + 1) * (opts.stepMs ?? STEP_MS);
    for (const c of opts.changes ?? []) {
      if (c.before === i) ev.push(s.ev('lineup_change', { period, clockMs: clockMs + 3_000, team: c.team, lineup: c.lineup, bench: [], detail: '' }));
    }
    if (needCentre) ev.push(s.act(period, clockMs + 1_000, { team, action: 'Receive', player: 'C' }));
    if (end === 'g') {
      ev.push(s.act(period, clockMs, { team, action: 'Goal', player: 'GS' }));
      needCentre = true;
    } else {
      ev.push(s.act(period, clockMs, { team, action: 'Lost it', player: 'WA', at: { x: 0.75, y: 0.5 } }));
      needCentre = false;
    }
  }
  return ev;
}
