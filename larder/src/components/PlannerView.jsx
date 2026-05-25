// ============================================================
// PlannerView — the Cook tab
// ============================================================
// Verbatim port of canonical index.html L2273–2340 with ONE
// deliberate deviation:
//
//   Decision A1 in step 7g: the canonical line
//       const skuIndex = useContext(TescoSkusContext);
//   is dead code (skuIndex is declared but never used anywhere
//   in PlannerView's body). Likely vestigial from before
//   SuggestedBasket was extracted as its own component. The
//   line is stripped here to avoid pulling in TescoSkusContext
//   infrastructure for a value that has no effect on rendered
//   output. Removing it preserves canonical behaviour exactly
//   (verbatim-port discipline applies to live code, not no-op
//   lines).
//
// Structural changes vs canonical (no behaviour change):
//   - hooks imported by name
//   - context reads use the extracted hooks
//       useReceipts()  / useAllergens() / useRecipes()
//     instead of canonical's bare useContext(...) calls
//   - `RECIPES` module global → `recipes` from the
//     RecipesContext hook (7g/7h refactor)
//   - primitives + helpers + RecipeMicroList imported
//
// Props:
//   pantry      — array of mapped pantry rows
//   outOfStock  — Set of item names flagged out (drives matchSet
//                  filtering + the "Going soon" Section)
//   cooked      — array of mapped cooked-log rows (only `.length`
//                  and the listing in the "Cooked log" Section
//                  are consumed)
// ============================================================

import { useMemo } from "react";
import { Chip, Section } from "./primitives.jsx";
import RecipeMicroList from "./RecipeMicroList.jsx";
import { daysUntilExpiry, formatDate } from "../lib/pantry-math.js";
import { lc } from "../lib/text.js";
import { audienceFromFlags, flagsForRecipe } from "../lib/allergens.js";
import { makeability, pantryMatchSet } from "../lib/recipe-match.js";
import { useAllergens } from "../contexts/AllergensContext.jsx";
import { useRecipes } from "../contexts/RecipesContext.jsx";

export default function PlannerView({pantry, outOfStock, cooked}){
  // Allergens come from AllergensContext (commit 14.5). Required to flag
  // recipes against household dietary rules; before the boot fetch lands
  // everything reads as Khalil-safe, then re-renders on update.
  const { allergens } = useAllergens();
  // Recipes come from RecipesContext (step 7g/7h). decorated below
  // uses the recipes array directly; useMemo's `version` dep keeps the
  // memoised decoration honest if a recipe is mutated elsewhere.
  const { recipes, version } = useRecipes();
  const matchSet = useMemo(()=> pantryMatchSet(pantry, outOfStock), [pantry, outOfStock]);
  const decorated = useMemo(()=> recipes.map(r=>{
    const m = makeability(r, matchSet);
    const f = flagsForRecipe(r, allergens);
    return {...r, _make:m, _flags:f, _audience: r.audience || audienceFromFlags(f)};
  }), [recipes, matchSet, allergens, version]);

  const wholeHousehold = decorated.filter(r=>r._audience==="whole-household").sort((a,b)=>b._make.pct-a._make.pct).slice(0,6);
  const highProteinAdult = decorated.filter(r=> r._flags.max!=="blocked" && (r.protein_per_serving_g||0)>=30).sort((a,b)=>(b.protein_per_serving_g||0)-(a.protein_per_serving_g||0)).slice(0,6);
  const quickMakeable = decorated.filter(r=> ((r.prep_time_mins||0)+(r.cook_time_mins||0))<=25 && r._make.pct>=50).sort((a,b)=>b._make.pct-a._make.pct).slice(0,6);

  const expiring = pantry.filter(p=>!outOfStock.has(p.item)).map(p=>({...p, _dExp:daysUntilExpiry(p)})).filter(p=>p._dExp!==null && p._dExp<=5).sort((a,b)=>a._dExp-b._dExp);
  const expiringNames = new Set(expiring.map(e=>lc(e.item)));
  const usesExpiring = decorated.filter(r=>{
    return (r.ingredients||[]).some(i=> expiringNames.has(lc(i.pantry_match||"")));
  }).sort((a,b)=>b._make.pct-a._make.pct).slice(0,6);

  return <div className="space-y-6">
    {expiring.length>0 && <Section title="Going soon — expiring ≤5 days" tone="warn" collapsible defaultOpen={false}
      tip="Pantry items estimated to expire within 5 days, sorted by urgency. The recipes below are ones that use at least one of these items.">
      <div className="flex flex-wrap gap-2">
        {expiring.map((e,i)=> <Chip key={i} tone={e._dExp<=2?"danger":"warn"} title={e.expires ? `expires ${formatDate(e.expires)}` : ""}>{e.item} · {e._dExp}d</Chip>)}
      </div>
      {usesExpiring.length>0 && <>
        <div className="text-xs text-stone-500 mt-3 mb-2 uppercase tracking-wider">Recipes that use these expiring items</div>
        <RecipeMicroList items={usesExpiring}/>
      </>}
    </Section>}
    <Section title={`Everybody eats — Whole-household picks · ${wholeHousehold.length}`} tone="ok" subtitle="Top 6 by makeability — recipes you mostly already have ingredients for" collapsible defaultOpen={false}
      tip="Recipes safe for everyone (Max, Emily, and Khalil), ranked by how much of the ingredient list you already have in the pantry.">
      <RecipeMicroList items={wholeHousehold}/>
    </Section>
    <Section title="Gains — High-protein options" tone="info" subtitle="Top 6 by protein per serving — pescatarian-safe" collapsible defaultOpen={false}
      tip="Recipes Max can eat (no meat) that hit at least 30g protein per serving — useful for training days. Sorted by protein content, highest first.">
      <RecipeMicroList items={highProteinAdult}/>
    </Section>
    <Section title="Quick wins — Eat in under 25 mins" tone="accent" subtitle="At least 50% in-pantry and short total time" collapsible defaultOpen={false}
      tip="Fast meals (prep + cook ≤25 min) where you already have at least half the ingredients. Good for weeknight 'what can I make tonight'.">
      <RecipeMicroList items={quickMakeable}/>
    </Section>
    {cooked.length > 0 && <Section title={`Cooked log · ${cooked.length}`} tone="neutral" subtitle="Saved to local storage on this device" collapsible defaultOpen={false}
      tip="Recipes you've marked cooked via the Recipes tab. This log lives only in this browser — paste it into a Claude session so it can update your canonical pantry quantities.">
      <ul className="text-sm space-y-1">
        {cooked.slice().reverse().map((c,i)=> <li key={i} className="flex justify-between border-b border-stone-100 py-1">
          <span>{c.name}</span>
          <span className="text-xs text-stone-500 mono">{formatDate(c.date)}</span>
        </li>)}
      </ul>
    </Section>}
  </div>;
}
