# Larder — Project Context for Claude Code

Household grocery intelligence dashboard. Currently mid-migration from a single-file React HTML prototype to a modular Vite project. **The old HTML file is still the source of truth until the new entry point is viable** — we extract from it incrementally.

---

## Stack

- **Build:** Vite (no Tailwind compiler — base utility classes only, see "Constraints" below)
- **UI:** React 18, no router yet
- **Data:** Supabase (PostgREST) — credentials in `CREDENTIALS.md` (gitignored)
- **Deploy:** Static PWA — `index.html` at the git root (parent of this directory) is the live single-file build until the Vite migration is shipped

---

## File map

```
grocery-app/                ← git root
├── index.html              ← canonical / live PWA (~414KB). Source of truth until Vite ships.
├── manifest.json           ← PWA manifest
├── service-worker.js       ← PWA service worker
├── icons/                  ← PWA icons
├── README.md
└── larder/                 ← Vite migration target
    ├── CREDENTIALS.md      ← Supabase keys. Gitignored. Don't commit.
    ├── KNOWN_ISSUES.md     ← pre-existing bugs documented, not regressions
    ├── CLAUDE.md           ← this file
    ├── index.html          ← Vite entry + canonical <style> block L30–97 inlined for CSS parity
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx                ← app shell: Provider wrap + boot fetch + ?tab=audit toggle + pantry sync slice
        ├── lib/
        │   ├── supabase.js        ← sbFetch / sbWrite + mapReceiptRow / mapPantryRow / mapRecipeRow / mapCookedRow / patchPantryRow / patchRecipeRow
        │   ├── text.js            ← string normalisation
        │   ├── allergens.js       ← Khalil/Max/Emily filter logic
        │   ├── pantry-math.js     ← pure pantry/confidence calculations
        │   ├── household-rules.js ← never_restock patterns
        │   └── recipes.js         ← module-level RECIPES + getRecipes / setRecipes (refactor target — see 7h)
        ├── contexts/
        │   ├── ReceiptsContext.jsx  ← receipts data + load state (consumed by AuditView)
        │   └── AllergensContext.jsx ← allergens config + load state (consumed by AuditView)
        └── components/
            ├── primitives.jsx     ← InfoTip / SortHeader / Chip / Bar / Stat / Section
            ├── PantryView.jsx     ← Pantry tab, verbatim port of canonical L1388–1617
            └── AuditView.jsx      ← Stats tab, verbatim port of canonical L4485–4809 (incl. co-located GapCard)
```

---

## Migration principles

1. **Incremental extraction, not parallel build.** Pull symbols out of the canonical `index.html` (at the git root) one at a time into `src/`. Old file stays the canonical truth.
2. **`npm run build` must stay green after every step.**
3. **Smoke-test at `localhost:5173`** against live Supabase before committing.
4. **No behaviour change without explicit scope.** A pure file-move shouldn't alter rendered output.
5. **Don't pre-extract.** Wait until a symbol is consumed by the Vite scaffold before moving it. Avoid orphan files.

---

## Constraints

- **No Tailwind compiler in the Vite scaffold.** Classes are pre-defined base utilities only. Match the patterns already in `App.jsx` / `primitives.jsx`.
- **`sbWrite` helper pattern** (see `src/lib/supabase.js`) for all mutations. Don't write raw fetch calls.
- **PostgREST embed shape** (`?select=*,joined:other_table(*)`) preferred over multiple round-trips.
- **Receipts ordered `delivery_date.asc`** — downstream code expects oldest-first.
- **Audience tagging** for any meal/recipe surface: `whole-household` | `adults-only` | `check`. See household rules below.

---

## Household allergen rules (Khalil-strict)

Khalil (age 2) cannot eat:
- Eggs, all dairy, wheat, lentils, peas, chickpeas, avocado, beef
- All beans, all tree nuts
- **Peanuts are safe.**

Soy sauce = wheat-containing → flag as `check`. Tamari = safe.
Oat milk = possible gluten → flag as `uncertain`.
No one drinks dairy milk — oat/soya are household defaults.

