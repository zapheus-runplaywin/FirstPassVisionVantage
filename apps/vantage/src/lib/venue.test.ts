import type { GameEvent } from '@firstpass/schema';
import type { VenueFetch } from '@firstpass/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The venue link against a scripted Studio: this tablet's events go to Studio
 * from where Studio has the game, a helper sends its own stream, nothing is
 * sent for a game kept on the tablet or once HQ says another tablet has the
 * game, and every refusal is retried or stopped as it should be. It never
 * throws and never touches the outbox.
 */

const db = vi.hoisted(() => ({
  game: { id: 'g1', clubCode: 'HAWKS' as string | null, ownStream: 'primary' as string },
  events: [] as GameEvent[],
  kv: new Map<string, string>(),
}));
const sync = vi.hoisted(() => ({ state: undefined as { kind: string } | undefined }));

vi.mock('./db', () => ({
  getGame: (id: string) => (id === 'g1' ? { ...db.game } : null),
  getKv: (k: string) => db.kv.get(k) ?? null,
  setKv: (k: string, v: string) => db.kv.set(k, v),
  loadUnsent: (_id: string, stream: string, after: number, limit: number) => db.events.filter((e) => e.stream === stream && e.seq > after).slice(0, limit),
}));
vi.mock('./sync', () => ({ currentSyncState: () => sync.state }));

import { connectVenue, currentVenueState, sendToVenue, setVenueLink, VENUE_RETRY_MS, VENUE_WAITING_RETRY_MS, venueLabel, venueLink } from './venue';

const LINK = { base: 'https://k3f9x2.studio.firstpass.pivt.au:8443', key: 'key-1' };
const HELPER = 'helper:5f0c1f0e-1111-4222-8333-444455556666';

function fill(n: number, stream = 'primary'): void {
  db.events = Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, gameId: 'g1', stream, seq: i + 1 }) as GameEvent);
}

/** Studio: holds the game's primary events through `have`, or refuses with `refuse`. */
interface Studio {
  have: number;
  refuse: null | { status: number; reason?: string } | 'down';
  posts: number[][];
  keys: (string | undefined)[];
  fetch: VenueFetch;
}
function studio(have = 0): Studio {
  const s: Studio = {
    have,
    refuse: null,
    posts: [],
    keys: [],
    fetch: async (_url, init) => {
      const body = JSON.parse(init?.body ?? '{}') as { events: GameEvent[] };
      s.posts.push(body.events.map((e) => e.seq));
      s.keys.push(init?.headers?.['x-studio-key']);
      const refuse = s.refuse;
      if (refuse === 'down') throw new Error('Network request failed');
      if (refuse) return { ok: false, status: refuse.status, json: async () => ({ reason: refuse.reason }) };
      for (const e of body.events) if (e.stream === 'primary' && e.seq === s.have + 1) s.have = e.seq;
      return { ok: true, status: 200, json: async () => ({ throughSeq: s.have, taken: body.events.length }) };
    },
  };
  return s;
}

beforeEach(() => {
  vi.useFakeTimers();
  db.kv.clear();
  db.game = { id: 'g1', clubCode: 'HAWKS', ownStream: 'primary' };
  db.events = [];
  sync.state = undefined;
  setVenueLink(LINK);
});

