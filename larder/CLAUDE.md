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
├── icons/                  ← PWA icons (canonical PNGs; copied selectively into larder/public/icons/)
├── README.md
└── larder/                 ← Vite migration target
    ├── CREDENTIALS.md      ← Supabase keys. Gitignored. Don't commit.
    ├── KNOWN_ISSUES.md     ← pre-existing bugs documented, not regressions
    ├── CLAUDE.md           ← this file
    ├── index.html          ← Vite entry + canonical <style> block L30–97 inlined for CSS parity
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   └── icons/
    │       └── larder-retro-192.png  ← retro jar (LarderBrand inline img); favicon swap still deferred
    └── src/
        ├── main.jsx
        ├── App.jsx                ← app shell: 3 Provider wrap + boot fetch + brand chrome + clickable tab strip + pantry sync slice
        ├── lib/
        │   ├── supabase.js        ← sbFetch / sbWrite + mapReceiptRow / mapPantryRow / mapRecipeRow / mapCookedRow / patchPantryRow / patchRecipeRow
        │   ├── text.js            ← string normalisation
        │   ├── allergens.js       ← Khalil/Max/Emily filter logic
        │   ├── pantry-math.js     ← pure pantry/confidence calculations
        │   ├── household-rules.js ← never_restock patterns
        │   ├── delivery.js        ← suggestNextDelivery(receipts) — receipt cadence → next predicted delivery
        │   └── recipe-match.js    ← pantryMatchSet + makeability — recipe ingredient ↔ pantry resolution
        ├── contexts/
        │   ├── ReceiptsContext.jsx  ← receipts data + load state (consumed by AuditView + LarderBrand inputs)
        │   ├── AllergensContext.jsx ← allergens config + load state (consumed by AuditView + PlannerView)
        │   └── RecipesContext.jsx   ← recipes state + updateRecipePage + version counter (7g/7h refactor; replaces deleted src/lib/recipes.js)
        └── components/
            ├── primitives.jsx     ← InfoTip / SortHeader / Chip / AudienceTag / Bar / Stat / Section
            ├── PantryView.jsx     ← Pantry tab, verbatim port of canonical L1388–1617
            ├── AuditView.jsx      ← Stats tab, verbatim port of canonical L4485–4809 (incl. co-located GapCard); recipes via useRecipes() hook post-7g
            ├── PlannerView.jsx    ← Cook tab, verbatim port of canonical L2273–2340 (dead TescoSkus line stripped per 7g A1)
            ├── RecipeMicroList.jsx ← collapsible recipe card grid (incl. co-located EaterTile) — used by PlannerView
            ├── LarderBrand.jsx    ← brand block: jar SVG/PNG + style toggle + delivery subtitle (favicon swap deferred — A2)
            ├── LarderFooter.jsx   ← "What's in your kitchen?" sign-off
            └── TabIcon.jsx        ← brand-style-aware tab icons (monoline modern + pixel-art retro); useBrandStyle co-located
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

**Last verified:** 2026-05-25
**Last commit:** `094b579` — Step 7g + 7h (PlannerView port + RecipesContext refactor; src/lib/recipes.js deleted; default tab → "planner").
**App shell:** `src/App.jsx` wraps the tree in `<ReceiptsProvider>` + `<AllergensProvider>` + `<RecipesProvider>` (recipes state + updateRecipePage now own their own context post-7g/7h), runs the pantry + cooked boot fetch, owns the pantry sync slice, mounts `<LarderBrand>` + a clickable tab strip with `<TabIcon>` glyphs + `<LarderFooter>` around the active view. Default tab is `"planner"` (canonical-faithful, decision D2). Tab state is in-memory only (no URL sync).
**Smoke test:** ⚠ Browser smoke-test skipped in 7g per user direction (time pressure); correctness verified via static analysis + build green at 48 modules. Two latent bugs caught during static review and fixed pre-commit: (1) `updateRecipePage` race condition where `setState(updater)` snapshot pattern would not run synchronously in React 18 — replaced with a `recipesRef` mirror + sync effect; (2) AuditView `useMemo` deps were missing `recipes` after the `getRecipes()` → hook swap — added.

