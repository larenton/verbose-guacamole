import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Plan } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB working store. localStorage is not sufficient — the plan will
// outgrow it and a silent quota failure is unacceptable. The current plan is
// written on every commit; a rolling set of the last ~20 snapshots is kept for
// local restore.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'h2-resourcing';
const DB_VERSION = 1;
const MAX_SNAPSHOTS = 20;

export interface Snapshot {
  id: number;
  createdAt: string;
  label: string;
  plan: Plan;
}

interface H2DB extends DBSchema {
  plan: {
    key: string;
    value: Plan;
  };
  snapshots: {
    key: number;
    value: Snapshot;
    indexes: { byCreatedAt: string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<H2DB>> | null = null;

function db(): Promise<IDBPDatabase<H2DB>> {
  if (!dbPromise) {
    dbPromise = openDB<H2DB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore('plan');
        const snaps = database.createObjectStore('snapshots', {
          keyPath: 'id',
          autoIncrement: true,
        });
        snaps.createIndex('byCreatedAt', 'createdAt');
        database.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
}

const CURRENT_KEY = 'current';

/** Load the autosaved working plan, if any. */
export async function loadPlan(): Promise<Plan | undefined> {
  return (await db()).get('plan', CURRENT_KEY);
}

/** Persist the working plan. Throws on quota/write failure so the UI can surface it. */
export async function savePlan(plan: Plan): Promise<void> {
  await (await db()).put('plan', plan, CURRENT_KEY);
}

/** Append a snapshot and trim to the most recent MAX_SNAPSHOTS. */
export async function pushSnapshot(plan: Plan, label: string): Promise<void> {
  const database = await db();
  const tx = database.transaction('snapshots', 'readwrite');
  await tx.store.add({ createdAt: new Date().toISOString(), label, plan } as Snapshot);
  // Trim oldest beyond the cap.
  const all = await tx.store.index('byCreatedAt').getAllKeys();
  const excess = all.length - MAX_SNAPSHOTS;
  for (let i = 0; i < excess; i++) {
    await tx.store.delete(all[i]!);
  }
  await tx.done;
}

/** List snapshots, newest first. */
export async function listSnapshots(): Promise<Snapshot[]> {
  const all = await (await db()).getAllFromIndex('snapshots', 'byCreatedAt');
  return all.reverse();
}

export async function getSnapshot(id: number): Promise<Snapshot | undefined> {
  return (await db()).get('snapshots', id);
}

export async function clearAll(): Promise<void> {
  const database = await db();
  const tx = database.transaction(['plan', 'snapshots', 'meta'], 'readwrite');
  await Promise.all([tx.objectStore('plan').clear(), tx.objectStore('snapshots').clear()]);
  await tx.done;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key) as Promise<T | undefined>;
}
