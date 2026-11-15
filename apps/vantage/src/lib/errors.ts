/*
 * Telling "the club said no" from "we couldn't reach the club".
 *
 * Supabase passes on the database's error code (a five-character SQLSTATE
 * such as 42501) when HQ answered and refused. When the request never got
 * an answer (no signal, a timeout, a proxy page) the error has no such code.
 * Only a refusal is worth showing as a reason: everything else is retried.
 */

export type ServerProblem =
  /** No answer from the club: no signal, a timeout or a server hiccup. Try again later. */
  | { kind: 'unreachable' }
  /** HQ answered and refused. Retrying will get the same answer until someone changes something. */
  | { kind: 'refused'; message: string };

/*
 * The codes HQ raises when it refuses (see FirstPassHQ game_stats.sql):
 * 42501 not allowed (no Statistician role, stood down, lease taken),
 * 28000 not signed in, P0002 no such game or fixture, 55000 the game has
 * finished. Class 42 and 28 cover any other permission or sign-in refusal.
 */
const REFUSED = new Set(['P0002', '55000']);
const REFUSED_CLASSES = ['42', '28'];

function codeOf(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(err);
}

export function classify(err: unknown): ServerProblem {
  const code = codeOf(err);
  const refused = code.length === 5 && (REFUSED.has(code) || REFUSED_CLASSES.includes(code.slice(0, 2)));
  return refused ? { kind: 'refused', message: messageOf(err) } : { kind: 'unreachable' };
}
