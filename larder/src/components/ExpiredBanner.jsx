// ============================================================
// ExpiredBanner — "Use today or bin" (Cook tab redesign)
// ============================================================
// The single most important thing on the page: pantry items that are
// PAST their expiry. Renders full-width above the tab nav, in an
// attention tone (red/orange) but deliberately NOT a modal — it informs
// and offers a quick resolution without blocking the rest of the app.
//
// Each expired item is a tappable chip. Tapping opens a small popover
// with three actions:
//   - Still good — bumps the item's expires forward (+3 days) so it
//     drops out of the banner; persists last_marked_action='still_good'
//   - Used       — marks out-of-stock; last_marked_action='used'
//   - Binned     — marks out-of-stock; last_marked_action='binned'
//                  (functionally identical to Used today, but the
//                  distinction is persisted for future waste analytics)
//
// All three resolve the item out of the banner immediately (optimistic
// state in App). Once every expired item is resolved the banner vanishes.
// A "Dismiss for session" escape hatch hides it until the next page load.
//
// Accessibility: the banner is the first focusable region on the page;
// each chip is a real <button>; the popover focuses its first action on
// open, traps Tab among the three actions, and closes on Esc / outside
// tap, returning focus to the chip.
//
// Props:
//   pantry          — array of mapped pantry rows
//   outOfStock      — Set of item names flagged out (excluded from banner)
//   onMarkItem      — (itemName, action) => void  (action: still_good|used|binned)
//   onDismiss       — () => void  (session-dismiss)
// ============================================================

import { daysUntilExpiry } from "../lib/pantry-math.js";
import ExpiryActionMenu from "./ExpiryActionMenu.jsx";

export default function ExpiredBanner({ pantry, outOfStock, onMarkItem, onDismiss }) {
  // Expired = in-stock pantry items whose expiry is in the past.
  const expired = pantry
    .filter(p => !outOfStock.has(p.item))
    .map(p => ({ ...p, _dExp: daysUntilExpiry(p) }))
    .filter(p => p._dExp !== null && p._dExp < 0)
    .sort((a, b) => a._dExp - b._dExp); // most overdue first

  if (expired.length === 0) return null;

  return (
    <div role="region" aria-label="Expired pantry items"
         className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
          <span aria-hidden="true">⚠️</span>
          Use today or bin · {expired.length} item{expired.length > 1 ? "s" : ""}
        </h2>
        <button onClick={onDismiss}
                className="text-xs text-red-700/80 hover:text-red-900 underline shrink-0">
          Dismiss for session
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {expired.map((e) => {
          const overdue = Math.abs(e._dExp);
          return (
            <ExpiryActionMenu
              key={e.id || e.item}
              itemName={e.item}
              onMark={onMarkItem}
              align="left"
              triggerClassName="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-100 transition-colors"
              triggerStyle={{ minHeight: 36 }}
            >
              <span>{e.item}</span>
              <span className="text-red-500">· {overdue}d overdue</span>
            </ExpiryActionMenu>
          );
        })}
      </div>
    </div>
  );
}
