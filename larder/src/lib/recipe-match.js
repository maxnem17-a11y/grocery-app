// ============================================================
// Recipe matching — pantry ↔ recipe ingredient resolution
// ============================================================
// Verbatim extraction of pantryMatchSet (canonical L1163–1182)
// and makeability (canonical L1184–1195) during step 7g.
//
// Pure functions, no React dependency. Used by PlannerView's
// makeability rankings; future consumers (RecipesView,
// SuggestedBasket) will share this code.
//
// `pantryMatchSet` builds a lowercase Set of pantry item names
// (plus parenthetical-stripped variants), then unions in a small
// list of implicit-staple items the household always has on hand
// (salt, pepper, oil, water, etc.). The Set is the haystack a
// recipe's ingredient list searches against.
//
// `makeability` returns `{ pct, have, missing }` for a single
// recipe given the matchSet. pct rounds to the nearest integer.
// Ingredient resolution tries both the raw `pantry_match` (or
// fallback to `item`) and its parenthetical-stripped form, so
// "tomatoes (vine)" matches a pantry entry for "tomatoes".
//
// `leverageScore` (canonical L1196+) is NOT extracted yet — only
// SuggestedBasket uses it, and that view is deferred behind
// TescoSkusContext. Add when SuggestedBasket lands.
// ============================================================

import { lc } from "./text.js";

export function pantryMatchSet(pantry, alsoOut) {
  const s = new Set();
  for (const p of pantry) {
    if (alsoOut && alsoOut.has(p.item)) continue;
    const k = lc(p.item).trim();
    s.add(k);
    s.add(k.replace(/\s*\(.*?\)\s*/g, "").trim());
  }
  // Implicit-staples: ingredients assumed present even if not listed in pantry JSON.
  // Includes common name variants so recipe ingredient strings match correctly.
  for (const x of [
    "salt", "sea salt", "flaked sea salt", "fine sea salt",
    "pepper", "black pepper", "ground black pepper", "white pepper",
    "water",
    "sugar", "caster sugar", "granulated sugar", "brown sugar", "muscovado sugar", "icing sugar",
    "olive oil", "extra virgin olive oil",
    "vegetable oil", "rapeseed oil", "sunflower oil", "groundnut oil", "oil",
    "peanut butter",
  ]) s.add(x);
  return s;
}

export function makeability(recipe, matchSet) {
  const ings = recipe.ingredients || [];
  if (!ings.length) return { pct: 0, have: [], missing: [] };
  const have = [], missing = [];
  for (const i of ings) {
    const match = (i.pantry_match || i.item || "").toLowerCase().trim();
    const cleanMatch = match.replace(/\s*\(.*?\)\s*/g, "").trim();
    if (matchSet.has(match) || matchSet.has(cleanMatch)) have.push(i);
    else missing.push(i);
  }
  return { pct: Math.round(100 * have.length / ings.length), have, missing };
}
