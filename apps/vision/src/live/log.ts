import type { GameEvent } from '@firstpass/schema';

/*
 * The coach's copy of a game's primary stream. Events arrive twice over (the
 * Realtime broadcast and the catch-up reads), out of order and with holes when
 * a broadcast is missed. Because the tablet numbers the stream 1, 2, 3 with no
 * gaps, the log keeps every event by seq and shows only the unbroken run from
 * seq 1, so a missed event never silently changes a stat: the feed sees the
 * hole and reads the missing rows from the database.
 */

/** A row of public.game_events, as PostgREST returns it. */
export interface EventRow {
  game_id: string;
  stream: string;
  seq: number;
  id: string;
  type: string;
  payload: unknown;
  recorded_at: string;
}

const EVENT_TYPES = new Set(['period_start', 'clock_start', 'clock_stop', 'period_end', 'action', 'flag', 'lineup_change', 'correction']);

function valid(e: Partial<GameEvent>): e is GameEvent {
  return (
    typeof e.id === 'string' &&
    typeof e.gameId === 'string' &&
    e.stream === 'primary' &&
    Number.isInteger(e.seq) &&
    (e.seq as number) > 0 &&
    typeof e.type === 'string' &&
    EVENT_TYPES.has(e.type) &&
    typeof e.payload === 'object' &&
    e.payload !== null &&
    typeof e.recordedAt === 'string' &&
    !Number.isNaN(Date.parse(e.recordedAt))
  );
}

/** A database row as an event, or null if it is not a primary event this app understands. */
export function fromRow(row: EventRow): GameEvent | null {
  const e = {
    id: row.id,
    gameId: row.game_id,
    stream: row.stream,
    seq: row.seq,
    type: row.type,
    payload: row.payload,
    recordedAt: row.recorded_at,
  } as Partial<GameEvent>;
  return valid(e) ? e : null;
}

/** A Realtime broadcast (shaped by public.broadcast_game_event) as an event, or null. */
export function fromBroadcast(message: unknown): GameEvent | null {
  if (typeof message !== 'object' || message === null) return null;
  const m = message as Record<string, unknown>;
  const e = {
    id: m.id,
    gameId: m.gameId,
    stream: m.stream,
    seq: m.seq,
    type: m.type,
    payload: m.payload,
    recordedAt: m.recordedAt,
  } as Partial<GameEvent>;
  return valid(e) ? e : null;
}

export class LiveLog {
  private readonly bySeq = new Map<number, GameEvent>();
  private through = 0;
  private ordered: GameEvent[] = [];

  constructor(readonly gameId: string) {}

  /** Highest seq with every event before it held. */
  get unbrokenThrough(): number {
    return this.through;
  }

  /** Highest seq held, which is above `unbrokenThrough` while there is a hole. */
  get highestSeq(): number {
    let max = 0;
    for (const seq of this.bySeq.keys()) if (seq > max) max = seq;
    return max;
  }

  get hasGap(): boolean {
    return this.bySeq.size > this.through;
  }

  /** The unbroken run of events from seq 1, in order. Same array until it changes. */
  get events(): readonly GameEvent[] {
    return this.ordered;
  }

  /**
   * Adds events, ignoring ones already held, other games and other streams.
   * Returns true when the unbroken run grew.
   */
  add(events: Iterable<GameEvent | null>): boolean {
    for (const e of events) {
      if (!e || e.gameId !== this.gameId || e.stream !== 'primary' || this.bySeq.has(e.seq)) continue;
      this.bySeq.set(e.seq, e);
    }
    const before = this.through;
    while (this.bySeq.has(this.through + 1)) this.through += 1;
    if (this.through === before) return false;
    const next = this.ordered.slice();
    for (let s = before + 1; s <= this.through; s++) next.push(this.bySeq.get(s) as GameEvent);
    this.ordered = next;
    return true;
  }
}
