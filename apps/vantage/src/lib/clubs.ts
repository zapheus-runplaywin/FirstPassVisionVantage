import Constants from 'expo-constants';

/*
 * Every club has its own FirstPass database (the same one FirstPass HQ uses),
 * picked by its club code. The list lives in app.json under expo.extra.clubs;
 * each anon key is public by design, since row-level security decides what it
 * can reach. With no clubs listed the app runs offline only and never offers
 * a club code or sign-in.
 *
 * Vision has the same list and lookup (apps/vision/src/lib/clubs.ts). The
 * two copies merge into a shared package after the pilot.
 */

export interface ClubEntry {
  /** What the statistician types: capitals and digits. */
  code: string;
  name: string;
  supabaseUrl: string;
  anonKey: string;
}

/** Club codes ignore case and spaces. */
export function normaliseClubCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

export function parseClubs(raw: unknown): ClubEntry[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<ClubEntry>[])
    .filter((c): c is ClubEntry => !!(c && c.code && c.name && c.supabaseUrl && c.anonKey))
    .map((c) => ({ code: normaliseClubCode(c.code), name: c.name, supabaseUrl: c.supabaseUrl, anonKey: c.anonKey }));
}

export const clubs: readonly ClubEntry[] = parseClubs((Constants.expoConfig?.extra as { clubs?: unknown } | undefined)?.clubs);

export function findClub(code: string | null | undefined, list: readonly ClubEntry[] = clubs): ClubEntry | null {
  if (!code) return null;
  const wanted = normaliseClubCode(code);
  return list.find((c) => c.code === wanted) ?? null;
}
