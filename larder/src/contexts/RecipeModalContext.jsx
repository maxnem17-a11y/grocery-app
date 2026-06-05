// ============================================================
// RecipeModalContext — app-wide "open this recipe" handle
// ============================================================
// Lets any recipe card (Recipes tab rows, Cook-tab micro-list cards,
// Tonight's pick) pop a full-detail modal — a Jira-ticket-style overlay
// — without prop-drilling an open handler through every list component.
//
// Callers pass the DECORATED recipe object they already have (with
// `_make` / `_flags` / `_audience` from their makeability + allergen
// pass), so the modal renders pantry/missing/eater-safety with no
// recomputation. The stored object is a snapshot taken at open time;
// the modal is short-lived so a pantry change mid-open isn't reflected
// until it's reopened — acceptable for a detail popup.
//
//   openRecipe(decoratedRecipe) — show the modal for that recipe
//   closeRecipe()               — dismiss
//   recipe                      — currently-open recipe, or null
//
// RecipeModal itself is mounted once in AppInner (it needs the App-scope
// cooked log + addCooked callback for its footer "Mark cooked" button).
// ============================================================

import { createContext, useCallback, useContext, useState } from "react";

const RecipeModalContext = createContext({
  recipe: null,
  openRecipe: () => {},
  closeRecipe: () => {},
});

export function RecipeModalProvider({ children }) {
  const [recipe, setRecipe] = useState(null);
  const openRecipe = useCallback((r) => setRecipe(r || null), []);
  const closeRecipe = useCallback(() => setRecipe(null), []);
  return (
    <RecipeModalContext.Provider value={{ recipe, openRecipe, closeRecipe }}>
      {children}
    </RecipeModalContext.Provider>
  );
}

export function useRecipeModal() {
  return useContext(RecipeModalContext);
}
