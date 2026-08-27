import { useMemo, useRef, useState } from 'react';
import { usePlanStore } from '../store/planStore';
import {
  byProduct,
  costByProduct,
  personProductMonthDays,
  productMonthDays,
  assignmentCost,
} from '../engine';
import { productCellValue, summaryValue } from './convert';
import { EMPTY_CELL, formatDays, formatUnit } from './format';
import { PRODUCT_META } from '../model/products';
import type { ProductCode } from '../model/types';
import { Button } from './components/Button';
import { Modal } from './components/Modal';
import { copyToClipboard, downloadText, toCsv, toTsv } from '../export/csv';

export function ProductView() {
  const idx = usePlanStore((s) => s.idx)!;
  const unit = usePlanStore((s) => s.unit);
  const showAdmin = usePlanStore((s) => s.showAdmin);
  const showPortfolio = usePlanStore((s) => s.showPortfolio);
  const setShowAdmin = usePlanStore((s) => s.setShowAdmin);
  const setShowPortfolio = usePlanStore((s) => s.setShowPortfolio);
  const tableRef = useRef<HTMLTableElement>(null);
  const [breakdown, setBreakdown] = useState<{ productId: string; monthId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const months = idx.months;

  const productIds = useMemo(() => {
    return idx.products
      .filter((p) => p.isProduct || (p.code === 'PF' && showPortfolio) || (p.code === 'XX' && showAdmin))
      .sort((a, b) => a.order - b.order)
      .map((p) => p.id);
  }, [idx, showAdmin, showPortfolio]);

  const demand = useMemo(() => byProduct(idx, productIds, months), [idx, productIds, months]);
  const cost = useMemo(() => costByProduct(idx, productIds, months), [idx, productIds, months]);

  function cellDisplay(rowIdx: number, mi: number): string {
    const days = demand.rows[rowIdx]!.daysByMonth[mi]!;
    const c = cost.rows[rowIdx]!.costByMonth[mi]!;
    const v = productCellValue(idx, unit, months[mi]!.id, days, c);
    return v === 0 ? EMPTY_CELL : formatUnit(v, unit, { compact: unit === 'dollars' });
  }

  function totalDisplay(mi: number): string {
    const days = demand.totalDaysByMonth[mi]!;
    const c = cost.totalCostByMonth[mi]!;
    return formatUnit(productCellValue(idx, unit, months[mi]!.id, days, c), unit, {
      compact: unit === 'dollars',
    });
  }

  function rowTotalDisplay(rowIdx: number): string {
    const days = demand.rows[rowIdx]!.totalDays;
    const c = cost.rows[rowIdx]!.totalCost;
    const wd = months.reduce((s, m) => s + m.workingDays, 0);
    return formatUnit(summaryValue({ days, cost: c, workingDays: wd, avgFte: days / wd }, unit), unit, {
      compact: unit === 'dollars',
    });
  }

  function buildMatrix(): (string | number)[][] {
    const header = ['Product', ...months.map((m) => m.label), 'Total'];
    const body = productIds.map((pid, ri) => {
      const meta = PRODUCT_META[pid as ProductCode];
      return [
        `${meta.name} (${meta.code})`,
        ...months.map((_, mi) => cellDisplay(ri, mi).replace(EMPTY_CELL, '0')),
        rowTotalDisplay(ri),
      ];
    });
    const total = ['TOTAL', ...months.map((_, mi) => totalDisplay(mi)), ''];
    return [header, ...body, total];
  }

  async function onCopy() {
    const ok = await copyToClipboard(toTsv(buildMatrix()));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function onCsv() {
    downloadText(`product-demand-${unit}.csv`, toCsv(buildMatrix()));
  }

  async function onPng() {
    if (!tableRef.current) return;
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(tableRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `product-demand-${unit}.png`;
    a.click();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-600">Demand by product</span>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={showPortfolio} onChange={(e) => setShowPortfolio(e.target.checked)} />
          Portfolio (PF)
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={showAdmin} onChange={(e) => setShowAdmin(e.target.checked)} />
          Admin (XX)
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={onCopy}>{copied ? 'Copied ✓' : 'Copy'}</Button>
          <Button onClick={onCsv}>CSV</Button>
          <Button onClick={onPng}>PNG</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <table ref={tableRef} className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-slate-300 bg-slate-100 px-2 py-1 text-left text-[10px] uppercase tracking-wide text-slate-500">
                Product
              </th>
              {months.map((m) => (
                <th
                  key={m.id}
                  className="border-b border-r border-slate-200 bg-slate-100 px-1 py-1 text-center text-[10px] font-semibold text-slate-600"
                  style={{ minWidth: 46 }}
                >
                  {m.label}
                </th>
              ))}
              <th className="border-b border-l border-slate-300 bg-slate-100 px-2 py-1 text-right text-[10px] uppercase text-slate-500">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {productIds.map((pid, ri) => {
              const meta = PRODUCT_META[pid as ProductCode];
              return (
                <tr key={pid} className="hover:bg-slate-50">
                  <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-2 py-1 text-left font-normal">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: meta.colour }} />
                      <span className="font-medium text-slate-700">{meta.code}</span>
                      <span className="truncate text-slate-400">{meta.name}</span>
                    </span>
                  </th>
                  {months.map((m, mi) => (
                    <td
                      key={m.id}
                      className="tabular cursor-pointer border-b border-r border-slate-100 px-1 py-1 text-center text-slate-700 hover:bg-sky-50"
                      onClick={() => setBreakdown({ productId: pid, monthId: m.id })}
                      title="Click for the people behind this number"
                    >
                      {cellDisplay(ri, mi)}
                    </td>
                  ))}
                  <td className="tabular border-b border-l border-slate-200 bg-white px-2 py-1 text-right font-semibold text-slate-700">
                    {rowTotalDisplay(ri)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-100 font-semibold">
              <th className="sticky left-0 z-10 border-b border-r border-slate-300 bg-slate-100 px-2 py-1 text-left text-[10px] uppercase tracking-wide text-slate-600">
                Portfolio total
              </th>
              {months.map((m, mi) => (
                <td key={m.id} className="tabular border-b border-r border-slate-200 px-1 py-1 text-center text-slate-800">
                  {totalDisplay(mi)}
                </td>
              ))}
              <td className="border-b border-l border-slate-300 bg-slate-100" />
            </tr>
          </tbody>
        </table>
      </div>

      {breakdown && (
        <BreakdownModal
          productId={breakdown.productId}
          monthId={breakdown.monthId}
          onClose={() => setBreakdown(null)}
        />
      )}
    </div>
  );
}

function BreakdownModal({
  productId,
  monthId,
  onClose,
}: {
  productId: string;
  monthId: string;
  onClose: () => void;
}) {
  const idx = usePlanStore((s) => s.idx)!;
  const meta = PRODUCT_META[productId as ProductCode];
  const month = idx.monthById.get(monthId)!;
  const contributors = idx.people
    .map((p) => ({ person: p, days: personProductMonthDays(idx, p.id, productId, monthId) }))
    .filter((x) => x.days > 0)
    .sort((a, b) => b.days - a.days);
  const totalDays = productMonthDays(idx, productId, monthId);

  return (
    <Modal title={`${meta.code} · ${month.label}`} subtitle={`${meta.name} — who makes up this number`} onClose={onClose}>
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 font-medium">Person</th>
            <th className="py-1 text-right font-medium">Days</th>
            <th className="py-1 text-right font-medium tabular">Cost</th>
          </tr>
        </thead>
        <tbody>
          {contributors.map(({ person, days }) => (
            <tr key={person.id} className="border-t border-slate-100">
              <td className="py-1 text-slate-700">{person.name}</td>
              <td className="tabular py-1 text-right text-slate-700">{formatDays(days)}</td>
              <td className="tabular py-1 text-right text-slate-500">
                {formatUnit(assignmentCost(idx, person.id, days), 'dollars', { compact: true })}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="py-1 text-slate-800">Total</td>
            <td className="tabular py-1 text-right text-slate-800">{formatDays(totalDays)}</td>
            <td className="py-1" />
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
