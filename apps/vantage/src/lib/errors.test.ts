import { describe, expect, it } from 'vitest';
import { classify, messageOf } from './errors';

/** What supabase-js hands back for an error, with or without a database code. */
const pg = (code: string, message: string) => ({ code, message, details: null, hint: null });

describe('classify', () => {
  it.each([
    ['no Statistician role', pg('42501', 'Only statisticians and admins can record games')],
    ['stood down or removed', pg('42501', 'You are no longer a statistician for this club')],
    ['signed out', pg('28000', 'Sign in first')],
    ['no such game', pg('P0002', 'No such game')],
    ['game finished', pg('55000', 'The game has finished')],
    ['any other class 42 or 28 code', pg('28P01', 'password authentication failed')],
  ])('treats HQ refusing (%s) as a refusal, with HQ\'s words', (_name, err) => {
    expect(classify(err)).toEqual({ kind: 'refused', message: err.message });
  });

  it.each([
    ['no signal', { code: '', message: 'TypeError: Network request failed' }],
    ['a thrown fetch error', new TypeError('Network request failed')],
    ['a gateway page with no code', { message: 'Bad gateway' }],
    ['a statement timeout', pg('57014', 'canceling statement due to statement timeout')],
    ['a serialisation retry', pg('40001', 'could not serialize access')],
    ['an expired token, which refreshes', pg('PGRST301', 'JWT expired')],
    ['nothing at all', null],
  ])('treats %s as unreachable, so it is retried', (_name, err) => {
    expect(classify(err)).toEqual({ kind: 'unreachable' });
  });
});

describe('messageOf', () => {
  it('reads errors, error-shaped objects and anything else', () => {
    expect(messageOf(new Error('a'))).toBe('a');
    expect(messageOf({ message: 'b' })).toBe('b');
    expect(messageOf('c')).toBe('c');
  });
});
