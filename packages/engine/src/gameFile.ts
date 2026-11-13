import type { GameConfig, GameEvent } from '@firstpass/schema';

/**
 * A whole game as one JSON file: the backup a statistician saves or sends
 * off the tablet, and what a later import or Studio can read. It holds the
 * full log, corrections included, so nothing is lost.
 */
export interface GameFile {
  format: 'firstpass-game';
  version: 1;
  exportedAt: string;
  gameId: string;
  config: GameConfig;
  events: GameEvent[];
}

export function gameFile(gameId: string, config: GameConfig, events: readonly GameEvent[], exportedAt: Date): GameFile {
  return { format: 'firstpass-game', version: 1, exportedAt: exportedAt.toISOString(), gameId, config, events: [...events] };
}

/** e.g. "firstpass-thunder-v-storm-2026-11-13-0915.json", in the device's local time. */
export function gameFileName(config: GameConfig, createdAt: Date): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'team';
  const two = (n: number) => String(n).padStart(2, '0');
  const d = createdAt;
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
  return `firstpass-${slug(config.us)}-v-${slug(config.them)}-${stamp}.json`;
}
