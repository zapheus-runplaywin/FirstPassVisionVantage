import type { GameConfig, GameEvent } from '@firstpass/schema';
import { fromRow, type EventRow } from '../live/log';
import { readConfig } from '../live/summary';
import { client } from './supabase';

/*
 * What Vision reads from the club's database (the schema is in FirstPassHQ,
 * migration 20261015000100_game_stats.sql). Row level security decides:
 * admins and statisticians see every game, a team's coaches and managers see
 * that team's games. Events and the live channel need the coach to follow the
 * game first (follow_game, by its id), which makes them a viewer of it. No
 * pair code: the coach's place in the team is what lets them in.
 */

export type GameRowStatus = 'setup' | 'live' | 'final';

export interface GameListEntry {
  id: string;
  config: GameConfig;
  status: GameRowStatus;
  teamName: string | null;
  createdAt: string;
}

/** How far back the games list looks. */
export const RECENT_DAYS = 3;
const PAGE = 1000;

type GameRow = {
  id: string;
  config: unknown;
  status: GameRowStatus;
  created_at: string;
  teams: { name: string } | { name: string }[] | null;
};

function toEntry(r: GameRow): GameListEntry {
  const team = Array.isArray(r.teams) ? r.teams[0] : r.teams;
  return {
    id: r.id,
    config: readConfig(r.config),
    status: r.status,
    teamName: team?.name ?? null,
    createdAt: r.created_at,
  };
}

function need() {
  const supabase = client();
  if (!supabase) throw new Error('Choose your club first');
  return supabase;
}

/** Games from the last few days that this member may see, newest first. */
export async function loadGames(now = Date.now()): Promise<GameListEntry[]> {
  const since = new Date(now - RECENT_DAYS * 24 * 3600 * 1000).toISOString();
  const res = await need()
    .from('games')
    .select('id, config, status, created_at, teams(name)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);
  if (res.error) throw res.error;
  return ((res.data ?? []) as unknown as GameRow[]).map(toEntry);
}

export async function loadGame(gameId: string): Promise<GameListEntry | null> {
  const res = await need()
    .from('games')
    .select('id, config, status, created_at, teams(name)')
    .eq('id', gameId)
    .maybeSingle();
  if (res.error) throw res.error;
  return res.data ? toEntry(res.data as unknown as GameRow) : null;
}

/** HQ's code for "you may not see this game". */
const NOT_ALLOWED = '42501';

/*
 * Follows a game by its id, so its events and live channel open to this
 * member. HQ lets in anyone who may see the game, at any time, with no code
 * and no failed-try limit. Returns the game's id, or null when HQ refuses.
 */
export async function followGame(gameId: string): Promise<string | null> {
  const res = await need().rpc('follow_game', { p_game_id: gameId });
  if (res.error) {
    if ((res.error as { code?: string }).code === NOT_ALLOWED) return null;
    throw res.error;
  }
  const game = res.data as { id: string | null } | null;
  return game?.id ?? null;
}

/** Primary events after `afterSeq`, in order, reading in pages. */
export async function fetchEventsSince(gameId: string, afterSeq: number): Promise<GameEvent[]> {
  const supabase = need();
  const out: GameEvent[] = [];
  let after = afterSeq;
  for (;;) {
    const res = await supabase
      .from('game_events')
      .select('game_id, stream, seq, id, type, payload, recorded_at')
      .eq('game_id', gameId)
      .eq('stream', 'primary')
      .gt('seq', after)
      .order('seq')
      .limit(PAGE);
    if (res.error) throw res.error;
    const rows = (res.data ?? []) as EventRow[];
    for (const r of rows) {
      const e = fromRow(r);
      if (e) out.push(e);
    }
    if (rows.length < PAGE) return out;
    after = rows[rows.length - 1].seq;
  }
}
