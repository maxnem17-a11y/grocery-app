// ============================================================
// Delivery — predicted next-delivery date from receipt cadence
// ============================================================
// Verbatim extraction of `suggestNextDelivery` from canonical
// index.html L4157–4187 during step 7f-1.
//
// Pure function: takes the receipts array (oldest-first by
// delivery_date) and returns:
//   { date:    "YYYY-MM-DD" | null   — proposed next delivery
//     weekday: "Mon"|"Tue"|...|null  — convenience for headers
//     note:    string                — human explanation
//     avgGap:  integer | undefined   — days between deliveries }
//
// Strategy: average the gap (in days) between consecutive
// deliveries over the last ~6 receipts (recency-weighted),
// then project that gap forward from the most recent delivery.
// Never propose a date earlier than tomorrow.
//
// Edge cases:
//   - < 2 orders               → { date: null, note: "Not enough …" }
//   - all gaps degenerate (≤0 or ≥60 days) → { date: null, note: "… irregular …" }
//
// Consumers: LarderBrand (delivery-day brass-lid lighting +
// "Delivery in N days" subtitle). PlannerView and SuggestedBasket
// also use this in canonical; they'll wire to the same lib when
// ported.
// ============================================================

import { TODAY } from "./pantry-math.js";

export function suggestNextDelivery(receipts) {
  const orders = receipts || [];
  if (orders.length < 2) {
    return { date: null, note: "Not enough order history to estimate cadence." };
  }
  // Average gap in days between consecutive deliveries (use last ~6 to weight recent behaviour)
  const recent = orders.slice(-6);
  const gaps = [];
  for (let i = 1; i < recent.length; i++) {
    const a = new Date(recent[i - 1].delivery_date + "T12:00:00Z");
    const b = new Date(recent[i].delivery_date + "T12:00:00Z");
    const d = Math.round((b - a) / (24 * 60 * 60 * 1000));
    if (d > 0 && d < 60) gaps.push(d);
  }
  if (!gaps.length) return { date: null, note: "Order cadence is too irregular to estimate." };
  const avgGap = Math.round(gaps.reduce((s, n) => s + n, 0) / gaps.length);
  const latest = orders[orders.length - 1].delivery_date;
  const latestDate = new Date(latest + "T12:00:00Z");
  const proposedDate = new Date(latestDate.getTime() + avgGap * 24 * 60 * 60 * 1000);
  // Never propose a date earlier than tomorrow
  const tomorrow = new Date(TODAY.getTime() + 24 * 60 * 60 * 1000);
  const finalDate = proposedDate < tomorrow ? tomorrow : proposedDate;
  const iso = finalDate.toISOString().slice(0, 10);
  const weekday = finalDate.toUTCString().slice(0, 3);
  return {
    date: iso,
    weekday,
    note: `Based on a ${avgGap}-day average across your last ${recent.length} deliveries (latest: ${latest}).`,
    avgGap,
  };
}
