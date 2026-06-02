// ============================================================
// PrepSuggestions — Cook tab "Got 5 mins?" section (backlog #9)
// ============================================================
// Surfaces a handful of small mise-en-place prep tasks (chop the
// onion, make the harissa paste, mix the spice rub) drawn from
// recipes the household can currently make. A 5-minute productivity
// nudge: "I have a spare moment" → "I just prepped tonight's tagine".
//
// Data lives in recipes.prep_steps (jsonb array of short strings),
// hand-curated by Max. extractPrepTasks does the filtering +
// sampling; this component just owns the reroll state + render.
//
// Empty-state (F1 from scope): when no cookable recipe has any
// prep_steps, extractPrepTasks returns [] and we render nothing.
//
// Props:
//   recipes     — array of mapped recipe rows (from useRecipes())
//   pantry      — array of mapped pantry rows
//   outOfStock  — Set of item names flagged out (feeds makeability)
//   count       — how many tasks to show (default 5)
// ============================================================

import { useMemo, useState } from "react";
import { Section } from "./primitives.jsx";
import { extractPrepTasks } from "../lib/recipe-match.js";

export default function PrepSuggestions({ recipes, pantry, outOfStock, count = 5 }) {
  // `reroll` rerolls the random sample on demand (E1). The sample is
  // otherwise stable across unrelated re-renders because it's memoised.
  const [reroll, setReroll] = useState(0);
  const tasks = useMemo(
    () => extractPrepTasks(recipes, pantry, outOfStock, count),
    [recipes, pantry, outOfStock, count, reroll],
  );

  if (!tasks.length) return null;

  return <Section title="Got 5 mins? — Prep-ahead suggestions" tone="accent"
    subtitle="Small mise-en-place tasks you could knock off now to get ahead" collapsible defaultOpen={false}
    tip="Quick prep steps drawn from recipes you can currently make. Tackle one in a spare five minutes for a head start on a future meal. Hit refresh for a new set.">
    <div className="flex justify-end mb-2">
      <button className="pill" onClick={() => setReroll(r => r + 1)} title="Show a different set of prep tasks">↻ Refresh</button>
    </div>
    <ul className="text-sm space-y-1">
      {tasks.map((t, i) => <li key={i} className="flex justify-between items-baseline border-b border-stone-100 py-1 gap-3">
        <span>{t.task}</span>
        <span className="text-xs text-stone-500 shrink-0">for {t.recipeName}</span>
      </li>)}
    </ul>
  </Section>;
}
