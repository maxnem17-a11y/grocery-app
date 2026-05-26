// ============================================================
// Pantry math — decay, expiry, date utilities
// ============================================================
// Pure date/decay arithmetic used throughout the dashboard.
// Extracted from index.html (L529-532 and L1086-1153 of
// canonical file) during the Vite migration. Behaviour matches
// the canonical file exactly.
//
// The decay model: each pantry item carries a `confidence` (0-100)
// that decays from its `purchased` date at a category-specific
// rate. Frozen items decay much slower (5pp/month vs 20pp/day
// for produce). The model is heuristic — it's a confidence
// signal for "is this still good?", not a literal nutrition
// curve. Tuning the rates lives in decayPerDay().
// ============================================================

import { lc } from "./text.js";

// "Today" at noon UTC, computed once at module load. Matches the
// canonical behaviour: a single snapshot per page load. Midnight
// rollover for long-open sessions is a known limitation — see the
// migration notes if/when we decide to fix that separately.
export const TODAY = (() => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0));
})();

// Whole days elapsed since an ISO date (YYYY-MM-DD), floored.
// Returns 0 for missing / future dates. Noon UTC anchor on both
// sides avoids DST and timezone weirdness — what matters is the
// calendar-day count, not exact hours.
export function daysSince(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr + "T12:00:00Z");
  return Math.max(0, Math.floor((TODAY - d) / (1000 * 60 * 60 * 24)));
}

// Decay rate in percentage points per day, by pantry category.
// Tuned heuristically — these are the rates that gave sensible
// "this looks about right" answers across actual purchase history.
//
// Categories use lowercase substring matching so minor variants
// ("Frozen Veg" vs "frozen", "Tinned Goods" vs "tinned") all hit
// the right bucket without a strict enum.
//
// Rates:
//   produce:                   20pp/day (lettuce → 5 days)
//   dairy / protein:           10pp/day (~9 days from full)
//   frozen:                    5pp/month (≈0.167/day)
//   seasoning / dry / tinned /
//   condiment / nuts:          4pp/week (≈0.57/day, ~5 months)
//   anything else:             5pp/day default
//
// Items can override via item.confidence at purchase time;
// these are just the slope of the line.
export function decayPerDay(category) {
  const c = lc(category);
  if (c.includes("produce")) return 20;
  if (c.includes("dairy") || c === "protein") return 10;
  if (c.includes("frozen")) return 5 / 30;
  if (c.includes("seasoning") || c.includes("dry") || c.includes("tinned") || c.includes("condiment") || c.includes("nuts")) return 4 / 7;
  return 5;
}

// Current decayed confidence (0-100, integer) for a pantry item.
//
// Frozen-rate model: whatever freshness an item had at the moment
// of freezing is what's preserved, then it decays slowly from
// there. Math:
//   pre-freeze loss  = (frozen_at - purchased) * baseRate
//   post-freeze loss = (today - frozen_at) * frozenRate
// Falls back to baseRate-since-purchase if we don't know when it
// was frozen (rows predating the frozen_at column, or pre-existing
// _in_freezer state on a browser session that hasn't synced yet).
export function decayed(item) {
  const d = daysSince(item.purchased);
  const baseRate = decayPerDay(item.category);
  if (item._in_freezer) {
    const frozenRate = 5 / 30;
    const frozenAt = item._frozen_at;
    if (frozenAt) {
      const daysBeforeFreeze = Math.max(0, daysSince(item.purchased) - daysSince(frozenAt));
      const daysSinceFreeze = Math.max(0, daysSince(frozenAt));
      const loss = daysBeforeFreeze * baseRate + daysSinceFreeze * frozenRate;
      return Math.max(0, Math.round((item.confidence ?? 90) - loss));
    }
    // No frozen_at known — use the legacy whole-period frozen-rate calc.
    // This is the v26/v27 behaviour and only applies to rows that haven't
    // been re-toggled since the v29 frozen_at column was added.
    const v = (item.confidence ?? 90) - d * frozenRate;
    return Math.max(0, Math.round(v));
  }
  const v = (item.confidence ?? 90) - d * baseRate;
  return Math.max(0, Math.round(v));
}

// Days until an item expires (negative = expired). Returns null if
// the item has no `expires` date — many pantry items legitimately
// don't (spices, oils, etc.), so callers must handle null rather
// than treating it as "fresh forever" or "expired".
export function daysUntilExpiry(item) {
  if (!item.expires) return null;
  const d = new Date(item.expires + "T12:00:00Z");
  return Math.round((d - TODAY) / (1000 * 60 * 60 * 24));
}

// ============================================================
// Date formatting
// ============================================================

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format an ISO date string (YYYY-MM-DD) as "Weekday DD Month"
// (e.g. "Sat 16 May"), adding the year only if it falls in a
// different year from TODAY. UK conventions throughout.
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  if (isNaN(d)) return iso;
  const wd = WEEKDAY_SHORT[d.getUTCDay()];
  const dd = d.getUTCDate();
  const mon = MONTH_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const thisYear = TODAY.getUTCFullYear();
  const yearPart = year !== thisYear ? ` ${year}` : "";
  return `${wd} ${dd} ${mon}${yearPart}`;
}

// Add N days to an ISO date and return the new ISO date.
// N can be negative.
export function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Per-category default shelf life (days) after purchase. Used by the
// replenishment flow to bump pantry_items.expires when an item is
// re-purchased, so the Expires column doesn't stay stuck on a previous
// cycle's date. Categories not listed here keep their existing expires
// value (replenishment leaves the field alone).
//
// Numbers are conservative; tweak in the source if a category's
// freshness window doesn't match real-world experience.
export const SHELF_LIFE_DAYS = {
  produce:          5,
  protein:          4,
  dairy:            7,
  "dairy-alt":      7,
  bread:            5,
  frozen:           90,
  tinned:           730,
  "tinned-protein": 730,
  "dry-goods":      365,
  seasoning:        365,
  "nuts-seeds":     180,
  condiment:        180,
  snack:            60,
};

// Compute the default expires date for a category + purchased ISO date.
// Returns null if the category is unknown — callers should leave the
// existing expires value as-is in that case.
export function computeExpires(category, purchasedIso) {
  if (!category || !purchasedIso) return null;
  const days = SHELF_LIFE_DAYS[category];
  if (days == null) return null;
  return addDays(purchasedIso, days);
}
