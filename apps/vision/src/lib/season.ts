import { mergeStreams, type SeasonGame } from '@firstpass/engine';
import { readConfig } from '../live/summary';
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
