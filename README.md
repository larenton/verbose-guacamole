# Applied Programs — H2 Resourcing Dashboard

A small, fast, **local-first** planning instrument for the Applied Programs H2
resourcing plan. It replaces the traffic-sheet workbook and answers the two
questions asked in Working Groups and SteerCo:

1. **"If we bring this forward, who breaks?"**
2. **"Do we have the capacity to take this on, and what does it cost?"**

Every figure is the same number expressed three ways, and headroom is a
first-class figure:

```
capacity − allocated = headroom
```

expressed in **Days** (the planning currency), **FTE** (`days ÷ working_days`),
or **$** (`days × annualCost ÷ 220`).

## Status

Built incrementally against the brief's build order (§9). Steps 1–8 are
complete; scenario mode (§9.9) is intentionally not started.

- [x] **1. Engine + types + tests** — data model, derived calculations, unit
      conversion, aggregation at every level, tolerance bands, pinch detection,
      and a one-time Excel importer. Migration fidelity is proven by a golden
      test reproducing the seed workbook's `By Product` and `Cost by Product`
      cell-for-cell.
- [x] **2. Excel import** — dialog with a parse preview + skipped/warnings
      report, behind a destructive "Replace all data" confirm.
- [x] **3. Portfolio grid** — the traffic sheet alive: collapsible people,
      30 months, sticky person column + month/quarter/intake headers,
      utilisation tinting, product-colour chips, right-hand horizon summary.
- [x] **4. Unit toggle** — global Days / FTE / $ across every figure.
- [x] **5. Editing** — spreadsheet keyboard model (type-over, Enter/Tab/Esc,
      arrows, range select, drag-fill, paste from Excel), 60-deep undo/redo,
      autosave to IndexedDB with a Saved / error state.
- [x] **6. Headroom view + rails + pinch panel** — remaining-capacity grid with
      a "≥ N days free between X and Y" filter; the signature headroom rail
      under every row; a persistent pinch panel splitting tolerance vs breach
      with per-pinch rationale and CSV export.
- [x] **7. Product view + person panel** — products × months with a portfolio
      total, per-cell people breakdown, and copy / CSV / PNG; a person side
      panel with editable rate & FTE, totals, worst month, and a headroom
      sparkline.
- [x] **8. Export** — full workbook with `By Product` / `Cost by Product` as
      live formulas (SUMIF / SUMPRODUCT over the Team Schedule) plus cached
      values, blue/green/black + fill conventions, no external links. Verified
      by a round-trip test that matches the source cell-for-cell.
- [ ] 9. Scenario mode — not started (the agreed stopping point).

## Verification

- **31 engine/export tests** pass (`npm test`): 20 pure engine, 6 golden
  migration-fidelity, 5 export round-trip. The golden and export suites need
  the seed workbook and self-skip in CI where it is absent.
- Every §10 acceptance criterion has been checked in a real browser against the
  production build (import fidelity, live single-cell recompute, unit toggle,
  the headroom question, the LD2 tolerance pinch, Excel export, save/reload
  persistence, and `npm run preview`).

## Local use

This app is **not deployed** and must not be. The plan contains named staff and
salary-derived daily rates; a GitHub Pages site built from a private repo is
still public. Run it locally only.

```bash
npm install
npm run dev        # day-to-day use
npm run build      # production bundle (fully static, hash-routed)
npm run preview    # verify the production build
npm test           # engine tests
npm run typecheck
```

The build is a fully static bundle with a relative base path, so it runs from
`localhost`, a `file://` path, or any authenticated static host without a
rebuild.

## Seed data & durability

- **Import once.** The workbook `H2_Team_Schedule_Resourcing_v3.xlsx` seeds the
  app once at setup. After that **the app is the source of truth** and Excel is
  an export format only.
- The workbook and any exported plan JSON are **gitignored** — they contain
  salary data.
- The plan autosaves to IndexedDB; **Save/Open to a `.json` file** gives real
  version history in a repo or synced folder.

## Architecture

- **`src/model`** — the six stored entities and product metadata.
- **`src/engine`** — pure derived calculations (`calc`, `units`, `aggregate`,
  `pinch`). This is the product; it is unit-tested exhaustively.
- **`src/import`** — the one-time SheetJS workbook parser.

Stack: Vite + React + TypeScript + Tailwind, Zustand for state, `idb` for the
working store, SheetJS for Excel, Vitest for the engine tests.
