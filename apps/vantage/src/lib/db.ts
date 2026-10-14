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
  `);
  return db;
}

export interface SavedGame {
  id: string;
  config: GameConfig;
  createdAt: string;
}

export function listGames(): SavedGame[] {
  const rows = open().getAllSync<{ id: string; config: string; created_at: string }>(
    'SELECT id, config, created_at FROM games ORDER BY created_at DESC',
  );
  return rows.map((r) => ({ id: r.id, config: JSON.parse(r.config) as GameConfig, createdAt: r.created_at }));
}

export function getGame(id: string): SavedGame | null {
  const r = open().getFirstSync<{ id: string; config: string; created_at: string }>(
    'SELECT id, config, created_at FROM games WHERE id = ?',
    id,
  );
  return r ? { id: r.id, config: JSON.parse(r.config) as GameConfig, createdAt: r.created_at } : null;
}

export function createGame(game: SavedGame, events: readonly GameEvent[]): void {
  const d = open();
  d.withTransactionSync(() => {
    d.runSync('INSERT INTO games (id, config, created_at) VALUES (?, ?, ?)', game.id, JSON.stringify(game.config), game.createdAt);
    for (const e of events) insert(d, e);
  });
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
