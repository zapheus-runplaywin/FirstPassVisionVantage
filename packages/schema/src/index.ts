/**
 * Shared event model for Vantage, Vision and the database.
 *
 * Every game is an append-only log of events. Each stream has exactly one
 * writer: the primary statistician ("primary") or a shadow statistician
 * ("shadow:<userId>"). Within a stream, `seq` is assigned by the client and is
 * gapless, so a reader can always tell when it has missed an event.
 *
 * Nothing is edited in place: Undo, Delete and Edit are themselves events
 * (`correction`) that point at the event they change.
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

/* ---------- game vocabulary ---------- */

export type Team = 'us' | 'them';
export type CourtEnd = 'left' | 'right';
export type EntryMode = 'core' | 'full';

export const POSITIONS = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'] as const;
export type Position = (typeof POSITIONS)[number];
/** A position, or '?' when the statistician did not see who it was. */
export type PlayerRef = Position | '?';

export const ACTIONS = ['Goal', 'Miss', 'Won it', 'Lost it', 'Receive', 'Feed', 'Touch', 'Penalty'] as const;
export type Action = (typeof ACTIONS)[number];

export const CAUSES_LOST = ['Bad pass', 'Bad hands', 'Held ball', 'Offside', 'Footwork', 'Contact', 'Obstruction', 'Out of court'] as const;
export const CAUSES_WON = ['Intercept', 'Deflection, gain', 'Block', 'Pickup', 'Rebound'] as const;
export type Cause = (typeof CAUSES_LOST)[number] | (typeof CAUSES_WON)[number];

/** Who got the ball after a missed shot. */
export type Rebound = 'ours' | 'theirs' | 'out';

/** Set once at game setup; everything else is derived from events. */
export interface GameConfig {
  us: string;
  them: string;
  quarterMs: number;
  /** The end we attack in Q1, as the statistician sees the court. */
  q1AttackEnd: CourtEnd;
  firstCentrePass: Team;
}

/**
 * A court position in attack coordinates: x runs from our defensive baseline
 * (0) to our attacking baseline (1), y across the court (0 to 1). Stored this
 * way so every quarter is comparable whichever end we attack.
 */
export interface CourtPoint {
  x: number;
  y: number;
}

/** Common to every event: when in the game it happened. */
interface GameTime {
  period: number;
  /** Time left on the quarter clock, in ms. */
  clockMs: number;
}

/* ---------- event payloads ---------- */

export interface PeriodStartPayload extends GameTime {
  /** Confirmed at the break; they are the defaults unless the statistician flipped them. */
  attackEnd: CourtEnd;
  centrePass: Team;
  mode: EntryMode;
}

export type ClockPayload = GameTime;

export interface ActionPayload extends GameTime {
  team: Team;
  /** Our player; always null for the opposition (team-level only in v1). */
  player: PlayerRef | null;
  action: Action;
  cause?: Cause | null;
  rebound?: Rebound | null;
  at?: CourtPoint | null;
}

export interface FlagPayload extends GameTime {
  at?: CourtPoint | null;
}

export interface LineupChangePayload extends GameTime {
  team: Team;
  /** Who is on court at each position after the change (player labels). */
  lineup: Partial<Record<Position, string>>;
  bench: string[];
  /** Human-readable summary, e.g. "Mia on at GA, Jade off". */
  detail: string;
}

export interface CorrectionPayload {
  /** Id of the event being corrected. */
  target: string;
  op: 'delete' | 'edit';
  /** For edits: the fields that change. */
  patch?: Partial<Pick<ActionPayload, 'team' | 'player' | 'action' | 'cause' | 'rebound'>>;
}

export type GameEvent =
  | EventEnvelope<'period_start', PeriodStartPayload>
  | EventEnvelope<'clock_start', ClockPayload>
  | EventEnvelope<'clock_stop', ClockPayload>
  /** The statistician ended the quarter; the break review follows. */
  | EventEnvelope<'period_end', ClockPayload>
  | EventEnvelope<'action', ActionPayload>
  | EventEnvelope<'flag', FlagPayload>
  | EventEnvelope<'lineup_change', LineupChangePayload>
  | EventEnvelope<'correction', CorrectionPayload>;

export type GameEventType = GameEvent['type'];
export type EventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;
