import {
  NodeConnectionTypes,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
  type IDataObject,
} from 'n8n-workflow';

import {
  validateKey,
  validateNamespace,
  parseValueByType,
  inferValueType,
  deepMerge,
} from './helpers/valueParser';
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
} from './helpers/storage';
import type {
  VariableScope,
  VariableOperation,
  ValueType,
  OutputMode,
  OperationResult,
} from './helpers/types';

export class Variable implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Variable',
    name: 'variable',
    icon: 'file:variable.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Store, retrieve, update, and delete workflow variables.',
    defaults: {
      name: 'Variable',
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      // ── Operation ─────────────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Set Variable', value: 'set', action: 'Set a variable', description: 'Create or update a variable' },
          { name: 'Get Variable', value: 'get', action: 'Get a variable', description: 'Retrieve a variable value' },
          { name: 'Delete Variable', value: 'delete', action: 'Delete a variable', description: 'Remove a variable' },
          { name: 'Has Variable', value: 'has', action: 'Check if a variable exists', description: 'Returns true/false if a variable exists' },
          { name: 'List Variables', value: 'list', action: 'List variables', description: 'List all variables in a namespace' },
          { name: 'Clear Variables', value: 'clear', action: 'Clear all variables', description: 'Remove all variables in a namespace' },
          { name: 'Increment Variable', value: 'increment', action: 'Increment a variable', description: 'Add a number to a numeric variable' },
          { name: 'Decrement Variable', value: 'decrement', action: 'Decrement a variable', description: 'Subtract a number from a numeric variable' },
          { name: 'Append to Array', value: 'appendToArray', action: 'Append to an array variable', description: 'Push a value onto an array variable' },
          { name: 'Merge Object', value: 'mergeObject', action: 'Merge into an object variable', description: 'Merge a JSON object into an object variable' },
          { name: 'Toggle Boolean', value: 'toggleBoolean', action: 'Toggle a boolean variable', description: 'Flip a boolean variable between true and false' },
        ],
        default: 'set',
      },

      // ── Scope ──────────────────────────────────────────────────────────────
      {
        displayName: 'Scope',
        name: 'scope',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Local (This Execution)',
            value: 'localExecution',
            description: 'Variables exist only for this workflow run. Stored on the item JSON.',
          },
          {
            name: 'Workflow Global',
            value: 'workflowGlobal',
            description: 'Variables persist across workflow executions for this workflow.',
          },
          {
            name: 'Node Local',
            value: 'nodeLocal',
            description: 'Variables persist for this specific node instance.',
          },
          {
            name: 'Custom Namespace',
            value: 'customNamespace',
            description: 'Workflow global storage with a custom namespace expression.',
          },
        ],
        default: 'workflowGlobal',
        description: 'Where to store the variable',
      },

      // ── Local Storage Path (local scope only) ─────────────────────────────
      {
        displayName: 'Local Storage Path',
        name: 'localStoragePath',
        type: 'string',
        default: '_variables',
        description: 'The key on the item JSON where local variables are stored',
        displayOptions: { show: { scope: ['localExecution'] } },
      },

      // ── Custom Namespace Name ─────────────────────────────────────────────
      {
        displayName: 'Custom Namespace',
        name: 'customNamespaceName',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'e.g. economy, cooldowns, guild_{{$json.guild.id}}',
        description: 'The namespace to use. Supports expressions.',
        displayOptions: { show: { scope: ['customNamespace'] } },
      },

      // ── Namespace (non-local scopes) ──────────────────────────────────────
      {
        displayName: 'Namespace',
        name: 'namespace',
        type: 'string',
        default: 'default',
        placeholder: 'e.g. economy, cooldowns',
        description: 'Namespace to organize variables. Supports expressions like economy_{{$json.guild.id}}.',
        displayOptions: {
          show: {
            scope: ['workflowGlobal', 'nodeLocal'],
          },
        },
      },

      // ── Key ───────────────────────────────────────────────────────────────
      {
        displayName: 'Key',
        name: 'key',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'e.g. balance_{{$json.user.id}}',
        description: 'The variable key. Supports expressions.',
        displayOptions: {
          hide: { operation: ['list', 'clear'] },
        },
      },

      // ── Value Type (set / appendToArray) ──────────────────────────────────
      {
        displayName: 'Value Type',
        name: 'valueType',
        type: 'options',
        options: [
          { name: 'Auto (preserve expression type)', value: 'auto' },
          { name: 'String', value: 'string' },
          { name: 'Number', value: 'number' },
          { name: 'Boolean', value: 'boolean' },
          { name: 'JSON', value: 'json' },
          { name: 'Array', value: 'array' },
          { name: 'Object', value: 'object' },
        ],
        default: 'auto',
        description: 'How to interpret the value',
        displayOptions: {
          show: { operation: ['set', 'appendToArray'] },
        },
      },

      // ── Value ─────────────────────────────────────────────────────────────
      {
        displayName: 'Value',
        name: 'value',
        type: 'string',
        default: '',
        description: 'The value to store. Supports expressions.',
        displayOptions: {
          show: { operation: ['set', 'appendToArray'] },
        },
      },

      // ── Overwrite Existing (set) ──────────────────────────────────────────
      {
        displayName: 'Overwrite If Exists',
        name: 'overwriteExisting',
        type: 'boolean',
        default: true,
        description: 'Whether to overwrite the variable if it already exists',
        displayOptions: { show: { operation: ['set'] } },
      },

      // ── Get operation fields ──────────────────────────────────────────────
      {
        displayName: 'Use Default Value',
        name: 'useDefaultValue',
        type: 'boolean',
        default: false,
        description: 'Whether to return a default value when the variable does not exist',
        displayOptions: { show: { operation: ['get'] } },
      },
      {
        displayName: 'Default Value',
        name: 'defaultValue',
        type: 'string',
        default: '',
        description: 'Value to return when the variable does not exist',
        displayOptions: {
          show: {
            operation: ['get'],
            useDefaultValue: [true],
          },
        },
      },
      {
        displayName: 'Output Field Name',
        name: 'getOutputFieldName',
        type: 'string',
        default: 'value',
        description: 'The field name to put the retrieved value in on the output item',
        displayOptions: { show: { operation: ['get'] } },
      },

      // ── Increment / Decrement ─────────────────────────────────────────────
      {
        displayName: 'Amount',
        name: 'incrementAmount',
        type: 'number',
        default: 1,
        description: 'The amount to add (increment) or subtract (decrement)',
        displayOptions: { show: { operation: ['increment', 'decrement'] } },
      },
      {
        displayName: 'Initialize If Missing',
        name: 'initIfMissingNumeric',
        type: 'boolean',
        default: true,
        description: 'Whether to create the variable with an initial value if it does not exist',
        displayOptions: { show: { operation: ['increment', 'decrement'] } },
      },
      {
        displayName: 'Initial Value',
        name: 'numericInitialValue',
        type: 'number',
        default: 0,
        description: 'The starting value if the variable does not exist yet',
        displayOptions: {
          show: {
            operation: ['increment', 'decrement'],
            initIfMissingNumeric: [true],
          },
        },
      },

      // ── Append to Array ───────────────────────────────────────────────────
      {
        displayName: 'Initialize If Missing',
        name: 'initIfMissingArray',
        type: 'boolean',
        default: true,
        description: 'Whether to create an empty array if the variable does not exist',
        displayOptions: { show: { operation: ['appendToArray'] } },
      },

      // ── Merge Object ──────────────────────────────────────────────────────
      {
        displayName: 'Object (JSON)',
        name: 'objectJson',
        type: 'string',
        default: '{}',
        description: 'The JSON object to merge in. Supports expressions.',
        typeOptions: { rows: 4 },
        displayOptions: { show: { operation: ['mergeObject'] } },
      },
      {
        displayName: 'Deep Merge',
        name: 'deepMerge',
        type: 'boolean',
        default: false,
        description: 'Whether to recursively merge nested objects instead of shallow-merging',
        displayOptions: { show: { operation: ['mergeObject'] } },
      },
      {
        displayName: 'Initialize If Missing',
        name: 'initIfMissingObject',
        type: 'boolean',
        default: true,
        description: 'Whether to create an empty object if the variable does not exist',
        displayOptions: { show: { operation: ['mergeObject'] } },
      },

      // ── Toggle Boolean ────────────────────────────────────────────────────
      {
        displayName: 'Initialize If Missing',
        name: 'initIfMissingBoolean',
        type: 'boolean',
        default: true,
        description: 'Whether to initialize the variable if it does not exist',
        displayOptions: { show: { operation: ['toggleBoolean'] } },
      },
      {
        displayName: 'Initial Value',
        name: 'booleanInitialValue',
        type: 'boolean',
        default: false,
        description: 'The starting boolean value if the variable does not exist. The toggle will flip this immediately.',
        displayOptions: {
          show: {
            operation: ['toggleBoolean'],
            initIfMissingBoolean: [true],
          },
        },
      },

      // ── List ──────────────────────────────────────────────────────────────
      {
        displayName: 'Include Values',
        name: 'includeValues',
        type: 'boolean',
        default: true,
        description: 'Whether to include variable values in the output, or only the keys',
        displayOptions: { show: { operation: ['list'] } },
      },

      // ── Clear ─────────────────────────────────────────────────────────────
      {
        displayName: 'Confirmation',
        name: 'clearConfirmation',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Type CLEAR to confirm',
        description: 'Type the word CLEAR (uppercase) to confirm deleting all variables in this namespace',
        displayOptions: { show: { operation: ['clear'] } },
      },

      // ── Output Mode ───────────────────────────────────────────────────────
      {
        displayName: 'Output Mode',
        name: 'outputMode',
        type: 'options',
        options: [
          {
            name: 'Preserve Input + Add Result',
            value: 'preserveAndAdd',
            description: 'Keep all input fields and add the result object',
          },
          {
            name: 'Result Only',
            value: 'resultOnly',
            description: 'Output only the operation result object',
          },
          {
            name: 'Add / Update Field',
            value: 'addField',
            description: 'Add or update a single field on the input item with the variable value',
          },
        ],
        default: 'preserveAndAdd',
        description: 'How to construct the output item',
      },
      {
        displayName: 'Result Field Name',
        name: 'resultFieldName',
        type: 'string',
        default: 'variable',
        description: 'The field name that will hold the operation result on the output item',
        displayOptions: {
          show: { outputMode: ['preserveAndAdd', 'resultOnly'] },
        },
      },
      {
        displayName: 'Field Name',
        name: 'addFieldName',
        type: 'string',
        default: 'value',
        description: 'The field name to set on the output item with the variable value',
        displayOptions: {
          show: { outputMode: ['addField'] },
        },
      },

      // ── Include Metadata ──────────────────────────────────────────────────
      {
        displayName: 'Include Metadata',
        name: 'includeMetadata',
        type: 'boolean',
        default: false,
        description: 'Whether to store and expose createdAt/updatedAt/type metadata for workflow-global and node-local variables',
        displayOptions: {
          show: { scope: ['workflowGlobal', 'nodeLocal', 'customNamespace'] },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const result = await processItem(this, items[i], i);
        returnData.push(result);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        if (error instanceof NodeOperationError) throw error;
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}

// ─── Core item processor ──────────────────────────────────────────────────────

async function processItem(
  ctx: IExecuteFunctions,
  item: INodeExecutionData,
  i: number,
): Promise<INodeExecutionData> {
  const operation = ctx.getNodeParameter('operation', i) as VariableOperation;
  const scope = ctx.getNodeParameter('scope', i) as VariableScope;
  const outputMode = ctx.getNodeParameter('outputMode', i, 'preserveAndAdd') as OutputMode;
  const includeMetadata = scope !== 'localExecution'
    ? (ctx.getNodeParameter('includeMetadata', i, false) as boolean)
    : false;

  const resolvedNamespace = resolveNamespace(ctx, scope, i);
  validateNamespace(resolvedNamespace);

  // Clone item JSON so we don't mutate the input
  const itemJson: IDataObject = { ...item.json };

  const result = executeOperation(ctx, operation, scope, resolvedNamespace, itemJson, i, includeMetadata);

  return buildOutputItem(ctx, item, itemJson, result, outputMode, i);
}

// ─── Namespace resolution ─────────────────────────────────────────────────────

function resolveNamespace(ctx: IExecuteFunctions, scope: VariableScope, i: number): string {
  if (scope === 'customNamespace') {
    return (ctx.getNodeParameter('customNamespaceName', i, '') as string).trim();
  }
  if (scope === 'localExecution') {
    // For local scope the namespace is still configurable via the namespace param
    // but we default to 'default'. We'll use a simpler path here.
    return 'default';
  }
  return (ctx.getNodeParameter('namespace', i, 'default') as string).trim() || 'default';
}

// ─── Operation dispatcher ─────────────────────────────────────────────────────

function executeOperation(
  ctx: IExecuteFunctions,
  operation: VariableOperation,
  scope: VariableScope,
  namespace: string,
  itemJson: IDataObject,
  i: number,
  includeMetadata: boolean,
): OperationResult {
  const isLocal = scope === 'localExecution';
  const storagePath = isLocal
    ? (ctx.getNodeParameter('localStoragePath', i, '_variables') as string)
    : '';

  // Helpers to get/set/delete/has/list/clear depending on scope
  const get = (key: string): unknown => {
    if (isLocal) return localGetVariable(itemJson, storagePath, namespace, key);
    const entry = staticGetVariable(getStaticData(ctx, scope), namespace, key);
    return entry?.value;
  };

  const set = (key: string, value: unknown, typeName: string): void => {
    if (isLocal) {
      localSetVariable(itemJson, storagePath, namespace, key, value);
    } else {
      staticSetVariable(getStaticData(ctx, scope), namespace, key, value, typeName, includeMetadata);
    }
  };

  const del = (key: string): boolean => {
    if (isLocal) return localDeleteVariable(itemJson, storagePath, namespace, key);
    return staticDeleteVariable(getStaticData(ctx, scope), namespace, key);
  };

  const has = (key: string): boolean => {
    if (isLocal) return localHasVariable(itemJson, storagePath, namespace, key);
    return staticHasVariable(getStaticData(ctx, scope), namespace, key);
  };

  const list = (): Record<string, unknown> => {
    if (isLocal) return localListVariables(itemJson, storagePath, namespace);
    const raw = staticListVariables(getStaticData(ctx, scope), namespace);
    // unwrap StoredVariableEntry to plain values
    const result: Record<string, unknown> = {};
    for (const [k, entry] of Object.entries(raw)) {
      result[k] = entry.value;
    }
    return result;
  };

  const clear = (): number => {
    if (isLocal) return localClearNamespace(itemJson, storagePath, namespace);
    return staticClearNamespace(getStaticData(ctx, scope), namespace);
  };

  const scopeLabel = scope;

  switch (operation) {
    case 'set': return opSet(ctx, i, namespace, scopeLabel, get, set, has);
    case 'get': return opGet(ctx, i, namespace, scopeLabel, get, has);
    case 'delete': return opDelete(ctx, i, namespace, scopeLabel, del, has);
    case 'has': return opHas(ctx, i, namespace, scopeLabel, has);
    case 'list': return opList(ctx, i, namespace, scopeLabel, list);
    case 'clear': return opClear(ctx, i, namespace, scopeLabel, clear);
    case 'increment': return opIncrement(ctx, i, namespace, scopeLabel, get, set, has, 1);
    case 'decrement': return opIncrement(ctx, i, namespace, scopeLabel, get, set, has, -1);
    case 'appendToArray': return opAppendToArray(ctx, i, namespace, scopeLabel, get, set, has);
    case 'mergeObject': return opMergeObject(ctx, i, namespace, scopeLabel, get, set, has);
    case 'toggleBoolean': return opToggleBoolean(ctx, i, namespace, scopeLabel, get, set, has);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

function getStaticData(ctx: IExecuteFunctions, scope: VariableScope): IDataObject {
  if (scope === 'nodeLocal') return ctx.getWorkflowStaticData('node');
  return ctx.getWorkflowStaticData('global');
}

// ─── Individual operations ────────────────────────────────────────────────────

function opSet(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  get: (k: string) => unknown,
  set: (k: string, v: unknown, t: string) => void,
  has: (k: string) => boolean,
): OperationResult {
  const key = getKey(ctx, i);
  const valueType = ctx.getNodeParameter('valueType', i, 'auto') as ValueType;
  const rawValue = ctx.getNodeParameter('value', i, '');
  const overwrite = ctx.getNodeParameter('overwriteExisting', i, true) as boolean;

  if (!overwrite && has(key)) {
    throw new Error(
      `Variable "${key}" already exists in namespace "${namespace}". Enable "Overwrite If Exists" to update it.`,
    );
  }

  const parsed = parseValueByType(rawValue, valueType);
  const typeName = valueType === 'auto' ? inferValueType(parsed) : valueType;
  set(key, parsed, typeName);

  return {
    operation: 'set',
    scope: scopeLabel,
    namespace,
    key,
    value: parsed,
  };
}

function opGet(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  get: (k: string) => unknown,
  has: (k: string) => boolean,
): OperationResult {
  const key = getKey(ctx, i);
  const exists = has(key);
  const useDefault = ctx.getNodeParameter('useDefaultValue', i, false) as boolean;
  const defaultValue = ctx.getNodeParameter('defaultValue', i, '') as string;

  let value: unknown;
  if (exists) {
    value = get(key);
  } else if (useDefault) {
    value = defaultValue;
  } else {
    throw new Error(
      `Variable "${key}" does not exist in namespace "${namespace}". Enable "Use Default Value" or create the variable first.`,
    );
  }

  return {
    operation: 'get',
    scope: scopeLabel,
    namespace,
    key,
    value,
    exists,
  };
}

function opDelete(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  del: (k: string) => boolean,
  has: (k: string) => boolean,
): OperationResult {
  const key = getKey(ctx, i);
  const existed = has(key);
  const deleted = del(key);

  return {
    operation: 'delete',
    scope: scopeLabel,
    namespace,
    key,
    exists: existed,
    deleted,
  };
}

function opHas(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  has: (k: string) => boolean,
): OperationResult {
  const key = getKey(ctx, i);
  const exists = has(key);

  return {
    operation: 'has',
    scope: scopeLabel,
    namespace,
    key,
    exists,
  };
}

function opList(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  list: () => Record<string, unknown>,
): OperationResult {
  const includeValues = ctx.getNodeParameter('includeValues', i, true) as boolean;
  const vars = list();
  const keys = Object.keys(vars);

  const result: OperationResult = {
    operation: 'list',
    scope: scopeLabel,
    namespace,
    keys,
    count: keys.length,
  };

  if (includeValues) {
    result.variables = vars;
  }

  return result;
}

function opClear(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  clearFn: () => number,
): OperationResult {
  const confirmation = ctx.getNodeParameter('clearConfirmation', i, '') as string;
  if (confirmation.trim() !== 'CLEAR') {
    throw new Error(
      'Clear cancelled: you must type CLEAR (uppercase) in the Confirmation field to proceed.',
    );
  }

  const count = clearFn();

  return {
    operation: 'clear',
    scope: scopeLabel,
    namespace,
    count,
    cleared: true,
  };
}

function opIncrement(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  get: (k: string) => unknown,
  set: (k: string, v: unknown, t: string) => void,
  has: (k: string) => boolean,
  direction: 1 | -1,
): OperationResult {
  const key = getKey(ctx, i);
  const amount = ctx.getNodeParameter('incrementAmount', i, 1) as number;
  const initIfMissing = ctx.getNodeParameter('initIfMissingNumeric', i, true) as boolean;
  const initialValue = ctx.getNodeParameter('numericInitialValue', i, 0) as number;
  const opName = direction === 1 ? 'increment' : 'decrement';

  let current: number;
  const existed = has(key);
  if (!existed) {
    if (!initIfMissing) {
      throw new Error(
        `Variable "${key}" does not exist in namespace "${namespace}". Enable "Initialize If Missing" to create it automatically.`,
      );
    }
    current = initialValue;
  } else {
    const existing = get(key);
    if (typeof existing !== 'number' || !Number.isFinite(existing)) {
      throw new Error(
        `Cannot ${opName} "${key}": current value is not a finite number (got ${typeof existing}: ${JSON.stringify(existing)}).`,
      );
    }
    current = existing;
  }

  const newValue = current + direction * Math.abs(amount);
  set(key, newValue, 'number');

  return {
    operation: opName,
    scope: scopeLabel,
    namespace,
    key,
    value: newValue,
    previousValue: existed ? current : undefined,
  };
}

function opAppendToArray(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  get: (k: string) => unknown,
  set: (k: string, v: unknown, t: string) => void,
  has: (k: string) => boolean,
): OperationResult {
  const key = getKey(ctx, i);
  const valueType = ctx.getNodeParameter('valueType', i, 'auto') as ValueType;
  const rawValue = ctx.getNodeParameter('value', i, '');
  const initIfMissing = ctx.getNodeParameter('initIfMissingArray', i, true) as boolean;

  let arr: unknown[];
  if (!has(key)) {
    if (!initIfMissing) {
      throw new Error(
        `Variable "${key}" does not exist. Enable "Initialize If Missing" to create an empty array automatically.`,
      );
    }
    arr = [];
  } else {
    const existing = get(key);
    if (!Array.isArray(existing)) {
      throw new Error(
        `Cannot append to "${key}": existing value is not an array (got ${typeof existing}).`,
      );
    }
    arr = [...existing];
  }

  const parsed = parseValueByType(rawValue, valueType);
  arr.push(parsed);
  set(key, arr, 'array');

  return {
    operation: 'appendToArray',
    scope: scopeLabel,
    namespace,
    key,
    value: arr,
  };
}

function opMergeObject(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  get: (k: string) => unknown,
  set: (k: string, v: unknown, t: string) => void,
  has: (k: string) => boolean,
): OperationResult {
  const key = getKey(ctx, i);
  const objectJsonRaw = ctx.getNodeParameter('objectJson', i, '{}') as string;
  const useDeepMerge = ctx.getNodeParameter('deepMerge', i, false) as boolean;
  const initIfMissing = ctx.getNodeParameter('initIfMissingObject', i, true) as boolean;

  // Parse incoming object
  let incoming: Record<string, unknown>;
  try {
    const parsed = typeof objectJsonRaw === 'object' && objectJsonRaw !== null
      ? objectJsonRaw
      : JSON.parse(String(objectJsonRaw));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not a plain object');
    }
    incoming = parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Object (JSON) must be a plain object. Got: ${String(objectJsonRaw).slice(0, 100)}`);
  }

  let base: Record<string, unknown>;
  if (!has(key)) {
    if (!initIfMissing) {
      throw new Error(
        `Variable "${key}" does not exist. Enable "Initialize If Missing" to create an empty object automatically.`,
      );
    }
    base = {};
  } else {
    const existing = get(key);
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      throw new Error(
        `Cannot merge into "${key}": existing value is not a plain object (got ${Array.isArray(existing) ? 'array' : typeof existing}).`,
      );
    }
    base = { ...(existing as Record<string, unknown>) };
  }

  const merged = useDeepMerge ? deepMerge(base, incoming) : { ...base, ...incoming };
  set(key, merged, 'object');

  return {
    operation: 'mergeObject',
    scope: scopeLabel,
    namespace,
    key,
    value: merged,
  };
}

function opToggleBoolean(
  ctx: IExecuteFunctions,
  i: number,
  namespace: string,
  scopeLabel: string,
  get: (k: string) => unknown,
  set: (k: string, v: unknown, t: string) => void,
  has: (k: string) => boolean,
): OperationResult {
  const key = getKey(ctx, i);
  const initIfMissing = ctx.getNodeParameter('initIfMissingBoolean', i, true) as boolean;
  const initialValue = ctx.getNodeParameter('booleanInitialValue', i, false) as boolean;

  let current: boolean;
  if (!has(key)) {
    if (!initIfMissing) {
      throw new Error(
        `Variable "${key}" does not exist. Enable "Initialize If Missing" to create it automatically.`,
      );
    }
    current = initialValue;
  } else {
    const existing = get(key);
    if (typeof existing !== 'boolean') {
      throw new Error(
        `Cannot toggle "${key}": existing value is not a boolean (got ${typeof existing}: ${JSON.stringify(existing)}).`,
      );
    }
    current = existing;
  }

  const newValue = !current;
  set(key, newValue, 'boolean');

  return {
    operation: 'toggleBoolean',
    scope: scopeLabel,
    namespace,
    key,
    value: newValue,
    previousValue: current,
  };
}

// ─── Output builder ───────────────────────────────────────────────────────────

function buildOutputItem(
  ctx: IExecuteFunctions,
  originalItem: INodeExecutionData,
  updatedItemJson: IDataObject,
  result: OperationResult,
  outputMode: OutputMode,
  i: number,
): INodeExecutionData {
  if (outputMode === 'resultOnly') {
    const fieldName = ctx.getNodeParameter('resultFieldName', i, 'variable') as string;
    return {
      json: { [fieldName]: result as unknown as IDataObject },
      pairedItem: { item: i },
    };
  }

  if (outputMode === 'addField') {
    // For Get Variable, use the dedicated output field name; otherwise use addFieldName
    const fieldName = result.operation === 'get'
      ? (ctx.getNodeParameter('getOutputFieldName', i, 'value') as string)
      : (ctx.getNodeParameter('addFieldName', i, 'value') as string);
    return {
      json: {
        ...updatedItemJson,
        [fieldName]: result.value as IDataObject,
      },
      pairedItem: { item: i },
    };
  }

  // preserveAndAdd (default)
  const fieldName = ctx.getNodeParameter('resultFieldName', i, 'variable') as string;
  return {
    json: {
      ...updatedItemJson,
      [fieldName]: result as unknown as IDataObject,
    },
    pairedItem: { item: i },
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function getKey(ctx: IExecuteFunctions, i: number): string {
  const key = (ctx.getNodeParameter('key', i, '') as string).trim();
  validateKey(key);
  return key;
}
