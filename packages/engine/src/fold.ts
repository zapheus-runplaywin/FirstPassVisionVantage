/**
 * Derive state from an event log. The engine is a set of pure `apply`
 * functions, so Vantage, Vision and the server always agree on the result
 * of the same events.
 */
export function fold<TState, TEvent>(
  events: Iterable<TEvent>,
  initial: TState,
  apply: (state: TState, event: TEvent) => TState,
): TState {
  let state = initial;
  for (const event of events) state = apply(state, event);
  return state;
}
