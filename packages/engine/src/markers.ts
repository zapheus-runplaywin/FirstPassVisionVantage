import type { GameConfig, GameEvent, Position } from '@firstpass/schema';
import { liveEvents } from './corrections';
import { applyEvent, initialState } from './game';
import { zoneOf } from './geometry';

/**
 * Video markers: the game's events as named points on a video editor's
 * timeline, so a coach drops the recording of the game into the editor with
 * one file from here and finds every goal, miss, gain and turnover marked.
 *
 * Three steps, each a pure function:
 *   1. `videoMarkers`  the standing events as markers, each at the moment it
 *                      was recorded (the device's clock, which keeps running
 *                      through stoppages as the video does).
 *   2. `placeMarkers`  those moments as frames of the video, from when the
 *                      video started (`VideoSync`).
 *   3. `markersEdl`, `markersXml`, `markersList`  the file an editor reads.
 */

export type MarkerKind = 'goal' | 'miss' | 'gain' | 'loss' | 'centre pass' | 'feed' | 'touch' | 'penalty' | 'sub' | 'quarter' | 'mark';

/** DaVinci Resolve's marker colours, the ones used here. */
export type MarkerColour = 'Green' | 'Red' | 'Blue' | 'Yellow' | 'Cyan' | 'Purple' | 'Pink' | 'Sand' | 'Cream' | 'Fuchsia';

/** Every kind of marker, in the order a list of choices shows them. */
export const MARKER_KINDS: readonly { kind: MarkerKind; label: string; colour: MarkerColour }[] = [
  { kind: 'goal', label: 'Goals', colour: 'Green' },
  { kind: 'miss', label: 'Missed shots', colour: 'Red' },
  { kind: 'gain', label: 'Gains', colour: 'Blue' },
  { kind: 'loss', label: 'Turnovers', colour: 'Yellow' },
  { kind: 'centre pass', label: 'Centre passes', colour: 'Cyan' },
  { kind: 'feed', label: 'Feeds', colour: 'Purple' },
  { kind: 'touch', label: 'Touches', colour: 'Sand' },
  { kind: 'penalty', label: 'Penalties', colour: 'Pink' },
  { kind: 'sub', label: 'Substitutions', colour: 'Cream' },
  { kind: 'quarter', label: 'Quarter starts and ends', colour: 'Cream' },
  { kind: 'mark', label: 'Marked moments', colour: 'Fuchsia' },
];

const COLOUR_OF = Object.fromEntries(MARKER_KINDS.map((k) => [k.kind, k.colour])) as Record<MarkerKind, MarkerColour>;

export interface VideoMarker {
  kind: MarkerKind;
  /** When it was recorded, ms since 1970 by the recording device's clock. */
  atMs: number;
  /** Short enough for a timeline: "Goal GS Ava Lee · Q1 14:53". */
  name: string;
  /** The rest: team, court third, where the possession came from. */
  note: string;
  colour: MarkerColour;
  quarter: number;
}

