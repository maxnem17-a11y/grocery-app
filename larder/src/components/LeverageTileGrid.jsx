// ============================================================
// LeverageTileGrid — sortable table of leverage ingredients
// ============================================================
// Verbatim port of canonical index.html L2403–2472. Step 7j-2.
//
// Used by GapsView's "Ingredients that unlock the most recipes"
// section. Self-contained: takes an `items` array (output of
// leverageScore in recipe-match.js), owns its own sort state and
// the expanded-row state. Click a row to see which recipes the
// ingredient affects with their before/after makeability.
//
// Sort behaviour matches the SortHeader binary asc↔desc toggle
// pattern used elsewhere (Pantry table in 7d, regulars table in
// the same file in 7j-2).
// ============================================================

import { useMemo, useState } from "react";
import { Chip, SortHeader } from "./primitives.jsx";
import { lc } from "../lib/text.js";

export default function LeverageTileGrid({items}){
  const [open, setOpen] = useState(null);
  // Sort state — binary asc↔desc toggle, per-column smart defaults (14.16).
  //   ingredient → asc (A→Z)
  //   recipes, boost, to70 → desc (highest impact first — what unlocks the most)
  // Default is recipes desc, matching leverageScore's rank order. The # column
  // reflects current display order so it re-numbers after a sort change.
  const LEV_DEFAULT_DIR = { ingredient:"asc", recipes:"desc", boost:"desc", to70:"desc" };
  const [sortBy, setSortBy] = useState("recipes");
  const [sortDir, setSortDir] = useState("desc");
  const toggleSort = (key) => {
    if (sortBy !== key) { setSortBy(key); setSortDir(LEV_DEFAULT_DIR[key] || "desc"); return; }
    setSortDir(sortDir === "asc" ? "desc" : "asc");
  };
  const sortedItems = useMemo(() => {
    if (!items || !items.length) return items || [];
    const arr = [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "ingredient": cmp = lc(a.ingredient||"").localeCompare(lc(b.ingredient||"")); break;
        case "recipes": cmp = (a.recipeCount||0) - (b.recipeCount||0); break;
        case "boost": cmp = (a.avgBoost||0) - (b.avgBoost||0); break;
        case "to70": cmp = (a.unlockedTo70||0) - (b.unlockedTo70||0); break;
        default: cmp = 0;
      }
      if (cmp === 0) cmp = (b.recipeCount||0) - (a.recipeCount||0); // tiebreaker
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, sortBy, sortDir]);
  if (!items || !items.length) return <div className="text-sm text-stone-500">No leverage opportunities right now.</div>;
  return <div className="card overflow-hidden">
    <div className="px-3 py-2 border-b border-stone-200 bg-stone-50 text-[11px] uppercase tracking-wider text-stone-500 grid grid-cols-12 gap-2">
      <div className="col-span-1 text-right">#</div>
      <SortHeader colSpan={5} sortKey="ingredient" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>Ingredient</SortHeader>
      <SortHeader colSpan={2} sortKey="recipes" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right">Recipes</SortHeader>
      <SortHeader colSpan={2} sortKey="boost" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right">Avg boost</SortHeader>
      <SortHeader colSpan={1} sortKey="to70" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right">→70%</SortHeader>
      <div className="col-span-1"/>
    </div>
    <div className="divide-y divide-stone-100">
      {sortedItems.map((l,i)=> {
        const isOpen = open === l.key;
        const recipes = l.unlockedRecipes || [];
        return <div key={l.key || i} className={isOpen?"bg-stone-50":""}>
          <div role="button" tabIndex={0}
               onClick={()=> setOpen(isOpen ? null : l.key)}
               onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setOpen(isOpen ? null : l.key);} }}
               className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-sm cursor-pointer select-none">
            <div className="col-span-1 text-right mono text-xs text-stone-500">{i+1}</div>
            <div className="col-span-5 font-medium">{l.ingredient}</div>
            <div className="col-span-2 text-right"><Chip tone="accent">{l.recipeCount} recipe{l.recipeCount===1?"":"s"}</Chip></div>
            <div className="col-span-2 text-right mono text-xs text-stone-600">+{l.avgBoost}%</div>
            <div className="col-span-1 text-right text-xs text-stone-500">{l.unlockedTo70 || "—"}</div>
            <div className="col-span-1 text-right text-xs text-stone-400">{isOpen?'▲':'▼'}</div>
          </div>
          {isOpen && recipes.length>0 && <div className="px-3 pb-3 text-xs">
            <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-1.5">{l.recipeCount} recipe{l.recipeCount===1?" uses":"s use"} this ingredient (sorted by post-add makeability):</div>
            <div className="grid sm:grid-cols-2 gap-1">
              {recipes.map((u,j)=> <div key={j} className="bg-white border border-stone-200 rounded px-2 py-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-2">
                <span className="break-words sm:truncate leading-snug">{u.name}</span>
                <span className={"mono text-[10px] shrink-0 self-end sm:self-auto sm:ml-2 "+(u.after>=70?"text-emerald-700 font-medium":"text-stone-400")}>{u.before}% → {u.after}%</span>
              </div>)}
            </div>
          </div>}
        </div>;
      })}
    </div>
  </div>;
}
