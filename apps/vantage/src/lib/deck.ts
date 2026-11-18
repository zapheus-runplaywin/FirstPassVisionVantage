import { useEffect, useRef, useState } from 'react';
import type { DeckKey } from '../game/deck';
import { getKv, setKv } from './db';

/**
 * The link to the Stream Deck plugin (plugins/vantage-deck).
 *
 * The plugin runs inside the Stream Deck app on a Mac and listens on this
 * computer only. Vantage, running on the same Mac, connects to it, tells it
 * what the 32 keys say whenever that changes, and hears which key was pressed.
 * Nothing leaves the computer, and the plugin holds nothing about the game
 * beyond the labels on the keys.
 */
export const DECK_URL = 'ws://127.0.0.1:38427';
export const DECK_PROTOCOL = 1;
/** How long to wait before looking for the plugin again. */
export const DECK_RETRY_MS = 4000;

/** 'off': not in use. 'looking': no plugin answering yet. 'connected': the keys are live. */
export type DeckStatus = 'off' | 'looking' | 'connected';

/** The part of a WebSocket this file uses, so tests can stand in for it. */
export interface DeckSocket {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface DeckLink {
  /** Sets what the keys say. Sent now if connected, and again after every reconnect. */
  show(keys: readonly DeckKey[]): void;
  close(): void;
}

export function connectDeck(opts: {
  onPress: (id: string) => void;
  onStatus: (status: DeckStatus) => void;
  open?: (url: string) => DeckSocket;
  url?: string;
  retryMs?: number;
}): DeckLink {
  const open = opts.open ?? ((url: string) => new WebSocket(url) as unknown as DeckSocket);
  const retryMs = opts.retryMs ?? DECK_RETRY_MS;
  let socket: DeckSocket | null = null;
  let live = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let keys: readonly DeckKey[] | null = null;
  let sent = '';

  const push = () => {
    if (!live || !socket || !keys) return;
    const text = JSON.stringify({ v: DECK_PROTOCOL, type: 'keys', keys });
    if (text === sent) return;
    sent = text;
    socket.send(text);
  };

  const dial = () => {
    if (closed) return;
    let s: DeckSocket;
    try {
      s = open(opts.url ?? DECK_URL);
    } catch {
      timer = setTimeout(dial, retryMs);
      return;
    }
    socket = s;
    s.onopen = () => {
      if (closed || socket !== s) return;
      live = true;
      sent = '';
      opts.onStatus('connected');
      push();
    };
    s.onmessage = (ev) => {
      if (closed || socket !== s || typeof ev.data !== 'string') return;
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (typeof msg !== 'object' || msg === null) return;
      const m = msg as { type?: unknown; id?: unknown };
      if (m.type === 'press' && typeof m.id === 'string') opts.onPress(m.id);
    };
    const lost = () => {
      if (closed || socket !== s) return;
      socket = null;
      live = false;
      opts.onStatus('looking');
      timer = setTimeout(dial, retryMs);
    };
    s.onclose = lost;
    s.onerror = () => {
      // An error is followed by a close on most platforms, but not all: close it ourselves and carry on.
      try {
        s.close();
      } catch {
        // already closed
      }
      lost();
    };
  };

  opts.onStatus('looking');
  dial();

  return {
    show(next) {
      keys = next;
      push();
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      const s = socket;
      socket = null;
      live = false;
      try {
        s?.close();
      } catch {
        // already closed
      }
    },
  };
}

const DECK_KV = 'streamDeck';

/** Whether this device uses Stream Deck keys. Off unless someone turned it on (Home). */
export function deckWanted(): boolean {
  return getKv(DECK_KV) === '1';
}

export function setDeckWanted(on: boolean): void {
  setKv(DECK_KV, on ? '1' : '0');
}

/**
 * Keeps the Stream Deck showing `keys` while `enabled`, and calls `onPress`
 * with the id of each key pressed.
 */
export function useDeck(enabled: boolean, keys: readonly DeckKey[], onPress: (id: string) => void): DeckStatus {
  const [status, setStatus] = useState<DeckStatus>('off');
  const link = useRef<DeckLink | null>(null);
  const press = useRef(onPress);
  press.current = onPress;
  const latest = useRef(keys);
  latest.current = keys;

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    const l = connectDeck({ onPress: (id) => press.current(id), onStatus: setStatus });
    link.current = l;
    l.show(latest.current);
    return () => {
      link.current = null;
      l.close();
    };
  }, [enabled]);

  useEffect(() => {
    link.current?.show(keys);
  }, [keys]);

  return status;
}
