// ============================================================
// ExpiryActionMenu — shared "Still good / Used / Binned" popover
// ============================================================
// The three-action resolver used wherever a pantry item's freshness can
// be triaged: the ExpiredBanner (past-expiry items, above the tab nav)
// and the Cook tab's GoingSoonRail (items expiring 0–5 days). Each
// surface supplies its own trigger (a red chip in the banner, a row in
// the rail) via `children` + `triggerClassName`; this component owns the
// popover behaviour: open/close, outside-tap + Esc close (returning focus
// to the trigger), first-action focus, and a lightweight Tab focus trap.
//
// Actions call onMark(itemName, action) where action ∈
//   still_good | used | binned
// (handled by App's markItemAction — still_good bumps expiry, used/binned
// flag out-of-stock; the used/binned distinction is persisted for waste
// analytics).
//
// Props:
//   itemName         — the pantry item name (passed back to onMark)
//   onMark           — (itemName, action) => void
//   align            — "left" | "right" — which edge the menu hangs from
//   triggerClassName — className for the trigger <button>
//   triggerStyle     — optional inline style for the trigger
//   menuLabel        — aria-label for the menu (defaults to "Resolve <item>")
//   children         — trigger content
// ============================================================

import { useEffect, useRef, useState } from "react";

export const EXPIRY_ACTIONS = [
  ["still_good", "Still good", "Bump expiry +3 days — keep it"],
  ["used", "Used", "Mark out of stock — eaten"],
  ["binned", "Binned", "Mark out of stock — thrown away"],
];

export default function ExpiryActionMenu({
  itemName, onMark, align = "left", triggerClassName, triggerStyle, menuLabel, children,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const triggerRef = useRef(null);
  const firstActionRef = useRef(null);

  // Close on outside tap / Escape (Esc returns focus to the trigger).
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus the first action when the menu opens.
  useEffect(() => { if (open && firstActionRef.current) firstActionRef.current.focus(); }, [open]);

  const act = (action) => { onMark(itemName, action); setOpen(false); };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={triggerClassName}
        style={triggerStyle}
      >{children}</button>
      {open && (
        <div
          ref={popRef}
          role="menu"
          aria-label={menuLabel || `Resolve ${itemName}`}
          onKeyDown={(ev) => {
            // Lightweight focus trap: Tab/Shift+Tab cycles the 3 actions.
            if (ev.key !== "Tab") return;
            const btns = popRef.current.querySelectorAll("button");
            if (!btns.length) return;
            const first = btns[0], last = btns[btns.length - 1];
            if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
            else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
          }}
          className={"absolute top-full mt-1 z-50 w-44 rounded-lg border border-stone-200 bg-white p-1 shadow-lg " +
            (align === "right" ? "right-0" : "left-0")}
        >
          {EXPIRY_ACTIONS.map(([key, label, hint], i) => (
            <button
              key={key}
              ref={i === 0 ? firstActionRef : null}
              type="button"
              role="menuitem"
              onClick={() => act(key)}
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
}
