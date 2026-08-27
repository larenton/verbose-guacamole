import { useMemo } from 'react';
import { usePlanStore } from '../../store/planStore';

// Filter bar for the headroom view: "who has ≥ N days free between X and Y?"
export function FilterBar() {
  const idx = usePlanStore((s) => s.idx)!;
  const filter = usePlanStore((s) => s.headroomFilter);
  const setFilter = usePlanStore((s) => s.setHeadroomFilter);

  const roles = useMemo(() => [...new Set(idx.people.map((p) => p.role))].sort(), [idx]);
  const pools = useMemo(() => [...new Set(idx.people.map((p) => p.pool))].sort(), [idx]);

  const selectClass =
    'rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <span className="font-medium text-slate-600">Who has</span>
      <label className="flex items-center gap-1.5">
        <span className="text-slate-500">≥</span>
        <input
          type="number"
          min={0}
          step={1}
          value={filter.minFreeDays}
          onChange={(e) => setFilter({ minFreeDays: Number(e.target.value) || 0 })}
          className="tabular w-14 rounded border border-slate-300 px-1.5 py-1 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        />
        <span className="text-slate-500">days free each month</span>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-slate-500">between</span>
        <select
          value={filter.fromMonthId ?? ''}
          onChange={(e) => setFilter({ fromMonthId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">start</option>
          {idx.months.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="text-slate-500">and</span>
        <select
          value={filter.toMonthId ?? ''}
          onChange={(e) => setFilter({ toMonthId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">end</option>
          {idx.months.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-slate-500">role</span>
        <select
          value={filter.role ?? ''}
          onChange={(e) => setFilter({ role: e.target.value || null })}
          className={selectClass}
        >
          <option value="">any</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-slate-500">pool</span>
        <select
          value={filter.pool ?? ''}
          onChange={(e) => setFilter({ pool: e.target.value || null })}
          className={selectClass}
        >
          <option value="">any</option>
          {pools.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      {(filter.minFreeDays > 0 || filter.role || filter.pool || filter.fromMonthId || filter.toMonthId) && (
        <button
          onClick={() => setFilter({ minFreeDays: 0, role: null, pool: null, fromMonthId: null, toMonthId: null })}
          className="text-slate-500 underline hover:text-slate-700"
        >
          clear
        </button>
      )}
    </div>
  );
}
