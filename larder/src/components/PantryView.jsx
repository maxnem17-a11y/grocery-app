// ============================================================
// PantryView — the Pantry tab
// ============================================================
// Verbatim extraction from canonical index.html (L1388–1617)
// during the Vite migration. Behaviour matches the canonical
// file exactly — only the surrounding plumbing changes:
//   - hooks moved to a named import from "react"
//   - helpers moved to imports from ../lib/{pantry-math,text}.js
//   - primitives moved to imports from ./primitives.jsx
//   - top-level declaration changed to `export default function`
// No body refactoring; principle #4 (no behaviour change on a
// pure file-move) holds.
//
// Props:
//   pantry           — array of mapped pantry rows (see mapPantryRow)
//   outOfStock       — Set of item names currently flagged out
//   toggleOutOfStock — App-scope callback: optimistic write +
//                      patchPantryRow + rollback on failure
//   inFreezer        — Set of item names currently in the freezer
//   toggleInFreezer  — App-scope callback: same pattern as
//                      toggleOutOfStock, plus stamps frozen_at and
//                      has a schema-fallback path
//   qtyAdjustments   — map {itemName: integer delta}
//   adjustQty        — App-scope callback: 150 ms debounced PATCH
//                      with a refs-driven coalesce model
//   syncErrors       — map {itemName: errorMessage} from failed PATCHes
// ============================================================

import { useMemo, useState } from "react";
import { daysSince, daysUntilExpiry, decayed, formatDate } from "../lib/pantry-math.js";
import { lc } from "../lib/text.js";
import { Bar, Chip, InfoTip, SortHeader, Stat } from "./primitives.jsx";

