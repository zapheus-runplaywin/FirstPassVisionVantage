import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The season view reads a team's finished games the same way the live view
 * reads one: it follows each game (so HQ's rules decide) before reading its
 * events, and leaves out any game HQ will not open.
 */

const rpc = vi.hoisted(() => vi.fn());
const filters = vi.hoisted(() => [] as [string, string, unknown][]);
const tables = vi.hoisted(() => ({ games: [] as unknown[], events: {} as Record<string, unknown[]> }));

function query(table: string) {
  let gameId = '';
  let helper = false;
  const q = {
    select: () => q,
    eq: (column: string, value: unknown) => {
      filters.push([table, column, value]);
      if (column === 'game_id') gameId = String(value);
      return q;
    },
    gt: () => q,
    like: () => {
      helper = true;
      return q;
    },
    order: () => q,
    limit: () => Promise.resolve({ data: table === 'games' ? tables.games : helper ? [] : (tables.events[gameId] ?? []), error: null }),
  };
  return q;
}

vi.mock('../supabase', () => ({ client: () => ({ rpc, from: query }) }));

const { gameDay, loadSeason, loadSeasonTeams } = await import('../season');

const event = (gameId: string, seq: number) => ({
  game_id: gameId,
  stream: 'primary',
  seq,
  id: `${gameId}-${seq}`,
  type: 'period_start',
  payload: { period: seq, clockMs: 600000, attackEnd: 'right', centrePass: 'us', mode: 'core' },
  recorded_at: '2026-05-02T02:00:00Z',
});

beforeEach(() => {
  rpc.mockReset();
  filters.length = 0;
  tables.games = [];
  tables.events = {};
});

describe('loadSeasonTeams', () => {
  it('lists the teams with finished games, by name, with how many', async () => {
    tables.games = [
      { team_id: 't2', teams: { name: 'Open A' } },
      { team_id: 't1', teams: [{ name: '17 & Under A' }] },
      { team_id: 't2', teams: { name: 'Open A' } },
      { team_id: null, teams: null },
    ];
    expect(await loadSeasonTeams()).toEqual([
      { id: 't1', name: '17 & Under A', games: 1 },
      { id: 't2', name: 'Open A', games: 2 },
    ]);
    expect(filters).toContainEqual(['games', 'status', 'final']);
  });
});

describe('loadSeason', () => {
  it('follows each finished game of the team, then reads it, oldest first', async () => {
    // The database answers newest first.
    tables.games = [
      { id: 'g2', config: { us: 'Thunder', them: 'Hawks' }, created_at: '2026-05-09T02:00:00Z' },
      { id: 'g1', config: { us: 'Thunder', them: 'Swans' }, created_at: '2026-05-02T02:00:00Z' },
    ];
    tables.events = { g1: [event('g1', 1)], g2: [event('g2', 1), event('g2', 2)] };
    rpc.mockImplementation((_name: string, args: { p_game_id: string }) => Promise.resolve({ data: { id: args.p_game_id }, error: null }));
    const progress: [number, number][] = [];
    const season = await loadSeason('t1', (done, of) => progress.push([done, of]));
    expect(filters).toContainEqual(['games', 'team_id', 't1']);
    expect(filters).toContainEqual(['games', 'status', 'final']);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['follow_game', 'follow_game']);
    expect(season.skipped).toBe(0);
    expect(season.games.map((g) => [g.id, g.events.length, g.config.them])).toEqual([
      ['g1', 1, 'Swans'],
      ['g2', 2, 'Hawks'],
    ]);
    expect(season.games[0]!.label).toMatch(/ v Swans$/);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('leaves out a game HQ will not open, and never reads its events', async () => {
    tables.games = [
      { id: 'g2', config: {}, created_at: '2026-05-09T02:00:00Z' },
      { id: 'g1', config: {}, created_at: '2026-05-02T02:00:00Z' },
    ];
    rpc.mockImplementation((_name: string, args: { p_game_id: string }) =>
      Promise.resolve(args.p_game_id === 'g2' ? { data: null, error: { code: '42501', message: "You can't follow this game" } } : { data: { id: 'g1' }, error: null }),
    );
    const season = await loadSeason('t1');
    expect(season.games.map((g) => g.id)).toEqual(['g1']);
    expect(season.skipped).toBe(1);
    expect(filters.some(([table, column, value]) => table === 'game_events' && column === 'game_id' && value === 'g2')).toBe(false);
  });

  it('gives an empty season for a team with no finished games', async () => {
    expect(await loadSeason('t1')).toEqual({ games: [], skipped: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

it('writes a game day shortly', () => {
  expect(gameDay('2026-05-09T02:00:00Z', 'en-AU')).toBe('9 May');
});
