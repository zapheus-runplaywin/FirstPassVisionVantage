import { HELPER_EVENT_TYPES, type GameEvent } from '@firstpass/schema';

/*
 * A game's record from its streams.
 *
 * The statistician recording a game writes the primary stream. A helper
 * statistician writes substitutions and corrections to a stream of their own
 * (`helper:<userId>`), and those count: every figure is folded from the
 * primary stream with the helper streams merged in. A shadow stream is a
 * private second record and never counts.
 */

const HELPER = 'helper:';
const helperTypes: readonly string[] = HELPER_EVENT_TYPES;

/** Whether a stream is a helper statistician's. */
export function isHelperStream(stream: string): boolean {
  return stream.startsWith(HELPER);
}

/** Each stream's events by seq, one per seq (the first seen wins). */
function bySeq(events: readonly GameEvent[]): Map<string, Map<number, GameEvent>> {
  const streams = new Map<string, Map<number, GameEvent>>();
  for (const e of events) {
    let held = streams.get(e.stream);
    if (!held) streams.set(e.stream, (held = new Map()));
    if (!held.has(e.seq)) held.set(e.seq, e);
  }
  return streams;
}

/** The unbroken run from seq 1, in order. */
function run(held: Map<number, GameEvent>): GameEvent[] {
  const out: GameEvent[] = [];
  for (let seq = 1; held.has(seq); seq++) out.push(held.get(seq) as GameEvent);
  return out;
}

/**
 * How far each stream is held with no gap: the highest seq with every event
 * before it present, by stream. A reader asks for what comes after it.
 */
export function streamCursors(events: readonly GameEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [stream, held] of bySeq(events)) out[stream] = run(held).length;
  return out;
}

/**
 * The game's record from everything held, in any order and with repeats: the
 * primary stream in seq order with each helper's substitutions and
 * corrections placed by the time they were recorded. Fold this, never the
 * primary stream alone, once a game may have a helper.
 *
 * - Only the unbroken run from seq 1 of each stream is used, so an event that
 *   has not arrived yet never silently changes a stat.
 * - A helper event goes before the first primary event recorded after it, so
 *   a substitution takes effect from the play that followed it. An event
 *   recorded at the same instant as a primary one goes after it.
 * - Corrections apply in this order, so when the recorder and the helper both
 *   change the same thing, the later change wins.
 * - Anything else on a helper stream, and every shadow stream, is left out.
 *
 * With no helper events the result is the primary run itself.
 */
export function mergeStreams(events: readonly GameEvent[]): GameEvent[] {
  const streams = bySeq(events);
  const primary = run(streams.get('primary') ?? new Map());
  const helper: { e: GameEvent; at: number }[] = [];
  for (const [stream, held] of streams) {
    if (!isHelperStream(stream)) continue;
    for (const e of run(held)) if (helperTypes.includes(e.type)) helper.push({ e, at: Date.parse(e.recordedAt) });
  }
  if (helper.length === 0) return primary;
  helper.sort((a, b) => a.at - b.at || (a.e.stream < b.e.stream ? -1 : a.e.stream > b.e.stream ? 1 : a.e.seq - b.e.seq));

  const out: GameEvent[] = [];
  let next = 0;
  for (const p of primary) {
    const at = Date.parse(p.recordedAt);
    while (next < helper.length && (helper[next] as { at: number }).at < at) out.push((helper[next++] as { e: GameEvent }).e);
    out.push(p);
  }
  while (next < helper.length) out.push((helper[next++] as { e: GameEvent }).e);
  return out;
}
