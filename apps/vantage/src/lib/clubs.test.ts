import { describe, expect, it, vi } from 'vitest';
import vantageApp from '../../app.json';
import visionApp from '../../../vision/app.json';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { clubs: [{ code: 'wct 1', name: 'West Coast Thunder', supabaseUrl: 'https://x.supabase.co', anonKey: 'k' }] } } },
}));

const { clubs, findClub, normaliseClubCode, parseClubs } = await import('./clubs');

/** The payload of a Supabase key, to check which role it signs in as. */
function keyRole(key: string): unknown {
  const { atob } = globalThis as unknown as { atob: (s: string) => string };
  return JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role;
}

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
  const raw = (vantageApp.expo as { extra?: { clubs?: unknown[] } }).extra?.clubs ?? [];
  const parsed = parseClubs(raw);

  // Without a list the club code box never shows, so a build cannot sign in.
  it('list at least one club, all complete, including West Coast Thunder', () => {
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed).toHaveLength(raw.length);
    expect(findClub('thunder', parsed)?.supabaseUrl).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
  });

  it('hold only public anon keys, never a service key', () => {
    for (const c of parsed) expect(keyRole(c.anonKey)).toBe('anon');
  });

  it('match the clubs Vision lists, so the statistician and the coach reach the same database', () => {
    expect(parsed).toEqual(parseClubs(visionApp.expo.extra.clubs));
  });
});
