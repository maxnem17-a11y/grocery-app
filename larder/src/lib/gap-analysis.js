// ============================================================
// Gap analysis — receipt history vs current pantry
// ============================================================
// Verbatim extraction of canonical index.html L4194-4240
// (computeRegularsAndGaps). Step 7j-1.
//
// Groups receipt items into product families, finds the ones
// bought across `minOrders` or more deliveries, then categorises
// each as:
//   - in latest order (regular, already restocked)
//   - in pantry (regular, on the shelf)
//   - gap (regular, NOT in latest AND NOT in pantry → likely
//     needs restocking)
//   - excluded (matches a household-rule pattern or SKU flag —
//     intentionally not restocked)
//
// Used by SuggestedBasket (gap entries become basket items) and
// will be used by GapsView's regulars table in 7j-2.
//
// TODO(refactor): return shape includes `latestIdx` so callers
// can re-index into the receipts array for the latest order.
// Cleaner shape would return `latest` directly. Deferred from
// 14.4 to avoid bundling a shape change with the receipts-param
// refactor. Preserved verbatim here.
// ============================================================

import { findPantryMatch, normaliseProductName } from "./pricing.js";
import { khalilAllergenFlag } from "./allergens.js";
import { neverRestockReason } from "./tesco-skus.js";

export function computeRegularsAndGaps(pantry, receipts, allergens, minOrders = 3, skuIndex = null) {
  const orders = receipts || [];
  if (!orders.length) return null;
  const latestIdx = orders.length - 1;

  const fam = new Map();
  orders.forEach((o, i) => {
    (o.items || []).forEach(it => {
      if (it.status === "unavailable") return;
      const k = normaliseProductName(it.name);
      if (!k) return;
      if (!fam.has(k)) fam.set(k, { example: it.name, orderIdxs: new Set(), lastSeenDate: o.delivery_date, counts: new Map() });
      const entry = fam.get(k);
      entry.orderIdxs.add(i);
      if ((o.delivery_date || "") > (entry.lastSeenDate || "")) entry.lastSeenDate = o.delivery_date;
      entry.counts.set(it.name, (entry.counts.get(it.name) || 0) + 1);
    });
  });
  for (const v of fam.values()) {
    let best = null, bestN = -1;
    for (const [n, c] of v.counts) if (c > bestN) { best = n; bestN = c; }
    v.example = best;
    delete v.counts;
  }

  const pantryKeys = new Set(pantry.map(p => p.item.toLowerCase()));
  const regulars = [];
  for (const [key, v] of fam) {
    const count = v.orderIdxs.size;
    if (count < minOrders) continue;
    const inLatest = v.orderIdxs.has(latestIdx);
    let pantryItem = null;
    for (const pk of pantryKeys) {
      if (key.includes(pk) || (v.example || "").toLowerCase().includes(pk)) { pantryItem = pk; break; }
    }
    if (!pantryItem) pantryItem = findPantryMatch(v.example);
    const allergen = khalilAllergenFlag(v.example, allergens);
    const excluded = neverRestockReason(v.example, skuIndex);
    regulars.push({
      key, example: v.example, count, inLatest, lastSeenDate: v.lastSeenDate,
      pantryItem, allergen, excludedReason: excluded,
    });
  }
  regulars.sort((a, b) => b.count - a.count || (a.lastSeenDate || "").localeCompare(b.lastSeenDate || ""));
  const gaps = regulars.filter(r => !r.pantryItem && !r.inLatest && !r.excludedReason);
  return { regulars, gaps, latestIdx };
}
