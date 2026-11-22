import { addLines, emptyLine, netPointsPer10, playerKey, shootingPercent, type PlayerLine, type SeasonPlayer } from '@firstpass/engine';
import { POSITIONS, type Position } from '@firstpass/schema';

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

/*
 * Games nobody recorded. PlayHQ may still hold the score and each shooter's
 * goals from the association's scorer, and HQ reads them for the people who
 * see the team's games. They join the season view marked as PlayHQ's, with
 * shooting only: PlayHQ knows nothing of court time, gains or Net Points.
 */

/** One of our players in a game read from PlayHQ. */
export interface PlayhqPlayer {
  name: string;
  positions: string[];
  goals: number;
  /** Every attempt, or null when the scorer recorded goals only. */
  shots: number | null;
}

/** A game nobody recorded, as PlayHQ has it. */
export interface PlayhqGame {
  id: string;
  /** Such as "2 May v Swans". */
  label: string;
  playedAt: string;
  us: number;
  them: number;
  players: PlayhqPlayer[];
}

/** What PlayHQ had for a player in a game: their goals, and attempts when recorded. */
export interface FromPlayhq {
  goals: number;
  shots: number | null;
}

type SeasonGameRow = SeasonPlayer['games'][number] & { playhq?: FromPlayhq };

/** A season player whose games may include ones from PlayHQ. */
export interface SeasonAthlete extends SeasonPlayer {
  games: SeasonGameRow[];
}

const recorded = (p: SeasonAthlete): boolean => p.games.some((g) => !g.playhq);

/**
 * The season's players with PlayHQ's games added. A player is matched by
 * name, as between recorded games. Goals join the shooting total only when
 * PlayHQ has the attempts too, so the percentage stays true; goals alone
 * show on the game's own row. Most time on court first, as before.
 */
export function withPlayhq(players: readonly SeasonPlayer[], games: readonly PlayhqGame[]): SeasonAthlete[] {
  const byKey = new Map<string, SeasonAthlete>();
  for (const p of players) byKey.set(playerKey(p.name), { ...p, games: [...p.games] });
  for (const g of games) {
    for (const pl of g.players) {
      const key = playerKey(pl.name);
      if (!key) continue;
      const line = emptyLine();
      line.positions = POSITIONS.filter((pos: Position) => pl.positions.includes(pos));
      if (pl.shots !== null) {
        line.goals = pl.goals;
        line.shots = Math.max(pl.shots, pl.goals);
      }
      const p = byKey.get(key) ?? { name: pl.name.trim().replace(/\s+/g, ' '), games: [], total: emptyLine() };
      p.games.push({ id: `playhq:${g.id}`, label: g.label, playedAt: g.playedAt, line, playhq: { goals: pl.goals, shots: pl.shots } });
      p.total = addLines(p.total, line);
      byKey.set(key, p);
    }
  }
  const out = [...byKey.values()];
  for (const p of out) p.games.sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  return out.sort((a, b) => b.total.courtMs - a.total.courtMs || a.name.localeCompare(b.name));
}

/** The games from PlayHQ in a line, such as "2 May v Swans 41–38". */
export const playhqScores = (games: readonly PlayhqGame[]): string =>
  [...games]
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt))
    .map((g) => `${g.label} ${g.us}–${g.them}`)
    .join(' · ');

/** One row an athlete, in the order given (most time on court first). */
export function seasonRows(players: readonly SeasonAthlete[]): string[][] {
  return players.map((p) => {
    // Someone only PlayHQ names has shooting and nothing else to show.
    const seen = recorded(p);
    return [
      p.name,
      String(p.games.length),
      seen ? courtMinutes(p.total.courtMs) : '–',
      shooting(p.total),
      seen ? String(p.total.gains) : '–',
      seen ? String(p.total.turnovers) : '–',
      seen ? signed(p.total.netPoints) : '–',
      per10(p.total),
    ];
  });
}

export const ROUND_HEAD = ['Game', 'On court', 'Played', 'Shooting', 'Gains', 'Lost', 'Pens', 'Net Pts'];

/** One athlete's games, oldest first, then a Season row when there is more than one. */
export function roundRows(player: SeasonAthlete): string[][] {
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
  const fromPlayhq = (g: SeasonGameRow & { playhq: FromPlayhq }): string[] => [
    `${g.label} · PlayHQ`,
    '–',
    g.line.positions.join(' '),
    g.playhq.shots !== null ? shooting(g.line) : g.playhq.goals ? `${g.playhq.goals} ${g.playhq.goals === 1 ? 'goal' : 'goals'}` : '–',
    '–',
    '–',
    '–',
    '–',
  ];
  const rows = player.games.map((g) => (g.playhq ? fromPlayhq({ ...g, playhq: g.playhq }) : row(g.label, g.line)));
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

export const PLAYHQ_NOTE =
  "Games marked PlayHQ had no statistician. They come from PlayHQ's scoresheet, which has shooting only, so they add nothing to time on court, gains or Net Points. Goals with no attempts recorded show on the game's row and stay out of the percentage.";

export const SEASON_NOTE = 'For the coaching team. This view names players: keep it within the team and do not post it publicly.';
