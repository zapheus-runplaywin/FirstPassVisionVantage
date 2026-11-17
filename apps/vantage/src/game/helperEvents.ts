import type { LiveEvent } from '@firstpass/engine';
import type { GameEvent, StreamId } from '@firstpass/schema';
import { STARTING_LINEUP } from './names';

/** How many events the helper's list goes back. */
export const HELPER_LIST = 60;

/**
 * What a helper can see and change: the stats, flags and substitutions that
 * stand, latest last, as far back as the list goes. The starting lineup is
 * left out (it is set at setup and nobody deletes it), and so are the clock
 * and the quarters, which belong to the recording tablet.
 */
export function helperEvents(live: readonly LiveEvent[], limit = HELPER_LIST): LiveEvent[] {
  return live
    .filter((e) => e.type === 'action' || e.type === 'flag' || (e.type === 'lineup_change' && e.payload.detail !== STARTING_LINEUP))
    .slice(-limit);
}

/**
 * The next number in a stream: one past the highest held. Each tablet numbers
 * only the stream it writes, so the recorder's and the helper's numbers never
 * depend on each other.
 */
export function nextSeq(held: readonly GameEvent[], stream: StreamId): number {
  let max = 0;
  for (const e of held) if (e.stream === stream && e.seq > max) max = e.seq;
  return max + 1;
}
