// Placeholder shell. The dashboard screens (§3–§8) are not built yet — this
// milestone is the calculation engine + types + tests only. The UI lands next.

export default function App() {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-4 p-8">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
        Applied Programs · UNSW College
      </p>
      <h1 className="text-2xl font-semibold text-slate-900">H2 Resourcing Dashboard</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        Calculation engine ready. This is the source-of-truth planning instrument that replaces the
        traffic-sheet workbook — <span className="tabular">capacity − allocated = headroom</span>,
        expressed in days, FTE, or dollars.
      </p>
      <p className="text-sm text-slate-500">
        The interface (portfolio grid, headroom rails, pinch panel, product view, export) is built
        on top of the verified engine next.
      </p>
    </main>
  );
}
