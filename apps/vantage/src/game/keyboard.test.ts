import { describe, expect, it } from 'vitest';
import { DECK_KEYS, type DeckKey } from './deck';
import { KEYBOARD_ROWS, SENTINEL, keyboardKeyId, keyboardLabel, makeRepeatGuard, readTyped } from './keyboard';

/*
 * Keyboard shortcuts: the keyboard's four rows are the Stream Deck's four
 * rows, a key means what the deck key in its place means now, and a held key
 * counts once.
 */

const keys: DeckKey[] = Array.from({ length: DECK_KEYS }, (_, i) => ({ id: `k${i}`, title: '', look: 'plain' }));

describe('keyboardKeyId', () => {
  it('maps each row of the keyboard, eight keys from the left, to the same row of the deck', () => {
    const ids = KEYBOARD_ROWS.flatMap((row) => [...row].map((c) => keyboardKeyId(c, keys)));
    expect(ids).toEqual(keys.map((k) => k.id));
  });

  it('takes Caps Lock and Shift in its stride', () => {
    expect(keyboardKeyId('Q', keys)).toBe('k8');
    expect(keyboardKeyId('q', keys)).toBe('k8');
  });

  it('makes Backspace undo', () => {
    expect(keyboardKeyId('Backspace', keys)).toBe('undo');
  });

  it('ignores keys that are not shortcuts, and keys whose deck key does nothing now', () => {
    for (const other of ['9', '0', 'o', 'p', 'l', '.', ' ', '\n', 'qq']) expect(keyboardKeyId(other, keys)).toBeNull();
    const dark = keys.map((k, i) => (i === 8 ? { ...k, id: '' } : k));
    expect(keyboardKeyId('q', dark)).toBeNull();
    expect(keyboardKeyId('q', [])).toBeNull();
  });
});

describe('keyboardLabel', () => {
  it('names the keyboard key for each deck key', () => {
    expect(keyboardLabel(0)).toBe('1');
    expect(keyboardLabel(8)).toBe('Q');
    expect(keyboardLabel(23)).toBe('K');
    expect(keyboardLabel(31)).toBe(',');
    expect(keyboardLabel(32)).toBe('');
  });
});

describe('readTyped', () => {
  it('reads what was added to the box', () => {
    expect(readTyped(SENTINEL, `${SENTINEL}q`)).toEqual(['q']);
    expect(readTyped(`${SENTINEL}q`, `${SENTINEL}qa`)).toEqual(['a']);
    expect(readTyped(`${SENTINEL}q`, `${SENTINEL}qq`)).toEqual(['q']);
    expect(readTyped(SENTINEL, `${SENTINEL}qa`)).toEqual(['q', 'a']);
    expect(readTyped('', 'q')).toEqual(['q']);
  });

  it('reads a shorter box as Backspace', () => {
    expect(readTyped(SENTINEL, '')).toEqual(['Backspace']);
    expect(readTyped(`${SENTINEL}qa`, `${SENTINEL}q`)).toEqual(['Backspace']);
  });

  it('reads nothing when nothing changed, such as the box being put back', () => {
    expect(readTyped(SENTINEL, SENTINEL)).toEqual([]);
    expect(readTyped(`${SENTINEL}q`, `${SENTINEL}q`)).toEqual([]);
  });

  it('still reads the key when the box was put back without saying so', () => {
    expect(readTyped(`${SENTINEL}q`, `${SENTINEL}a`)).toEqual(['a']);
  });
});

describe('makeRepeatGuard', () => {
  it('counts a held key once, however long it is held', () => {
    const fresh = makeRepeatGuard(600);
    expect(fresh('v', 0)).toBe(true);
    // The keyboard waits, then repeats quickly.
    const repeats = Array.from({ length: 40 }, (_, i) => 500 + i * 80);
    expect(repeats.filter((t) => fresh('v', t))).toEqual([]);
  });

  it('counts the same key again once it has been quiet', () => {
    const fresh = makeRepeatGuard(600);
    expect(fresh('v', 0)).toBe(true);
    expect(fresh('v', 600)).toBe(true);
    expect(fresh('V', 700)).toBe(false);
  });

  it('never holds back a different key', () => {
    const fresh = makeRepeatGuard(600);
    expect(fresh('1', 0)).toBe(true);
    expect(fresh('q', 10)).toBe(true);
    expect(fresh('1', 20)).toBe(true);
    expect(fresh('Backspace', 30)).toBe(true);
    expect(fresh('Backspace', 40)).toBe(false);
  });
});
