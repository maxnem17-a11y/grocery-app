# Larder — Project Context for Claude Code

Household grocery intelligence dashboard. Currently mid-migration from a single-file React HTML prototype to a modular Vite project. **The old HTML file is still the source of truth until the new entry point is viable** — we extract from it incrementally.

---

## Stack

- **Build:** Vite (no Tailwind compiler — base utility classes only, see "Constraints" below)
- **UI:** React 18, no router yet
- **Data:** Supabase (PostgREST) — credentials in `CREDENTIALS.md` (gitignored)
- **Deploy:** Static — `index__4_.html` is the live single-file build until the Vite migration is shipped

---

## File map

```
grocery-app/larder/
├── index__4_.html          ← canonical / live file. Source of truth until Vite ships.
├── CREDENTIALS.md          ← Supabase keys. Gitignored. Don't commit.
├── KNOWN_ISSUES.md         ← pre-existing bugs documented, not regressions
├── CLAUDE.md               ← this file
├── index.html              ← Vite entry (smoke-test boot only right now)
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx             ← smoke-test boot page; no real views ported yet
    ├── lib/
    │   ├── supabase.js     ← sbFetch / sbWrite helpers
    │   ├── text.js         ← string normalisation
    │   ├── allergens.js    ← Khalil/Max/Emily filter logic
    │   └── pantry-math.js  ← pure pantry/confidence calculations
    └── components/         ← created as we extract; primitives.jsx is next
```

---

## Migration principles

1. **Incremental extraction, not parallel build.** Pull symbols out of `index__4_.html` one at a time into `src/`. Old file stays the canonical truth.
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

Canonical allergen config: `household_allergens` table in Supabase, surfaced through `AllergensContext` in the live HTML. `src/lib/allergens.js` mirrors the resolution logic.

---

## Known issues (don't "fix" by accident)

See `KNOWN_ISSUES.md`. The almond-milk → tree-nut classification gap is intentional / documented, not a regression.

---

## Current state

**Last verified:** 2026-05-16
**Last commit:** `f36f2ee` — WIP: Vite scaffold + pure-logic module extractions
**Smoke test:** ✅ localhost:5173 boots against live Supabase, all green ticks

### Completed
- Vite scaffold (package.json, vite.config.js, index.html, main.jsx, App.jsx)
- RAW JSON blob pruned in `index__4_.html` (646KB → 414KB)
- `src/components/primitives.jsx` authored (8 named exports). **Not yet imported by Vite scaffold.**
- `src/lib/supabase.js` (~217 lines, sbWrite helper)
- `src/lib/text.js` (~70 lines)
- `src/lib/allergens.js` (~165 lines)
- `src/lib/pantry-math.js` (~135 lines)
- `KNOWN_ISSUES.md`
- `npm run build` green (34 modules)

### Next: Step 7a + 7b
Agreed plan from prior session:

**7a — wire up `primitives.jsx`**
- The file exists; the Vite scaffold doesn't import it yet.
- Add a smoke import in `App.jsx` so `npm run build` proves it parses.
- Zero behaviour change in `index__4_.html`.

**7b — extract `HOUSEHOLD_RULES` from RAW blob**
- Currently `index__4_.html` line ~3693: `const HOUSEHOLD_RULES = RAW.household_rules || { never_restock: [] };`
- 3 consumers in `GapsView` (~lines 4364, 4410, 4413).
- Move to `src/lib/household-rules.js` as a JS const for now. Supabase migration proposed separately, not in scope for 7b.

### Skipped for now
- SKU index (`buildSkuIndex` / `lookupSku` / `TescoSkusContext`) — tightly coupled with views. Extract alongside the first view that consumes them.
- Full `ReceiptsContext` + `mapReceiptRow` + `fetchReceipts` — planned as **Step 7c**, after 7a/7b land.

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
