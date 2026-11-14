import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Opening a game from the list: Vision follows it by its id. It never sends
 * a pair code, so a finished game opens after the old 24-hour expiry and a
 * tap can't count towards the failed-pairing lockout.
 */

const rpc = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());

function query() {
  const q = {
    select: (cols: string) => {
      select(cols);
      return q;
    },
    gte: () => q,
    order: () => q,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return q;
}

vi.mock('../supabase', () => ({ client: () => ({ rpc, from: query }) }));

const { followGame, loadGames } = await import('../games');

beforeEach(() => {
  rpc.mockReset();
  select.mockReset();
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
