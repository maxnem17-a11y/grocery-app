// ============================================================
// RecipeMicroList — grid of recipe cards
// ============================================================
// Originally a verbatim port of canonical index.html L2341–2399 with a
// click-to-expand body. Post the recipe-modal change (2026-06-05) the
// card no longer expands in place — clicking it opens the shared
// RecipeModal (full method + ingredients + eater safety), so every list
// surfaces the same rich detail view. The row-level "Mark cooked" button
// (1.8) stays on the card and stopPropagation's so it doesn't also open
// the modal.
//
// Each item is a decorated recipe (`r._make`, `r._flags`, `r._audience`
// — see PlannerView's decorated useMemo); the modal reads those directly.
//
// Caller decides the items (Planner gives top-6 slices by makeability /
// protein / quickness).
// ============================================================

import { AudienceTag, Chip } from "./primitives.jsx";
import { useRecipeModal } from "../contexts/RecipeModalContext.jsx";

export default function RecipeMicroList({ items, onMarkCooked, cookedSet, cookedSyncErrors }) {
  const { openRecipe } = useRecipeModal();
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
    {items.map(r => {
      const total = (r.prep_time_mins || 0) + (r.cook_time_mins || 0);
      const isCooked = cookedSet ? cookedSet.has(r.id) : false;
      const cookErr = cookedSyncErrors ? cookedSyncErrors[r.id] : null;
      return <div key={r.id} className="card text-sm">
        <div role="button" tabIndex={0}
             onClick={(e) => { if (e.target.closest('button,a')) return; openRecipe(r); }}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecipe(r); } }}
             className="px-3 py-2.5 cursor-pointer select-none"
             title="Open recipe">
          <div className="font-medium leading-tight flex items-start justify-between gap-2">
            <span>{r.name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Row-level Mark cooked (1.8) — stopPropagation so it doesn't open the modal. */}
              {onMarkCooked && <button
                onClick={(e) => { e.stopPropagation(); onMarkCooked(r); }}
                className={"rounded-md border px-2 text-[11px] font-medium leading-none " +
                  (isCooked ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-600 text-emerald-700 hover:bg-emerald-50")}
                style={{ minHeight: 36 }}
                title={isCooked ? "Marked cooked — tap to undo" : "Mark cooked"}
              >{isCooked ? "✓ Cooked" : "Mark cooked"}</button>}
              <span className="text-xs text-stone-400" aria-hidden="true" title="Open recipe">⤢</span>
            </div>
          </div>
          {cookErr && <div className="text-[10px] text-red-600 mt-0.5">{cookErr}</div>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <AudienceTag a={r._audience}/>
            <Chip tone="neutral">{r._make.pct}% have</Chip>
            {total > 0 && <Chip tone="neutral">{total}m</Chip>}
            {r.protein_per_serving_g != null && <Chip tone={r.protein_per_serving_g >= 30 ? "ok" : "neutral"}>{r.protein_per_serving_g}g</Chip>}
            {/* Dedup cross-reference: set by PlannerView when this recipe also
                qualifies for a lower-priority section (e.g. "also expiring"). */}
            {r._alsoNote && <Chip tone="accent">{r._alsoNote}</Chip>}
          </div>
        </div>
      </div>;
    })}
    {!items.length && <div className="text-sm text-stone-500 col-span-full">Nothing matching right now.</div>}
  </div>;
}
