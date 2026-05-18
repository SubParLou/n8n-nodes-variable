/**
 * Cross-workflow variable storage backed by a local SQLite database.
 *
 * The database is auto-created at:
 *   ${N8N_USER_FOLDER ?? ~/.n8n}/n8n-nodes-variable.db
 *
 * No configuration is required — the database file and table are created
 * automatically on first use and shared across all workflows on the instance.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { StoredVariableEntry } from './types';

const DB_FILENAME = 'n8n-nodes-variable.db';

function getDbPath(): string {
  const userFolder =
    process.env['N8N_USER_FOLDER'] ?? path.join(os.homedir(), '.n8n');
  try {
    if (!fs.existsSync(userFolder)) {
      fs.mkdirSync(userFolder, { recursive: true });
    }
  } catch {
    // If we can't create the n8n folder, fall back to the OS temp directory
    return path.join(os.tmpdir(), DB_FILENAME);
  }
  return path.join(userFolder, DB_FILENAME);
}

// Singleton connection — reused across all node executions in the same process
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = getDbPath();
  _db = new Database(dbPath);

  // WAL journal mode allows concurrent reads alongside writes
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Auto-create the table if it doesn't exist
  _db.exec(`
    CREATE TABLE IF NOT EXISTS variables (
      namespace  TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      type       TEXT,
      created_at TEXT,
      updated_at TEXT,
      PRIMARY KEY (namespace, key)
    )
  `);

  return _db;
}

// ─── CRUD operations ─────────────────────────────────────────────────────────

export function dbGetVariable(
  namespace: string,
  key: string,
): StoredVariableEntry | undefined {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT value, type, created_at, updated_at FROM variables WHERE namespace = ? AND key = ?',
    )
    .get(namespace, key) as
    | { value: string; type?: string; created_at?: string; updated_at?: string }
    | undefined;

  if (!row) return undefined;

  return {
    value: JSON.parse(row.value) as unknown,
    type: row.type ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export function dbSetVariable(
  namespace: string,
  key: string,
  value: unknown,
  typeName: string,
  includeMetadata: boolean,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const serialized = JSON.stringify(value);

  if (includeMetadata) {
    // Preserve the original created_at on conflict
    db.prepare(
      `INSERT INTO variables (namespace, key, value, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(namespace, key) DO UPDATE SET
         value      = excluded.value,
         type       = excluded.type,
         updated_at = excluded.updated_at`,
    ).run(namespace, key, serialized, typeName, now, now);
  } else {
    db.prepare(
      `INSERT INTO variables (namespace, key, value, type, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, NULL)
       ON CONFLICT(namespace, key) DO UPDATE SET
         value      = excluded.value,
         type       = NULL,
         created_at = NULL,
         updated_at = NULL`,
    ).run(namespace, key, serialized);
  }
}

export function dbDeleteVariable(namespace: string, key: string): boolean {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM variables WHERE namespace = ? AND key = ?')
    .run(namespace, key);
  return result.changes > 0;
}

export function dbHasVariable(namespace: string, key: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT 1 FROM variables WHERE namespace = ? AND key = ? LIMIT 1',
    )
    .get(namespace, key);
  return row !== undefined;
}

export function dbListVariables(
  namespace: string,
): Record<string, StoredVariableEntry> {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT key, value, type, created_at, updated_at FROM variables WHERE namespace = ? ORDER BY key',
    )
    .all(namespace) as Array<{
    key: string;
    value: string;
    type?: string;
    created_at?: string;
    updated_at?: string;
  }>;

  const result: Record<string, StoredVariableEntry> = {};
  for (const row of rows) {
    result[row.key] = {
      value: JSON.parse(row.value) as unknown,
      type: row.type ?? undefined,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    };
  }
  return result;
}

export function dbClearNamespace(namespace: string): number {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM variables WHERE namespace = ?')
    .run(namespace);
  return result.changes;
}
