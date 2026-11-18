import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => {
  const kv = new Map<string, string>();
  return { getKv: (k: string) => kv.get(k) ?? null, setKv: (k: string, v: string) => void kv.set(k, v) };
});

import type { DeckKey } from '../game/deck';
import { connectDeck, DECK_URL, deckWanted, setDeckWanted, type DeckSocket, type DeckStatus } from './deck';

class FakeSocket implements DeckSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  say(msg: unknown) {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
}

const keys = (title: string): DeckKey[] => [{ id: 'undo', title, look: 'plain' }];

function setup() {
  const sockets: FakeSocket[] = [];
  const presses: string[] = [];
  const statuses: DeckStatus[] = [];
  const link = connectDeck({
    onPress: (id) => presses.push(id),
    onStatus: (s) => statuses.push(s),
    open: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    retryMs: 1000,
  });
  return { sockets, presses, statuses, link };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('connectDeck', () => {
  it('connects to this computer only', () => {
    const { sockets } = setup();
    expect(sockets.map((s) => s.url)).toEqual([DECK_URL]);
    expect(new URL(DECK_URL).hostname).toBe('127.0.0.1');
  });

  it('sends the keys once connected, and again only when they change', () => {
    const { sockets, statuses, link } = setup();
    link.show(keys('Undo'));
    expect(sockets[0]?.sent).toEqual([]);
    sockets[0]?.onopen?.();
    expect(statuses).toEqual(['looking', 'connected']);
    expect(sockets[0]?.sent.map((t) => JSON.parse(t))).toEqual([{ v: 1, type: 'keys', keys: keys('Undo') }]);
    link.show(keys('Undo'));
    expect(sockets[0]?.sent).toHaveLength(1);
    link.show(keys('Undo last'));
    expect(sockets[0]?.sent).toHaveLength(2);
  });

  it('passes on key presses, and ignores anything else it is sent', () => {
    const { sockets, presses } = setup();
    sockets[0]?.onopen?.();
    sockets[0]?.say({ v: 1, type: 'press', id: 'pick:us:GS' });
    sockets[0]?.say({ v: 1, type: 'hello' });
    sockets[0]?.say({ type: 'press', id: 7 });
    sockets[0]?.say('not json');
    sockets[0]?.say('null');
    sockets[0]?.onmessage?.({ data: new ArrayBuffer(4) });
    expect(presses).toEqual(['pick:us:GS']);
  });

  it('keeps looking when the plugin is not there, and shows the keys when it appears', () => {
    const { sockets, statuses, link } = setup();
    link.show(keys('Undo'));
    sockets[0]?.onerror?.();
    expect(sockets[0]?.closed).toBe(true);
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1]?.onopen?.();
    expect(sockets[1]?.sent).toHaveLength(1);
    expect(statuses).toEqual(['looking', 'looking', 'connected']);
  });

  it('reconnects after the Stream Deck app quits, and sends the keys again', () => {
    const { sockets, statuses, link } = setup();
    link.show(keys('Undo'));
    sockets[0]?.onopen?.();
    sockets[0]?.onclose?.();
    expect(statuses.at(-1)).toBe('looking');
    vi.advanceTimersByTime(1000);
    sockets[1]?.onopen?.();
    expect(sockets[1]?.sent).toHaveLength(1);
    // An error followed by a close counts once.
    sockets[1]?.onerror?.();
    sockets[1]?.onclose?.();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(3);
  });

  it('stops for good when closed', () => {
    const { sockets, presses, link } = setup();
    sockets[0]?.onopen?.();
    link.close();
    expect(sockets[0]?.closed).toBe(true);
    sockets[0]?.say({ type: 'press', id: 'undo' });
    sockets[0]?.onclose?.();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(presses).toEqual([]);
    link.show(keys('late'));
    expect(sockets[0]?.sent).toEqual([]);
  });

  it('tries again when a socket cannot even be made', () => {
    let tries = 0;
    const link = connectDeck({
      onPress: () => {},
      onStatus: () => {},
      open: () => {
        tries++;
        throw new Error('blocked');
      },
      retryMs: 1000,
    });
    vi.advanceTimersByTime(2000);
    expect(tries).toBe(3);
    link.close();
  });
});

describe('the Stream Deck setting', () => {
  it('is off until someone turns it on', () => {
    expect(deckWanted()).toBe(false);
    setDeckWanted(true);
    expect(deckWanted()).toBe(true);
    setDeckWanted(false);
    expect(deckWanted()).toBe(false);
  });
});
