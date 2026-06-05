// ============================================================
// RecipeModalContext — URL-backed "open this recipe" handle
// ============================================================
// Lets any recipe card (Recipes tab rows, Cook-tab micro-list cards,
// Tonight's pick) pop a full-detail modal — a Jira-ticket-style overlay
// — AND gives every recipe a real, shareable URL via a `?recipe=<id>`
// query param. Opening a recipe pushes that param (so it's bookmarkable
// and the browser Back button closes the modal); loading a URL that
// already carries `?recipe=<id>` opens the modal on first paint.
//
// Why a query param (not a path segment): the app is a static SPA served
// from GitHub Pages under /grocery-app/. A query string leaves the path
// untouched, so `/grocery-app/?recipe=<id>` is served by the same
// index.html with no 404-fallback / hash-routing gymnastics.
//
// State shape exposed to consumers:
//   recipeId   — id of the open recipe (or null). Source of truth; the
//                URL mirrors it.
//   snapshot   — the decorated recipe object the in-app caller passed
//                (with _make / _flags / _audience), or null when the
//                modal was opened by id alone (deep link / back-forward).
//                RecipeModal uses the snapshot when present and otherwise
//                resolves the id against RecipesContext and decorates it.
//   openRecipe(decoratedRecipeOrId) — show + push URL
//   closeRecipe()                   — dismiss + restore URL
//
// History model:
//   - open (fresh)      → pushState ?recipe=id   (Back closes the modal)
//   - open while open   → replaceState           (switching ≠ stacking)
//   - close (we pushed) → history.back()         (symmetric with open)
//   - close (deep link) → replaceState (strip param; nothing to pop)
//   - Back/Forward      → popstate syncs recipeId from the URL
// ============================================================

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const RecipeModalContext = createContext({
  recipeId: null,
  snapshot: null,
  openRecipe: () => {},
  closeRecipe: () => {},
});

function paramId() {
  try { return new URLSearchParams(window.location.search).get("recipe"); }
  catch { return null; }
}

export function RecipeModalProvider({ children }) {
  // Seed from the URL so a deep link opens on first paint.
  const [recipeId, setRecipeId] = useState(paramId);
  const [snapshot, setSnapshot] = useState(null);
  // True when the currently-open modal's ?recipe entry was pushed by us
  // this session (so closing can pop it). False for deep-linked opens
  // where there's no pushed entry to return to.
  const pushedByUs = useRef(false);

  const openRecipe = useCallback((rOrId) => {
    if (!rOrId) return;
    const id = typeof rOrId === "string" ? rOrId : rOrId.id;
    if (!id) return;
    setSnapshot(typeof rOrId === "string" ? null : rOrId);
    setRecipeId(id);
    let url;
    try { url = new URL(window.location.href); } catch { return; }
    const already = url.searchParams.get("recipe");
    if (already === id) return;
    url.searchParams.set("recipe", id);
    if (already) {
      // Switching recipes while a modal is already open — replace, don't stack.
      window.history.replaceState({}, "", url);
    } else {
      window.history.pushState({}, "", url);
      pushedByUs.current = true;
    }
  }, []);

  const closeRecipe = useCallback(() => {
    setSnapshot(null);
    setRecipeId(null);
    if (!paramId()) return; // URL already clean
    if (pushedByUs.current) {
      pushedByUs.current = false;
      window.history.back(); // pops our pushed entry; popstate will re-sync
    } else {
      // Deep-linked open: no entry of ours to pop, just strip the param.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("recipe");
        window.history.replaceState({}, "", url);
      } catch { /* no-op */ }
    }
  }, []);

  // Back/Forward: mirror the URL back into state.
  useEffect(() => {
    const onPop = () => {
      pushedByUs.current = false;
      const id = paramId();
      setRecipeId(id);
      setSnapshot(null); // no decorated snapshot survives history; resolve by id
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <RecipeModalContext.Provider value={{ recipeId, snapshot, openRecipe, closeRecipe }}>
      {children}
    </RecipeModalContext.Provider>
  );
}

export function useRecipeModal() {
  return useContext(RecipeModalContext);
}
