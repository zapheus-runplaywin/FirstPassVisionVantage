import type { ActionPayload, GameConfig, GameEvent, Team } from '@firstpass/schema';
import { liveEvents, type LiveEvent } from './corrections';
import { applyEvent, initialState, type GameState } from './game';

/** Gaps longer than this between events in one quarter are worth checking against video. */
export const LONG_GAP_MS = 45_000;

export type AmberReason = 'cause not set' | 'rebound not set' | 'player unknown' | 'possession disagreed';

/**
 * Why an action needs a second look at the break (an amber dot). The
 * statistician is never stopped during play; anything incomplete or
 * contradictory is accepted and marked here instead.
 */
export function amberReasons(action: ActionPayload, before: Pick<GameState, 'possession'>): AmberReason[] {
  const reasons: AmberReason[] = [];
  const turnover = action.action === 'Won it' || action.action === 'Lost it';
  if (turnover && !action.cause) reasons.push('cause not set');
  if (action.action === 'Miss' && !action.rebound) reasons.push('rebound not set');
  if (action.player === '?') reasons.push('player unknown');
  const have = before.possession;
  if (have && ((action.action === 'Won it' && have === action.team) || (action.action === 'Lost it' && have !== action.team))) {
    reasons.push('possession disagreed');
  }
  return reasons;
}

export type ReviewIssue =
  | { kind: 'flag'; event: LiveEvent }
  | { kind: 'amber'; event: LiveEvent; reasons: AmberReason[] }
  | { kind: 'double turnover'; event: LiveEvent; team: Team }
  | { kind: 'double receive'; event: LiveEvent; team: Team }
  | { kind: 'long gap'; event: LiveEvent; gapMs: number };

/**
 * Everything the break review lists, in log order: flags, amber actions,
 * possession chains that do not add up (two turnovers or two centre pass
 * receives in a row by one team), and long gaps between actions in `period`,
 * or in every quarter for the post-game audit (`'all'`).
 */
export function reviewGame(config: GameConfig, events: readonly GameEvent[], period: number | 'all'): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  let state = initialState(config);
  let previous: Extract<LiveEvent, { type: 'action' }> | null = null;

  for (const event of liveEvents(events)) {
    if (event.type === 'flag') issues.push({ kind: 'flag', event });
    if (event.type === 'action') {
      const a = event.payload;
      const reasons = amberReasons(a, state);
      if (reasons.length) issues.push({ kind: 'amber', event, reasons });

      if (previous && previous.payload.team === a.team) {
        if (previous.payload.action === 'Lost it' && a.action === 'Lost it') issues.push({ kind: 'double turnover', event, team: a.team });
        if (previous.payload.action === 'Receive' && a.action === 'Receive') issues.push({ kind: 'double receive', event, team: a.team });
      }
      if (previous && previous.payload.period === a.period && (period === 'all' || a.period === period)) {
        const gapMs = previous.payload.clockMs - a.clockMs;
        if (gapMs > LONG_GAP_MS) issues.push({ kind: 'long gap', event, gapMs });
      }
      previous = event;
    }
    state = applyEvent(state, event);
  }
  return issues;
}
