import { useCallback, useMemo, useRef, useState } from 'react';
import { usePlanStore } from '../../store/planStore';
import {
  allocated,
  capacity,
  personProductMonthDays,
  personTotals,
  utilBand,
  type PlanIndex,
} from '../../engine';
import type { RowSummary } from '../../engine/aggregate';
import { cellValue, summaryValue } from '../convert';
import { EMPTY_CELL, formatDays, formatSigned, formatUnit } from '../format';
import { BAND_STYLE } from '../scale';
import { HeadroomRail } from './HeadroomRail';
import { intakeMarkers, personLines, quarterSpans } from './model';
import { PRODUCT_META } from '../../model/products';
import type { ProductCode } from '../../model/types';

type Mode = 'portfolio' | 'headroom';

interface Coord {
  r: number; // index into editableRows
  m: number; // month index
}
interface EditableRow {
  personId: string;
  productId: string;
}

interface PersonData {
  personId: string;
  alloc: number[];
  cap: number[];
  head: number[];
  summary: RowSummary;
  lines: { productId: string; days: number[]; total: number }[];
}

function buildPersonData(idx: PlanIndex): Map<string, PersonData> {
  const map = new Map<string, PersonData>();
  for (const person of idx.people) {
    const alloc = idx.months.map((m) => allocated(idx, person.id, m.id));
    const cap = idx.months.map((m) => capacity(idx, person.id, m.id));
    const head = idx.months.map((_, i) => cap[i]! - alloc[i]!);
    const lines = personLines(idx, person.id).map((productId) => {
      const days = idx.months.map((m) => personProductMonthDays(idx, person.id, productId, m.id));
      return { productId, days, total: days.reduce((s, d) => s + d, 0) };
    });
    map.set(person.id, {
      personId: person.id,
      alloc,
      cap,
      head,
      summary: personTotals(idx, person.id, idx.months),
      lines,
    });
  }
  return map;
}

