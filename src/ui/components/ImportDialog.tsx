import { useRef, useState } from 'react';
import type { ParseResult } from '../../import/parseWorkbook';
import { applyInitials, defaultInitialsMap } from '../../import/anonymise';
import { usePlanStore } from '../../store/planStore';
import { Modal } from './Modal';
import { Button } from './Button';
import { formatDays } from '../format';

interface Props {
  onClose: () => void;
}

export function ImportDialog({ onClose }: Props) {
  const replaceAll = usePlanStore((s) => s.replaceAll);
  const hasExisting = usePlanStore((s) => s.plan !== null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const { parsePlanFromArrayBuffer } = await import('../../import/parseWorkbook');
      const parsed = parsePlanFromArrayBuffer(buf, file.name);
      setFileName(file.name);
      setResult(parsed);
      setInitials(defaultInitialsMap(parsed.plan));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function commit() {
    if (!result) return;
    // Apply the name→initials mapping BEFORE anything persists. Only initials
    // are ever written to IndexedDB, exported, or shown.
    const anonymised = applyInitials(result.plan, initials);
    replaceAll(anonymised);
    onClose();
  }

  const report = result?.report;

  return (
    <Modal
      title="Import workbook"
      subtitle="One-time migration. Names are replaced with initials at import — only initials are stored, exported, or shown."
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={commit} disabled={!result}>
            {hasExisting ? 'Replace all data' : 'Import & seed'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-slate-400 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            <span className="text-sm font-medium text-slate-700">
              {fileName || 'Choose H2_Team_Schedule_Resourcing_v3.xlsx'}
            </span>
            <span className="text-xs text-slate-500">
              Parses People &amp; Rates and Team Schedule. Nothing is changed until you confirm.
            </span>
          </button>
        </div>

        {hasExisting && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This is destructive. Importing <strong>replaces the entire current plan</strong>. Save
            your current plan to a file first if you want to keep it.
          </p>
        )}

        {error && (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            Could not read that workbook: {error}
          </p>
        )}

        {report && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <Stat label="People" value={report.peopleCount} />
              <Stat label="Months" value={report.monthCount} />
              <Stat label="Products" value={report.productCount} />
              <Stat label="Assignments" value={report.assignmentCount} />
            </div>

            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                Name → initials mapping (edit as needed)
              </p>
              <div className="max-h-52 overflow-auto rounded border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-1 font-medium">Name (not stored)</th>
                      <th className="px-2 py-1 font-medium">Initials (stored)</th>
                      <th className="px-2 py-1 font-medium">Role</th>
                      <th className="px-2 py-1 text-right font-medium">Annual $</th>
                      <th className="px-2 py-1 text-right font-medium">FTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result!.plan.people.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-2 py-1 text-slate-400 line-through decoration-slate-300">{p.name}</td>
                        <td className="px-2 py-1">
                          <input
                            value={initials[p.id] ?? ''}
                            onChange={(e) =>
                              setInitials((m) => ({ ...m, [p.id]: e.target.value.toUpperCase().slice(0, 6) }))
                            }
                            aria-label={`Initials for ${p.name}`}
                            className="tabular w-16 rounded border border-slate-300 px-1.5 py-0.5 font-semibold text-slate-800 focus:border-slate-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1 text-slate-500">{p.role}</td>
                        <td className="px-2 py-1 text-right tabular text-slate-700">
                          {p.annualCost.toLocaleString()}
                        </td>
                        <td className="px-2 py-1 text-right tabular text-slate-700">
                          {formatDays(p.fteAvailability)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Full names stay in this browser tab only and are discarded on import. Salary figures
                are kept locally (IndexedDB) and never committed to the repository.
              </p>
            </div>

            {(report.skipped.length > 0 || report.warnings.length > 0) && (
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <p className="mb-1 font-medium text-slate-600">Parse report</p>
                <ul className="list-inside list-disc space-y-0.5 text-slate-500">
                  {report.skipped.map((s, i) => (
                    <li key={`s${i}`} className="text-amber-700">
                      Skipped: {s}
                    </li>
                  ))}
                  {report.warnings.map((w, i) => (
                    <li key={`w${i}`}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.skipped.length === 0 && report.warnings.length === 0 && (
              <p className="text-xs text-emerald-700">Nothing skipped — clean parse.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2">
      <div className="tabular text-lg text-slate-800">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
