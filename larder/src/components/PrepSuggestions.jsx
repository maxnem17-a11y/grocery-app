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
// by recipe; this component owns the reroll + show-more state + render.
//
// Tasks are GROUPED BY RECIPE — each cookable recipe is one labelled
// block (recipe name header + its prep steps beneath) so it's obvious
// which steps belong to which dish. "Show more recipes" reveals further
// groups in place; ↻ Refresh reshuffles the whole set.
//
// Empty-state (F1 from scope): when no cookable recipe has any
// prep_steps, extractPrepGroups returns [] and we render nothing.
//
// Props:
//   recipes        — array of mapped recipe rows (from useRecipes())
//   pantry         — array of mapped pantry rows
//   outOfStock     — Set of item names flagged out (feeds makeability)
//   initialGroups  — how many recipe groups to show before "Show more"
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Section } from "./primitives.jsx";
import { extractPrepGroups } from "../lib/recipe-match.js";

export default function PrepSuggestions({ recipes, pantry, outOfStock, initialGroups = 3 }) {
  // `reroll` reshuffles the recipe order on demand (E1). The shuffle is
  // otherwise stable across unrelated re-renders because it's memoised.
  const [reroll, setReroll] = useState(0);
  // `visible` is how many recipe groups to render; "Show more" grows it
  // without rerolling so newly-revealed groups are the next in the shuffle.
  const [visible, setVisible] = useState(initialGroups);

  const groups = useMemo(
    () => extractPrepGroups(recipes, pantry, outOfStock),
    [recipes, pantry, outOfStock, reroll],
  );

  // A reroll (or losing groups to a pantry change) should collapse the
  // window back to the initial count so "Show more" starts fresh.
  useEffect(() => { setVisible(initialGroups); }, [reroll, initialGroups]);

  if (!groups.length) return null;

  const shown = groups.slice(0, visible);
  const remaining = groups.length - shown.length;

  return <Section title="Got 5 mins? — Prep-ahead suggestions" tone="accent"
    subtitle="Small mise-en-place tasks you could knock off now to get ahead, grouped by recipe" collapsible defaultOpen={false}
    tip="Quick prep steps drawn from recipes you can currently make, grouped by dish. Tackle one in a spare five minutes for a head start on a future meal. Show more reveals further recipes; Refresh reshuffles.">
    <div className="flex justify-end mb-2">
      <button className="pill" onClick={() => setReroll(r => r + 1)} title="Reshuffle the recipes">↻ Refresh</button>
    </div>
    <div className="space-y-3">
      {shown.map(g => (
        <div key={g.recipeId} className="border-l-2 border-teal-600 pl-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-stone-800">{g.recipeName}</span>
            <span className="text-xs text-stone-400 shrink-0">{g.tasks.length} step{g.tasks.length > 1 ? "s" : ""}</span>
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
  </Section>;
}