export interface VideoMarkerOptions {
  /**
   * Whether a player may be named in the file. Left out, everyone is. Where
   * it says no, the marker carries the position alone ("Goal GS") and a
   * substitution's detail, which is all names, is left out.
   */
  mayName?: (label: string) => boolean;
  /**
   * Moments marked somewhere else (FirstPass Studio's Mark moment key), in
   * the same form as a flag's payload, to go in the same file.
   */
  marks?: readonly { atMs: number; period?: number; clockMs?: number; label?: string }[];
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const when = (period: number, clockMs: number): string => `Q${period} ${clock(clockMs)}`;

/**
 * The game's standing events as video markers, oldest first. Corrections are
 * applied and deleted events left out. Clock starts and stops are not marked:
 * they follow the bench clock, not the play.
 */
export function videoMarkers(config: GameConfig, events: readonly GameEvent[], options: VideoMarkerOptions = {}): VideoMarker[] {
  const mayName = options.mayName ?? (() => true);
  const markers: VideoMarker[] = [];
  const add = (kind: MarkerKind, atMs: number, quarter: number, name: string, note: string[]) => {
    if (Number.isFinite(atMs)) markers.push({ kind, atMs, name, note: note.filter(Boolean).join(' · '), colour: COLOUR_OF[kind], quarter });
  };

  let state = initialState(config);
  for (const e of liveEvents(events)) {
    const atMs = Date.parse(e.recordedAt);
    const { period, clockMs } = e.payload;
    const at = when(period, clockMs);
    if (e.type === 'action') {
      const a = e.payload;
      const lineup: Partial<Record<Position, string>> = state.lineup ?? {};
      const ours = a.team === 'us';
      const team = ours ? config.us : config.them;
      let who = '';
      if (ours && a.player) {
        const label = a.player === '?' ? '' : (lineup[a.player] ?? '');
        who = label && mayName(label) ? `${a.player} ${label}` : a.player;
      }
      const third = a.at ? `${zoneOf(a.at).third} third` : '';
      const chain = state.chain?.team === a.team ? `from a ${state.chain.from}` : '';
      const lead = ours ? '' : `${team}: `;
      const name = (what: string) => [`${lead}${what}`, who, '·', at].filter(Boolean).join(' ');
      switch (a.action) {
        case 'Goal':
          add('goal', atMs, period, name('Goal'), [team, third, chain]);
          break;
        case 'Miss': {
          const rebound = a.rebound === 'ours' ? 'offensive rebound' : a.rebound === 'theirs' ? 'defensive rebound' : a.rebound === 'out' ? 'out of court' : '';
          add('miss', atMs, period, name('Miss'), [team, third, chain, rebound]);
          break;
        }
        case 'Won it':
          add('gain', atMs, period, name(a.cause ? `Gain (${a.cause})` : 'Gain'), [team, third]);
          break;
        case 'Lost it':
          add('loss', atMs, period, name(a.cause ? `Turnover (${a.cause})` : 'Turnover'), [team, third, chain]);
          break;
        case 'Receive':
          add('centre pass', atMs, period, name('Centre pass'), [team, third]);
          break;
        case 'Feed':
          add('feed', atMs, period, name('Feed'), [team, third]);
          break;
        case 'Touch':
          add('touch', atMs, period, name('Touch'), [team, third]);
          break;
        case 'Penalty':
          add('penalty', atMs, period, name(a.cause ? `Penalty (${a.cause})` : 'Penalty'), [team, third]);
          break;
      }
    } else if (e.type === 'lineup_change') {
      const team = e.payload.team === 'us' ? config.us : config.them;
      add('sub', atMs, period, `Sub · ${at}`, [team, options.mayName ? '' : e.payload.detail]);
    } else if (e.type === 'period_start') {
      add('quarter', atMs, period, `Q${period} starts`, []);
    } else if (e.type === 'period_end') {
      add('quarter', atMs, period, `Q${period} ends`, []);
    } else if (e.type === 'flag') {
      add('mark', atMs, period, `Marked moment · ${at}`, [e.payload.at ? `${zoneOf(e.payload.at).third} third` : '']);
    }
    state = applyEvent(state, e);
  }

  for (const m of options.marks ?? []) {
    const known = typeof m.period === 'number' && typeof m.clockMs === 'number' && Number.isFinite(m.period) && Number.isFinite(m.clockMs);
    add('mark', m.atMs, known ? (m.period as number) : 0, [m.label || 'Marked moment', known ? `· ${when(m.period as number, m.clockMs as number)}` : ''].filter(Boolean).join(' '), []);
  }
  return markers.sort((a, b) => a.atMs - b.atMs);
}

/** When the game's clock was first started, by the recording device's clock: the moment to find in the video. Null before it has been. */
export function firstClockStart(events: readonly GameEvent[]): number | null {
  const start = liveEvents(events).find((e) => e.type === 'clock_start');
  const at = start ? Date.parse(start.recordedAt) : NaN;
  return Number.isFinite(at) ? at : null;
}

/* ---------- placing markers on the video ---------- */

/** Frames a second. 29.97 and 59.94 run slow against the clock, which an hour of game shows. */
export const VIDEO_RATES = [25, 50, 29.97, 30, 59.94, 60, 24] as const;
export type VideoRate = (typeof VIDEO_RATES)[number];

const exact = (fps: VideoRate): number => (fps === 29.97 ? 30000 / 1001 : fps === 59.94 ? 60000 / 1001 : fps);
/** What the timecode counts to each second: 30 for 29.97. */
const base = (fps: VideoRate): number => Math.round(fps);
const ntsc = (fps: VideoRate): boolean => fps === 29.97 || fps === 59.94;

/** A person presses the key after seeing the play, so each marker sits this long before the press. */
export const DEFAULT_LEAD_MS = 5000;

export interface VideoSync {
  /** When the video's first frame was, ms since 1970 by the clock the events were recorded with. */
  videoStartMs: number;
  fps: VideoRate;
  /** How long before the press each marker sits. Quarter starts and ends sit on the press. */
  leadMs?: number;
  /** Only these kinds; left out, all of them. */
  kinds?: readonly MarkerKind[];
  /** How long the video is, when known: markers after its end are left out. */
  videoLengthMs?: number;
}

export interface PlacedMarker extends VideoMarker {
  /** Frames from the video's first frame. */
  frame: number;
  /** The same as time into the video, in ms. */
  offsetMs: number;
}

export interface Placed {
  markers: PlacedMarker[];
  /** How many fell before the video starts or after it ends and were left out. */
  outside: number;
  fps: VideoRate;
}

/** `videoStartMs` when a known moment (the first clock start) is seen this far into the video. */
export function videoStartFrom(momentMs: number, intoVideoMs: number): number {
  return momentMs - intoVideoMs;
}

export function placeMarkers(markers: readonly VideoMarker[], sync: VideoSync): Placed {
  const lead = Math.max(0, sync.leadMs ?? DEFAULT_LEAD_MS);
  const kinds = sync.kinds ? new Set(sync.kinds) : null;
  const rate = exact(sync.fps);
  const placed: PlacedMarker[] = [];
  let outside = 0;
  for (const m of markers) {
    if (kinds && !kinds.has(m.kind)) continue;
    const pressed = m.atMs - sync.videoStartMs;
    if (pressed < 0 || (sync.videoLengthMs !== undefined && pressed > sync.videoLengthMs)) {
      outside++;
      continue;
    }
    const offsetMs = Math.max(0, pressed - (m.kind === 'quarter' ? 0 : lead));
    placed.push({ ...m, offsetMs, frame: Math.round((offsetMs / 1000) * rate) });
  }
  return { markers: placed, outside, fps: sync.fps };
}

/* ---------- reading what a person types ---------- */

/**
 * A time into a video as a person types it: "3:12", "1:03:12", "192" (seconds)
 * or "3:12.5". Null when it isn't one.
 */
export function parseVideoTime(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p.trim()))) return null;
  const n = parts.map((p) => Number(p.trim()));
  if (n.slice(0, -1).some((v) => !Number.isInteger(v)) || (parts.length > 1 && n.slice(1).some((v) => v >= 60))) return null;
  const seconds = n.reduce((total, v) => total * 60 + v, 0);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