Canonical allergen config: `household_allergens` table in Supabase, surfaced through `AllergensContext` in the live HTML and (post-7e) `src/contexts/AllergensContext.jsx` in the Vite scaffold. `src/lib/allergens.js` mirrors the resolution logic.

---

## Known issues (don't "fix" by accident)

See `KNOWN_ISSUES.md`. The almond-milk → tree-nut classification gap is intentional / documented, not a regression.

---

## Current state

**Last verified:** 2026-05-17
**Last commit:** `424c2cf` — Step 7e (AuditView + AllergensContext + recipes module state + `?tab=audit` toggle).
**App shell:** `src/App.jsx` is the real app shell — wraps the tree in `<ReceiptsProvider>` + `<AllergensProvider>`, runs the pantry/recipes/cooked boot fetch, owns the pantry sync slice, exposes `updateRecipePage`, and switches between PantryView and AuditView via the `?tab=audit` query param.
**Smoke test:** ✅ localhost:5173 renders both Pantry (default) and Stats (`?tab=audit`) tabs against live Supabase; all parity counters match canonical PWA side-by-side; recipe page-number write path server-confirmed via MCP (integer 42 round-trip + reset).

### Completed
- Vite scaffold (package.json, vite.config.js, index.html, main.jsx, App.jsx)
- RAW JSON blob pruned in canonical `index.html` (646KB → 414KB)
- `src/lib/supabase.js` (~360 lines, sbWrite helper + mapReceiptRow + mapPantryRow + mapRecipeRow + mapCookedRow + patchPantryRow + patchRecipeRow)
- `src/lib/text.js` (~70 lines)
- `src/lib/allergens.js` (~165 lines)
- `src/lib/pantry-math.js` (~135 lines)
- `src/lib/household-rules.js` (34 lines, never_restock patterns from RAW blob — step 7b)
- `src/lib/recipes.js` (~45 lines, module-level RECIPES + getRecipes / setRecipes — step 7e; refactor target 7h)
- `src/contexts/ReceiptsContext.jsx` (~57 lines, ReceiptsProvider + useReceipts hook — step 7c, consumed by AuditView from 7e)
- `src/contexts/AllergensContext.jsx` (~75 lines, AllergensProvider + useAllergens hook, EMPTY_ALLERGENS fallback — step 7e)
- `src/components/primitives.jsx` (~135 lines, InfoTip / SortHeader / Chip / Bar / Stat — step 7a/7d; Section appended in 7e)
- `src/components/PantryView.jsx` (~232 lines, verbatim port of canonical L1388–1617 — step 7d)
- `src/components/AuditView.jsx` (~330 lines, verbatim port of canonical L4485–4809 incl. co-located GapCard — step 7e)
- `src/App.jsx` rewritten with Provider wrap, parallel boot fetch, `updateRecipePage` callback, `?tab=audit` toggle (step 7e)
- Canonical `<style>` block inlined into `larder/index.html` for CSS parity (step 7d)
- `KNOWN_ISSUES.md`
- `npm run build` green (41 modules)

#### 7d — App-scope pantry sync slice ported (Completed 2026-05-17)

Verbatim port of pantry sync state and effects from canonical `index.html` L5420–5544, L5665–5681, L5685–5784, L5832–5878, L5898–5943 into `src/App.jsx`. Includes: pantry state + boot fetch/seeding, `pantryRef` + sync effect, `findRowByItem`, `setItemSyncError`, `toggleOutOfStock`, `toggleInFreezer`, `adjustQty` with 150ms debounce, `pagehide` flush. Also: `mapPantryRow` added to `src/lib/supabase.js`; canonical `<style>` block L30–97 pasted into `larder/index.html` for CSS parity; `src/components/PantryView.jsx` ported verbatim from L1388–1617.

