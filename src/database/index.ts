// ============================================
// Ultron AI — Database Connection (Drizzle + SQLite)
// ============================================

import Database, { Database as BetterSqlite3Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';
import { logger } from '../utils/logger';
import { config } from '../config';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: BetterSqlite3Database | null = null;

export function getDatabase() {
  if (!_db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return _db;
}

export function getSqlite(): BetterSqlite3Database {
  if (!_sqlite) {
    throw new Error('SQLite not initialized.');
  }
  return _sqlite;
}

export async function initDatabase(): Promise<void> {
  const dbPath = config.database.path;
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info(`Created database directory: ${dbDir}`);
  }

  _sqlite = new Database(dbPath);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');

  _db = drizzle(_sqlite, { schema });

  await createTables();
  logger.info(`✅ Database initialized: ${dbPath}`);
}

async function createTables(): Promise<void> {
  const sqlite = getSqlite();

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary TEXT NOT NULL,
      tags TEXT,
      importance INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      platform TEXT NOT NULL,
      match_score REAL NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      location TEXT,
      salary TEXT,
      discovered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      platform TEXT,
      status TEXT NOT NULL DEFAULT 'saved'
        CHECK(status IN ('saved','ready','applied','interview','offer','rejected')),
      match_score REAL,
      url TEXT,
      notes TEXT,
      applied_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      due_date TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Boss',
      created_at TEXT NOT NULL
    );
  `);
}

export async function closeDatabase(): Promise<void> {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
    logger.info('Database connection closed.');
  }
}

// ---- Repository helpers ----

export const db = {
  get instance() { return getDatabase(); },

  settings: {
    get(key: string): string | null {
      const sqlite = getSqlite();
      const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    set(key: string, value: string): void {
      const sqlite = getSqlite();
      sqlite.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    },
  },
};
