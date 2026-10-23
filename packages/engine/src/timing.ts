import type { GameConfig, GameEvent, Position } from '@firstpass/schema';
import { liveEvents } from './corrections';
import { applyEvent, initialState } from './game';
import { zoneOf } from './geometry';

/**
 * One row per standing event, for lining the log up against game video.
 * `sinceStartS` counts from the first clock start, which follows the bench
 * official's live scoring clock (not necessarily a whistle: centrally timed
 * games can start late). Video time = the clock start's time in the video +
 * `sinceStartS`.
 */
export interface TimingRow {
  seq: number;
  recordedAt: string;
  sinceStartS: number;
  quarter: number;
  /** Time left on the quarter clock, m:ss. */
  gameClock: string;
  team: string;
  position: string;
  player: string;
  event: string;
  cause: string;
  rebound: string;
  third: string;
  /** For our goals and theirs: "yes" when the goal came from that team's centre pass. */
  centrePassGoal: string;
  /** "yes" when a correction changed this event; deleted events are left out. */
  edited: string;
  note: string;
}

export const TIMING_COLUMNS: readonly { key: keyof TimingRow; label: string }[] = [
  { key: 'seq', label: 'seq' },
  { key: 'recordedAt', label: 'recorded_at' },
  { key: 'sinceStartS', label: 'since_start_s' },
  { key: 'quarter', label: 'quarter' },
  { key: 'gameClock', label: 'game_clock' },
  { key: 'team', label: 'team' },
  { key: 'position', label: 'position' },
  { key: 'player', label: 'player' },
  { key: 'event', label: 'event' },
  { key: 'cause', label: 'cause' },
  { key: 'rebound', label: 'rebound' },
  { key: 'third', label: 'third' },
  { key: 'centrePassGoal', label: 'centre_pass_goal' },
  { key: 'edited', label: 'edited' },
  { key: 'note', label: 'note' },
];

const EVENT_NAMES = {
  period_start: 'Quarter start',
  period_end: 'Quarter end',
  clock_start: 'Clock start',
  clock_stop: 'Clock stop',
  lineup_change: 'Sub',
  flag: 'Flag',
} as const;

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function timingRows(config: GameConfig, events: readonly GameEvent[]): TimingRow[] {
  const edited = new Set(events.flatMap((e) => (e.type === 'correction' && e.payload.op === 'edit' ? [e.payload.target] : [])));
  const live = liveEvents(events);
  const clockStart = live.find((e) => e.type === 'clock_start') ?? live[0];
  const start = clockStart ? Date.parse(clockStart.recordedAt) : 0;

  let state = initialState(config);
  const rows: TimingRow[] = [];
  for (const e of live) {
    const lineup: Partial<Record<Position, string>> = state.lineup ?? {};
    const row: TimingRow = {
      seq: e.seq,
      recordedAt: e.recordedAt,
      sinceStartS: Math.round(Date.parse(e.recordedAt) - start) / 1000,
      quarter: e.payload.period,
      gameClock: clock(e.payload.clockMs),
      team: '',
      position: '',
      player: '',
      event: e.type === 'action' ? e.payload.action : EVENT_NAMES[e.type],
      cause: '',
      rebound: '',
      third: '',
      centrePassGoal: '',
      edited: edited.has(e.id) ? 'yes' : '',
      note: '',
    };
    if (e.type === 'action') {
      const a = e.payload;
      row.team = a.team === 'us' ? config.us : config.them;
      if (a.action === 'Receive') row.event = 'Centre pass received';
      if (a.player) {
        row.position = a.player;
        if (a.player !== '?') row.player = lineup[a.player] ?? '';
      }
      row.cause = a.cause ?? '';
      row.rebound = a.rebound ?? '';
      if (a.at) row.third = zoneOf(a.at).third;
      if (a.action === 'Goal') {
        const chain = state.chain;
        row.centrePassGoal = chain?.team === a.team && chain.from === 'centre pass' ? 'yes' : 'no';
      }
    } else if (e.type === 'lineup_change') {
      row.team = e.payload.team === 'us' ? config.us : config.them;
      row.note = e.payload.detail;
    } else if (e.type === 'flag' && e.payload.at) {
      row.third = zoneOf(e.payload.at).third;
    }
    rows.push(row);
    state = applyEvent(state, e);
  }
  return rows;
}

/**
 * The rows as text. Tab-separated pastes straight into a spreadsheet's
 * columns; comma-separated is for saving as a .csv file.
 */
export function timingTable(rows: readonly TimingRow[], separator: '\t' | ',' = ','): string {
  const cell = (v: string | number): string => {
    const text = String(v);
    if (separator === '\t') return text.replace(/[\t\r\n]+/g, ' ');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [TIMING_COLUMNS.map((c) => c.label).join(separator)];
  for (const row of rows) lines.push(TIMING_COLUMNS.map((c) => cell(row[c.key])).join(separator));
  return lines.join('\n') + '\n';
}