Smoke tests:
- **(a) `out_of_stock` toggle: PASSED.** PATCH 200, server reflected. Initial "silent failure" traced to stale page state pre-hard-refresh.
- **(b) `in_freezer` toggle (freeze + unfreeze): PASSED.** Optimistic local update (`_in_freezer`, `_frozen_at`) confirmed visible in React DevTools before PATCH completes; both directions server-confirmed via MCP.
- **(c) `qty_adjustment` debounce: DEFERRED.** Server writes confirmed working (PATCH body shape correct, `qty_adjustment` column updates). Debounce coalescing timing not verified — clicks landed outside the 150ms window so produced N PATCHes for N clicks. Not a regression: functionality works, optimisation unconfirmed. See step 7d-followup.

Known minor: localStorage first-paint seed deliberately omitted (v14.5 deprecated; UX nit only, inline TODO in `src/App.jsx`).

#### 7e — first ReceiptsContext consumer (Completed 2026-05-17)

Ported `AuditView` (the canonical Stats tab) as the first real consumer of `ReceiptsContext` and the first consumer of the new `AllergensContext`. Verbatim port of canonical L4485–4809 into `src/components/AuditView.jsx`, with one structural deviation: the `RECIPES` module global is read via `getRecipes()` from the new `src/lib/recipes.js` rather than the bare `RECIPES` identifier. `useContext(AllergensContext)` / `useContext(ReceiptsContext)` are replaced with the extracted hooks `useAllergens()` / `useReceipts()`; both hooks return `{ allergens|receipts, loading, error }`, mirroring the 7c pattern.

New plumbing:
- `src/lib/recipes.js` — verbatim `let RECIPES = []` + `setRecipes` + `getRecipes` (canonical L1160–1161). Refactor target — see 7h.
- `src/lib/supabase.js` — `mapRecipeRow` (canonical L932 + `deriveSourceFile` L914) and `mapCookedRow` (canonical L897) added next to `mapPantryRow`.
- `src/contexts/AllergensContext.jsx` — `AllergensProvider` + `useAllergens()`. Fallback path matches canonical L5503–5508 exactly: fetch success + 0 rows OR fetch failure → console.warn + keep `EMPTY_ALLERGENS` (no crash, no hard error). Validated in implementation review.
- `src/components/primitives.jsx` — `Section` (canonical L1362) appended; uses `InfoTip` internally (already exported).
- `src/App.jsx` — rewrap into `<ReceiptsProvider>` + `<AllergensProvider>` (smoke import retired), expand boot fetch to `Promise.all([fetchPantry, fetchRecipes, fetchCookedLog])`, add `updateRecipePage` callback (verbatim canonical L5793: optimistic local `setRecipes` → `setRecipesVersion(v+1)` → background `patchRecipeRow` → on error, rollback `setRecipes` + bump again), add minimal `?tab=audit` URL toggle (one-way URL → view, no UI surface yet — TODO(7f) inline).

Smoke tests:
- **(d) `updateRecipePage` write test: PASSED.** Typed `42` into Akuri's missing-page input in Vite's Audit tab; `PATCH /recipes?id=eq.dishoom-akuri` body `{"source_page":42}` returned 200. MCP confirmed integer `42` persisted in `source_page` (`pg_typeof = integer`), `updated_at` fresh. Reset to null confirmed via MCP.
- **(a) Parity counters (top strip): PASSED.** `178 recipes · 86 pantry items · N expiring · 0 cooked · 13 orders` matched canonical PWA side-by-side. Last-receipt date matched.
- **(b) Workflow integrity Section: PASSED.** 6 GapCards rendered with matching severity chips.
- **(e) Pantry composition & health Section: PASSED.** `In-stock items = 80` matched canonical; byCategory rollups identical.
- **(f) Audience breakdown Section: PASSED.** Whole-household / Needs check / Adults only counts matched canonical; by-source-file rows identical.
- **(c) Recipe page-number coverage drilldown UI: PASSED.** KPI strip, by-book ordering, expand/collapse, recipe-name list, and input placeholders all matched canonical.

### Next

#### 7d-followup — verify `qty_adjustment` debounce coalescing