export function PortfolioGrid({ mode }: { mode: Mode }) {
  const idx = usePlanStore((s) => s.idx)!;
  const unit = usePlanStore((s) => s.unit);
  const density = usePlanStore((s) => s.density);
  const allCollapsed = usePlanStore((s) => s.allCollapsed);
  const expanded = usePlanStore((s) => s.expanded);
  const togglePerson = usePlanStore((s) => s.togglePerson);
  const selectPerson = usePlanStore((s) => s.selectPerson);
  const editCell = usePlanStore((s) => s.editCell);
  const editMany = usePlanStore((s) => s.editMany);
  const setUnit = usePlanStore((s) => s.setUnit);
  const filter = usePlanStore((s) => s.headroomFilter);

  const months = idx.months;
  const quarters = useMemo(() => quarterSpans(months), [months]);
  const intakes = useMemo(() => intakeMarkers(idx), [idx]);
  const personData = useMemo(() => buildPersonData(idx), [idx]);

  const isExpanded = useCallback(
    (personId: string) => !allCollapsed && expanded.has(personId),
    [allCollapsed, expanded],
  );

  // Filter (headroom view): keep people whose min headroom over the range ≥ N,
  // and matching role/pool. Non-matches are hidden.
  const visiblePeople = useMemo(() => {
    if (mode !== 'headroom') return idx.people;
    const lo = filter.fromMonthId ? idx.monthById.get(filter.fromMonthId)?.order ?? 0 : 0;
    const hi = filter.toMonthId
      ? idx.monthById.get(filter.toMonthId)?.order ?? months.length - 1
      : months.length - 1;
    const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
    return idx.people.filter((p) => {
      if (filter.role && p.role !== filter.role) return false;
      if (filter.pool && p.pool !== filter.pool) return false;
      const data = personData.get(p.id)!;
      let minHead = Infinity;
      for (let i = a; i <= b; i++) minHead = Math.min(minHead, data.head[i]!);
      return minHead >= filter.minFreeDays;
    });
  }, [mode, idx, filter, months.length, personData]);

  // Flat list of editable rows (expanded people's product lines) for keyboard nav.
  const editableRows = useMemo<EditableRow[]>(() => {
    const rows: EditableRow[] = [];
    for (const person of visiblePeople) {
      if (!isExpanded(person.id)) continue;
      for (const line of personData.get(person.id)!.lines) {
        rows.push({ personId: person.id, productId: line.productId });
      }
    }
    return rows;
  }, [visiblePeople, isExpanded, personData]);

  const rowIndexOf = useCallback(
    (personId: string, productId: string) =>
      editableRows.findIndex((r) => r.personId === personId && r.productId === productId),
    [editableRows],
  );

  // ── Selection + editing state ──────────────────────────────────────────────
  const [sel, setSel] = useState<{ anchor: Coord; focus: Coord } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editSelectAll, setEditSelectAll] = useState(false);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const dims =
    density === 'compact'
      ? { cell: 40, row: 24, rail: 14, label: 220, font: 'text-[11px]' }
      : { cell: 46, row: 30, rail: 18, label: 240, font: 'text-xs' };

  const inRect = useCallback(
    (r: number, m: number) => {
      if (!sel) return false;
      const r0 = Math.min(sel.anchor.r, sel.focus.r);
      const r1 = Math.max(sel.anchor.r, sel.focus.r);
      const m0 = Math.min(sel.anchor.m, sel.focus.m);
      const m1 = Math.max(sel.anchor.m, sel.focus.m);
      return r >= r0 && r <= r1 && m >= m0 && m <= m1;
    },
    [sel],
  );

  const focusContainer = () => containerRef.current?.focus();

  const startEdit = useCallback(
    (initial: string, selectAll: boolean) => {
      if (unit !== 'days') {
        setUnit('days');
        setNote('Switched to Days — edits are made in days.');
        window.setTimeout(() => setNote(null), 2200);
      }
      setEditSelectAll(selectAll);
      setEditing(initial);
    },
    [unit, setUnit],
  );

  const commit = useCallback(
    (coord: Coord, raw: string) => {
      const row = editableRows[coord.r];
      const month = months[coord.m];
      if (!row || !month) return;
      const value = raw.trim() === '' ? 0 : Number(raw);
      if (Number.isFinite(value)) editCell(row.personId, row.productId, month.id, value);
      setEditing(null);
    },
    [editableRows, months, editCell],
  );

  const move = useCallback(
    (coord: Coord, dr: number, dm: number, extend: boolean) => {
      const r = Math.max(0, Math.min(editableRows.length - 1, coord.r + dr));
      const m = Math.max(0, Math.min(months.length - 1, coord.m + dm));
      const next = { r, m };
      setSel((prev) =>
        extend && prev ? { anchor: prev.anchor, focus: next } : { anchor: next, focus: next },
      );
      return next;
    },
    [editableRows.length, months.length],
  );

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    // Undo/redo handled globally in App; ignore here so it bubbles.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'y')) return;
    if (editing !== null) return; // the input handles its own keys
    if (!sel) return;
    const { focus } = sel;

    if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'r')) {
      e.preventDefault();
      fillSelection(e.key === 'r' ? 'right' : 'down');
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        move(focus, -1, 0, e.shiftKey);
        break;
      case 'ArrowDown':
        e.preventDefault();
        move(focus, 1, 0, e.shiftKey);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        move(focus, 0, -1, e.shiftKey);
        break;
      case 'ArrowRight':
        e.preventDefault();
        move(focus, 0, 1, e.shiftKey);
        break;
      case 'Enter':
        e.preventDefault();
        move(focus, 1, 0, false);
        break;
      case 'Tab':
        e.preventDefault();
        move(focus, 0, e.shiftKey ? -1 : 1, false);
        break;
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        commit(focus, '');
        break;
      default:
        if (e.key.length === 1 && /[0-9.]/.test(e.key)) {
          e.preventDefault();
          startEdit(e.key, false); // type-over: keep the typed digit, cursor at end
        }
    }
  };

  function fillSelection(dir: 'right' | 'down') {
    if (!sel) return;
    const r0 = Math.min(sel.anchor.r, sel.focus.r);
    const r1 = Math.max(sel.anchor.r, sel.focus.r);
    const m0 = Math.min(sel.anchor.m, sel.focus.m);
    const m1 = Math.max(sel.anchor.m, sel.focus.m);
    // Source is the top-left cell of the selection.
    const srcRow = editableRows[r0];
    const srcMonth = months[m0];
    if (!srcRow || !srcMonth) return;
    const srcVal = personProductMonthDays(idx, srcRow.personId, srcRow.productId, srcMonth.id);
    const edits: { personId: string; productId: string; monthId: string; days: number }[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let m = m0; m <= m1; m++) {
        if (dir === 'right' && r !== r0 && m1 === m0) continue;
        const row = editableRows[r];
        const month = months[m];
        if (!row || !month) continue;
        if (r === r0 && m === m0) continue;
        edits.push({ personId: row.personId, productId: row.productId, monthId: month.id, days: srcVal });
      }
    }
    if (edits.length) editMany(edits);
  }

  const onPaste = (e: React.ClipboardEvent) => {
    if (!sel || editing !== null) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    if (unit !== 'days') {
      setUnit('days');
      setNote('Switched to Days — pasted values are read as days.');
      window.setTimeout(() => setNote(null), 2200);
    }
    const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((r) => r.split('\t'));
    const { focus } = sel;
    const edits: { personId: string; productId: string; monthId: string; days: number }[] = [];
    grid.forEach((cols, dr) => {
      cols.forEach((cell, dm) => {
        const row = editableRows[focus.r + dr];
        const month = months[focus.m + dm];
        if (!row || !month) return;
        const v = cell.trim() === '' ? 0 : Number(cell);
        if (Number.isFinite(v)) edits.push({ personId: row.personId, productId: row.productId, monthId: month.id, days: v });
      });
    });
    if (edits.length) editMany(edits);
  };

  const activeCoord = sel?.focus ?? null;

  // ── Render helpers ─────────────────────────────────────────────────────────
  const colStyle = { width: dims.cell, minWidth: dims.cell };

  function summaryCellText(v: number): string {
    return v === 0 && unit === 'dollars' ? EMPTY_CELL : formatUnit(v, unit, { compact: unit === 'dollars' });
  }

  return (
    <div className="flex h-full flex-col">
      {note && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-800">
          {note}
        </div>
      )}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onPaste={onPaste}
        onMouseUp={() => (draggingRef.current = false)}
        className="grid-scroll relative flex-1 overflow-auto focus:outline-none"
        aria-label={mode === 'headroom' ? 'Headroom grid' : 'Portfolio grid'}
      >
        <table className={`border-collapse ${dims.font}`} style={{ borderSpacing: 0 }}>
          <thead>
            {/* Quarter + intake marker row */}
            <tr>
              <th
                className="sticky left-0 top-0 z-30 border-b border-r border-slate-300 bg-slate-100 px-2 text-left"
                style={{ minWidth: dims.label, width: dims.label }}
              >
                <span className="text-[10px] font-normal uppercase tracking-wider text-slate-400">
                  {mode === 'headroom' ? 'Headroom · remaining capacity' : 'Portfolio'}
                </span>
              </th>
              {quarters.map((q) => (
                <th
                  key={q.label}
                  colSpan={q.span}
                  className="sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-100 text-center text-[10px] font-medium uppercase tracking-wide text-slate-500"
                >
                  {q.label}
                </th>
              ))}
              <th className="sticky right-0 top-0 z-30 border-b border-l border-slate-300 bg-slate-100" />
            </tr>
            {/* Intake markers row */}
            <tr>
              <th
                className="sticky left-0 top-[22px] z-30 border-b border-r border-slate-300 bg-white"
                style={{ minWidth: dims.label, width: dims.label }}
              />
              {months.map((m, i) => {
                const marker = intakes.find((x) => x.monthIndex === i);
                return (
                  <th
                    key={m.id}
                    className="sticky top-[22px] z-20 border-b border-r border-slate-100 bg-white px-0.5 text-center"
                    style={colStyle}
                  >
                    {marker && (
                      <span
                        className="inline-block whitespace-nowrap rounded-sm bg-slate-800 px-1 text-[9px] font-semibold text-white"
                        title={marker.label}
                      >
                        {marker.codes.join('&')} ▾
                      </span>
                    )}
                  </th>
                );
              })}
              <th className="sticky right-0 top-[22px] z-30 border-b border-l border-slate-300 bg-white" />
            </tr>
            {/* Month header row */}
            <tr>
              <th
                className="sticky left-0 top-[44px] z-30 border-b border-r border-slate-300 bg-slate-50 px-2 text-left text-[10px] uppercase tracking-wide text-slate-500"
                style={{ minWidth: dims.label, width: dims.label }}
              >
                Person / product
              </th>
              {months.map((m) => (
                <th
                  key={m.id}
                  className="sticky top-[44px] z-20 border-b border-r border-slate-200 bg-slate-50 px-0.5 text-center"
                  style={colStyle}
                  title={`${m.label} · ${m.workingDays} working days`}
                >
                  <div className="font-semibold text-slate-600">{m.label}</div>
                  <div className="tabular text-[9px] font-normal text-slate-400">{m.workingDays}d</div>
                </th>
              ))}
              <th
                className="sticky right-0 top-[44px] z-30 border-b border-l border-slate-300 bg-slate-50 px-2 text-right text-[10px] uppercase tracking-wide text-slate-500"
                style={{ minWidth: 84 }}
              >
                Horizon
              </th>
            </tr>
          </thead>

          <tbody>
            {visiblePeople.map((person) => {
              const data = personData.get(person.id)!;
              const open = isExpanded(person.id);
              const summaryCells = mode === 'headroom' ? data.head : data.alloc;
              return (
                <PersonBlock
                  key={person.id}
                  personId={person.id}
                  personName={person.name}
                  personRole={person.role}
                  open={open}
                  mode={mode}
                  dims={dims}
                  colStyle={colStyle}
                  months={months}
                  data={data}
                  summaryCells={summaryCells}
                  idx={idx}
                  unit={unit}
                  onToggle={() => togglePerson(person.id)}
                  onSelectPerson={() => selectPerson(person.id)}
                  rowIndexOf={rowIndexOf}
                  activeCoord={activeCoord}
                  editing={editing}
                  editSelectAll={editSelectAll}
                  inRect={inRect}
                  onCellMouseDown={(r, m, shift) => {
                    focusContainer();
                    draggingRef.current = true;
                    setEditing(null);
                    setSel((prev) =>
                      shift && prev ? { anchor: prev.anchor, focus: { r, m } } : { anchor: { r, m }, focus: { r, m } },
                    );
                  }}
                  onCellMouseEnter={(r, m) => {
                    if (draggingRef.current) setSel((prev) => (prev ? { anchor: prev.anchor, focus: { r, m } } : prev));
                  }}
                  onCellDoubleClick={(days) => startEdit(days === 0 ? '' : String(days), true)}
                  onCommit={commit}
                  onCancelEdit={() => setEditing(null)}
                  onEditMove={(coord, dr, dm) => move(coord, dr, dm, false)}
                  summaryCellText={summaryCellText}
                />
              );
            })}
            {visiblePeople.length === 0 && (
              <tr>
                <td colSpan={months.length + 2} className="p-8 text-center text-sm text-slate-400">
                  No people match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Person block (summary row + rail + optional expanded lines) ───────────────

interface PersonBlockProps {
  personId: string;
  personName: string;
  personRole: string;
  open: boolean;
  mode: Mode;
  dims: { cell: number; row: number; rail: number; label: number; font: string };
  colStyle: React.CSSProperties;
  months: PlanIndex['months'];
  data: PersonData;
  summaryCells: number[];
  idx: PlanIndex;
  unit: ReturnType<typeof usePlanStore.getState>['unit'];
  onToggle: () => void;
  onSelectPerson: () => void;
  rowIndexOf: (personId: string, productId: string) => number;
  activeCoord: Coord | null;
  editing: string | null;
  editSelectAll: boolean;
  inRect: (r: number, m: number) => boolean;
  onCellMouseDown: (r: number, m: number, shift: boolean) => void;
  onCellMouseEnter: (r: number, m: number) => void;
  onCellDoubleClick: (days: number) => void;
  onCommit: (coord: Coord, raw: string) => void;
  onCancelEdit: () => void;
  onEditMove: (coord: Coord, dr: number, dm: number) => void;
  summaryCellText: (v: number) => string;
}

function PersonBlock(props: PersonBlockProps) {
  const {
    personId, personName, personRole, open, mode, dims, colStyle, months, data,
    summaryCells, idx, unit, onToggle, onSelectPerson, rowIndexOf, activeCoord,
    editing, editSelectAll, inRect, onCellMouseDown, onCellMouseEnter, onCellDoubleClick,
    onCommit, onCancelEdit, onEditMove, summaryCellText,
  } = props;

  const tol = idx.settings.toleranceCeiling;
  const summary = summaryValue(data.summary, unit);

  return (
    <>
      {/* Summary row */}
      <tr className="hover:bg-slate-50/60" style={{ height: dims.row }}>
        <th
          className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-1 text-left font-normal"
          style={{ minWidth: dims.label, width: dims.label }}
          scope="row"
        >
          <div className="flex items-center gap-1">
            <button
              onClick={onToggle}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              aria-label={open ? `Collapse ${personName}` : `Expand ${personName}`}
              aria-expanded={open}
            >
              <span className="text-[9px]">{open ? '▾' : '▸'}</span>
            </button>
            <button
              onClick={onSelectPerson}
              className="min-w-0 flex-1 truncate text-left hover:underline focus:outline-none"
              title={`${personName} — ${personRole}`}
            >
              <span className="font-medium text-slate-800">{personName}</span>
            </button>
          </div>
        </th>
        {months.map((m, i) => {
          const alloc = data.alloc[i]!;
          const cap = data.cap[i]!;
          const band = utilBand(cap === 0 ? 0 : alloc / cap, alloc, tol);
          const style = BAND_STYLE[band];
          const raw = summaryCells[i]!;
          const display =
            mode === 'headroom'
              ? formatSigned(cellValue(idx, unit, personId, m.id, raw), unit)
              : raw === 0
                ? EMPTY_CELL
                : formatUnit(cellValue(idx, unit, personId, m.id, raw), unit, { compact: unit === 'dollars' });
          return (
            <td
              key={m.id}
              className="tabular border-b border-r border-slate-100 text-center"
              style={{ ...colStyle, background: style.bg, color: style.fg }}
              title={`${personName} · ${m.label}\nallocated ${formatDays(alloc)} / capacity ${formatDays(cap)} · headroom ${formatDays(cap - alloc)}`}
            >
              {display}
            </td>
          );
        })}
        <td
          className="tabular sticky right-0 z-10 border-b border-l border-slate-200 bg-white px-2 text-right font-semibold text-slate-700"
          style={{ minWidth: 84 }}
        >
          {summaryCellText(summary)}
        </td>
      </tr>

      {/* Headroom rail */}
      <tr aria-hidden>
        <th
          className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-1 text-right"
          style={{ minWidth: dims.label, width: dims.label }}
        >
          <span className="text-[9px] uppercase tracking-wider text-slate-300">headroom</span>
        </th>
        <HeadroomRail
          cells={data.head.map((h, i) => ({ headroom: h, capacity: data.cap[i]! }))}
          toleranceCeiling={tol}
          height={dims.rail}
        />
        <td className="sticky right-0 z-10 border-b border-l border-slate-200 bg-white" />
      </tr>

      {/* Expanded product lines + TOTAL + CAPACITY */}
      {open &&
        data.lines.map((line) => {
          const r = rowIndexOf(personId, line.productId);
          const meta = PRODUCT_META[line.productId as ProductCode];
          const focus = idx.plan.focusByLine[`${personId}::${line.productId}`];
          return (
            <tr key={line.productId} style={{ height: dims.row }} className="bg-white">
              <th
                className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-1 pl-6 text-left font-normal"
                style={{ minWidth: dims.label, width: dims.label }}
                scope="row"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: meta.colour }}
                    aria-hidden
                  />
                  <span className="truncate text-slate-600" title={focus || meta.name}>
                    <span className="font-medium text-slate-700">{meta.code}</span>
                    <span className="ml-1 text-slate-400">{meta.name}</span>
                  </span>
                </div>
              </th>
              {months.map((m, i) => {
                const days = line.days[i]!;
                const isActive = activeCoord?.r === r && activeCoord?.m === i;
                const selected = inRect(r, i);
                if (isActive && editing !== null) {
                  return (
                    <EditCell
                      key={m.id}
                      initial={editing}
                      selectAll={editSelectAll}
                      colStyle={colStyle}
                      onCommit={(raw) => onCommit({ r, m: i }, raw)}
                      onCancel={onCancelEdit}
                      onCommitMove={(raw, dr, dm) => {
                        onCommit({ r, m: i }, raw);
                        onEditMove({ r, m: i }, dr, dm);
                      }}
                    />
                  );
                }
                return (
                  <td
                    key={m.id}
                    className={`tabular border-b border-r border-slate-100 text-center ${
                      selected ? 'bg-sky-100' : ''
                    } ${isActive ? 'outline outline-2 -outline-offset-2 outline-slate-800' : ''}`}
                    style={colStyle}
                    onMouseDown={(e) => onCellMouseDown(r, i, e.shiftKey)}
                    onMouseEnter={() => onCellMouseEnter(r, i)}
                    onDoubleClick={() => onCellDoubleClick(days)}
                  >
                    <span className={days === 0 ? 'text-slate-300' : 'text-slate-700'}>
                      {days === 0
                        ? EMPTY_CELL
                        : formatUnit(cellValue(idx, unit, personId, m.id, days), unit, {
                            compact: unit === 'dollars',
                          })}
                    </span>
                  </td>
                );
              })}
              <td
                className="tabular sticky right-0 z-10 border-b border-l border-slate-200 bg-white px-2 text-right text-slate-500"
                style={{ minWidth: 84 }}
              >
                {summaryCellText(
                  summaryValue(
                    { days: line.total, cost: line.total * (idx.ratePerDay.get(personId) ?? 0), workingDays: data.summary.workingDays, avgFte: line.total / data.summary.workingDays },
                    unit,
                  ),
                )}
              </td>
            </tr>
          );
        })}
      {open && <TotalRows personId={personId} data={data} dims={dims} colStyle={colStyle} months={months} idx={idx} unit={unit} summaryCellText={summaryCellText} />}
    </>
  );
}

