import { useMemo } from 'react';
import { usePlanStore } from '../../store/planStore';
import { pinchPoints, pinchSummary } from '../../engine';
import { formatDays, formatPct } from '../format';
import { Button } from './Button';
import { toCsv, downloadText } from '../../export/csv';

export function PinchPanel() {
  const idx = usePlanStore((s) => s.idx)!;
  const rationales = usePlanStore((s) => s.plan?.annotations?.pinchRationales ?? {});
  const setRationale = usePlanStore((s) => s.setPinchRationale);
  const selectPerson = usePlanStore((s) => s.selectPerson);
  const setPinchDismissed = usePlanStore((s) => s.setPinchDismissed);

  const points = useMemo(() => pinchPoints(idx), [idx]);
  const summary = pinchSummary(points);

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['Person', 'Month', 'Allocated', 'Capacity', 'Over by (days)', 'Utilisation', 'Band', 'Rationale'],
      ...points.map((p) => {
        const person = idx.personById.get(p.personId)!;
        const month = idx.monthById.get(p.monthId)!;
        return [
          person.name,
          month.label,
          formatDays(p.allocated),
          formatDays(p.capacity),
          formatDays(-p.headroom),
          formatPct(p.utilisation),
          p.band === 'breach' ? 'Breach (>115%)' : 'Within tolerance (100–115%)',
          rationales[`${p.personId}|${p.monthId}`] ?? '',
        ];
      }),
    ];
    downloadText('pinch-points.csv', toCsv(rows));
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Pinch points</h2>
          <p className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
              {summary.tolerance} tolerance
            </span>
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">{summary.breach} breach</span>
          </p>
        </div>
        <button
          onClick={() => setPinchDismissed(true)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss pinch panel"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {points.length === 0 ? (
          <p className="p-4 text-center text-xs text-slate-400">
            No month is over 100% capacity. The plan is deliverable as drawn.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {points.map((p) => {
              const person = idx.personById.get(p.personId)!;
              const month = idx.monthById.get(p.monthId)!;
              const key = `${p.personId}|${p.monthId}`;
              const breach = p.band === 'breach';
              return (
                <li key={key} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <button
                      onClick={() => selectPerson(p.personId)}
                      className="truncate text-left text-xs font-medium text-slate-800 hover:underline"
                      title={`${person.name} · ${month.label}`}
                    >
                      {person.name}
                    </button>
                    <span
                      className={`tabular shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        breach ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {formatPct(p.utilisation)}
                    </span>
                  </div>
                  <div className="tabular mt-0.5 text-[11px] text-slate-500">
                    {month.label} · {formatDays(p.allocated)}/{formatDays(p.capacity)}d ·{' '}
                    <span className={breach ? 'text-red-600' : 'text-amber-600'}>
                      {breach ? 'breach' : 'within tolerance'}
                    </span>{' '}
                    · over by {formatDays(-p.headroom)}d
                  </div>
                  <input
                    value={rationales[key] ?? ''}
                    onChange={(e) => setRationale(p.personId, p.monthId, e.target.value)}
                    placeholder="one-line rationale…"
                    className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-slate-200 p-2">
        <Button onClick={exportCsv} disabled={points.length === 0} className="w-full justify-center">
          Export pinch list (CSV)
        </Button>
      </footer>
    </aside>
  );
}
