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

Built incrementally against the brief's build order (§9):

- [x] **1. Engine + types + tests** — data model, derived calculations, unit
      conversion, aggregation at every level, tolerance bands, pinch detection,
      and a one-time Excel importer. Migration fidelity is proven by a golden
      test that reproduces the seed workbook's `By Product` and
      `Cost by Product` sheets cell-for-cell.
- [ ] 2. Excel import UI · 3. Portfolio grid · 4. Unit toggle · 5. Editing ·
      6. Headroom view + rails + pinch panel · 7. Product view + person panel ·
      8. Export

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
