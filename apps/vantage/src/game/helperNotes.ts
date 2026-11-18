import { isHelperStream, lineupsAt, liveEvents, type LiveEvent } from '@firstpass/engine';
import type { GameConfig, GameEvent, Position } from '@firstpass/schema';
import { describe } from './describe';

/*
 * What a helper statistician changed, in words, for the tablet recording the
 * game: nothing changes behind the recorder's back. One note per helper
 * event, oldest first.
 */

export interface HelperNote {
  /** The helper event's id. */
  id: string;
  text: string;
}

function clock(ms: number): string {
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** e.g. "Q2 06:12 Goal · Chen GA". */
function line(e: LiveEvent, config: GameConfig, lineups: Lineups): string {
  return `Q${e.payload.period} ${clock(e.payload.clockMs)} ${describe(e, config, lineups(e.id))}`;
}

type Lineups = (id: string) => Partial<Record<Position, string>>;

/** `events` is the game's record (`mergeStreams`). */
export function helperNotes(events: readonly GameEvent[], config: GameConfig): HelperNote[] {
  const helper = events.filter((e) => isHelperStream(e.stream));
  if (helper.length === 0) return [];
  // Who was in each position when each stat was recorded. A stat that has since been deleted has no place in the
  // record, so it is looked up in the log as it was recorded, before any correction.
  const standing = lineupsAt(events);
  const asRecorded = lineupsAt(events.filter((e) => e.type !== 'correction'));
  const lineups: Lineups = (id) => standing.get(id) ?? asRecorded.get(id) ?? {};
  const byId = new Map(events.map((e) => [e.id, e]));
  // Each event as it stands now, after every correction.
  const now = new Map(liveEvents(events).map((e) => [e.id, e]));

  return helper.map((h) => {
    if (h.type === 'lineup_change') return { id: h.id, text: `Helper sub: ${h.payload.detail}` };
    if (h.type !== 'correction') return { id: h.id, text: 'Helper change' };
    const target = byId.get(h.payload.target);
    if (!target || target.type === 'correction') return { id: h.id, text: h.payload.op === 'delete' ? 'Helper deleted an event' : 'Helper changed an event' };
    if (h.payload.op === 'delete') return { id: h.id, text: `Helper deleted: ${line(target, config, lineups)}` };
    const after = now.get(target.id);
    return { id: h.id, text: after ? `Helper changed: ${line(after, config, lineups)}` : `Helper changed, since deleted: ${line(target, config, lineups)}` };
  });
}

/** The notes the recorder has not seen yet, given the ids already seen. */
export function unseenNotes(notes: readonly HelperNote[], seen: ReadonlySet<string>): HelperNote[] {
  return notes.filter((n) => !seen.has(n.id));
}
