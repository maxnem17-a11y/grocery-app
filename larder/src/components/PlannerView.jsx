// ============================================================
// PlannerView — the Cook tab (opinionated first-screen redesign)
// ============================================================
// Replaces the previous five-default-collapsed-accordion layout with an
// opinionated two-column first screen. The expired-items "Use today or
// bin" banner is rendered by App above the tab nav (it needs the pantry
// mutation callbacks and must be the first focusable element); everything
// else lives here.
//
// Layout (≥1024px): left column (~2/3) + quiet right rail (~1/3).
//   Left:  Tonight's pick → Everybody eats (top 3, See all) → Got 5 mins?
//          → Gains (collapsed) → Quick wins (collapsed) → Cooked log
//   Rail:  Going soon (always-visible compact list of items 0–5d out)
// Below 1024px the grid collapses to a single column; DOM order is left-
// column-first then rail (a11y: DOM order matches visual order), so the
// rail stacks at the bottom on mobile.
//
// What changed vs the old layout (ranking logic itself is untouched —
// only filtering + surfacing):
//   - Past-expiry items moved OUT of "Going soon" into the banner; the
//     rail now holds only 0–5d items.
//   - All left-column meal sections exclude "noise" recipes (>90 min or
//     condiment/drink/syrup/… tags) via isNoiseRecipe.
//   - Gains now requires a non-null protein ≥ 20 (was ≥30 with no null
//     guard) so a recipe with no protein data never shows as high-protein.
//   - A single "Tonight's pick" is chosen + deduped out of the sections
//     below; Quick wins and Everybody eats also dedupe against each other
//     (Gains stays independent — high-protein is a separate intent).
//
// Props:
//   pantry           — array of mapped pantry rows
//   outOfStock       — Set of item names flagged out
//   cooked           — array of mapped cooked-log rows
//   addCooked        — (recipe) => void  (Tonight's pick "Mark cooked")
//   cookedSyncErrors — { [recipeId]: errorMessage }
// ============================================================

import { useMemo, useState } from "react";
import { Section } from "./primitives.jsx";
import RecipeMicroList from "./RecipeMicroList.jsx";
import PrepSuggestions from "./PrepSuggestions.jsx";
import TonightsPick from "./TonightsPick.jsx";
import GoingSoonRail from "./GoingSoonRail.jsx";
import { daysUntilExpiry, formatDate } from "../lib/pantry-math.js";
import { lc } from "../lib/text.js";
import { audienceFromFlags, flagsForRecipe } from "../lib/allergens.js";
import { makeability, pantryMatchSet, isNoiseRecipe, totalTime } from "../lib/recipe-match.js";
import { useAllergens } from "../contexts/AllergensContext.jsx";
import { useRecipes } from "../contexts/RecipesContext.jsx";

