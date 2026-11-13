import type { Rebound, Team } from '@firstpass/schema';

/**
 * What a rebound button says (Matt, 2026-11-13): the team that gets the ball
 * plus OREB or DREB. 'ours' is an offensive rebound, so the shooting team
 * gets its own miss back; 'theirs' is a defensive rebound by the other team.
 */
export function reboundLabel(rebound: Rebound, shooter: Team, names: Record<Team, string>): string {
  if (rebound === 'out') return 'Out of court';
  if (rebound === 'ours') return `${names[shooter]} OREB`;
  return `${names[shooter === 'us' ? 'them' : 'us']} DREB`;
}
