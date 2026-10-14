import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { findClub, type ClubEntry } from './clubs';
import { getKv, setKv } from './db';

/*
 * One Supabase client per club, keyed by club code, so a statistician who
 * works for two clubs keeps both sign-ins on the device. The chosen club is
 * remembered in the local database.
 */

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

/** The club this device is connected to, or null until one is chosen. */
export function currentClub(): ClubEntry | null {
  if (current === undefined) current = findClub(getKv('clubCode'));
  return current;
}

/** The chosen club's client, or null when none is chosen. */
export function client(): SupabaseClient | null {
  const club = currentClub();
  return club ? clientFor(club) : null;
}

/** Connects to the club with this code and remembers it. False when no club has it. */
export function chooseClub(code: string): boolean {
  const club = findClub(code);
  if (!club) return false;
  current = club;
  setKv('clubCode', club.code);
  for (const fn of listeners) fn(club);
  return true;
}

export function leaveClub(): void {
  current = null;
  setKv('clubCode', '');
  for (const fn of listeners) fn(null);
}

export function useClub(): ClubEntry | null {
  const [club, setClub] = useState<ClubEntry | null>(() => currentClub());
  useEffect(() => {
    listeners.add(setClub);
    return () => {
      listeners.delete(setClub);
    };
  }, []);
  return club;
}
