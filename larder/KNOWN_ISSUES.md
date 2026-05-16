# Known issues

Data-quality and behaviour discrepancies surfaced during the Vite
migration that are **not** regressions — they exist in the canonical
`index.html` too. Tracked here so they don't get lost and so we can
fix them deliberately rather than during a behaviour-preserving
extraction commit.

---

## 1. `khalilAllergenFlag("almond milk")` returns `"tree nut"`, not `"dairy"`

**Discovered:** 16 May 2026, during Step 6b smoke-testing.

**Symptom:** The boot smoke test originally expected `"dairy"` for
"almond milk". Live data returns `"tree nut"`.

**Root cause:** The `dairy` category in `household_allergens` contains
18 specific tokens (cheese, butter, cream, yoghurt, ghee, paneer,
mozzarella, parmesan, etc.) but **no `milk` token**. The
`khalilAllergenFlag` function iterates categories in priority order
(wheat → dairy → eggs → beef → tree_nuts → legumes → avocado); when
checking "almond milk":

1. Wheat: no match
2. Dairy: none of the 18 tokens match
3. Tree_nuts: `"almond"` matches → returns `"tree nut"`

The companion function `isDairyMilk()` (in `src/lib/text.js`) was
written specifically to detect "milk" without plant qualifiers, but
it's only called by `flagsForRecipe`, not by `khalilAllergenFlag`.

**User-visible impact:** Low. Khalil is still correctly blocked from
almond milk — the flag is just labelled "tree nut" rather than
"dairy". For a pantry item like Cravendale or plain "whole milk",
the same gap means `khalilAllergenFlag` would return `null` — that's
the actual safety concern, though in practice the household doesn't
buy dairy milk so it hasn't come up.

**Fix candidates (for a separate commit, not migration scope):**

- **A.** Add a `milk` token to the `dairy` category in
  `household_allergens`, plus a `dairy_exception` mechanism for
  plant milks (parallel to the existing `safe_phrase` rows). Most
  data-driven; matches the design philosophy of keeping allergen
  facts in the DB.
- **B.** Call `isDairyMilk(name)` inside `khalilAllergenFlag` before
  the category loop, returning `"dairy"` if true. Code-side fix;
  duplicates logic that already exists for `flagsForRecipe`.
- **C.** Both: data-side `milk` token plus a code-side exemption
  using the existing `safe_phrase` rows (oat milk, soya milk, etc.).

Decision deferred until we extract recipes/pantry views — easier to
reason about with the full picture in front of us.
