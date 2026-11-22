import type { ActionPayload, GameConfig, GameEvent } from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import {
  firstClockStart,
  MARKER_FORMATS,
  MARKER_KINDS,
  markerFile,
  MARKERS_NOTE,
  markersEdl,
  markersFileStem,
  markersFromClockStart,
  markersList,
  markersXml,
  parseTimecode,
  parseVideoTime,
  placeMarkers,
  timecode,
  videoMarkers,
  videoStartFrom,
} from './markers';

const Q = 15 * 60_000;
const T0 = Date.parse('2026-10-25T09:00:00Z');
const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: Q, q1AttackEnd: 'right', firstCentrePass: 'us' };

let seq = 0;
function ev(type: GameEvent['type'], payload: object, atMs: number): GameEvent {
  seq++;
  return { id: `t${seq}`, gameId: 'g', stream: 'primary', seq, type, payload, recordedAt: new Date(T0 + atMs).toISOString() } as GameEvent;
}
function act(a: Partial<ActionPayload> & Pick<ActionPayload, 'team' | 'action'>, atMs: number, clockMs = Q - atMs + 5_000): GameEvent {
  return ev('action', { period: 1, clockMs, player: null, ...a }, atMs);
}

function game(): GameEvent[] {
  seq = 0;
  return [
    ev('period_start', { period: 1, clockMs: Q, attackEnd: 'right', centrePass: 'us', mode: 'core' }, 0),
    ev('lineup_change', { period: 1, clockMs: Q, team: 'us', lineup: { GS: 'Ava Lee', GA: 'Mia Tran', C: 'Zoe Hart' }, bench: [], detail: 'Starting seven' }, 1_000),
    ev('clock_start', { period: 1, clockMs: Q }, 5_000),
    act({ team: 'us', action: 'Receive', player: 'C' }, 6_000),
    act({ team: 'us', action: 'Goal', player: 'GS', at: { x: 0.95, y: 0.5 } }, 12_000),
    act({ team: 'them', action: 'Receive' }, 20_000),
    act({ team: 'us', action: 'Won it', player: 'GA', cause: 'Intercept', at: { x: 0.5, y: 0.2 } }, 31_000),
    act({ team: 'us', action: 'Miss', player: 'GA', rebound: 'theirs' }, 40_000),
    act({ team: 'them', action: 'Goal' }, 52_000),
    ev('flag', { period: 1, clockMs: Q - 55_000 }, 60_000),
    act({ team: 'us', action: 'Lost it', player: '?', cause: 'Bad pass' }, 70_000),
    ev('period_end', { period: 1, clockMs: 0 }, 905_000),
  ];
}

