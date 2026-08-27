import { useState } from 'react';
import { usePlanStore } from '../../store/planStore';
import { Modal } from './Modal';
import { Button } from './Button';

// Prominent, one-click (+ confirm) wipe of everything this browser holds — for
// use on a shared or public machine. Warns clearly first (durability spec).
export function ClearDataDialog({ onClose }: { onClose: () => void }) {
  const clearLocalData = usePlanStore((s) => s.clearLocalData);
  const dirty = usePlanStore((s) => s.dirtySinceFileSave);
  const saveToFile = usePlanStore((s) => s.saveToFile);
  const [busy, setBusy] = useState(false);

  async function wipe() {
    setBusy(true);
    await clearLocalData();
    onClose();
  }

  return (
    <Modal
      title="Clear all local data"
      subtitle="Removes everything this browser holds for the app."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void wipe()} disabled={busy}>
            {busy ? 'Clearing…' : 'Clear everything now'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          This permanently deletes the working plan and all local snapshots from this browser
          (IndexedDB). It cannot be undone. Use it before leaving a shared or public machine.
        </p>
        {dirty && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            You have changes not yet saved to a file. Once cleared they are gone.{' '}
            <button className="font-medium underline" onClick={() => void saveToFile()}>
              Save to file first
            </button>
            .
          </p>
        )}
      </div>
    </Modal>
  );
}
