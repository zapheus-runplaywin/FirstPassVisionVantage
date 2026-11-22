import type { VenueFetch } from '@firstpass/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The Studio this phone is connected to: kept on the phone once someone at
 * the Mac presses Allow, forgotten on Disconnect, and never in a browser.
 */

const store = vi.hoisted(() => new Map<string, string>());
const platform = vi.hoisted(() => ({ OS: 'ios' }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));
vi.mock('react-native', () => ({ Platform: platform }));

const LINK = { base: 'https://k3f9x2.studio.firstpass.pivt.au:8443', key: 'new-key' };

beforeEach(() => {
  store.clear();
  vi.resetModules();
  platform.OS = 'ios';
});

describe('the phone’s venue link', () => {
  it('is kept once someone at the Mac presses Allow, and forgotten on Disconnect', async () => {
    vi.useFakeTimers();
    const { connectVenue, loadVenueLink, saveVenueLink, venueAvailable } = await import('../venue');
    expect(venueAvailable).toBe(true);
    expect(await loadVenueLink()).toBeNull();
    const answers = [{ status: 202, body: { id: 'r', token: 't' } }, { status: 200, body: { status: 'allowed', key: 'new-key' } }];
    const calls: unknown[] = [];
    const fetch: VenueFetch = async (url, init) => {
      calls.push(init?.body ? JSON.parse(init.body) : url);
      const a = answers.shift()!;
      return { ok: true, status: a.status, json: async () => a.body };
    };
    let waiting = 0;
    const done = connectVenue(' K3F9X2', () => waiting++, () => false, fetch);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await done).toEqual({ link: LINK });
    expect(waiting).toBe(1);
    expect(calls[0]).toEqual({ name: 'FirstPass Vision', firstpass: true });
    expect(await loadVenueLink()).toEqual(LINK);
    await saveVenueLink(null);
    expect(await loadVenueLink()).toBeNull();
    vi.useRealTimers();
  });

  it('says why when it is not allowed, and keeps nothing', async () => {
    const { connectVenue, loadVenueLink } = await import('../venue');
    const fetch: VenueFetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'Another device is asking already.' }) });
    expect(await connectVenue('k3f9x2', () => undefined, () => false, fetch)).toEqual({ message: 'Another device is asking already.' });
    expect('message' in (await connectVenue('http://192.168.1.20:8080', () => undefined, () => false, fetch))).toBe(true);
    expect(await loadVenueLink()).toBeNull();
  });

  it('is not there in a browser, even with a link saved', async () => {
    platform.OS = 'web';
    const { loadVenueLink, venueAvailable } = await import('../venue');
    store.set('firstpass.vision.venueLink', JSON.stringify(LINK));
    expect(venueAvailable).toBe(false);
    expect(await loadVenueLink()).toBeNull();
  });
});
