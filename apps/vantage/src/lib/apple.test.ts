import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Sign in with Apple: offered only where Apple offers it, the one-time value
 * goes to Apple hashed and to the club unhashed, closing Apple's sheet is not
 * an error, and nobody is signed in without Apple's token.
 */

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const apple = vi.hoisted(() => ({ isAvailableAsync: vi.fn(), signInAsync: vi.fn() }));
const auth = vi.hoisted(() => ({ signInWithIdToken: vi.fn(), updateUser: vi.fn() }));
const club = vi.hoisted(() => ({ chosen: true }));

vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-apple-authentication', () => ({ ...apple, AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 } }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: () => 'one-time-value',
  digestStringAsync: async (_algorithm: string, value: string) => `hash(${value})`,
}));
vi.mock('./supabase', () => ({ client: () => (club.chosen ? { auth } : null) }));

const { appleFullName, appleSignInAvailable, signInWithApple } = await import('./apple');

beforeEach(() => {
  platform.OS = 'ios';
  club.chosen = true;
  apple.isAvailableAsync.mockReset().mockResolvedValue(true);
  apple.signInAsync.mockReset().mockResolvedValue({ identityToken: 'token', fullName: null });
  auth.signInWithIdToken.mockReset().mockResolvedValue({ error: null });
  auth.updateUser.mockReset().mockResolvedValue({ error: null });
});

describe('appleSignInAvailable', () => {
  it('is offered on an iPhone, iPad or Mac where Apple offers it', async () => {
    expect(await appleSignInAvailable()).toBe(true);
  });

  it.each(['android', 'web'])('is never offered on %s, and Apple is not asked', async (os) => {
    platform.OS = os;
    expect(await appleSignInAvailable()).toBe(false);
    expect(apple.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('is not offered when Apple says no or cannot say', async () => {
    apple.isAvailableAsync.mockResolvedValue(false);
    expect(await appleSignInAvailable()).toBe(false);
    apple.isAvailableAsync.mockRejectedValue(new Error('no'));
    expect(await appleSignInAvailable()).toBe(false);
  });
});

describe('signInWithApple', () => {
  it('sends Apple the hashed one-time value and the club the token with the unhashed one', async () => {
    await signInWithApple();
    expect(apple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: 'hash(one-time-value)' });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'token', nonce: 'one-time-value' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('needs a club first', async () => {
    club.chosen = false;
    await expect(signInWithApple()).rejects.toThrow('Choose your club first');
    expect(apple.signInAsync).not.toHaveBeenCalled();
  });

  it('treats closing Apple\'s sheet as a change of mind, not an error', async () => {
    apple.signInAsync.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }));
    await expect(signInWithApple()).resolves.toBeUndefined();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('passes on any other failure from Apple', async () => {
    apple.signInAsync.mockRejectedValue(Object.assign(new Error('Apple is down'), { code: 'ERR_REQUEST_FAILED' }));
    await expect(signInWithApple()).rejects.toThrow('Apple is down');
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('signs nobody in without a token from Apple', async () => {
    apple.signInAsync.mockResolvedValue({ identityToken: null, fullName: null });
    await expect(signInWithApple()).rejects.toThrow("Apple didn't return a sign-in");
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('passes on the club\'s refusal and saves no name', async () => {
    auth.signInWithIdToken.mockResolvedValue({ error: new Error('Unacceptable audience in id_token') });
    apple.signInAsync.mockResolvedValue({ identityToken: 'token', fullName: { givenName: 'Sam', familyName: 'Lee' } });
    await expect(signInWithApple()).rejects.toThrow('Unacceptable audience');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('keeps the name Apple gives on the first sign-in, and a failed save does not stop the sign-in', async () => {
    apple.signInAsync.mockResolvedValue({ identityToken: 'token', fullName: { givenName: ' Sam ', middleName: null, familyName: 'Lee' } });
    auth.updateUser.mockRejectedValue(new Error('offline'));
    await expect(signInWithApple()).resolves.toBeUndefined();
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { full_name: 'Sam Lee' } });
  });
});

describe('appleFullName', () => {
  it('joins the parts Apple sent and is null when there are none', () => {
    expect(appleFullName({ givenName: 'Sam', middleName: 'J', familyName: 'Lee' })).toBe('Sam J Lee');
    expect(appleFullName({ givenName: '  ', familyName: null })).toBeNull();
    expect(appleFullName(null)).toBeNull();
  });
});
