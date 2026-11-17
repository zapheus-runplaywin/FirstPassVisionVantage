import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALLBACK_PATH,
  MESSAGES,
  callbackUrl,
  completeWebSignIn,
  exchangeOnce,
  forgetSwaps,
  readCallback,
  rememberNext,
  safeNext,
  shortReason,
  signOutHere,
  SIGN_OUT_OPTIONS,
  takeNext,
  type KeyValueStore,
} from '../webAuth';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

beforeEach(() => forgetSwaps());

describe('callbackUrl', () => {
  it('is the site address plus /auth-callback', () => {
    expect(callbackUrl('https://firstpass-vision.expo.app')).toBe('https://firstpass-vision.expo.app/auth-callback');
    expect(callbackUrl('http://localhost:8081/')).toBe('http://localhost:8081/auth-callback');
    expect(CALLBACK_PATH).toBe('/auth-callback');
  });
});

describe('safeNext', () => {
  it.each(['/', '/game/123', '/game/abc-def?tab=court'])('keeps a page on this site: %s', (p) => {
    expect(safeNext(p)).toBe(p);
  });

  it.each([
    'https://evil.example/game/1',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'game/1',
    '/game/1 x',
    '/auth-callback',
    '/auth-callback?code=abc',
    '',
    undefined,
    null,
    42,
    ['/game/1'],
  ])('falls back to the games list for %s', (p) => {
    expect(safeNext(p)).toBe('/');
  });
});

describe('readCallback', () => {
  it('finds the code', () => {
    expect(readCallback('?code=abc123')).toEqual({ kind: 'code', code: 'abc123' });
    expect(readCallback('code=abc123&state=x')).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('prefers an error, with its description', () => {
    expect(readCallback('?error=access_denied&error_description=User+cancelled&code=x')).toEqual({
      kind: 'error',
      message: 'User cancelled',
    });
    expect(readCallback('?error=server_error')).toEqual({ kind: 'error', message: 'server_error' });
  });

  it('notices when there is nothing', () => {
    expect(readCallback('')).toEqual({ kind: 'none' });
    expect(readCallback('?code=')).toEqual({ kind: 'none' });
  });
});

describe('rememberNext and takeNext', () => {
  it('hands back the page once', () => {
    const store = memoryStore();
    rememberNext(store, '/game/9');
    expect(takeNext(store)).toBe('/game/9');
    expect(takeNext(store)).toBe('/');
  });

  it('never remembers another site', () => {
    const store = memoryStore();
    rememberNext(store, 'https://evil.example');
    expect(takeNext(store)).toBe('/');
  });

  it('checks a stored value again when reading it', () => {
    const store = memoryStore();
    store.setItem('firstpass-vision:after-sign-in', '//evil.example');
    expect(takeNext(store)).toBe('/');
  });

  it('copes with a browser that refuses storage, or none at all', () => {
    expect(() => rememberNext(brokenStore, '/game/1')).not.toThrow();
    expect(takeNext(brokenStore)).toBe('/');
    rememberNext(null, '/game/1');
    expect(takeNext(null)).toBe('/');
  });
});

describe('exchangeOnce', () => {
  it('swaps a code only once, however often it is asked', async () => {
    const exchange = vi.fn(async () => ({ error: null }));
    const [a, b] = await Promise.all([exchangeOnce('c1', exchange), exchangeOnce('c1', exchange)]);
    await exchangeOnce('c1', exchange);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ error: null });
    expect(b).toEqual({ error: null });
  });

  it('swaps a different code separately', async () => {
    const exchange = vi.fn(async () => ({ error: null }));
    await exchangeOnce('c1', exchange);
    await exchangeOnce('c2', exchange);
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it('turns a thrown error into a failed swap', async () => {
    const result = await exchangeOnce('c3', async () => {
      throw new Error('network down');
    });
    expect(result).toEqual({ error: { message: 'network down' } });
  });
});

describe('completeWebSignIn', () => {
  const run = (over: Partial<Parameters<typeof completeWebSignIn>[0]> = {}) => {
    const store = memoryStore();
    rememberNext(store, '/game/42');
    const exchange = vi.fn(async () => ({ error: null }));
    const isSignedIn = vi.fn(async () => false);
    const opts = { search: '?code=good', hasClub: true, isSignedIn, exchange, store, ...over };
    return { opts, exchange: opts.exchange, result: completeWebSignIn(opts) };
  };

  it('with a code: swaps it and goes on to the page the coach was opening', async () => {
    const { result, exchange } = run();
    await expect(result).resolves.toEqual({ kind: 'signed-in', next: '/game/42' });
    expect(exchange).toHaveBeenCalledWith('good');
  });

  it('with a code and nothing remembered: goes to the games list', async () => {
    const { result } = run({ store: memoryStore() });
    await expect(result).resolves.toEqual({ kind: 'signed-in', next: '/' });
  });

  it('with no code: says sign-in did not finish and swaps nothing', async () => {
    const { result, exchange } = run({ search: '' });
    await expect(result).resolves.toEqual({ kind: 'failed', message: MESSAGES.noCode });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('when Google or Supabase says no: shows why and swaps nothing', async () => {
    const { result, exchange } = run({ search: '?error=access_denied&error_description=Cancelled' });
    await expect(result).resolves.toEqual({ kind: 'failed', message: `${MESSAGES.failed} (Cancelled)` });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('when the swap fails: shows why', async () => {
    const { result } = run({ exchange: vi.fn(async () => ({ error: { message: 'invalid flow state' } })) });
    await expect(result).resolves.toEqual({ kind: 'failed', message: `${MESSAGES.failed} (invalid flow state)` });
  });

  it('when already signed in (a reload of this page): goes on without using the code again', async () => {
    const { result, exchange } = run({ isSignedIn: vi.fn(async () => true) });
    await expect(result).resolves.toEqual({ kind: 'signed-in', next: '/game/42' });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('with no club chosen: asks for the club first', async () => {
    const { result, exchange } = run({ hasClub: false });
    await expect(result).resolves.toEqual({ kind: 'failed', message: MESSAGES.noClub });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('never sends the coach to another site, whatever was remembered', async () => {
    const store = memoryStore();
    store.setItem('firstpass-vision:after-sign-in', 'https://evil.example');
    const { result } = run({ store });
    await expect(result).resolves.toEqual({ kind: 'signed-in', next: '/' });
  });
});

describe('shortReason', () => {
  it('keeps the first sentence of a long message', () => {
    expect(
      shortReason('PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser.'),
    ).toBe('PKCE code verifier not found in storage');
    expect(shortReason('invalid flow state')).toBe('invalid flow state');
    expect(shortReason('x'.repeat(300))).toHaveLength(160);
  });

  it('is used for a failed swap, such as signing in on one browser and coming back on another', async () => {
    const result = await completeWebSignIn({
      search: '?code=c',
      hasClub: true,
      isSignedIn: async () => false,
      exchange: async () => ({ error: { message: 'PKCE code verifier not found in storage. This can happen if…' } }),
      store: memoryStore(),
    });
    expect(result).toEqual({ kind: 'failed', message: `${MESSAGES.failed} (PKCE code verifier not found in storage)` });
  });
});

describe('signOutHere', () => {
  it('signs out on this device only, never everywhere', async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    await signOutHere({ signOut });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(SIGN_OUT_OPTIONS.scope).toBe('local');
  });
});
