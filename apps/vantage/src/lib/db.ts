import type { GameConfig, GameEvent } from '@firstpass/schema';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

/*
 * Everything Vantage records lives in one SQLite file on the device, so a game
 * survives the app closing, a flat battery or no signal. Events are only ever
 * inserted; corrections are events too.
 */

let db: SQLiteDatabase | null = null;

function open(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync('vantage.db');
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY NOT NULL,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      game_id TEXT NOT NULL,
      stream TEXT NOT NULL,
      seq INTEGER NOT NULL,
      id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (game_id, stream, seq)
    );
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `);
  // Sync columns, added after the first release.
  for (const col of ['club_id TEXT', 'team_id TEXT', 'pair_code TEXT', 'acked_seq INTEGER NOT NULL DEFAULT 0']) {
    try {
      db.execSync(`ALTER TABLE games ADD COLUMN ${col}`);
    } catch {
      // Already there.
    }
  }
  return db;
}

export function getKv(key: string): string | null {
  return open().getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)?.value ?? null;
}

export function setKv(key: string, value: string): void {
  open().runSync('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
}

export interface SavedGame {
  id: string;
  config: GameConfig;
  createdAt: string;
  /** The club and team on the server; null while the game is local only. */
  clubId: string | null;
  teamId: string | null;
  /** Set once the server has the game; shown to the coach and shadow. */
  pairCode: string | null;
  /** Highest seq the server has confirmed. */
  ackedSeq: number;
}

interface GameRow {
  id: string;
  config: string;
  created_at: string;
  club_id: string | null;
  team_id: string | null;
  pair_code: string | null;
  acked_seq: number;
}

const GAME_COLS = 'id, config, created_at, club_id, team_id, pair_code, acked_seq';

function toGame(r: GameRow): SavedGame {
  return {
    id: r.id,
    config: JSON.parse(r.config) as GameConfig,
    createdAt: r.created_at,
    clubId: r.club_id,
    teamId: r.team_id,
    pairCode: r.pair_code,
    ackedSeq: r.acked_seq,
  };
}

export function listGames(): SavedGame[] {
  return open()
    .getAllSync<GameRow>(`SELECT ${GAME_COLS} FROM games ORDER BY created_at DESC`)
    .map(toGame);
}

export function getGame(id: string): SavedGame | null {
  const r = open().getFirstSync<GameRow>(`SELECT ${GAME_COLS} FROM games WHERE id = ?`, id);
  return r ? toGame(r) : null;
}

export function createGame(game: SavedGame, events: readonly GameEvent[]): void {
  const d = open();
  d.withTransactionSync(() => {
    d.runSync(
      'INSERT INTO games (id, config, created_at, club_id, team_id) VALUES (?, ?, ?, ?, ?)',
      game.id,
      JSON.stringify(game.config),
      game.createdAt,
      game.clubId,
      game.teamId,
    );
    for (const e of events) insert(d, e);
  });
}

export function markSynced(gameId: string, ackedSeq: number, pairCode: string | null): void {
  open().runSync('UPDATE games SET acked_seq = ?, pair_code = COALESCE(?, pair_code) WHERE id = ?', ackedSeq, pairCode, gameId);
}

/** Events the server has not confirmed yet, in seq order. */
export function loadUnsent(gameId: string, afterSeq: number, limit: number): GameEvent[] {
  return loadEvents(gameId).filter((e) => e.seq > afterSeq).slice(0, limit);
}

export function loadEvents(gameId: string): GameEvent[] {
  const rows = open().getAllSync<{ id: string; stream: string; seq: number; type: string; payload: string; recorded_at: string }>(
    'SELECT id, stream, seq, type, payload, recorded_at FROM events WHERE game_id = ? ORDER BY seq',
    gameId,
  );
  return rows.map(
    (r) =>
      ({
        id: r.id,
        gameId,
        stream: r.stream,
        seq: r.seq,
        type: r.type,
        payload: JSON.parse(r.payload),
        recordedAt: r.recorded_at,
      }) as GameEvent,
  );
}

export function appendEvent(event: GameEvent): void {
  insert(open(), event);
}

function insert(d: SQLiteDatabase, e: GameEvent): void {
  d.runSync(
    'INSERT INTO events (game_id, stream, seq, id, type, payload, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    e.gameId,
    e.stream,
    e.seq,
    e.id,
    e.type,
    JSON.stringify(e.payload),
    e.recordedAt,
  );
}
