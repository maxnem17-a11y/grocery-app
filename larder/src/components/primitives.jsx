// ============================================================
// Primitives — small presentational components
// ============================================================
// Verbatim extraction from canonical index.html (L1249–1361)
// during the Vite migration. Behaviour matches the canonical
// file exactly. Co-extracted in step 7d alongside PantryView,
// per CLAUDE.md migration principle #5 (don't pre-extract).
//
// Contents (in canonical-file order):
//   - InfoTip       L1249–1265
//   - SortHeader    L1272–1295
//   - Chip          L1319–1329
//   - Bar           L1335–1338
//   - Stat          L1339–1361   (uses <InfoTip> internally)
//
// Deliberately omitted from this file:
//   - HelpBanner (L1297–1318)    — not used by PantryView
//   - AudienceTag (L1330–1334)   — not used by PantryView
//   - Section (L1362–1387)       — not used by PantryView
// These can be appended here when a later view extraction
// needs them; same file, no parallel primitives module.
// ============================================================

export function InfoTip({ children, align = "center" }) {
  // children = the explanatory text. Renders a small ⓘ icon; reveals on hover/focus.
  // align: "center" (default, bubble above & centered), "right" (above, right-anchored),
  // "below" (below & centered — use inside overflow-hidden containers like table headers),
  // "below-right" (below & right-anchored — for tips in the rightmost columns).
  // stopPropagation on click/keyDown so the trigger doesn't fire parent click handlers
  // (e.g. when nested inside a sortable column header — clicking the ⓘ should NOT sort).
  const cls = "infotip-bubble"
    + (align === "right" ? " right" : "")
    + (align === "below" ? " below" : "")
    + (align === "below-right" ? " below right" : "");
  const stop = (e) => { e.stopPropagation(); };
  return <span className="infotip" onClick={stop} onKeyDown={stop}>
    <button type="button" tabIndex={0} className="infotip-trigger" aria-label="More info" onClick={stop}>i</button>
    <span className={cls} role="tooltip">{children}</span>
  </span>;
}

// Sortable column header. Click toggles sort direction (binary asc↔desc as of 14.16).
// First click on a new column applies that column's "interesting direction" default
// (see PANTRY_DEFAULT_DIR / REG_DEFAULT_DIR / LEV_DEFAULT_DIR in the consuming views);
// subsequent clicks on the same column just flip. Shows a small ▲/▼ chevron when this
// column is the active sort. The `disabled` prop renders a muted, non-interactive label
// (used by the Gaps Status header on single-status filters where sorting is a no-op).
export function SortHeader({ colSpan, sortKey, sortBy, sortDir, onClick, align = "left", children, disabled = false, disabledReason }) {
  const active = sortBy === sortKey;
  const justify = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
  const chevron = active ? (sortDir === "asc" ? "▲" : "▼") : "";
  // When disabled (e.g. status sort on a single-status filter), render as a static label
  // with a muted style and an explanatory title. No cursor, no click handler — the visual
  // grey-out signals 'sorting here would have no visible effect'.
  if (disabled) {
    return <div
      className={`col-span-${colSpan} flex items-center gap-1 select-none text-stone-300 ${justify}`}
      title={disabledReason || "Sorting this column has no effect on the current view"}
    >{children}</div>;
  }
  return <div
    className={`col-span-${colSpan} flex items-center gap-1 cursor-pointer select-none hover:text-stone-700 ${justify}`}
    onClick={() => onClick(sortKey)}
    role="button" tabIndex={0}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(sortKey); } }}
    title={active ? `Sorted ${sortDir === "asc" ? "ascending" : "descending"} — click to reverse` : "Click to sort"}
  >
    {children}
    {active && <span className="text-stone-700 text-[9px]">{chevron}</span>}
  </div>;
}

export function Chip({ tone = "neutral", children, title }) {
  const map = {
    neutral: "bg-stone-50 text-stone-700",
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    accent: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return <span className={`chip ${map[tone] || map.neutral}`} title={title}>{children}</span>;
}

export function Bar({ pct, color }) {
  const c = color || (pct >= 70 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626");
  return <div className="bar"><div style={{ width: `${pct}%`, background: c }} /></div>;
}

export function Stat({ label, value, tone, sub, tip, tipAlign, onClick, expanded }) {
  const tmap = { ok: "text-emerald-700", warn: "text-amber-700", danger: "text-red-700", info: "text-blue-700" };
  // When onClick is provided, the card becomes a button: cursor, hover state, ARIA, keyboard.
  // The small chevron at top-right signals it's expandable and reflects open state.
  const clickable = typeof onClick === "function";
  const interactiveProps = clickable ? {
    role: "button",
    tabIndex: 0,
    "aria-expanded": !!expanded,
    onClick,
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } },
  } : {};
  const className = "card px-4 py-3" + (clickable ? " cursor-pointer hover:bg-stone-50 transition-colors select-none" : "");
  return <div className={className} {...interactiveProps}>
    <div className="text-xs text-stone-500 uppercase tracking-wider flex items-center">
      <span>{label}</span>
      {tip && <InfoTip align={tipAlign}>{tip}</InfoTip>}
      {clickable && <span className="ml-auto text-stone-400 text-[10px]" aria-hidden="true">{expanded ? "▼" : "▶"}</span>}
    </div>
    <div className={`text-2xl font-semibold mt-0.5 ${tmap[tone] || ""}`}>{value}</div>
    {sub && <div className="text-xs text-stone-500 mt-0.5">{sub}</div>}
  </div>;
}
