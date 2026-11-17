import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import { maybeCompleteAuthSession, openAuthSessionAsync } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { client, useClub } from './supabase';
import { callbackUrl, rememberNext, signOutHere, type KeyValueStore } from './webAuth';

maybeCompleteAuthSession();

/** The browser's per-tab storage, or null outside a browser. */
export function tabStorage(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Google sign-in through the club's Supabase Auth.
 *
 * In the phone app: in the system browser, back to the app by its scheme
 * (firstpass-vision://auth-callback). On the web: the whole page goes to
 * Google and comes back to <this site>/auth-callback, where the auth-callback
 * screen finishes it and opens `next`. Each address must be in the club
 * project's allowed redirect URLs.
 */
export async function signInWithGoogle(next = '/'): Promise<void> {
  const supabase = client();
  if (!supabase) throw new Error('Choose your club first');
  if (Platform.OS === 'web') {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(window.location.origin), skipBrowserRedirect: true },
    });
    if (error) throw error;
    rememberNext(tabStorage(), next);
    window.location.assign(data.url);
    return;
  }
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

/** Signs out on this device only (see signOutHere). */
export async function signOut(): Promise<void> {
  const supabase = client();
  if (supabase) await signOutHere(supabase.auth);
  if (Platform.OS === 'web') {
    // A fresh load of the start page drops everything this page held in memory.
    window.location.replace('/');
  }
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
