/*
 * Google sign-in for Vision in a web browser.
 *
 * The phone app opens Google in a separate browser and waits for it to come
 * back (auth.ts). A web page can't do that, so on the web the whole page goes
 * to Google and comes back to /auth-callback with a one-time code, which the
 * auth-callback screen swaps for a session. A code works only once, so this
 * file is the only place that swaps it, and it never swaps the same code twice.
 *
 * Nothing here touches React or the browser directly, so it can be tested.
 */

/** Where Google sends the coach back to. Must be on the club project's redirect list. */
export const CALLBACK_PATH = '/auth-callback';

export function callbackUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${CALLBACK_PATH}`;
}

/**
 * A page on this site to go to after signing in, or "/" for anything else.
 * Stops a crafted link from sending the coach to another site after sign-in.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  if (/[\s\0]/.test(next)) return '/';
  if (next === CALLBACK_PATH || next.startsWith(`${CALLBACK_PATH}?`) || next.startsWith(`${CALLBACK_PATH}/`)) return '/';
  return next;
}

export type CallbackParams =
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

/** Reads what Google and Supabase put on the callback address. */
export function readCallback(search: string): CallbackParams {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const error = params.get('error_description') ?? params.get('error');
  if (error) return { kind: 'error', message: error };
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  return { kind: 'none' };
}

/** Somewhere to keep the page to go back to while the browser is away at Google. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const NEXT_KEY = 'firstpass-vision:after-sign-in';

export function rememberNext(store: KeyValueStore | null, next: string): void {
  try {
    store?.setItem(NEXT_KEY, safeNext(next));
  } catch {
    // Private browsing can refuse storage; the coach lands on the games list instead.
  }
}

/** The remembered page, once: it is forgotten as it is read. */
export function takeNext(store: KeyValueStore | null): string {
  try {
    const next = store?.getItem(NEXT_KEY) ?? null;
    store?.removeItem(NEXT_KEY);
    return safeNext(next);
  } catch {
    return '/';
  }
}

type Exchange = (code: string) => Promise<{ error: { message: string } | null }>;

const swaps = new Map<string, Promise<{ error: { message: string } | null }>>();

/**
 * Swaps a code for a session at most once per page load, however many times
 * the screen asks (React can run an effect twice in development).
 */
export function exchangeOnce(code: string, exchange: Exchange): Promise<{ error: { message: string } | null }> {
  let swap = swaps.get(code);
  if (!swap) {
    swap = exchange(code).catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }));
    swaps.set(code, swap);
  }
  return swap;
}

/** For tests only. */
export function forgetSwaps(): void {
  swaps.clear();
}

/** The first sentence of a reason, so a long library message stays readable. */
export function shortReason(message: string): string {
  const first = message.split(/(?<=\.)\s/)[0] ?? message;
  return first.replace(/\.$/, '').slice(0, 160);
}

export type CallbackResult = { kind: 'signed-in'; next: string } | { kind: 'failed'; message: string };

export const MESSAGES = {
  noClub: 'Choose your club, then sign in again.',
  noCode: "Sign-in didn't finish. Try signing in again.",
  failed: "Sign-in didn't work. Try signing in again.",
} as const;

/**
 * Finishes a web sign-in on the callback screen.
 *
 * - Already signed in: go on, without touching the code. A second swap would
 *   fail, and the first one has already done its job (a reload of this page).
 * - A code: swap it once, then go on.
 * - Google or Supabase said no, or there is no code: say so.
 */
export async function completeWebSignIn(opts: {
  search: string;
  hasClub: boolean;
  isSignedIn: () => Promise<boolean>;
  exchange: Exchange;
  store: KeyValueStore | null;
}): Promise<CallbackResult> {
  if (!opts.hasClub) return { kind: 'failed', message: MESSAGES.noClub };
  if (await opts.isSignedIn()) return { kind: 'signed-in', next: takeNext(opts.store) };

  const params = readCallback(opts.search);
  if (params.kind === 'error') return { kind: 'failed', message: `${MESSAGES.failed} (${shortReason(params.message)})` };
  if (params.kind === 'none') return { kind: 'failed', message: MESSAGES.noCode };

  const { error } = await exchangeOnce(params.code, opts.exchange);
  if (error) return { kind: 'failed', message: `${MESSAGES.failed} (${shortReason(error.message)})` };
  return { kind: 'signed-in', next: takeNext(opts.store) };
}

/**
 * Sign-out ends this browser's or phone's session only. The club's HQ and
 * Vantage use the same accounts, and Supabase's default ("global") would end
 * the person's sessions there too, which the FirstPass conventions forbid:
 * one product never signs a person out of another.
 */
export const SIGN_OUT_OPTIONS = { scope: 'local' } as const;

export async function signOutHere(auth: {
  signOut(options: typeof SIGN_OUT_OPTIONS): Promise<unknown>;
}): Promise<void> {
  await auth.signOut(SIGN_OUT_OPTIONS);
}
