import { netPointsPer10, shootingPercent, type PlayerLine, type SeasonPlayer } from '@firstpass/engine';

/*
 * The season view: each athlete's figures over the team's finished games, and
 * one athlete's games round by round. Plain text rows, ready to show, from
 * the engine's season figures, so they agree with each game's report.
 */

/** Whole minutes on court, such as "148 min". */
export const courtMinutes = (ms: number): string => `${Math.round(ms / 60_000)} min`;

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const shooting = (l: PlayerLine): string => {
  const pct = shootingPercent(l);
  return pct === null ? '–' : `${l.goals}/${l.shots} ${pct}%`;
};
const per10 = (l: PlayerLine): string => {
  const rate = netPointsPer10(l);
  return rate === null ? '–' : signed(rate);
};

export const SEASON_HEAD = ['Athlete', 'Games', 'On court', 'Shooting', 'Gains', 'Lost', 'Net Pts', 'Per 10 min'];

/** One row an athlete, in the order given (most time on court first). */
export function seasonRows(players: readonly SeasonPlayer[]): string[][] {
  return players.map((p) => [
    p.name,
    String(p.games.length),
    courtMinutes(p.total.courtMs),
    shooting(p.total),
    String(p.total.gains),
    String(p.total.turnovers),
    signed(p.total.netPoints),
    per10(p.total),
  ]);
}

export const ROUND_HEAD = ['Game', 'On court', 'Played', 'Shooting', 'Gains', 'Lost', 'Pens', 'Net Pts'];

/** One athlete's games, oldest first, then a Season row when there is more than one. */
export function roundRows(player: SeasonPlayer): string[][] {
  const row = (label: string, l: PlayerLine): string[] => [
    label,
    courtMinutes(l.courtMs),
    l.positions.join(' '),
    shooting(l),
    String(l.gains),
    String(l.turnovers),
    String(l.penalties),
    signed(l.netPoints),
  ];
  const rows = player.games.map((g) => row(g.label, g.line));
  if (player.games.length > 1) rows.push(row('Season', player.total));
  return rows;
}

/** A line under an athlete's games, such as "3 intercepts · 12 feeds · 5 rebounds · 2 touches". */
export function extrasLine(l: PlayerLine): string {
  const say = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);
  return [
    say(l.intercepts, 'intercept', 'intercepts'),
    say(l.feeds, 'feed', 'feeds'),
    say(l.receives, 'centre pass receive', 'centre pass receives'),
    say(l.offensiveRebounds + l.defensiveRebounds, 'rebound', 'rebounds'),
    say(l.touches, 'touch', 'touches'),
    say(l.quarters, 'quarter played', 'quarters played'),
  ]
    .filter(Boolean)
    .join(' · ');
}

export const SEASON_NOTE = 'For the coaching team. This view names players: keep it within the team and do not post it publicly.';
