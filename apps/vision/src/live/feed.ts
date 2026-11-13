import type { GameEvent } from '@firstpass/schema';
import { LiveLog } from './log';

/*
 * Keeps a LiveLog up to date for one game. The Realtime topic game:<id> is the
 * fast path; reads from game_events are the safety net. The feed reads:
 * - at start and whenever the channel (re)joins, to catch up;
 * - straight away when a broadcast leaves a hole;
 * - every POLL_MS while the channel is not joined (live updates have not yet
 *   run on a club project, so the app must work without them);
 * - every SAFETY_MS regardless, in case a broadcast is lost with no later
 *   event to show the hole.
 * Reads run one at a time; a request during a read runs once it ends.
 */

export type Connection = 'connecting' | 'live' | 'polling';

export interface FeedDeps {
  gameId: string;
  /** Primary events with seq above `afterSeq`, in seq order. */
  fetchSince: (afterSeq: number) => Promise<GameEvent[]>;
  onChange: () => void;
  now?: () => number;
}

export const POLL_MS = 5_000;
export const SAFETY_MS = 30_000;
export const TICK_MS = 1_000;

export class GameFeed {
  readonly log: LiveLog;
  connection: Connection = 'connecting';
  /** When the device last received a new event, by its own clock. */
  lastEventAt: number | null = null;
  /** When a read last succeeded. */
  lastReadAt: number | null = null;
  /** The last read's error, cleared by the next good read. */
  error: string | null = null;

  private readonly now: () => number;
  private reading: Promise<void> | null = null;
  private again = false;
  private lastReadStartedAt = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly deps: FeedDeps) {
    this.log = new LiveLog(deps.gameId);
    this.now = deps.now ?? Date.now;
  }

  start(): void {
    this.stopped = false;
    void this.refresh();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One event from the broadcast. */
  receive(event: GameEvent | null): void {
    if (this.stopped || !event) return;
    this.apply([event]);
    if (this.log.hasGap) void this.refresh();
  }

  /** The Realtime channel's status, as subscribe() reports it. */
  setChannelStatus(status: string): void {
    const joined = status === 'SUBSCRIBED';
    const next: Connection = joined ? 'live' : 'polling';
    if (next !== this.connection) {
      this.connection = next;
      this.deps.onChange();
    }
    if (joined) void this.refresh();
  }

  /** Reads everything after the unbroken run. Safe to call often. */
  refresh(): Promise<void> {
    if (this.reading) {
      this.again = true;
      return this.reading;
    }
    this.reading = this.read().finally(() => {
      this.reading = null;
      if (this.again && !this.stopped) {
        this.again = false;
        void this.refresh();
      }
    });
    return this.reading;
  }

  tick(): void {
    if (this.stopped) return;
    const since = this.now() - this.lastReadStartedAt;
    if (since >= SAFETY_MS || (this.connection !== 'live' && since >= POLL_MS)) void this.refresh();
  }

  private async read(): Promise<void> {
    this.lastReadStartedAt = this.now();
    try {
      const events = await this.deps.fetchSince(this.log.unbrokenThrough);
      if (this.stopped) return;
      this.lastReadAt = this.now();
      this.error = null;
      if (!this.apply(events)) this.deps.onChange();
    } catch (e) {
      if (this.stopped) return;
      this.error = e instanceof Error ? e.message : String(e);
      this.deps.onChange();
    }
  }

  /** Adds events and tells the screen when anything shows. */
  private apply(events: GameEvent[]): boolean {
    if (!this.log.add(events)) return false;
    this.lastEventAt = this.now();
    this.deps.onChange();
    return true;
  }
}
