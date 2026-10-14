import type { CourtEnd, CourtPoint, Position } from '@firstpass/schema';

/** Court dimensions in metres. */
export const COURT = { lengthM: 30.5, widthM: 15.25, circleRadiusM: 4.9, centreCircleRadiusM: 0.45 } as const;

/** Inside this distance from the post a shot counts as close range, in metres. */
const CLOSE_RANGE_M = 2.5;

/** The end we attack in a quarter: Q1's end in odd quarters, the other end in even ones. */
export function defaultAttackEnd(q1AttackEnd: CourtEnd, period: number): CourtEnd {
  return period % 2 === 1 ? q1AttackEnd : q1AttackEnd === 'left' ? 'right' : 'left';
}

/**
 * Convert a tap on the screen (fractions of the court drawing, 0 to 1) to
 * attack coordinates, and back. Attacking left mirrors both axes.
 */
export function toAttackPoint(screen: CourtPoint, end: CourtEnd): CourtPoint {
  return end === 'right' ? { x: screen.x, y: screen.y } : { x: 1 - screen.x, y: 1 - screen.y };
}

export const toScreenPoint = toAttackPoint;

export type Third = 'defensive' | 'centre' | 'attacking';
export type Channel = 'near' | 'middle' | 'far';
export type CircleSector = 'right baseline' | 'right' | 'front' | 'left' | 'left baseline';

export interface Zone {
  third: Third;
  channel: Channel;
  /** Which goal circle the point is in, if any. */
  circle: 'ours' | 'theirs' | null;
  sector: CircleSector | null;
  range: 'close' | 'long' | null;
  centreCircle: boolean;
  label: string;
}

export function zoneOf({ x, y }: CourtPoint): Zone {
  const third: Third = x < 1 / 3 ? 'defensive' : x < 2 / 3 ? 'centre' : 'attacking';
  const channel: Channel = y < 1 / 3 ? 'near' : y < 2 / 3 ? 'middle' : 'far';
  const dy = (y - 0.5) * COURT.widthM;
  const dxOurs = (1 - x) * COURT.lengthM;
  const dOurs = Math.hypot(dxOurs, dy);
  const dTheirs = Math.hypot(x * COURT.lengthM, dy);
  const zone: Zone = { third, channel, circle: null, sector: null, range: null, centreCircle: false, label: '' };

  if (dOurs <= COURT.circleRadiusM) {
    // 0 degrees is straight out in front of the post.
    const angle = (Math.atan2(dy, dxOurs) * 180) / Math.PI;
    zone.circle = 'ours';
    zone.sector =
      angle < -54 ? 'right baseline' : angle < -18 ? 'right' : angle <= 18 ? 'front' : angle <= 54 ? 'left' : 'left baseline';
    zone.range = dOurs < CLOSE_RANGE_M ? 'close' : 'long';
    zone.label = `our circle, ${zone.sector}, ${zone.range}`;
  } else if (dTheirs <= COURT.circleRadiusM) {
    zone.circle = 'theirs';
    zone.label = 'their circle';
  } else if (Math.hypot((x - 0.5) * COURT.lengthM, dy) <= COURT.centreCircleRadiusM) {
    zone.centreCircle = true;
    zone.label = 'centre circle';
  } else {
    zone.label = `${third} third, ${channel} side`;
  }
  return zone;
}

/** Which of our positions are allowed to play the ball in a zone. */
export function legalPositions(zone: Zone): ReadonlySet<Position> {
  if (zone.circle === 'ours') return new Set(['GS', 'GA']);
  if (zone.circle === 'theirs') return new Set(['GD', 'GK']);
  if (zone.third === 'attacking') return new Set(['GS', 'GA', 'WA', 'C']);
  if (zone.third === 'centre') return new Set(['GA', 'WA', 'C', 'WD', 'GD']);
  return new Set(['C', 'WD', 'GD', 'GK']);
}
