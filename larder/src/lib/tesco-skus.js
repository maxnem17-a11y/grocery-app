// ============================================================
// Tesco SKU index — basket-key → SKU resolution helpers
// ============================================================
// Verbatim extraction of canonical index.html L727-740
// (buildSkuIndex), L758-800 (lookupSku), L810-813
// (tescoSearchUrl), L4051-4066 (neverRestockReason). Step 7j-1.
//
// Used by:
//   - TescoSkusContext (Provider runs buildSkuIndex on the
//     fetched rows once)
//   - SuggestedBasket (lookupSku for each basket item's SKU
//     resolution; tescoSearchUrl for fallback click target;
//     neverRestockReason for household-rule filtering)
//   - GapsView regulars table (when 7j-2 lands)
//
// The skuIndex shape: { byKey: Map, byTescoName: Map, all: [] }.
// Default empty shape lives in TescoSkusContext so consumers
// don't crash pre-boot — see canonical L820 + L815-819 comment.
// ============================================================

import { HOUSEHOLD_RULES } from "./household-rules.js";

export function buildSkuIndex(rows) {
  const byKey = new Map();
  const byTescoName = new Map();
  const all = [];
  for (const r of (rows || [])) {
    if (!r.basket_key) continue;
    const nKey = String(r.basket_key).trim().toLowerCase();
    const nName = r.tesco_name ? String(r.tesco_name).trim().toLowerCase() : "";
    byKey.set(nKey, r);
    if (nName) byTescoName.set(nName, r);
    all.push({ nKey, nName, row: r });
  }
  return { byKey, byTescoName, all };
}

// Tiered SKU lookup. Walks three tiers and stops at the first hit:
//
//   1. Direct match on basket_key — fastest, catches normalised pantry names
//   2. Direct match on tesco_name — catches raw Tesco receipt names that
//      exactly match the seeded product name
//   3. Substring match — catches pack-size variants and partial matches in
//      either direction (e.g. "Tesco 2 Boneless Salmon Fillets 260G" against
//      seeded basket_key "salmon fillets"). For substring, we prefer the
//      basket_key match over the tesco_name match because basket_key is
//      shorter and more canonical — less risk of accidental cross-match.
//
// Returns the SKU row or null. The skuIndex parameter accepts either the new
// structured form ({byKey, byTescoName, all}) or — for backwards compat —
// a plain Map (which gets treated as byKey-only). Old callers that built
// their own Map (none currently, but the receipts pattern allowed it) keep
// working.
export function lookupSku(name, skuIndex) {
  if (!name || !skuIndex) return null;
  const n = String(name).trim().toLowerCase();
  if (!n) return null;

  // Backwards-compat: a plain Map (the pre-tier-fix shape) only has byKey.
  if (skuIndex instanceof Map) {
    return skuIndex.get(n) || null;
  }

  // Tier 1: exact match on basket_key
  const byKey = skuIndex.byKey && skuIndex.byKey.get(n);
  if (byKey) return byKey;

  // Tier 2: exact match on tesco_name
  const byName = skuIndex.byTescoName && skuIndex.byTescoName.get(n);
  if (byName) return byName;

  // Tier 3: substring match. Score by overlap length so we pick the most
  // specific match when multiple candidates contain the query string.
  // basket_key matches win ties because they're shorter / more canonical.
  let best = null;
  for (const entry of (skuIndex.all || [])) {
    let overlap = 0;
    let kind = null;
    if (entry.nKey && (n.includes(entry.nKey) || entry.nKey.includes(n))) {
      overlap = Math.min(n.length, entry.nKey.length);
      kind = "key";
    }
    if (entry.nName && (n.includes(entry.nName) || entry.nName.includes(n))) {
      const o2 = Math.min(n.length, entry.nName.length);
      // Prefer basket_key match in ties (kind === "key" wins on equal overlap)
      if (o2 > overlap || (o2 === overlap && kind !== "key")) {
        overlap = o2;
        kind = "name";
      }
    }
    if (kind && (!best || overlap > best.overlap)) {
      best = { row: entry.row, overlap, kind };
    }
  }
  return best ? best.row : null;
}

// Build a Tesco search URL for items without a seeded SKU. Used as the
// fallback so every basket item is at least clickable, even if the
// destination is a search results page rather than a product page.
// Leverage ingredients (recipe items like "green chilli", "rapeseed oil")
// won't be in tesco_skus until a future seeding pass — meanwhile this gives
// the user a one-click path to find and add them manually, and gives the
// Claude-in-Chrome export flow a fallback URL it can search-and-confirm
// against (rather than silently dropping the item).
export function tescoSearchUrl(name) {
  if (!name) return null;
  return `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(String(name).trim())}`;
}

// Household-rules: should this product be excluded from "restock" suggestions?
//
// Two sources, checked in order:
//   1. tesco_skus.household_rule_excluded (DB-driven, per-basket-key) — added
//      in Step 2 of the basket automation. Authoritative when present because
//      it's tied to a specific Tesco SKU rather than a regex pattern.
//   2. HOUSEHOLD_RULES.never_restock patterns from RAW (regex on the name) —
//      the original source, kept for backwards compatibility and for items
//      not yet seeded into tesco_skus.
export function neverRestockReason(name, skuIndex) {
  const n = (name || "").toLowerCase();
  // 1) DB-driven: check tesco_skus for this exact basket_key.
  if (skuIndex) {
    const sku = lookupSku(name, skuIndex);
    if (sku && sku.household_rule_excluded) {
      return "household rule (SKU-level)";
    }
  }
  // 2) Regex patterns from RAW.household_rules.
  for (const r of (HOUSEHOLD_RULES.never_restock || [])) {
    if (n.includes(r.pattern)) return r.reason;
  }
  return null;
}