describe('sending to Studio', () => {
  it('does nothing until this tablet is connected to a Studio, or for a game kept on the tablet', async () => {
    const s = studio();
    fill(3);
    setVenueLink(null);
    await sendToVenue('g1', s.fetch);
    expect(currentVenueState('g1')).toEqual({ kind: 'off' });
    setVenueLink(LINK);
    db.game.clubCode = null;
    await sendToVenue('g1', s.fetch);
    await sendToVenue('nope', s.fetch);
    expect(s.posts).toEqual([]);
    expect(venueLabel({ kind: 'off' })).toBeNull();
  });

  it('asks how far Studio has the game, then sends what comes after, with its key', async () => {
    const s = studio(2);
    fill(5);
    await sendToVenue('g1', s.fetch);
    expect(s.posts).toEqual([[], [3, 4, 5]]);
    expect(s.keys).toEqual(['key-1', 'key-1']);
    expect(currentVenueState('g1')).toEqual({ kind: 'sending' });
    // The next event goes alone, with no asking again.
    fill(6);
    await sendToVenue('g1', s.fetch);
    expect(s.posts[2]).toEqual([6]);
    expect(venueLabel({ kind: 'sending' })).toBe('Studio: live');
  });

  it('sends a long game in batches', async () => {
    const s = studio();
    fill(250);
    await sendToVenue('g1', s.fetch);
    expect(s.posts.map((p) => p.length)).toEqual([0, 100, 100, 50]);
    expect(s.have).toBe(250);
  });

  it('a helper sends its own stream from the start, whatever Studio has of the primary one', async () => {
    const s = studio(40);
    db.game.ownStream = HELPER;
    fill(2, HELPER);
    await sendToVenue('g1', s.fetch);
    expect(s.posts).toEqual([[], [1, 2]]);
    fill(3, HELPER);
    await sendToVenue('g1', s.fetch);
    expect(s.posts[2]).toEqual([3]);
    expect(currentVenueState('g1')).toEqual({ kind: 'sending' });
  });

  it('waits and tries again when it is not the game on Studio’s scoreboard, or Studio is not reached', async () => {
    const s = studio();
    fill(2);
    s.refuse = { status: 409, reason: 'not-followed' };
    await sendToVenue('g1', s.fetch);
    expect(currentVenueState('g1')).toEqual({ kind: 'waiting' });
    // Studio moves to this game: the retry sends everything.
    s.refuse = null;
    await vi.advanceTimersByTimeAsync(VENUE_WAITING_RETRY_MS);
    expect(s.have).toBe(2);
    expect(currentVenueState('g1')).toEqual({ kind: 'sending' });
    // Studio closes: not reached, tried again sooner, and nothing is thrown.
    s.refuse = 'down';
    fill(3);
    await expect(sendToVenue('g1', s.fetch)).resolves.toBeUndefined();
    expect(currentVenueState('g1')).toEqual({ kind: 'away' });
    s.refuse = null;
    await vi.advanceTimersByTimeAsync(VENUE_RETRY_MS);
    expect(s.have).toBe(3);
    expect(currentVenueState('g1')).toEqual({ kind: 'sending' });
  });

  it('picks up from wherever Studio is after Studio restarts', async () => {
    const s = studio();
    fill(4);
    await sendToVenue('g1', s.fetch);
    // Studio restarted and has the game from HQ only through 2.
    s.have = 2;
    s.posts.length = 0;
    fill(5);
    await sendToVenue('g1', s.fetch);
    expect(currentVenueState('g1')).toEqual({ kind: 'away' });
    await vi.advanceTimersByTimeAsync(VENUE_RETRY_MS);
    expect(s.posts).toEqual([[5], [], [3, 4, 5]]);
    expect(s.have).toBe(5);
  });

  it('stops for good when Studio has removed this tablet or HQ has the game from another one', async () => {
    const s = studio();
    fill(2);
    s.refuse = { status: 403 };
    await sendToVenue('g1', s.fetch);
    expect(currentVenueState('g1')).toEqual({ kind: 'stopped', why: 'not-allowed' });
    expect(venueLabel({ kind: 'stopped', why: 'not-allowed' })).toBe('Studio: connect again');
    s.refuse = null;
    await vi.advanceTimersByTimeAsync(60_000);
    await sendToVenue('g1', s.fetch);
    expect(s.posts).toHaveLength(1);
    // Connecting again starts afresh.
    setVenueLink(LINK);
    await sendToVenue('g1', s.fetch);
    expect(s.have).toBe(2);
    s.refuse = { status: 409, reason: 'other-recorder' };
    fill(3);
    await sendToVenue('g1', s.fetch);
    expect(currentVenueState('g1')).toEqual({ kind: 'stopped', why: 'other-recorder' });
  });

  it('gives Studio nothing once HQ says this tablet no longer records the game', async () => {
    const s = studio();
    fill(2);
    for (const kind of ['lease lost', 'refused']) {
      setVenueLink(LINK);
      sync.state = { kind };
      await sendToVenue('g1', s.fetch);
      expect(currentVenueState('g1')).toEqual({ kind: 'stopped', why: 'other-recorder' });
    }
    expect(s.posts).toEqual([]);
  });

  it('runs one at a time: an event recorded while sending goes straight after', async () => {
    const s = studio();
    fill(1);
    const first = sendToVenue('g1', s.fetch);
    fill(2);
    await sendToVenue('g1', s.fetch);
    await first;
    await vi.runOnlyPendingTimersAsync();
    expect(s.have).toBe(2);
  });
});

describe('connecting', () => {
  it('keeps the link once someone at the Mac presses Allow, and says why when it is not', async () => {
    setVenueLink(null);
    const answers = [{ status: 202, body: { id: 'r', token: 't' } }, { status: 200, body: { status: 'allowed', key: 'new-key' } }];
    const fetch: VenueFetch = async () => {
      const a = answers.shift()!;
      return { ok: true, status: a.status, json: async () => a.body };
    };
    let waiting = 0;
    const done = connectVenue('K3F9X2', () => waiting++, () => false, fetch);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await done).toBeNull();
    expect(waiting).toBe(1);
    expect(venueLink()).toEqual({ base: LINK.base, key: 'new-key' });
    setVenueLink(null);
    expect(await connectVenue('http://192.168.1.20:8080', () => undefined, () => false, fetch)).toMatch(/six letters/);
    expect(venueLink()).toBeNull();
  });
});
