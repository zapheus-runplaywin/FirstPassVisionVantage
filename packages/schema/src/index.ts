/**
 * Shared event model for Vantage, Vision and the database.
 *
 * Every game is an append-only log of events. Each stream has exactly one
 * writer: the primary statistician ("primary") or a shadow statistician
 * ("shadow:<userId>"). Within a stream, `seq` is assigned by the client and is
 * gapless, so a reader can always tell when it has missed an event.
 *
 * Event payloads are added in Phase 1 alongside the engine.
 */

export type StreamId = 'primary' | `shadow:${string}`;

export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
  /** UUIDv7, generated on the device that recorded the event. */
  id: string;
  gameId: string;
  stream: StreamId;
  /** 1-based, gapless within (gameId, stream). */
  seq: number;
  type: TType;
  payload: TPayload;
  /** Device wall-clock time the event was recorded, ISO 8601. */
  recordedAt: string;
}
