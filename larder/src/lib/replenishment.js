// ============================================================
// Replenishment — match receipt items against pantry rows
// ============================================================
// Pure function. Takes parsed-receipt items + current pantry +
// delivery_date; returns three buckets:
//   - matched:   { receiptItem, pantryRow }              — auto-apply
//   - ambiguous: { receiptItem, candidates: [pantryRow] } — needs a pick
//   - unmatched: { receiptItem }                          — no candidate
//
// Matching strategy (decision A2):
//   1. PANTRY_KEYWORDS dict (lib/pricing.js) first — curated label map
//      catches the canonical naming shifts ("oat drink" → "oat milk").
//   2. Token-subset substring fallback for everything else: tokenise
//      both sides, drop pack-size noise + stopwords, plural-strip
//      trailing 's' on tokens ≥4 chars, and accept a pantry item
//      whose tokens are a subset of the receipt-item tokens.
//
// Skip rules (decision D1):
//   - status='unavailable' receipt items are never delivered → skip.
//   - Pantry rows where purchased >= delivery_date are already at or
//     past this order → skip them as candidates (preserves manual
//     edits made between order ingest and replenishment).
//
// Substitutions (decision C1):
//   - Match the substitute name (item.name is the delivered product).
//     The receipt parser already populates `name` with the substitute
//     when status='substituted'; substituted_for holds the original.
// ============================================================

import { findPantryMatch } from "./pricing.js";

const MIN_TOKEN_LEN = 2;

// Stopwords + standalone pack-size words. The pack-size regex below
// catches "500g"/"4 Pack"; this Set catches the bare standalone token
// after that's stripped.
const NOISE_TOKENS = new Set([
  "pack", "pk", "each", "x",
  "the", "and", "with", "for", "of", "on", "to", "in",
]);

function tokenise(name) {
  let s = (name || "").toLowerCase();
  s = s.replace(/[†‡*]/g, " ");
  // Pack-size patterns: "520g", "1.5kg", "4 Pack", "2x76g"
  s = s.replace(/\b\d+(?:\.\d+)?\s*(g|kg|ml|l|cl|pack|pk|x|each)\b/gi, " ");
  s = s.replace(/\b\d+\s*x\s*\d+\b/gi, " ");
  // Drop all punctuation INCLUDING hyphens so "gluten-free" → ["gluten","free"]
  s = s.replace(/[^\w\s]/g, " ");
  const raw = s.split(/[\s,]+/).filter(Boolean);
  const out = [];
  for (let t of raw) {
    if (t.length < MIN_TOKEN_LEN) continue;
    if (NOISE_TOKENS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (t.length >= 4 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) {
      t = t.slice(0, -1);
    }
    out.push(t);
  }
  return out;
}

function isSubset(pantryTokens, receiptTokens) {
  if (pantryTokens.length === 0) return false;
  const recSet = new Set(receiptTokens);
  for (const t of pantryTokens) {
    if (!recSet.has(t)) return false;
  }
  return true;
}

// Return all pantry rows whose normalised name-tokens are a subset of
// the receipt-item's normalised tokens.
function substringMatchPantry(receiptName, pantry) {
  const recTokens = tokenise(receiptName);
  if (recTokens.length === 0) return [];
  const out = [];
  for (const row of pantry) {
    const panTokens = tokenise(row.item);
    if (isSubset(panTokens, recTokens)) out.push(row);
  }
  return out;
}

export function computeReplenishment(orderItems, pantry, deliveryDate) {
  const matched = [];
  const ambiguous = [];
  const unmatched = [];

  // Index pantry by `item` label for the PANTRY_KEYWORDS path. Note:
  // pantry_items.item isn't unique by DB constraint, but in practice the
  // user keeps one row per label — so this is usually a 1:1 index.
  const pantryByItem = new Map();
  for (const row of pantry) {
    if (!row.item) continue;
    if (!pantryByItem.has(row.item)) pantryByItem.set(row.item, []);
    pantryByItem.get(row.item).push(row);
  }

  const isEligible = (row) => !row.purchased || row.purchased < deliveryDate;

  for (const item of orderItems || []) {
    if (!item || !item.name) continue;
    if (item.status === "unavailable") continue;

    // Path 1: curated keyword dict.
    let candidates = [];
    const kwLabel = findPantryMatch(item.name);
    if (kwLabel && pantryByItem.has(kwLabel)) {
      candidates = pantryByItem.get(kwLabel).slice();
    } else {
      // Path 2: token-subset substring fallback.
      candidates = substringMatchPantry(item.name, pantry);
    }

    const eligible = candidates.filter(isEligible);

    if (eligible.length === 0) {
      unmatched.push({ receiptItem: item });
    } else if (eligible.length === 1) {
      matched.push({ receiptItem: item, pantryRow: eligible[0] });
    } else {
      ambiguous.push({ receiptItem: item, candidates: eligible });
    }
  }

  return { matched, ambiguous, unmatched };
}
