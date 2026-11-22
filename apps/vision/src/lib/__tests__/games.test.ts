import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Opening a game from the list: Vision follows it by its id. It never sends
 * a pair code, so a finished game opens after the old 24-hour expiry and a
 * tap can't count towards the failed-pairing lockout.
 */

const rpc = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const lt = vi.hoisted(() => vi.fn());
const limit = vi.hoisted(() => vi.fn());
const rows = vi.hoisted(() => ({ list: [] as unknown[] }));

function query() {
  const q = {
    select: (cols: string) => {
      select(cols);
      return q;
    },
    gte: () => q,
    lt: (column: string, value: string) => {
      lt(column, value);
      return q;
    },
    order: () => q,
    limit: (n: number) => {
      limit(n);
      return Promise.resolve({ data: rows.list, error: null });
    },
  };
  return q;
}

vi.mock('../supabase', () => ({ client: () => ({ rpc, from: query }) }));

const { EARLIER_PAGE, RECENT_DAYS, followGame, gameWhen, loadEarlierGames, loadGames } = await import('../games');

beforeEach(() => {
  rpc.mockReset();
  select.mockReset();
  lt.mockReset();
  limit.mockReset();
  rows.list = [];
});

describe('followGame', () => {
  it('follows by the game id, with no pair code', async () => {
    rpc.mockResolvedValue({ data: { id: 'g1', status: 'final' }, error: null });
    expect(await followGame('g1')).toBe('g1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('follow_game', { p_game_id: 'g1' });
  });

  it('never calls pair_game, so taps never count as failed pairing tries', async () => {
    rpc.mockResolvedValue({ data: { id: 'g1' }, error: null });
    for (let i = 0; i < 6; i++) await followGame('g1');
    expect(rpc.mock.calls.every((c) => c[0] === 'follow_game')).toBe(true);
  });

  it('returns null when HQ says the member may not see the game', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'You cannot see that game' } });
    expect(await followGame('g1')).toBeNull();
  });

  it('passes on anything else, such as no signal, so the screen can show it', async () => {
    const err = { code: '', message: 'TypeError: Network request failed' };
    rpc.mockResolvedValue({ data: null, error: err });
    await expect(followGame('g1')).rejects.toBe(err);
  });
});

describe('loadGames', () => {
  it('no longer reads the pair code', async () => {
    await loadGames();
    expect(select.mock.calls[0]?.[0]).not.toMatch(/pair_code/);
  });
});

const row = (i: number) => ({ id: `g${i}`, config: { us: 'Thunder', them: 'Storm' }, status: 'final', created_at: new Date(Date.UTC(2026, 9, 30 - i)).toISOString(), teams: { name: 'Open A' } });

describe('loadEarlierGames', () => {
  it('asks for games before the oldest one showing, and never the pair code', async () => {
    await loadEarlierGames('2026-11-01T00:00:00.000Z');
    expect(lt).toHaveBeenCalledWith('created_at', '2026-11-01T00:00:00.000Z');
    expect(select.mock.calls[0]?.[0]).not.toMatch(/pair_code/);
  });

  it('says there are no more when a page comes back short', async () => {
    rows.list = [row(1), row(2)];
    const page = await loadEarlierGames('2026-11-01T00:00:00.000Z');
    expect(page.games.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(page.more).toBe(false);
  });

  it('asks for one extra to learn whether there are more, and keeps it for the next page', async () => {
    rows.list = Array.from({ length: EARLIER_PAGE + 1 }, (_, i) => row(i));
    const page = await loadEarlierGames('2026-11-01T00:00:00.000Z');
    expect(limit).toHaveBeenCalledWith(EARLIER_PAGE + 1);
    expect(page.games).toHaveLength(EARLIER_PAGE);
    expect(page.more).toBe(true);
  });
});

describe('gameWhen', () => {
  const now = Date.UTC(2026, 10, 22, 4, 0);
  it('gives a recent game its day and time, and an older game its date', () => {
    const recent = gameWhen(new Date(now - 3600_000).toISOString(), now, 'en-AU');
    expect(recent).toMatch(/\d{1,2}:\d{2}/);
    const old = gameWhen(new Date(now - (RECENT_DAYS + 1) * 24 * 3600_000).toISOString(), now, 'en-AU');
    expect(old).toMatch(/2026/);
    expect(old).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
