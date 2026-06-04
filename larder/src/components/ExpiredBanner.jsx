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

import { useEffect, useRef, useState } from "react";
import { daysUntilExpiry } from "../lib/pantry-math.js";

const ACTIONS = [
  ["still_good", "Still good", "Bump expiry +3 days — keep it"],
  ["used", "Used", "Mark out of stock — eaten"],
  ["binned", "Binned", "Mark out of stock — thrown away"],
];

export default function ExpiredBanner({ pantry, outOfStock, onMarkItem, onDismiss }) {
  // Which item's popover is open (by item name), or null.
  const [openItem, setOpenItem] = useState(null);
  const popRef = useRef(null);
  const firstActionRef = useRef(null);

  // Expired = in-stock pantry items whose expiry is in the past.
  const expired = pantry
    .filter(p => !outOfStock.has(p.item))
    .map(p => ({ ...p, _dExp: daysUntilExpiry(p) }))
    .filter(p => p._dExp !== null && p._dExp < 0)
    .sort((a, b) => a._dExp - b._dExp); // most overdue first

  // Close the popover on outside tap / Escape.
  useEffect(() => {
    if (!openItem) return;
    const onDown = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpenItem(null); };
    const onKey = (e) => { if (e.key === "Escape") setOpenItem(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openItem]);

  // Focus the first action when a popover opens.
  useEffect(() => { if (openItem && firstActionRef.current) firstActionRef.current.focus(); }, [openItem]);

  if (expired.length === 0) return null;

  const act = (itemName, action) => { onMarkItem(itemName, action); setOpenItem(null); };

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
          const open = openItem === e.item;
          return (
            <div key={e.id || e.item} className="relative">
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => setOpenItem(open ? null : e.item)}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-100 transition-colors"
                style={{ minHeight: 36 }}
              >
                <span>{e.item}</span>
                <span className="text-red-500">· {overdue}d overdue</span>
              </button>
              {open && (
                <div
                  ref={popRef}
                  role="menu"
                  aria-label={`Resolve ${e.item}`}
                  onKeyDown={(ev) => {
                    // Lightweight focus trap: Tab/Shift+Tab cycles the 3 actions.
                    if (ev.key !== "Tab") return;
                    const btns = popRef.current.querySelectorAll("button");
                    if (!btns.length) return;
                    const first = btns[0], last = btns[btns.length - 1];
                    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
                    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
                  }}
                  className="absolute left-0 top-full mt-1 z-50 w-44 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
                >
                  {ACTIONS.map(([key, label, hint], i) => (
                    <button
                      key={key}
                      ref={i === 0 ? firstActionRef : null}
                      type="button"
                      role="menuitem"
                      onClick={() => act(e.item, key)}
                      title={hint}
                      className="block w-full text-left rounded-md px-2.5 py-2 text-xs hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
                    >
                      <span className="font-medium text-stone-800">{label}</span>
                      <span className="block text-[10px] text-stone-500">{hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
