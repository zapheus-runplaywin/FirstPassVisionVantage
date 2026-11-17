import type { GameEvent } from '@firstpass/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameFeed, POLL_MS, SAFETY_MS } from '../feed';
import { stream } from './fixtures';

function events(n: number): GameEvent[] {
  const s = stream();
  const out = [s.start(1)];
  for (let i = 1; i < n; i++) out.push(s.act(1, 600_000 - i * 1000, { team: 'us', action: 'Receive' }));
  return out;
}

/** A fake database holding `server`, answering reads after `afterSeq`. */
function setup(server: GameEvent[]) {
  const fetchSince = vi.fn(async (after: number) => server.filter((e) => e.seq > after));
  const onChange = vi.fn();
  const feed = new GameFeed({ gameId: 'g', fetchSince, onChange, now: () => Date.now() });
  return { feed, fetchSince, onChange };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('GameFeed', () => {
  it('reads the game so far when it starts', async () => {
    const server = events(3);
    const { feed, fetchSince } = setup(server);
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSince).toHaveBeenCalledWith(0, {});
    expect(feed.log.events).toHaveLength(3);
    expect(feed.lastEventAt).toBe(Date.now());
    feed.stop();
  });

  it('adds broadcast events without reading when nothing is missing', async () => {
    const server = events(4);
    const { feed, fetchSince } = setup(server.slice(0, 2));
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    feed.setChannelStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    fetchSince.mockClear();
    feed.receive(server[2]!);
    feed.receive(server[3]!);
    expect(feed.log.events).toHaveLength(4);
    expect(fetchSince).not.toHaveBeenCalled();
    feed.stop();
  });

  it('reads the missing events straight away when a broadcast leaves a hole', async () => {
    const server = events(5);
    const { feed, fetchSince } = setup(server.slice(0, 2));
    feed.start();
    feed.setChannelStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    fetchSince.mockImplementation(async (after: number) => server.filter((e) => e.seq > after));
    fetchSince.mockClear();
    feed.receive(server[4]!); // seq 5 arrives, 3 and 4 were missed
    expect(feed.log.events).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSince).toHaveBeenCalledWith(2, {});
    expect(feed.log.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    feed.stop();
  });

  it('checks every few seconds while live updates are not joined', async () => {
    const { feed, fetchSince } = setup(events(1));
    feed.start();
    feed.setChannelStatus('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(0);
    fetchSince.mockClear();
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(fetchSince.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(feed.connection).toBe('polling');
    feed.stop();
  });

  it('reads only as a safety net while live updates are joined', async () => {
    const { feed, fetchSince } = setup(events(1));
    feed.start();
    feed.setChannelStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    fetchSince.mockClear();
    await vi.advanceTimersByTimeAsync(SAFETY_MS - 2000);
    expect(fetchSince).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchSince).toHaveBeenCalledTimes(1);
    feed.stop();
  });

  it('catches up whenever the channel joins again', async () => {
    const server = events(2);
    const { feed, fetchSince } = setup(server);
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    feed.setChannelStatus('TIMED_OUT');
    server.push(...events(4).slice(2));
    fetchSince.mockClear();
    feed.setChannelStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSince).toHaveBeenCalledWith(2, {});
    expect(feed.log.events).toHaveLength(4);
    expect(feed.connection).toBe('live');
    feed.stop();
  });

  it('runs one read at a time and repeats once if asked during a read', async () => {
    let release: (() => void) | null = null;
    const fetchSince = vi.fn(() => new Promise<GameEvent[]>((r) => (release = () => r([]))));
    const feed = new GameFeed({ gameId: 'g', fetchSince, onChange: () => undefined });
    void feed.refresh();
    void feed.refresh();
    void feed.refresh();
    expect(fetchSince).toHaveBeenCalledTimes(1);
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSince).toHaveBeenCalledTimes(2);
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSince).toHaveBeenCalledTimes(2);
  });

  it('keeps what it has and reports the error when a read fails, then clears it', async () => {
    const server = events(2);
    const { feed, fetchSince } = setup(server);
    await feed.refresh();
    fetchSince.mockRejectedValueOnce(new Error('network down'));
    await feed.refresh();
    expect(feed.error).toBe('network down');
    expect(feed.log.events).toHaveLength(2);
    await feed.refresh();
    expect(feed.error).toBeNull();
  });

  it('records when the last good read was, even with nothing new', async () => {
    const { feed } = setup(events(1));
    await feed.refresh();
    vi.advanceTimersByTime(10_000);
    await feed.refresh();
    expect(feed.lastReadAt).toBe(Date.now());
    expect(feed.lastEventAt).toBe(Date.now() - 10_000);
  });

  it('does nothing after it stops', async () => {
    const { feed, fetchSince, onChange } = setup(events(2));
    feed.start();
    feed.stop();
    await vi.advanceTimersByTimeAsync(0);
    onChange.mockClear();
    fetchSince.mockClear();
    feed.receive(events(2)[1]!);
    await vi.advanceTimersByTimeAsync(SAFETY_MS * 2);
    expect(fetchSince).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reads a helper statistician's changes and asks only for what it lacks next time", async () => {
    const server = events(3);
    const helper = (seq: number, target: string): GameEvent =>
      ({ id: `h${seq}`, gameId: 'g', stream: 'helper:hana', seq, type: 'correction', payload: { target, op: 'delete' }, recordedAt: '2026-11-13T09:05:00Z' }) as GameEvent;
    const held: GameEvent[] = [...server, helper(1, 'e3')];
    const fetchSince = vi.fn(async (after: number, cursors: Record<string, number>) =>
      held.filter((e) => (e.stream === 'primary' ? e.seq > after : e.seq > (cursors[e.stream] ?? 0))),
    );
    const feed = new GameFeed({ gameId: 'g', fetchSince, onChange: vi.fn(), now: () => Date.now() });
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(feed.log.events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'h1']);

    held.push(helper(2, 'e2'));
    await feed.refresh();
    expect(fetchSince).toHaveBeenLastCalledWith(3, { 'helper:hana': 1 });
    expect(feed.log.events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'h1', 'h2']);
    feed.stop();
  });

  it("asks again straight away when a helper's broadcast leaves a hole", async () => {
    const server = events(2);
    const h = (seq: number): GameEvent =>
      ({ id: `h${seq}`, gameId: 'g', stream: 'helper:hana', seq, type: 'correction', payload: { target: 'e2', op: 'delete' }, recordedAt: '2026-11-13T09:05:00Z' }) as GameEvent;
    const held: GameEvent[] = [...server];
    const fetchSince = vi.fn(async (after: number, cursors: Record<string, number>) =>
      held.filter((e) => (e.stream === 'primary' ? e.seq > after : e.seq > (cursors[e.stream] ?? 0))),
    );
    const feed = new GameFeed({ gameId: 'g', fetchSince, onChange: vi.fn(), now: () => Date.now() });
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    const reads = fetchSince.mock.calls.length;
    // The helper's first change was missed; the second arrives by broadcast.
    held.push(h(1), h(2));
    feed.receive(h(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSince.mock.calls.length).toBe(reads + 1);
    expect(feed.log.events.map((e) => e.id)).toEqual(['e1', 'e2', 'h1', 'h2']);
    feed.stop();
  });
});
