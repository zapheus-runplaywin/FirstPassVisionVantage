export interface SeqGap {
  /** First missing seq. */
  from: number;
  /** Last missing seq, inclusive. */
  to: number;
}

/**
 * Find the missing ranges in a stream's sequence numbers. Vision uses this to
 * request a refill after a dropped realtime message.
 */
export function findSeqGaps(seqs: Iterable<number>): SeqGap[] {
  const sorted = [...new Set(seqs)].sort((a, b) => a - b);
  const gaps: SeqGap[] = [];
  let expected = 1;
  for (const seq of sorted) {
    if (seq > expected) gaps.push({ from: expected, to: seq - 1 });
    expected = Math.max(expected, seq + 1);
  }
  return gaps;
}
