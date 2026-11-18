import type { GameEvent } from '@firstpass/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The helper's link to the club against a scripted server: the recorder turns
 * the helper on, a helper joins by code and gets the game so far, and each
 * tablet reads the events it does not write, once each, without ever taking
 * a copy of its own stream from the club in place of what it holds.
 */

interface Row { game_id: string; stream: string; seq: number; id: string; type: string; payload: unknown; recorded_at: string }

const db = vi.hoisted(() => ({
  games: new Map<string, Record<string, unknown>>(),
  events: [] as GameEvent[],
  helperOn: new Map<string, boolean>(),
}));
const server = vi.hoisted(() => ({ rows: [] as Row[], reads: [] as string[], fail: null as null | { code: string; message: string } }));
const rpc = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } as { user: { id: string } } | null } })));

vi.mock('./db', () => ({
  getGame: (id: string) => db.games.get(id) ?? null,
  loadEvents: (id: string) => db.events.filter((e) => e.gameId === id),
  saveRemoteEvents: (events: GameEvent[]) => {
    let added = 0;
    for (const e of events) {
      if (db.events.some((x) => x.gameId === e.gameId && x.stream === e.stream && x.seq === e.seq)) continue;
      db.events.push(e);
      added++;
    }
    return added;
  },
  saveHelpedGame: (g: { id: string }) => {
    if (!db.games.has(g.id)) db.games.set(g.id, { ...g });
  },
  setHelperOn: (id: string, on: boolean) => db.helperOn.set(id, on),
}));

/** PostgREST's query builder, enough of it: filters, then awaited for the rows. */
function query() {
  const f = { stream: null as string | null, like: null as string | null, gt: 0, game: '', limit: 1000 };
  const q = {
    select: () => q,
    eq: (col: string, v: string) => {
      if (col === 'game_id') f.game = v;
      if (col === 'stream') f.stream = v;
      return q;
    },
    like: (_col: string, v: string) => ((f.like = v.replace('%', '')), q),
    gt: (_col: string, v: number) => ((f.gt = v), q),
    order: () => q,
    limit: (n: number) => ((f.limit = n), q),
    then: (resolve: (r: { data: Row[] | null; error: unknown }) => void) => {
      server.reads.push(f.stream ?? `${f.like}*`);
      if (server.fail) return resolve({ data: null, error: server.fail });
      const rows = server.rows
        .filter((r) => r.game_id === f.game && (f.stream ? r.stream === f.stream && r.seq > f.gt : r.stream.startsWith(f.like ?? '')))
        .sort((a, b) => (a.stream < b.stream ? -1 : a.stream > b.stream ? 1 : a.seq - b.seq))
        .slice(0, f.limit);
      resolve({ data: rows, error: null });
    },
  };
  return q;
}
const supabase = { rpc, auth: { getSession }, from: () => query() };
const club = { code: 'HAWKS', name: 'Hawks', supabaseUrl: '', anonKey: '' };
vi.mock('./supabase', () => ({ clientFor: () => supabase, currentClub: () => club }));
vi.mock('./clubs', () => ({ findClub: (code: string | null) => (code === 'HAWKS' ? club : null) }));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));

import { joinAsHelper, onRemoteEvents, pullGame, setHelper } from './helper';

function row(stream: string, seq: number, type = 'action'): Row {
  return { game_id: 'g1', stream, seq, id: `${stream}#${seq}`, type, payload: {}, recorded_at: '2026-11-18T09:00:00Z' };
}
function held(stream: string, seq: number): GameEvent {
  return { id: `${stream}#${seq}`, gameId: 'g1', stream, seq, type: 'action', payload: {}, recordedAt: '2026-11-18T09:00:00Z' } as unknown as GameEvent;
}
const ids = () => db.events.map((e) => e.id).sort();

beforeEach(() => {
  db.games.clear();
  db.events = [];
  db.helperOn.clear();
  server.rows = [];
  server.reads = [];
  server.fail = null;
  rpc.mockReset();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
});

