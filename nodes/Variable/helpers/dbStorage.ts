/**
 * Cross-workflow variable storage backed by a local JSON file.
 *
 * The file is auto-created at:
 *   ${N8N_USER_FOLDER ?? ~/.n8n}/n8n-nodes-variable-data.json
 *
 * No configuration is required. Writes are performed atomically (write to a
 * temporary file, then rename) to prevent data corruption on unexpected
 * process exit. No native dependencies are needed.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import type { StoredVariableEntry } from './types';

const DATA_FILENAME = 'n8n-nodes-variable-data.json';

interface StoredEntry {
  value: unknown;
  type?: string;
  created_at?: string;
  updated_at?: string;
}

type DbData = Record<string, Record<string, StoredEntry>>;

function getDataPath(): string {
  const userFolder =
    process.env['N8N_USER_FOLDER'] ?? path.join(os.homedir(), '.n8n');
  try {
    if (!fs.existsSync(userFolder)) {
      fs.mkdirSync(userFolder, { recursive: true });
    }
  } catch {
    // If the n8n user folder can't be created, fall back to the OS temp dir
    return path.join(os.tmpdir(), DATA_FILENAME);
  }
  return path.join(userFolder, DATA_FILENAME);
}

function readData(): DbData {
  const dataPath = getDataPath();
  try {
    const content = fs.readFileSync(dataPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as DbData;
    }
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
  }
  return {};
}

function writeData(data: DbData): void {
  const dataPath = getDataPath();
  const tmpPath = `${dataPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf-8');
  fs.renameSync(tmpPath, dataPath);
}

// ─── CRUD operations ─────────────────────────────────────────────────────────

export function dbGetVariable(
  namespace: string,
  key: string,
): StoredVariableEntry | undefined {
  const data = readData();
  const entry = data[namespace]?.[key];
  if (!entry) return undefined;
  return {
    value: entry.value,
    type: entry.type,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

export function dbSetVariable(
  namespace: string,
  key: string,
  value: unknown,
  typeName: string,
  includeMetadata: boolean,
): void {
  const data = readData();
  if (!data[namespace]) {
    data[namespace] = {};
  }
  const now = new Date().toISOString();
  if (includeMetadata) {
    const existing = data[namespace][key];
    data[namespace][key] = {
      value,
      type: typeName,
      // Preserve original created_at on updates
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
  } else {
    data[namespace][key] = { value };
  }
  writeData(data);
}

export function dbDeleteVariable(namespace: string, key: string): boolean {
  const data = readData();
  if (!data[namespace] || !(key in data[namespace])) {
    return false;
  }
  delete data[namespace][key];
  writeData(data);
  return true;
}

export function dbHasVariable(namespace: string, key: string): boolean {
  const data = readData();
  return Object.prototype.hasOwnProperty.call(data[namespace] ?? {}, key);
}

export function dbListVariables(
  namespace: string,
): Record<string, StoredVariableEntry> {
  const data = readData();
  const ns = data[namespace] ?? {};
  const result: Record<string, StoredVariableEntry> = {};
  for (const [k, entry] of Object.entries(ns)) {
    result[k] = {
      value: entry.value,
      type: entry.type,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    };
  }
  return result;
}

export function dbClearNamespace(namespace: string): number {
  const data = readData();
  const count = Object.keys(data[namespace] ?? {}).length;
  if (count > 0) {
    delete data[namespace];
    writeData(data);
  }
  return count;
}
