// ============================================================
// Recipes — module-level state
// ============================================================
// Verbatim extraction of the `let RECIPES = []` + `setRecipes`
// pattern from canonical index.html L1160–1161 during step 7e.
//
// AuditView (and, in the canonical file, every other recipe-
// consuming view: PlannerView, RecipesView, SuggestedBasket)
// reads from the same module-level RECIPES binding by closure.
// `getRecipes()` wraps the read so the variable stays internal
// to this file and consumers don't accidentally re-bind it.
//
// Mutation flow:
//   1. App.jsx boot fetch:
//        const rows = await fetchRecipes();
//        setRecipes(rows.map(mapRecipeRow));
//   2. App.jsx updateRecipePage callback (optimistic page-num edit):
//        setRecipes(getRecipes().map(r => r.id === recipeId
//          ? { ...r, source: { ...(r.source||{}), page: nextPage } }
//          : r));
//        setRecipesVersion(v => v + 1);   // forces re-render in
//                                          // consumers whose useMemo
//                                          // deps include
//                                          // recipesVersion.
//
// ── Refactor target (logged as step 7h) ──
// Module-level mutable state is a JS-idiomatic but anti-React
// shape; it works fine while there's a single consumer (AuditView)
// but a second consumer would invite stale-render bugs (each
// consumer would need its own recipesVersion threading). When that
// second consumer is being ported, convert this file into a
// `RecipesContext` (mirror of `ReceiptsContext` / `AllergensContext`)
// and migrate AuditView in the same step.
// ============================================================

let RECIPES = [];

export function setRecipes(arr) {
  RECIPES = arr;
}

export function getRecipes() {
  return RECIPES;
}
