// ============================================================
// RecipeModal — full-detail recipe popup (Jira-ticket style)
// ============================================================
// One modal, mounted once in AppInner, driven by RecipeModalContext.
// Any recipe card calls openRecipe(decoratedRecipe) to show it. The
// overlay is richer than the old inline card expand — crucially it adds
// the full Method (recipe.steps) and Prep-ahead (recipe.prep_steps),
// neither of which the list expands ever surfaced.
//
// Close: × button, backdrop click, or Esc. Background scroll is locked
// while open. The header + footer stick so the title and "Mark cooked"
// stay reachable while the body scrolls.
//
// Props (mounted from AppInner, where these live):
//   pantry           — mapped pantry rows (to decorate a deep-linked recipe)
//   outOfStock       — Set of item names flagged out (same)
//   cooked           — array of cooked-log rows (drives ✓ Cooked state)
//   addCooked        — toggle callback for the footer button
//   cookedSyncErrors — { [recipeId]: errorMessage }
//
// The open recipe comes from useRecipeModal(): when a card opened the
// modal it passed a decorated `snapshot`; when the modal was opened by
// URL (deep link) or Back/Forward there's only a `recipeId`, so we look
// it up in RecipesContext and decorate it here (makeability + allergen
// flags) exactly as the list views do.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { AudienceTag, Bar, Chip, EaterTile } from "./primitives.jsx";
import { useRecipeModal } from "../contexts/RecipeModalContext.jsx";
import { useRecipes } from "../contexts/RecipesContext.jsx";
import { useAllergens } from "../contexts/AllergensContext.jsx";
import { makeability, pantryMatchSet } from "../lib/recipe-match.js";
import { audienceFromFlags, flagsForRecipe } from "../lib/allergens.js";

