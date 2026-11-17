import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { AppState } from 'react-native';
import { fetchEventsSince, followGame, loadGame, type GameListEntry } from '../lib/games';
import { client } from '../lib/supabase';
import { GameFeed } from './feed';
import { fromBroadcast } from './log';

/** Follows one game: its row, then its events as they arrive. */
export function useLiveGame(gameId: string): { game: GameListEntry | null | undefined; feed: GameFeed; gameError: string | null } {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [game, setGame] = useState<GameListEntry | null | undefined>(undefined);
  const [gameError, setGameError] = useState<string | null>(null);
  const feed = useMemo(() => new GameFeed({ gameId, fetchSince: (seq) => fetchEventsSince(gameId, seq), onChange: bump }), [gameId]);

  useEffect(() => {
    let cancelled = false;
    // Follow first, so a game opened from a link or after a reload gets its
    // events too. HQ checks again here; null means it said no.
    followGame(gameId)
      .then((id) => (id ? loadGame(gameId) : null))
      .then(
      (g) => !cancelled && setGame(g),
      (e: unknown) => !cancelled && setGameError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    const supabase = client();
    if (!supabase) return;
    feed.start();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void supabase.realtime
      .setAuth()
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        channel = supabase
          .channel(`game:${gameId}`, { config: { private: true } })
          .on('broadcast', { event: 'event' }, (msg: { payload?: unknown }) => feed.receive(fromBroadcast(msg.payload)))
          .subscribe((status) => feed.setChannelStatus(status));
      });
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void feed.refresh();
    });
    return () => {
      cancelled = true;
      feed.stop();
      appState.remove();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [feed, gameId]);

  return { game, feed, gameError };
}

/** Re-renders every `ms`, for the clock and the freshness chip. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
