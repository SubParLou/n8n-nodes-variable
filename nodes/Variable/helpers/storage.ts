import type { IDataObject } from 'n8n-workflow';
import type { StoredVariableEntry, VariableNamespace, PackageStaticStore } from './types';

const PACKAGE_KEY = 'n8nNodesVariable';

// ─── Static data store helpers (Workflow Global / Node Local) ────────────────

function getPackageStore(staticData: IDataObject): PackageStaticStore {
  if (!staticData[PACKAGE_KEY]) {
    staticData[PACKAGE_KEY] = { namespaces: {} };
  }
  return staticData[PACKAGE_KEY] as unknown as PackageStaticStore;
}

function getNamespaceStore(pkg: PackageStaticStore, namespace: string): VariableNamespace {
  if (!pkg.namespaces[namespace]) {
    pkg.namespaces[namespace] = { variables: {} };
  }
  return pkg.namespaces[namespace];
}

export function staticGetVariable(
  staticData: IDataObject,
  namespace: string,
  key: string,
): StoredVariableEntry | undefined {
  const pkg = getPackageStore(staticData);
  const ns = pkg.namespaces[namespace];
  if (!ns) return undefined;
  return ns.variables[key];
}

export function staticSetVariable(
  staticData: IDataObject,
  namespace: string,
  key: string,
  value: unknown,
  typeName: string,
  includeMetadata: boolean,
): void {
  const pkg = getPackageStore(staticData);
  const ns = getNamespaceStore(pkg, namespace);
  const now = new Date().toISOString();
  const existing = ns.variables[key];
  const entry: StoredVariableEntry = { value };
  if (includeMetadata) {
    entry.type = typeName;
    entry.createdAt = existing?.createdAt ?? now;
    entry.updatedAt = now;
  }
  ns.variables[key] = entry;
}

export function staticDeleteVariable(
  staticData: IDataObject,
  namespace: string,
  key: string,
): boolean {
  const pkg = getPackageStore(staticData);
  const ns = pkg.namespaces[namespace];
  if (!ns || !(key in ns.variables)) return false;
  delete ns.variables[key];
  return true;
}

export function staticHasVariable(
  staticData: IDataObject,
  namespace: string,
  key: string,
): boolean {
  const pkg = getPackageStore(staticData);
  const ns = pkg.namespaces[namespace];
  return !!(ns && key in ns.variables);
}

export function staticListVariables(
  staticData: IDataObject,
  namespace: string,
): Record<string, StoredVariableEntry> {
  const pkg = getPackageStore(staticData);
  const ns = pkg.namespaces[namespace];
  if (!ns) return {};
  return { ...ns.variables };
}

export function staticClearNamespace(
  staticData: IDataObject,
  namespace: string,
): number {
  const pkg = getPackageStore(staticData);
  const ns = pkg.namespaces[namespace];
  if (!ns) return 0;
  const count = Object.keys(ns.variables).length;
  ns.variables = {};
  return count;
}

// ─── Local execution (item JSON) store helpers ───────────────────────────────

function getLocalNamespaceContainer(
  itemJson: IDataObject,
  storagePath: string,
  namespace: string,
): Record<string, unknown> {
  if (!itemJson[storagePath] || typeof itemJson[storagePath] !== 'object') {
    (itemJson[storagePath] as unknown) = {};
  }
  const root = itemJson[storagePath] as Record<string, unknown>;
  if (!root[namespace] || typeof root[namespace] !== 'object') {
    root[namespace] = {};
  }
  return root[namespace] as Record<string, unknown>;
}

export function localGetVariable(
  itemJson: IDataObject,
  storagePath: string,
  namespace: string,
  key: string,
): unknown {
  const container = itemJson[storagePath] as Record<string, unknown> | undefined;
  if (!container) return undefined;
  const ns = container[namespace] as Record<string, unknown> | undefined;
  if (!ns) return undefined;
  return ns[key];
}

export function localSetVariable(
  itemJson: IDataObject,
  storagePath: string,
  namespace: string,
  key: string,
  value: unknown,
): void {
  const ns = getLocalNamespaceContainer(itemJson, storagePath, namespace);
  ns[key] = value;
}

export function localDeleteVariable(
  itemJson: IDataObject,
  storagePath: string,
  namespace: string,
  key: string,
): boolean {
  const container = itemJson[storagePath] as Record<string, unknown> | undefined;
  if (!container) return false;
  const ns = container[namespace] as Record<string, unknown> | undefined;
  if (!ns || !(key in ns)) return false;
  delete ns[key];
  return true;
}

export function localHasVariable(
  itemJson: IDataObject,
  storagePath: string,
  namespace: string,
  key: string,
): boolean {
  const container = itemJson[storagePath] as Record<string, unknown> | undefined;
  if (!container) return false;
  const ns = container[namespace] as Record<string, unknown> | undefined;
  return !!(ns && key in ns);
}

export function localListVariables(
  itemJson: IDataObject,
  storagePath: string,
  namespace: string,
): Record<string, unknown> {
  const container = itemJson[storagePath] as Record<string, unknown> | undefined;
  if (!container) return {};
  const ns = container[namespace] as Record<string, unknown> | undefined;
  if (!ns) return {};
  return { ...ns };
}

export function localClearNamespace(
  itemJson: IDataObject,
  storagePath: string,
  namespace: string,
): number {
  const container = itemJson[storagePath] as Record<string, unknown> | undefined;
  if (!container) return 0;
  const ns = container[namespace] as Record<string, unknown> | undefined;
  if (!ns) return 0;
  const count = Object.keys(ns).length;
  (container[namespace] as unknown) = {};
  return count;
}
