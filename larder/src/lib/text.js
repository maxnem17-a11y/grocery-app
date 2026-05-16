// ============================================================
// Text normalisation utilities
// ============================================================
// Small, dependency-free helpers for normalising and matching
// English text — primarily ingredient/product names. Extracted
// from index.html (L1029-1042 of canonical file) during the Vite
// migration. Behaviour matches the canonical file exactly.
//
// These live in their own module (rather than inside allergens.js)
// because lc() and hasToken() are used in plenty of places that
// aren't allergen-related (pantry decay, sort comparators, the
// price-index helpers, etc.). Keeping them general makes those
// later extractions natural.
// ============================================================

// Lowercase any value safely. Coerces null/undefined/numbers to "".
// Called constantly — hot path — keep it cheap.
export function lc(s) {
  return (s || "").toString().toLowerCase();
}

// Concatenate the searchable text from an ingredient row: the
// human-readable `item` plus the canonical `pantry_match` key.
// Matching against both means recipes that use a different surface
// form than the pantry's canonical key still get caught.
export function ingredientText(ing) {
  return lc(ing?.item || "") + " " + lc(ing?.pantry_match || "");
}

// Token-level substring match against lowercase text.
//
// - Multi-word tokens are matched as a plain substring (e.g.
//   "soy sauce" must appear contiguously).
// - Single-word tokens use a word-boundary regex with an optional
//   plural suffix, so "bean" matches "bean" / "beans" but not
//   "beanbag" or "edamame".
//
// Caller must lowercase `text` first (we don't — too many hot calls).
// `tok` is assumed lowercase already (allergen tokens come from
// Supabase already-normalised).
export function hasToken(text, tok) {
  if (tok.includes(" ")) return text.includes(tok);
  const re = new RegExp(
    "(^|[^a-z])" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(s|es)?([^a-z]|$)"
  );
  return re.test(text);
}

// Recognise the green-bean family — these are NOT a Khalil-blocked
// "bean" (he can eat them). Used by flagsForRecipe to skip the
// generic `bean` token when the ingredient is specifically a green
// bean. Adding new safe varieties? Append here.
export function isGreenBean(text) {
  return ["green bean", "french bean", "runner bean", "string bean"]
    .some((p) => text.includes(p));
}

// Detect dairy milk specifically — i.e. "milk" with none of the
// plant-milk qualifiers. This is the most safety-critical helper
// here because dairy milk is a Khalil allergen but oat/soya/etc.
// are household defaults. The plant list is conservative on
// purpose: anything we don't recognise as a plant qualifier is
// treated as dairy.
export function isDairyMilk(text) {
  if (!text.includes("milk")) return false;
  const plant = [
    "coconut milk", "almond milk", "oat milk", "soya milk", "soy milk",
    "cashew milk", "hazelnut milk", "rice milk", "hemp milk", "pea milk",
    "plant milk", "plant-milk", "non-dairy milk", "dairy-free milk",
  ];
  return !plant.some((p) => text.includes(p));
}