### Completed
- Vite scaffold (package.json, vite.config.js, index.html, main.jsx, App.jsx)
- RAW JSON blob pruned in canonical `index.html` (646KB → 414KB)
- `src/lib/supabase.js` (~360 lines, sbWrite helper + mapReceiptRow + mapPantryRow + mapRecipeRow + mapCookedRow + patchPantryRow + patchRecipeRow)
- `src/lib/text.js` (~70 lines)
- `src/lib/allergens.js` (~165 lines)
- `src/lib/pantry-math.js` (~135 lines)
- `src/lib/household-rules.js` (34 lines, never_restock patterns from RAW blob — step 7b)
- `src/lib/delivery.js` (~65 lines, `suggestNextDelivery(receipts)` — step 7f-1)
- `src/lib/recipe-match.js` (~65 lines, `pantryMatchSet` + `makeability` — step 7g)
- `src/contexts/ReceiptsContext.jsx` (~57 lines, ReceiptsProvider + useReceipts hook — step 7c, consumed by AuditView from 7e + by App for nextDelivery in 7f-1)
- `src/contexts/AllergensContext.jsx` (~75 lines, AllergensProvider + useAllergens hook, EMPTY_ALLERGENS fallback — step 7e; consumed by AuditView + PlannerView)
- `src/contexts/RecipesContext.jsx` (~135 lines, RecipesProvider + useRecipes hook + recipesRef sync mirror + updateRecipePage callback + version counter — step 7g/7h)
- `src/components/primitives.jsx` (~140 lines, InfoTip / SortHeader / Chip / Bar / Stat — step 7a/7d; Section appended in 7e; AudienceTag appended in 7g)
- `src/components/PantryView.jsx` (~232 lines, verbatim port of canonical L1388–1617 — step 7d)
- `src/components/AuditView.jsx` (~330 lines, verbatim port of canonical L4485–4809 incl. co-located GapCard — step 7e; recipes via useRecipes() post-7g; prop signature reduced to `{pantry, cooked, outOfStock}`)
- `src/components/PlannerView.jsx` (~110 lines, verbatim port of canonical L2273–2340 with dead TescoSkusContext line stripped — step 7g, decision A1)
- `src/components/RecipeMicroList.jsx` (~95 lines, verbatim port of canonical L2341–2402 + co-located EaterTile L1827–1838 — step 7g)
- `src/components/LarderBrand.jsx` (~155 lines, verbatim port of canonical L4824–4960 — step 7f-1; favicon DOM swap deferred per A2)
- `src/components/LarderFooter.jsx` (~16 lines, verbatim port of canonical L4961–4970 — step 7f-1)
- `src/components/TabIcon.jsx` (~360 lines, verbatim port of canonical L4977–5345 — step 7f-3; `useBrandStyle()` hook co-located; all 6 kinds × 2 styles; pure inline SVG, no image files)
- `larder/public/icons/larder-retro-192.png` (single icon for LarderBrand's retro-jar inline `<img>` — step 7f-1, decision A2b; other icons + favicon `<link>`s still deferred)
- `src/App.jsx` wires 3 Provider wrap + boot fetch (pantry + cooked) + pantry sync slice + brand chrome + tab strip with TabIcon glyphs (steps 7d / 7e / 7f-1 / 7f-2 / 7f-3 / 7g)
- Canonical `<style>` block inlined into `larder/index.html` for CSS parity (step 7d)
- `KNOWN_ISSUES.md`
- `npm run build` green (48 modules)

#### Removed in 7g
- `src/lib/recipes.js` — module-level `let RECIPES` + `getRecipes`/`setRecipes` shape replaced by `RecipesContext`. Was a placeholder in 7e flagged as refactor target 7h; 7g/7h merged into one atomic step.

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

#### 7f-1 — LarderBrand + LarderFooter + suggestNextDelivery (Completed 2026-05-17)

First sub-step of the 7f tab-chrome port: brand block above the view, delivery subtitle wired to receipt cadence, footer below. Tab navigation still uses the `?tab=audit` query param from 7e — that gets replaced in 7f-2.

Verbatim ports from canonical:
- `src/components/LarderBrand.jsx` ← canonical L4824–4960 (modern jar SVG + retro PNG-overlay + style toggle + delivery subtitle + style buttons)
- `src/components/LarderFooter.jsx` ← canonical L4961–4970 (italic Georgia "What's in your kitchen?" sign-off)
- `src/lib/delivery.js` ← canonical L4157 (`suggestNextDelivery`, pure function on receipts; reads `TODAY` from pantry-math)

`src/App.jsx` adds `useReceipts()` inside `AppInner`, computes `nextDelivery = useMemo(() => suggestNextDelivery(receipts), [receipts])`, mounts `<LarderBrand pantry nextDelivery />` above the view-switch and `<LarderFooter />` below.

Decisions taken in scope review:
- **A2 / A2b — favicon DOM swap deferred; one icon copied.** Canonical's style-toggle effect rewrites `<link>` `href`s for `#favicon-touch` / `-192` / `-512`. Vite's `larder/index.html` has no such elements; deferred to a 7f-followup along with the broader icons plumbing. Inline TODO in `LarderBrand.jsx`. Single icon `larder-retro-192.png` copied into `larder/public/icons/` so the retro-jar inline `<img>` renders (decision A2b).
- **B1 — localStorage `larder-brand-style` persisted verbatim.** Style choice survives reload.
- **C — `larder-brand-style-change` CustomEvent dispatched verbatim.** No listener yet (TabIcon ports in 7f-3); fires harmlessly.
- **D2 — `HelpBanner` deferred.** `setShowHelpBanner` left unpassed; the `? Help` button hides via the existing truthiness guard.

Smoke tests:
- **Brand block content: PASSED.** Wordmark, jar render, fillPct match canonical side-by-side.
- **Style toggle + persistence (B1): PASSED.** Modern ↔ retro swap; reload preserves choice.
- **Retro PNG render (A2b): PASSED.** `larder/public/icons/larder-retro-192.png` served correctly at `/icons/larder-retro-192.png`.
- **Delivery subtitle: PASSED.** "Delivery in 6 days" — Supabase-projected `2026-05-23` from `latest=2026-05-11` + `avg_gap=12` matches canonical PWA.
- **LarderFooter: PASSED.** Italic Georgia sign-off renders below.
- **No 7d/7e regressions: PASSED.** PantryView toggles + AuditView KPIs unchanged.

#### 7f-2 — click-driven tab navigation (Completed 2026-05-17)

Replaced the 7e `?tab=audit` URL toggle with a click-driven tab strip below `<LarderBrand>`. Verbatim of canonical's tab-strip pattern at L6019–6029 (the `.navtab` button row + conditional `.tab-subtitle`), trimmed to the two currently-implemented tabs.

`src/App.jsx` changes:
- `useState` initialiser now `useState("pantry")` — no URL reading. Removed the `URLSearchParams` import-site lookup entirely (decision B1, canonical-faithful).
- `tabs` array defined inline with two entries: `["pantry", "Pantry", <description>]` and `["audit", "Stats", ""]`. Grows naturally as new views land (decision A1).
- Tab-strip JSX (`.navtab` buttons with `data-active`) and conditional `.tab-subtitle` rendered below `<LarderBrand>` and above the view-switch.
- `TODO(7f)` comment block at top of file stripped (decision C1).

CSS classes `.navtab` + `.navtab[data-active="true"]` + `.tab-subtitle` were already in `larder/index.html` from the 7d canonical CSS paste — no styling work.

Smoke tests:
- **Default load + tab highlight + subtitle: PASSED.** Pantry highlighted on boot, full subtitle rendered.
- **Click Stats: PASSED.** Highlight swaps; subtitle disappears (audit's empty third element); AuditView mounts.
- **Click Pantry: PASSED.** Round-trip; subtitle reappears; PantryView mounts.
- **URL reader removed: PASSED.** `localhost:5173/?tab=audit` lands on Pantry (URL no longer steers state).
- **Reload resets to Pantry: PASSED.** No URL sync, no in-memory persistence (B1).
- **No regressions: PASSED.** Pantry toggles + Audit KPIs + LarderBrand style toggle + Footer all retain prior green status.

#### 7g + 7h — PlannerView port + RecipesContext refactor (Completed 2026-05-25)

Atomic step: PlannerView is the second consumer of recipes data; per the 7h plan ("migrate the new consumer in the same step so the refactor lands cleanly"), 7g absorbed 7h.

New plumbing:
- `src/contexts/RecipesContext.jsx` — `RecipesProvider` + `useRecipes()` hook. Provider owns recipes state (boot fetch via `fetchRecipes` + `mapRecipeRow`), the `updateRecipePage` callback (verbatim canonical L5793 semantics), and an internal version counter. Hook returns `{ recipes, updateRecipePage, version, loading, error }`. Internal `recipesRef` sync mirror replaces the canonical module-global read pattern (see Known minor below).
- `src/lib/recipe-match.js` — `pantryMatchSet` (canonical L1163) + `makeability` (canonical L1184), pure functions. `leverageScore` (L1196) deliberately deferred — only SuggestedBasket consumes it, and that view sits behind the still-deferred TescoSkusContext.
- `src/components/PlannerView.jsx` — verbatim port of canonical L2273–2340 with decision A1 applied: the unused `const skuIndex = useContext(TescoSkusContext)` line at canonical L2289 was stripped (dead code in canonical; never referenced anywhere in PlannerView's body). Documented in the file header.
- `src/components/RecipeMicroList.jsx` — verbatim port of canonical L2341–2402 + co-located `EaterTile` from L1827–1838 (only consumed by RecipeMicroList's expanded card).
- `src/components/primitives.jsx` — `AudienceTag` (canonical L1330) appended; consumed by RecipeMicroList.

Refactor of existing files:
- `src/components/AuditView.jsx` — `getRecipes()` calls replaced with `recipes` destructured from `useRecipes()`. Props signature reduced from `{pantry, cooked, outOfStock, updateRecipePage, recipesVersion}` to `{pantry, cooked, outOfStock}` — both removed props are now hook reads. The visible payoff of the refactor.
- `src/App.jsx` — wrapped in `<RecipesProvider>` (alongside the two existing providers). Dropped: `recipes`/`recipesLoaded`/`recipesVersion` state, `updateRecipePage` callback, `fetchRecipes`/`mapRecipeRow`/`patchRecipeRow`/`setRecipes`/`getRecipes` imports. `recipesLoaded` boot gate replaced with `useRecipes().loading` read (decision E2). Tabs array expanded to `[planner, pantry, audit]` in canonical order; default `useState("planner")` (decision D2).
- `src/lib/recipes.js` — DELETED. RecipesContext is the canonical store now.

Decisions taken in scope review:
- **A1** — strip the dead `useContext(TescoSkusContext)` line in PlannerView. Preserves output behaviour exactly (skuIndex was never read); avoids extracting TescoSkusContext infrastructure for a value with no effect.
- **B1** — new `src/lib/recipe-match.js` for pantry-recipe matching (separate concern from `pantry-math.js` and `allergens.js`).
- **C1** — `RecipeMicroList` in its own file (reusable; future view ports will share it).
- **D2** — default tab `"planner"` matches canonical.
- **E2** — keep the boot loading gate (read `useRecipes().loading` from inside AppInner so the spinner shows until recipes land too).
- **F1** — single atomic 7g step rather than splitting 7g-1 (refactor) + 7g-2 (PlannerView).

Smoke tests: BROWSER TESTING SKIPPED per user direction. Correctness verified via static analysis + build green. Two latent bugs caught during static review and fixed pre-commit:
- **Race-condition bug:** RecipesContext's `updateRecipePage` initially used a "setState updater as snapshot" pattern (`let recipe = null; setRecipesState(prev => { recipe = prev.find(...); return prev; }); if (!recipe) return;`). In React 18, `setState(updater)` queues the updater rather than running it synchronously, so the subsequent `if (!recipe)` check would always fire before the updater ran, causing every call to early-return. Fixed by introducing a `recipesRef` mirror updated via a sync effect — same pattern as the canonical pantryRef in 7d's pantry sync slice. The initial lookup reads `recipesRef.current.find(...)` synchronously; the subsequent mutation uses functional `setState(prev => prev.map(...))` for both the optimistic update and the rollback path. Verbatim-faithful to canonical's "module-global read on every access" behaviour.
- **Stale deps bug:** After the `getRecipes()` → `recipes` swap in AuditView, two `useMemo` blocks read `recipes` in their bodies but only had `[allergens, recipesVersion]` and `[recipesVersion]` in their dep arrays — the canonical pattern that worked when `RECIPES` was an unreactive module global. Fixed: added `recipes` to both dep arrays. Works in practice today because `updateRecipePage` always bumps version + sets recipes together, but the dep array now reflects the actual reads (correct React behaviour and ESLint-friendly).

Known minor: each Provider owns its own boot fetch (7c pattern), so a `fetchRecipes` failure surfaces via `useRecipes().error` but doesn't trigger App.jsx's `loadError` screen. Consumers degrade gracefully (empty recipes, empty Sections) but the user sees no error UI. Acceptable per the per-Provider isolation model; revisit if a real prod failure ever shows up.

#### 7f-3 — TabIcon SVG port (Completed 2026-05-17)

Verbatim port of canonical L4977–5345 into `src/components/TabIcon.jsx`. The `useBrandStyle()` custom hook lives at the top of the same file (decision B1) — single consumer today, mirrors canonical pattern. All 6 `kind` branches (planner / recipes / pantry / gaps / tesco / audit) ported for both modern and retro styles (decision C1) even though only `pantry` + `audit` are reachable from the current tab strip — future view ports just add to App.jsx's `tabs` array.

Pure inline SVG: no image-file dependencies. Modern style = monoline forest-green SVG; retro style = pixel-art via discrete `<rect>` elements (palette: olive bg `#b9c660`, terracotta `#f0743c`, cream `#fcf0c8`, dark-brown outline `#3e200c`).

`src/App.jsx` change: small. Added `import TabIcon` and wrapped each navtab button label with the canonical `<span style="inline-flex, gap:6">` + `<TabIcon kind={k}/>`.

Live style swap: when LarderBrand's style pills toggle, LarderBrand dispatches the `larder-brand-style-change` CustomEvent. `useBrandStyle()` inside TabIcon listens for that event and re-renders both tab icons in the new style — no prop drilling required.

Smoke tests:
- **Modern boot: PASSED.** Pantry icon = mini brand jar; Stats icon = three ascending bars; both forest-green monoline. Pixel-identical to canonical.
- **Retro toggle live swap: PASSED.** Click retro pill → jar swaps AND both tab icons swap to pixel-art within the same render. Verifies the CustomEvent listener fires.
- **Persistence: PASSED.** Refresh with retro selected → icons load directly in retro mode (localStorage read in `useBrandStyle`).
- **Canonical parity: PASSED.** Both icons render identically to canonical PWA's Stats tab at 16px.
- **No regressions: PASSED.** Tab clicking, view switching, LarderBrand/Footer all intact.

### Next

#### 7d-followup — verify `qty_adjustment` debounce coalescing

Confirm that rapid clicks on the qty +/− buttons within a 150ms window produce a single coalesced PATCH (not one-per-click). Test approach: pin App in React DevTools, watch hooks 15 (`qtyDebounceTimers`) and 16 (`pendingQtyValues`); fire 5+ clicks programmatically via `$r` or a console snippet to guarantee sub-150ms cadence; expect one PATCH with cumulative value. Server-write correctness already proven in 7d. Pure optimisation verification.

#### 7f-followup — favicon `<link>` swap + full icons folder

Add the three `<link>` elements (`#favicon-touch` / `-192` / `-512`) to `larder/index.html`'s head; copy the remaining icon PNGs from `grocery-app/icons/` into `larder/public/icons/`; restore the DOM-rewrite block in `LarderBrand.jsx`'s style `useEffect`. Inline TODO in `LarderBrand.jsx` marks the spot.

#### 7f-helpbanner — `HelpBanner` extraction (D2 follow-up)

Extract `HelpBanner` from canonical L1297–1318 into `primitives.jsx`; add `showHelpBanner` state + dismiss callback (canonical L5440) + `help-dismissed` localStorage key (`LS_KEY + ':help-dismissed'`) to `App.jsx`; pass `setShowHelpBanner` to `<LarderBrand>` so the `? Help` button surfaces. Independent of tab chrome — can land anytime.

#### 7i — third view port (open: RecipesView next, then SuggestedBasket/OrdersView behind TescoSkusContext)

The remaining canonical views that don't require deferred infrastructure:
- **RecipesView** (canonical L1620–1826): consumes `AllergensContext` only (already wired); pulls in many recipe-decoration helpers (`pantryMatchSet` + `makeability` are extracted post-7g; rest TBD).
- **OrdersView** / **SuggestedBasket**: both need TescoSkusContext (still deferred). Wait until that block is resolved.

Confirm scope before starting.

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
