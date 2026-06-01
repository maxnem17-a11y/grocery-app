// ============================================================
// Allergen logic
// ============================================================
// The most safety-critical pure logic in the dashboard.
// Extracted from index.html (L827-848, L1023-1085, L3998-4036
// of canonical file) during the Vite migration. Behaviour
// matches the canonical file exactly.
//
// Source of truth: the household_allergens table in Supabase,
// fetched at boot via fetchHouseholdAllergens() and threaded
// through AllergensContext. buildAllergensConfig() turns the
// flat table rows into the nested shape consumers expect.
//
// Two main entry points:
//   - flagsForRecipe(recipe, allergens) → per-eater flags + reasons
//     used by recipe cards and meal suggestions.
//   - khalilAllergenFlag(name, allergens) → single string label
//     ("wheat", "dairy", "tree nut", etc.) or null; used for
//     pantry items and basket entries where we just want the
//     category name, not a full reason list.
// ============================================================

import { lc, hasToken, isGreenBean, isDairyMilk, ingredientText } from "./text.js";

// Default shape used as a safe fallback before the boot fetch
// resolves, or if a caller passes a malformed config. Treating
// "nothing is blocked" as the default is correct because the UI
// renders allergen warnings rather than hiding ingredients — a
// missed warning is bad, but a spurious warning during boot is
// worse (false alarms erode trust in real ones).
export const EMPTY_ALLERGENS = {
  khalil: { block: [], uncertain: [], safe: [], blockByCategory: {} },
  max: { block: [] },
  emily: { block: [] },
};

// ============================================================
// buildAllergensConfig
// ============================================================
// Turn flat household_allergens rows (one row per eater × kind ×
// token, with an optional `category` for Khalil's block list) into
// the nested config shape the matchers expect.
//
// Categories (`wheat`, `dairy`, `eggs`, `beef`, `tree_nuts`,
// `legumes`, `avocado`) are derived from the DB rather than
// hardcoded — adding a new category in Supabase Just Works.
// ============================================================
export function buildAllergensConfig(rows) {
  const cfg = {
    khalil: { block: [], uncertain: [], safe: [], blockByCategory: {} },
    max: { block: [] },
    emily: { block: [] },
  };
  for (const r of (rows || [])) {
    if (!cfg[r.eater]) continue;
    if (r.kind === "block") {
      cfg[r.eater].block.push(r.token);
      if (r.eater === "khalil" && r.category) {
        if (!cfg.khalil.blockByCategory[r.category]) cfg.khalil.blockByCategory[r.category] = [];
        cfg.khalil.blockByCategory[r.category].push(r.token);
      }
    } else if (r.kind === "uncertain" && r.eater === "khalil") {
      cfg.khalil.uncertain.push(r.token);
    } else if (r.kind === "safe_phrase" && r.eater === "khalil") {
      cfg.khalil.safe.push(r.token);
    }
  }
  return cfg;
}

// ============================================================
// flagsForRecipe
// ============================================================
// Tag a recipe's ingredients against each eater's allergen list.
// Returns { khalil, khalilReason, khalilUncertain, max, maxReason,
// emily, emilyReason } — `*Reason` are arrays of human-readable
// strings explaining why an eater is blocked, used by recipe cards
// to surface "blocked because: butter (dairy), egg (egg)" etc.
//
// Falls back to EMPTY_ALLERGENS if config is malformed/missing —
// see the 14.6 white-screen postmortem in the canonical comments.
// ============================================================
export function flagsForRecipe(recipe, allergens) {
  // Validate shape rather than just truthiness — see khalilAllergenFlag
  // for the rationale (14.6 white-screen postmortem).
  const a = (allergens && typeof allergens === "object" && allergens.khalil)
    ? allergens : EMPTY_ALLERGENS;
  const flags = {
    khalil: "safe", khalilReason: [], khalilUncertain: [],
    max: "safe", maxReason: [],
    emily: "safe", emilyReason: [],
  };
  const wheatTokens = new Set(a.khalil.blockByCategory?.wheat || []);
  for (const ing of recipe.ingredients || []) {
    const txt = ingredientText(ing);
    const glutenFree = txt.includes("gluten free") || txt.includes("gluten-free") || txt.includes("free from");
    let blockedThis = false;
    if (isDairyMilk(txt)) { flags.khalil = "blocked"; flags.khalilReason.push(`${ing.item} (dairy milk)`); blockedThis = true; }
    const greenBean = isGreenBean(txt);
    if (!blockedThis) {
      for (const tok of a.khalil.block) {
        if (["butter", "cream", "milk"].includes(tok) && a.khalil.safe.some((sp) => txt.includes(sp))) continue;
        if (tok === "bean" && greenBean) continue;
        // Per-ingredient gluten-free exemption: skip wheat-category tokens
        // if the ingredient name explicitly says gluten-free / free-from.
        // Mirrors the khalilAllergenFlag regex behaviour for product names.
        if (glutenFree && wheatTokens.has(tok)) continue;
        if (hasToken(txt, tok)) { flags.khalil = "blocked"; flags.khalilReason.push(`${ing.item} (${tok})`); break; }
      }
    }
    for (const tok of a.khalil.uncertain) {
      if (hasToken(txt, tok)) { flags.khalilUncertain.push(`${ing.item} (${tok})`); if (flags.khalil === "safe") flags.khalil = "check"; }
    }
    for (const tok of a.max.block) if (hasToken(txt, tok)) { flags.max = "blocked"; flags.maxReason.push(`${ing.item} (${tok})`); break; }
    for (const tok of a.emily.block) if (hasToken(txt, tok)) { flags.emily = "blocked"; flags.emilyReason.push(`${ing.item} (${tok})`); break; }
  }
  return flags;
}

