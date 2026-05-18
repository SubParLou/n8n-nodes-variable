/**
 * Unit tests for n8n-nodes-variable helper functions.
 *
 * These tests cover pure helper logic and do not require a running n8n instance.
 * Storage tests use plain IDataObject mocks.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  validateKey,
  validateNamespace,
  parseValueByType,
  inferValueType,
  safeJsonParse,
  deepMerge,
} from '../nodes/Variable/helpers/valueParser';

import { type IDataObject } from 'n8n-workflow';

import {
  staticGetVariable,
  staticSetVariable,
  staticDeleteVariable,
  staticHasVariable,
  staticListVariables,
  staticClearNamespace,
  localGetVariable,
  localSetVariable,
  localDeleteVariable,
  localHasVariable,
  localListVariables,
  localClearNamespace,
} from '../nodes/Variable/helpers/storage';

// ─── validateKey / validateNamespace ─────────────────────────────────────────

describe('validateKey', () => {
  it('passes for a normal key', () => {
    expect(() => validateKey('balance_123')).not.toThrow();
    expect(() => validateKey('some-key')).not.toThrow();
    expect(() => validateKey('counter')).not.toThrow();
  });

  it('throws for an empty key', () => {
    expect(() => validateKey('')).toThrow('must not be empty');
    expect(() => validateKey('   ')).toThrow('must not be empty');
  });

  it('throws for prototype pollution keys', () => {
    expect(() => validateKey('__proto__')).toThrow('not allowed');
    expect(() => validateKey('constructor')).toThrow('not allowed');
    expect(() => validateKey('prototype')).toThrow('not allowed');
  });
});

describe('validateNamespace', () => {
  it('passes for normal namespaces', () => {
    expect(() => validateNamespace('economy')).not.toThrow();
    expect(() => validateNamespace('default')).not.toThrow();
  });

  it('throws for empty namespace', () => {
    expect(() => validateNamespace('')).toThrow('must not be empty');
  });

  it('throws for prototype pollution namespace', () => {
    expect(() => validateNamespace('__proto__')).toThrow('not allowed');
  });
});

// ─── parseValueByType ────────────────────────────────────────────────────────

describe('parseValueByType - string', () => {
  it('returns string unchanged', () => {
    expect(parseValueByType('hello', 'string')).toBe('hello');
    expect(parseValueByType(42, 'string')).toBe('42');
  });
});

describe('parseValueByType - number', () => {
  it('parses integer strings', () => {
    expect(parseValueByType('42', 'number')).toBe(42);
    expect(parseValueByType('-5', 'number')).toBe(-5);
    expect(parseValueByType('3.14', 'number')).toBe(3.14);
  });

  it('throws for non-numeric strings', () => {
    expect(() => parseValueByType('abc', 'number')).toThrow();
    expect(() => parseValueByType('', 'number')).toThrow();
  });
});

describe('parseValueByType - boolean', () => {
  it('parses truthy strings', () => {
    expect(parseValueByType('true', 'boolean')).toBe(true);
    expect(parseValueByType('TRUE', 'boolean')).toBe(true);
    expect(parseValueByType('1', 'boolean')).toBe(true);
    expect(parseValueByType('yes', 'boolean')).toBe(true);
  });

  it('parses falsy strings', () => {
    expect(parseValueByType('false', 'boolean')).toBe(false);
    expect(parseValueByType('0', 'boolean')).toBe(false);
    expect(parseValueByType('no', 'boolean')).toBe(false);
  });

  it('passes boolean values through', () => {
    expect(parseValueByType(true, 'boolean')).toBe(true);
    expect(parseValueByType(false, 'boolean')).toBe(false);
  });

  it('throws for unrecognised strings', () => {
    expect(() => parseValueByType('maybe', 'boolean')).toThrow();
  });
});

describe('parseValueByType - json', () => {
  it('parses valid JSON', () => {
    expect(parseValueByType('{"a":1}', 'json')).toEqual({ a: 1 });
    expect(parseValueByType('[1,2,3]', 'json')).toEqual([1, 2, 3]);
  });

  it('throws for invalid JSON', () => {
    expect(() => parseValueByType('{bad json}', 'json')).toThrow('Invalid JSON');
  });
});

describe('parseValueByType - array', () => {
  it('parses JSON arrays', () => {
    expect(parseValueByType('[1,"b",true]', 'array')).toEqual([1, 'b', true]);
  });

  it('throws if value is not an array', () => {
    expect(() => parseValueByType('{"a":1}', 'array')).toThrow('JSON array');
  });
});

describe('parseValueByType - object', () => {
  it('parses plain objects', () => {
    expect(parseValueByType('{"x":5}', 'object')).toEqual({ x: 5 });
  });

  it('throws for arrays', () => {
    expect(() => parseValueByType('[1,2]', 'object')).toThrow('plain JSON object');
  });

  it('throws for primitives', () => {
    expect(() => parseValueByType('"hello"', 'object')).toThrow('plain JSON object');
  });
});

describe('parseValueByType - auto', () => {
  it('returns the raw value unchanged', () => {
    expect(parseValueByType(42, 'auto')).toBe(42);
    expect(parseValueByType('text', 'auto')).toBe('text');
    expect(parseValueByType(true, 'auto')).toBe(true);
  });
});

// ─── safeJsonParse ────────────────────────────────────────────────────────────

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('null')).toBe(null);
    expect(safeJsonParse('123')).toBe(123);
    expect(safeJsonParse('"hello"')).toBe('hello');
  });

  it('throws with a helpful message on invalid JSON', () => {
    expect(() => safeJsonParse('{{invalid}}')).toThrow('Invalid JSON');
  });
});

// ─── inferValueType ──────────────────────────────────────────────────────────

describe('inferValueType', () => {
  it('identifies primitives', () => {
    expect(inferValueType('hello')).toBe('string');
    expect(inferValueType(42)).toBe('number');
    expect(inferValueType(true)).toBe('boolean');
    expect(inferValueType(null)).toBe('null');
  });

  it('identifies arrays', () => {
    expect(inferValueType([1, 2])).toBe('array');
  });

  it('identifies objects', () => {
    expect(inferValueType({ a: 1 })).toBe('object');
  });
});

// ─── deepMerge ────────────────────────────────────────────────────────────────

describe('deepMerge', () => {
  it('merges flat objects', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('overwrites scalar values', () => {
    expect(deepMerge({ a: 1 }, { a: 99 })).toEqual({ a: 99 });
  });

  it('deeply merges nested objects', () => {
    const result = deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 99, z: 3 } });
    expect(result).toEqual({ a: { x: 1, y: 99, z: 3 } });
  });

  it('does not mutate the target', () => {
    const target = { a: 1 };
    deepMerge(target, { b: 2 });
    expect(target).toEqual({ a: 1 });
  });

  it('overwrites arrays (not merges)', () => {
    expect(deepMerge({ arr: [1, 2] }, { arr: [3, 4, 5] })).toEqual({ arr: [3, 4, 5] });
  });
});

// ─── Static storage helpers ───────────────────────────────────────────────────

function freshStore() {
  return {};
}

describe('static storage - set/get', () => {
  it('sets and retrieves a string', () => {
    const store = freshStore();
    staticSetVariable(store, 'default', 'name', 'Alice', 'string', false);
    const entry = staticGetVariable(store, 'default', 'name');
    expect(entry?.value).toBe('Alice');
  });

  it('sets and retrieves a number', () => {
    const store = freshStore();
    staticSetVariable(store, 'economy', 'balance', 500, 'number', false);
    expect(staticGetVariable(store, 'economy', 'balance')?.value).toBe(500);
  });

  it('returns undefined for missing keys', () => {
    const store = freshStore();
    expect(staticGetVariable(store, 'default', 'missing')).toBeUndefined();
  });
});

describe('static storage - has', () => {
  it('returns true for existing key', () => {
    const store = freshStore();
    staticSetVariable(store, 'ns', 'k', true, 'boolean', false);
    expect(staticHasVariable(store, 'ns', 'k')).toBe(true);
  });

  it('returns false for missing key', () => {
    const store = freshStore();
    expect(staticHasVariable(store, 'ns', 'missing')).toBe(false);
  });

  it('returns false for missing namespace', () => {
    const store = freshStore();
    expect(staticHasVariable(store, 'nonexistent', 'k')).toBe(false);
  });
});

describe('static storage - delete', () => {
  it('deletes an existing variable and returns true', () => {
    const store = freshStore();
    staticSetVariable(store, 'ns', 'k', 42, 'number', false);
    expect(staticDeleteVariable(store, 'ns', 'k')).toBe(true);
    expect(staticHasVariable(store, 'ns', 'k')).toBe(false);
  });

  it('returns false when key does not exist', () => {
    const store = freshStore();
    expect(staticDeleteVariable(store, 'ns', 'ghost')).toBe(false);
  });
});

describe('static storage - list', () => {
  it('lists all variables in a namespace', () => {
    const store = freshStore();
    staticSetVariable(store, 'ns', 'a', 1, 'number', false);
    staticSetVariable(store, 'ns', 'b', 2, 'number', false);
    const vars = staticListVariables(store, 'ns');
    expect(Object.keys(vars).sort()).toEqual(['a', 'b']);
    expect(vars['a'].value).toBe(1);
    expect(vars['b'].value).toBe(2);
  });

  it('returns empty object for unknown namespace', () => {
    const store = freshStore();
    expect(staticListVariables(store, 'empty')).toEqual({});
  });
});

describe('static storage - clear', () => {
  it('clears all variables in a namespace and returns count', () => {
    const store = freshStore();
    staticSetVariable(store, 'ns', 'x', 1, 'number', false);
    staticSetVariable(store, 'ns', 'y', 2, 'number', false);
    const count = staticClearNamespace(store, 'ns');
    expect(count).toBe(2);
    expect(staticListVariables(store, 'ns')).toEqual({});
  });

  it('returns 0 for an already-empty namespace', () => {
    const store = freshStore();
    expect(staticClearNamespace(store, 'empty')).toBe(0);
  });
});

describe('static storage - metadata', () => {
  it('stores metadata when includeMetadata = true', () => {
    const store = freshStore();
    staticSetVariable(store, 'ns', 'k', 'v', 'string', true);
    const entry = staticGetVariable(store, 'ns', 'k');
    expect(entry?.type).toBe('string');
    expect(entry?.createdAt).toBeDefined();
    expect(entry?.updatedAt).toBeDefined();
  });

  it('does not store metadata when includeMetadata = false', () => {
    const store = freshStore();
    staticSetVariable(store, 'ns', 'k', 'v', 'string', false);
    const entry = staticGetVariable(store, 'ns', 'k');
    expect(entry?.type).toBeUndefined();
    expect(entry?.createdAt).toBeUndefined();
  });
});

// ─── Local storage helpers ────────────────────────────────────────────────────

describe('local storage - set/get', () => {
  it('sets and retrieves a value on item JSON', () => {
    const itemJson = {};
    localSetVariable(itemJson, '_variables', 'default', 'score', 100);
    expect(localGetVariable(itemJson, '_variables', 'default', 'score')).toBe(100);
  });

  it('stores under the correct path structure', () => {
    const itemJson: IDataObject = {};
    localSetVariable(itemJson, '_variables', 'economy', 'balance', 999);
    expect((itemJson['_variables'] as Record<string, unknown>)['economy']).toBeDefined();
  });

  it('returns undefined for missing key', () => {
    const itemJson = {};
    expect(localGetVariable(itemJson, '_variables', 'default', 'missing')).toBeUndefined();
  });
});

describe('local storage - has', () => {
  it('returns true when key exists', () => {
    const itemJson = {};
    localSetVariable(itemJson, '_variables', 'ns', 'flag', true);
    expect(localHasVariable(itemJson, '_variables', 'ns', 'flag')).toBe(true);
  });

  it('returns false when missing', () => {
    const itemJson = {};
    expect(localHasVariable(itemJson, '_variables', 'ns', 'nope')).toBe(false);
  });
});

describe('local storage - delete', () => {
  it('deletes existing key', () => {
    const itemJson = {};
    localSetVariable(itemJson, '_variables', 'ns', 'k', 1);
    expect(localDeleteVariable(itemJson, '_variables', 'ns', 'k')).toBe(true);
    expect(localHasVariable(itemJson, '_variables', 'ns', 'k')).toBe(false);
  });

  it('returns false for nonexistent key', () => {
    const itemJson = {};
    expect(localDeleteVariable(itemJson, '_variables', 'ns', 'ghost')).toBe(false);
  });
});

describe('local storage - list', () => {
  it('lists variables in the namespace', () => {
    const itemJson = {};
    localSetVariable(itemJson, '_variables', 'ns', 'a', 1);
    localSetVariable(itemJson, '_variables', 'ns', 'b', 2);
    const vars = localListVariables(itemJson, '_variables', 'ns');
    expect(vars).toEqual({ a: 1, b: 2 });
  });

  it('returns empty for unknown namespace', () => {
    const itemJson = {};
    expect(localListVariables(itemJson, '_variables', 'empty')).toEqual({});
  });
});

describe('local storage - clear', () => {
  it('clears all variables in namespace', () => {
    const itemJson = {};
    localSetVariable(itemJson, '_variables', 'ns', 'x', 1);
    localSetVariable(itemJson, '_variables', 'ns', 'y', 2);
    const count = localClearNamespace(itemJson, '_variables', 'ns');
    expect(count).toBe(2);
    expect(localListVariables(itemJson, '_variables', 'ns')).toEqual({});
  });
});

describe('local storage - custom path', () => {
  it('uses the specified storage path', () => {
    const itemJson: IDataObject = {};
    localSetVariable(itemJson, 'myState', 'default', 'k', 'v');
    expect(itemJson['myState']).toBeDefined();
    expect(itemJson['_variables']).toBeUndefined();
  });
});

// ─── Increment / decrement logic (inline verification) ────────────────────────
// These test the storage primitives used by increment/decrement

describe('increment scenario via static storage', () => {
  it('increments a counter from 0 to 5', () => {
    const store = freshStore();
    staticSetVariable(store, 'ns', 'counter', 0, 'number', false);

    for (let step = 0; step < 5; step++) {
      const current = (staticGetVariable(store, 'ns', 'counter')?.value ?? 0) as number;
      staticSetVariable(store, 'ns', 'counter', current + 1, 'number', false);
    }

    expect(staticGetVariable(store, 'ns', 'counter')?.value).toBe(5);
  });
});

describe('boolean toggle scenario via local storage', () => {
  it('toggles a boolean flag', () => {
    const itemJson = {};
    localSetVariable(itemJson, '_variables', 'default', 'active', false);

    const current = localGetVariable(itemJson, '_variables', 'default', 'active') as boolean;
    localSetVariable(itemJson, '_variables', 'default', 'active', !current);

    expect(localGetVariable(itemJson, '_variables', 'default', 'active')).toBe(true);
  });
});

// ─── Prototype pollution regression ──────────────────────────────────────────

describe('prototype pollution prevention', () => {
  it('rejects __proto__ as a key', () => {
    expect(() => validateKey('__proto__')).toThrow();
  });

  it('rejects constructor as a namespace', () => {
    expect(() => validateNamespace('constructor')).toThrow();
  });

  it('rejects prototype as a key', () => {
    expect(() => validateKey('prototype')).toThrow();
  });
});

// ─── Invalid JSON error ────────────────────────────────────────────────────────

describe('invalid JSON error', () => {
  it('throws a helpful message for bad JSON', () => {
    expect(() => parseValueByType('{not valid json}', 'json')).toThrow('Invalid JSON');
  });

  it('throws for truncated input', () => {
    expect(() => parseValueByType('[1, 2, 3', 'json')).toThrow('Invalid JSON');
  });
});

// ─── Invalid number error ─────────────────────────────────────────────────────

describe('invalid number error', () => {
  it('throws for NaN-producing strings', () => {
    expect(() => parseValueByType('not_a_number', 'number')).toThrow();
  });

  it('throws for Infinity', () => {
    expect(() => parseValueByType('Infinity', 'number')).toThrow();
  });
});

// ─── DB storage helpers ───────────────────────────────────────────────────────
// Tests use a temporary directory so they never touch the real ~/.n8n folder.

describe('db storage helpers', () => {
  const testDbDir = path.join(os.tmpdir(), `n8n-nodes-variable-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(testDbDir, { recursive: true });
    // Point the module to our temp directory before the singleton is initialized
    process.env['N8N_USER_FOLDER'] = testDbDir;
  });

  afterAll(() => {
    try {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
    delete process.env['N8N_USER_FOLDER'];
  });

  // Re-require after env is set so getDb() uses the test path
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = () => require('../nodes/Variable/helpers/dbStorage') as typeof import('../nodes/Variable/helpers/dbStorage');

  const NS = 'test_namespace';

  afterEach(() => {
    db().dbClearNamespace(NS);
  });

  it('returns undefined for a missing key', () => {
    expect(db().dbGetVariable(NS, 'missing')).toBeUndefined();
  });

  it('sets and gets a string variable', () => {
    db().dbSetVariable(NS, 'name', 'Alice', 'string', false);
    const entry = db().dbGetVariable(NS, 'name');
    expect(entry?.value).toBe('Alice');
  });

  it('sets and gets a number variable', () => {
    db().dbSetVariable(NS, 'score', 42, 'number', false);
    expect(db().dbGetVariable(NS, 'score')?.value).toBe(42);
  });

  it('sets and gets a boolean variable', () => {
    db().dbSetVariable(NS, 'active', true, 'boolean', false);
    expect(db().dbGetVariable(NS, 'active')?.value).toBe(true);
  });

  it('sets and gets an object variable', () => {
    db().dbSetVariable(NS, 'config', { x: 1, y: 2 }, 'object', false);
    expect(db().dbGetVariable(NS, 'config')?.value).toEqual({ x: 1, y: 2 });
  });

  it('overwrites an existing key', () => {
    db().dbSetVariable(NS, 'k', 'first', 'string', false);
    db().dbSetVariable(NS, 'k', 'second', 'string', false);
    expect(db().dbGetVariable(NS, 'k')?.value).toBe('second');
  });

  it('has returns true for existing key', () => {
    db().dbSetVariable(NS, 'flag', true, 'boolean', false);
    expect(db().dbHasVariable(NS, 'flag')).toBe(true);
  });

  it('has returns false for missing key', () => {
    expect(db().dbHasVariable(NS, 'nope')).toBe(false);
  });

  it('delete returns true and removes the key', () => {
    db().dbSetVariable(NS, 'tmp', 'val', 'string', false);
    expect(db().dbDeleteVariable(NS, 'tmp')).toBe(true);
    expect(db().dbHasVariable(NS, 'tmp')).toBe(false);
  });

  it('delete returns false for nonexistent key', () => {
    expect(db().dbDeleteVariable(NS, 'ghost')).toBe(false);
  });

  it('list returns all variables in the namespace', () => {
    db().dbSetVariable(NS, 'a', 1, 'number', false);
    db().dbSetVariable(NS, 'b', 2, 'number', false);
    const vars = db().dbListVariables(NS);
    expect(Object.keys(vars).sort()).toEqual(['a', 'b']);
    expect(vars['a'].value).toBe(1);
    expect(vars['b'].value).toBe(2);
  });

  it('list returns empty object for unknown namespace', () => {
    expect(db().dbListVariables('__empty__')).toEqual({});
  });

  it('clear removes all keys in namespace and returns count', () => {
    db().dbSetVariable(NS, 'x', 1, 'number', false);
    db().dbSetVariable(NS, 'y', 2, 'number', false);
    const count = db().dbClearNamespace(NS);
    expect(count).toBe(2);
    expect(db().dbListVariables(NS)).toEqual({});
  });

  it('clear returns 0 for an already-empty namespace', () => {
    expect(db().dbClearNamespace('__empty__')).toBe(0);
  });

  it('stores and exposes metadata when includeMetadata = true', () => {
    db().dbSetVariable(NS, 'meta', 'val', 'string', true);
    const entry = db().dbGetVariable(NS, 'meta');
    expect(entry?.type).toBe('string');
    expect(entry?.createdAt).toBeDefined();
    expect(entry?.updatedAt).toBeDefined();
  });

  it('does not store metadata when includeMetadata = false', () => {
    db().dbSetVariable(NS, 'no_meta', 'val', 'string', false);
    const entry = db().dbGetVariable(NS, 'no_meta');
    expect(entry?.type).toBeUndefined();
    expect(entry?.createdAt).toBeUndefined();
  });

  it('namespaces are isolated', () => {
    db().dbSetVariable(NS, 'shared_key', 'ns1_value', 'string', false);
    db().dbSetVariable('other_namespace', 'shared_key', 'ns2_value', 'string', false);
    expect(db().dbGetVariable(NS, 'shared_key')?.value).toBe('ns1_value');
    expect(db().dbGetVariable('other_namespace', 'shared_key')?.value).toBe('ns2_value');
    // Clean up other namespace too
    db().dbClearNamespace('other_namespace');
  });

  it('supports increment scenario', () => {
    db().dbSetVariable(NS, 'counter', 0, 'number', false);
    for (let i = 0; i < 5; i++) {
      const current = (db().dbGetVariable(NS, 'counter')?.value ?? 0) as number;
      db().dbSetVariable(NS, 'counter', current + 1, 'number', false);
    }
    expect(db().dbGetVariable(NS, 'counter')?.value).toBe(5);
  });
});
