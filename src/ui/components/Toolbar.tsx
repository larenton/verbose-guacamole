import { useState } from 'react';
import { usePlanStore, type ViewId } from '../../store/planStore';
import type { Unit } from '../../model/types';
import { Segmented } from './Segmented';
import { Button } from './Button';
import { SaveIndicator, FileButtons } from './SaveIndicator';
import { SnapshotsDialog } from './SnapshotsDialog';

interface Props {
  onImport: () => void;
}

export function Toolbar({ onImport }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const plan = usePlanStore((s) => s.plan);
  const unit = usePlanStore((s) => s.unit);
  const setUnit = usePlanStore((s) => s.setUnit);
  const view = usePlanStore((s) => s.view);
  const setView = usePlanStore((s) => s.setView);
  const density = usePlanStore((s) => s.density);
  const toggleDensity = usePlanStore((s) => s.toggleDensity);
  const allCollapsed = usePlanStore((s) => s.allCollapsed);
  const expandAll = usePlanStore((s) => s.expandAll);
  const collapseAll = usePlanStore((s) => s.collapseAll);
  const undo = usePlanStore((s) => s.undo);
  const redo = usePlanStore((s) => s.redo);
  const canUndo = usePlanStore((s) => s.past.length > 0);
  const canRedo = usePlanStore((s) => s.future.length > 0);
  const pinchDismissed = usePlanStore((s) => s.pinchDismissed);
  const setPinchDismissed = usePlanStore((s) => s.setPinchDismissed);

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-300 bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight text-slate-900">H2 Resourcing</span>
        <span className="hidden text-[10px] uppercase tracking-wider text-slate-400 sm:inline">
          Applied Programs
        </span>
      </div>

      <Segmented<ViewId>
        ariaLabel="View"
        value={view}
        onChange={setView}
        options={[
          { value: 'portfolio', label: 'Portfolio' },
          { value: 'headroom', label: 'Headroom' },
          { value: 'product', label: 'Product' },
        ]}
      />

      <Segmented<Unit>
        ariaLabel="Unit"
        value={unit}
        onChange={setUnit}
        options={[
          { value: 'days', label: 'Days', title: 'Working days — the planning currency' },
          { value: 'fte', label: 'FTE', title: 'days ÷ working days' },
          { value: 'dollars', label: '$', title: 'days × daily rate' },
        ]}
      />

      {view !== 'product' && (
        <div className="flex items-center gap-1.5">
          <Button onClick={() => (allCollapsed ? expandAll() : collapseAll())} title="Collapse or expand every person">
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
          <Button onClick={toggleDensity} title="Compact / comfortable row height">
            {density === 'compact' ? 'Comfortable' : 'Compact'}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          ↶ Undo
        </Button>
        <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">
          ↷ Redo
        </Button>
      </div>

      {pinchDismissed && (
        <Button onClick={() => setPinchDismissed(false)} title="Show the pinch-points panel">
          Pinch points
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <FileButtons />
        <Button
          onClick={async () => {
            if (!plan) return;
            const { downloadWorkbook } = await import('../../export/workbook');
            downloadWorkbook(plan);
          }}
          title="Export the full workbook with live formulas"
        >
          Export Excel
        </Button>
        <Button variant="ghost" onClick={() => setHistoryOpen(true)} title="Restore a local snapshot">
          History
        </Button>
        <Button onClick={onImport} title="Import a workbook (destructive)">
          Import…
        </Button>
      </div>

      <div className="w-full sm:w-auto">
        <SaveIndicator />
      </div>

      {historyOpen && <SnapshotsDialog onClose={() => setHistoryOpen(false)} />}
    </header>
  );
}
