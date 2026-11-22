import { courtTime, deriveGame, netPoints } from '@firstpass/engine';
import type { GameConfig, GameEvent } from '@firstpass/schema';

/*
 * The game report: the whole game on one page, for after the game. It is the
 * same set of tables the statistician sees in Vantage ("Game so far"), made by
 * the same engine functions from the same events, so the two always agree.
 * Each table is plain text rows, ready to show.
 */

export interface ReportTable {
  title: string;
  head: string[];
  rows: string[][];
  /** Said in place of the rows when there are none. */
  empty: string;
}

export interface GameReport {
  tables: ReportTable[];
  /** Where our unforced turnovers happened, such as "attack 3 · centre 5"; empty when there were none. */
  unforcedByThird: string;
}

// Short enough for six columns on a phone: the counts behind shooting are in the Shooters table.
const pct = (g: number, n: number): string => (n ? `${Math.round((100 * g) / n)}%` : '–');
const outOf = (g: number, n: number): string => (n ? `${g}/${n}` : '–');

/** Minutes and seconds, such as "12:30". */
export function minutes(ms: number): string {
  const sec = Math.round(Math.max(0, ms) / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function gameReport(config: GameConfig, events: readonly GameEvent[]): GameReport {
  const state = deriveGame(config, events);
  const np = netPoints(events);
  const onCourt = courtTime(events, config.quarterMs);

  const quarters = Object.entries(state.quarters).map(([q, v]) => [
    `Q${q}`,
    `${v.us}–${v.them}`,
    outOf(v.centrePassGoals, v.centrePasses),
    pct(v.goals, v.shots),
    String(v.gains),
    String(v.unforced),
  ]);
  if (quarters.length > 1) {
    const all = Object.values(state.quarters);
    const sum = (pick: (v: (typeof all)[number]) => number) => all.reduce((n, v) => n + pick(v), 0);
    quarters.push([
      'Game',
      `${state.score.us}–${state.score.them}`,
      outOf(sum((v) => v.centrePassGoals), sum((v) => v.centrePasses)),
      pct(sum((v) => v.goals), sum((v) => v.shots)),
      String(sum((v) => v.gains)),
      String(sum((v) => v.unforced)),
    ]);
  }

  const rebounds = Object.entries(state.reboundsByPlayer)
    .sort((a, b) => b[1].offensive + b[1].defensive - (a[1].offensive + a[1].defensive))
    .map(([name, r]) => [name, String(r.offensive), String(r.defensive)]);
  const teamRebounds = (['us', 'them'] as const).filter((t) => state.rebounds[t].offensive + state.rebounds[t].defensive > 0);

  const players = Object.entries(np.byPlayer).sort((a, b) => b[1] - a[1]);

  return {
    tables: [
      { title: 'By quarter', head: ['Qtr', 'Score', 'CP to goal', 'Shooting', 'Gains', 'Unforced'], rows: quarters, empty: 'No quarters played yet.' },
      {
        title: 'Shooters',
        head: ['Shooter', 'Goals', '%'],
        rows: Object.entries(state.shotsByPlayer)
          .sort((a, b) => b[1].attempts - a[1].attempts)
          .map(([name, v]) => [`${name} (${v.positions.join(', ')})`, `${v.goals} of ${v.attempts}`, pct(v.goals, v.attempts)]),
        empty: 'No shots recorded.',
      },
      {
        title: 'Time on court',
        head: ['Player', 'Game', 'Played at'],
        rows: Object.entries(onCourt)
          .sort((a, b) => b[1].totalMs - a[1].totalMs)
          .map(([name, t]) => [name, minutes(t.totalMs), Object.keys(t.byPosition).join(' ')]),
        empty: 'No lineup recorded.',
      },
      {
        title: 'Rebounds',
        head: ['', 'Offensive', 'Defensive'],
        rows: [...rebounds, ...teamRebounds.map((t) => [config[t], String(state.rebounds[t].offensive), String(state.rebounds[t].defensive)])],
        empty: 'No rebounds recorded.',
      },
      {
        title: 'Net Points',
        head: ['', 'Net Points'],
        rows: players.length || np.team.us || np.team.them ? [...players.map(([name, v]) => [name, String(v)]), [config.us, String(np.team.us)], [config.them, String(np.team.them)]] : [],
        empty: 'Nothing to score yet.',
      },
    ],
    unforcedByThird: Object.entries(state.unforcedByThird)
      .map(([third, n]) => `${third} ${n}`)
      .join(' · '),
  };
}