/**
 * A timecode as a recorder shows it, "HH:MM:SS:FF" (or with ; or . before the
 * frames), as ms from 00:00:00:00 at this rate. Null when it isn't one.
 */
export function parseTimecode(text: string, fps: VideoRate): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})(?:[:;.](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const [h, min, s, f] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0)];
  if (h > 23 || min > 59 || s > 59 || f >= base(fps)) return null;
  // Above 30 frames a second a recorder counts frame pairs (0 to 24 at 50) and an editor every frame (0 to 49).
  // Either is taken; the half frame between them is far inside the time a person takes to press a key.
  const pairs = base(fps) / 2;
  const counted = base(fps) > 30 && f < pairs ? pairs : base(fps);
  return Math.round((h * 3600 + min * 60 + s + f / counted) * 1000);
}

/* ---------- the files ---------- */

/** "HH:MM:SS:FF" for a frame count, counting `base` frames to the second (non-drop). */
export function timecode(frames: number, fps: VideoRate): string {
  const b = base(fps);
  const f = Math.max(0, Math.round(frames));
  const two = (n: number) => String(n).padStart(2, '0');
  const seconds = Math.floor(f / b);
  return `${two(Math.floor(seconds / 3600))}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}:${two(f % b)}`;
}

/** Keeps a name to one line of plain text an EDL can carry: its fields are split on "|". */
const oneLine = (s: string): string => s.replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Where an editor's new timeline starts unless told otherwise: one hour. */
const HOUR_S = 3600;

/**
 * A marker EDL for DaVinci Resolve (Timelines, Import, Timeline Markers from
 * EDL), for a timeline that starts at 01:00:00:00 with the video at its very
 * start. An EDL has no room for a note, so the name carries everything.
 */
export function markersEdl(title: string, placed: Placed): string {
  const start = HOUR_S * base(placed.fps);
  const lines = [`TITLE: ${oneLine(title)}`, 'FCM: NON-DROP FRAME', ''];
  placed.markers.forEach((m, i) => {
    const at = timecode(start + m.frame, placed.fps);
    const next = timecode(start + m.frame + 1, placed.fps);
    lines.push(`${String(i + 1).padStart(3, '0')}  001      V     C        ${at} ${next} ${at} ${next}  `);
    lines.push(` |C:ResolveColor${m.colour} |M:${oneLine(m.name)} |D:1`);
    lines.push('');
  });
  return lines.join('\n');
}

const xml = (s: string): string =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/**
 * A sequence with the markers on it and no clips, in Final Cut Pro 7 XML,
 * which Adobe Premiere Pro (File, Import) and DaVinci Resolve (File, Import,
 * Timeline) both read. The video goes on the sequence at its very start.
 */
