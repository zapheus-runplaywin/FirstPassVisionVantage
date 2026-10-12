import { describe, expect, it } from 'vitest';
import { findSeqGaps } from './seq';

describe('findSeqGaps', () => {
  it('returns nothing for a complete stream', () => {
    expect(findSeqGaps([1, 2, 3])).toEqual([]);
  });

  it('finds a missing start, middle and run', () => {
    expect(findSeqGaps([3, 4, 6, 10])).toEqual([
      { from: 1, to: 2 },
      { from: 5, to: 5 },
      { from: 7, to: 9 },
    ]);
  });

  it('ignores order and duplicates', () => {
    expect(findSeqGaps([2, 1, 2, 4])).toEqual([{ from: 3, to: 3 }]);
  });
});
