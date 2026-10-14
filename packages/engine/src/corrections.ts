import type { GameEvent } from '@firstpass/schema';

export type LiveEvent = Exclude<GameEvent, { type: 'correction' }>;

/**
 * The events that still stand once Undo, Delete and Edit have been applied,
 * in log order. Edits return a new event object; the log itself is untouched.
 */
export function liveEvents(events: readonly GameEvent[]): LiveEvent[] {
  const deleted = new Set<string>();
  const patches = new Map<string, NonNullable<Extract<GameEvent, { type: 'correction' }>['payload']['patch']>>();
  for (const event of events) {
    if (event.type !== 'correction') continue;
    const { target, op, patch } = event.payload;
    if (op === 'delete') deleted.add(target);
    else if (patch) patches.set(target, { ...patches.get(target), ...patch });
  }

  const live: LiveEvent[] = [];
  for (const event of events) {
    if (event.type === 'correction' || deleted.has(event.id)) continue;
    const patch = patches.get(event.id);
    if (patch && event.type === 'action') {
      const payload = { ...event.payload, ...patch };
      // The opposition is recorded at team level only.
      if (payload.team === 'them') payload.player = null;
      live.push({ ...event, payload });
    } else {
      live.push(event);
    }
  }
  return live;
}