describe('videoMarkers', () => {
  it('names each standing event with who, what and when in the game', () => {
    const names = videoMarkers(config, game()).map((m) => m.name);
    expect(names).toEqual([
      'Q1 starts',
      'Sub · Q1 15:00',
      'Centre pass C Zoe Hart · Q1 14:59',
      'Goal GS Ava Lee · Q1 14:53',
      'Storm: Centre pass · Q1 14:45',
      'Gain (Intercept) GA Mia Tran · Q1 14:34',
      'Miss GA Mia Tran · Q1 14:25',
      'Storm: Goal · Q1 14:13',
      'Marked moment · Q1 14:05',
      'Turnover (Bad pass) ? · Q1 13:55',
      'Q1 ends',
    ]);
  });

  it('puts each marker at the moment it was recorded, with a colour for its kind', () => {
    const goal = videoMarkers(config, game()).find((m) => m.kind === 'goal');
    expect(goal).toMatchObject({ atMs: T0 + 12_000, colour: 'Green', quarter: 1, note: 'Thunder · attacking third · from a centre pass' });
    expect(new Set(MARKER_KINDS.map((k) => k.kind)).size).toBe(MARKER_KINDS.length);
  });

  it('says how a miss ended and where a goal came from', () => {
    const markers = videoMarkers(config, game());
    expect(markers.find((m) => m.kind === 'miss')?.note).toBe('Thunder · from a gain · defensive rebound');
    expect(markers.find((m) => m.name.startsWith('Storm: Goal'))?.note).toBe('Storm · from a rebound');
  });

  it('applies corrections: an edit changes the marker and a deleted event has none', () => {
    const events = game();
    const goal = events[4];
    const miss = events[7];
    events.push(ev('correction', { target: goal!.id, op: 'edit', patch: { action: 'Miss', rebound: 'out' } }, 100_000));
    events.push(ev('correction', { target: miss!.id, op: 'delete' }, 101_000));
    const markers = videoMarkers(config, events);
    expect(markers.filter((m) => m.kind === 'goal').map((m) => m.name)).toEqual(['Storm: Goal · Q1 14:13']);
    expect(markers.filter((m) => m.kind === 'miss').map((m) => m.name)).toEqual(['Miss GS Ava Lee · Q1 14:53']);
  });

  it('leaves out the names it may not use, and a substitution detail with them', () => {
    const markers = videoMarkers(config, game(), { mayName: (label) => label === 'Ava Lee' });
    const text = JSON.stringify(markers);
    expect(text).toContain('Goal GS Ava Lee');
    expect(text).toContain('Gain (Intercept) GA · Q1 14:34');
    expect(text).not.toContain('Mia Tran');
    expect(text).not.toContain('Zoe Hart');
    expect(text).not.toContain('Starting seven');
  });

  it('keeps a substitution detail when everyone may be named', () => {
    expect(videoMarkers(config, game()).find((m) => m.kind === 'sub')?.note).toBe('Thunder · Starting seven');
  });

  it('takes moments marked elsewhere into the same list, in time order', () => {
    const markers = videoMarkers(config, game(), { marks: [{ atMs: T0 + 45_000, period: 1, clockMs: Q - 40_000 }, { atMs: T0 + 2_000_000 }, { atMs: NaN }] });
    const marks = markers.filter((m) => m.kind === 'mark').map((m) => m.name);
    expect(marks).toEqual(['Marked moment · Q1 14:20', 'Marked moment · Q1 14:05', 'Marked moment']);
    expect(markers.map((m) => m.atMs)).toEqual([...markers.map((m) => m.atMs)].sort((a, b) => a - b));
  });

  it('has nothing for an empty game', () => {
    expect(videoMarkers(config, [])).toEqual([]);
    expect(firstClockStart([])).toBeNull();
  });
});

describe('placeMarkers', () => {
  const markers = () => videoMarkers(config, game());

  it('finds the video start from where the first clock start is seen in it', () => {
    const start = firstClockStart(game());
    expect(start).toBe(T0 + 5_000);
    expect(videoStartFrom(start as number, 192_000)).toBe(T0 + 5_000 - 192_000);
  });

  it('places each marker a lead before the press, and quarter markers on it', () => {
    const placed = placeMarkers(markers(), { videoStartMs: T0 - 60_000, fps: 25 });
    const goal = placed.markers.find((m) => m.kind === 'goal');
    expect(goal).toMatchObject({ offsetMs: 67_000, frame: 1675 });
    expect(placed.markers[0]).toMatchObject({ name: 'Q1 starts', offsetMs: 60_000, frame: 1500 });
    expect(placed.outside).toBe(0);
  });

  it('uses the lead it is given and never goes before the first frame', () => {
    const placed = placeMarkers(markers(), { videoStartMs: T0 + 4_000, fps: 25, leadMs: 3_000 });
    expect(placed.markers.find((m) => m.kind === 'centre pass')).toMatchObject({ offsetMs: 0, frame: 0 });
    expect(placed.markers.find((m) => m.kind === 'goal')).toMatchObject({ offsetMs: 5_000, frame: 125 });
  });

  it('leaves out what was recorded before the video started or after it ended, and counts them', () => {
    const placed = placeMarkers(markers(), { videoStartMs: T0 + 10_000, fps: 25, videoLengthMs: 100_000 });
    expect(placed.outside).toBe(4);
    expect(placed.markers.map((m) => m.kind)).toEqual(['goal', 'centre pass', 'gain', 'miss', 'goal', 'mark', 'loss']);
  });

  it('keeps only the kinds asked for', () => {
    const placed = placeMarkers(markers(), { videoStartMs: T0, fps: 25, kinds: ['goal', 'miss'] });
    expect(placed.markers.map((m) => m.kind)).toEqual(['goal', 'miss', 'goal']);
  });

  it('counts 29.97 frames by the real rate, not 30', () => {
    const hour = placeMarkers([{ kind: 'quarter', atMs: 3_600_000, name: 'x', note: '', colour: 'Cream', quarter: 1 }], { videoStartMs: 0, fps: 29.97 });
    expect(hour.markers[0]?.frame).toBe(107892);
    expect(timecode(107892, 29.97)).toBe('00:59:56:12');
  });
});