export default function PlannerView({ pantry, outOfStock, cooked, addCooked, cookedSyncErrors }) {
  const { allergens } = useAllergens();
  const { recipes, version } = useRecipes();
  const [eatAll, setEatAll] = useState(false);

  const matchSet = useMemo(() => pantryMatchSet(pantry, outOfStock), [pantry, outOfStock]);
  const decorated = useMemo(() => recipes.map(r => {
    const m = makeability(r, matchSet);
    const f = flagsForRecipe(r, allergens);
    return { ...r, _make: m, _flags: f, _audience: r.audience || audienceFromFlags(f) };
  }), [recipes, matchSet, allergens, version]);

  // ----- Expiry split: banner gets <0 (handled in App); rail gets 0–5 -----
  const goingSoon = useMemo(() => pantry
    .filter(p => !outOfStock.has(p.item))
    .map(p => ({ ...p, _dExp: daysUntilExpiry(p) }))
    .filter(p => p._dExp !== null && p._dExp >= 0 && p._dExp <= 5)
    .sort((a, b) => a._dExp - b._dExp), [pantry, outOfStock]);

  // Lowercase set of going-soon item names (+ parenthetical-stripped
  // variants), mirroring pantryMatchSet so recipe ingredients resolve the
  // same way makeability does.
  const expSet = useMemo(() => {
    const s = new Set();
    for (const e of goingSoon) {
      const k = lc(e.item).trim();
      s.add(k);
      s.add(k.replace(/\s*\(.*?\)\s*/g, "").trim());
    }
    return s;
  }, [goingSoon]);

  // Names of the expiring ingredients a recipe uses (for ranking + chips).
  const expiringUsedFor = useMemo(() => (r) => {
    const out = [];
    for (const i of (r.ingredients || [])) {
      const m = (i.pantry_match || i.item || "").toLowerCase().trim();
      if (!m) continue;
      const cm = m.replace(/\s*\(.*?\)\s*/g, "").trim();
      if (expSet.has(m) || expSet.has(cm)) out.push(i.item || i.pantry_match);
    }
    return out;
  }, [expSet]);

  // ----- Meal pool: drop noise (long cooks, condiments, drinks, …) -----
  const mealPool = useMemo(() => decorated.filter(r => !isNoiseRecipe(r)), [decorated]);
  const wholeHousehold = useMemo(
    () => mealPool.filter(r => r._audience === "whole-household"),
    [mealPool]);

  // ----- Tonight's pick -----
  // Rank whole-household meals by (expiring ingredients used) → protein →
  // makeability. If the top pick uses nothing expiring, fall back to the
  // most-makeable whole-household meal and label it "Easy tonight".
  const pick = useMemo(() => {
    if (!wholeHousehold.length) return { recipe: null };
    const ranked = wholeHousehold
      .map(r => ({ r, exp: expiringUsedFor(r) }))
      .sort((a, b) =>
        b.exp.length - a.exp.length ||
        (b.r.protein_per_serving_g || 0) - (a.r.protein_per_serving_g || 0) ||
        b.r._make.pct - a.r._make.pct);
    if (ranked[0].exp.length > 0) {
      return { recipe: ranked[0].r, mode: "tonight", expiring: ranked[0].exp, upNext: ranked[1]?.r || null };
    }
    const byMake = wholeHousehold.slice().sort((a, b) => b._make.pct - a._make.pct);
    return { recipe: byMake[0], mode: "easy", expiring: [], upNext: byMake[1] || null };
  }, [wholeHousehold, expiringUsedFor]);

  const isQuickWin = (r) => totalTime(r) <= 25 && r._make.pct >= 50;

  // ----- Sections with dedup (Tonight's pick > Quick wins > Everybody eats;
  // Gains is independent and may re-use any recipe). -----
  const { quickWins, everybody, gains, tonightNote } = useMemo(() => {
    const claimed = new Set(pick.recipe ? [pick.recipe.id] : []);

    const quickAll = mealPool
      .filter(r => isQuickWin(r))
      .sort((a, b) => b._make.pct - a._make.pct);
    const quickWins = [];
    for (const r of quickAll) {
      if (claimed.has(r.id)) continue;
      claimed.add(r.id);
      let note = null;
      if (r._audience === "whole-household") note = "also whole-household";
      else if (expiringUsedFor(r).length) note = "also expiring";
      quickWins.push(note ? { ...r, _alsoNote: note } : r);
    }

    const everyAll = wholeHousehold.slice().sort((a, b) => b._make.pct - a._make.pct);
    const everybody = [];
    for (const r of everyAll) {
      if (claimed.has(r.id)) continue;
      claimed.add(r.id);
      const note = expiringUsedFor(r).length ? "also expiring" : null;
      everybody.push(note ? { ...r, _alsoNote: note } : r);
      if (everybody.length >= 6) break;
    }

    const gains = mealPool
      .filter(r => r._flags.max !== "blocked"
        && typeof r.protein_per_serving_g === "number"
        && r.protein_per_serving_g >= 20)
      .sort((a, b) => (b.protein_per_serving_g || 0) - (a.protein_per_serving_g || 0))
      .slice(0, 6);

    const tonightNote = pick.recipe && isQuickWin(pick.recipe) ? "also a quick win" : null;

    return { quickWins, everybody, gains, tonightNote };
  }, [mealPool, wholeHousehold, pick, expiringUsedFor]);

  const everyShown = eatAll ? everybody : everybody.slice(0, 3);

  // ----- Left column -----
  const leftColumn = (
    <div className="space-y-4">
      {pick.recipe && (
        <TonightsPick
          recipe={pick.recipe}
          mode={pick.mode}
          expiringUsed={pick.expiring}
          upNext={pick.upNext}
          alsoNote={tonightNote}
          onMarkCooked={() => addCooked && addCooked(pick.recipe)}
          cookedSyncError={(cookedSyncErrors || {})[pick.recipe.id]}
        />
      )}

      <Section title={`Everybody eats · ${everybody.length}`} tone="ok"
        subtitle="Whole-household-safe, ranked by what you already have" collapsible defaultOpen
        tip="Recipes safe for everyone (Max, Emily, and Khalil), ranked by how much of the ingredient list you already have in the pantry. Excludes condiments, drinks and long cooks.">
        <RecipeMicroList items={everyShown} />
        {everybody.length > 3 && (
          <div className="mt-2">
            <button className="text-xs text-stone-600 hover:text-stone-900 underline"
              onClick={() => setEatAll(a => !a)}>
              {eatAll ? "Show fewer" : `See all ${everybody.length} →`}
            </button>
          </div>
        )}
      </Section>

      <PrepSuggestions recipes={recipes} pantry={pantry} outOfStock={outOfStock} defaultOpen />

      <Section title={`Gains · ${gains.length}`} tone="info"
        subtitle="High-protein options (≥20g/serving), pescatarian-safe" collapsible defaultOpen={false}
        tip="Recipes Max can eat (no meat) with a recorded protein of at least 20g per serving — useful for training days. Sorted by protein, highest first. Recipes with no protein data are excluded.">
        <RecipeMicroList items={gains} />
      </Section>

      <Section title={`Quick wins · ${quickWins.length}`} tone="accent"
        subtitle="Eat in under 25 minutes, at least half in-pantry" collapsible defaultOpen={false}
        tip="Fast meals (prep + cook ≤25 min) where you already have at least half the ingredients. Excludes condiments, drinks and long cooks.">
        <RecipeMicroList items={quickWins} />
      </Section>

      {cooked.length > 0 && (
        <Section title={`Cooked log · ${cooked.length}`} tone="neutral"
          subtitle="Saved to local storage on this device" collapsible defaultOpen={false}
          tip="Recipes you've marked cooked. This log lives only in this browser — paste it into a Claude session so it can update your canonical pantry quantities.">
          <ul className="text-sm space-y-1">
            {cooked.slice().reverse().map((c, i) => (
              <li key={i} className="flex justify-between border-b border-stone-100 py-1">
                <span>{c.name}</span>
                <span className="text-xs text-stone-500 mono">{formatDate(c.date)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );

  // Rail only renders when there's something going soon; otherwise the left
  // column takes the full width.
  if (goingSoon.length === 0) return leftColumn;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5 items-start">
      <div className="lg:col-span-2">{leftColumn}</div>
      <div><GoingSoonRail items={goingSoon} /></div>
    </div>
  );
}
