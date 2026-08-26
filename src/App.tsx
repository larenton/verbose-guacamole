import { useEffect, useState } from 'react';
import { usePlanStore } from './store/planStore';
import { Toolbar } from './ui/components/Toolbar';
import { ImportDialog } from './ui/components/ImportDialog';
import { PortfolioGrid } from './ui/grid/PortfolioGrid';
import { ProductView } from './ui/ProductView';
import { PinchPanel } from './ui/components/PinchPanel';
import { PersonPanel } from './ui/components/PersonPanel';
import { FilterBar } from './ui/components/FilterBar';
import { Button } from './ui/components/Button';
import { BAND_STYLE, BAND_ORDER } from './ui/scale';

export default function App() {
  const ready = usePlanStore((s) => s.ready);
  const plan = usePlanStore((s) => s.plan);
  const view = usePlanStore((s) => s.view);
  const selectedPersonId = usePlanStore((s) => s.selectedPersonId);
  const pinchDismissed = usePlanStore((s) => s.pinchDismissed);
  const init = usePlanStore((s) => s.init);
  const setView = usePlanStore((s) => s.setView);
  const undo = usePlanStore((s) => s.undo);
  const redo = usePlanStore((s) => s.redo);
  const saveToFile = usePlanStore((s) => s.saveToFile);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // Hash routing: keep the view in location.hash so a refresh (incl. under
  // file://) lands on the same view. No router library needed.
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace('#', '');
      if (h === 'portfolio' || h === 'headroom' || h === 'product') setView(h);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [setView]);

  useEffect(() => {
    if (window.location.hash.replace('#', '') !== view) window.location.hash = view;
  }, [view]);

  // Global keyboard: undo / redo / save-to-file.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 's') {
        e.preventDefault();
        void saveToFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, saveToFile]);

  if (!ready) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!plan) {
    return (
      <>
        <EmptyState onImport={() => setImportOpen(true)} />
        {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <Toolbar onImport={() => setImportOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {view === 'headroom' && <FilterBar />}
          {view === 'product' ? (
            <ProductView />
          ) : (
            <PortfolioGrid mode={view === 'headroom' ? 'headroom' : 'portfolio'} />
          )}
          <Legend />
        </main>

        {!pinchDismissed && <PinchPanel />}
      </div>

      {selectedPersonId && <PersonPanel />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500">
      <span className="uppercase tracking-wide text-slate-400">Utilisation</span>
      {BAND_ORDER.map((b) => (
        <span key={b} className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-200"
            style={{ background: BAND_STYLE[b].bg }}
          />
          {BAND_STYLE[b].label}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  const openFromFile = usePlanStore((s) => s.openFromFile);
  const loadDemo = usePlanStore((s) => s.loadDemo);
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-5 p-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Applied Programs · UNSW College</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">H2 Resourcing Dashboard</h1>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">
        A local-first capacity planner. Every figure is the same number expressed three ways —{' '}
        <span className="tabular">capacity − allocated = headroom</span> — in days, FTE, or dollars.
        Nothing you load leaves this browser.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => loadDemo()}>
          Explore the demo
        </Button>
        <Button onClick={onImport}>Import workbook…</Button>
        <Button onClick={() => void openFromFile()}>Open plan file…</Button>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <p>
          <span className="font-medium text-slate-600">Privacy.</span> The demo is entirely
          fictional. When you import a workbook, real names are replaced with initials at import —
          only initials are ever stored, and salary figures stay in this browser (IndexedDB), never
          on the server or in the source repository.
        </p>
      </div>
    </main>
  );
}
