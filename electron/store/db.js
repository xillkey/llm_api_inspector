import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let db = null;

export function getDbPath() {
  return path.join(app.getPath('userData'), 'llm-inspector.db');
}

export function initDb() {
  if (db) return db;

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_enc BLOB,
      extra_headers TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER,
      model TEXT,
      path TEXT NOT NULL,
      is_stream INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'pending',
      http_status INTEGER,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      first_token_at TEXT,
      ended_at TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      error TEXT,
      upstream_model TEXT,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS request_payloads (
      request_id INTEGER PRIMARY KEY,
      request_json TEXT NOT NULL,
      response_json TEXT,
      raw_sse TEXT,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_requests_started ON requests(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_state ON requests(state);
  `);

  const proxyPort = db.prepare('SELECT value FROM settings WHERE key = ?').get('proxy_port');
  if (!proxyPort) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('proxy_port', '8317');
  }

  try {
    db.exec('ALTER TABLE requests ADD COLUMN upstream_model TEXT');
  } catch {
    // column already exists
  }

  try {
    db.exec('ALTER TABLE providers ADD COLUMN models TEXT DEFAULT \'[]\'');
  } catch {
    // column already exists
  }

  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
