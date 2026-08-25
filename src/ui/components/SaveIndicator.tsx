import { usePlanStore } from '../../store/planStore';
import { Button } from './Button';

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function SaveIndicator() {
  const saveState = usePlanStore((s) => s.saveState);
  const saveError = usePlanStore((s) => s.saveError);
  const retry = usePlanStore((s) => s.retryAutosave);
  const lastFileSaveAt = usePlanStore((s) => s.lastFileSaveAt);
  const dirty = usePlanStore((s) => s.dirtySinceFileSave);

  return (
    <div className="flex items-center gap-3 text-[11px]">
      {saveState === 'error' ? (
        <span className="flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-0.5 text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Not saved: {saveError}
          <button onClick={retry} className="underline hover:no-underline">
            Retry
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-slate-500" title="Autosaved to this browser (IndexedDB)">
          <span
            className={`h-1.5 w-1.5 rounded-full ${saveState === 'saving' ? 'bg-amber-400' : 'bg-emerald-500'}`}
          />
          {saveState === 'saving' ? 'Saving…' : 'Saved'}
        </span>
      )}

      <span className="text-slate-300">·</span>

      <span className="text-slate-500" title="Last time you saved the plan to a .json file">
        File: {timeAgo(lastFileSaveAt)}
        {dirty && lastFileSaveAt && (
          <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700">unsaved changes</span>
        )}
      </span>
    </div>
  );
}

export function FileButtons() {
  const saveToFile = usePlanStore((s) => s.saveToFile);
  const openFromFile = usePlanStore((s) => s.openFromFile);
  return (
    <>
      <Button onClick={() => void openFromFile()} title="Open a plan .json from disk">
        Open…
      </Button>
      <Button onClick={() => void saveToFile()} title="Save plan to a .json file (⌘S)">
        Save to file
      </Button>
    </>
  );
}
