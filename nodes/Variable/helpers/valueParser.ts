import type { ValueType } from './types';

/** Keys that would cause prototype pollution — always rejected. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validates a variable key or namespace string.
 * Throws a plain Error (to be wrapped by the node as NodeOperationError).
 */
export function validateKey(key: string, label = 'Key'): void {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  if (DANGEROUS_KEYS.has(trimmed)) {
    throw new Error(`${label} "${trimmed}" is not allowed for security reasons.`);
  }
}

export function validateNamespace(ns: string): void {
  const trimmed = ns.trim();
  if (trimmed.length === 0) {
    throw new Error('Namespace must not be empty.');
  }
  if (DANGEROUS_KEYS.has(trimmed)) {
    throw new Error(`Namespace "${trimmed}" is not allowed for security reasons.`);
  }
}

/**
 * Parse a raw string value into the typed JavaScript value specified by valueType.
 */
export function parseValueByType(rawValue: unknown, valueType: ValueType): unknown {
  if (valueType === 'auto') {
    return rawValue;
  }

  const str = String(rawValue ?? '');

  switch (valueType) {
    case 'string':
      return str;

    case 'number': {
      const n = Number(str);
      if (str.trim() === '' || !Number.isFinite(n)) {
        throw new Error(
          `Value "${str}" cannot be converted to a valid number. Got: ${n}`,
        );
      }
      return n;
    }

    case 'boolean': {
      const lower = str.toLowerCase().trim();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
      // If rawValue is already boolean, use it directly
      if (typeof rawValue === 'boolean') return rawValue;
      throw new Error(
        `Value "${str}" cannot be converted to a boolean. Use true/false/1/0/yes/no.`,
      );
    }

    case 'json': {
      return safeJsonParse(str);
    }

    case 'array': {
      const parsed = safeJsonParse(str);
      if (!Array.isArray(parsed)) {
        throw new Error(
          `Value must be a JSON array (e.g. [1, 2, 3]). Got: ${typeof parsed}`,
        );
      }
      return parsed;
    }

    case 'object': {
      const parsed = safeJsonParse(str);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          `Value must be a plain JSON object (e.g. {"key": "value"}). Got: ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
        );
      }
      return parsed;
    }

    default:
      return str;
  }
}

/** Parse a JSON string safely, throwing a user-friendly error on failure. */
export function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    throw new Error(`Invalid JSON: ${str.slice(0, 100)}${str.length > 100 ? '…' : ''}`);
  }
}

/** Infer the type name from a runtime value. */
export function inferValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Deep-merge source object into target object.
 * Only handles plain objects at each level; other values are overwritten.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      typeof srcVal === 'object' &&
      srcVal !== null &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}
