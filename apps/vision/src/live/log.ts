import { isHelperStream, mergeStreams } from '@firstpass/engine';
import { HELPER_EVENT_TYPES, type GameEvent } from '@firstpass/schema';

/*
 * The coach's copy of a game's record: the primary stream, and the
 * substitutions and corrections of a helper statistician on a stream of their
 * own. Events arrive twice over (the Realtime broadcast and the catch-up
 * reads), out of order and with holes when a broadcast is missed. Because
 * each tablet numbers its stream 1, 2, 3 with no gaps, the log keeps every
 * event by stream and seq and shows only the unbroken run from seq 1 of each,
 * so a missed event never silently changes a stat: the feed sees the hole
 * and reads the missing rows from the database.
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
const HELPER_TYPES: readonly string[] = HELPER_EVENT_TYPES;

/** The primary stream, or a helper's stream carrying what a helper may record. */
function counts(stream: unknown, type: unknown): boolean {
  if (stream === 'primary') return true;
  return typeof stream === 'string' && isHelperStream(stream) && typeof type === 'string' && HELPER_TYPES.includes(type);
}

function valid(e: Partial<GameEvent>): e is GameEvent {
  return (
    typeof e.id === 'string' &&
    typeof e.gameId === 'string' &&
    counts(e.stream, e.type) &&
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

/** A database row as an event, or null if it is not a primary or helper event this app understands. */
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
  private readonly held = new Map<string, Map<number, GameEvent>>();
  private readonly throughBy = new Map<string, number>();
  private ordered: GameEvent[] = [];
  /** Events held only from the venue link so far, as "stream seq": the club has not sent its copy. */
  private readonly unconfirmed = new Set<string>();

  constructor(readonly gameId: string) {}

  /** Highest primary seq with every event before it held. */
  get unbrokenThrough(): number {
    return this.throughBy.get('primary') ?? 0;
  }

  /** Highest primary seq held, which is above `unbrokenThrough` while there is a hole. */
  get highestSeq(): number {
    let max = 0;
    for (const seq of this.held.get('primary')?.keys() ?? []) if (seq > max) max = seq;
    return max;
  }

  /** How far each helper stream is held with no hole, by stream. */
  get helperCursors(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [stream, through] of this.throughBy) if (stream !== 'primary') out[stream] = through;
    return out;
  }

  /** An event of any stream is held beyond a hole. */
  get hasGap(): boolean {
    for (const [stream, events] of this.held) if (events.size > (this.throughBy.get(stream) ?? 0)) return true;
    return false;
  }

  /**
   * The game's record: the unbroken run of the primary stream from seq 1 with
   * each helper's unbroken run merged in. Same array until it changes.
   */
  get events(): readonly GameEvent[] {
    return this.ordered;
  }

  /**
   * Adds events, ignoring ones already held, other games and streams that
   * don't count. Returns true when the record changed.
   *
   * `fromClub` is false for events read from Studio over the venue link
   * (venue.ts), which the club's database has not confirmed. The club's copy
   * always wins: when it holds a different event at a seq the venue link gave
   * first, the club's replaces it. Between two copies from the club, the
   * first is kept, as ever.
   */
  add(events: Iterable<GameEvent | null>, fromClub = true): boolean {
    const touched = new Set<string>();
    let replaced = false;
    for (const e of events) {
      if (!e || e.gameId !== this.gameId || !counts(e.stream, e.type)) continue;
      let stream = this.held.get(e.stream);
      if (!stream) this.held.set(e.stream, (stream = new Map()));
      const key = `${e.stream} ${e.seq}`;
      const had = stream.get(e.seq);
      if (had) {
        // Only the club's copy of an event so far held from the venue link changes anything.
        if (!fromClub || !this.unconfirmed.delete(key) || had.id === e.id) continue;
        replaced = true;
      } else if (!fromClub) this.unconfirmed.add(key);
      stream.set(e.seq, e);
      touched.add(e.stream);
    }
    let grew = replaced;
    for (const name of touched) {
      const stream = this.held.get(name) as Map<number, GameEvent>;
      const before = this.throughBy.get(name) ?? 0;
      let through = before;
      while (stream.has(through + 1)) through += 1;
      this.throughBy.set(name, through);
      if (through > before) grew = true;
    }
    if (!grew) return false;
    const all: GameEvent[] = [];
    for (const stream of this.held.values()) all.push(...stream.values());
    this.ordered = mergeStreams(all);
    return true;
  }
}