describe('setHelper (the recorder)', () => {
  beforeEach(() => db.games.set('g1', { id: 'g1', clubCode: 'HAWKS', pairCode: '482913', ownStream: 'primary' }));

  it('asks HQ, then remembers the answer on the tablet', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await setHelper('g1', true);
    expect(rpc).toHaveBeenCalledWith('set_game_helper', { p_game_id: 'g1', p_on: true });
    expect(db.helperOn.get('g1')).toBe(true);
    await setHelper('g1', false);
    expect(rpc).toHaveBeenLastCalledWith('set_game_helper', { p_game_id: 'g1', p_on: false });
    expect(db.helperOn.get('g1')).toBe(false);
  });

  it("gives HQ's reason and changes nothing when HQ refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Only the recording tablet can change the game' } });
    await expect(setHelper('g1', true)).rejects.toThrow('Only the recording tablet can change the game');
    expect(db.helperOn.has('g1')).toBe(false);
  });

  it('needs the game to have reached the club', async () => {
    db.games.set('g1', { id: 'g1', clubCode: 'HAWKS', pairCode: null, ownStream: 'primary' });
    await expect(setHelper('g1', true)).rejects.toThrow('has not reached your club yet');
    db.games.set('g1', { id: 'g1', clubCode: null, pairCode: null, ownStream: 'primary' });
    await expect(setHelper('g1', true)).rejects.toThrow('Send this game to your club first');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('joinAsHelper', () => {
  const game = { id: 'g1', config: { us: 'Thunder', them: 'Storm' }, created_at: '2026-11-18T08:55:00Z', team_id: 't1', fixture_id: null, pair_code: '482913' };

  it('joins by code and brings the game so far onto the device', async () => {
    server.rows = [row('primary', 1), row('primary', 2), row('helper:other', 1, 'correction')];
    rpc.mockResolvedValue({ data: game, error: null });
    await expect(joinAsHelper('482 913')).resolves.toBe('g1');
    expect(rpc).toHaveBeenCalledWith('pair_game_helper', { p_code: '482 913' });
    expect(ids()).toEqual(['helper:other#1', 'primary#1', 'primary#2']);
    expect(db.games.get('g1')).toMatchObject({ id: 'g1', clubCode: 'HAWKS', teamId: 't1', pairCode: '482913', ownStream: 'helper:u1', ackedSeq: 0, helperOn: false });
  });

  it("picks up the helper's own earlier changes, so the next one takes the next number", async () => {
    server.rows = [row('primary', 1), row('helper:u1', 1, 'correction'), row('helper:u1', 2, 'lineup_change')];
    rpc.mockResolvedValue({ data: game, error: null });
    await joinAsHelper('482913');
    expect(ids()).toEqual(['helper:u1#1', 'helper:u1#2', 'primary#1']);
    expect(db.games.get('g1')).toMatchObject({ ownStream: 'helper:u1', ackedSeq: 2 });
  });

  it('says so when no live game has the code, and keeps nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(joinAsHelper('000000')).rejects.toThrow('No live game has that code');
    // PostgREST can also answer a null row as a row of nulls.
    rpc.mockResolvedValue({ data: { id: null }, error: null });
    await expect(joinAsHelper('000000')).rejects.toThrow('No live game has that code');
    expect(db.games.size).toBe(0);
    expect(db.events).toHaveLength(0);
  });

  it("gives HQ's reason when the helper is off, or the member is not a statistician", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'The helper is turned off for this game. Ask the statistician recording it to turn it on' } });
    await expect(joinAsHelper('482913')).rejects.toThrow('The helper is turned off for this game');
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Only statisticians can help with a game' } });
    await expect(joinAsHelper('482913')).rejects.toThrow('Only statisticians can help with a game');
    expect(db.games.size).toBe(0);
  });

  it('needs a sign-in', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(joinAsHelper('482913')).rejects.toThrow('Sign in first');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('pullGame', () => {
  it("the recorder reads the helper's events only, and only the new ones", async () => {
    db.games.set('g1', { id: 'g1', clubCode: 'HAWKS', pairCode: '482913', ownStream: 'primary' });
    db.events = [held('primary', 1), held('primary', 2)];
    server.rows = [row('primary', 1), row('primary', 2), row('primary', 3), row('helper:u2', 1, 'correction')];
    const heard = vi.fn();
    const off = onRemoteEvents('g1', heard);
    await expect(pullGame('g1')).resolves.toBe(1);
    // The recorder never reads the primary stream back: the tablet is where it is written.
    expect(server.reads).toEqual(['helper:*']);
    expect(ids()).toEqual(['helper:u2#1', 'primary#1', 'primary#2']);
    expect(heard).toHaveBeenCalledTimes(1);

    await expect(pullGame('g1')).resolves.toBe(0);
    expect(heard).toHaveBeenCalledTimes(1);
    server.rows.push(row('helper:u2', 2, 'lineup_change'));
    await expect(pullGame('g1')).resolves.toBe(1);
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    server.rows.push(row('helper:u2', 3, 'correction'));
    await pullGame('g1');
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("a helper reads the recorder's events from where it is up to, and another helper's", async () => {
    db.games.set('g1', { id: 'g1', clubCode: 'HAWKS', pairCode: '482913', ownStream: 'helper:u1' });
    db.events = [held('primary', 1), held('helper:u1', 1), held('helper:u1', 2)];
    // The club has only the first of this helper's two changes so far.
    server.rows = [row('primary', 1), row('primary', 2), row('primary', 3), row('helper:u1', 1, 'correction'), row('helper:u2', 1, 'correction')];
    await expect(pullGame('g1')).resolves.toBe(3);
    expect(server.reads).toEqual(['primary', 'helper:*']);
    expect(ids()).toEqual(['helper:u1#1', 'helper:u1#2', 'helper:u2#1', 'primary#1', 'primary#2', 'primary#3']);
  });

  it("never takes the club's copy of this tablet's own stream", async () => {
    db.games.set('g1', { id: 'g1', clubCode: 'HAWKS', pairCode: '482913', ownStream: 'helper:u1' });
    db.events = [];
    server.rows = [row('helper:u1', 1, 'correction')];
    await expect(pullGame('g1')).resolves.toBe(0);
    expect(db.events).toHaveLength(0);
  });

  it('reads the primary stream a page at a time', async () => {
    db.games.set('g1', { id: 'g1', clubCode: 'HAWKS', pairCode: '482913', ownStream: 'helper:u1' });
    server.rows = Array.from({ length: 1500 }, (_, i) => row('primary', i + 1));
    await expect(pullGame('g1')).resolves.toBe(1500);
    expect(server.reads).toEqual(['primary', 'primary', 'helper:*']);
  });

  it('fails without changing anything when the club cannot be reached or the tablet is signed out', async () => {
    db.games.set('g1', { id: 'g1', clubCode: 'HAWKS', pairCode: '482913', ownStream: 'primary' });
    server.fail = { code: '', message: 'TypeError: Network request failed' };
    await expect(pullGame('g1')).rejects.toMatchObject({ message: 'TypeError: Network request failed' });
    server.fail = null;
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(pullGame('g1')).rejects.toThrow('Not signed in');
    expect(db.events).toHaveLength(0);
  });

  it('does nothing for a local game or one not on the device', async () => {
    db.games.set('g1', { id: 'g1', clubCode: null, pairCode: null, ownStream: 'primary' });
    await expect(pullGame('g1')).resolves.toBe(0);
    await expect(pullGame('nowhere')).resolves.toBe(0);
    expect(server.reads).toEqual([]);
  });

  it('runs one read at a time for a game', async () => {
    db.games.set('g1', { id: 'g1', clubCode: 'HAWKS', pairCode: '482913', ownStream: 'primary' });
    server.rows = [row('helper:u2', 1, 'correction')];
    const [a, b] = await Promise.all([pullGame('g1'), pullGame('g1')]);
    expect([a, b]).toEqual([1, 1]);
    expect(server.reads).toEqual(['helper:*']);
  });
});
