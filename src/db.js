// Database: node:sqlite bawaan Node 22+ (tanpa modul native, tanpa Visual Studio).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DB_PATH ?? "./data/router.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const raw = new DatabaseSync(dbPath);
raw.exec("PRAGMA journal_mode = WAL;");

function wrap(sql) {
  const stmt = raw.prepare(sql);
  return {
    get: (...params) => stmt.get(...params),
    all: (...params) => stmt.all(...params),
    run: (...params) => {
      const r = stmt.run(...params);
      return { lastInsertRowid: r.lastInsertRowid ?? 0, changes: r.changes ?? 0 };
    },
  };
}

export const db = {
  prepare: wrap,
  exec: (sql) => raw.exec(sql),
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

// Migrasi: hapus seed lama "openrouter"/"auto-free" bila masih ada dari versi sebelumnya.
// Hanya yang persis bernama seed bawaan; data milik pengguna tidak disentuh.
try {
  const seed = db.prepare("SELECT id FROM providers WHERE name='openrouter'").get();
  if (seed) {
    db.prepare("DELETE FROM api_keys WHERE provider_id=?").run(seed.id);
    db.prepare("DELETE FROM virtual_models WHERE provider_id=?").run(seed.id);
    db.prepare("DELETE FROM providers WHERE id=?").run(seed.id);
  }
  db.prepare("DELETE FROM virtual_models WHERE alias='auto-free' AND upstream_model LIKE '%llama-3.3-70b-instruct:free%'").run();
} catch {}

// Catatan: tidak ada seed provider bawaan. Pengguna menambahkan
// provider + key + model sendiri lewat dashboard.
