// ============================================================
// PrepSuggestions — Cook tab "Got 5 mins?" section (backlog #9)
// ============================================================
// Surfaces small mise-en-place prep tasks (chop the onion, make the
// harissa paste, mix the spice rub) drawn from recipes the household
// can currently make. A 5-minute productivity nudge: "I have a spare
// moment" → "I just prepped tonight's tagine".
//
// Data lives in recipes.prep_steps (jsonb array of short strings),
// hand-curated by Max. extractPrepGroups does the filtering + grouping
// by recipe; this component owns the slider/reroll/show-more state.
//
// Tasks are GROUPED BY RECIPE — each recipe is one labelled block
// (recipe name + makeability % + "N steps", then its prep steps) so
// it's obvious which steps belong to which dish.
//
// A "Min makeable %" slider (mirroring the Recipes tab) lets the user
// widen/narrow the pool by how much of each recipe they already have.
// "Show more recipes" reveals further groups in place; ↻ Refresh
// reshuffles the whole set.
//
// Empty-state (F1 from scope): when NO recipe has any prep_steps at all
// we render nothing. When the pool is non-empty but the slider filters
// everything out, we keep the section + slider and show a hint.
//
// Props:
//   recipes            — array of mapped recipe rows (from useRecipes())
//   pantry             — array of mapped pantry rows
//   outOfStock         — Set of item names flagged out (feeds makeability)
//   initialGroups      — recipe groups shown before "Show more" (default 3)
//   defaultMinMakeable — starting slider value (default 60)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Section } from "./primitives.jsx";
import { extractPrepGroups } from "../lib/recipe-match.js";

export default function PrepSuggestions({ recipes, pantry, outOfStock, initialGroups = 3, defaultMinMakeable = 60 }) {
  // `reroll` reshuffles the recipe order on demand (E1). The shuffle is
  // otherwise stable across unrelated re-renders because it's memoised.
  const [reroll, setReroll] = useState(0);
  // `visible` is how many recipe groups to render; "Show more" grows it
  // without rerolling so newly-revealed groups are the next in the shuffle.
  const [visible, setVisible] = useState(initialGroups);
  // `minMakeable` is the makeability floor, driven by the slider.
  const [minMakeable, setMinMakeable] = useState(defaultMinMakeable);

  const groups = useMemo(
    () => extractPrepGroups(recipes, pantry, outOfStock, minMakeable),
    [recipes, pantry, outOfStock, minMakeable, reroll],
  );

  // Whether anything is curated at all, independent of the slider — this
  // gates the whole section (F1). If recipes have prep_steps but the
  // slider hides them, we keep the section so the slider stays reachable.
  const anyPrep = useMemo(
    () => recipes.some(r => Array.isArray(r.prep_steps) && r.prep_steps.length),
    [recipes],
  );

  // Collapse the visible window when the underlying set changes (reroll or
  // a new threshold) so "Show more" starts fresh.
  useEffect(() => { setVisible(initialGroups); }, [reroll, minMakeable, initialGroups]);

  if (!anyPrep) return null;

  const shown = groups.slice(0, visible);
  const remaining = groups.length - shown.length;

  return <Section title="Got 5 mins? — Prep-ahead suggestions" tone="accent"
    subtitle="Small mise-en-place tasks you could knock off now to get ahead, grouped by recipe" collapsible defaultOpen={false}
    tip="Quick prep steps drawn from recipes you can currently make, grouped by dish. Use the slider to widen or narrow by how much of each recipe you already have. Show more reveals further recipes; Refresh reshuffles.">
    <div className="flex flex-wrap gap-2 mb-2 items-center justify-between">
      <label className="text-xs text-stone-600 flex items-center gap-1" title="Only show prep for recipes you already have at least this percentage of ingredients for">
        Min makeable {minMakeable}%
        <input type="range" min="0" max="100" step="10" value={minMakeable} onChange={e=>setMinMakeable(+e.target.value)} className="w-28"/>
      </label>
      <button className="pill" onClick={() => setReroll(r => r + 1)} title="Reshuffle the recipes">↻ Refresh</button>
    </div>
    {shown.length ? <>
      <div className="space-y-3">
        {shown.map(g => (
          <div key={g.recipeId} className="border-l-2 border-teal-600 pl-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-stone-800">{g.recipeName}</span>
              <span className="text-xs text-stone-400 shrink-0">{g.pct}% makeable · {g.tasks.length} step{g.tasks.length > 1 ? "s" : ""}</span>
            </div>
            <ul className="text-sm text-stone-700 mt-1 space-y-0.5">
              {g.tasks.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-teal-600/60 shrink-0">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {remaining > 0 && <div className="flex justify-center mt-3">
        <button className="pill" onClick={() => setVisible(v => v + initialGroups)}
          title="Reveal more recipes">Show more recipes ({remaining} more)</button>
      </div>}
    </> : <div className="text-sm text-stone-500 py-2">
      No recipes at ≥{minMakeable}% makeable. Lower the slider to see more.
    </div>}
  </Section>;
}
