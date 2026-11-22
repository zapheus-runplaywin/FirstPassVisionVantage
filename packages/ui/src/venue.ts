/*
 * The venue link: talking to FirstPass Studio on the venue's own network.
 *
 * At a venue with slow internet, Vantage hands each event straight to the
 * Studio Mac as well as sending it to the club's HQ, and the Vision phone app
 * reads them from Studio, so the stream's graphics and the coach keep up. HQ
 * still receives every event from Vantage and stays the record.
 *
 * Studio answers only over its secure link (https, with a real certificate,
 * at a name such as k3f9x2.studio.firstpass.pivt.au), never plain http: the
 * events are about athletes, many under 18. The app asks once to be allowed,
 * someone at the Mac presses Allow, and the app collects a key that opens
 * these two routes of Studio and nothing else (Studio: venuelink.ts,
 * devices.ts kind 'stats'). Studio takes and gives events only for the game
 * on its scoreboard, which it already follows from the club's HQ.
 *
 * This file is the protocol only, with fetch passed in so tests can stand in
 * for Studio. Each app keeps the link and decides when to send or read.
 */

/** Where Studio's secure names live, and the port its secure link answers on. */
export const VENUE_DOMAIN = 'studio.firstpass.pivt.au';
export const VENUE_PORT = 8443;
/** The most events Studio takes in one request (its limit is 200). */
export const VENUE_BATCH = 100;

/** A Studio this device has been allowed on. */
export interface VenueLink {
  /** https://<name>:<port>, no trailing slash. */
  base: string;
  key: string;
}

/** An AbortSignal, as much as this file needs to know of one. */
export interface VenueSignal {
  readonly aborted: boolean;
}

export type VenueFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: VenueSignal | undefined }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Studio's address from what someone typed: the six letters of its secure
 * link ("k3f9x2"), its whole name, or the whole link. Always https; null when
 * it is none of those, so a key or an event never goes over plain http.
 */
export function venueBase(typed: string): string | null {
  const text = typed.trim().toLowerCase();
  if (!text) return null;
  if (/^[a-z0-9]{4,12}$/.test(text)) return `https://${text}.${VENUE_DOMAIN}:${VENUE_PORT}`;
  if (/^http:/.test(text)) return null;
  const m = /^(?:https:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::(\d{2,5}))?\/?$/.exec(text);
  if (!m) return null;
  return `https://${m[1]}:${m[2] ?? VENUE_PORT}`;
}

/** The six letters (or the whole name) to show for a link, as typed in. */
export function venueName(base: string): string {
  const host = base.replace(/^https:\/\//, '').replace(/:\d+$/, '');
  return host.endsWith(`.${VENUE_DOMAIN}`) ? host.slice(0, -VENUE_DOMAIN.length - 1) : host;
}

const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

/** Asks Studio to allow this device. Someone at the Mac then presses Allow or Deny. */
export async function askVenue(
  base: string,
  name: string,
  fetch: VenueFetch,
): Promise<{ ok: true; id: string; token: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${base}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, firstpass: true }),
    });
    const body = record(await res.json().catch(() => null));
    if (res.ok && typeof body.id === 'string' && typeof body.token === 'string') return { ok: true, id: body.id, token: body.token };
    return { ok: false, message: typeof body.error === 'string' ? body.error : `Studio answered ${res.status}.` };
  } catch {
    return { ok: false, message: "Studio didn't answer. Check the letters, that this device is on the venue's network, and that Studio's secure link is on." };
  }
}

export type VenueAnswer = { status: 'waiting' } | { status: 'allowed'; key: string } | { status: 'denied' } | { status: 'gone' } | { status: 'unreachable' };

/** Collects the answer to askVenue. The key is handed over once. */
export async function collectVenue(base: string, id: string, token: string, fetch: VenueFetch): Promise<VenueAnswer> {
  try {
    const res = await fetch(`${base}/api/pair/${encodeURIComponent(id)}`, { headers: { 'x-studio-pair': token } });
    const body = record(await res.json().catch(() => null));
    if (body.status === 'waiting') return { status: 'waiting' };
    if (body.status === 'allowed' && typeof body.key === 'string') return { status: 'allowed', key: body.key };
    if (body.status === 'denied') return { status: 'denied' };
    return { status: 'gone' };
  } catch {
    return { status: 'unreachable' };
  }
}

/**
 * Why Studio didn't take or give events:
 * 'not-followed'    it isn't the game on Studio's scoreboard (or the club isn't signed in there);
 * 'other-recorder'  HQ has the game from another device;
 * 'not-allowed'     this device was removed in Studio's Devices, so it has to ask again;
 * 'unreachable'     Studio didn't answer.
 */