// ============================================================
// audienceFromFlags
// ============================================================
// Collapse a flags object into the audience tag used in meal
// suggestions and recipe cards: "whole-household" / "check" /
// "adults-only". Driven by Khalil's status because his allergen
// list is the binding constraint; Max and Emily's restrictions
// are handled separately by their respective `*Reason` arrays.
// ============================================================
export function audienceFromFlags(f) {
  if (f.khalil === "safe") return "whole-household";
  if (f.khalil === "check") return "check";
  return "adults-only";
}

// ============================================================
// khalilAllergenFlag
// ============================================================
// Single-string allergen category for a product name (not a recipe
// ingredient list). Returns "wheat", "dairy", "eggs", "beef",
// "tree nut", "legumes", "avocado", or null.
//
// The disambiguation rules (gluten-free exemption, butterhead /
// butternut squash / coconut+peanut "butter" exceptions) are
// preserved from the original regex-based implementation — they're
// nuances about English product naming, not allergen facts, so
// they live in code rather than the DB.
//
// Category check order matters and is preserved from the canonical
// audit: wheat → dairy → eggs → beef → tree_nuts → legumes →
// avocado. See inline comment below for why.
// ============================================================
export function khalilAllergenFlag(name, allergens) {
  if (!name) return null;
  // Validate shape rather than just truthiness — a non-config truthy value
  // (e.g. a number passed in the wrong arg position) used to white-screen
  // the app in 14.5. Now we degrade to EMPTY_ALLERGENS instead.
  const a = (allergens && typeof allergens === "object" && allergens.khalil)
    ? allergens : EMPTY_ALLERGENS;
  const n = name.toLowerCase();
  const cats = a.khalil.blockByCategory || {};

  // Gluten-free / free-from products are exempt from the wheat category.
  const glutenFree = n.includes("gluten free") || n.includes("gluten-free") || n.includes("free from");

  // Tokens we explicitly do NOT want to flag as dairy even though they
  // contain the substring "butter"/"milk"/"cream". Sourced from the
  // khalil safe_phrases list + a couple of name-disambiguation cases
  // (butternut squash, butterhead lettuce).
  const dairyExceptions = [...(a.khalil.safe || []), "butternut", "butterhead"];
  const looksDairyExempt = dairyExceptions.some((p) => n.includes(p));

  // Categories are checked in priority order — wheat before legumes (so
  // "kidney bean pasta" still gets flagged), dairy before tree-nuts so
  // cow's milk doesn't fall through, etc. Preserve the original audit
  // ordering.
  const order = ["wheat", "dairy", "eggs", "beef", "tree_nuts", "legumes", "avocado"];
  for (const cat of order) {
    // The dairy token list intentionally has no bare "milk" entry (it
    // would over-flag plant milks). Use isDairyMilk() so plain "whole
    // milk" gets caught while "almond milk" / "oat milk" fall through
    // to their real category (tree nut / household-safe).
    if (cat === "dairy" && !looksDairyExempt && isDairyMilk(n)) return "dairy";
    const tokens = cats[cat] || [];
    for (const tok of tokens) {
      if (!hasToken(n, tok)) continue;
      // Per-category exemptions
      if (cat === "wheat" && glutenFree) continue;
      if (cat === "dairy" && looksDairyExempt) continue;
      // Map internal category name to display label (matches old return values)
      return cat === "tree_nuts" ? "tree nut" : cat;
    }
  }
  return null;
}
