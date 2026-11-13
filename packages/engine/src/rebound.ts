import type { Position, Rebound, Team } from '@firstpass/schema';

/*
 * Rebounds are recorded with one tap after a miss (Matt, 2026-11-13): OREB
 * ('ours', the shooting team gets its own miss back), DREB ('theirs', the
 * other team collects it) or Out. The shooting team is already known, so the
 * tap also says who has the ball; the apps show that team's name small
 * under the button so an opposition miss can't be read the wrong way.
 */

export function reboundKind(rebound: Rebound): 'OREB' | 'DREB' | 'Out' {
  return rebound === 'ours' ? 'OREB' : rebound === 'theirs' ? 'DREB' : 'Out';
}

/** The team that has the ball after the rebound, or null when it went out (the other team throws in). */
export function reboundTeam(rebound: Rebound, shooter: Team): Team | null {
  if (rebound === 'out') return null;
  return rebound === 'ours' ? shooter : shooter === 'us' ? 'them' : 'us';
}

/**
 * The positions offered for the second tap, when we got the ball back after a
 * miss: GS and GA for our offensive rebound, GD and GK for our defensive
 * rebound on their miss. Empty when the opposition got it or it went out.
 */
export function rebounderChoices(rebound: Rebound | null | undefined, shooter: Team): Position[] {
  if (!rebound || reboundTeam(rebound, shooter) !== 'us') return [];
  return rebound === 'ours' ? ['GS', 'GA'] : ['GD', 'GK'];
}

/** True when a rebounder can be recorded: we got the ball after the miss. */
export function weRebounded(rebound: Rebound | null | undefined, shooter: Team): boolean {
  return !!rebound && reboundTeam(rebound, shooter) === 'us';
}

/** One line for lists and edit choices, e.g. "OREB · Thunder", "DREB · Storm" or "Out". */
export function reboundLabel(rebound: Rebound, shooter: Team, names: Record<Team, string>): string {
  const team = reboundTeam(rebound, shooter);
  return team ? `${reboundKind(rebound)} · ${names[team]}` : 'Out';
}
