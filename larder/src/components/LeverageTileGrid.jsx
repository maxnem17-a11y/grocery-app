// ============================================================
// LeverageTileGrid — actionable leverage table (Basket overhaul 2.4)
// ============================================================
// Sortable table of leverage ingredients (output of leverageScore). Click
// a row to expand the recipes it affects. The 2026-06 overhaul turned the
// expansion from a read-only list into an action surface:
//   2.4a Add-to-basket CTA in the expansion header — adds the ingredient
//        to the basket's Unlock-recipes group; the parent re-ranks leverage
//        so the added ingredient drops out and every recipe updates.
//   2.4b Recipes ranked visually by post-add makeability — ≥70% bold/full,
//        50–70% normal, <50% dimmed — with a headline payoff line.
//   2.4c Expansion caps at 12 recipes; "Show all N" reveals the rest.
//   2.4d Each recipe row is clickable → navigates to the Recipes tab.
//
// Props:
//   items          — leverageScore output (already merged/deduped by 2.5)
//   onAddToBasket(name)  — add the ingredient to the basket (lifted state)
//   onOpenRecipe(name)   — open a recipe on the Recipes tab
// ============================================================

import { useMemo, useState } from "react";
import { Chip, SortHeader } from "./primitives.jsx";
import { lc } from "../lib/text.js";

export default function LeverageTileGrid({ items, onAddToBasket, onOpenRecipe }) {
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);   // expand the 12-recipe cap
  const [justAdded, setJustAdded] = useState(null); // {name, count} inline confirm
  const LEV_DEFAULT_DIR = { ingredient: "asc", recipes: "desc", boost: "desc", to70: "desc" };
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
        case "ingredient": cmp = lc(a.ingredient || "").localeCompare(lc(b.ingredient || "")); break;
        case "recipes": cmp = (a.recipeCount || 0) - (b.recipeCount || 0); break;
        case "boost": cmp = (a.avgBoost || 0) - (b.avgBoost || 0); break;
        case "to70": cmp = (a.unlockedTo70 || 0) - (b.unlockedTo70 || 0); break;
        default: cmp = 0;
      }
      if (cmp === 0) cmp = (b.recipeCount || 0) - (a.recipeCount || 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, sortBy, sortDir]);

  const handleAdd = (l) => {
    setJustAdded({ name: l.ingredient, count: l.unlockedTo70 || 0 });
    setOpen(null);
    if (onAddToBasket) onAddToBasket(l.ingredient);
  };

  if (!items || !items.length) return <div className="text-sm text-stone-600">No leverage opportunities right now.</div>;

  return <div>
    {justAdded && (
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <span>Added <strong>{justAdded.name}</strong> to the basket — now unlocks {justAdded.count} recipe{justAdded.count === 1 ? "" : "s"}. Leverage updated.</span>
        <button onClick={() => setJustAdded(null)} className="text-emerald-700 hover:text-emerald-900" aria-label="Dismiss">×</button>
      </div>
    )}
    <div className="card overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-200 bg-stone-50 text-[11px] uppercase tracking-wider text-stone-500 grid grid-cols-12 gap-2">
        <div className="col-span-1 text-right">#</div>
        <SortHeader colSpan={5} sortKey="ingredient" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>Ingredient</SortHeader>
        <SortHeader colSpan={2} sortKey="recipes" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right">Recipes</SortHeader>
        <SortHeader colSpan={2} sortKey="boost" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right">Avg boost</SortHeader>
        <SortHeader colSpan={1} sortKey="to70" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right">→70%</SortHeader>
        <div className="col-span-1" />
      </div>
      <div className="divide-y divide-stone-100">
        {sortedItems.map((l, i) => {
          const isOpen = open === l.key;
          const recipes = l.unlockedRecipes || [];
          const visibleRecipes = showAll ? recipes : recipes.slice(0, 12);
          const hidden = recipes.length - visibleRecipes.length;
          return <div key={l.key || i} className={isOpen ? "bg-stone-50" : ""}>
            <div role="button" tabIndex={0}
              onClick={() => { setOpen(isOpen ? null : l.key); setShowAll(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : l.key); setShowAll(false); } }}
              className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-sm cursor-pointer select-none">
              <div className="col-span-1 text-right mono text-xs text-stone-500">{i + 1}</div>
              <div className="col-span-5 font-medium">{l.ingredient}</div>
              <div className="col-span-2 text-right"><Chip tone="accent">{l.recipeCount} recipe{l.recipeCount === 1 ? "" : "s"}</Chip></div>
              <div className="col-span-2 text-right mono text-xs text-stone-600">+{l.avgBoost}%</div>
              <div className="col-span-1 text-right text-xs text-stone-500">{l.unlockedTo70 || "—"}</div>
              <div className="col-span-1 text-right text-xs text-stone-400">{isOpen ? '▲' : '▼'}</div>
            </div>
            {isOpen && recipes.length > 0 && <div className="px-3 pb-3 text-xs">
              {/* Headline payoff + add CTA (2.4a/b) */}
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="text-stone-700">
                  Adding <strong>{l.ingredient}</strong> makes <strong>{l.unlockedTo70 || 0}</strong> recipe{(l.unlockedTo70 || 0) === 1 ? "" : "s"} makeable (≥70%)
                  <span className="text-stone-500"> · appears in {l.recipeCount}</span>
                </div>
                <button onClick={() => handleAdd(l)}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                  style={{ minHeight: 36 }}>
                  + Add {l.ingredient} to basket
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-1">
                {visibleRecipes.map((u, j) => {
                  const cross = u.after >= 70, mid = u.after >= 50 && u.after < 70;
                  return <button key={j}
                    onClick={() => onOpenRecipe && onOpenRecipe(u.name)}
                    title={`Open "${u.name}" on the Recipes tab`}
                    className={"text-left bg-white border border-stone-200 rounded px-2 py-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-2 hover:border-stone-400 " +
                      (cross ? "" : mid ? "" : "opacity-50")}>
                    <span className={"break-words sm:truncate leading-snug " + (cross ? "font-semibold text-stone-800" : "text-stone-700")}>{u.name}</span>
                    <span className={"mono text-[10px] shrink-0 self-end sm:self-auto sm:ml-2 " + (cross ? "text-emerald-700 font-medium" : "text-stone-400")}>{u.before}% → {u.after}%</span>
                  </button>;
                })}
              </div>
              {hidden > 0 && <button onClick={() => setShowAll(true)} className="mt-2 text-xs text-stone-600 hover:text-stone-900 underline">Show all {recipes.length} →</button>}
              {showAll && recipes.length > 12 && <button onClick={() => setShowAll(false)} className="mt-2 ml-3 text-xs text-stone-500 hover:text-stone-800 underline">Show fewer</button>}
            </div>}
          </div>;
        })}
      </div>
    </div>
  </div>;
}
