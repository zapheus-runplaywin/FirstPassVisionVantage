import type { GameEvent } from '@firstpass/schema';
import type { VenueFetch } from '@firstpass/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameFeed } from '../feed';
import { LiveLog } from '../log';
import { freshness, VENUE_FRESH_MS } from '../summary';
import { followVenue, VENUE_IDLE_MS, VENUE_OTHER_GAME_MS, VENUE_RETRY_MS } from '../venue';
import { stream, T0 } from './fixtures';

/*
 * The venue link in the phone app: events read from Studio show at once, the
 * club's copy always wins, a hole is still filled from the club, and the
 * reader keeps asking Studio without ever spinning or throwing.
 */

function events(n: number): GameEvent[] {
  const s = stream();
  const out = [s.start(1)];
  for (let i = 1; i < n; i++) out.push(s.act(1, 600_000 - i * 1000, { team: 'us', action: 'Receive' }));
  return out;
}
const LINK = { base: 'https://k3f9x2.studio.firstpass.pivt.au:8443', key: 'key-1' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('events from the venue link', () => {
  it('show at once, and the club’s copy replaces one that turns out different', () => {
    const [a, b, c] = events(3);
    const log = new LiveLog('g');
    log.add([a!]);
    // From Studio: b, and a c that the club will not agree with.
    const stale = { ...c!, id: 'stale', payload: { ...(c!.payload as object), action: 'Goal' } } as GameEvent;
    expect(log.add([b!, stale], false)).toBe(true);
    expect(log.events.map((e) => e.id)).toEqual(['e1', 'e2', 'stale']);
    // Studio never replaces what is held, whichever came first.
    expect(log.add([{ ...b!, id: 'other' } as GameEvent], false)).toBe(false);
    expect(log.events.map((e) => e.id)).toEqual(['e1', 'e2', 'stale']);
    // The club's own copy of the same event changes nothing; a different one wins.
    expect(log.add([b!])).toBe(false);
    expect(log.add([c!])).toBe(true);
    expect(log.events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('reach the screen through the feed, and a hole is still filled from the club', async () => {
    const server = events(5);
    const fetchSince = vi.fn(async (after: number) => server.filter((e) => e.seq > after && e.seq <= 3));
    const onChange = vi.fn();
    const feed = new GameFeed({ gameId: 'g', fetchSince, onChange, now: () => Date.now() });
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(feed.log.unbrokenThrough).toBe(3);
    onChange.mockClear();
    // Studio is ahead of the club: 4 shows straight away.
    feed.receiveVenue([server[3]!]);
    expect(feed.log.unbrokenThrough).toBe(4);
    expect(feed.venueReadAt).toBe(Date.now());
    expect(onChange).toHaveBeenCalled();
    // An answer with nothing new still says Studio is in touch.
    vi.advanceTimersByTime(5_000);
    feed.receiveVenue([]);
    expect(feed.venueReadAt).toBe(Date.now());
    // Studio gives 6 without 5 (a seventh event exists only there): the club is asked for the hole.
    const calls = fetchSince.mock.calls.length;
    feed.receiveVenue([{ ...server[4]!, seq: 6, id: 'e6' } as GameEvent]);
    expect(feed.log.hasGap).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSince.mock.calls.length).toBeGreaterThan(calls);
    // Studio lost: the screen is told once.
    onChange.mockClear();
    feed.venueLost();
    feed.venueLost();
    expect(feed.venueReadAt).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
    feed.stop();
    feed.receiveVenue([server[4]!]);
    expect(feed.log.unbrokenThrough).toBe(4);
  });

  it('keep the coach in touch while the internet is down', () => {
    const now = T0 + 100_000;
    const cut = { connection: 'polling' as const, lastEventAt: now - 2_000, lastReadAt: now - 60_000 };
    expect(freshness(cut, true, now).kind).toBe('offline');
    expect(freshness({ ...cut, venueReadAt: now - 20_000 }, true, now)).toEqual({ kind: 'fresh' });
    // Studio silent for longer than a request waits there: no longer in touch.
    expect(freshness({ ...cut, venueReadAt: now - VENUE_FRESH_MS - 1_000 }, true, now).kind).toBe('offline');
    expect(freshness({ ...cut, venueReadAt: null }, true, now).kind).toBe('offline');
  });
});

describe('reading from Studio', () => {
  type Answer = { status: number; body: unknown } | 'down';
  function studio(answers: Answer[]) {
    const urls: string[] = [];
    const keys: (string | undefined)[] = [];
    const fetch: VenueFetch = async (url, init) => {
      urls.push(url.split('?')[1] ?? '');
      keys.push(init?.headers?.['x-studio-key']);
      const next = answers.shift();
      // Out of answers: hang like a request waiting at Studio, until stopped.
      if (!next) return new Promise(() => undefined);
      if (next === 'down') throw new Error('Network request failed');
      return { ok: next.status === 200, status: next.status, json: async () => next.body };
    };
    return { fetch, urls, keys };
  }
  const wire = (e: GameEvent) => ({ ...e });

  function follow(answers: Answer[], held = 0) {
    const s = studio(answers);
    const got: number[][] = [];
    const slept: number[] = [];
    let lost = 0;
    let through = held;
    const f = followVenue({
      link: LINK,
      gameId: 'g',
      after: () => through,
      onEvents: (list) => {
        got.push(list.map((e) => e.seq));
        for (const e of list) if (e.seq === through + 1) through = e.seq;
      },
      onLost: () => lost++,
      fetch: s.fetch,
      sleep: async (ms) => void slept.push(ms),
      newSignal: () => ({ signal: { aborted: false }, abort: () => undefined }),
    });
    return { ...s, got, slept, f, lost: () => lost };
  }

  it('asks from where the game is held, with the key, and moves on as events arrive', async () => {
    const ev = events(5);
    const t = follow([{ status: 200, body: { events: [wire(ev[2]!), wire(ev[3]!)], helper: [], throughSeq: 4 } }, { status: 200, body: { events: [wire(ev[4]!)], helper: [], throughSeq: 5 } }], 2);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.urls).toEqual(['game=g&after=2&wait=20', 'game=g&after=4&wait=20', 'game=g&after=5&wait=20']);
    expect(t.keys[0]).toBe('key-1');
    expect(t.got).toEqual([[3, 4], [5]]);
    expect(t.slept).toEqual([]);
    t.f.stop();
  });

  it('drops anything that is not an event of this game, as it does the club’s broadcasts', async () => {
    const ev = events(2);
    const t = follow([{ status: 200, body: { events: [wire(ev[0]!), { nonsense: true }, { ...wire(ev[1]!), gameId: 'other' }, { ...wire(ev[1]!), stream: 'shadow:x' }], helper: 'junk' } }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.got[0]).toEqual([1]);
    t.f.stop();
  });

  it('pauses after an answer with nothing new, so a hole Studio can’t fill is never asked for in a loop', async () => {
    const ev = events(6);
    // Studio has 5 and 6 but not 4 (a break snapshot covers it): the reader moves past, and the club fills 4.
    const t = follow([{ status: 200, body: { events: [wire(ev[4]!), wire(ev[5]!)], helper: [] } }, { status: 200, body: { events: [], helper: [] } }], 3);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.urls.slice(0, 3)).toEqual(['game=g&after=3&wait=20', 'game=g&after=6&wait=20', 'game=g&after=6&wait=20']);
    expect(t.slept).toEqual([VENUE_IDLE_MS]);
    t.f.stop();
  });

  it('keeps trying when Studio is not reached or is on another game, and gives up once this phone is removed there', async () => {
    const ev = events(1);
    const t = follow(['down', { status: 404, body: { reason: 'not-followed' } }, { status: 200, body: { events: [wire(ev[0]!)], helper: [] } }, { status: 403, body: { error: 'private' } }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.slept).toEqual([VENUE_RETRY_MS, VENUE_OTHER_GAME_MS]);
    expect(t.got).toEqual([[1]]);
    expect(t.lost()).toBe(3);
    expect(t.urls).toHaveLength(4);
    // Removed in Studio's Devices: no more requests.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.urls).toHaveLength(4);
  });

  it('stops when the game screen closes, cancelling the request waiting at Studio', async () => {
    const s = studio([]);
    let aborted = 0;
    const onEvents = vi.fn();
    const f = followVenue({ link: LINK, gameId: 'g', after: () => 0, onEvents, onLost: () => undefined, fetch: s.fetch, newSignal: () => ({ signal: { aborted: false }, abort: () => void aborted++ }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.urls).toHaveLength(1);
    f.stop();
    expect(aborted).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.urls).toHaveLength(1);
    expect(onEvents).not.toHaveBeenCalled();
  });
});
