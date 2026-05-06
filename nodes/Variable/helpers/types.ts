export type VariableScope =
  | 'localExecution'
  | 'workflowGlobal'
  | 'nodeLocal'
  | 'customNamespace';

export type VariableOperation =
  | 'set'
  | 'get'
  | 'delete'
  | 'has'
  | 'list'
  | 'clear'
  | 'increment'
  | 'decrement'
  | 'appendToArray'
  | 'mergeObject'
  | 'toggleBoolean';

export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'array'
  | 'object'
  | 'auto';

export type OutputMode = 'preserveAndAdd' | 'resultOnly' | 'addField';

export interface StoredVariableEntry {
  value: unknown;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VariableNamespace {
  variables: Record<string, StoredVariableEntry>;
}

export interface PackageStaticStore {
  namespaces: Record<string, VariableNamespace>;
}

export interface OperationResult {
  operation: string;
  scope: string;
  namespace: string;
  key?: string;
  value?: unknown;
  previousValue?: unknown;
  exists?: boolean;
  deleted?: boolean;
  keys?: string[];
  variables?: Record<string, unknown>;
  count?: number;
  cleared?: boolean;
}
