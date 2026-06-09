# Larder — Project Context for Claude Code

Household grocery intelligence dashboard. **Cutover complete (2026-05-26):** the Vite build at `larder/dist/` is now the live PWA at `https://maxnem17-a11y.github.io/grocery-app/`, deployed via GitHub Actions (`.github/workflows/deploy.yml`). The previous canonical single-file `index.html` (~414KB) is archived under `legacy/` at the git root.

---

## Stack

- **Build:** Vite (no Tailwind compiler — base utility classes only, see "Constraints" below)
- **UI:** React 18, no router yet
- **Data:** Supabase (PostgREST) — credentials in `CREDENTIALS.md` (gitignored)
- **Deploy:** GitHub Pages via Actions — `.github/workflows/deploy.yml` builds `larder/dist/` on push-to-main and publishes to https://maxnem17-a11y.github.io/grocery-app/. Tailwind utility classes resolve via the JIT CDN (`<script src="https://cdn.tailwindcss.com">` in `larder/index.html`, matching what canonical did).

---

## File map

```
grocery-app/                ← git root
├── .github/workflows/
│   └── deploy.yml          ← Pages-via-Actions: build on PR + push-to-main, deploy on push-to-main (Cutover-2)
├── legacy/                 ← archived canonical (Cutover-3); not deployed
│   ├── index.html          ← previous live PWA (~414KB); rollback reference
│   ├── manifest.json
│   └── service-worker.js   ← kill-switch (Cutover-1); same content also served from larder/public/
├── icons/                  ← original brand PNGs (legacy reference; larder/public/icons/ is the deployed copy)
├── README.md
├── apps-script/            ← Google Apps Script projects bound to Max's Gmail (backlog #6 + #7)
│   ├── Code.gs             ← sendExpiryDigest() — daily expiry digest from Supabase via PostgREST (#7, 2026-06-01)
│   └── README.md           ← one-time setup walkthrough (script properties + OAuth grant + daily trigger)
└── larder/                 ← Vite app (now the deployed PWA)
    ├── CREDENTIALS.md      ← Supabase keys. Gitignored. Don't commit.
    ├── KNOWN_ISSUES.md     ← pre-existing bugs documented, not regressions
    ├── CLAUDE.md           ← this file
    ├── index.html          ← Vite entry + canonical <style> block L30–97 inlined for CSS parity + favicon <link>s (7f-followup)
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   ├── icons/          ← all 6 brand icons (modern + retro × 192/512/apple-touch); favicon swap wired post-7f-followup
    │   ├── manifest.json   ← PWA manifest, deployed at /grocery-app/manifest.json (Cutover-2)
    │   └── service-worker.js ← kill-switch for legacy installed clients (Cutover-3)
    └── src/
        ├── main.jsx
        ├── App.jsx                ← app shell: 4 Provider wrap + boot fetch + brand chrome + clickable tab strip + pantry sync slice + cooked-log slice + replenishment slice
        ├── lib/
        │   ├── supabase.js        ← sbFetch / sbWrite + mapReceiptRow / mapPantryRow / mapRecipeRow / mapCookedRow + patchPantryRow / batchPatchPantryRows / patchRecipeRow / ingestReceipt
        │   ├── text.js            ← string normalisation
        │   ├── allergens.js       ← Khalil/Max/Emily filter logic
        │   ├── pantry-math.js     ← pure pantry/confidence calculations + SHELF_LIFE_DAYS table + computeExpires (post-replenishment expires-bump)
        │   ├── household-rules.js ← never_restock patterns
        │   ├── delivery.js        ← suggestNextDelivery(receipts) — receipt cadence → next predicted delivery
        │   ├── recipe-match.js    ← pantryMatchSet + makeability + leverageScore (added 7j-1)
        │   ├── tesco-skus.js      ← buildSkuIndex / lookupSku / tescoSearchUrl / neverRestockReason (7j-1)
        │   ├── pricing.js         ← PRODUCT_FAMILIES + normaliseProductName / findPantryMatch / buildPriceIndex / lookupPriceForIngredient / extractPackSize (7j-1)
        │   ├── gap-analysis.js    ← computeRegularsAndGaps — receipt-history regulars vs current pantry (7j-1)
        │   ├── receipt-parse.js   ← loadPdfJs + extractPdfText + readEmlText + detectRetailer + parseTesco + ordersKhalilFlag (7k)
        │   └── replenishment.js   ← computeReplenishment(orderItems, pantry, deliveryDate) → {matched, ambiguous, unmatched}; PANTRY_KEYWORDS dict + token-subset substring fallback
        ├── contexts/
        │   ├── ReceiptsContext.jsx  ← receipts data + load state + refresh / localAppend (refresh/append added 7k for ReceiptParser save flow)
        │   ├── AllergensContext.jsx ← allergens config + load state (consumed by AuditView + PlannerView)
        │   ├── RecipesContext.jsx   ← recipes state + updateRecipePage + version counter (7g/7h refactor; replaces deleted src/lib/recipes.js)
        │   ├── TescoSkusContext.jsx ← Tesco SKU index + load state (7j-1; consumed by SuggestedBasket)
        │   └── RecipeModalContext.jsx ← URL-backed open/close handle for the recipe modal — mirrors ?recipe=<id> (deep links + Back/Forward) (2026-06-05)
        └── components/
            ├── primitives.jsx     ← InfoTip (tap-to-reveal) / SortHeader / HelpBanner / Chip / AudienceTag / Bar / Stat / Section / KV / EaterTile
            ├── PantryView.jsx     ← Pantry tab; verbatim port of canonical L1388–1617 + post-cutover "Last ordered" sortable column
            ├── AuditView.jsx      ← Stats tab, verbatim port of canonical L4485–4809 (incl. co-located GapCard); recipes via useRecipes() hook post-7g
            ├── PlannerView.jsx    ← Cook tab; opinionated two-column redesign (2026-06-04) — banner-driven expiry, Tonight's pick hero, filtered+deduped meal sections, Going soon rail
            ├── ExpiredBanner.jsx  ← "Use today or bin" banner (expired pantry items); uses shared ExpiryActionMenu; rendered by App above the tab nav
            ├── ExpiryActionMenu.jsx ← shared Still good/Used/Binned popover (trigger + focus-trap menu); used by ExpiredBanner + GoingSoonRail (2026-06-05)
            ├── TonightsPick.jsx   ← hero recommendation card on the Cook tab (Tonight's pick / Easy tonight)
            ├── GoingSoonRail.jsx  ← quiet right-rail compact list of items expiring 0–5 days
            ├── RecipesView.jsx    ← Recipes tab, verbatim port of canonical L1620–1825; recipes + updateRecipePage via useRecipes() hook
            ├── RecipeMicroList.jsx ← recipe card grid — used by PlannerView; cards open RecipeModal on click (2026-06-05; was click-to-expand)
            ├── RecipeModal.jsx     ← shared full-detail recipe popup (method + prep + ingredients + eater safety + Mark cooked); mounted once in AppInner (2026-06-05)
            ├── SuggestedBasket.jsx ← basket recommendation engine; verbatim port of canonical L1849–2270 (7j-1)
            ├── GapsView.jsx       ← Basket tab; full body (KPIs + SuggestedBasket + regulars/gaps table + LeverageTileGrid) — verbatim port of canonical L4242–4482 (7j-2)
            ├── LeverageTileGrid.jsx ← sortable leverage-ingredient table used by GapsView (7j-2)
            ├── OrdersView.jsx     ← Orders tab, verbatim port of canonical L3322–3685 (7k)
            ├── ReceiptParser.jsx  ← drag-and-drop receipt upload + parse preview + save-to-archive; mounts ReplenishmentPreview after successful save (post-cutover)
            ├── ReplenishmentPreview.jsx ← three-bucket preview (auto-matched checkboxes / ambiguous dropdowns / no-match list) surfaced after receipt save (post-cutover)
            ├── SpendChart.jsx     ← per-order + timeline SVG spend chart used by OrdersView; verbatim port of canonical L2483–2620 (7k)
            ├── LarderBrand.jsx    ← brand block: jar SVG/PNG + style toggle + delivery subtitle + favicon swap (post-7f-followup)
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

See `KNOWN_ISSUES.md`. `"almond milk"` → `"tree nut"` is intentional (almond is Khalil's tree-nut trigger); don't "fix" it to `"dairy"`. The adjacent gap — plain `"whole milk"` returning `null` — was fixed 2026-06-01 (`a42047d`).

---

## Current state

**Last verified:** 2026-06-09
**Last commit:** Photo receipt — separate "Upload photo" (library) button + end-to-end verified (2026-06-09) — split the upload affordance into three distinct inputs so each opens the right picker: **📷 Take photo** (`capture="environment"`, camera), **🖼️ Upload photo** (`accept="image/*"` no capture → photo library / Files), and a Tesco **.eml/.pdf** text link. (Previously only the camera-capture button + a generic "Choose file" existed.) `ANTHROPIC_API_KEY` is now set, so the feature is fully live: end-to-end browser-verified (Playwright, 390px) — uploaded the real Sainsbury's photo via the library input → vision parsed sainsburys / £21.83 / 5 items, eggs auto-flagged as a Khalil allergen, Save button present, zero console errors. The live function read the crumpled rotated receipt perfectly (all 5 items + prices match the £21.83 balance; store address + date extracted; obscured Harbour-Fillets price inferred from the total and flagged in notes). `package.json` 0.5.0→0.5.1. Earlier: Photo receipt upload → pantry restock + Orders archive (2026-06-09) — **new modality:** photograph any UK supermarket paper till receipt (Sainsbury's, Tesco, Waitrose…) and it reads the items, saves the order to the archive, and offers a pantry restock — reusing the entire existing receipt pipeline. **New Edge Function `parse-receipt-photo`** (deployed, `supabase/functions/parse-receipt-photo/index.ts` in-repo; `verify_jwt=false` + shared `X-Ingest-Secret`): downscaled image → Anthropic Messages API (Claude vision, default `claude-sonnet-4-6`, override via `RECEIPT_VISION_MODEL`) with a forced `emit_receipt` tool call → returns an `order`-shaped object (synthetic deterministic `order_number` from store/till/date/time for dedup; `delivery_date` = receipt date since the column is NOT NULL; clean normalized item names that keep the food noun so the replenishment matcher works). It does NOT write — the client saves via the **existing** `ingest-receipt` `{retailer, order}` path, so dedup + `receipt_items` insert + `ReplenishmentPreview`/`applyReplenishment` all reuse the canonical flow. **Client:** `parseReceiptPhoto()` in `supabase.js`; `imageToDownscaledBase64()` (canvas, ~1600px long edge, JPEG q0.85) in `receipt-parse.js`; `ReceiptParser` gained an image branch + a 📷 **Take photo** button (`capture="environment"`) alongside Choose file, accepting `image/*` plus `.eml/.pdf`. `OrdersView` rows now show a **retailer chip** (`mapReceiptRow` passes `retailer` through) and hide the long synthetic order number (only real `\d{4}-\d{4}-\d{2,4}` Tesco numbers render). **⚠ One-time setup required:** the vision function needs an `ANTHROPIC_API_KEY` Supabase secret (an Anthropic API key, billed separately from any Claude subscription) — until it's set, photo uploads show a friendly "needs setup" message and `.eml/.pdf` keep working. **Retailer support:** `ingest-receipt`'s `ALLOWED_RETAILERS` (`tesco/ocado/sainsburys/waitrose`) was left untouched (avoid redeploying the canonical Tesco write path) — Sainsbury's/Tesco/Waitrose/Ocado save; other shops parse but fail at save with `unsupported_retailer` until that one-line allowlist is expanded (documented in `supabase/functions/README.md`). Browser-verified (Playwright/system Chrome, 390px): both buttons render, the real 2.7MB Sainsbury's photo downscaled → base64 → POSTed → got the expected 503 `vision_unconfigured` → client showed the "needs ANTHROPIC_API_KEY setup" message; build green (69 modules). End-to-end vision extraction pending the API key. `package.json` 0.4.4→0.5.0. Earlier: Orders "Repeat-purchase patterns" + "Khalil exposure" card-grid overflow fix (2026-06-09) — follow-up to the tables fix below: both card grids overflowed the right edge of a 390px phone (long Tesco product names rendered full-width, pushing the ×count/£spend chips off-screen). Two causes, both fixed: (1) the grids were `grid sm:grid-cols-2 …` with **no mobile `grid-cols-1`**, so below the `sm` breakpoint they were a bare `grid` with a single **auto-sized** column that expands to content instead of the container — added explicit `grid-cols-1` (Tailwind's `minmax(0,1fr)`) so the track is constrained to the viewport; (2) the `truncate flex-1` name span and its parent `.card` (a grid item) both lacked `min-w-0`, so the flex/grid automatic-minimum-size kept them at content width and `truncate` never engaged — added `min-w-0` to both. Now names ellipsis-truncate and the chips stay on-screen. (The earlier tables fix missed this because these sections are `defaultOpen={false}` collapsibles — my 390px overflow check didn't expand them.) Browser-verified (Playwright/system Chrome, 390px): both sections expanded, 0 of 31 cards overflow, page horizontal overflow 0px, long names truncate with chips visible, zero console errors. Build green (69 modules), `package.json` 0.4.3→0.4.4. Earlier: Basket / Orders / Admin tables mobile fix — horizontal scroll (2026-06-09) — applied the same `overflow-x-auto` + inner `min-w-[…]` floor treatment from the Pantry fix to the three remaining crushed-on-mobile tables. **Basket** (`LeverageTileGrid.jsx`): the 12-column leverage table (#/Ingredient/Recipes/Avg boost/→70%) wrapped in `overflow-x-auto` + `min-w-[640px]` (sits inside a `defaultOpen={false}` Section, so it's behind the "Ingredients that unlock the most recipes" expander). **Orders** (`OrdersView.jsx`): the per-order line-item `<table>` was already in an `overflow-x-auto` wrapper but had no width floor, so columns crushed instead of scrolling — added `min-w-[640px]` to the `<table>`. **Admin** (`AuditView.jsx`): the "By book" recipe-page-coverage table (Book/Missing/Coverage/% complete + inline page inputs) wrapped in `overflow-x-auto` + `min-w-[560px]`. The Stats-half bar tables (Pantry composition, Confidence health, Audience by-source) were **left alone** — browser-checked that none of those unwrapped `grid-cols-12` tables overflow a 390px viewport (their flexible `<Bar>` columns absorb the squeeze), so forcing scroll there would be a regression. The SuggestedBasket rows already stack via `col-span-12 sm:col-span-N` breakpoints — untouched. Browser-verified (Playwright/system Chrome, 390px mobile + 1280px desktop): Basket leverage scrolls (640px content / 322px view), Orders line-items scroll (640/298), Admin by-book scrolls (560/324); all three fill width on desktop (no scroll), page horizontal overflow 0px at both sizes, zero console errors. Build green (69 modules), `package.json` 0.4.2→0.4.3. Earlier: Pantry table mobile fix — horizontal scroll + stray-overflow guard (2026-06-08) — the Pantry tab's 12-column grid was crushing all columns into each other on phones (headers overlapping, "chicken thi…" truncation). Wrapped the table (header + rows) in an `overflow-x-auto` container with an inner `min-w-[768px]` floor, so on mobile it scrolls sideways with legible columns and on desktop the grid still expands to fill the card. Also added `overflow-x-clip` to the root app container in `AppInner` to kill a pre-existing ~69px stray horizontal page scroll on mobile (off-screen opacity-0 InfoTip bubbles near the right edge) — `clip` (not `hidden`) so it doesn't become a scroll container and break the sticky tab nav. Browser-verified (Playwright/system Chrome, 390px mobile + 1280px desktop): table scrolls horizontally on mobile (356px visible / 768px content), fills width on desktop (no scroll), page horizontal overflow 0px, sticky nav still pins to top:0 after scrolling, zero console errors. Build green (69 modules), `package.json` 0.4.1→0.4.2. Earlier: Still good / Used / Binned actions on the Cook-tab "Going soon" rail (2026-06-05) — the same freshness triage the ExpiredBanner offers is now on each `GoingSoonRail` row (0–5d items), so an item can be resolved before it lapses. Extracted the shared `ExpiryActionMenu` component (the popover + outside-tap/Esc/focus-trap behaviour + `EXPIRY_ACTIONS`) and refactored `ExpiredBanner` onto it (removed its duplicated popover state/effects) so both surfaces share one implementation. `markItemAction` is threaded App → PlannerView (`onMarkItem`) → GoingSoonRail; each rail row is the menu trigger (right-aligned menu), non-interactive fallback when no handler. **Behaviour fix:** `still_good` no longer always sets expiry to today+3 (which would *shorten* a not-yet-expired going-soon item) — it's now `max(currentExpiry+3, today+3)`, i.e. never-shorten. For expired banner items current<today so it still resolves to today+3 (unchanged); for fresh rail items it pushes +3 from current (usually dropping them out of the 0–5d rail). Browser-verified (Playwright/system Chrome): rail rows open the 3-action menu, a live "Still good" on chicken thighs extended 2026-06-08→2026-06-11 (left the rail) and round-tripped to Supabase (then restored via MCP), zero console errors. Build green (69 modules), `package.json` 0.4.0→0.4.1. Earlier: Real per-recipe URLs (`?recipe=<id>` deep links) (2026-06-05) — the recipe modal is now URL-backed. `RecipeModalContext` rewritten from holding a single `recipe` object to a URL-mirrored `{ recipeId, snapshot, openRecipe, closeRecipe }`: opening pushes `?recipe=<id>` (bookmarkable/shareable; ids are human-readable slugs like `oven-chips-oregano-feta`), the browser **Back** button closes the modal, **Forward** reopens it, and loading a `/grocery-app/?recipe=<id>` URL opens the modal on first paint. History model: fresh open → pushState; open-while-open → replaceState (no stacking); close (we pushed) → history.back(); close (deep link) → replaceState strips param; popstate syncs state from the URL. Query-param (not path) chosen so GitHub Pages serves the same index.html with no 404-fallback. `RecipeModal` now resolves the recipe itself — uses the caller's decorated `snapshot` when present, else looks the id up in RecipesContext and decorates it (makeability + allergen flags) using `pantry`/`outOfStock` (now passed in from AppInner) — so deep links/back-forward render fully. Added a header **🔗 copy-link** button (copies `window.location.href`). Browser-verified (Playwright/system Chrome): open sets the slug URL, copy-link copies it, Back closes + cleans URL, Forward restores, deep-link load opens the right recipe, deep-link close strips the param, zero console errors. Build green (68 modules), `package.json` 0.3.0→0.4.0. Earlier: Recipe detail modal (Jira-ticket-style popup) (2026-06-05) — new shared `RecipeModal` (popup overlay) opened from any recipe surface, replacing the old click-to-expand. New `RecipeModalContext` (`openRecipe(decoratedRecipe)` / `closeRecipe` / `recipe`) lets any card pop the modal without prop-drilling; `RecipeModalProvider` wraps `AppInner`; `<RecipeModal cooked addCooked cookedSyncErrors/>` mounted once in `AppInner`. The modal is strictly richer than the old expand — it adds **Method** (`recipe.steps`) and **Prep ahead** (`recipe.prep_steps`), plus servings/tags, full ingredient lists with qty/unit (have vs missing), per-eater safety tiles, notes, source link, and a sticky **Mark cooked** footer. Sticky header/footer, backdrop+×+Esc close, body-scroll lock. Wired into `RecipesView` rows (inline expand removed; `EaterTile` import dropped; page-edit pencil + Mark-cooked pill still stopPropagation), `RecipeMicroList` cards (Cook tab; expand removed, ⤢ open hint, row Mark-cooked kept), and `TonightsPick` (title + "up next" open the modal). Browser-verified (Playwright/system Chrome): opens from Cook (Tonight's pick) + Recipes rows, shows Method/eater tiles/Mark-cooked, closes via Esc + backdrop, zero console errors. Build green (68 modules), `package.json` 0.2.2→0.3.0. Earlier: Sticky nav + Cook-tab "Got 5 mins?" relocation + Stats→Admin split (2026-06-05) — (1) the tab strip is now `sticky top-0 z-30` with a `#fafaf7` backdrop spanning the container width (negative-margin trick), so it stays visible on scroll; (2) the "Got 5 mins?" prep-suggestions section moved out of the Cook left column into the right rail (below "Going soon"), and its card grid dropped from 3→2 per row (`grid-cols-1 sm:grid-cols-2`); the right column now self-collapses when neither the rail nor prep has content; (3) the Stats tab is renamed **Admin** and `AuditView` is split into two labelled `GroupHeader` halves — **Admin** (new **Eaters & dietary requirements** section rendering the `household_allergens` config as per-eater cards: Max=pescatarian, Emily=no pork, Khalil=per-category allergen chips + check-label/confirmed-safe; then Workflow integrity + Recipe page-number coverage) and **Stats** (counters strip relocated here + Pantry composition & health + Audience breakdown). Browser-verified (Playwright/system Chrome): sticky position confirmed, prep in right column at 2/row, Admin tab renders both groups + 3 eater cards, zero console errors. Build green (66 modules), `package.json` 0.2.1→0.2.2. Earlier: Basket KPIs hidden-by-default + projected-expiry in basket (branch `feat/basket-expiry-tweaks`, 2026-06-04) — the 2 Basket KPI cards (Regulars / Real gaps) now sit behind a "Show stats" toggle, hidden by default; "Replace what's expiring" now also includes in-stock items projected to expire by the next suggested delivery, split into "Already expired" (Used/Binned, red `expired` chip) vs "Expiring before delivery" (day-count chip + "expires in Nd (by delivery)"). Still-good items suppressed. Browser-verified modern + retro. Earlier: Basket-tab consolidation + Cook row-level Mark cooked (branch `feat/basket-overhaul`, 2026-06-04) — one canonical grouped basket (🔴 Replace expiring / 🟡 Refill regulars / 🟢 Unlock recipes), per-row remove + Excluded drawer, Cook-banner→basket linkage (used/binned → restock; still-good suppressed), actionable leverage (add-to-basket CTA + 70% visual ranking + cap-12 + clickable recipe rows), ingredient-name merge in leverage, settings-pill min-orders, direct/search SKU clarity. Browser-verified both tabs (modern/retro/mobile, banner→basket + leverage-add flows, no console errors). Earlier: Cook-tab opinionated redesign (branch `feat/cook-tab-redesign`, 2026-06-04) — expired-items banner, Tonight's pick hero, two-column layout + Going soon rail, meal-section noise filtering + dedup, header polish. Browser-verified (Playwright/system Chrome) modern + retro + mobile, banner actions round-tripped to Supabase. Earlier: `003f2c6` prep-grid (#9), `db8c197` backlog #9 "Got 5 mins?" prep suggestions (code side). Earlier: `7676dbb` retro polish, `5f02574` Apps Script expiry digest, `0d03199` Basket→tab 2. Live at https://maxnem17-a11y.github.io/grocery-app/. **2026-06-03:** backlog #9 curation landed — `prep_steps` bulk-populated across all 178 recipes (167 populated, 639 tasks, avg 3.8; 11 left empty by design: pure drinks/smoothies, build-and-serve, and caption-only stub recipes with no holdable prep). Auto-derived from ingredient prep-annotations (chop/peel/deseed/grate/beat + make-ahead pastes/rubs/marinades/batters/sauces), NOT from prose steps. The "Got 5 mins?" Cook-tab section is now live and **browser-verified** (Playwright via system Chrome: section renders 5 tasks + ↻ Refresh on the Cook tab, reroll produces distinct samples, no console errors). DB-only change; no code or migration. Max can hand-edit any recipe's `prep_steps` later — #9 was always designed for curation.
**App shell:** `src/App.jsx` wraps the tree in `<ReceiptsProvider>` + `<AllergensProvider>` + `<RecipesProvider>` (recipes state + updateRecipePage owned by RecipesContext post-7g/7h), runs the pantry + cooked boot fetch, owns the pantry sync slice + cooked-log mutation slice (`addCooked` / `cookedSyncErrors`), holds App-scope `eaterFilter` state for RecipesView, mounts `<LarderBrand>` + a clickable tab strip with `<TabIcon>` glyphs + `<LarderFooter>` around the active view. Default tab is `"planner"`. Tab order diverges from canonical (Basket promoted to #2 on 2026-06-01). Tab state is in-memory only.
**Smoke test:** ⚠ Browser smoke-test skipped in 7i per user direction (workflow change: "no need to wait for OK if confident"); correctness verified via static analysis + build green at 49 modules. Static review confirmed hook ordering, useMemo deps, addCooked closure semantics, page-edit input wires updateRecipePage via useRecipes(), and TabIcon "recipes" kind already implemented in 7f-3.

### Completed

#### Basket tab consolidation + Cook row-level Mark cooked (SHIPPED 2026-06-04)
Second half of the Cook & Basket overhaul (Cook Part 1 shipped in the redesign below). **No ranking algorithms changed — only filtering/surfacing + new add/remove/linkage state.** Browser-verified both tabs (Playwright/system Chrome) modern + retro + 390px mobile, banner→basket + leverage-add flows, zero console errors; test rows restored.

- **Cook 1.8** — `RecipeMicroList` gained an optional row-level **Mark cooked** button (props `onMarkCooked`/`cookedSet`/`cookedSyncErrors`); `PlannerView` threads `addCooked` + a `cookedSet` into Everybody eats / Gains / Quick wins so every card can mark cooked without expanding (was 3 clicks deep). Button `stopPropagation`s so it doesn't toggle the card.
- **`GapsView` (Basket) consolidated** — dropped the standalone "Pick your basket gaps" table; now KPIs → one `SuggestedBasket` → leverage. GapsView owns the **lifted shared state**: `addedIngredients` (Set, from leverage adds — unioned into the leverage matchSet so the table re-ranks) + `excludedItems` (removed rows) + `minOrders`. KPI "Real gaps" reconciles with the basket's Refill-regulars group (same `minOrders`); a tooltip explains any residual diff (dedup/this-cycle removals).
- **`SuggestedBasket` rewritten** into three reason-grouped, collapsible, cost-totalled groups: **🔴 Replace what's expiring** (ONLY items the user marked Used/Binned on the Cook banner via `_last_marked_action` — the banner→basket linkage; a bridge hint counts untriaged expired items), **🟡 Refill regulars** (order-history gaps + a relocated "all regulars" diagnostic drawer with the 4 status filters), **🟢 Unlock recipes** (auto leverage + manual adds, tagged "added"). Per-row **× remove** → collapsible **"Excluded for this cycle"** drawer with restore; min-orders demoted to a ⚙ settings pill; direct-SKU vs search shown as a "search" chip + "N direct · M search" footer. Waste-signal (2.6) UI wired but gated off — the schema retains no per-cycle waste history yet, so it never shows false positives (documented TODO).
- **`LeverageTileGrid` made actionable** — expansion header has a **+ Add ⟨ingredient⟩ to basket** CTA (updates basket + re-ranks, inline "Leverage updated" confirm) + a headline "makes N recipes makeable (≥70%)"; recipe rows are **bold (≥70%) / normal (50–70%) / dimmed (<50%)** by post-add makeability, capped at 12 with "Show all N", and each is **clickable → Recipes tab** (search prefilled via lifted `recipeQuery` in App; `RecipesView` `q` now controlled-with-fallback).
- **`recipe-match.js`** — `normalizeIngredientName` (lowercase + strip parentheticals + drop fresh/dried/… qualifiers + singularise) merges leverage rows so "ginger" + "fresh ginger" + "Fresh Ginger" collapse to one (grouped by normalised key; per-recipe after-% still computed against the recipe's own cleaned form).
- Build green (66 modules). `package.json` 0.1.0→0.2.0. No schema change (the `last_marked_action` column from the redesign below is the linkage hook).

#### Cook tab — opinionated first-screen redesign (SHIPPED 2026-06-04)
Replaced the five-default-collapsed-accordion Cook tab with an opinionated two-column first screen. **No ranking algorithm changed — only filtering + surfacing.** Browser-verified via Playwright/system Chrome (modern + retro + 390px mobile, zero console errors); banner actions round-tripped to live Supabase and the test rows restored.

- **Migration `add_last_marked_action_to_pantry_items`**: additive nullable `last_marked_action text` (CHECK in still_good|used|binned) + `last_marked_at timestamptz` on `pantry_items`. `mapPantryRow` passes through `_last_marked_action`. Distinction (used vs binned) persisted for future waste analytics; banner itself only reads expiry/out_of_stock.
- **`ExpiredBanner.jsx`** (new) — "Use today or bin · N items", rendered by App **above the tab nav** (first focusable region). Each past-expiry in-stock item is a tappable chip → popover (focus-trapped, Esc/outside-tap close) with **Still good** (expires→today+3, drops to the rail), **Used**, **Binned** (both out_of_stock). "Dismiss for session" escape hatch (in-memory). Renders only when ≥1 item is past expiry.
- **`App.jsx`** — `markItemAction(item, action)` mirrors the `toggleOutOfStock` optimistic-PATCH+rollback pattern; `bannerDismissed` session state; `goToBasket` passed to LarderBrand; `addCooked`+`cookedSyncErrors` threaded to PlannerView; **`<LarderFooter>` mount removed** (the orphan "What's in your kitchen?" caption — component file left in place, unused).
- **`PlannerView.jsx`** (rewrite) — expiry split (banner gets <0, rail gets 0–5); `isNoiseRecipe` filter on all meal sections; **Tonight's pick** ranked by (expiring ingredients used → protein → makeability) with "Easy tonight" fallback; **Gains** now requires non-null protein ≥20 (was ≥30, no null guard); cross-section **dedup** (Tonight's pick > Quick wins > Everybody eats; Gains independent) with inline "also …" chips; two-column grid (`lg:grid-cols-3`, left `col-span-2`, rail last in DOM — a11y-clean, so rail stacks at the bottom on mobile by decision); every section header carries a count; rail hidden + left full-width when nothing's going soon.
- **`TonightsPick.jsx` / `GoingSoonRail.jsx`** (new) — hero card + quiet right-rail compact list (thinner border, lighter bg, no accordion).
- **`recipe-match.js`** — `NOISE_TAGS` / `totalTime` / `isNoiseRecipe` (pure): exclude >90 min total or condiment/drink/syrup/jam/winter-remedy/… tags. Verified against data: 8 recipes >90 min, noise tags populated.
- **`LarderBrand.jsx`** — delivery line is now a clickable pill → Basket; pantry % rendered as a `<Bar>` + `i` tooltip ("N% — M items tracked · K expiring soon"); **style toggle + Help demoted** out of the primary row into a ⚙ preferences popover (same setStyle logic + CustomEvent untouched).
- **`primitives.jsx`** — `InfoTip` now tap-to-reveal (toggle + aria-expanded + outside-tap/Esc close, hover preserved); Section subtitle contrast bumped stone-500→600. **`RecipeMicroList.jsx`** renders an optional `_alsoNote` chip. **`PrepSuggestions.jsx`** gained a `defaultOpen` prop (Got 5 mins? now opens by default).
- Build green (66 modules). `package.json` 0.0.1→0.1.0. Deferred from scope: none — full spec landed in one pass.

#### #9 — "Got 5 mins?" prep-ahead suggestions (SHIPPED + CURATED 2026-06-03 — live)
Cook-tab section surfacing a random sample of mise-en-place prep tasks from currently-cookable recipes. Built per the 2026-06-02 scope (decisions A1–G1).
- **Migration `add_prep_steps_to_recipes`**: additive `prep_steps jsonb NOT NULL DEFAULT '[]'::jsonb` on `public.recipes` (+ column comment). All 178 rows default to `[]`.
- `src/lib/supabase.js` — `mapRecipeRow` passes `prep_steps` through (`row.prep_steps || []`).
- `src/lib/recipe-match.js` — `extractPrepTasks(recipes, pantry, outOfStock, count=5)` + `PREP_COOKABLE_PCT=70`. Filters recipes with makeability ≥70 that have ≥1 prep_steps entry, flattens to `{task, recipeId, recipeName}`, returns a partial-Fisher-Yates uniform random sample. **Signature deviates from scope** (`outOfStock` added) so out-of-stock items don't inflate makeability — same matchSet inputs PlannerView already uses.
- `src/components/PrepSuggestions.jsx` (~55 lines) — owns a `reroll` useState (↻ Refresh button, E1) + memoised sample; renders a Section (tone accent, collapsible, defaultOpen false). Returns `null` when sample is empty (F1 empty-state).
- `src/components/PlannerView.jsx` — mounts `<PrepSuggestions recipes pantry outOfStock/>` after "Quick wins", before "Cooked log" (A1: after groupings).
- Build green (64 modules). See [#10] for dismiss-state follow-up. Browser smoke-test skipped per workflow.
- **Curation landed 2026-06-03** (DB-only, no code): `prep_steps` bulk-populated across all 178 recipes via 6 parallel subagents writing to Supabase. Auto-derived from the ingredient `item` prep-annotations (e.g. `"red onion, roughly chopped"` → `"Roughly chop the red onion"`) plus make-ahead components (rubs/pastes/marinades/batters/sauces); cooking actions + last-minute garnishes + trivial pantry-staple measuring excluded. Result: **167/178 populated, 639 tasks, avg 3.8**; 11 left empty by design (pure drinks/smoothies, build-and-serve, caption-only stub recipes with no holdable prep). The 4 borderline recipes (Banana Oat Protein Cookies, Protein Strongback smoothie, Braised Greens, Vegan Mac) got minimal prep tasks added after review (mash banana / chop dates+freeze banana / chop garlic+chilli / prep broccoli+kale+celery). Deviation from original scope's B1 (Max hand-curates) — Max asked for a bulk first pass; everything is editable per-recipe later. The Cook-tab section is now live and browser-verified (Playwright via system Chrome — renders tasks + ↻ Refresh reroll on the Cook tab); shows tasks from currently-cookable recipes only, makeability ≥70.

#### Pantry data audit + fixes (2026-06-02)
Live `pantry_items` audit (86 rows). Applied via MCP after user confirmation:
- **2 allergen-flag corrections** `son_allergen → household_safe`: `peanut butter` (peanuts are household-safe per the Khalil rules; its twin `peanut butter (crunchy)` was already correct) and `gluten-free spaghetti` (the GF/safe variant was wrongly carrying the wheat flag that belongs on `spaghetti`/`penne`). Both were set-once seeding errors.
- **13 stale rows** flipped `out_of_stock = true` — perishables past `expires` but still in-stock (e.g. `whole chicken` −18d, `mushrooms` −17d), reflecting pantry drift (no consumption event in the model — see #4).
- **DDL findings (not yet actioned):** schema is sound (all 13 categories map to both `decayPerDay` buckets and `SHELF_LIFE_DAYS`). Strongest pending change = allergen provenance cols (#1, `allergen_verified_at`/`_by` — would catch exactly these set-once errors). Optional: a `category` CHECK/lookup to stop typos silently falling through to default decay. `qty` free-text left as-is (nothing consumes it numerically).

#### Migration arc
- Vite scaffold (package.json, vite.config.js, index.html, main.jsx, App.jsx)
- RAW JSON blob pruned in canonical `index.html` (646KB → 414KB)
- `src/lib/supabase.js` (~360 lines, sbWrite helper + mapReceiptRow + mapPantryRow + mapRecipeRow + mapCookedRow + patchPantryRow + patchRecipeRow)
- `src/lib/text.js` (~70 lines)
- `src/lib/allergens.js` (~165 lines)
- `src/lib/pantry-math.js` (~135 lines)
- `src/lib/household-rules.js` (34 lines, never_restock patterns from RAW blob — step 7b)
- `src/lib/delivery.js` (~65 lines, `suggestNextDelivery(receipts)` — step 7f-1)
- `src/lib/recipe-match.js` (~130 lines, `pantryMatchSet` + `makeability` — step 7g; `leverageScore` appended 7j-1)
- `src/lib/tesco-skus.js` (~130 lines, `buildSkuIndex` + `lookupSku` + `tescoSearchUrl` + `neverRestockReason` — step 7j-1)
- `src/lib/pricing.js` (~330 lines incl. ~140-row PRODUCT_FAMILIES regex table, `normaliseProductName` + `findPantryMatch` + `buildPriceIndex` + `lookupPriceForIngredient` + `extractPackSize` — step 7j-1)
- `src/lib/gap-analysis.js` (~75 lines, `computeRegularsAndGaps` — step 7j-1)
- `src/lib/receipt-parse.js` (~270 lines, full ingest pipeline: `loadPdfJs` + `extractPdfText` + `readEmlText` + `detectRetailer` + `parseTesco` + `ordersKhalilFlag` — step 7k)
- `src/contexts/TescoSkusContext.jsx` (~70 lines, TescoSkusProvider + useTescoSkus — step 7j-1; empty-index default matches canonical L820)
- `src/contexts/ReceiptsContext.jsx` (~57 lines, ReceiptsProvider + useReceipts hook — step 7c, consumed by AuditView from 7e + by App for nextDelivery in 7f-1)
- `src/contexts/AllergensContext.jsx` (~75 lines, AllergensProvider + useAllergens hook, EMPTY_ALLERGENS fallback — step 7e; consumed by AuditView + PlannerView)
- `src/contexts/RecipesContext.jsx` (~135 lines, RecipesProvider + useRecipes hook + recipesRef sync mirror + updateRecipePage callback + version counter — step 7g/7h)
- `src/components/primitives.jsx` (~185 lines, InfoTip / SortHeader / Chip / Bar / Stat — step 7a/7d; Section appended in 7e; AudienceTag appended in 7g; EaterTile promoted from RecipeMicroList in 7i; HelpBanner appended in 7f-helpbanner)
- `src/components/PantryView.jsx` (~232 lines, verbatim port of canonical L1388–1617 — step 7d)
- `src/components/AuditView.jsx` (~330 lines, verbatim port of canonical L4485–4809 incl. co-located GapCard — step 7e; recipes via useRecipes() post-7g; prop signature reduced to `{pantry, cooked, outOfStock}`)
- `src/components/PlannerView.jsx` (~110 lines, verbatim port of canonical L2273–2340 with dead TescoSkusContext line stripped — step 7g, decision A1)
- `src/components/RecipesView.jsx` (~210 lines, verbatim port of canonical L1620–1825 — step 7i; recipes + updateRecipePage via useRecipes(); page-edit input wires through context; addCooked + eaterFilter come from App props)
- `src/components/RecipeMicroList.jsx` (~80 lines, verbatim port of canonical L2341–2402 — step 7g; EaterTile co-located in 7g, moved to primitives in 7i)
- `src/components/SuggestedBasket.jsx` (~440 lines, verbatim port of canonical L1849–2270 — step 7j-1)
- `src/components/GapsView.jsx` (~265 lines, verbatim port of canonical L4242–4482 — step 7j-2; was a 22-line shell in 7j-1)
- `src/components/LeverageTileGrid.jsx` (~85 lines, verbatim port of canonical L2403–2472 — step 7j-2)
- `src/components/OrdersView.jsx` (~373 lines, verbatim port of canonical L3322–3685 — step 7k)
- `src/components/ReceiptParser.jsx` (~430 lines, verbatim port of canonical L2903–3320 — step 7k)
- `src/components/SpendChart.jsx` (~150 lines, verbatim port of canonical L2483–2620 — step 7k)
- `src/components/LarderBrand.jsx` (~155 lines, verbatim port of canonical L4824–4960 — step 7f-1; favicon DOM swap deferred per A2)
- `src/components/LarderFooter.jsx` (~16 lines, verbatim port of canonical L4961–4970 — step 7f-1)
- `src/components/TabIcon.jsx` (~360 lines, verbatim port of canonical L4977–5345 — step 7f-3; `useBrandStyle()` hook co-located; all 6 kinds × 2 styles; pure inline SVG, no image files)
- `larder/public/icons/` — all 6 brand icons (modern + retro × 192 / 512 / apple-touch). Single retro-192 landed in 7f-1 (decision A2b) for LarderBrand's inline `<img>`; remaining 5 copied in 7f-followup alongside the favicon `<link>` swap.
- `src/App.jsx` wires 4 Provider wrap (Receipts / Allergens / Recipes / TescoSkus) + boot fetch (pantry + cooked) + pantry sync slice + cooked-log mutation slice (`addCooked` / `cookedSyncErrors` / `setCookedSyncError`) + `eaterFilter` state + `showHelpBanner` state + brand chrome + tab strip with TabIcon glyphs (steps 7d / 7e / 7f-1 / 7f-2 / 7f-3 / 7g / 7i / 7j-1)
- Canonical `<style>` block inlined into `larder/index.html` for CSS parity (step 7d)
- `KNOWN_ISSUES.md`
- `npm run build` green (61 modules)

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

#### 7k — Orders tab: OrdersView + ReceiptParser + SpendChart (Completed 2026-05-26)

**Final canonical tab.** Closes the migration arc. The Vite scaffold now has all 6 tabs at canonical parity.

New files:
- `src/lib/receipt-parse.js` (~270 lines): full ingest pipeline. `loadPdfJs` (module-scoped `__pdfjsPromise` singleton; CDN load of pdf.js v3.11.174), `extractPdfText`, `readEmlText`, `detectRetailer`, `parseTesco` (~160 lines of regex), `ordersKhalilFlag` (receipt-item Khalil tagger — different signature from `khalilAllergenFlag` in allergens.js; lives here because it's receipt-item-name regex rather than allergen-config-driven).
- `src/components/SpendChart.jsx` (~150 lines): inline SVG, per-order + timeline view modes. Local useState for mode toggle.
- `src/components/ReceiptParser.jsx` (~430 lines): drag-and-drop receipt upload, dry-run preview, save-to-archive. 11 useStates + 1 context hook (`useReceipts`, destructuring refresh+localAppend) + 1 ref + 3 useCallbacks. Two input paths (`.eml` server-parse via `dryRun=true` + `.pdf` browser-parse via `parseTesco`).
- `src/components/OrdersView.jsx` (~373 lines): the Orders tab. 2 context hooks (`useReceipts`, `useTescoSkus`) + 2 useStates + 3 useMemos (orders sort, stats aggregation, spend-by-pantry-category join). Mounts `<ReceiptParser/>` twice (empty-state + after KPI strip) — independent instances.

Promotion:
- `KV` (canonical L2621) added to `primitives.jsx` — used by OrdersView's KPI strip and ReceiptParser's parsed-order summary.

Context expansion (decision A1):
- `ReceiptsContext` gains `refresh` + `localAppend` callbacks (canonical L5364, L5376). useCallback with empty deps for stable identity. Hook return shape becomes `{ receipts, loading, error, refresh, localAppend }`. ReceiptParser destructures `refresh` + `localAppend` from `useReceipts()`. Decision A1 absorbs canonical's sister `ReceiptsRefreshContext` into the main context — consistent with the 7g/7h `updateRecipePage` precedent. Existing consumers (AuditView, PlannerView, RecipesView, SuggestedBasket, GapsView) ignore the extra keys; no migration cost.

App.jsx wiring:
- `[tesco, Orders, <canonical subtitle>]` appended to tabs array between `gaps` and `audit` — canonical L5559 order: planner / recipes / pantry / gaps / tesco / audit. TabIcon "tesco" kind already implemented in 7f-3 (parcel icon).
- `{tab === "tesco" && <OrdersView pantry={pantry}/>}` render branch.

Scope decisions taken in review:
- **A1**: Absorb refresh/localAppend into ReceiptsContext. Mirrors 7g/7h pattern.
- **B1**: Single `src/lib/receipt-parse.js` file for the whole ingest pipeline.
- **C1**: `SpendChart` in its own file.
- **D1**: `KV` appended to primitives.jsx.
- **E1**: Atomic single-step port rather than splitting. ~1400 lines, contained scope.

Smoke tests: SKIPPED in browser per workflow. Static review confirmed:
- Hook ordering in OrdersView: 2 context + 5 state/memo before `if (!orders.length) return ...` early-return.
- Hook ordering in ReceiptParser: 11 useStates + 1 context destructure + 1 ref + 3 useCallbacks; conditional returns only inside the JSX render block (post-hooks).
- `useReceipts()` shape expansion compatible with all 5 existing consumers (they destructure `{ receipts }` and ignore extra keys).
- `__pdfjsPromise` module-scoped singleton: fine for prod, HMR resets in dev (cheap reload, not a correctness issue).
- `ordersKhalilFlag` import path correct in both OrdersView and ReceiptParser — distinct from allergens.js's `khalilAllergenFlag` (different signatures, different files).
- ReceiptParser mounted twice in OrdersView; each instance has independent state.
- TabIcon "tesco" kind already present from 7f-3 verbatim.
- All cross-file imports map to public exports.

**Migration arc complete.** All 6 canonical tabs (Cook / Recipes / Pantry / Basket / Orders / Stats) render at parity in the Vite scaffold. All canonical helpers extracted into `src/lib/` (10 modules). All canonical contexts mirrored as React Provider hooks (4 contexts). All canonical Tesco-write paths wired (pantry sync slice 7d, recipe page-num updates 7g, cooked-log toggle 7i, receipt save 7k). The canonical `index.html` at the git root remains the live PWA; deploying the Vite build (cutting over from canonical) is a separate step outside the migration's scope.

#### 7j-2 — GapsView regulars/gaps table + LeverageTileGrid (Completed 2026-05-25)

Closes out the Basket tab. Replaces the 22-line `GapsView` shell from 7j-1 with the full canonical body (~265 lines), and adds the `LeverageTileGrid` sub-component used by GapsView's "Ingredients that unlock the most recipes" section.

New file:
- `src/components/LeverageTileGrid.jsx` (~85 lines, verbatim canonical L2403–2472). Self-contained with own sort state (3 useStates + 1 useMemo). Sort headers use the existing `SortHeader` primitive; expanded rows show each ingredient's affected recipes with before/after makeability.

Modified file:
- `src/components/GapsView.jsx` — shell replaced with full canonical body. Adds: 5 useStates (minOrders, filter, leverageLimit, regSortBy, regSortDir), 4 useMemos (leverage, analysis, hasStatusVariance, visible), 4 context hooks (useReceipts, useAllergens, useTescoSkus, useRecipes), `toggleRegSort` callback. `<SuggestedBasket pantry outOfStock />` stays at canonical L4367 position inside the new body. Renders: 2 KPI Stats → SuggestedBasket → "Pick your basket gaps" Section with regulars table → "Ingredients that unlock the most recipes" Section with LeverageTileGrid.

Static-review-caught dep-array correction:
- `leverage` useMemo: canonical L4282 deps `[pantry, outOfStock, leverageLimit, allergens]`. Body reads `RECIPES` (module global). Post-port, body reads `recipes` from `useRecipes()` — needs `recipes` + `recipesVersion` in deps. Same shape as the 7g/7i bug fixes; flagged at scope time, fixed during the port (not after). Without this, the leverage list would stale on recipe mutations (e.g. when AuditView's page-edit input fires).

Smoke tests: SKIPPED in browser per workflow. Static review confirmed:
- Hook ordering: 13 hooks (4 context + 5 useState + 4 useMemo) all called unconditionally before the `if (!analysis) return ...` guard at the bottom.
- `analysis` null-safety: returns null when receipts empty; guard prevents `analysis.latest.*` reads in that path.
- `visibleRaw` is a non-memoised const (each render); `hasStatusVariance` + `visible` re-evaluate every render via the changing `visibleRaw` reference. Same wasteful-but-correct behaviour as canonical.
- All cross-file imports map to public exports.
- `<SuggestedBasket>` mounts unchanged from 7j-1; behaviour preserved.

Basket tab is now at canonical parity.

#### 7j-1 — Basket tab: TescoSkusContext + SuggestedBasket + lib helpers (Completed 2026-05-25)

Biggest single step so far. Lands the SuggestedBasket recommendation engine on a new "Basket" tab between Pantry and Stats. The full GapsView body (regulars/gaps table, LeverageTileGrid) deferred to 7j-2.

New libs (decision B1 — separate concerns):
- `src/lib/tesco-skus.js` (~130 lines): `buildSkuIndex` (L727), `lookupSku` (L758, three-tier matching), `tescoSearchUrl` (L810), `neverRestockReason` (L4051; depends on lookupSku + HOUSEHOLD_RULES). Pure functions.
- `src/lib/pricing.js` (~330 lines incl. PRODUCT_FAMILIES): `normaliseProductName` + 140-row regex taxonomy (L3703–3914), `findPantryMatch` + PANTRY_KEYWORDS, `extractPackSize`, `buildPriceIndex`, `lookupPriceForIngredient`. Lower-median preserved verbatim (canonical L4108-4110); not "fixed" to true median.
- `src/lib/gap-analysis.js` (~75 lines): `computeRegularsAndGaps` (L4194). The `latestIdx` return field preserved verbatim per the canonical TODO at L4190.
- `src/lib/recipe-match.js`: `leverageScore` appended (canonical L1196).

New context (decision E2 — empty default, no boot gate):
- `src/contexts/TescoSkusContext.jsx`: TescoSkusProvider + useTescoSkus. Empty default `{ byKey: new Map(), byTescoName: new Map(), all: [] }` per canonical L820 — items render with `needs_sku_lookup: true` pre-boot rather than crashing. AppInner's loading gate does NOT block on this (canonical behaviour).

New views:
- `src/components/SuggestedBasket.jsx` (~440 lines, verbatim canonical L1849–2270): 4 context hooks (useReceipts / useAllergens / useTescoSkus / useRecipes), 5 useMemos (matchSet → decorated → leverage; priceIndex; gapAnalysis; nextDelivery; big `basket` useMemo combining all three input streams), 2 useStates (openedSkus, copyState), per-row "Open in Tesco" affordance, JSON download + clipboard export. RECIPES module global → `recipes` from useRecipes (matches 7g/7i pattern).
- `src/components/GapsView.jsx` (~22 lines): minimal shell — just renders `<SuggestedBasket pantry outOfStock />`. Decision D1.

App.jsx wiring:
- Fourth Provider (`<TescoSkusProvider>`) wraps the tree inside `<RecipesProvider>`.
- Tabs array gains `["gaps", "Basket", <canonical subtitle>]` between pantry and audit. Canonical L5559 order: planner / recipes / pantry / gaps / audit (tesco still pending — that's 7k).
- `{tab === "gaps" && <GapsView .../>}` render branch.

Scope decisions taken in review:
- **A1**: two-step split (7j-1 / 7j-2) rather than atomic. 7j-1 is the headline feature; 7j-2 adds the regulars/gaps table polish.
- **B1**: three separate lib files (tesco-skus / pricing / gap-analysis) for clean concerns.
- **C** (verbatim): RECIPES → useRecipes().recipes; same shape as 7g/7i.
- **D1**: GapsView is a minimal shell; no placeholder text for the deferred regulars table.
- **E2**: TescoSkusContext empty-default unblocks consumers pre-boot; not added to AppInner's loading gate.

Smoke tests: SKIPPED in browser per workflow. Static review confirmed:
- Hook ordering in SuggestedBasket (14 hooks, all unconditional, consistent across renders).
- `basket` useMemo deps `[gapAnalysis, leverage, pantry, outOfStock, priceIndex, nextDelivery, skuIndex]` cover all body reads.
- `decorated` useMemo deps include `recipesVersion` for safety.
- TescoSkusContext default uses Map objects (not plain `{}`); lookupSku has explicit `instanceof Map` backwards-compat branch.
- `computeRegularsAndGaps` returns `null` for empty receipts; SuggestedBasket guards with `gapAnalysis?.gaps || []`.
- All cross-file imports map to public exports.
- TabIcon "gaps" kind already implemented in 7f-3 (modern basket + retro pixel-art basket).

Known dead code preserved verbatim:
- L61 `const expiring = pantry.filter(...)` at the top of SuggestedBasket — declared but never referenced in the function body. Canonical has the same dead reference; not "fixed."

#### 7f-helpbanner — HelpBanner extraction (Completed 2026-05-25)

Closes the D2 deferral from 7f-1. HelpBanner introductory panel surfaces when the user clicks the "? Help" pill in LarderBrand's style-toggle row.

- `src/components/primitives.jsx` — `HelpBanner` appended (verbatim canonical L1297–1318). Uses the `.help-banner` CSS class already in `larder/index.html` from 7d's canonical CSS paste.
- `src/App.jsx` — `showHelpBanner` useState (default `false`) + `dismissHelpBanner` useCallback (verbatim canonical L5439–5443). LarderBrand now receives `showHelpBanner` + `setShowHelpBanner` props so the `? Help` pill renders. `<HelpBanner onDismiss={dismissHelpBanner}/>` mounts conditionally below LarderBrand.

Verbatim-with-note: canonical's `dismissHelpBanner` writes a `help-dismissed` localStorage key that nothing in canonical reads back. Same dead-code shape as the TescoSkusContext line stripped in 7g/A1. Preserved here (the write is harmless; banner defaults to closed regardless of the key); flagged in the App.jsx comment.

Smoke tests: SKIPPED in browser per workflow. Static review: HelpBanner is a stateless component (no hooks); ? Help pill render guard `setShowHelpBanner && !showHelpBanner` correctly hides the button when banner is open; build green at 49 modules unchanged (HelpBanner exported from existing primitives.jsx file).

#### 7f-followup — favicon `<link>` swap re-enabled (Completed 2026-05-25)

Closes out the 7f-1 A2 deferral. Three changes in one commit:
- Five remaining icon PNGs copied from `grocery-app/icons/` → `larder/public/icons/` (modern × {192, 512, apple-touch}; retro × {512, apple-touch}). The retro-192 was already in place from 7f-1 A2b.
- Three `<link>` elements (`#favicon-touch` / `#favicon-192` / `#favicon-512`) added to `larder/index.html` head — verbatim canonical L19-21 with initial hrefs pointing at the modern variants (default style).
- Favicon DOM-swap block restored inside LarderBrand's style-change useEffect — verbatim canonical L4831-4838. Now when the user toggles modern ↔ retro, the in-page jar swaps AND the browser-tab/home-screen favicons swap to match.

LarderBrand.jsx header comment updated to retire the "favicon swap deferred — A2" note.

Smoke tests: SKIPPED in browser per user workflow. Static review confirmed: <link> ids match what the useEffect looks up; href format matches canonical; PNG files now resolve at the served path `/icons/larder-{style}-{192|512|apple-touch}.png` via Vite's public/ directory.

#### 7i — RecipesView port + cooked-log mutation slice (Completed 2026-05-25)

Third view port. RecipesView is the second consumer of cooked-log state (PlannerView + AuditView were readers; RecipesView is the first writer via `addCooked`).

New file:
- `src/components/RecipesView.jsx` — verbatim port of canonical L1620–1825. Structural changes per migration discipline: `useContext(AllergensContext)` → `useAllergens()`; `RECIPES` module global → `recipes` from `useRecipes()`; `updateRecipePage` + `recipesVersion` from `useRecipes()` instead of props (matches the 7g/7h refactor pattern AuditView already follows). Prop signature reduced from canonical's 9 props to 7: `{pantry, outOfStock, cooked, addCooked, eaterFilter, setEaterFilter, cookedSyncErrors}`.

Promotion:
- `EaterTile` (canonical L1827–1838) was co-located inside `RecipeMicroList.jsx` in 7g (single consumer). With RecipesView as the second consumer, promoted to `primitives.jsx` and imported by both. Decision A1.

App.jsx additions:
- `eaterFilter` + `setEaterFilter` `useState` (default `"all"`). App-scope so it persists across tab switches — matches canonical L5550. Decision C1.
- `cookedSyncErrors` state map (`{recipeId: errorMessage}`) + `setCookedSyncError` useCallback helper. Mirrors pantry's syncErrors pattern.
- `addCooked` useCallback — verbatim port of canonical L5584–5661. Optimistic local insert/remove → background `insertCookedLog` / `deleteCookedLog` → rollback on failure with sync-error surfacing. Deps `[cooked, setCookedSyncError]` keep the `cooked.findIndex(...)` closure fresh on every cooked update. Decision B1 (no CookedContext refactor yet — RecipesView is the first writer, mirroring 7h's "defer until second consumer needs the same plumbing" discipline).
- Tabs array expanded to `[planner, recipes, pantry, audit]` in canonical L5555–5562 order. TabIcon "recipes" kind already implemented in 7f-3.
- Imports: `RecipesView` from components; `insertCookedLog` + `deleteCookedLog` from supabase.

Smoke tests: SKIPPED in browser per user workflow change ("no need to wait for OK if confident"). Static review confirmed:
- Hook ordering in RecipesView (all hooks before any conditional).
- `decorated` useMemo deps `[recipes, matchSet, allergens, recipesVersion]` cover all reads.
- `cookedSet` useMemo deps `[cooked]` cover all reads.
- `addCooked` deps `[cooked, setCookedSyncError]` give fresh closure for the `cooked.findIndex` call at click time.
- Page-edit input wires `updateRecipePage` from `useRecipes()` — the 7g/7h race-fix in RecipesContext applies.
- TabIcon "recipes" kind renders in both modern + retro styles (7f-3 verbatim).
- `cookedSyncErrors` access null-safe via `(cookedSyncErrors||{})[r.id]`.
- AuditView prop signature unchanged.

Known issue inherited from canonical (verbatim): double-click on "Mark cooked" within the optimistic window (before the first POST completes) can leave server state diverged from local state — second click sees the local optimistic entry (no server id yet), takes the REMOVE path, hits the "no server id, skip DELETE" branch, but the first POST may still succeed server-side. Not fixed here (verbatim port); document if it surfaces.

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

#### Cutover (Completed 2026-05-26)

Vite build is live at https://maxnem17-a11y.github.io/grocery-app/ via Pages-via-Actions.

- **Cutover-1** (`0c44dc7`): replace `grocery-app/service-worker.js` with a self-unregister kill-switch. Pushed direct to main so installed clients begin clearing the legacy SW before the build-mechanism flip.
- **Cutover-2** (`35db697` merge of `f7bca07`): feature branch + PR (F1). Adds `base: '/grocery-app/'` to vite.config; co-locates `manifest.json` in `larder/public/` with fixed icon paths (canonical referenced non-existent `icon-{192,512}.png` at repo root); adds `<link rel="manifest">` + theme-color to `larder/index.html`; introduces `.github/workflows/deploy.yml` (Pages-via-Actions: build on PR + push-to-main, deploy only on push-to-main). Requires Pages source flipped from "Deploy from branch" to "GitHub Actions" in repo settings (one-time, user-side).
- **Cutover-3** (this commit): `git mv` canonical `{index.html, manifest.json, service-worker.js}` into `legacy/` at the git root (D2 — preserved as git rollback reference, not URL-served). Also adds `larder/public/service-worker.js` (same kill-switch content) so the live `/grocery-app/service-worker.js` URL stays 200 — installed clients that hadn't visited between Cutover-1 and Cutover-2 can still pick up the kill-switch and self-unregister on their next navigation. Without that, their stale SW would keep serving cached canonical from disk indefinitely.

Live smoke (post-merge): `curl -sI` against `/`, `/assets/index-<hash>.js`, and `/manifest.json` all return 200 with expected content-types and the new manifest's icon paths.

Rollback: restore `legacy/index.html` → repo root, change Pages source back to "Deploy from branch", push. Two-step revert.

#### Post-cutover refinements (Completed 2026-05-26)

Same-day follow-ups after the live build landed.

**Tailwind CDN restore** (`21a71b0`). The Vite scaffold had no Tailwind, so utility classes (`flex`, `gap-2`, `text-stone-500`, `bg-teal-700`, etc.) were inert and the layout rendered unstyled — visibly worse than canonical. Restored canonical's `<script src="https://cdn.tailwindcss.com">` tag in `larder/index.html`. Dev-mode-per-Tailwind-docs but works in production at the cost of ~50KB runtime download + brief FOUC. Proper compiler pipeline (tailwindcss + postcss + autoprefixer) deferred.

**Rotating loading messages** (`116cfd6`). Boot gate said "Loading…"; canonical (legacy L5959–5979) picks one of 10 kitchen-themed messages at random per page load via `useMemo([])`. Verbatim port, placed alongside `nextDelivery` above all early-returns so hook order stays identical across loading / loadError / no-data / happy-path renders.

**Pantry replenishment from receipt save — option B from scope** (`a51ec99`). The canonical never wired automatic pantry replenishment to receipt ingest; the pantry has been hand-curated since the initial 2026-05-13 CSV seed. The 2026-05-24 order was saved to `receipts` + `receipt_items` but didn't touch `pantry_items.purchased` — only "pomegranate seeds" was manually marked. Built the full pipeline:
- `src/lib/replenishment.js` (~120 lines): `computeReplenishment(orderItems, pantry, deliveryDate)` returns `{matched, ambiguous, unmatched}`. PANTRY_KEYWORDS dict pass first (catches "oat drink" → "oat milk"); token-subset substring fallback (tokenise both sides, drop pack-size + stopword noise, plural-strip trailing s on tokens ≥4 chars, accept if pantry tokens are a subset of receipt tokens). Skips status='unavailable' items + pantry rows where `purchased >= deliveryDate` (preserves manual edits).
- `src/lib/supabase.js`: `batchPatchPantryRows(ids, fields)` via PostgREST `?id=in.(uuid1,uuid2,...)`.
- `src/components/ReplenishmentPreview.jsx` (~180 lines): three-bucket UI (auto-matched checkboxes / ambiguous dropdowns / no-match collapsed list) + Apply button. Deduped selection by pantry row id.
- `src/App.jsx`: `applyReplenishment(rows, deliveryDate)` callback mirrors the pantry-sync slice pattern — snapshot prior state, optimistic local update on `pantry` + `outOfStock`, batch PATCH, rollback on failure.
- `ReceiptParser.jsx`: mounts the preview after `saveState ∈ {saved, replaced, duplicate}` and `!replenishHandled`; resets per uploaded file.

Decisions taken in scope review: **A2** (PANTRY_KEYWORDS + token-subset substring fallback), **B2** (three-bucket preview), **C1** (match the substitute name, not the original), **D1** (skip rows where `purchased >= deliveryDate`), **E1** (one-off MCP backfill for the 2026-05-24 order). **A3** (per-item keyword table in DB) deferred.

E1 backfill ran via MCP: 17 rows updated (matches the preview's auto-match output, minus the 2 false-positive uncheckables — "Tesco Frozen Sliced Red Onions" → fresh `red onion`, "Tesco Naturally Sweet Sweetcorn" → `sweetcorn (can)` via PANTRY_KEYWORDS — and minus pomegranate seeds already at 2026-05-24).

Static-trace eyeball before shipping: 40 receipt items → ~22 auto-matches (16 unique pantry rows after dedup), 0 ambiguous, 18 correctly unmatched (chicken wings / raspberries / iceberg / etc. — items with no pantry row). ~95% precision; preview gates everything for review.

**"Last ordered" sortable column on Pantry grid** (`ed4a75f`). Surfaces `purchased` date + days-since as a sortable column between Freshness and Expires. Qty column shrunk from col-span-3 to col-span-2 to make room. Default sort dir is desc (most-recent-first).

**`expires`-bump on replenishment** (`f32137c`). Bug after replenishment shipped: just-replenished perishables (chicken, salmon, bananas, etc.) showed as "overdue" in the Expires column because `applyReplenishment` updated `purchased` but left the stale CSV-seeded `expires` alone — also inflated the "Expiring ≤5d" KPI.
- `pantry-math.js`: `SHELF_LIFE_DAYS` map (13 categories: produce 5, protein 4, dairy 7, dairy-alt 7, bread 5, frozen 90, tinned 730, tinned-protein 730, dry-goods 365, seasoning 365, nuts-seeds 180, condiment 180, snack 60) + `computeExpires(category, purchasedIso)` helper. Unknown categories return null and the PATCH leaves expires unchanged.
- `applyReplenishment`: per-row new expires from category shelf life, grouped by computed date so each group gets one PostgREST batch PATCH (3–5 round-trips instead of N). Optimistic local update + rollback cover expires too.
- One-off backfill UPDATE via MCP for stale rows globally (`(expires IS NULL OR purchased > expires) AND category IN (...)`). 9 rows fixed: protein → +4d, produce → +5d, bread → +5d, dairy-alt → +7d.
- Always-overwrite for simplicity. Tesco receipts don't include use-by dates, and there's no per-item expires edit UI, so there are no hand-curated values at risk today. Guard rail ("only-if-stale") deferred — add when/if a use-by edit workflow lands.

#### Post-cutover refinements (Completed 2026-06-01)

**`khalilAllergenFlag` catches plain cow milk** (`a42047d`). Latent bug: `household_allergens` dairy/khalil/block has 18 cheese/butter/cream tokens but no bare `"milk"` entry (would over-flag plant milks). Receipt items like `"Tesco Whole Milk 2L"` were returning `null` instead of `"dairy"`. Fix: call existing `isDairyMilk(n)` helper inside the dairy branch of the category loop in `lib/allergens.js`. `isDairyMilk` already handles plant-milk exclusions (coconut/almond/oat/soya/etc.), so `"almond milk"` still flows to `tree_nuts` and `"oat milk"` still returns `null` (household-safe). 8-line change; no tests existed to update. Note: `flagsForRecipe` already called `isDairyMilk` (allergens.js:98) — this is consistency with the existing recipe-side behaviour.

**Basket promoted to tab position 2** (`0d03199`). Tab order was `Cook / Recipes / Pantry / Basket / Orders / Stats` (canonical-faithful). Basket is the second most actionable surface after Cook (what to eat tonight) and was buried at #4 behind two reference tabs. New order: `Cook / Basket / Recipes / Pantry / Orders / Stats` — strict swap of Basket and Recipes positions in `App.jsx:127`. The render strip iterates the `tabs` array; route guards (`tab === "..."`) are keyed so nothing else needed touching. Diverges from canonical L5555–5562; post-cutover, canonical fidelity is no longer load-bearing.

**Retro brand-style polish — font + chunky borders + crisp jar** (`7676dbb`). Pre-this-commit, the retro toggle only swapped the brand jar (PNG vs SVG), the 6 tab icons, and the favicon — everything else looked identical to modern. Extended retro to a cohesive skin: VT323 8-bit monospace font (Google Fonts CDN), hard corners + 2px black borders + offset 4px/2px drop shadows on `.card` / `.pill` / `.qty-btn` / `.chip` / `.help-banner` / `.infotip-*`, double-line `.navtab` underline when active, pixel-button nudge on `.pill:hover`, and `image-rendering: pixelated` scoped narrowly to `img[src*="larder-retro"]` so the retro jar PNG renders crisp without distorting other images (notably SpendChart SVGs). Modern mode is unaffected — all rules are scoped under `[data-brand-style="retro"]`. Implementation: new inline `<script>` in `<head>` mirrors `localStorage["larder-brand-style"]` to `<html data-brand-style="...">` before first paint so the boot/loading screen renders in the saved style (no FOUC); `LarderBrand` keeps it in sync on toggle. ~95 lines, no new deps. Build still green (63 modules).

**Expiry digest Apps Script — backlog #7 code side** (`5f02574`). New top-level `apps-script/` directory holds the Google Apps Script projects that run alongside the web app. `Code.gs` exposes `sendExpiryDigest()`: reads `pantry_items` from Supabase via PostgREST (`expires<=today+5d`, `out_of_stock=false`, `expires not null`) using script-properties-stored anon key, buckets the rows into overdue / today / tomorrow / next-5-days, renders a small HTML email, sends via `GmailApp` with `From: Larder`. Silent when all buckets are empty (E1 from scope). Uses London-TZ formatted dates so the "today" boundary doesn't drift with UTC. RLS already permits anon SELECT on `pantry_items` — no policy change needed. `README.md` documents the one-time laptop-side setup: paste `Code.gs`, set 3 script properties (`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `DIGEST_RECIPIENT`), grant `script.external_request` + `gmail.send` OAuth scopes by running the function manually once, add a daily time-driven trigger at ~07:00 BST. Pre-built for #6 to share the same project later. Status: **code shipped; remaining work is the ~5-min laptop setup**, then #7 is live.

### Next

#### 7d-followup — verify `qty_adjustment` debounce coalescing

Confirm that rapid clicks on the qty +/− buttons within a 150ms window produce a single coalesced PATCH (not one-per-click). Test approach: pin App in React DevTools, watch hooks 15 (`qtyDebounceTimers`) and 16 (`pendingQtyValues`); fire 5+ clicks programmatically via `$r` or a console snippet to guarantee sub-150ms cadence; expect one PATCH with cumulative value. Server-write correctness already proven in 7d. Pure optimisation verification.


### Deferred

**A3 — per-item keyword table in Supabase.** Replace the static `PANTRY_KEYWORDS` dict in `lib/pricing.js` with a teachable `pantry_keywords` column (text[]) on `pantry_items`, plus an inline "teach the matcher" UI in ReplenishmentPreview's unmatched bucket ("Add 'chicken wings' → chicken row?"). Highest-quality matcher; biggest build (schema change + edit UI + migration). Open when matcher false-positive rate hurts or unmatched-count annoys.

**Proper Tailwind compiler.** Currently using the JIT CDN (`<script src="https://cdn.tailwindcss.com">` in `larder/index.html`) — dev-mode per Tailwind docs but works in prod at the cost of ~50KB runtime + brief FOUC. Replace with `tailwindcss + postcss + autoprefixer` proper build pipeline. ~30 min of work. Open if performance becomes a complaint or you want to delete the CDN warning in the console.

**Per-item expires edit UI on Pantry tab.** No way to hand-set a use-by date today; the `expires` field is CSV-seeded + category-default-bumped. Would unlock the "use-by from pack" workflow (snap a pack date into the row). The "expires never shortens" guard from today is already there for this.

**Replenish-from-OrdersView button.** Add a "Replenish" affordance next to each row in OrdersView so historical orders can be reconciled without re-uploading the receipt or using MCP. Same `applyReplenishment` callback, different invocation point. Cheap (~50 lines).

**Canonical legacy URL.** `grocery-app/legacy/` is git-archived but not URL-served (D2-lite). If a fallback URL ever becomes useful, copy into `larder/public/legacy/` + add icon subfolder so the canonical's relative favicon hrefs resolve. Probably not needed.

#### Product backlog (PM-identified 2026-05-28)

**#1 — Allergen re-verification trail (SCOPED 2026-05-28; highest household stakes).** `pantry_items.allergen_flag` (household_safe/son_allergen/check) is CSV-seeded, set-once, never recomputed, and has no provenance. When replenishment brings a substitution or new brand for an existing row, the flag doesn't re-evaluate. The real allergen signal lives in the *delivered product name* (receipt), not the generic pantry label — so contradiction detection happens at ingest. Decisions: **A1** (add `allergen_verified_at timestamptz` + `allergen_verified_by text`; no source-tracking column), **B3 phased** (B1 manual "verified Xd ago" staleness + Mark-verified button first; B2 automatic contradiction-catch as fast-follow), **C1** (B2 surfaces as a 4th bucket "Allergen re-check needed" in the existing ReplenishmentPreview), **D1** (manual verify action on PantryView's existing Khalil audit panel). New pure helper `allergenContradiction(productName, storedFlag, allergens)` in `lib/allergens.js` reusing `khalilAllergenFlag` (runs on the receipt product name, NOT the pantry label). **Never auto-change allergen_flag from the computed value — only flag for human review.** Files: migration (2 cols), `lib/allergens.js`, `lib/replenishment.js` (+allergenRecheck bucket), `ReplenishmentPreview.jsx`, `PantryView.jsx` Khalil panel, `App.jsx` markAllergenVerified callback. ~250 lines + 1 migration.

**#2 — Khalil-allergen post-save alert escalation (SCOPED 2026-05-28).** `ordersKhalilFlag` tags allergen items in the ReceiptParser preview, but it's lost after save — no persistent "your last delivery had N items Khalil can't eat" surface. Decisions: **A1** (dismissible banner on PantryView first paint — the operational surface), **B1** (read the latest receipt's embedded `items` from ReceiptsContext — `receipts[receipts.length-1]`; no new fetch/column), **C1** (dismissible per-order via localStorage `khalil-alert-dismissed-<orderId>`; a new order re-triggers), **D1** (Khalil only). New `components/AllergenAlertBanner.jsx` (~70 lines) using `ordersKhalilFlag` (the receipt-item tagger in receipt-parse.js — NOT `khalilAllergenFlag`). Mount above PantryView's KPI row. No DB change. ~90 lines. Pairs with #1.

**#4 — Auto-decrement on `mark cooked` (SCOPED 2026-05-28, precondition resolved).** When a recipe is marked cooked, debit matched pantry rows' `qty_adjustment` so the pantry reflects usage. Decisions: **A1** (decrement by 1 per matched ingredient — skip quantity/unit math), **C1** (reverse the decrement on un-cook, symmetric), **D2** (non-blocking toast with Undo, not silent — matcher imprecision needs a veto). **Precondition closed:** `recipes.ingredients` is `jsonb` — array of `{qty, unit, item, pantry_match}`. qty/unit/pantry_match are all NULL today (only `item` populated with clean generic names like "flour"/"spinach"/"tomato"), which (a) confirms A1 — no quantity math possible without backfilling qty/unit, and (b) gives the matcher clean generic ingredient names (easier than receipt product names). The null `pantry_match` field is a pre-built cache slot the matcher can populate as a side effect. Matching reuses the replenishment matcher (PANTRY_KEYWORDS + token-subset) over `ingredient.item`. Files: `lib/replenishment.js` (sister `computeRecipeUsage`), `App.jsx addCooked` (+batch PATCH + rollback), new `UndoToast.jsx`. ~150-200 lines. Pairs well after a meal-planner so planned→cooked→pantry closes the loop.

**#6 — Tesco order email auto-ingest (SCOPED 2026-05-28; needs laptop for setup).** Google Apps Script bound to Max's Gmail, 15-min trigger, searches `label:Larder/Inbox is:unread`, POSTs raw .eml to the existing `ingest-receipt` Edge Function. Decisions: **A1** (Apps Script, not Cloudflare/Resend — lowest setup friction), **B1** (auto-ingest only; replenishment stays manual via the deferred Replenish-from-OrdersView button — ship that alongside), **C1** (add `source = "auto-gmail"`; one-line Edge Function change), **D1** (label `Larder/Failed` on error, leave unread). The Edge Function side is already built (eml ingest + dedup). **Blocker for autonomous execution:** the Apps Script project, Gmail filter, OAuth consent, and trigger all require Max logged into Google in a browser (~5 min UI). Code-side parts (Edge Function tweak, `apps-script/Code.gs` + README in repo, OrdersView button) are doable without the laptop. Full scope in the 2026-05-28 chat session.

**#7 — Expiry notifications via Gmail Apps Script digest (CODE SHIPPED 2026-06-01 in `5f02574`; trigger setup pending laptop).** Daily morning email digest of pantry items nearing expiry — proactive equivalent of the existing "Expiring ≤5d" PantryView KPI, which only fires on app-open. Decisions: **A1** (Gmail Apps Script daily digest — reuses the same lane planned for #6, zero browser-permission friction, no service-worker resurrection; ship as second trigger in the same Apps Script project to share OAuth), **B1** (daily trigger at ~07:00 BST — single low-frequency send, not threshold-crossing), **C1** (5-day lookahead — matches the existing "Expiring ≤5d" KPI for cross-surface consistency), **D1** (group by bucket in the email body: overdue / today / tomorrow / 2–5d — actionable framing), **E1** (skip the email entirely when all buckets are empty — no "nothing expiring today" spam), **F1** (no in-app side; the digest is the whole feature). Apps Script reads Supabase via REST: `SELECT name, expires, category FROM pantry_items WHERE expires IS NOT NULL AND expires <= CURRENT_DATE + INTERVAL '5 days' AND status != 'out_of_stock' ORDER BY expires` (anon key + RLS-permitted SELECT). Renders simple HTML, sends via `GmailApp.sendEmail` to Max's address. Failure mode: log to Apps Script execution log + skip; the next day's run retries naturally. Files: extend `apps-script/Code.gs` with `sendExpiryDigest()` + a second daily time-driven trigger; update `apps-script/README.md`. No app-side or DB changes. ~80 lines. **Blocker for autonomous execution:** same as #6 — Max logged into Google in a browser to wire the trigger and OAuth scopes (adds `gmail.send` + Supabase `UrlFetchApp` allowlist). Ships best alongside #6 so both triggers are configured in one Apps Script session.

**#8 — "There's Rice at Home" takeaway-replacement section (SCOPED 2026-06-01; partly blocked on user curation).** New section on the Cook tab titled **"There's Rice at Home"** (intentional UK meme — parents refusing takeaway because "there's rice at home"). Surfaces hand-curated recipes positioned as alternatives to typical takeaway choices: burger, pizza, wrap, curry, chinese, thai, etc. Distinct from the existing Cook tab groupings (expiring / safe / high-protein) by being explicitly categorised against the *takeaway* a user would otherwise order. Decisions: **A1** (section lives on Cook tab — `PlannerView.jsx` — after existing groupings, not a new tab; keeps tab strip at 6 and Cook tab as the "what to eat" surface), **B1** (identify via `recipes.tags` jsonb with convention `takeaway:<category>` — burger / pizza / wrap / curry / chinese / thai / etc.; no schema migration since `tags` is already jsonb), **C1** (Max curates the recipe list manually — finds recipes worth tagging and shares them out-of-band; no auto-derivation from prep_time/cuisine because precision matters more than coverage for this surface), **D1** (filter to currently cookable recipes via existing `makeability` from `lib/recipe-match.js` so the section is actionable, not aspirational), **E1** (group rendering by takeaway category with recipe-count badge per group; sort by makeability score descending within each group), **F1** (hide the section entirely when no tagged recipes exist — avoids confusion before curation lands; once first recipe is tagged, section appears automatically). New helper `takeawayCategoryFor(recipe)` in `lib/recipe-match.js` that parses the `takeaway:X` tag prefix; section component co-located in `PlannerView.jsx` or as `components/TakeawayReplacements.jsx` if it grows past ~50 lines. Tag convention deliberately namespaced (`takeaway:X`) so future tag categories can coexist on the same `tags` array. **Precondition:** Max provides the seed recipe list (5–10 to start; can grow). Until then, the section is silent. ~80–120 lines of code; the curation work is the rate-limiter, not the build.

**#9 — "Got 5 mins?" prep-ahead suggestions (CODE SHIPPED 2026-06-02 — see Completed; section silent until `prep_steps` curated).** New section on the Cook tab that surfaces 5 small mise-en-place prep tasks (chop the onion, make the harissa paste, defrost the chicken, mix the spice rub) you could knock off in 5 minutes to get ahead on an upcoming meal. Pure productivity nudge — turns "I have 5 spare minutes" into "I just prepped tonight's tagine." Decisions: **A1** (new `prep_steps jsonb` column on `recipes`, default `'[]'::jsonb`, array of plain strings — each entry is one short verb-object task like `"Chop the onion"` or `"Mix the harissa paste"`; chosen over deriving-from-`steps` because the existing steps text would over-generate noise like "preheat oven" / "bring to a boil" and over LLM extraction because curation precision matters more than coverage), **B1** (Max curates per recipe — only the recipes you actually want prep-ahead suggestions for need entries; empty array = no suggestions for that recipe), **C1** (recipe scope: currently cookable via existing `makeability` from `lib/recipe-match.js`; **no recently-cooked filter** per explicit decision — repeating prep for a favourite is fine, the user picks what's useful), **D1** (no tracking / no persistence — list is regenerated on every section render; tap-to-dismiss state deferred to a separate item), **E1** (random sample of 5 tasks per render across the pool of cookable-recipe prep_steps, weighted evenly; refresh button on the section header rerolls), **F1** (each suggestion shows the task string + a small subtitle linking to the parent recipe so user knows what it's for), **G1** (section hidden entirely when no cookable recipe has any prep_steps entries — same empty-state pattern as #8). New helper `extractPrepTasks(recipes, pantry, count=5)` in `lib/recipe-match.js` that filters cookable recipes, flattens their `prep_steps` arrays with recipe-id back-pointers, and returns a uniform random sample. Section component lives in `PlannerView.jsx` or `components/PrepSuggestions.jsx` if past ~50 lines. Files: 1-line migration adding `prep_steps jsonb DEFAULT '[]'::jsonb` to `recipes`; `lib/recipe-match.js`; `PlannerView.jsx`. **Precondition:** Max provides initial prep_steps for 5–10 cookable recipes; until then the section is silent. ~80–120 lines + 1 migration. Pairs naturally with [#10] (persistence) and #4 (auto-decrement on cook).

**#10 — Prep-task persistence / dismiss state (DEFERRED 2026-06-02; follow-up to #9).** Once #9 ships and Max uses it for a few days, layer "I already did this prep" memory on top so the same suggestion doesn't keep reappearing within the day. Decisions to revisit at build time: (a) **storage** — localStorage `larder-prep-done` keyed by `<recipeId>:<taskHash>` → ISO timestamp (single-device, free), vs new `prep_done` table in Supabase (multi-device, ~1 migration + sync layer); (b) **dismiss window** — 24h fixed, or until next render of the parent recipe being cooked; (c) **undo affordance** — small "actually no, untap" within ~5s of tapping. Default leaning: localStorage + 24h fixed dismiss + no undo (simplest). Open only after #9 has run long enough to validate the feature is sticky.

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
