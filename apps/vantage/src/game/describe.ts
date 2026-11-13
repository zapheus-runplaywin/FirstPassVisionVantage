import { reboundLabel, zoneOf, type LiveEvent } from '@firstpass/engine';
import type { GameConfig, Position } from '@firstpass/schema';
import { shortName } from './useGame';

/** One ribbon line in plain words, e.g. "Won it · Sam GD · intercept · centre third, near side". */
export function describe(e: LiveEvent, config: GameConfig, lineup: Partial<Record<Position, string>>): string {
  switch (e.type) {
    case 'flag':
      return 'Flag' + (e.payload.at ? ' · ' + zoneOf(e.payload.at).label : '');
    case 'lineup_change':
      return 'Sub · ' + e.payload.detail;
    case 'period_start':
      return `Q${e.payload.period} start`;
    case 'period_end':
      return `Q${e.payload.period} end`;
    case 'clock_start':
      return 'Clock start';
    case 'clock_stop':
      return 'Clock stop';
    case 'action': {
      const a = e.payload;
      const who =
        a.team === 'them'
          ? config.them
          : a.player && a.player !== '?'
            ? `${shortName(lineup[a.player])} ${a.player}`.trim()
            : '?';
      let text = `${a.action} · ${who}`;
      if (a.cause) text += ' · ' + a.cause.toLowerCase();
      if (a.rebound) text += ' · ' + reboundLabel(a.rebound, a.team, config);
      if (a.at) text += ' · ' + zoneOf(a.at).label;
      return text;
    }
  }
}
