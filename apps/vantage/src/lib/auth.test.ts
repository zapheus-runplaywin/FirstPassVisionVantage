import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The setup screen's role check: a member without the role, a network
 * failure and a refusal from HQ each get their own message, instead of
 * every failure reading as "no Statistician role".
 */

const rpc = vi.hoisted(() => vi.fn());
const teams = vi.hoisted(() => ({ result: { data: [{ id: 't1', name: 'Open A' }] as unknown, error: null as unknown } }));

function query() {
  const q = { select: () => q, eq: () => q, order: () => q, then: (ok: (r: unknown) => unknown) => Promise.resolve(teams.result).then(ok) };
  return q;
}

const authSignOut = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ client: () => ({ rpc, from: query, auth: { signOut: authSignOut } }), useClub: () => null }));
vi.mock('expo-auth-session', () => ({ makeRedirectUri: () => '' }));
vi.mock('expo-web-browser', () => ({ openAuthSessionAsync: vi.fn() }));

const { loadRecorder, recorderMessage, signOut } = await import('./auth');

describe('signOut', () => {
  it('signs out on this device only, never out of HQ or Vision', async () => {
    await signOut();
    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

beforeEach(() => {
  rpc.mockReset();
  teams.result = { data: [{ id: 't1', name: 'Open A' }], error: null };
});

describe('loadRecorder', () => {
  it('gives a statistician their teams', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await loadRecorder()).toEqual({ kind: 'recorder', teams: [{ id: 't1', name: 'Open A' }] });
  });

  it('says "no role" only when HQ answers false', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await loadRecorder()).toEqual({ kind: 'no role' });
  });

  it('says "unreachable" when the check gets no answer', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });
    expect(await loadRecorder()).toEqual({ kind: 'unreachable' });
  });

  it('passes on HQ\'s refusal in its own words', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for function is_statistician' } });
    expect(await loadRecorder()).toEqual({ kind: 'refused', message: 'permission denied for function is_statistician' });
  });

  it('says "unreachable" when the role check worked but the teams did not load', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    teams.result = { data: null, error: { code: '', message: 'TypeError: Network request failed' } };
    expect(await loadRecorder()).toEqual({ kind: 'unreachable' });
  });
});

describe('recorderMessage', () => {
  it('says nothing for a statistician', () => {
    expect(recorderMessage({ kind: 'recorder', teams: [] })).toBeNull();
  });

  it('keeps the missing-role message for a missing role only', () => {
    expect(recorderMessage({ kind: 'no role' })).toMatch(/not given you the Statistician role/);
    expect(recorderMessage({ kind: 'unreachable' })).not.toMatch(/Statistician role/);
    expect(recorderMessage({ kind: 'refused', message: 'x' })).not.toMatch(/not given you/);
  });

  it('tells a network failure to check the connection', () => {
    expect(recorderMessage({ kind: 'unreachable' })).toMatch(/Couldn't reach your club/);
  });

  it('shows HQ\'s reason without doubling its full stop', () => {
    expect(recorderMessage({ kind: 'refused', message: 'You have been stood down.' })).toBe(
      'Your club refused: You have been stood down. This game stays on the tablet.',
    );
  });
});
