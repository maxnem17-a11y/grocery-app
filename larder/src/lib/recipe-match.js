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
// `leverageScore` (canonical L1196) appended in step 7j-1 alongside
// the SuggestedBasket port (its first and currently only consumer).
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

// ============================================================
// Meal-section noise filter (Cook tab redesign)
// ============================================================
// The Cook tab's left-column meal sections (Tonight's pick, Everybody
// eats, Quick wins, Gains) should only surface actual *meals* — not
// condiments, drinks, 2-hour marmalades, or other non-dinner recipes.
// `isNoiseRecipe` is the section-level gate: a recipe is noise if it
// takes too long to be a weeknight option (>90 min total) OR carries a
// tag that marks it as not-a-meal.
//
// The spec's literal exclusion list is condiment/drink/remedy/syrup/
// marmalade/sweet-only; NOISE_TAGS maps that intent onto the tags that
// actually exist in the recipes data (e.g. `winter-remedy` for remedy,
// `jam`/`preserve` for marmalade, `sweet`/`dessert` for sweet-only) plus
// the obvious make-ahead-component tags (rubs, marinades, spice blends)
// that share the same "not a dinner" character.
export const NOISE_TAGS = new Set([
  "condiment", "drink", "remedy", "winter-remedy", "syrup", "marmalade",
  "jam", "preserve", "sweet-only", "sweet", "dessert", "spice-blend",
  "seasoning", "dry-rub", "wet-rub", "marinade", "hot-sauce", "ketchup",
  "starter-culture",
]);

export function totalTime(r) {
  return (r.prep_time_mins || 0) + (r.cook_time_mins || 0);
}

export function isNoiseRecipe(r) {
  if (totalTime(r) > 90) return true;
  const tags = Array.isArray(r.tags) ? r.tags : [];
  return tags.some(t => NOISE_TAGS.has(String(t).toLowerCase()));
}

// leverageScore — verbatim port of canonical L1196–1246. Appended in
// step 7j-1 alongside SuggestedBasket extraction.
//
// For each missing ingredient across all not-yet-makeable recipes
// (baseline pct < 70), list every recipe it appears in and the
// makeability boost it would give each one. Ranked by recipe_count
// (broadest impact) then average boost. Returns the top `limit`
// rows (or all if limit is falsy).
//
// Returned per-ingredient row:
//   {
//     ingredient, key, recipeCount, unlockedTo70, avgBoost,
//     unlockedRecipes: [{name, before, after, id}],
//     unlocks, mentions  (back-compat aliases for the planner caller)
//   }
export function leverageScore(recipes, matchSet, limit) {
  const baseline = recipes.map(r => makeability(r, matchSet).pct);
  const ingMap = new Map(); // key -> { label, recipes: [{name, before, after, id}] }
  recipes.forEach((r, idx) => {
    if (baseline[idx] >= 70) return; // recipe already makeable; skip
    const m = makeability(r, matchSet);
    // Unique missing keys for this recipe
    const missingKeys = new Set();
    for (const i of m.missing) {
      const mm = (i.pantry_match || i.item || "").toLowerCase().trim();
      const cm = mm.replace(/\s*\(.*?\)\s*/g, "").trim();
      if (!cm) continue;
      if (missingKeys.has(cm)) continue;
      missingKeys.add(cm);
      const label = i.pantry_match || i.item;
      // Compute the after-% if we had this ingredient
      const augmented = new Set(matchSet); augmented.add(cm);
      const after = makeability(r, augmented).pct;
      if (!ingMap.has(cm)) ingMap.set(cm, { label, recipes: [] });
      ingMap.get(cm).recipes.push({
        name: r.name,
        before: baseline[idx],
        after,
        id: r.id,
      });
    }
  });
  const out = [];
  for (const [key, v] of ingMap.entries()) {
    const recipeCount = v.recipes.length;
    const unlockedTo70 = v.recipes.filter(r => r.after >= 70).length;
    const avgBoost = Math.round(v.recipes.reduce((s, r) => s + (r.after - r.before), 0) / recipeCount);
    const sortedRecipes = v.recipes.slice().sort((a, b) => b.after - a.after);
    out.push({
      ingredient: v.label,
      key,
      recipeCount,
      unlockedTo70,
      avgBoost,
      unlockedRecipes: sortedRecipes,
      // Back-compat fields for the planner caller
      unlocks: unlockedTo70,
      mentions: recipeCount,
    });
  }
  out.sort((a, b) => b.recipeCount - a.recipeCount || b.avgBoost - a.avgBoost);
  return limit ? out.slice(0, limit) : out;
}

// extractPrepGroups — backlog #9 ("Got 5 mins?" prep-ahead suggestions).
//
// Collects mise-en-place prep tasks from recipes, grouped by recipe:
// returns an array of `{ recipeId, recipeName, pct, tasks: string[] }` in
// random order. Grouping (rather than a flat task sample) lets the
// Cook-tab section show clearly which steps belong to which dish, and lets
// the UI reveal more groups ("Show more") without rerolling.
//
// `minPct` is the makeability floor — only recipes you already have at
// least this % of ingredients for are included (driven by the section's
// "Min makeable %" slider). PREP_COOKABLE_PCT (70) is the "can make right
// now" reference but is no longer hardcoded as the gate. Each qualifying
// recipe with ≥1 non-empty prep_steps entry becomes one group, carrying
// its makeability `pct` so the UI can show it. The groups are Fisher-Yates
// shuffled so a reroll surfaces a varied set; the full list is returned
// and the component slices it for the visible window.
//
// `outOfStock` is the Set of item names flagged out; it's passed through
// to pantryMatchSet so out-of-stock items don't count toward makeability.
export const PREP_COOKABLE_PCT = 70;

export function extractPrepGroups(recipes, pantry, outOfStock, minPct = 0) {
  const matchSet = pantryMatchSet(pantry, outOfStock);
  const groups = [];
  for (const r of recipes) {
    const steps = Array.isArray(r.prep_steps) ? r.prep_steps : [];
    if (!steps.length) continue;
    const pct = makeability(r, matchSet).pct;
    if (pct < minPct) continue;
    const tasks = steps
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean);
    if (tasks.length) groups.push({ recipeId: r.id, recipeName: r.name, pct, tasks });
  }
  // Fisher-Yates shuffle the whole list so each reroll varies which
  // recipes lead; the component decides how many groups to show.
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  return groups;
}
