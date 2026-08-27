import { SCHEMA_VERSION, type Plan } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// Save-to-file / Open-from-file for the whole plan as plain JSON, so the plan
// can live in a Git repo or synced folder with real version history. Uses the
// File System Access API where available (so re-saving overwrites the same file
// silently), falling back to a download / file-input.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanFile {
  format: 'h2-resourcing-plan';
  schemaVersion: number;
  savedAt: string;
  plan: Plan;
}

const DEFAULT_NAME = 'h2-plan.json';

function serialise(plan: Plan): string {
  const payload: PlanFile = {
    format: 'h2-resourcing-plan',
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    plan,
  };
  return JSON.stringify(payload, null, 2);
}

function parse(text: string): Plan {
  const data = JSON.parse(text) as PlanFile | Plan;
  // Accept both the wrapped file format and a bare Plan.
  const plan = 'plan' in data && (data as PlanFile).format === 'h2-resourcing-plan'
    ? (data as PlanFile).plan
    : (data as Plan);
  if (!plan || !Array.isArray(plan.people) || !Array.isArray(plan.assignments)) {
    throw new Error('Not a recognised H2 plan file.');
  }
  return plan;
}

interface SupportsFsAccess {
  showSaveFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle>;
  showOpenFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
}

function fsAccess(): SupportsFsAccess | null {
  const w = window as unknown as Partial<SupportsFsAccess>;
  return w.showSaveFilePicker && w.showOpenFilePicker ? (w as SupportsFsAccess) : null;
}

const JSON_PICKER = {
  suggestedName: DEFAULT_NAME,
  types: [{ description: 'H2 plan', accept: { 'application/json': ['.json'] } }],
};

export interface SaveResult {
  handle?: FileSystemFileHandle;
  name: string;
  savedAt: string;
}

/**
 * Write the plan to a file. If `handle` is supplied (a previously chosen file),
 * overwrite it silently; otherwise prompt for a location.
 */
export async function savePlanToFile(
  plan: Plan,
  handle?: FileSystemFileHandle,
): Promise<SaveResult> {
  const text = serialise(plan);
  const fs = fsAccess();

  if (fs || handle) {
    const target = handle ?? (await fs!.showSaveFilePicker(JSON_PICKER));
    const writable = await (target as unknown as {
      createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
    }).createWritable();
    await writable.write(text);
    await writable.close();
    return {
      handle: target,
      name: (target as unknown as { name?: string }).name ?? DEFAULT_NAME,
      savedAt: new Date().toISOString(),
    };
  }

  // Fallback: download via a blob URL.
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = DEFAULT_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { name: DEFAULT_NAME, savedAt: new Date().toISOString() };
}

export interface OpenResult {
  plan: Plan;
  handle?: FileSystemFileHandle;
  name: string;
}

/** Open a plan from a file the user chooses. */
export async function openPlanFromFile(): Promise<OpenResult | null> {
  const fs = fsAccess();
  if (fs) {
    const [handle] = await fs.showOpenFilePicker(JSON_PICKER);
    if (!handle) return null;
    const file = await (handle as unknown as { getFile: () => Promise<File> }).getFile();
    const plan = parse(await file.text());
    return { plan, handle, name: file.name };
  }

  // Fallback: hidden file input.
  return new Promise<OpenResult | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve({ plan: parse(await file.text()), name: file.name });
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