export default function PantryView({pantry, outOfStock, toggleOutOfStock, inFreezer, toggleInFreezer, qtyAdjustments, adjustQty, syncErrors}){
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  // Category filter — composes (AND) with `filter` and the search box. "all" = no
  // category constraint. List is sourced from the live pantry below (not a fixed
  // taxonomy), so it stays in sync as new categories appear via receipt parsing.
  const [categoryFilter, setCategoryFilter] = useState("all");
  // Khalil-allergen audit panel: expands inline below the KPI row when the user clicks
  // the Khalil-allergen Stat card. Same content that used to live on the Stats tab —
  // moved here because the audit is operationally part of the pantry, not the library.
  const [khalilOpen, setKhalilOpen] = useState(false);
  // Sortable columns — binary asc↔desc toggle. First click on a new column uses
  // a per-column "interesting direction" default (the end users most often want
  // to see first); subsequent clicks just flip. No third-state reset — see 14.16.
  //   item, category → asc (A→Z, conventional for strings)
  //   qty → asc (lowest first = most depleted)
  //   conf → asc (lowest confidence first — what's at risk)
  //   expires → asc (soonest first — what to use up)
  //   khalil → asc (son_allergen=0 first — most flagged surfaced)
  // Out-of-stock rows are always sunk to the bottom regardless of sort direction.
  const PANTRY_DEFAULT_DIR = { item:"asc", category:"asc", qty:"asc", conf:"asc", expires:"asc", purchased:"desc", khalil:"asc" };
  const [sortBy, setSortBy] = useState("expires");
  const [sortDir, setSortDir] = useState("asc");
  const toggleSort = (key) => {
    if (sortBy !== key) { setSortBy(key); setSortDir(PANTRY_DEFAULT_DIR[key] || "asc"); return; }
    setSortDir(sortDir === "asc" ? "desc" : "asc");
  };
  // Format qty string + integer delta into a display value. Tries to update the numeric
  // portion of "500g" → "400g" when delta=-1 and step inferred… but step inference is
  // ambiguous, so we instead show: base qty + " (±N)" indicator when delta is non-zero.
  const renderQty = (baseQty, delta) => {
    if (!delta) return <span>{baseQty}</span>;
    const sign = delta > 0 ? "+" : "−";
    return <span>
      <span>{baseQty}</span>
      <span className={delta > 0 ? "text-emerald-600 ml-1 text-[10px]" : "text-red-600 ml-1 text-[10px]"}>{sign}{Math.abs(delta)}</span>
    </span>;
  };
  const rows = useMemo(()=> pantry.map(p => {
    // Honour the live inFreezer Set when computing decay so toggling the
    // freezer flag updates the Freshness bar immediately, even before the
    // Supabase round-trip has updated p._in_freezer on the pantry row.
    const frozen = (inFreezer && inFreezer.has(p.item)) || p._in_freezer;
    const conf = decayed({...p, _in_freezer: frozen});
    const dExp = daysUntilExpiry(p);
    const flag = p.allergen_flag || "household_safe";
    const delta = qtyAdjustments[p.item] || 0;
    return {...p, _conf:conf, _dExp:dExp, _flag:flag, _out: outOfStock.has(p.item), _frozen: frozen, _delta: delta, _syncErr: (syncErrors||{})[p.item] || null};
  }), [pantry, outOfStock, inFreezer, qtyAdjustments, syncErrors]);
  // Distinct categories present in current pantry, sorted alphabetically. Items
  // without a category are bucketed under "uncategorised" (sentinel value used by
  // both the dropdown options and the filter predicate below).
  const categories = useMemo(() => {
    const set = new Set();
    pantry.forEach(p => set.add(p.category && p.category.trim() ? p.category : "uncategorised"));
    return [...set].sort();
  }, [pantry]);
  const filteredRaw = rows.filter(r => {
    if (q && !lc(r.item).includes(lc(q))) return false;
    if (categoryFilter !== "all") {
      const rowCat = (r.category && r.category.trim()) ? r.category : "uncategorised";
      if (rowCat !== categoryFilter) return false;
    }
    if (filter==="expiring") return r._dExp!==null && r._dExp <= 5 && !r._out;
    if (filter==="low") return r._conf < 30 && !r._out;
    if (filter==="son") return r._flag !== "household_safe";
    if (filter==="out") return r._out;
    return true;
  });
  // Sort comparator: numeric for qty/conf/expiry, string for item/category, ordinal for
  // Khalil allergen (son_allergen=0, check=1, household_safe=2). Out-of-stock rows always
  // sink to bottom — they're filtered visually (line-through, opacity 40) and sorting
  // them inline would create a noisy mid-list of struck-through items.
  const allergenOrd = (flag) => flag==="son_allergen" ? 0 : flag==="check" ? 1 : 2;
  // Parse qty string to a number for sorting ("500g" → 500, "2" → 2, "—" → NaN sinks).
  // Falls back to 0 for non-numeric strings so they sort together at the bottom of asc.
  const qtyNum = (q) => { const m = String(q||"").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; };
  const filtered = useMemo(() => {
    const sorted = [...filteredRaw].sort((a, b) => {
      // Out-of-stock always last, regardless of sort dir
      if (a._out !== b._out) return a._out ? 1 : -1;
      let cmp = 0;
      switch (sortBy) {
        case "item": cmp = lc(a.item).localeCompare(lc(b.item)); break;
        case "category": cmp = lc(a.category||"").localeCompare(lc(b.category||"")); break;
        case "qty": cmp = (qtyNum(a.qty) + (a._delta||0)) - (qtyNum(b.qty) + (b._delta||0)); break;
        case "conf": cmp = a._conf - b._conf; break;
        case "expires":
          // Null expiry (no date) sinks to the bottom of asc, top of desc.
          if (a._dExp === null && b._dExp === null) cmp = 0;
          else if (a._dExp === null) cmp = 1;
          else if (b._dExp === null) cmp = -1;
          else cmp = a._dExp - b._dExp;
          break;
        case "purchased":
          // Null purchased (never ordered) sinks to the bottom of asc, top of desc.
          // Compare ISO date strings directly — lexicographic order matches chronological.
          if (!a.purchased && !b.purchased) cmp = 0;
          else if (!a.purchased) cmp = 1;
          else if (!b.purchased) cmp = -1;
          else cmp = a.purchased.localeCompare(b.purchased);
          break;
        case "khalil": cmp = allergenOrd(a._flag) - allergenOrd(b._flag); break;
        default: cmp = 0;
      }
      if (cmp === 0) cmp = lc(a.item).localeCompare(lc(b.item)); // tiebreaker
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRaw, sortBy, sortDir]);
  const counts = {
    total: rows.length,
    expiring: rows.filter(r=>r._dExp!==null && r._dExp <= 5 && !r._out).length,
    low: rows.filter(r=>r._conf<30 && !r._out).length,
    son: rows.filter(r=>r._flag!=="household_safe").length,
    out: rows.filter(r=>r._out).length,
  };
  return <>
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
      <Stat label="Items tracked" value={counts.total}
        tip="Every item currently known to be in your kitchen — fridge, freezer, cupboard. Reflects the last receipt + any manual adjustments. Not live-counted — qty is whatever was last set."/>
      <Stat label="Expiring ≤5d" value={counts.expiring} tone={counts.expiring>0?"warn":"ok"}
        tip="Items with an estimated expiry date within the next 5 days. Use the Planner tab to find recipes that use them."/>
      <Stat label="Low confidence" value={counts.low} tone={counts.low>0?"warn":"ok"}
        tip="Items with confidence under 30%. Confidence decays from 95% on purchase day based on category (fresh produce decays fast; dry goods decay slowly). Low confidence ≠ definitely gone — just less certain it's still usable."/>
      <Stat label="Marked out" value={counts.out} tone={counts.out>0?"danger":"ok"}
        tip="Items you've manually marked as out of stock in this browser. They're excluded from recipe matching and shown struck-through. Click 'Restore' on a row to undo."/>
      <Stat label="Khalil-allergen" value={counts.son} tone="info"
        tipAlign="right"
        tip="Items containing one of Khalil's allergens (dairy, eggs, wheat, lentils, peas, chickpeas, beans, avocado, beef, tree nuts) or marked as 'check label'. Tracked so meal planning excludes them when needed. Click to see the full list."
        onClick={() => setKhalilOpen(o => !o)} expanded={khalilOpen}/>
    </div>
    {khalilOpen && <div className="card p-4 mb-4 border-blue-200 bg-blue-50/30">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <span>Khalil allergen audit · {pantry.filter(p => p.allergen_flag && p.allergen_flag !== "household_safe").length} items</span>
          <InfoTip>Pantry items currently flagged as either a confirmed Khalil allergen or 'check label' (brand/recipe dependent). Useful when meal-planning to know what's in the kitchen he can't eat.</InfoTip>
        </h3>
        <button onClick={() => setKhalilOpen(false)} className="text-xs text-stone-500 hover:text-stone-700 underline">Hide</button>
      </div>
      {(() => {
        const pantryAllergens = pantry.filter(p => p.allergen_flag && p.allergen_flag !== "household_safe");
        if (!pantryAllergens.length) return <div className="text-sm text-stone-500">No Khalil-allergen items in the current pantry.</div>;
        return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
          {pantryAllergens.map((p,i)=> <div key={i} className="card px-3 py-2 flex items-center justify-between">
            <span className="font-medium">{p.item}</span>
            {p.allergen_flag==="son_allergen" ? <Chip tone="danger" title="Confirmed Khalil allergen">blocked</Chip> : <Chip tone="warn" title="Allergen status depends on the product label — verify before serving">check label</Chip>}
          </div>)}
        </div>;
      })()}
    </div>}
    <div className="flex flex-wrap gap-2 items-center mb-3">
      <input className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]" placeholder="Search pantry by item name…" value={q} onChange={e=>setQ(e.target.value)} />
      <div className="flex flex-wrap gap-1 items-center">
        {[["all","All"],["expiring","Expiring ≤5d"],["low","Low confidence"],["son","Khalil allergens"],["out","Marked out"]].map(([k,l])=>
          <button key={k} data-active={filter===k} onClick={()=>setFilter(k)} className="pill">{l}</button>
        )}
        <select
          value={categoryFilter}
          onChange={e=>setCategoryFilter(e.target.value)}
          data-active={categoryFilter !== "all"}
          className="pill cursor-pointer"
          title="Filter pantry by category (composes with other filters and the search box)"
          aria-label="Filter by category">
          <option value="all">All categories</option>
          {categories.map(c => {
            const count = rows.filter(r => ((r.category && r.category.trim()) ? r.category : "uncategorised") === c).length;
            return <option key={c} value={c}>{c} ({count})</option>;
          })}
        </select>
      </div>
    </div>
    <div className="card overflow-hidden">
      <div className="grid grid-cols-12 gap-2 text-xs text-stone-500 uppercase tracking-wider px-4 py-2 border-b border-stone-200 bg-stone-50">
        <SortHeader colSpan={3} sortKey="item" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>Item</SortHeader>
        <SortHeader colSpan={1} sortKey="category" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>Category</SortHeader>
        <SortHeader colSpan={2} sortKey="qty" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="center">Qty</SortHeader>
        <SortHeader colSpan={2} sortKey="conf" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>
          Freshness <InfoTip align="below">How likely the item is still usable. Starts at ~95% on purchase day and decays automatically by category. Anything below 30% is flagged 'low'.</InfoTip>
        </SortHeader>
        <SortHeader colSpan={1} sortKey="purchased" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>Last ordered</SortHeader>
        <SortHeader colSpan={1} sortKey="expires" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>Expires</SortHeader>
        <SortHeader colSpan={1} sortKey="khalil" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="center">
          Khalil <InfoTip align="below-right">⚠️ = contains a Khalil allergen · ? = depends on the brand/label · ✓ = safe.</InfoTip>
        </SortHeader>
        <div className="col-span-1 text-right">Actions</div>
      </div>
      <div className="divide-y divide-stone-100">
        {filtered.map((r,i)=> (
          <div key={r.item+i} className={`grid grid-cols-12 gap-2 items-center px-4 py-2 text-sm ${r._out?"opacity-40 line-through":""}`}>
            <div className="col-span-3 font-medium flex items-center gap-1.5" title={r.purchased ? `bought ${formatDate(r.purchased)}` : ""}>
              <span className="truncate">{r.item}</span>
            </div>
            <div className="col-span-1 text-stone-500 text-xs truncate" title={r.category}>{r.category}</div>
            <div className="col-span-2 text-center mono text-xs flex items-center justify-center gap-1">
              <button onClick={()=>adjustQty(r.item, -1)} disabled={r._out} className="qty-btn" title="Decrement qty (used one)">−</button>
              <span className="min-w-[55px] inline-block">{renderQty(r.qty, r._delta)}</span>
              <button onClick={()=>adjustQty(r.item, +1)} disabled={r._out} className="qty-btn" title="Increment qty (bought more)">+</button>
            </div>
            <div className="col-span-2"><Bar pct={r._conf}/><div className="mono text-[10px] text-stone-500 mt-0.5">{r._conf}%</div></div>
            <div className="col-span-1 text-xs leading-tight" title={r.purchased ? `bought ${formatDate(r.purchased)}` : "no purchase date on file"}>
              {r.purchased
                ? <>
                    <div className="text-stone-700">{formatDate(r.purchased)}</div>
                    <div className="text-stone-400 mono text-[10px]">{daysSince(r.purchased)}d ago</div>
                  </>
                : <span className="text-stone-400">—</span>}
            </div>
            <div className="col-span-1 text-xs leading-tight" title={r.expires ? `expires ${formatDate(r.expires)}` : ""}>
              {r._dExp===null ? <span className="text-stone-400">—</span>
                : r._dExp <= 0 ? <>
                    <div className="text-red-700 font-semibold">overdue</div>
                    <div className="text-red-600 mono text-[10px]">{formatDate(r.expires)}</div>
                  </>
                : r._dExp <= 5 ? <>
                    <div className="text-amber-700 font-semibold">{formatDate(r.expires)}</div>
                    <div className="text-amber-600 mono text-[10px]">in {r._dExp}d</div>
                  </>
                : <>
                    <div className="text-stone-700">{formatDate(r.expires)}</div>
                    <div className="text-stone-400 mono text-[10px]">in {r._dExp}d</div>
                  </>}
            </div>
            <div className="col-span-1 text-center">
              {r._flag==="son_allergen" ? <Chip tone="danger" title="Contains an ingredient Khalil cannot eat">⚠️</Chip>
                : r._flag==="check" ? <Chip tone="warn" title="May contain a Khalil allergen — check the product label">?</Chip>
                : <Chip tone="ok" title="Safe for Khalil">✓</Chip>}
            </div>
            <div className="col-span-1 text-right flex items-center justify-end gap-1.5">
              {r._syncErr && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle" title={r._syncErr}></span>}
              <button
                onClick={(e)=>{ e.stopPropagation(); toggleInFreezer(r.item); }}
                className={`text-xs leading-none shrink-0 transition-opacity ${r._frozen ? "opacity-100" : "opacity-25 hover:opacity-60"}`}
                title={r._frozen ? "In freezer — freshness decays slowly (~5%/month) from this point. Click to remove from freezer." : "Move to freezer — freshness stops decaying at today's level and starts decaying slowly (~5%/month) instead."}
                aria-label={r._frozen ? "Remove from freezer" : "Move to freezer"}
              >❄️</button>
              <button onClick={()=>toggleOutOfStock(r.item)} className="text-[11px] text-stone-500 hover:text-red-700 underline whitespace-nowrap" title={r._out?"Restore this item to the pantry":"Mark this item as out of stock — it will be excluded from recipe matching"}>
                {r._out ? "Restore" : "Out"}
              </button>
            </div>
          </div>
        ))}
        {!filtered.length && <div className="px-4 py-6 text-center text-sm text-stone-500">No items match your filter.</div>}
      </div>
    </div>
  </>;
}
