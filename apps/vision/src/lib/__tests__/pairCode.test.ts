import { describe, expect, it } from 'vitest';
import { normalisePairCode } from '../pairCode';

describe('normalisePairCode', () => {
  it('takes the six digits however the tablet code was typed', () => {
    expect(normalisePairCode('123 456')).toBe('123456');
    expect(normalisePairCode('123-456')).toBe('123456');
    expect(normalisePairCode('123456')).toBe('123456');
  });

  it('refuses anything that is not six digits', () => {
    expect(normalisePairCode('12345')).toBeNull();
    expect(normalisePairCode('1234567')).toBeNull();
    expect(normalisePairCode('')).toBeNull();
    expect(normalisePairCode('abcdef')).toBeNull();
  });
});
