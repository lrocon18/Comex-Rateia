import Dexie, { type Table } from 'dexie';
import type { Produto, Regra, Result } from '@/types';
import type { Campo } from '@/io/columnMap';

// Persistência 100% local (IndexedDB via Dexie). Nada sai da máquina.

export interface OperationSnapshot {
  stock: Produto[];
  clients: string[];
  rules: Regra[];
  result: Result | null;
  fileName: string | null;
}

export interface OperationRecord {
  id?: number;
  name: string;
  updatedAt: number;
  data: OperationSnapshot;
}

export interface MappingRecord {
  cliente: string;
  map: Partial<Record<Campo, string>>;
}

/** Operação corrente + o vínculo com o registro nomeado (se já foi salva). */
export interface CurrentRecord {
  key: string;
  data: OperationSnapshot;
  opId?: number | null;
  opName?: string;
}

class RateiaDB extends Dexie {
  operations!: Table<OperationRecord, number>;
  mappings!: Table<MappingRecord, string>;
  kv!: Table<CurrentRecord, string>;

  constructor() {
    super('rateia');
    this.version(1).stores({
      operations: '++id, name, updatedAt',
      mappings: 'cliente',
      kv: 'key',
    });
  }
}

export const db = new RateiaDB();

const CURRENT_KEY = 'current';

// ---- operação corrente (autosave) ----
export async function saveCurrent(
  data: OperationSnapshot,
  opId: number | null,
  opName: string,
): Promise<void> {
  await db.kv.put({ key: CURRENT_KEY, data, opId, opName });
}
export function loadCurrent(): Promise<CurrentRecord | undefined> {
  return db.kv.get(CURRENT_KEY);
}

// ---- operações nomeadas (abrir/salvar) ----
export async function saveOperation(name: string, data: OperationSnapshot, id?: number): Promise<number> {
  const rec: OperationRecord = { name, updatedAt: Date.now(), data };
  if (id != null) {
    await db.operations.put({ ...rec, id });
    return id;
  }
  return db.operations.add(rec);
}
export function listOperations(): Promise<OperationRecord[]> {
  return db.operations.orderBy('updatedAt').reverse().toArray();
}
export function loadOperation(id: number): Promise<OperationRecord | undefined> {
  return db.operations.get(id);
}
export function deleteOperation(id: number): Promise<void> {
  return db.operations.delete(id);
}

// ---- memória de mapeamento de colunas por cliente ----
export async function saveMapping(cliente: string, map: MappingRecord['map']): Promise<void> {
  await db.mappings.put({ cliente, map });
}
export async function getMapping(cliente: string): Promise<MappingRecord['map'] | undefined> {
  const rec = await db.mappings.get(cliente);
  return rec?.map;
}
