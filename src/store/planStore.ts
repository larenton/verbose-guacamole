import { create } from 'zustand';
import type { Plan, Unit } from '../model/types';
import { indexPlan, type PlanIndex } from '../engine/calc';
import * as db from './db';
import * as mut from './mutations';
import type { CellEdit } from './mutations';
import { openPlanFromFile, savePlanToFile } from './file';

// ─────────────────────────────────────────────────────────────────────────────
// The single source of truth at runtime. Holds the normalised Plan, a memoised
// engine index, undo/redo history (≥50 deep), and autosave to IndexedDB. All
// derived figures are read from `idx` via engine selectors — never stored.
// ─────────────────────────────────────────────────────────────────────────────

export type ViewId = 'portfolio' | 'headroom' | 'product';
export type Density = 'compact' | 'comfortable';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const HISTORY_LIMIT = 60;
const AUTOSAVE_DEBOUNCE_MS = 350;

export interface HeadroomFilter {
  minFreeDays: number;
  fromMonthId: string | null;
  toMonthId: string | null;
  role: string | null;
  pool: string | null;
}

export interface PlanState {
  plan: Plan | null;
  idx: PlanIndex | null;
  ready: boolean;

  // history
  past: Plan[];
  future: Plan[];

  // view state
  unit: Unit;
  view: ViewId;
  density: Density;
  allCollapsed: boolean;
  expanded: Set<string>; // personIds expanded when not all-collapsed
  selectedPersonId: string | null;
  showAdmin: boolean; // include XX in product views
  showPortfolio: boolean; // include PF in product views
  headroomFilter: HeadroomFilter;
  pinchDismissed: boolean;

  // persistence status
  saveState: SaveState;
  saveError: string | null;
  lastAutosaveAt: string | null;
  fileHandle: FileSystemFileHandle | undefined;
  fileName: string | null;
  lastFileSaveAt: string | null;
  dirtySinceFileSave: boolean;

  // actions
  init: () => Promise<void>;
  replaceAll: (plan: Plan) => void;
  loadDemo: () => void;
  clearLocalData: () => Promise<void>;
  editCell: (personId: string, productId: string, monthId: string, days: number) => void;
  editMany: (edits: CellEdit[]) => void;
  addLine: (personId: string, productId: string) => void;
  setPersonRate: (personId: string, annualCost: number) => void;
  setPersonFte: (personId: string, fte: number) => void;
  setMonthWorkingDays: (monthId: string, workingDays: number) => void;
  setPinchRationale: (personId: string, monthId: string, text: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  setUnit: (u: Unit) => void;
  setView: (v: ViewId) => void;
  toggleDensity: () => void;
  expandAll: () => void;
  collapseAll: () => void;
  togglePerson: (personId: string) => void;
  isExpanded: (personId: string) => boolean;
  selectPerson: (personId: string | null) => void;
  setShowAdmin: (v: boolean) => void;
  setShowPortfolio: (v: boolean) => void;
  setHeadroomFilter: (patch: Partial<HeadroomFilter>) => void;
  setPinchDismissed: (v: boolean) => void;

  saveToFile: () => Promise<void>;
  openFromFile: () => Promise<void>;
  restoreSnapshot: (id: number) => Promise<void>;
  retryAutosave: () => void;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshotAt = 0;
const SNAPSHOT_THROTTLE_MS = 45_000;

function scheduleAutosave(get: () => PlanState, set: (p: Partial<PlanState>) => void) {
  const plan = get().plan;
  if (!plan) return;
  set({ saveState: 'saving', saveError: null });
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    const current = get().plan;
    if (!current) return;
    try {
      await db.savePlan(current);
      set({ saveState: 'saved', lastAutosaveAt: new Date().toISOString(), saveError: null });
      // Rolling local snapshots, throttled so we keep a spread of restore points.
      const now = Date.now();
      if (now - lastSnapshotAt > SNAPSHOT_THROTTLE_MS) {
        lastSnapshotAt = now;
        void db.pushSnapshot(current, 'Autosave').catch(() => undefined);
      }
    } catch (e) {
      set({ saveState: 'error', saveError: e instanceof Error ? e.message : String(e) });
    }
  }, AUTOSAVE_DEBOUNCE_MS);
}

const DEFAULT_FILTER: HeadroomFilter = {
  minFreeDays: 0,
  fromMonthId: null,
  toMonthId: null,
  role: null,
  pool: null,
};

