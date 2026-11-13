import type { GameState, Zone } from '@firstpass/engine';
import type { Action, Cause, CourtPoint, EntryMode, PlayerRef, Rebound, Team } from '@firstpass/schema';

/** The event being entered: Where, then Who, then What, then the optional second tap. */
export interface Pending {
  at: CourtPoint | null;
  zone: Zone | null;
  /** Where the dot is drawn, as a fraction of the court as the statistician sees it. */
  screen: CourtPoint | null;
  team: Team | null;
  player: PlayerRef | null;
  action: Action | null;
  cause?: Cause;
  rebound?: Rebound;
  /** Our player who took the rebound, from the second tap after OREB or DREB. */
  rebounder?: PlayerRef;
  stage: 'who' | 'what' | 'cause' | 'rebound' | 'rebounder';
}

export const emptyPending = (): Pending => ({ at: null, zone: null, screen: null, team: null, player: null, action: null, stage: 'who' });

export type Look = 'lit' | 'plain' | 'dim';

/** Core mode shows six cells; Full mode lights the third row too. Cells never move. */
export const ACTION_GRID: readonly Action[] = ['Goal', 'Miss', 'Won it', 'Lost it', 'Receive', 'Feed', 'Touch', 'Penalty'];
export const FULL_ONLY: ReadonlySet<Action> = new Set(['Feed', 'Touch', 'Penalty']);

/**
 * How an action button looks for the event being entered: lit when it is
 * what the rules of netball expect, dimmed when it contradicts the state.
 * A dimmed button still works; the app accepts it and marks it amber.
 */
export function actionLook(action: Action, pending: Pending | null, state: GameState, mode: EntryMode): Look {
  const team = pending?.team;
  if (!team) return 'dim';
  if (FULL_ONLY.has(action) && mode !== 'full') return 'dim';
  const have = state.possession;
  const weHave = have === team;
  const theyHave = have !== null && have !== team;
  const zone = pending.zone;
  const canShoot =
    team === 'us'
      ? zone?.circle === 'ours' && (pending.player === 'GS' || pending.player === 'GA' || pending.player === '?')
      : zone?.circle === 'theirs';

  switch (action) {
    case 'Goal':
    case 'Miss':
      return canShoot ? (weHave || !have ? 'lit' : 'plain') : 'dim';
    case 'Won it':
      return weHave ? 'dim' : 'lit';
    case 'Lost it':
      return theyHave ? 'dim' : 'lit';
    case 'Receive':
      return state.centrePassPending && state.nextCentrePass === team ? 'lit' : 'dim';
    case 'Feed':
      return weHave && team === 'us' ? 'lit' : 'dim';
    case 'Touch':
      return theyHave ? 'lit' : 'dim';
    case 'Penalty':
      return 'lit';
  }
}
