import type { GameEvent } from '@firstpass/schema';
import { formatClock } from '../live/summary';
import { buildModel, gameTime, shotsOf, type GameModel, type Possession } from './possessions';
import { MIN_POSSESSIONS, MIN_SHOTS, WINDOW } from './tiles';

/*
 * Alert cards: insights in coaching words, from the Vision UI doc and the
 * prototype. A rule proposes a candidate when its gap passes WEAK; a new card
 * needs the stronger GAP and three gates:
 *   - enough behind it (8 possessions, 5 shots);
 *   - quiet: at most one new card every 90 s of game time, at most 3 live,
 *     one live card per subject;
 *   - self-retiring: a live card updates its numbers while its rule still
 *     holds and retires when it stops holding.
 * A coach's dismissal hides that subject's live card on their device for the
 * rest of the quarter (visibleLive); the game's card history stays the same
 * on every device.
 *
 * Cards are replayed from the event log in order, checking the rules each
 * time a possession ends, so every coach's device shows the same cards at the
 * same moments, and a late joiner sees the history.
 */

export const GAP = 0.2;
export const WEAK = 0.15;
export const QUIET_MS = 90_000;
export const MAX_LIVE = 3;

export interface Candidate {
  subject: string;
  /** 'act' cards suggest something the coach can change; 'trend' cards describe. */
  kind: 'act' | 'trend';
  gap: number;
  headline: string;
  count: string;
  anchor: string;
}

export interface Card extends Candidate {
  /** subject@game time, stable across devices and replays. */
  id: string;
  period: number;
  /** Game time and quarter clock when it was raised. */
  createdAt: number;
  createdWhen: string;
  retiredWhen: string | null;
}

export interface AlertState {
  live: Card[];
  /** Every card raised this game, newest first. */
  log: Card[];
}

const pct = (g: number, n: number) => (n ? `${Math.round((100 * g) / n)}%` : '–');
const rate = (list: Possession[]) => (list.length ? list.filter((p) => p.outcome === 'goal').length / list.length : 0);
const goalsOf = (list: Possession[]) => list.filter((p) => p.outcome === 'goal').length;
const when = (period: number, clockMs: number) => `Q${period} ${formatClock(clockMs)}`;

/** Why a window looks the way it does: since a change of ours, this quarter, or the last N. */
function anchorFor(model: GameModel, list: Possession[]): string {
  if (!list.length) return '';
  const first = list[0]!;
  const t0 = gameTime(first.period, first.clockMs);
  const change = [...model.changes].reverse().find((c) => c.team === 'us' && gameTime(c.period, c.clockMs) <= t0 + 1 && gameTime(c.period, c.clockMs) >= t0 - 60_000);
  if (change) return `since our ${change.position} change, ${when(change.period, change.clockMs)}`;
  if (list.every((p) => p.period === model.period)) return 'this quarter';
  return `last ${list.length}`;
}

const TILE_RULES = [
  { subject: 'cp', label: 'CP to goal', source: 'centre pass' },
  { subject: 'gain', label: 'Gain to goal', source: 'gain' },
  { subject: 'turnover', label: 'Turnover to goal', source: 'turnover' },
] as const;

