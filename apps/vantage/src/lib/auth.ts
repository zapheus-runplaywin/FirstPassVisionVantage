import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Google sign-in through Supabase Auth, in the system browser, back to the app by its scheme. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Sync is not configured');
  const redirectTo = makeRedirectUri({ path: 'auth' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('Sign-in did not return a code');
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) throw exchanged.error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** The current session, kept in step with sign-in and token refresh. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export interface Membership {
  clubId: string;
  clubName: string;
  role: 'club_admin' | 'statistician' | 'coach';
  teams: { id: string; name: string }[];
}

/** The clubs the signed-in user may record for, with their teams. */
export async function loadMemberships(): Promise<Membership[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('club_members')
    .select('club_id, role, clubs(name, teams(id, name))')
    .in('role', ['statistician', 'club_admin']);
  if (error) throw error;
  type Row = { club_id: string; role: Membership['role']; clubs: { name: string; teams: { id: string; name: string }[] } | null };
  return (data as unknown as Row[]).map((r) => ({ clubId: r.club_id, clubName: r.clubs?.name ?? 'Club', role: r.role, teams: r.clubs?.teams ?? [] }));
}
