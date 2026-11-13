import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import { maybeCompleteAuthSession, openAuthSessionAsync } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { client, useClub } from './supabase';

maybeCompleteAuthSession();

/**
 * Google sign-in through the club's Supabase Auth, in the system browser,
 * back to the app by its scheme (firstpass-vision://auth-callback, which must
 * be in the club project's allowed redirect URLs).
 */
export async function signInWithGoogle(): Promise<void> {
  const supabase = client();
  if (!supabase) throw new Error('Choose your club first');
  const redirectTo = makeRedirectUri({ path: 'auth-callback' });
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
  await client()?.auth.signOut();
}

/** The chosen club's session: undefined while loading, null when signed out. */
export function useSession(): Session | null | undefined {
  const club = useClub();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (club === undefined) return;
    const supabase = client();
    if (!supabase) {
      setSession(null);
      return;
    }
    setSession(undefined);
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [club]);
  return session;
}
