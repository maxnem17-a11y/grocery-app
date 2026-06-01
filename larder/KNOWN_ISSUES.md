# Known issues

Data-quality and behaviour discrepancies surfaced during the Vite
migration that are **not** regressions — they exist in the canonical
`index.html` too. Tracked here so they don't get lost and so we can
fix them deliberately rather than during a behaviour-preserving
extraction commit.

---

## ~~1. `khalilAllergenFlag("almond milk")` returns `"tree nut"`, not `"dairy"`~~ — RESOLVED 2026-06-01 (`a42047d`)

The original framing was wrong: `"almond milk"` → `"tree nut"` is the
correct outcome for Khalil (almond is his tree-nut trigger). The real
bug was the *adjacent* gap — plain `"whole milk"` returned `null`
because the dairy token list has no bare `"milk"` entry (would
over-flag plant milks).

Fixed by calling the existing `isDairyMilk(n)` helper inside the
dairy branch of `khalilAllergenFlag`'s category loop
(`src/lib/allergens.js`). `isDairyMilk` already excludes plant milks,
so `"almond milk"` still flows through to `tree_nuts` and `"oat milk"`
still returns `null` (household-safe).

See the 2026-06-01 entry in `CLAUDE.md` Completed for the full trace.
