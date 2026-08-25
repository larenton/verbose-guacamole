import { useMemo, useState } from 'react';
import { usePlanStore } from '../../store/planStore';
import {
  allocated,
  capacity,
  headroom,
  personTotals,
  utilisation,
} from '../../engine';
import { personLines } from '../grid/model';
import { PRODUCT_META } from '../../model/products';
import type { ProductCode } from '../../model/types';
import { formatDays, formatDollarsCompact, formatPct, formatSigned } from '../format';
import { RAIL_BREACH, RAIL_DEFICIT, RAIL_SURPLUS } from '../scale';

export function PersonPanel() {
  const idx = usePlanStore((s) => s.idx)!;
  const personId = usePlanStore((s) => s.selectedPersonId);
  const close = usePlanStore((s) => s.selectPerson);
  const setRate = usePlanStore((s) => s.setPersonRate);
  const setFte = usePlanStore((s) => s.setPersonFte);

  const person = personId ? idx.personById.get(personId) : null;

  const data = useMemo(() => {
    if (!person) return null;
    const months = idx.months;
    const head = months.map((m) => headroom(idx, person.id, m.id));
    const alloc = months.map((m) => allocated(idx, person.id, m.id));
    const cap = months.map((m) => capacity(idx, person.id, m.id));
    let worst = 0;
    for (let i = 1; i < head.length; i++) if (head[i]! < head[worst]!) worst = i;
    return {
      months,
      head,
      alloc,
      cap,
      worst,
      summary: personTotals(idx, person.id, months),
      lines: personLines(idx, person.id),
      rate: idx.ratePerDay.get(person.id) ?? 0,
    };
  }, [idx, person]);

  if (!person || !data) return null;

  const worstMonth = data.months[data.worst]!;
  const worstUtil = utilisation(idx, person.id, worstMonth.id);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`${person.name} details`}>
      <div className="absolute inset-0 bg-slate-900/20" onClick={() => close(null)} />
      <aside className="relative flex h-full w-96 flex-col overflow-auto border-l border-slate-300 bg-white shadow-xl">
        <header className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{person.name}</h2>
            <p className="text-xs text-slate-500">{person.role}</p>
          </div>
          <button
            onClick={() => close(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close panel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Field label="Pool" value={person.pool} />
            <Field label="Funding" value={person.fundingTreatment} span />
            <EditableField
              label="FTE availability"
              value={person.fteAvailability}
              step={0.1}
              onCommit={(v) => setFte(person.id, v)}
            />
            <EditableField
              label="Annual cost ($)"
              value={person.annualCost}
              step={1000}
              onCommit={(v) => setRate(person.id, v)}
            />
            <Field label="Daily rate" value={`$${Math.round(data.rate).toLocaleString()}`} />
            <Field label="Capacity basis" value={`÷ ${idx.settings.workingDaysPerYear} days/yr`} />
          </dl>

          <div className="grid grid-cols-3 gap-2">
            <Metric label="Total days" value={formatDays(data.summary.days)} />
            <Metric label="Avg FTE" value={data.summary.avgFte.toFixed(2)} />
            <Metric label="Commitment" value={formatDollarsCompact(data.summary.cost)} />
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Headroom across the horizon</p>
            <Sparkline head={data.head} cap={data.cap} months={data.months.map((m) => m.label)} tol={idx.settings.toleranceCeiling} />
          </div>

          <div
            className={`rounded border px-3 py-2 text-xs ${
              worstUtil > idx.settings.toleranceCeiling
                ? 'border-red-200 bg-red-50 text-red-800'
                : worstUtil > 1
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            <span className="font-semibold">Worst month:</span> {worstMonth.label} at {formatPct(worstUtil)} —{' '}
            {data.head[data.worst]! < 0
              ? `over by ${formatDays(-data.head[data.worst]!)}d`
              : `${formatDays(data.head[data.worst]!)}d free`}
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Products</p>
            <ul className="space-y-1">
              {data.lines.map((pid) => {
                const meta = PRODUCT_META[pid as ProductCode];
                const days = data.months.reduce(
                  (s, m) => s + (idx.daysByPersonProductMonth.get(`${person.id}|${pid}|${m.id}`) ?? 0),
                  0,
                );
                return (
                  <li key={pid} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: meta.colour }} />
                      <span className="text-slate-600">
                        <span className="font-medium text-slate-700">{meta.code}</span> {meta.name}
                      </span>
                    </span>
                    <span className="tabular text-slate-500">{formatDays(days)}d</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}

function EditableField({
  label,
  value,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(String(value));
  // Keep in sync if the underlying value changes elsewhere.
  const [lastProp, setLastProp] = useState(value);
  if (lastProp !== value) {
    setLastProp(value);
    setV(String(value));
  }
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd>
        <input
          type="number"
          step={step}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            const n = Number(v);
            if (Number.isFinite(n)) onCommit(n);
          }}
          className="tabular w-full rounded border border-slate-200 px-1.5 py-0.5 text-slate-800 focus:border-slate-400 focus:outline-none"
        />
      </dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
      <div className="tabular text-sm font-semibold text-slate-800">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function Sparkline({ head, cap, months, tol }: { head: number[]; cap: number[]; months: string[]; tol: number }) {
  const w = 340;
  const h = 44;
  const n = head.length;
  const step = w / n;
  const maxCap = Math.max(...cap, 1);
  const mid = h / 2;
  return (
    <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Headroom sparkline">
      <line x1={0} y1={mid} x2={w} y2={mid} stroke="#e2e8f0" strokeWidth={1} />
      {head.map((hd, i) => {
        const ratio = Math.max(-1, Math.min(1, hd / maxCap));
        const barH = Math.abs(ratio) * (mid - 2);
        const over = cap[i]! > 0 ? -hd / cap[i]! : 0;
        const colour = hd >= 0 ? RAIL_SURPLUS : over > tol - 1 ? RAIL_BREACH : RAIL_DEFICIT;
        return (
          <rect
            key={i}
            x={i * step + 1}
            y={hd >= 0 ? mid - barH : mid}
            width={Math.max(1, step - 2)}
            height={Math.max(0.5, barH)}
            fill={colour}
          >
            <title>{`${months[i]}: ${formatSigned(hd, 'days')} days`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
