import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { findClub, type ClubEntry } from './clubs';

/*
 * One Supabase client per club, keyed by club code, so a coach who works for
 * two clubs keeps both sign-ins. The chosen club is remembered on the device.
 */

const CLUB_KEY = 'firstpass-vision:club';
const clients = new Map<string, SupabaseClient>();
const listeners = new Set<(club: ClubEntry | null) => void>();
let current: ClubEntry | null | undefined;

export function clientFor(club: ClubEntry): SupabaseClient {
  let c = clients.get(club.code);
  if (!c) {
    c = createClient(club.supabaseUrl, club.anonKey, {
      auth: {
        storage: AsyncStorage,
        storageKey: `sb-${club.code.toLowerCase()}-auth`,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
    clients.set(club.code, c);
  }
  return c;
}

function publish(club: ClubEntry | null): void {
  current = club;
  for (const fn of listeners) fn(club);
}

/** Reads the remembered club once at start-up. */
export async function loadClub(): Promise<ClubEntry | null> {
  if (current !== undefined) return current;
  let code: string | null = null;
  try {
    code = await AsyncStorage.getItem(CLUB_KEY);
  } catch {
    code = null;
  }
  publish(findClub(code));
  return current ?? null;
}

/** The chosen club's client, or null when none is chosen. */
export function client(): SupabaseClient | null {
  return current ? clientFor(current) : null;
}

/** Connects to the club with this code and remembers it. False when no club has it. */
export async function chooseClub(code: string): Promise<boolean> {
  const club = findClub(code);
  if (!club) return false;
  await AsyncStorage.setItem(CLUB_KEY, club.code).catch(() => undefined);
  publish(club);
  return true;
}

export async function leaveClub(): Promise<void> {
  await AsyncStorage.removeItem(CLUB_KEY).catch(() => undefined);
  publish(null);
}

/** The chosen club: undefined while loading, null when none is chosen. */
export function useClub(): ClubEntry | null | undefined {
  const [club, setClub] = useState<ClubEntry | null | undefined>(current);
  useEffect(() => {
    listeners.add(setClub);
    if (current === undefined) void loadClub();
    else setClub(current);
    return () => {
      listeners.delete(setClub);
    };
  }, []);
  return club;
}