export const usePlanStore = create<PlanState>((set, get) => {
  /** Commit a new plan version: push history, re-index, autosave, snapshot bookkeeping. */
  function commit(next: Plan) {
    const prev = get().plan;
    if (!next || next === prev) return;
    const past = prev ? [...get().past, prev].slice(-HISTORY_LIMIT) : get().past;
    set({
      plan: next,
      idx: indexPlan(next),
      past,
      future: [],
      dirtySinceFileSave: true,
    });
    scheduleAutosave(get, set);
  }

  return {
    plan: null,
    idx: null,
    ready: false,
    past: [],
    future: [],

    unit: 'days',
    view: 'portfolio',
    density: 'comfortable',
    allCollapsed: true,
    expanded: new Set<string>(),
    selectedPersonId: null,
    showAdmin: false,
    showPortfolio: true,
    headroomFilter: { ...DEFAULT_FILTER },
    pinchDismissed: false,

    saveState: 'idle',
    saveError: null,
    lastAutosaveAt: null,
    fileHandle: undefined,
    fileName: null,
    lastFileSaveAt: null,
    dirtySinceFileSave: false,

    async init() {
      const plan = await db.loadPlan();
      if (plan) {
        set({ plan, idx: indexPlan(plan), ready: true, saveState: 'saved' });
      } else {
        set({ ready: true });
      }
    },

    replaceAll(plan) {
      // Destructive: new baseline, clears history.
      set({
        plan,
        idx: indexPlan(plan),
        past: [],
        future: [],
        selectedPersonId: null,
        pinchDismissed: false,
        dirtySinceFileSave: true,
      });
      scheduleAutosave(get, set);
      void db.pushSnapshot(plan, 'Imported workbook').catch(() => undefined);
    },

    loadDemo() {
      // Lazy import so the fictional dataset never weighs on the initial bundle.
      void import('../demo/demoPlan').then(({ buildDemoPlan }) => {
        get().replaceAll(buildDemoPlan());
      });
    },

    async clearLocalData() {
      await db.clearAll();
      set({
        plan: null,
        idx: null,
        past: [],
        future: [],
        selectedPersonId: null,
        pinchDismissed: false,
        saveState: 'idle',
        saveError: null,
        lastAutosaveAt: null,
        fileHandle: undefined,
        fileName: null,
        lastFileSaveAt: null,
        dirtySinceFileSave: false,
        headroomFilter: { ...DEFAULT_FILTER },
      });
    },

    editCell(personId, productId, monthId, days) {
      const plan = get().plan;
      if (!plan) return;
      commit(mut.setDays(plan, personId, productId, monthId, days));
    },

    editMany(edits) {
      const plan = get().plan;
      if (!plan) return;
      commit(mut.setManyDays(plan, edits));
    },

    addLine(personId, productId) {
      const plan = get().plan;
      if (!plan) return;
      commit(mut.ensureLine(plan, personId, productId));
    },

    setPersonRate(personId, annualCost) {
      const plan = get().plan;
      if (!plan) return;
      commit(mut.setPersonRate(plan, personId, annualCost));
    },

    setPersonFte(personId, fte) {
      const plan = get().plan;
      if (!plan) return;
      commit(mut.setPersonFte(plan, personId, fte));
    },

    setMonthWorkingDays(monthId, workingDays) {
      const plan = get().plan;
      if (!plan) return;
      commit(mut.setMonthWorkingDays(plan, monthId, workingDays));
    },

    setPinchRationale(personId, monthId, text) {
      const plan = get().plan;
      if (!plan) return;
      commit(mut.setPinchRationale(plan, personId, monthId, text));
    },

    undo() {
      const { past, plan } = get();
      if (!past.length || !plan) return;
      const previous = past[past.length - 1]!;
      set({
        plan: previous,
        idx: indexPlan(previous),
        past: past.slice(0, -1),
        future: [plan, ...get().future].slice(0, HISTORY_LIMIT),
        dirtySinceFileSave: true,
      });
      scheduleAutosave(get, set);
    },

    redo() {
      const { future, plan } = get();
      if (!future.length || !plan) return;
      const nextPlan = future[0]!;
      set({
        plan: nextPlan,
        idx: indexPlan(nextPlan),
        future: future.slice(1),
        past: [...get().past, plan].slice(-HISTORY_LIMIT),
        dirtySinceFileSave: true,
      });
      scheduleAutosave(get, set);
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    setUnit: (unit) => set({ unit }),
    setView: (view) => set({ view }),
    toggleDensity: () => set({ density: get().density === 'compact' ? 'comfortable' : 'compact' }),
    expandAll: () =>
      set({ allCollapsed: false, expanded: new Set(get().plan?.people.map((p) => p.id) ?? []) }),
    collapseAll: () => set({ allCollapsed: true, expanded: new Set<string>() }),
    togglePerson(personId) {
      const expanded = new Set(get().expanded);
      if (expanded.has(personId)) expanded.delete(personId);
      else expanded.add(personId);
      set({ expanded, allCollapsed: false });
    },
    isExpanded: (personId) => !get().allCollapsed && get().expanded.has(personId),
    selectPerson: (selectedPersonId) => set({ selectedPersonId }),
    setShowAdmin: (showAdmin) => set({ showAdmin }),
    setShowPortfolio: (showPortfolio) => set({ showPortfolio }),
    setHeadroomFilter: (patch) => set({ headroomFilter: { ...get().headroomFilter, ...patch } }),
    setPinchDismissed: (pinchDismissed) => set({ pinchDismissed }),

    async saveToFile() {
      const plan = get().plan;
      if (!plan) return;
      const res = await savePlanToFile(plan, get().fileHandle);
      set({
        fileHandle: res.handle ?? get().fileHandle,
        fileName: res.name,
        lastFileSaveAt: res.savedAt,
        dirtySinceFileSave: false,
      });
    },

    async openFromFile() {
      const res = await openPlanFromFile();
      if (!res) return;
      set({
        plan: res.plan,
        idx: indexPlan(res.plan),
        past: [],
        future: [],
        fileHandle: res.handle,
        fileName: res.name,
        lastFileSaveAt: new Date().toISOString(),
        dirtySinceFileSave: false,
        selectedPersonId: null,
      });
      scheduleAutosave(get, set);
    },

    async restoreSnapshot(id) {
      const snap = await db.getSnapshot(id);
      if (!snap) return;
      commit(snap.plan);
    },

    retryAutosave() {
      scheduleAutosave(get, set);
    },
  };
});
