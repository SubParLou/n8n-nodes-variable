import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import type { StoredVariableEntry } from './types';

// In-process cache: namespace -> tableId
const tableIdCache = new Map<string, string>();

function makeTableName(namespace: string): string {
  // Sanitize namespace to be URL-safe for table names
  return `var_${namespace.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function makeKeyFilter(key: string): object {
  return {
    type: 'and',
    filters: [{ columnName: 'key', condition: 'eq', value: key }],
  };
}

async function apiRequest(
  ctx: IExecuteFunctions,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  qs?: Record<string, string | number>,
): Promise<unknown> {
  const creds = await ctx.getCredentials('n8nVariableNodeApi');
  const baseUrl = String(creds.baseUrl).replace(/\/+$/, '');
  const apiKey = String(creds.apiKey);

  const options: Parameters<IExecuteFunctions['helpers']['httpRequest']>[0] = {
    method,
    url: `${baseUrl}/api/v1${path}`,
    headers: {
      'X-N8N-API-KEY': apiKey,
    },
    json: true,
  };

  if (qs !== undefined) {
    options.qs = qs as unknown as IDataObject;
  }

  if (body !== undefined) {
    options.body = body as unknown as IDataObject;
  }

  return ctx.helpers.httpRequest(options);
}

async function findTableId(
  ctx: IExecuteFunctions,
  namespace: string,
): Promise<string | undefined> {
  const tName = makeTableName(namespace);
  const resp = await apiRequest(ctx, 'GET', '/data-tables', undefined, { limit: 250 });
  const tables = (resp as { data?: Array<{ id: string; name: string }> }).data ?? [];
  return tables.find((t) => t.name === tName)?.id;
}

async function getOrCreateTable(
  ctx: IExecuteFunctions,
  namespace: string,
  forceRefresh = false,
): Promise<string> {
  if (!forceRefresh && tableIdCache.has(namespace)) {
    return tableIdCache.get(namespace)!;
  }

  const existing = await findTableId(ctx, namespace);
  if (existing) {
    tableIdCache.set(namespace, existing);
    return existing;
  }

  // Create the table with key + value columns
  const created = await apiRequest(ctx, 'POST', '/data-tables', {
    name: makeTableName(namespace),
    columns: [
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
  });
  const newId = (created as { id: string }).id;
  tableIdCache.set(namespace, newId);
  return newId;
}

export async function dtGetVariable(
  ctx: IExecuteFunctions,
  namespace: string,
  key: string,
): Promise<StoredVariableEntry | undefined> {
  const tableId = await getOrCreateTable(ctx, namespace);
  const resp = await apiRequest(ctx, 'GET', `/data-tables/${tableId}/rows`, undefined, {
    filter: JSON.stringify(makeKeyFilter(key)),
    limit: 1,
  });
  const rows = (resp as { data?: Array<Record<string, unknown>> }).data ?? [];
  if (rows.length === 0) return undefined;
  const row = rows[0];
  try {
    return { value: JSON.parse(String(row['value'])) };
  } catch {
    return { value: row['value'] };
  }
}

export async function dtSetVariable(
  ctx: IExecuteFunctions,
  namespace: string,
  key: string,
  value: unknown,
  _typeName: string,
  _includeMetadata: boolean,
): Promise<void> {
  const tableId = await getOrCreateTable(ctx, namespace);
  const serialized = JSON.stringify(value);

  // Try update first; if nothing was updated, insert
  const updateResult = await apiRequest(
    ctx,
    'PATCH',
    `/data-tables/${tableId}/rows/update`,
    {
      filter: makeKeyFilter(key),
      data: { value: serialized },
      returnData: true,
      dryRun: false,
    },
  );

  const updatedRows = Array.isArray(updateResult) ? updateResult : [];
  if (updatedRows.length === 0) {
    await apiRequest(ctx, 'POST', `/data-tables/${tableId}/rows`, {
      data: [{ key, value: serialized }],
      returnType: 'count',
    });
  }
}

export async function dtDeleteVariable(
  ctx: IExecuteFunctions,
  namespace: string,
  key: string,
): Promise<boolean> {
  const exists = await dtHasVariable(ctx, namespace, key);
  if (!exists) return false;

  const tableId = await getOrCreateTable(ctx, namespace);
  await apiRequest(ctx, 'DELETE', `/data-tables/${tableId}/rows/delete`, {
    filter: makeKeyFilter(key),
  });
  return true;
}

export async function dtHasVariable(
  ctx: IExecuteFunctions,
  namespace: string,
  key: string,
): Promise<boolean> {
  const tableId = await getOrCreateTable(ctx, namespace);
  const resp = await apiRequest(ctx, 'GET', `/data-tables/${tableId}/rows`, undefined, {
    filter: JSON.stringify(makeKeyFilter(key)),
    limit: 1,
  });
  const rows = (resp as { data?: unknown[] }).data ?? [];
  return rows.length > 0;
}

export async function dtListVariables(
  ctx: IExecuteFunctions,
  namespace: string,
): Promise<Record<string, StoredVariableEntry>> {
  const tableId = await getOrCreateTable(ctx, namespace);
  const allRows: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;

  do {
    const qs: Record<string, string | number> = { limit: 250 };
    if (cursor) qs['cursor'] = cursor;
    const resp = await apiRequest(ctx, 'GET', `/data-tables/${tableId}/rows`, undefined, qs);
    const typed = resp as { data?: Array<Record<string, unknown>>; nextCursor?: string };
    allRows.push(...(typed.data ?? []));
    cursor = typed.nextCursor;
  } while (cursor);

  const result: Record<string, StoredVariableEntry> = {};
  for (const row of allRows) {
    const k = String(row['key'] ?? '');
    if (!k) continue;
    try {
      result[k] = { value: JSON.parse(String(row['value'])) };
    } catch {
      result[k] = { value: row['value'] };
    }
  }
  return result;
}

export async function dtClearNamespace(
  ctx: IExecuteFunctions,
  namespace: string,
): Promise<number> {
  const tableId = await findTableId(ctx, namespace);
  if (!tableId) return 0;

  // Count rows before deleting
  const vars = await dtListVariables(ctx, namespace);
  const count = Object.keys(vars).length;

  if (count > 0) {
    // Delete the entire table; it will be recreated on next use
    await apiRequest(ctx, 'DELETE', `/data-tables/${tableId}`);
    tableIdCache.delete(namespace);
  }
  return count;
}
