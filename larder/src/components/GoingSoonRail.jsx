// ============================================================
// GoingSoonRail — right-rail "Going soon" list (Cook tab redesign)
// ============================================================
// A compact, always-visible at-a-glance list of pantry items expiring
// soon (0–5 days). NOT an accordion — no collapse chevron. Items that
// are already PAST expiry live in the ExpiredBanner, not here.
//
// Deliberately quieter than the left-column cards: thinner border,
// smaller header type, tighter padding, lighter background — it must not
// compete with "Tonight's pick" for attention.
//
// Shows the 6 most-urgent items by default; "+N more" reveals the rest
// inline. Returns null when there's nothing going soon (the caller then
// lets the left column take the full width).
//
// Each row is a trigger for the shared ExpiryActionMenu (Still good /
// Used / Binned) — the same triage the ExpiredBanner offers — so you can
// resolve an item before it lapses without leaving the Cook tab. The
// menu only renders when onMarkItem is supplied; otherwise rows are
// plain (non-interactive) text.
//
// Props:
//   items      — array of pantry rows decorated with `_dExp` (0 ≤ d ≤ 5),
//                pre-sorted most-urgent-first by the caller.
//   onMarkItem — (itemName, action) => void  (action: still_good|used|binned)
// ============================================================

import { useState } from "react";
import ExpiryActionMenu from "./ExpiryActionMenu.jsx";

export default function GoingSoonRail({ items, onMarkItem }) {
  const [expanded, setExpanded] = useState(false);
  if (!items || items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, 6);
  const remaining = items.length - shown.length;

  return (
    <aside aria-label="Going soon" className="rounded-xl border border-stone-200 bg-stone-50/40 p-3">
      <h3 className="text-sm font-semibold text-stone-700 mb-2">
        Going soon · {items.length}
      </h3>
      <ul className="space-y-0.5">
        {shown.map((it) => {
          const danger = it._dExp <= 2;
          const badge = (
            <span
              className={"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium border " +
                (danger
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-amber-50 text-amber-800 border-amber-200")}
            >
              {it._dExp === 0 ? "today" : `${it._dExp}d`}
            </span>
          );
          if (!onMarkItem) {
            return (
              <li key={it.id || it.item} className="flex items-center justify-between gap-2 text-sm px-1.5 py-1">
                <span className="text-stone-700 truncate min-w-0">{it.item}</span>
                {badge}
              </li>
            );
          }
          return (
            <li key={it.id || it.item}>
              <ExpiryActionMenu
                itemName={it.item}
                onMark={onMarkItem}
                align="right"
                menuLabel={`Resolve ${it.item}`}
                triggerClassName="w-full flex items-center justify-between gap-2 text-sm text-left rounded-md px-1.5 py-1 hover:bg-stone-100 transition-colors"
              >
                <span className="flex-1 min-w-0 truncate text-stone-700">{it.item}</span>
                {badge}
              </ExpiryActionMenu>
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs text-stone-500 hover:text-stone-800 underline"
        >
          +{remaining} more →
        </button>
      )}
    </aside>
  );
}
