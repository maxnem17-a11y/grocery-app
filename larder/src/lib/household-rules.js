// ============================================================
// Household rules — never-restock patterns
// ============================================================
// Static household preference rules. Extracted from index.html
// (L3693 of canonical file) during the Vite migration. In the
// canonical file these live in the embedded <script id="raw-data">
// JSON blob under `household_rules`; moving them to a JS module
// here so the Vite scaffold can consume them without parsing the
// raw-data tag.
//
// Migrating these to Supabase is a separate, deferred decision.
// For now they stay in the source tree — they change rarely and
// are tightly coupled to product-recommendation logic.
//
// Consumers (in the canonical file, will be ported later):
//   - GapsView excluded-candidate filter (~L4060)
//   - GapsView Stat tip text (~L4364)
//   - GapsView excluded-reasons panel (~L4410, L4413)
//   - Mealplanner prompt context (~L2041)
// ============================================================

// `never_restock` is a list of {pattern, reason} entries.
// `pattern` is matched case-insensitively against the product
// name; matched items are excluded from the next-basket
// suggestions. `reason` is surfaced in the UI when the user
// expands the "excluded" filter.
export const HOUSEHOLD_RULES = {
  never_restock: [
    { pattern: "whole milk", reason: "No one drinks dairy milk; oat/soya are defaults." },
    { pattern: "cravendale", reason: "No one drinks dairy milk." },
    { pattern: "semi skimmed milk", reason: "No one drinks dairy milk." },
    { pattern: "skimmed milk", reason: "No one drinks dairy milk." },
  ],
};
