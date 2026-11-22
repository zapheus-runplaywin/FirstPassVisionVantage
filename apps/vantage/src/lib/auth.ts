import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { classify } from './errors';
import { client, useClub } from './supabase';

/** Google sign-in through the club's Supabase Auth, in the system browser, back to the app by its scheme. */
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

/**
 * Signs out on this device only. HQ and Vision use the same accounts, and
 * Supabase's default ("global") would sign the person out of those too.
 */
export async function signOut(): Promise<void> {
  await client()?.auth.signOut({ scope: 'local' });
}

/** The chosen club's session, kept in step with sign-in, token refresh and club changes. */
export function useSession(): Session | null | undefined {
  const club = useClub();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
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

export interface TeamEntry {
  id: string;
  name: string;
}

export interface FixtureEntry {
  id: string;
  teamId: string;
  opponent: string | null;
  startsAt: string;
  timeTbc: boolean;
  roundName: string | null;
}

export interface Athlete {
  profileId: string;
  name: string;
}

/** Whether the signed-in member may record, and if not, why not. */
export type RecorderCheck =
  | { kind: 'recorder'; teams: TeamEntry[] }
  /** HQ answered: this member has no Statistician (or Admin) role. */
  | { kind: 'no role' }
  /** No answer from the club, so we don't know yet. */
  | { kind: 'unreachable' }
  /** HQ refused the check itself, in its own words. */
  | { kind: 'refused'; message: string };

/** What the signed-in member may record: nothing unless they are a statistician or admin. */
export async function loadRecorder(): Promise<RecorderCheck> {
  const supabase = client();
  if (!supabase) return { kind: 'no role' };
  const allowed = await supabase.rpc('is_statistician');
  if (allowed.error) return classify(allowed.error);
  if (allowed.data !== true) return { kind: 'no role' };
  const teams = await supabase.from('teams').select('id, name').eq('archived', false).order('season', { ascending: false }).order('sort_order');
  if (teams.error) return classify(teams.error);
  return { kind: 'recorder', teams: (teams.data ?? []) as TeamEntry[] };
}

/** What the setup screen says about recording for the club, or null when all is well. */
export function recorderMessage(check: RecorderCheck): string | null {
  switch (check.kind) {
    case 'recorder':
      return null;
    case 'no role':
      return 'Your club has not given you the Statistician role yet, so this game stays on the tablet.';
    case 'unreachable':
      return "Couldn't reach your club to check your role. Check the tablet's connection and try again. You can still record on the tablet.";
    case 'refused':
      return `Your club refused: ${check.message.replace(/[.\s]+$/, '')}. This game stays on the tablet.`;
  }
}

/** The team's PlayHQ games from yesterday on, soonest first. */
export async function loadFixtures(teamId: string): Promise<FixtureEntry[]> {
  const supabase = client();
  if (!supabase) return [];
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const res = await supabase
    .from('fixtures')
    .select('id, team_id, opponent, starts_at, time_tbc, round_name')
    .eq('team_id', teamId)
    .not('status', 'eq', 'BYE')
    .gte('starts_at', since)
    .order('starts_at')
    .limit(6);
  if (res.error) throw res.error;
  type Row = { id: string; team_id: string; opponent: string | null; starts_at: string; time_tbc: boolean; round_name: string | null };
  return ((res.data ?? []) as Row[]).map((r) => ({ id: r.id, teamId: r.team_id, opponent: r.opponent, startsAt: r.starts_at, timeTbc: r.time_tbc, roundName: r.round_name }));
}

/** This season's athletes in the team, final team first. */
export async function loadAthletes(teamId: string): Promise<Athlete[]> {
  const supabase = client();
  if (!supabase) return [];
  const res = await supabase.rpc('game_lineup', { p_team_id: teamId });
  if (res.error) throw res.error;
  return ((res.data ?? []) as { profile_id: string; name: string }[]).map((r) => ({ profileId: r.profile_id, name: r.name }));
}