Confirm that rapid clicks on the qty +/− buttons within a 150ms window produce a single coalesced PATCH (not one-per-click). Test approach: pin App in React DevTools, watch hooks 15 (`qtyDebounceTimers`) and 16 (`pendingQtyValues`); fire 5+ clicks programmatically via `$r` or a console snippet to guarantee sub-150ms cadence; expect one PATCH with cumulative value. Server-write correctness already proven in 7d. Pure optimisation verification.

#### 7f — replace `?tab=audit` query param with real tab chrome

7e mounts AuditView via a one-way URL → view binding (`?tab=audit`) with zero UI surface for navigation. Replace with the canonical tab chrome: extract `LarderBrand` (canonical L4824–4960), the tabs array (L5555–5562), and `TabIcon` (L4990–5347); wire active-tab state with a click-to-switch tab strip styled to match the canonical PWA. Remove the inline `TODO(7f)` comment at the top of `src/App.jsx` when this lands.

#### 7g — second view port (open: SuggestedBasket, OrdersView, PlannerView, RecipesView)

Pick the next view that doesn't require yet-deferred infrastructure (TescoSkusContext, ReceiptsRefreshContext). Likely candidates ordered by scope:
- **PlannerView** (canonical L2273–2340, ~68 lines): smallest body but needs `RECIPES` (have it) + `pantryMatchSet` / `makeability` / `flagsForRecipe` / `audienceFromFlags` / `leverageScore` (most extracted) + RecipeMicroList sub-component.
- **RecipesView** (canonical L1620–1826): AllergensContext only (extracted), but pulls in EaterTile + many helpers.
- **OrdersView** / **SuggestedBasket**: both need TescoSkusContext (deferred). Wait.

Confirm scope before starting.

#### 7h — `src/lib/recipes.js` → `RecipesContext` refactor (when second recipe consumer lands)

Today, `src/lib/recipes.js` exposes a module-level `let RECIPES` plus `getRecipes` / `setRecipes`, and `src/App.jsx` threads two related props down to `AuditView` for re-render management: `updateRecipePage` (the optimistic-update callback) and `recipesVersion` (an integer bumped on every successful mutation and read by AuditView's `useMemo` deps). Both pieces of complexity are downstream of the same root cause — module-level mutable state isn't React-tracked, so consumers need an external version trigger plus a hand-passed mutator.

Refactor when a second recipe-consuming view (PlannerView, RecipesView, SuggestedBasket) is being ported:
- Convert `src/lib/recipes.js` to a `RecipesContext` (mirror `ReceiptsContext` / `AllergensContext`), with `recipes`, `updateRecipePage`, and an internal version counter all owned by the Provider.
- Migrate `AuditView`'s prop deps (`updateRecipePage`, `recipesVersion`) to `useRecipes()` hook reads — the two-prop reduction is the visible payoff.
- Migrate the new consumer in the same step so the refactor lands cleanly.

Defer until that second consumer is actually being ported — the cost of the existing pattern is paid only when a second consumer needs the same plumbing.

### Deferred

**ReceiptsRefreshContext** — sister context exposing `refresh()` and `localAppend()` for the ReceiptParser save flow. Lives at canonical `index.html` L5364–L5385, wraps the app at L6005. Add when ReceiptParser itself is being ported.

**SKU index** (`buildSkuIndex` / `lookupSku` / `TescoSkusContext`) — tightly coupled with views. Extract alongside the first view that consumes them.

### Update protocol
At the end of each session, update the "Current state" section above:
- Bump "Last verified" date and "Last commit" hash.
- Move completed work from "Next" to "Completed".
- Restate the next planned step(s).
Commit `CLAUDE.md` changes alongside the code changes from that session.

---

## Tool usage notes

- **Supabase MCP** is available — use it autonomously for reads, ask before destructive writes (DELETE, schema changes).
- **Build feedback loop:** `npm run build` after any extraction, `npm run dev` for live smoke-test.
- **No need to rebuild `node_modules`** — already installed.
