import { COURT } from '@firstpass/engine';
import type { CourtPoint, Team } from '@firstpass/schema';
import { shotsOf, type GameModel, type Possession } from './possessions';

/*
 * The Court tab, as in the prototype: where a team loses the ball, where it
 * wins it, and its shots by sector, for the whole game or one quarter. Points
 * are stored in our attacking direction (x = 1 is the baseline we attack), so
 * the court is always drawn that way, whichever team is picked.
 *
 * Nearby points are grouped into one circle with a count, so a busy spot
 * reads as busy at a glance.
 */

export type CourtMode = 'lose' | 'win' | 'shots';
export type DotKind = 'unforced' | 'forced' | 'win' | 'goal' | 'miss';

export interface Dot {
  at: CourtPoint;
  kind: DotKind;
  /** How many points were grouped into this one. */
  n: number;
}

export interface Sector {
  /** Left, centre or right of the post (as the engine names them), close (under 2.5 m) or long. */
  key: string;
  label: string;
  goals: number;
  of: number;
  /** Where to put its label, in court coordinates. */
  at: CourtPoint;
}

export interface CourtView {
  dots: Dot[];
  /** Points with no court spot recorded. */
  unplaced: number;
  legend: { kind: DotKind; label: string; count: number }[];
  /** One line under the court, e.g. "5 of 40 possessions lost". */
  line: string;
  sectors: Sector[];
}

/** Grid cells for grouping: 10 along, 5 across. */
const COLS = 10;
const ROWS = 5;

export function group(points: readonly CourtPoint[], kind: DotKind): Dot[] {
  const cells = new Map<string, { x: number; y: number; n: number }>();
  for (const p of points) {
    const key = `${Math.min(COLS - 1, Math.floor(p.x * COLS))},${Math.min(ROWS - 1, Math.floor(p.y * ROWS))}`;
    const c = cells.get(key) ?? { x: 0, y: 0, n: 0 };
    c.x += p.x;
    c.y += p.y;
    c.n++;
    cells.set(key, c);
  }
  return [...cells.values()].map((c) => ({ at: { x: c.x / c.n, y: c.y / c.n }, kind, n: c.n }));
}

const placed = <T extends { at: CourtPoint | null }>(list: T[]) => list.filter((x): x is T & { at: CourtPoint } => x.at !== null);

/** Close range, in metres from the post, as the engine's zoneOf uses. */
const CLOSE_M = 2.5;
/** Left and right sectors start 25 degrees off the line through the post. */
const SIDE_DEG = 25;

/** The sector a shot is in, for the team shooting at that end. */
export function sectorOf(at: CourtPoint, team: Team): string {
  // Metres from the post in the shooter's view; left and right as the engine's zoneOf names them.
  const toBase = (team === 'us' ? 1 - at.x : at.x) * COURT.lengthM;
  const across = (at.y - 0.5) * COURT.widthM * (team === 'us' ? 1 : -1);
  const dist = Math.hypot(toBase, across);
  const angle = (Math.atan2(across, toBase) * 180) / Math.PI;
  const side = angle < -SIDE_DEG ? 'R' : angle > SIDE_DEG ? 'L' : 'C';
  return side + (dist < CLOSE_M ? 'n' : 'l');
}

const SECTOR_NAMES: Record<string, string> = { L: 'left', C: 'centre', R: 'right', n: 'close', l: 'long' };
const SECTOR_KEYS = ['Ln', 'Cn', 'Rn', 'Ll', 'Cl', 'Rl'];

/** Where a sector's label goes. */
function sectorLabelAt(key: string, team: Team): CourtPoint {
  const near = key[1] === 'n';
  // Spread so the six labels don't overlap: near ones wider apart, long ones further out.
  const deg = { L: near ? 70 : 50, C: 0, R: near ? -70 : -50 }[key[0] as 'L' | 'C' | 'R'];
  const r = near ? 1.6 : 3.9;
  const toBase = r * Math.cos((deg * Math.PI) / 180);
  const across = r * Math.sin((deg * Math.PI) / 180);
  const x = 1 - toBase / COURT.lengthM;
  const y = 0.5 + across / COURT.widthM;
  return team === 'us' ? { x, y } : { x: 1 - x, y: 1 - y };
}

export function courtView(model: GameModel, opts: { mode: CourtMode; period: number | 'all'; team: Team; names: Record<Team, string> }): CourtView {
  const inQ = (p: Possession) => opts.period === 'all' || p.period === opts.period;
  const theirs: Team = opts.team === 'us' ? 'them' : 'us';
  const own = model.possessions.filter((p) => p.team === opts.team && inQ(p) && p.outcome !== 'open');
  const opp = model.possessions.filter((p) => p.team === theirs && inQ(p) && p.outcome !== 'open');
  const we = opts.team === 'us';

  if (opts.mode === 'lose') {
    const lost = own.filter((p) => p.loss);
    const unforced = lost.filter((p) => !p.loss!.forced).map((p) => ({ at: p.loss!.at }));
    const forced = lost.filter((p) => p.loss!.forced).map((p) => ({ at: p.loss!.at }));
    return {
      dots: [...group(placed(unforced).map((p) => p.at), 'unforced'), ...group(placed(forced).map((p) => p.at), 'forced')],
      unplaced: lost.length - placed(unforced).length - placed(forced).length,
      legend: [
        { kind: 'unforced', label: 'unforced', count: unforced.length },
        { kind: 'forced', label: we ? 'they won it' : 'we won it', count: forced.length },
      ],
      line: `${lost.length} of ${own.length} possessions lost`,
      sectors: [],
    };
  }
  if (opts.mode === 'win') {
    const won = opp.filter((p) => p.loss?.forced).map((p) => ({ at: p.loss!.at }));
    return {
      dots: group(placed(won).map((p) => p.at), 'win'),
      unplaced: won.length - placed(won).length,
      legend: [{ kind: 'win', label: we ? 'we won it' : 'they won it', count: won.length }],
      line: `${won.length} gain${won.length === 1 ? '' : 's'} in ${opp.length} ${opts.names[theirs]} possessions`,
      sectors: [],
    };
  }
  const shots = shotsOf(own);
  const goals = shots.filter((s) => s.goal).length;
  const at = placed(shots);
  const sectors = SECTOR_KEYS.map((key) => {
    const mine = at.filter((s) => sectorOf(s.at, opts.team) === key);
    return {
      key,
      label: `${SECTOR_NAMES[key[0]!]} ${SECTOR_NAMES[key[1]!]}`,
      goals: mine.filter((s) => s.goal).length,
      of: mine.length,
      at: sectorLabelAt(key, opts.team),
    };
  }).filter((s) => s.of > 0);
  return {
    dots: at.map((s) => ({ at: s.at, kind: s.goal ? ('goal' as const) : ('miss' as const), n: 1 })),
    unplaced: shots.length - at.length,
    legend: [
      { kind: 'goal', label: 'goal', count: goals },
      { kind: 'miss', label: 'miss', count: shots.length - goals },
    ],
    line: shots.length ? `${goals} of ${shots.length} (${Math.round((100 * goals) / shots.length)}%)` : 'No shots yet',
    sectors,
  };
}
