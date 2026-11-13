import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/*
 * The coach's own stars and dismissals for one game, kept on this device so
 * they survive the app restarting. Stars mark cards for the post-game report;
 * a dismissal quiets that subject for the rest of the quarter.
 */

export interface CardPrefs {
  starred: ReadonlySet<string>;
  /** Subject to the quarter it was dismissed in. */
  muted: ReadonlyMap<string, number>;
}

const key = (gameId: string) => `firstpass-vision:cards:${gameId}`;

export function useCardPrefs(gameId: string) {
  const [prefs, setPrefs] = useState<CardPrefs>({ starred: new Set(), muted: new Map() });

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key(gameId))
      .then((raw) => {
        if (cancelled || !raw) return;
        const p = JSON.parse(raw) as { starred?: string[]; muted?: [string, number][] };
        setPrefs({ starred: new Set(p.starred ?? []), muted: new Map(p.muted ?? []) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const save = useCallback(
    (next: CardPrefs) => {
      setPrefs(next);
      void AsyncStorage.setItem(key(gameId), JSON.stringify({ starred: [...next.starred], muted: [...next.muted] })).catch(() => undefined);
    },
    [gameId],
  );

  const toggleStar = useCallback(
    (id: string) => {
      const starred = new Set(prefs.starred);
      if (starred.has(id)) starred.delete(id);
      else starred.add(id);
      save({ ...prefs, starred });
    },
    [prefs, save],
  );

  const dismiss = useCallback(
    (subject: string, period: number) => {
      save({ ...prefs, muted: new Map(prefs.muted).set(subject, period) });
    },
    [prefs, save],
  );

  return { prefs, toggleStar, dismiss };
}
