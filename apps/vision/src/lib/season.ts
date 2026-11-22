import { mergeStreams, type SeasonGame } from '@firstpass/engine';
import { readConfig } from '../live/summary';
import type { PlayhqGame } from '../stats/season';
import { fetchEventsSince, followGame } from './games';
import { client } from './supabase';

/*
 * The season view reads the same games and events as the live view, under the
 * same rules in HQ: a coach or manager sees their own team's games, and each
 * game's events open once they follow it (follow_game). Nothing is stored:
 * the figures are worked out here from each finished game's events.
 */

export interface SeasonTeam {
  id: string;
  name: string;
  /** Finished games recorded for the team. */
  games: number;
}

/** The most games a season view reads. A team plays far fewer in a season. */
export const SEASON_GAMES = 60;

type TeamRow = { team_id: string | null; teams: { name: string } | { name: string }[] | null };

function need() {
  const supabase = client();
  if (!supabase) throw new Error('Choose your club first');
  return supabase;
}

/** Teams with a finished game this member may see, by name. */
export async function loadSeasonTeams(): Promise<SeasonTeam[]> {
  const res = await need().from('games').select('team_id, teams(name)').eq('status', 'final').order('created_at', { ascending: false }).limit(500);
  if (res.error) throw res.error;
  const teams = new Map<string, SeasonTeam>();
  for (const r of (res.data ?? []) as unknown as TeamRow[]) {
    const team = Array.isArray(r.teams) ? r.teams[0] : r.teams;
    if (!r.team_id || !team?.name) continue;
    const held = teams.get(r.team_id) ?? { id: r.team_id, name: team.name, games: 0 };
    held.games++;
    teams.set(r.team_id, held);
  }
  return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
}

type GameRow = { id: string; config: unknown; created_at: string };

export interface LoadedSeason {
  games: SeasonGame[];
  /** Finished games HQ would not open, such as after a role paused part way. */
  skipped: number;
}

/** How many games are read at once. */
const AT_ONCE = 4;

/**
 * The team's finished games with their records, oldest first. `onProgress`
 * hears how many are read so far, for a "Reading game 3 of 12" line.
 */
export async function loadSeason(teamId: string, onProgress?: (done: number, of: number) => void): Promise<LoadedSeason> {
  const res = await need()
    .from('games')
    .select('id, config, created_at')
    .eq('team_id', teamId)
    .eq('status', 'final')
    .order('created_at', { ascending: false })
    .limit(SEASON_GAMES);
  if (res.error) throw res.error;
  const rows = ((res.data ?? []) as unknown as GameRow[]).reverse();
  const games: (SeasonGame | null)[] = new Array(rows.length).fill(null);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const row = rows[i];
      if (!row) return;
      if (await followGame(row.id)) {
        const config = readConfig(row.config);
        games[i] = {
          id: row.id,
          label: `${gameDay(row.created_at)} v ${config.them}`,
          playedAt: row.created_at,
          config,
          events: mergeStreams(await fetchEventsSince(row.id, 0)),
        };
      }
      onProgress?.(++done, rows.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, rows.length) }, worker));
  const read = games.filter((g): g is SeasonGame => g !== null);
  return { games: read, skipped: rows.length - read.length };
}

/** A game's date for the season view, such as "9 May". */
export function gameDay(playedAt: string, locale?: string): string {
  return new Date(playedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export interface LoadedPlayhq {
  games: PlayhqGame[];
  /** Games PlayHQ would not give this time. */
  failed: number;
  /** HQ could not be asked, or refused: the season shows recorded games only. */
  unavailable: boolean;
}

type ResultRow = { id?: unknown; playedAt?: unknown; opponent?: unknown; us?: unknown; them?: unknown; players?: unknown };
type PlayerRow = { name?: unknown; positions?: unknown; goals?: unknown; shots?: unknown };

/**
 * The team's games nobody recorded, as PlayHQ has them. HQ's playhq function
 * reads them, for the people who already see the team's games; PlayHQ itself
 * does not answer a browser. Never throws: with no answer the season view
 * simply shows the recorded games.
 */
export async function loadPlayhqResults(teamId: string): Promise<LoadedPlayhq> {
  const none: LoadedPlayhq = { games: [], failed: 0, unavailable: true };
  try {
    const res = await need().functions.invoke('playhq', { body: { teamId } });
    const data = res.data as { games?: unknown; failed?: unknown } | null;
    if (res.error || !data || !Array.isArray(data.games)) return none;
    const games: PlayhqGame[] = [];
    for (const g of data.games as ResultRow[]) {
      if (!g || typeof g.id !== 'string' || typeof g.playedAt !== 'string' || typeof g.us !== 'number' || typeof g.them !== 'number') continue;
      const players = (Array.isArray(g.players) ? (g.players as PlayerRow[]) : []).flatMap((p) =>
        p && typeof p.name === 'string' && p.name.trim()
          ? [
              {
                name: p.name,
                positions: Array.isArray(p.positions) ? p.positions.filter((x): x is string => typeof x === 'string') : [],
                goals: typeof p.goals === 'number' ? p.goals : 0,
                shots: typeof p.shots === 'number' ? p.shots : null,
              },
            ]
          : [],
      );
      games.push({
        id: g.id,
        label: `${gameDay(g.playedAt)} v ${typeof g.opponent === 'string' && g.opponent ? g.opponent : 'opponent'}`,
        playedAt: g.playedAt,
        us: g.us,
        them: g.them,
        players,
      });
    }
    return { games, failed: typeof data.failed === 'number' ? data.failed : 0, unavailable: false };
  } catch {
    return none;
  }
}