export function markersXml(title: string, placed: Placed): string {
  const b = base(placed.fps);
  const rate = `<rate><timebase>${b}</timebase><ntsc>${ntsc(placed.fps) ? 'TRUE' : 'FALSE'}</ntsc></rate>`;
  const last = placed.markers.reduce((max, m) => Math.max(max, m.frame), 0);
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE xmeml>', '<xmeml version="4">', '  <sequence>'];
  out.push(`    <name>${xml(oneLine(title))}</name>`);
  out.push(`    <duration>${last + 10 * b}</duration>`);
  out.push(`    ${rate}`);
  out.push(`    <timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>`);
  out.push('    <media><video><track></track></video><audio><track></track></audio></media>');
  for (const m of placed.markers) {
    out.push(`    <marker><name>${xml(oneLine(m.name))}</name><comment>${xml(oneLine(m.note))}</comment><in>${m.frame}</in><out>-1</out></marker>`);
  }
  out.push('  </sequence>', '</xmeml>', '');
  return out.join('\n');
}

/** "0:03:12 Goal GS Ava Lee · Q1 14:53", one a line: for any player, a document, or a video's chapters. */
export function markersList(placed: Placed): string {
  return placed.markers
    .map((m) => {
      const s = Math.floor(m.offsetMs / 1000);
      return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} ${oneLine(m.name)}${m.note ? ` (${oneLine(m.note)})` : ''}`;
    })
    .join('\n')
    .concat(placed.markers.length ? '\n' : '');
}

/** "thunder-v-storm-markers" for the files' names. */
export function markersFileStem(config: GameConfig): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'team';
  return `${slug(config.us)}-v-${slug(config.them)}-markers`;
}

/* ---------- one file, ready to save ---------- */

export type MarkerFormat = 'edl' | 'xml' | 'list';

/** The files on offer, in the order a list of choices shows them. */
export const MARKER_FORMATS: readonly { format: MarkerFormat; label: string; ext: string; mime: string; how: string }[] = [
  { format: 'edl', label: 'DaVinci Resolve', ext: 'edl', mime: 'text/plain', how: 'Put the video at the very start of a new timeline (it starts at 01:00:00:00), then Timelines, Import, Timeline Markers from EDL.' },
  { format: 'xml', label: 'Premiere Pro', ext: 'xml', mime: 'application/xml', how: 'File, Import brings in a sequence that holds the markers. Put the video at its very start.' },
  { format: 'list', label: 'Plain list', ext: 'txt', mime: 'text/plain', how: 'Each moment as a time into the video, to read beside any player.' },
];

/** The line every file that can carry one does: these files name players. */
export const MARKERS_NOTE = 'For the coaching team. This file names players: keep it within the team and do not post it publicly.';

/** One of the files, with the name to save it under. */
export function markerFile(format: MarkerFormat, config: GameConfig, placed: Placed): { name: string; text: string; mime: string } {
  const title = `${config.us} v ${config.them} markers`;
  const kind = MARKER_FORMATS.find((f) => f.format === format) ?? MARKER_FORMATS[0]!;
  const text = format === 'edl' ? markersEdl(title, placed) : format === 'xml' ? markersXml(title, placed) : `${title}\n${MARKERS_NOTE}\n\n${markersList(placed)}`;
  return { name: `${markersFileStem(config)}.${kind.ext}`, text, mime: kind.mime };
}

/**
 * The whole job for an app with no recorder to ask: the person finds the
 * moment the first quarter's clock was started in their video (the first
 * centre pass whistle, near enough) and types how far into the video it is.
 */
export function markersFromClockStart(
  config: GameConfig,
  events: readonly GameEvent[],
  given: { into: string; fps: VideoRate; leadMs?: number; kinds?: readonly MarkerKind[] },
): { placed: Placed; error?: undefined } | { error: string; placed?: undefined } {
  const start = firstClockStart(events);
  if (start === null) return { error: 'The clock was never started in this game, so there is no moment to line the video up with.' };
  const into = parseVideoTime(given.into);
  if (into === null) return { error: 'Type how far into the video the first quarter starts, such as 3:12.' };
  const sync: VideoSync = { videoStartMs: videoStartFrom(start, into), fps: given.fps };
  if (given.leadMs !== undefined) sync.leadMs = given.leadMs;
  if (given.kinds) sync.kinds = given.kinds;
  const placed = placeMarkers(videoMarkers(config, events), sync);
  if (!placed.markers.length) return { error: 'There is nothing to mark with those choices.' };
  return { placed };
}
