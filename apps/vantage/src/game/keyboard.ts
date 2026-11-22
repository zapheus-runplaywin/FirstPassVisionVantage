import { DECK_COLUMNS, DECK_KEYS, type DeckKey } from './deck';

/**
 * Keyboard shortcuts for the game screen, for a statistician at a Mac, or at
 * a tablet with a keyboard attached.
 *
 * The keyboard is laid out as the Stream Deck is (game/deck.ts): the four
 * rows of a keyboard, eight keys from the left, are the deck's four rows of
 * eight keys. So there is one layout to learn, nothing to set up, and the
 * keys mean exactly what the deck's keys mean at that moment:
 *
 *   1 2 3 4 5 6 7 8    our seven positions and "who?"            (who)
 *   Q W E R T Y U I    the eight actions                         (what)
 *   A S D F G H J K    the optional detail for the last action
 *   Z X C V B N M ,    the other team, skip, mark, undo, -, -, clock, end quarter
 *
 * Backspace also undoes. Where it happened (the court) stays a tap or a click.
 */
export const KEYBOARD_ROWS = ['12345678', 'qwertyui', 'asdfghjk', 'zxcvbnm,'] as const;

/** What the hidden text box reports: a character typed, or Backspace. */
export type Typed = string | 'Backspace';

/** The letter printed on the keyboard key that stands for deck key `index`. */
export function keyboardLabel(index: number): string {
  const row = KEYBOARD_ROWS[Math.floor(index / DECK_COLUMNS)];
  return (row?.[index % DECK_COLUMNS] ?? '').toUpperCase();
}

/**
 * The id of the deck key this keyboard key presses now, or null when the key
 * is not a shortcut. Caps Lock and Shift make no difference.
 */
export function keyboardKeyId(typed: Typed, keys: readonly DeckKey[]): string | null {
  if (typed === 'Backspace') return 'undo';
  if (typed.length !== 1 || keys.length !== DECK_KEYS) return null;
  const char = typed.toLowerCase();
  const row = KEYBOARD_ROWS.findIndex((r) => r.includes(char));
  if (row < 0) return null;
  const key = keys[row * DECK_COLUMNS + KEYBOARD_ROWS[row]!.indexOf(char)];
  return key?.id || null;
}

/**
 * The hidden text box starts with this one character in it, so that Backspace
 * has something to remove and shows up as a change.
 */
export const SENTINEL = '\u200b';

/** The text box is put back to SENTINEL when it is emptied or holds more than this. */
export const BOX_LIMIT = 40;

/** What was typed, given what the text box held before a change and holds after it. */
export function readTyped(before: string, after: string): Typed[] {
  if (after.length < before.length) return ['Backspace'];
  const added = after.startsWith(before) ? after.slice(before.length) : after;
  return [...added.replaceAll(SENTINEL, '')];
}

/**
 * A key held down repeats itself, and a held Undo would take back event after
 * event. So the same key counts again only after it has been quiet this long;
 * a held key keeps itself from counting for as long as it is held.
 */
export const REPEAT_QUIET_MS = 600;

/** Tells a fresh press from a held key's repeats. */
export function makeRepeatGuard(quietMs = REPEAT_QUIET_MS): (typed: Typed, now: number) => boolean {
  let last: Typed | null = null;
  let lastAt = -Infinity;
  return (typed, now) => {
    const key = typed === 'Backspace' ? typed : typed.toLowerCase();
    const fresh = key !== last || now - lastAt >= quietMs;
    last = key;
    lastAt = now;
    return fresh;
  };
}
