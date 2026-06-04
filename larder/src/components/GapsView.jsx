// ============================================================
// GapsView — the Basket tab (consolidated)
// ============================================================
// 2026-06 Basket overhaul. Reduced from three overlapping sections
// (suggested basket + "Pick your basket gaps" table + leverage) to ONE
// canonical basket view plus the leverage table. The standalone
// regulars/gaps table is gone — its data lives inside the basket's
// "Refill regulars" group, and its status filters moved into that
// group's diagnostic drawer (see SuggestedBasket → RegularsDrawer).
//
// This component now owns the state SHARED between the basket and the
// leverage table so the two stay in sync:
//   addedIngredients — ingredients added via the leverage "Add to basket"
//     CTA; unioned into the matchSet (leverage re-ranks, the ingredient
//     drops out) AND surfaced in the basket's Unlock-recipes group.
//   excludedItems    — basket rows removed via × this cycle.
//   minOrders        — the "regular" threshold; shared with the KPI so
//     REAL GAPS reconciles with the basket.
//
// Props:
//   pantry, outOfStock — mapped pantry rows + out Set
//   goToRecipe(name)   — navigate to the Recipes tab, prefilling search
//                        (wired from App; powers clickable leverage rows)
// ============================================================

import { useCallback, useMemo, useState } from "react";
import { InfoTip, Section, Stat } from "./primitives.jsx";
import SuggestedBasket from "./SuggestedBasket.jsx";
import LeverageTileGrid from "./LeverageTileGrid.jsx";
import { formatDate } from "../lib/pantry-math.js";
import { audienceFromFlags, flagsForRecipe } from "../lib/allergens.js";
import { leverageScore, normalizeIngredientName, pantryMatchSet } from "../lib/recipe-match.js";
import { computeRegularsAndGaps } from "../lib/gap-analysis.js";
import { lc } from "../lib/text.js";
import { HOUSEHOLD_RULES } from "../lib/household-rules.js";
import { useAllergens } from "../contexts/AllergensContext.jsx";
import { useReceipts } from "../contexts/ReceiptsContext.jsx";
import { useRecipes } from "../contexts/RecipesContext.jsx";
import { useTescoSkus } from "../contexts/TescoSkusContext.jsx";

export default function GapsView({ pantry, outOfStock, goToRecipe }) {
  const { receipts } = useReceipts();
  const { allergens } = useAllergens();
  const { skuIndex } = useTescoSkus();
  const { recipes, version: recipesVersion } = useRecipes();

  const [minOrders, setMinOrders] = useState(3);
  const [leverageLimit, setLeverageLimit] = useState(15);
  // Shared, lifted state.
  const [addedIngredients, setAddedIngredients] = useState(() => new Set());
  const [excludedItems, setExcludedItems] = useState(() => new Set());

  const addToBasket = useCallback((name) => {
    const nk = normalizeIngredientName(name);
    if (!nk) return;
    setAddedIngredients(prev => { const next = new Set(prev); next.add(nk); return next; });
  }, []);
  const removeItem = useCallback((name) => {
    setExcludedItems(prev => { const next = new Set(prev); next.add(lc(name)); return next; });
  }, []);
  const restoreItem = useCallback((name) => {
    setExcludedItems(prev => { const next = new Set(prev); next.delete(lc(name)); return next; });
  }, []);

  // Leverage: matchSet unions in addedIngredients so added ingredients drop
  // out and downstream recipes re-rank — same computation the basket uses.
  const leverage = useMemo(() => {
    const matchSet = pantryMatchSet(pantry, outOfStock);
    for (const a of addedIngredients) matchSet.add(a);
    const decorated = recipes.map(r => {
      const f = flagsForRecipe(r, allergens);
      return { ...r, _flags: f, _audience: r.audience || audienceFromFlags(f) };
    });
    const eligible = decorated.filter(r => r._flags.khalil !== "blocked");
    return leverageScore(eligible, matchSet, leverageLimit);
  }, [recipes, pantry, outOfStock, leverageLimit, allergens, recipesVersion, addedIngredients]);

  const analysis = useMemo(() => {
    const base = computeRegularsAndGaps(pantry, receipts, allergens, minOrders, skuIndex);
    if (!base) return null;
    return {
      latest: receipts[base.latestIdx],
      orderCount: receipts.length,
      regulars: base.regulars,
      gaps: base.gaps,
      excluded: base.regulars.filter(r => r.excludedReason),
    };
  }, [pantry, receipts, allergens, minOrders, skuIndex]);

  if (!analysis) {
    return <div className="card p-4 text-sm text-stone-500">
      No Tesco order history loaded yet. Receipts are fetched from Supabase on page load — if this persists, check the network tab or browser console.
    </div>;
  }

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3">
      <Stat label={`Regulars (≥${minOrders})`} value={analysis.regulars.length}
        tip={`Items appearing in at least ${minOrders} of ${analysis.orderCount} parsed Tesco orders. Adjust via the ⚙ settings pill on the basket.`} />
      <Stat label="Real gaps" value={analysis.gaps.length} tone={analysis.gaps.length > 0 ? "warn" : "ok"}
        sub="Not in latest order, not in pantry" tipAlign="right"
        tip={`Items you buy regularly that aren't in your latest delivery (#${analysis.latest.order_number}, ${formatDate(analysis.latest.delivery_date)}) and aren't in the pantry. Excludes ${analysis.excluded.length} item(s) ruled out by ${(HOUSEHOLD_RULES.never_restock || []).length} household never-restock rule(s). This count feeds the basket's "Refill regulars" group — that group may show fewer if some gaps were removed this cycle or merged into "Replace what's expiring".`} />
    </div>

    <SuggestedBasket
      pantry={pantry}
      outOfStock={outOfStock}
      minOrders={minOrders}
      setMinOrders={setMinOrders}
      addedIngredients={addedIngredients}
      excludedItems={excludedItems}
      onRemoveItem={removeItem}
      onRestoreItem={restoreItem}
    />

    <Section
      title="Ingredients that unlock the most recipes"
      subtitle="Ranked by how many household-safe recipes use each ingredient. Add one to your basket to unlock every recipe listed below it."
      tone="accent"
      collapsible
      defaultOpen={false}
      tip="A forward-looking view: 'what single ingredient would maximise the recipes I can make from the existing pantry?'. Khalil-blocked recipes are excluded. Adding an ingredient updates this ranking live."
    >
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="text-sm flex items-center gap-2">
          <span className="text-stone-600">Show top:</span>
          <select value={leverageLimit} onChange={e => setLeverageLimit(parseInt(e.target.value))} className="border border-stone-300 rounded px-2 py-1 text-sm">
            {[10, 15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            <option value={9999}>All</option>
          </select>
        </label>
        <span className="text-xs text-stone-600 flex items-center gap-1">{leverage.length} candidate{leverage.length === 1 ? "" : "s"} · click a row to see the recipes it affects <InfoTip>Duplicate spellings (ginger / fresh ginger) are merged into one row.</InfoTip></span>
      </div>
      {leverage.length === 0
        ? <div className="text-sm text-stone-600">No leverage opportunities — every recipe is already ≥70% makeable, or remaining recipes are Khalil-blocked.</div>
        : <LeverageTileGrid items={leverage} addedIngredients={addedIngredients} onAddToBasket={addToBasket} onOpenRecipe={goToRecipe} />
      }
    </Section>
  </div>;
}