describe('what a person types', () => {
  it('reads a time into the video', () => {
    expect(parseVideoTime('3:12')).toBe(192_000);
    expect(parseVideoTime(' 1:03:12 ')).toBe(3_792_000);
    expect(parseVideoTime('192')).toBe(192_000);
    expect(parseVideoTime('0:07.5')).toBe(7_500);
    for (const bad of ['', 'abc', '3:72', '1:2:3:4', '-3:00', '3.5:10']) expect(parseVideoTime(bad)).toBeNull();
  });

  it('reads a timecode as time of day', () => {
    expect(parseTimecode('18:55:10:00', 25)).toBe(((18 * 60 + 55) * 60 + 10) * 1000);
    expect(parseTimecode('18:55:10:12', 25)).toBe(((18 * 60 + 55) * 60 + 10) * 1000 + 480);
    expect(parseTimecode('18:55:10', 25)).toBe(((18 * 60 + 55) * 60 + 10) * 1000);
    expect(parseTimecode('00:00:01:12', 50)).toBe(1480);
    expect(parseTimecode('00:00:01:40', 50)).toBe(1800);
    for (const bad of ['', '25:00:00:00', '10:61:00:00', '10:00:00:25', 'ten']) expect(parseTimecode(bad, 25)).toBeNull();
  });
});