function TotalRows({
  personId, data, dims, colStyle, months, idx, unit, summaryCellText,
}: {
  personId: string;
  data: PersonData;
  dims: PersonBlockProps['dims'];
  colStyle: React.CSSProperties;
  months: PlanIndex['months'];
  idx: PlanIndex;
  unit: PersonBlockProps['unit'];
  summaryCellText: (v: number) => string;
}) {
  const tol = idx.settings.toleranceCeiling;
  return (
    <>
      <tr className="bg-slate-50" style={{ height: dims.row }}>
        <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-1 pl-6 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500" style={{ minWidth: dims.label, width: dims.label }}>
          Total
        </th>
        {months.map((m, i) => {
          const alloc = data.alloc[i]!;
          const cap = data.cap[i]!;
          const band = utilBand(cap === 0 ? 0 : alloc / cap, alloc, tol);
          const style = BAND_STYLE[band];
          return (
            <td key={m.id} className="tabular border-b border-r border-slate-100 text-center font-semibold" style={{ ...colStyle, background: style.bg, color: style.fg }}>
              {alloc === 0 ? EMPTY_CELL : formatUnit(cellValue(idx, unit, personId, m.id, alloc), unit, { compact: unit === 'dollars' })}
            </td>
          );
        })}
        <td className="tabular sticky right-0 z-10 border-b border-l border-slate-200 bg-slate-50 px-2 text-right font-semibold text-slate-700" style={{ minWidth: 84 }}>
          {summaryCellText(summaryValue(data.summary, unit))}
        </td>
      </tr>
      <tr className="bg-white" style={{ height: dims.row }}>
        <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-1 pl-6 text-left text-[10px] uppercase tracking-wide text-slate-400" style={{ minWidth: dims.label, width: dims.label }}>
          Capacity
        </th>
        {months.map((m, i) => (
          <td key={m.id} className="tabular border-b border-r border-slate-100 text-center text-slate-400" style={colStyle}>
            {formatUnit(cellValue(idx, unit, personId, m.id, data.cap[i]!), unit, { compact: unit === 'dollars' })}
          </td>
        ))}
        <td className="sticky right-0 z-10 border-b border-l border-slate-200 bg-white" style={{ minWidth: 84 }} />
      </tr>
    </>
  );
}

// ── The editing input for an active cell ──────────────────────────────────────

function EditCell({
  initial,
  selectAll,
  colStyle,
  onCommit,
  onCancel,
  onCommitMove,
}: {
  initial: string;
  selectAll: boolean;
  colStyle: React.CSSProperties;
  onCommit: (raw: string) => void;
  onCancel: () => void;
  onCommitMove: (raw: string, dr: number, dm: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <td className="border-b border-r border-slate-100 p-0" style={colStyle}>
      <input
        autoFocus
        value={value}
        inputMode="decimal"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => {
          // Edit-existing selects all; type-over keeps the typed digit at the caret end.
          if (selectAll) e.target.select();
          else e.target.setSelectionRange(e.target.value.length, e.target.value.length);
        }}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommitMove(value, 1, 0);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            onCommitMove(value, 0, e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="tabular h-full w-full border-0 bg-sky-50 px-0.5 text-center text-slate-900 outline outline-2 -outline-offset-2 outline-slate-800 focus:outline-slate-800"
      />
    </td>
  );
}
