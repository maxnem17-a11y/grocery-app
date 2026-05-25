// ============================================================
// RecipesContext — recipes state + updateRecipePage mutation
// ============================================================
// Created in step 7g/7h: replaces the module-level `let RECIPES`
// + `getRecipes`/`setRecipes` shape that lived in
// `src/lib/recipes.js` (steps 7e–7f). Module-level mutable state
// worked while AuditView was the only consumer, but PlannerView
// (the second consumer, landing in 7g) needs the same re-render
// behaviour without an external `recipesVersion` integer being
// hand-passed down the tree.
//
// Hook return shape:
//   {
//     recipes:          mapped recipe rows (oldest-first by name)
//     updateRecipePage: async (recipeId, page, opts?) => void
//     version:          integer bumped on every successful mutation
//                       (still useful for consumers that key useMemos
//                        on it — AuditView's page-coverage rollup does)
//     loading:          true until the first fetch resolves
//     error:            Error instance if fetch failed, else null
//   }
//
// updateRecipePage semantics mirror canonical index.html L5793
// EXACTLY (the verbatim-port discipline from 7d/7e):
//   1. Look up the recipe in current state. If missing, warn + return.
//   2. Coerce input (null/empty/0/negative → null; positive int → that int).
//   3. No-op if prevPage === nextPage.
//   4. Optimistic local update: new recipes array with target row's
//      source.page mutated + version bump.
//   5. Fire PATCH in background.
//   6. On error: rollback (rebuild array with prevPage) + version bump
//      + call opts.onError(err).
//
// Boot fetch + mapping move INTO this provider (out of App.jsx),
// matching the 7c/7e ReceiptsProvider + AllergensProvider pattern.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchRecipes, mapRecipeRow, patchRecipeRow } from "../lib/supabase.js";

const RecipesContext = createContext({
  recipes: [],
  updateRecipePage: async () => {},
  version: 0,
  loading: true,
  error: null,
});

export function RecipesProvider({ children }) {
  const [recipes, setRecipesState] = useState([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ref mirror of `recipes` so updateRecipePage can read the current
  // state synchronously — `setState(updater)` in React 18 is async
  // (the updater is queued, not run immediately), so we cannot rely
  // on it to snapshot the current state for the initial recipe
  // lookup. The ref + sync effect pattern mirrors the canonical
  // file's behaviour where `RECIPES` was a module global read on
  // every access.
  const recipesRef = useRef(recipes);
  useEffect(() => { recipesRef.current = recipes; }, [recipes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchRecipes();
        if (cancelled) return;
        setRecipesState((rows || []).map(mapRecipeRow));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.error("fetchRecipes failed:", e);
        setError(e);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Verbatim port of canonical L5793 updateRecipePage — see file
  // header for the step-by-step shape. The key behaviour the
  // verbatim port preserves: setState happens BEFORE the PATCH
  // fires, and the rollback path bumps version a second time so
  // consumers' useMemos re-evaluate.
  const updateRecipePage = useCallback(async (recipeId, page, opts) => {
    const onError = (opts && opts.onError) || null;
    // 1. Lookup via recipesRef (synchronous read of current state).
    const recipe = recipesRef.current.find(r => r.id === recipeId);
    if (!recipe) {
      console.warn(`updateRecipePage: no recipe with id ${recipeId}`);
      return;
    }
    // 2. Coerce input. Treat null/empty/0/negative as "clear the page".
    let nextPage = null;
    if (page !== null && page !== undefined && page !== "") {
      const n = parseInt(page, 10);
      if (!isNaN(n) && n > 0) nextPage = n;
    }
    const prevPage = recipe.source && recipe.source.page;
    if (prevPage === nextPage) return; // no-op
    // 3. Optimistic local update via functional setter (so we always
    //    map against the latest state at update time, not whatever
    //    recipesRef happened to be at call time).
    setRecipesState(prev => prev.map(r => r.id === recipeId
      ? { ...r, source: { ...(r.source || {}), page: nextPage } }
      : r));
    setVersion(v => v + 1);
    // 4. Fire PATCH in background.
    try {
      await patchRecipeRow(recipeId, { source_page: nextPage });
    } catch (err) {
      console.error(`Failed to sync source_page for recipe ${recipeId}:`, err);
      // Roll back the local change.
      setRecipesState(prev => prev.map(r => r.id === recipeId
        ? { ...r, source: { ...(r.source || {}), page: prevPage } }
        : r));
      setVersion(v => v + 1);
      if (onError) onError(err);
    }
  }, []);

  return (
    <RecipesContext.Provider value={{ recipes, updateRecipePage, version, loading, error }}>
      {children}
    </RecipesContext.Provider>
  );
}

export function useRecipes() {
  return useContext(RecipesContext);
}
