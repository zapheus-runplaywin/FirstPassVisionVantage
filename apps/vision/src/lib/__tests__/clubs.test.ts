import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { clubs: [{ code: 'wct 1', name: 'West Coast Thunder', supabaseUrl: 'https://x.supabase.co', anonKey: 'k' }] } } },
}));

const { clubs, findClub, normaliseClubCode, parseClubs } = await import('../clubs');

describe('clubs', () => {
  it('reads the clubs listed in app.json', () => {
    expect(clubs).toEqual([{ code: 'WCT1', name: 'West Coast Thunder', supabaseUrl: 'https://x.supabase.co', anonKey: 'k' }]);
  });

  it('finds a club whatever the case and spacing typed', () => {
    expect(findClub(' w c t 1 ')?.name).toBe('West Coast Thunder');
    expect(findClub('nope')).toBeNull();
    expect(findClub(null)).toBeNull();
    expect(findClub('')).toBeNull();
  });

  it('skips entries missing anything the app needs', () => {
    expect(parseClubs([{ code: 'A', name: 'A', supabaseUrl: 'u' }, null, { code: 'b', name: 'B', supabaseUrl: 'u', anonKey: 'k' }])).toEqual([
      { code: 'B', name: 'B', supabaseUrl: 'u', anonKey: 'k' },
    ]);
    expect(parseClubs(undefined)).toEqual([]);
    expect(parseClubs({})).toEqual([]);
  });

  it('normalises codes', () => {
    expect(normaliseClubCode(' ab c\t1 ')).toBe('ABC1');
  });
});

describe('the clubs in app.json', () => {
  it('are all complete, so none is silently dropped, and include West Coast Thunder', async () => {
    const raw = (await import('../../../app.json')).default.expo.extra.clubs as unknown[];
    const parsed = parseClubs(raw);
    expect(parsed).toHaveLength(raw.length);
    expect(findClub('thunder', parsed)?.supabaseUrl).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    // Only the public anon key belongs here, never a service key.
    const { atob } = globalThis as unknown as { atob: (s: string) => string };
    for (const c of parsed) expect(JSON.parse(atob(c.anonKey.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role).toBe('anon');
  });
});
