import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DB_PATH ?? "./data/router.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const raw = new DatabaseSync(dbPath);
raw.exec("PRAGMA journal_mode = WAL;");

function wrap(sql: string) {
  const stmt = raw.prepare(sql);
  return {
    get: (...params: any[]) => stmt.get(...params) as any,
    all: (...params: any[]) => stmt.all(...params) as any[],
    run: (...params: any[]) => {
      const r = stmt.run(...params) as any;
      return { lastInsertRowid: (r as any).lastInsertRowid ?? 0, changes: (r as any).changes ?? 0 };
    },
  };
}

export const db = {
  prepare: wrap,
  exec: (sql: string) => raw.exec(sql),
};

raw.exec(`
CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  auth_scheme TEXT NOT NULL DEFAULT 'Bearer',
  extra_headers TEXT NOT NULL DEFAULT '{}',
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  key_value TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_failures INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS virtual_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL UNIQUE,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  upstream_model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  model TEXT NOT NULL,
  provider_id INTEGER,
  key_id INTEGER,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  error TEXT NOT NULL DEFAULT ''
);
`);

// Seed contoh: 1 provider OpenRouter + 1 model virtual
const n = (db.prepare("SELECT COUNT(*) AS c FROM providers").get() as any).c;
if (n === 0) {
  db.prepare(
    `INSERT INTO providers (name, base_url, auth_scheme, extra_headers, timeout_ms, enabled)
     VALUES ('openrouter','https://openrouter.ai/api/v1','Bearer','{}',60000,1)`
  ).run();
  const p = db.prepare("SELECT id FROM providers WHERE name='openrouter'").get() as any;
  db.prepare(
    `INSERT INTO virtual_models (alias, provider_id, upstream_model, enabled)
     VALUES ('auto-free', ?, 'meta-llama/llama-3.3-70b-instruct:free', 1)`
  ).run(p.id);
}
