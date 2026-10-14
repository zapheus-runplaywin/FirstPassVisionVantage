import type { GameEvent } from '@firstpass/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The outbox against a scripted server: the game is created once, events go
 * up in seq order in batches, a failure backs off and retries, and a lost
 * lease stops sending.
 */

const db = vi.hoisted(() => ({
  game: { id: 'g1', config: {}, createdAt: '', clubId: 'club', teamId: null, pairCode: null as string | null, ackedSeq: 0 },
  events: [] as GameEvent[],
  kv: new Map<string, string>(),
}));
const rpc = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn(async () => ({ data: { session: { user: {} } } })));

vi.mock('./db', () => ({
  getGame: () => ({ ...db.game }),
  getKv: (k: string) => db.kv.get(k) ?? null,
  setKv: (k: string, v: string) => db.kv.set(k, v),
  loadUnsent: (_id: string, after: number, limit: number) => db.events.filter((e) => e.seq > after).slice(0, limit),
  markSynced: (_id: string, acked: number, code: string | null) => {
    db.game.ackedSeq = acked;
    if (code) db.game.pairCode = code;
  },
}));
vi.mock('./supabase', () => ({ supabase: { rpc, auth: { getSession } } }));
vi.mock('./uuid', () => ({ uuidv7: () => 'device-1' }));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));

import { syncGame } from './sync';

function fill(n: number): void {
  db.events = Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, gameId: 'g1', stream: 'primary', seq: i + 1 }) as GameEvent);
}

beforeEach(() => {
  vi.useFakeTimers();
  db.game.pairCode = null;
  db.game.ackedSeq = 0;
  db.events = [];
  rpc.mockReset();
});

describe('syncGame', () => {
  it('creates the game once, then sends events in batches of 200', async () => {
    fill(450);
    rpc.mockImplementation(async (fn: string, args: { p_events?: GameEvent[] }) => {
      if (fn === 'create_game') return { data: { pair_code: '482913' }, error: null };
      const last = args.p_events?.at(-1)?.seq ?? 0;
      return { data: last, error: null };
    });
    await syncGame('g1');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['create_game', 'append_events', 'append_events', 'append_events']);
    expect(rpc.mock.calls[1]?.[1].p_events).toHaveLength(200);
    expect(rpc.mock.calls[3]?.[1].p_events).toHaveLength(50);
    expect(db.game).toMatchObject({ pairCode: '482913', ackedSeq: 450 });

    await syncGame('g1');
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it('keeps unconfirmed events and retries after a failure', async () => {
    fill(3);
    db.game.pairCode = '111111';
    rpc.mockResolvedValueOnce({ data: null, error: new Error('network') });
    await syncGame('g1');
    expect(db.game.ackedSeq).toBe(0);

    rpc.mockResolvedValue({ data: 3, error: null });
    await vi.advanceTimersByTimeAsync(600);
    expect(db.game.ackedSeq).toBe(3);
  });

  it('stops when another device holds the recorder lease', async () => {
    fill(2);
    db.game.pairCode = '111111';
    rpc.mockResolvedValue({ data: null, error: new Error('another device holds the recorder lease') });
    await syncGame('g1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(db.game.ackedSeq).toBe(0);
  });
});