export default function RecipeModal({ pantry, outOfStock, cooked, addCooked, cookedSyncErrors }) {
  const { recipeId, snapshot, closeRecipe } = useRecipeModal();
  const { recipes } = useRecipes();
  const { allergens } = useAllergens();

  // Resolve + decorate the recipe to show. Prefer the caller's snapshot;
  // otherwise look the id up and decorate (deep link / Back-Forward path).
  const r = useMemo(() => {
    if (!recipeId) return null;
    if (snapshot && snapshot.id === recipeId) return snapshot;
    const raw = (recipes || []).find(x => x.id === recipeId);
    if (!raw) return null;
    const matchSet = pantryMatchSet(pantry || [], outOfStock || new Set());
    const m = makeability(raw, matchSet);
    const f = flagsForRecipe(raw, allergens);
    return { ...raw, _make: m, _flags: f, _audience: raw.audience || audienceFromFlags(f) };
  }, [recipeId, snapshot, recipes, pantry, outOfStock, allergens]);

  // "Copy link" affordance — the address bar already carries ?recipe=<id>,
  // but a one-tap copy is friendlier for sharing. Resets after a beat.
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the URL is still in the address bar */ }
  };

  // Esc-to-close + background scroll lock, only while a recipe is open.
  useEffect(() => {
    if (!r) return;
    const onKey = (e) => { if (e.key === "Escape") closeRecipe(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [r, closeRecipe]);

  if (!r) return null;

  const make = r._make || { pct: 0, have: [], missing: [] };
  const flags = r._flags || {};
  const total = (r.prep_time_mins || 0) + (r.cook_time_mins || 0);
  const isCooked = (cooked || []).some(c => c.meal_id === r.id);
  const cookErr = (cookedSyncErrors || {})[r.id];
  const steps = (r.steps || []).filter(s => s && String(s).trim());
  const prep = (r.prep_steps || []).filter(s => s && String(s).trim());

  const source = r.source || {};
  const sourceNode = source.url
    ? <a href={source.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{source.title || source.url} →</a>
    : (source.title
        ? <>📖 {source.title}{source.page ? `, p.${source.page}` : ""}{source.author ? ` · ${source.author}` : ""}</>
        : (r._source_file || null));

  const ingLabel = (i) => `${i.item}${i.qty ? ` — ${i.qty}${i.unit || ""}` : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/40"
      onClick={closeRecipe}
      role="dialog"
      aria-modal="true"
      aria-label={r.name}
    >
      <div
        className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header — title + key chips + close */}
        <div className="sticky top-0 bg-white border-b border-stone-200 px-4 sm:px-5 py-3 flex items-start justify-between gap-3 z-10">
          <div>
            <h2 className="text-lg font-semibold leading-tight text-stone-900">{r.name}</h2>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <AudienceTag a={r._audience} />
              <Chip tone="neutral">{make.pct}% have</Chip>
              {total > 0 && <Chip tone="neutral">{total}m total</Chip>}
              {r.servings && <Chip tone="neutral">serves {r.servings}</Chip>}
              {r.protein_per_serving_g != null && <Chip tone={r.protein_per_serving_g >= 30 ? "ok" : "neutral"}>{r.protein_per_serving_g}g protein</Chip>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={copyLink}
              aria-label="Copy link to this recipe"
              title={copied ? "Link copied" : "Copy link to this recipe"}
              className="text-stone-400 hover:text-stone-800 text-sm leading-none px-2 py-1 rounded hover:bg-stone-100"
            >{copied ? "✓ copied" : "🔗"}</button>
            <button
              onClick={closeRecipe}
              aria-label="Close"
              className="text-stone-400 hover:text-stone-800 text-2xl leading-none px-2 -mr-1"
            >×</button>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-4 space-y-4 text-sm">
          {/* Makeability bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1"><Bar pct={make.pct} /></div>
            <span className="mono text-xs text-stone-500 shrink-0">{make.pct}% in pantry</span>
          </div>

          {/* Tags */}
          {r.tags && r.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {r.tags.map((t, i) => <Chip key={i} tone="neutral">{t}</Chip>)}
            </div>
          )}

          {/* Ingredients — have vs missing */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">In pantry ({make.have.length})</div>
              <ul className="space-y-0.5">
                {make.have.map((i, k) => <li key={k} className="text-emerald-700">✓ {ingLabel(i)}</li>)}
                {!make.have.length && <li className="text-stone-400">none</li>}
              </ul>
            </div>
            <div>
              <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Missing ({make.missing.length})</div>
              <ul className="space-y-0.5">
                {make.missing.map((i, k) => <li key={k} className="text-stone-700">○ {ingLabel(i)}</li>)}
                {!make.missing.length && <li className="text-emerald-700">fully stocked</li>}
              </ul>
            </div>
          </div>

          {/* Prep ahead */}
          {prep.length > 0 && (
            <div>
              <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Prep ahead</div>
              <ul className="space-y-1">
                {prep.map((s, i) => (
                  <li key={i} className="flex gap-2"><span className="text-teal-600/60 shrink-0">•</span><span>{s}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* Method */}
          {steps.length > 0 && (
            <div>
              <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Method</div>
              <ol className="space-y-1.5 list-decimal pl-5 marker:text-stone-400">
                {steps.map((s, i) => <li key={i} className="pl-1 leading-snug text-stone-700">{s}</li>)}
              </ol>
            </div>
          )}

          {/* Per-eater safety */}
          <div className="grid sm:grid-cols-3 gap-2">
            <EaterTile name="Khalil" status={flags.khalil} reasons={flags.khalilReason} uncertain={flags.khalilUncertain} />
            <EaterTile name="Max" status={flags.max} reasons={flags.maxReason} />
            <EaterTile name="Emily" status={flags.emily} reasons={flags.emilyReason} />
          </div>

          {/* Notes */}
          {r.notes && <div className="text-stone-600 bg-stone-50 rounded-lg px-3 py-2">📝 {r.notes}</div>}

          {/* Source */}
          {sourceNode && <div className="text-stone-500 text-xs">{sourceNode}</div>}
        </div>

        {/* Sticky footer — Mark cooked */}
        {addCooked && (
          <div className="sticky bottom-0 bg-white border-t border-stone-200 px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
            {cookErr ? <span className="text-xs text-red-600">{cookErr}</span> : <span />}
            <button
              onClick={() => addCooked(r)}
              className="pill"
              data-active={isCooked}
              title={isCooked ? "Marked cooked — click to undo" : "Log that you cooked this — synced to Supabase"}
            >
              {isCooked ? "✓ Cooked" : "Mark cooked"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