describe('the files', () => {
  const placed = () => placeMarkers(videoMarkers(config, game()), { videoStartMs: T0 - 60_000, fps: 25, kinds: ['goal', 'gain'] });

  it('writes timecode', () => {
    expect(timecode(0, 25)).toBe('00:00:00:00');
    expect(timecode(90_000 + 1675, 25)).toBe('01:01:07:00');
    expect(timecode(49, 50)).toBe('00:00:00:49');
  });

  it("writes Resolve's marker EDL on a timeline that starts at one hour", () => {
    expect(markersEdl('Thunder v Storm', placed())).toBe(
      [
        'TITLE: Thunder v Storm',
        'FCM: NON-DROP FRAME',
        '',
        '001  001      V     C        01:01:07:00 01:01:07:01 01:01:07:00 01:01:07:01  ',
        ' |C:ResolveColorGreen |M:Goal GS Ava Lee · Q1 14:53 |D:1',
        '',
        '002  001      V     C        01:01:26:00 01:01:26:01 01:01:26:00 01:01:26:01  ',
        ' |C:ResolveColorBlue |M:Gain (Intercept) GA Mia Tran · Q1 14:34 |D:1',
        '',
        '003  001      V     C        01:01:47:00 01:01:47:01 01:01:47:00 01:01:47:01  ',
        ' |C:ResolveColorGreen |M:Storm: Goal · Q1 14:13 |D:1',
        '',
      ].join('\n'),
    );
  });

  it('writes a sequence of markers both editors read, from frame 0', () => {
    const text = markersXml('Thunder v Storm', placed());
    expect(text).toContain('<xmeml version="4">');
    expect(text).toContain('<name>Thunder v Storm</name>');
    expect(text).toContain('<rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>');
    expect(text).toContain('<marker><name>Goal GS Ava Lee · Q1 14:53</name><comment>Thunder · attacking third · from a centre pass</comment><in>1675</in><out>-1</out></marker>');
    expect(text.match(/<marker>/g)).toHaveLength(3);
    expect(markersXml('x', placeMarkers([], { videoStartMs: 0, fps: 29.97 }))).toContain('<timebase>30</timebase><ntsc>TRUE</ntsc>');
  });

  it('never lets a team or player name be read as markup or as an EDL field', () => {
    const odd: GameConfig = { ...config, them: 'Storm <b>&"|C:Red\nX' };
    const p = placeMarkers(videoMarkers(odd, game()), { videoStartMs: T0, fps: 25, kinds: ['goal'] });
    const text = markersXml('A <i> & B', p);
    expect(text).toContain('<name>A &lt;i&gt; &amp; B</name>');
    expect(text).not.toContain('<b>');
    const edl = markersEdl('A\nB', p);
    expect(edl.split('\n')[0]).toBe('TITLE: A B');
    expect(edl).toContain('|M:Storm <b>&" C:Red X: Goal · Q1 14:13 |D:1');
    expect(edl.match(/\|C:/g)).toHaveLength(2);
  });

  it('writes a plain list of times into the video', () => {
    expect(markersList(placed())).toBe(
      '0:01:07 Goal GS Ava Lee · Q1 14:53 (Thunder · attacking third · from a centre pass)\n' +
        '0:01:26 Gain (Intercept) GA Mia Tran · Q1 14:34 (Thunder · centre third)\n' +
        '0:01:47 Storm: Goal · Q1 14:13 (Storm · from a rebound)\n',
    );
    expect(markersList(placeMarkers([], { videoStartMs: 0, fps: 25 }))).toBe('');
  });

  it('names the files after the teams', () => {
    expect(markersFileStem(config)).toBe('thunder-v-storm-markers');
  });

  it('hands over each file with a name, and says on the list that it names players', () => {
    const p = placed();
    expect(MARKER_FORMATS.map((f) => markerFile(f.format, config, p).name)).toEqual(['thunder-v-storm-markers.edl', 'thunder-v-storm-markers.xml', 'thunder-v-storm-markers.txt']);
    expect(markerFile('edl', config, p).text).toBe(markersEdl('Thunder v Storm markers', p));
    expect(markerFile('xml', config, p).text).toBe(markersXml('Thunder v Storm markers', p));
    const list = markerFile('list', config, p).text;
    expect(list.startsWith(`Thunder v Storm markers\n${MARKERS_NOTE}\n\n0:01:07 Goal`)).toBe(true);
    expect(MARKERS_NOTE).toContain('do not post it publicly');
  });
});

describe('markersFromClockStart', () => {
  it('lines the game up from where the first clock start is in the video', () => {
    const done = markersFromClockStart(config, game(), { into: '3:12', fps: 25, kinds: ['goal'] });
    // The clock started 5 s in; the goal was pressed 7 s later and sits 5 s before the press.
    expect(done.placed?.markers[0]).toMatchObject({ name: 'Goal GS Ava Lee · Q1 14:53', offsetMs: 194_000, frame: 4850 });
  });

  it('says plainly what is missing', () => {
    expect(markersFromClockStart(config, [], { into: '3:12', fps: 25 }).error).toMatch(/clock was never started/);
    expect(markersFromClockStart(config, game(), { into: 'soon', fps: 25 }).error).toMatch(/such as 3:12/);
    expect(markersFromClockStart(config, game(), { into: '0', fps: 25, kinds: ['penalty'] }).error).toMatch(/nothing to mark/);
  });
});
