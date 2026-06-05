// ============================================================
// TonightsPick — hero recommendation card (Cook tab redesign)
// ============================================================
// The single opinionated "cook this" recommendation at the top of the
// Cook tab's left column. Chosen in PlannerView by ranking whole-
// household, non-noise recipes on (expiring ingredients used) →
// protein/serving → makeability. The chosen recipe does NOT re-render
// as a card lower down (it's claimed first in the dedup pass).
//
// Two modes:
//   "tonight" — the pick uses at least one expiring ingredient; titled
//               "Tonight's pick", with the expiring ingredients shown as
//               small chips so the reason is legible.
//   "easy"    — fallback when no whole-household recipe uses anything
//               expiring; titled "Easy tonight", ranked purely on
//               makeability. No expiring chips.
//
// Props:
//   recipe        — decorated recipe (r._make, r._audience, protein…)
//   mode          — "tonight" | "easy"
//   expiringUsed  — string[] of expiring ingredient names this recipe uses
//   upNext        — second-ranked decorated recipe, or null
//   alsoNote      — optional "also a quick win"-style chip text
//   onMarkCooked  — () => void  (wraps addCooked(recipe))
//   cookedSyncError — optional error string for this recipe's cooked write
// ============================================================

import { AudienceTag, Chip } from "./primitives.jsx";
import { totalTime } from "../lib/recipe-match.js";
import { useRecipeModal } from "../contexts/RecipeModalContext.jsx";

export default function TonightsPick({ recipe, mode, expiringUsed = [], upNext, alsoNote, onMarkCooked, cookedSyncError }) {
  const { openRecipe } = useRecipeModal();
  if (!recipe) return null;
  const t = totalTime(recipe);
  const title = mode === "easy" ? "Easy tonight" : "Tonight's pick";
  const protein = recipe.protein_per_serving_g;

  return (
    <div className="card p-4 border-emerald-300 bg-emerald-50/40">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">
        {title}
      </div>
      <div className="flex items-start justify-between gap-2">
        <h3 onClick={() => openRecipe(recipe)}
            className="text-xl font-semibold leading-tight text-stone-900 cursor-pointer hover:underline"
            title="Open recipe">{recipe.name}</h3>
      </div>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <AudienceTag a={recipe._audience} />
        {t > 0 && <Chip tone="neutral">{t}m total</Chip>}
        {protein != null && <Chip tone={protein >= 30 ? "ok" : "neutral"}>{protein}g protein</Chip>}
        <Chip tone="neutral">{recipe._make.pct}% have</Chip>
        {alsoNote && <Chip tone="accent">{alsoNote}</Chip>}
      </div>

      {mode !== "easy" && expiringUsed.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-stone-600 mb-1">Uses, before it's gone</div>
          <div className="flex flex-wrap gap-1.5">
            {expiringUsed.slice(0, 3).map((name, i) => (
              <Chip key={i} tone="warn">{name}</Chip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={onMarkCooked}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
          style={{ minHeight: 36 }}
        >
          Mark cooked
        </button>
        {cookedSyncError && <span className="text-xs text-red-600">{cookedSyncError}</span>}
      </div>

      {upNext && (
        <div className="mt-3 pt-3 border-t border-emerald-200/70 flex items-center gap-2 text-sm text-stone-600">
          <span className="text-xs text-stone-500">Up next →</span>
          <span onClick={() => openRecipe(upNext)}
                className="font-medium text-stone-800 cursor-pointer hover:underline"
                title="Open recipe">{upNext.name}</span>
          <AudienceTag a={upNext._audience} />
        </div>
      )}
    </div>
  );
}
