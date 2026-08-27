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

## Run it

```bash
npm install
npm run dev        # day-to-day use
npm run build      # production bundle (static, hash-routed)
npm run preview    # verify the production build (served under /verbose-guacamole/)
npm test           # engine + privacy + export tests
npm run typecheck
```

## Public deployment & privacy

This site **is** published to GitHub Pages — and it is safe to be public because
**no real data ever reaches the repository or the server**:

- **Names → initials at import.** When you import a workbook, the import dialog
  reduces every person to initials (e.g. `Jamie Rivera → JR`), applied *before*
  anything touches IndexedDB or the UI. Only initials are stored, exported, or
  shown; full names live in the open browser tab and are discarded on import.
  This is enforced by `src/import/anonymise.ts` and tested (including a
  "no full name leaks anywhere" guarantee).
- **Real numbers stay local.** Salary-derived figures live only in the visitor's
  own browser (IndexedDB) and in `.json` files they save themselves. Nothing is
  sent to a server; there is no backend.
- **Nothing sensitive in git.** `*.xlsx`, `*.plan.json`, `/data/`, and `.env*`
  are gitignored. The seed workbook is never committed.
- **Fictional demo.** The site ships empty; an "Explore the demo" button loads a
  wholly invented dataset (`src/demo/demoPlan.ts`) so the public URL isn't blank.
- **One-click wipe.** A prominent **Clear data** control erases everything this
  browser holds — for use on a shared or public machine.

### Enabling Pages (one-time)

In the GitHub repo: **Settings → Pages → Build and deployment → Source:
"GitHub Actions"**. Then every push to `main` runs
`.github/workflows/deploy.yml` (typecheck + tests + build) and publishes to
`https://<owner>.github.io/verbose-guacamole/`. The Vite `base` is
`/verbose-guacamole/`; the app uses hash routing so a refresh never 404s, and a
`404.html` fallback is emitted for safety.

## Seed data & durability

- **Import once.** A workbook seeds the app once at setup (names → initials).
  After that **the app is the source of truth** and Excel is an export format.
- The plan autosaves to IndexedDB, keeps a rolling set of the last ~20 local
  snapshots, and **Save/Open to a `.json` file** gives real version history in a
  repo or synced folder.

## Architecture

- **`src/model`** — the six stored entities and product metadata.
- **`src/engine`** — pure derived calculations (`calc`, `units`, `aggregate`,
  `pinch`). This is the product; it is unit-tested exhaustively.
- **`src/import`** — the one-time SheetJS workbook parser and the name→initials
  anonymiser applied at import.
- **`src/demo`** — the fictional demo dataset served on the public URL.

Stack: Vite + React + TypeScript + Tailwind, Zustand for state, `idb` for the
working store, SheetJS for Excel, Vitest for the engine tests.
