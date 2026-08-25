import { useEffect, useState } from 'react';
import { listSnapshots, type Snapshot } from '../../store/db';
import { usePlanStore } from '../../store/planStore';
import { Modal } from './Modal';
import { Button } from './Button';

export function SnapshotsDialog({ onClose }: { onClose: () => void }) {
  const restore = usePlanStore((s) => s.restoreSnapshot);
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);

  useEffect(() => {
    void listSnapshots().then(setSnaps);
  }, []);

  return (
    <Modal
      title="Local snapshots"
      subtitle="Automatic restore points kept in this browser. Restoring is undoable."
      onClose={onClose}
    >
      {snaps === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : snaps.length === 0 ? (
        <p className="text-sm text-slate-400">
          No snapshots yet. They accumulate as you work; the last ~20 are kept.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {snaps.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <div className="text-sm text-slate-800">{s.label}</div>
                <div className="tabular text-xs text-slate-500">
                  {new Date(s.createdAt).toLocaleString('en-AU')} · {s.plan.assignments.length} assignments
                </div>
              </div>
              <Button
                onClick={() => {
                  void restore(s.id);
                  onClose();
                }}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
