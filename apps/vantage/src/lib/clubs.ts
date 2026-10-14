import Constants from 'expo-constants';

/*
 * Every club has its own FirstPass database (the same one FirstPass HQ uses),
 * picked by its club code. The list lives in app.json under expo.extra.clubs;
 * each anon key is public by design, since row-level security decides what it
 * can reach. With no clubs listed the app runs offline only.
 */

export interface ClubEntry {
  /** What the statistician types: capitals and digits. */
  code: string;
  name: string;
  supabaseUrl: string;
  anonKey: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as { clubs?: Partial<ClubEntry>[] };

export const clubs: readonly ClubEntry[] = (extra.clubs ?? [])
  .filter((c): c is ClubEntry => !!(c.code && c.name && c.supabaseUrl && c.anonKey))
  .map((c) => ({ ...c, code: normaliseClubCode(c.code) }));

/** Club codes ignore case and spaces. */
export function normaliseClubCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

export function findClub(code: string | null | undefined): ClubEntry | null {
  if (!code) return null;
  const wanted = normaliseClubCode(code);
  return clubs.find((c) => c.code === wanted) ?? null;
}