/** Every rule's candidate on the game so far. */
export function candidates(model: GameModel): Candidate[] {
  const out: Candidate[] = [];
  const ours = model.possessions.filter((p) => p.team === 'us' && p.outcome !== 'open');
  const theirs = model.possessions.filter((p) => p.team === 'them' && p.outcome !== 'open');

  for (const r of TILE_RULES) {
    const list = ours.filter((p) => p.source === r.source);
    if (list.length < MIN_POSSESSIONS) continue;
    const last = list.slice(-WINDOW);
    const gap = rate(last) - rate(list);
    if (Math.abs(gap) < WEAK) continue;
    out.push({
      subject: r.subject,
      kind: 'trend',
      gap: Math.abs(gap),
      headline: `${r.label} ${gap < 0 ? 'has dropped' : 'is up'}`,
      count: `${goalsOf(last)} of ${last.length} (${pct(goalsOf(last), last.length)}), was ${pct(goalsOf(list), list.length)}`,
      anchor: anchorFor(model, last),
    });
  }

  const shots = shotsOf(ours);
  if (shots.length >= WINDOW) {
    const last = shots.slice(-WINDOW);
    const g = (l: typeof shots) => l.filter((s) => s.goal).length;
    const gap = g(last) / last.length - g(shots) / shots.length;
    if (gap <= -WEAK) {
      out.push({ subject: 'shooting', kind: 'trend', gap: -gap, headline: 'Shooting has dropped', count: `${g(last)} of ${last.length} (${pct(g(last), last.length)}), was ${pct(g(shots), shots.length)}`, anchor: 'last 8 shots' });
    }
  }

  for (const position of ['GS', 'GA'] as const) {
    const name = model.lineup[position];
    if (!name) continue;
    const mine = shots.filter((s) => s.player === name);
    const now = mine.filter((s) => s.period === model.period);
    if (now.length < MIN_SHOTS) continue;
    const g = (l: typeof mine) => l.filter((s) => s.goal).length;
    const gap = g(now) / now.length - g(mine) / mine.length;
    if (Math.abs(gap) < WEAK) continue;
    out.push({
      subject: `shooter:${name}`,
      kind: 'act',
      gap: Math.abs(gap),
      headline: `${name} (${position}) is ${gap < 0 ? 'cold' : 'hot'}`,
      count: `${g(now)} of ${now.length} (${pct(g(now), now.length)}) this quarter, ${pct(g(mine), mine.length)} for the game`,
      anchor: 'this quarter',
    });
  }

  const last8 = ours.slice(-WINDOW);
  if (last8.length >= WINDOW) {
    const away = last8.filter((p) => p.loss && !p.loss.forced && p.loss.at && p.loss.at.x >= 2 / 3).length;
    if (away >= 3) {
      out.push({
        subject: 'attacking-third',
        kind: 'act',
        gap: away / WINDOW,
        headline: 'We are giving it away in the attacking third',
        count: `${away} unforced in our last ${WINDOW} possessions`,
        anchor: anchorFor(model, last8),
      });
    }
  }

  const their8 = theirs.slice(-WINDOW);
  if (their8.length >= WINDOW) {
    const won = (l: Possession[]) => l.filter((p) => p.loss?.forced).length;
    const gameRate = won(theirs) / theirs.length;
    if (won(their8) === 0 && gameRate >= 0.18) {
      out.push({
        subject: 'gains-dry',
        kind: 'trend',
        gap: gameRate,
        headline: `No gains in their last ${WINDOW} possessions`,
        count: `we had won ${pct(won(theirs), theirs.length)} of their possessions`,
        anchor: anchorFor(model, their8),
      });
    }
  }
  return out;
}

/** Act cards first, then the biggest gap, then the newest. */
export function rank<T extends Candidate & { createdAt?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.kind === 'act' ? 0 : 1) - (b.kind === 'act' ? 0 : 1) || b.gap - a.gap || (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

const ENDS = new Set(['Goal', 'Miss', 'Won it', 'Lost it']);

/** Replays the log and returns the cards. */
export function runAlerts(events: readonly GameEvent[]): AlertState {
  const live: Card[] = [];
  const log: Card[] = [];
  let lastNew = -Infinity;
  // Rule checks run on the log up to each possession end; corrections are
  // applied to each prefix, as a coach watching live would have seen them.
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const end = (e.type === 'action' && ENDS.has(e.payload.action)) || e.type === 'period_end';
    if (!end) continue;
    const model = buildModel(events.slice(0, i + 1));
    const clockMs = e.payload.clockMs;
    const period = e.payload.period;
    const now = gameTime(period, clockMs);
    const found = candidates(model);
    const nowWhen = when(period, clockMs);

    for (let j = live.length - 1; j >= 0; j--) {
      const card = live[j]!;
      const still = found.find((c) => c.subject === card.subject);
      if (!still) {
        card.retiredWhen = nowWhen;
        live.splice(j, 1);
      } else {
        Object.assign(card, { headline: still.headline, count: still.count, anchor: still.anchor, gap: still.gap });
      }
    }

    const fresh = rank(found.filter((c) => c.gap >= GAP && !live.some((l) => l.subject === c.subject)));
    if (fresh.length && now - lastNew >= QUIET_MS && live.length < MAX_LIVE) {
      const c = fresh[0]!;
      const card: Card = { ...c, id: `${c.subject}@${now}`, period, createdAt: now, createdWhen: nowWhen, retiredWhen: null };
      live.unshift(card);
      log.unshift(card);
      lastNew = now;
    }
  }
  return { live: rank(live), log };
}

/** The live cards this coach sees: not ones whose subject they dismissed this quarter. */
export function visibleLive(live: readonly Card[], muted: ReadonlyMap<string, number>, period: number): Card[] {
  return live.filter((c) => muted.get(c.subject) !== period);
}