export type VenueRefusal = 'not-followed' | 'other-recorder' | 'not-allowed' | 'unreachable';

function refusal(status: number, body: Record<string, unknown>): VenueRefusal {
  if (body.reason === 'not-followed' || body.reason === 'other-recorder') return body.reason;
  if (status === 401 || status === 403) return 'not-allowed';
  if (status === 404) return 'not-followed';
  return 'unreachable';
}

/**
 * Hands Studio some of a game's events. `throughSeq` is how far the game's
 * primary events now reach in Studio: send what comes after it next. Sending
 * no events just asks how far it has them.
 */
export async function sendVenueEvents(
  link: VenueLink,
  gameId: string,
  events: readonly unknown[],
  fetch: VenueFetch,
  signal?: VenueSignal,
): Promise<{ ok: true; throughSeq: number } | { ok: false; reason: VenueRefusal }> {
  try {
    const res = await fetch(`${link.base}/api/firstpass/venue/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-studio-key': link.key },
      body: JSON.stringify({ gameId, events }),
      signal,
    });
    const body = record(await res.json().catch(() => null));
    if (res.ok && typeof body.throughSeq === 'number') return { ok: true, throughSeq: body.throughSeq };
    return { ok: false, reason: refusal(res.status, body) };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

/**
 * Reads a game's primary events after `afterSeq` and every helper event from
 * Studio, waiting up to `waitSeconds` for one to arrive. The events are as
 * Studio holds them, unchecked: the caller validates each as it does HQ's.
 */
export async function readVenueEvents(
  link: VenueLink,
  gameId: string,
  afterSeq: number,
  waitSeconds: number,
  fetch: VenueFetch,
  signal?: VenueSignal,
): Promise<{ ok: true; events: unknown[]; helper: unknown[]; throughSeq: number } | { ok: false; reason: VenueRefusal }> {
  try {
    const query = `game=${encodeURIComponent(gameId)}&after=${afterSeq}&wait=${waitSeconds}`;
    const res = await fetch(`${link.base}/api/firstpass/venue/events?${query}`, { headers: { 'x-studio-key': link.key }, signal });
    const body = record(await res.json().catch(() => null));
    if (res.ok && Array.isArray(body.events)) {
      return { ok: true, events: body.events, helper: Array.isArray(body.helper) ? body.helper : [], throughSeq: typeof body.throughSeq === 'number' ? body.throughSeq : 0 };
    }
    return { ok: false, reason: refusal(res.status, body) };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

/** A saved link as text, and back (null for anything that isn't one). */
export const venueToText = (link: VenueLink): string => JSON.stringify(link);
export function venueFromText(text: string | null | undefined): VenueLink | null {
  if (!text) return null;
  try {
    const v = record(JSON.parse(text));
    return typeof v.base === 'string' && /^https:\/\//.test(v.base) && typeof v.key === 'string' && v.key ? { base: v.base, key: v.key } : null;
  } catch {
    return null;
  }
}

/** How long to keep asking for the answer: Studio's request runs out after five minutes. */
export const VENUE_ASK_MS = 5 * 60 * 1000;
export const VENUE_ASK_EVERY_MS = 2000;

/**
 * Asks to be allowed and waits for the answer. `onWaiting` is called once the
 * Mac is showing the request; `sleep` and `now` are for tests.
 */
export async function pairVenue(opts: {
  typed: string;
  name: string;
  fetch: VenueFetch;
  onWaiting?: () => void;
  cancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<{ ok: true; link: VenueLink } | { ok: false; message: string }> {
  const base = venueBase(opts.typed);
  if (!base) return { ok: false, message: "Type the six letters of Studio's secure link, shown on its Devices tab." };
  const timers = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown };
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => void timers.setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const asked = await askVenue(base, opts.name, opts.fetch);
  if (!asked.ok) return asked;
  opts.onWaiting?.();
  const until = now() + VENUE_ASK_MS;
  let misses = 0;
  while (now() < until) {
    await sleep(VENUE_ASK_EVERY_MS);
    if (opts.cancelled?.()) return { ok: false, message: 'Stopped.' };
    const got = await collectVenue(base, asked.id, asked.token, opts.fetch);
    if (got.status === 'allowed') return { ok: true, link: { base, key: got.key } };
    if (got.status === 'denied') return { ok: false, message: 'Someone at the Mac pressed Deny.' };
    if (got.status === 'gone') return { ok: false, message: 'The request ran out before anyone pressed Allow. Try again.' };
    if (got.status === 'unreachable' && ++misses >= 5) return { ok: false, message: "Studio stopped answering. Check this device is still on the venue's network." };
  }
  return { ok: false, message: 'The request ran out before anyone pressed Allow. Try again.' };
}
