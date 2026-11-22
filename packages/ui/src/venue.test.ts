import { describe, expect, it } from 'vitest';
import {
  askVenue,
  collectVenue,
  pairVenue,
  readVenueEvents,
  sendVenueEvents,
  venueBase,
  venueFromText,
  venueName,
  venueToText,
  type VenueFetch,
} from './venue';

/*
 * The venue link's protocol against a scripted Studio: where Studio is from
 * what someone typed (always https), asking to be allowed and collecting the
 * key, sending events and reading them, and every way Studio says no.
 */

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function studio(answers: Array<{ status: number; body?: unknown } | 'down'>) {
  const calls: Call[] = [];
  const fetch: VenueFetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined });
    const next = answers.shift();
    if (!next || next === 'down') throw new Error('Network request failed');
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { fetch, calls };
}

const LINK = { base: 'https://k3f9x2.studio.firstpass.pivt.au:8443', key: 'secret-key' };

describe('where Studio is', () => {
  it('takes the six letters, the whole name or the whole link, always as https', () => {
    expect(venueBase(' K3F9X2 ')).toBe(LINK.base);
    expect(venueBase('k3f9x2.studio.firstpass.pivt.au')).toBe(LINK.base);
    expect(venueBase('https://k3f9x2.studio.firstpass.pivt.au:8443/')).toBe(LINK.base);
    expect(venueBase('studio.example.org:9443')).toBe('https://studio.example.org:9443');
  });

  it('refuses plain http and anything that is not a name, so nothing is sent in the clear', () => {
    for (const typed of ['', '   ', 'http://k3f9x2.studio.firstpass.pivt.au:8080', 'http://192.168.1.20:8080', 'ab', 'two words', 'https://', 'k3f9x2/path/elsewhere', 'ftp://x.y']) {
      expect(venueBase(typed), typed).toBeNull();
    }
  });

  it('shows the letters back', () => {
    expect(venueName(LINK.base)).toBe('k3f9x2');
    expect(venueName('https://studio.example.org:9443')).toBe('studio.example.org');
  });

  it('keeps a link as text, and reads back only a whole https one', () => {
    expect(venueFromText(venueToText(LINK))).toEqual(LINK);
    for (const text of [null, '', 'nonsense', '{}', JSON.stringify({ base: 'http://x.y:1', key: 'k' }), JSON.stringify({ base: LINK.base, key: '' })]) {
      expect(venueFromText(text)).toBeNull();
    }
  });
});

describe('asking to be allowed', () => {
  it('asks as a FirstPass app, and collects the key once someone presses Allow', async () => {
    const s = studio([{ status: 202, body: { id: 'req1', token: 'tok' } }, { status: 200, body: { status: 'waiting' } }, { status: 200, body: { status: 'allowed', key: 'secret-key', device: 'd1' } }]);
    const waited: number[] = [];
    let waiting = 0;
    const got = await pairVenue({ typed: 'k3f9x2', name: 'FirstPass Vantage', fetch: s.fetch, onWaiting: () => waiting++, sleep: async (ms) => void waited.push(ms) });
    expect(got).toEqual({ ok: true, link: LINK });
    expect(waiting).toBe(1);
    expect(waited).toEqual([2000, 2000]);
    expect(s.calls[0]).toMatchObject({ url: `${LINK.base}/api/pair`, method: 'POST', body: { name: 'FirstPass Vantage', firstpass: true } });
    expect(s.calls[1]).toMatchObject({ url: `${LINK.base}/api/pair/req1`, headers: { 'x-studio-pair': 'tok' } });
  });

  it('says so when someone presses Deny, the request runs out, or Studio has another request open', async () => {
    const sleep = async () => undefined;
    const denied = studio([{ status: 202, body: { id: 'r', token: 't' } }, { status: 200, body: { status: 'denied' } }]);
    expect(await pairVenue({ typed: 'k3f9x2', name: 'n', fetch: denied.fetch, sleep })).toEqual({ ok: false, message: 'Someone at the Mac pressed Deny.' });
    const gone = studio([{ status: 202, body: { id: 'r', token: 't' } }, { status: 404, body: { status: 'gone' } }]);
    expect((await pairVenue({ typed: 'k3f9x2', name: 'n', fetch: gone.fetch, sleep })).ok).toBe(false);
    const busy = studio([{ status: 409, body: { error: 'Another device is asking already.' } }]);
    expect(await pairVenue({ typed: 'k3f9x2', name: 'n', fetch: busy.fetch, sleep })).toEqual({ ok: false, message: 'Another device is asking already.' });
  });

  it('never asks anything of an address that is not https, and gives up when nobody answers', async () => {
    const none = studio([]);
    expect((await pairVenue({ typed: 'http://192.168.1.20:8080', name: 'n', fetch: none.fetch })).ok).toBe(false);
    expect(none.calls).toHaveLength(0);
    const down = studio(['down']);
    expect((await askVenue(LINK.base, 'n', down.fetch)).ok).toBe(false);
    // Allowed to wait five minutes by its own clock, then stops.
    let t = 0;
    const slow = studio([{ status: 202, body: { id: 'r', token: 't' } }, ...Array.from({ length: 200 }, () => ({ status: 200, body: { status: 'waiting' } }))]);
    const out = await pairVenue({ typed: 'k3f9x2', name: 'n', fetch: slow.fetch, sleep: async (ms) => void (t += ms), now: () => t });
    expect(out.ok).toBe(false);
    expect(slow.calls.length).toBeLessThanOrEqual(152);
    // Stopped by the person.
    const stopped = studio([{ status: 202, body: { id: 'r', token: 't' } }]);
    expect(await pairVenue({ typed: 'k3f9x2', name: 'n', fetch: stopped.fetch, sleep: async () => undefined, cancelled: () => true })).toEqual({ ok: false, message: 'Stopped.' });
    expect(stopped.calls).toHaveLength(1);
    // Studio goes quiet while waiting.
    const quiet = studio([{ status: 202, body: { id: 'r', token: 't' } }, 'down', 'down', 'down', 'down', 'down']);
    expect((await pairVenue({ typed: 'k3f9x2', name: 'n', fetch: quiet.fetch, sleep: async () => undefined })).ok).toBe(false);
    expect((await collectVenue(LINK.base, 'r', 't', studio(['down']).fetch)).status).toBe('unreachable');
  });
});

