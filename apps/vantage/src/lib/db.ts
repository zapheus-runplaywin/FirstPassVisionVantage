import type { GameConfig, GameEvent, StreamId } from '@firstpass/schema';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

/*
 * Everything Vantage records lives in one SQLite file on the device, so a game
 * survives the app closing, a flat battery or no signal. Events are only ever
 * inserted; corrections are events too.
 *
 * A game is on this device either because it is being recorded here (its own
 * stream is 'primary') or because this statistician is helping with it (its
 * own stream is 'helper:<their id>'). Events written here go to the game's
 * own stream; events of its other streams are copies read from the club.
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
  // Then the helper columns: the stream this device writes, and whether the recorder has turned the helper on.
  for (const col of [
    'club_code TEXT',
    'team_id TEXT',
    'fixture_id TEXT',
    'pair_code TEXT',
    'acked_seq INTEGER NOT NULL DEFAULT 0',
    "own_stream TEXT NOT NULL DEFAULT 'primary'",
    'helper_on INTEGER NOT NULL DEFAULT 0',
  ]) {
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
  /** The club whose database the game goes to; null while the game is local only. */
  clubCode: string | null;
  /** The squad or team and PlayHQ fixture it was started from, when known. */
  teamId: string | null;
  fixtureId: string | null;
  /** Set once the server has the game; shown to the coach and shadow. */
  pairCode: string | null;
  /** Highest seq of the game's own stream the server has confirmed. */
  ackedSeq: number;
  /** The stream this device writes: 'primary' when the game is recorded here, 'helper:<id>' when helping with it. */
  ownStream: StreamId;
  /** Recorder only: the helper is turned on for this game. */
  helperOn: boolean;
}

interface GameRow {
  id: string;
  config: string;
  created_at: string;
  club_code: string | null;
  team_id: string | null;
  fixture_id: string | null;
  pair_code: string | null;
  acked_seq: number;
  own_stream: string;
  helper_on: number;
}

const GAME_COLS = 'id, config, created_at, club_code, team_id, fixture_id, pair_code, acked_seq, own_stream, helper_on';

function toGame(r: GameRow): SavedGame {
  return {
    id: r.id,
    config: JSON.parse(r.config) as GameConfig,
    createdAt: r.created_at,
    clubCode: r.club_code,
    teamId: r.team_id,
    fixtureId: r.fixture_id,
    pairCode: r.pair_code,
    ackedSeq: r.acked_seq,
    ownStream: r.own_stream as StreamId,
    helperOn: r.helper_on === 1,
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
      'INSERT INTO games (id, config, created_at, club_code, team_id, fixture_id, pair_code, acked_seq, own_stream, helper_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      game.id,
      JSON.stringify(game.config),
      game.createdAt,
      game.clubCode,
      game.teamId,
      game.fixtureId,
      game.pairCode,
      game.ackedSeq,
      game.ownStream,
      game.helperOn ? 1 : 0,
    );
    for (const e of events) insert(d, e);
  });
}

/**
 * Starts (or picks up again) helping with a game recorded on another tablet:
 * keeps the game with the helper's own stream, and how far the club already
 * has that stream. A game already on this device keeps its events.
 */
export function saveHelpedGame(game: SavedGame): void {
  open().runSync(
    `INSERT INTO games (id, config, created_at, club_code, team_id, fixture_id, pair_code, acked_seq, own_stream, helper_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT (id) DO UPDATE SET pair_code = excluded.pair_code, club_code = excluded.club_code,
       acked_seq = MAX(acked_seq, excluded.acked_seq)
     WHERE own_stream = excluded.own_stream`,
    game.id,
    JSON.stringify(game.config),
    game.createdAt,
    game.clubCode,
    game.teamId,
    game.fixtureId,
    game.pairCode,
    game.ackedSeq,
    game.ownStream,
  );
}

export function markSynced(gameId: string, ackedSeq: number, pairCode: string | null): void {
  open().runSync('UPDATE games SET acked_seq = ?, pair_code = COALESCE(?, pair_code) WHERE id = ?', ackedSeq, pairCode, gameId);
}

/** Recorder only: remembers whether the helper is turned on for a game. */
export function setHelperOn(gameId: string, on: boolean): void {
  open().runSync('UPDATE games SET helper_on = ? WHERE id = ?', on ? 1 : 0, gameId);
}

/** Events of the game's own stream the server has not confirmed yet, in seq order. */
export function loadUnsent(gameId: string, stream: StreamId, afterSeq: number, limit: number): GameEvent[] {
  return loadEvents(gameId)
    .filter((e) => e.stream === stream && e.seq > afterSeq)
    .slice(0, limit);
}

/**
 * Everything held for a game, every stream, each in seq order. The game's
 * record is `mergeStreams` of this (@firstpass/engine).
 */
export function loadEvents(gameId: string): GameEvent[] {
  const rows = open().getAllSync<{ id: string; stream: string; seq: number; type: string; payload: string; recorded_at: string }>(
    'SELECT id, stream, seq, type, payload, recorded_at FROM events WHERE game_id = ? ORDER BY stream, seq',
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

/**
 * Keeps copies of events read from the club (another tablet's stream). Ones
 * already held are left alone. Returns how many were new.
 */
export function saveRemoteEvents(events: readonly GameEvent[]): number {
  const d = open();
  let added = 0;
  d.withTransactionSync(() => {
    for (const e of events) {
      added += d.runSync(
        'INSERT OR IGNORE INTO events (game_id, stream, seq, id, type, payload, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        e.gameId,
        e.stream,
        e.seq,
        e.id,
        e.type,
        JSON.stringify(e.payload),
        e.recordedAt,
      ).changes;
    }
  });
  return added;
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