describe('sending and reading events', () => {
  it('sends with the key in its header and learns how far Studio has the game', async () => {
    const s = studio([{ status: 200, body: { throughSeq: 12, taken: 2 } }]);
    expect(await sendVenueEvents(LINK, 'g1', [{ seq: 11 }, { seq: 12 }], s.fetch)).toEqual({ ok: true, throughSeq: 12 });
    expect(s.calls[0]).toMatchObject({ url: `${LINK.base}/api/firstpass/venue/events`, method: 'POST', headers: { 'x-studio-key': 'secret-key' }, body: { gameId: 'g1', events: [{ seq: 11 }, { seq: 12 }] } });
  });

  it('tells apart every way Studio says no', async () => {
    const no = async (answer: { status: number; body?: unknown } | 'down') => {
      const got = await sendVenueEvents(LINK, 'g1', [], studio([answer]).fetch);
      return got.ok ? 'ok' : got.reason;
    };
    expect(await no({ status: 409, body: { reason: 'not-followed' } })).toBe('not-followed');
    expect(await no({ status: 409, body: { reason: 'other-recorder' } })).toBe('other-recorder');
    expect(await no({ status: 403, body: { error: 'FirstPass stats are private' } })).toBe('not-allowed');
    expect(await no({ status: 500, body: {} })).toBe('unreachable');
    expect(await no({ status: 200, body: 'not what was expected' })).toBe('unreachable');
    expect(await no('down')).toBe('unreachable');
  });

  it('reads the events after a seq, waiting for the next one', async () => {
    const s = studio([{ status: 200, body: { events: [{ seq: 5 }], helper: [{ seq: 1 }], throughSeq: 5 } }, { status: 404, body: { reason: 'not-followed' } }, { status: 200, body: { events: [] } }, 'down']);
    expect(await readVenueEvents(LINK, 'g 1', 4, 20, s.fetch)).toEqual({ ok: true, events: [{ seq: 5 }], helper: [{ seq: 1 }], throughSeq: 5 });
    expect(s.calls[0]).toMatchObject({ url: `${LINK.base}/api/firstpass/venue/events?game=g%201&after=4&wait=20`, method: 'GET', headers: { 'x-studio-key': 'secret-key' } });
    expect(await readVenueEvents(LINK, 'g1', 5, 20, s.fetch)).toEqual({ ok: false, reason: 'not-followed' });
    expect(await readVenueEvents(LINK, 'g1', 5, 20, s.fetch)).toEqual({ ok: true, events: [], helper: [], throughSeq: 0 });
    expect(await readVenueEvents(LINK, 'g1', 5, 20, s.fetch)).toEqual({ ok: false, reason: 'unreachable' });
  });
});
