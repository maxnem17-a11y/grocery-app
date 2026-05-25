// ============================================================
// GapsView — the Basket tab
// ============================================================
// Verbatim port of canonical index.html L4242–4482. Step 7j-2;
// expands the 22-line shell that 7j-1 landed.
//
// Structural changes vs. canonical (no behaviour change):
//   - hooks via named import from "react"
//   - context reads use the extracted hooks
//       useReceipts() / useAllergens() / useTescoSkus() / useRecipes()
//     instead of canonical's bare useContext(...) calls
//   - RECIPES module global → `recipes` from useRecipes() hook;
//     `recipes` + `recipesVersion` added to the `leverage`
//     useMemo deps (canonical's deps `[pantry, outOfStock,
//     leverageLimit, allergens]` were correct when RECIPES was
//     a module global but stale-now-that-it's-React-state — same
//     dep-array correction as 7g's AuditView fix)
//   - primitives + helpers + SuggestedBasket + LeverageTileGrid imported
//
// Combines:
//   - top-of-tab KPIs (Regulars / Real gaps)
//   - <SuggestedBasket> (the 7j-1 recommendation engine — same
//     position as canonical L4367)
//   - "Pick your basket gaps" Section with the regulars/gaps
//     table (sortable, filterable by status)
//   - "Ingredients that unlock the most recipes" Section with
//     <LeverageTileGrid>
//
// Props:
//   pantry      — mapped pantry rows
//   outOfStock  — Set of item names flagged out
// ============================================================

import { useMemo, useState } from "react";
import { Chip, InfoTip, Section, SortHeader, Stat } from "./primitives.jsx";
import SuggestedBasket from "./SuggestedBasket.jsx";
import LeverageTileGrid from "./LeverageTileGrid.jsx";
import { formatDate } from "../lib/pantry-math.js";
import { lc } from "../lib/text.js";
import { audienceFromFlags, flagsForRecipe } from "../lib/allergens.js";
import { leverageScore, pantryMatchSet } from "../lib/recipe-match.js";
import { computeRegularsAndGaps } from "../lib/gap-analysis.js";
import { HOUSEHOLD_RULES } from "../lib/household-rules.js";
import { useAllergens } from "../contexts/AllergensContext.jsx";
import { useReceipts } from "../contexts/ReceiptsContext.jsx";
import { useRecipes } from "../contexts/RecipesContext.jsx";
import { useTescoSkus } from "../contexts/TescoSkusContext.jsx";

export default function GapsView({pantry, outOfStock}){
  // The Gaps view's whole job is comparing pantry against order history.
  const { receipts } = useReceipts();
  const { allergens } = useAllergens();
  // SKU index passed into computeRegularsAndGaps so SKU-level
  // household_rule_excluded entries surface in the "excluded" filter
  // alongside the regex-pattern rules.
  const { skuIndex } = useTescoSkus();
  const { recipes, version: recipesVersion } = useRecipes();
  const [minOrders, setMinOrders] = useState(3);
  const [filter, setFilter] = useState("gap"); // gap | all | restocked | excluded
  const [leverageLimit, setLeverageLimit] = useState(15);
  // Regulars/gaps table sort — binary asc↔desc toggle, per-column smart defaults (14.16).
  //   count → desc (most-frequent regulars first; matches computeRegularsAndGaps order)
  //   item → asc (A→Z)
  //   lastSeen → asc (oldest timestamp first = STALEST first — the whole point of the
  //              column is spotting things you haven't bought in ages)
  //   status → asc (gap=0 first — most actionable on top)
  const REG_DEFAULT_DIR = { count:"desc", item:"asc", lastSeen:"asc", status:"asc" };
  const [regSortBy, setRegSortBy] = useState("count");
  const [regSortDir, setRegSortDir] = useState("desc");
  const toggleRegSort = (key) => {
    if (regSortBy !== key) {
      setRegSortBy(key);
      setRegSortDir(REG_DEFAULT_DIR[key] || "asc");
      return;
    }
    setRegSortDir(regSortDir === "asc" ? "desc" : "asc");
  };

  // Leverage: ingredients that unlock the most blocked recipes.
  // Deps include `recipes` + `recipesVersion` because recipes is now
  // reactive state (was a module global in canonical); without them
  // the leverage list would stale on recipe mutations. Same dep-array
  // fix landed in 7g for AuditView.
  const leverage = useMemo(()=>{
    const matchSet = pantryMatchSet(pantry, outOfStock);
    const decorated = recipes.map(r=>{
      const f = flagsForRecipe(r, allergens);
      return {...r, _flags:f, _audience: r.audience || audienceFromFlags(f)};
    });
    // Filter to household-safe recipes by default so we don't suggest adding ingredients to unlock Khalil-blocked meals
    const eligible = decorated.filter(r => r._flags.khalil !== "blocked");
    return leverageScore(eligible, matchSet, leverageLimit);
  }, [recipes, pantry, outOfStock, leverageLimit, allergens, recipesVersion]);

  const analysis = useMemo(()=>{
    const base = computeRegularsAndGaps(pantry, receipts, allergens, minOrders, skuIndex);
    if (!base) return null;
    const latest = receipts[base.latestIdx];
    const restocked = base.regulars.filter(r => r.inLatest || r.pantryItem);
    const excluded = base.regulars.filter(r => r.excludedReason);
    return {
      latest,
      latestIdx: base.latestIdx,
      orderCount: receipts.length,
      regulars: base.regulars,
      gaps: base.gaps,
      restocked,
      excluded,
    };
  }, [pantry, receipts, allergens, minOrders, skuIndex]);

  // Status sort order: gap (most actionable) = 0 → in latest = 1 → in pantry = 2 → excluded = 3.
  // Asc puts gaps on top (the useful default), desc puts excluded on top.
  const statusOrd = (r) => {
    if (r.excludedReason) return 3;
    if (r.inLatest) return 1;
    if (r.pantryItem) return 2;
    return 0; // gap
  };

  const visibleRaw = analysis
    ? (filter === "gap" ? analysis.gaps
        : filter === "restocked" ? analysis.restocked
        : filter === "excluded" ? analysis.excluded
        : analysis.regulars)
    : [];
  // Does the current filter contain rows with more than one status? On "gap" / "restocked" /
  // "excluded" filters every row collapses to a single statusOrd value — sorting by status
  // is a no-op there. Used to grey out the Status header so the user knows clicking it
  // won't do anything visible (the root cause of the 'status sort looks broken' report:
  // it *was* sorting; there just wasn't any variance to act on).
  const hasStatusVariance = useMemo(() => {
    if (visibleRaw.length < 2) return false;
    const first = statusOrd(visibleRaw[0]);
    return visibleRaw.some(r => statusOrd(r) !== first);
  }, [visibleRaw]);
  const visible = useMemo(() => {
    const sorted = [...visibleRaw].sort((a, b) => {
      let cmp = 0;
      switch (regSortBy) {
        case "count": cmp = (a.count||0) - (b.count||0); break;
        case "item": cmp = lc(a.example||"").localeCompare(lc(b.example||"")); break;
        case "lastSeen": {
          // Use Date.parse — returns NaN for invalid; coerce to -Infinity so missing
          // dates sink to the bottom of asc (top of desc). Pure number subtraction is
          // safer than `new Date(x) - new Date(y)` when inputs are dodgy.
          const aT = a.lastSeenDate ? Date.parse(a.lastSeenDate) : NaN;
          const bT = b.lastSeenDate ? Date.parse(b.lastSeenDate) : NaN;
          const aOk = !isNaN(aT), bOk = !isNaN(bT);
          if (!aOk && !bOk) cmp = 0;
          else if (!aOk) cmp = 1;
          else if (!bOk) cmp = -1;
          else cmp = aT - bT;
          break;
        }
        case "status": cmp = statusOrd(a) - statusOrd(b); break;
        default: cmp = 0;
      }
      if (cmp === 0) cmp = lc(a.example||"").localeCompare(lc(b.example||"")); // tiebreaker
      return regSortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [visibleRaw, regSortBy, regSortDir]);

  if (!analysis) {
    return <div className="card p-4 text-sm text-stone-500">
      No Tesco order history loaded yet. Receipts are fetched from Supabase on page load — if this persists, check the network tab or browser console.
    </div>;
  }

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3">
      <Stat label={`Regulars (≥${minOrders})`} value={analysis.regulars.length}
        tip={`Items appearing in at least ${minOrders} different orders out of ${analysis.orderCount} parsed Tesco orders. Adjust the 'Min orders' selector below to be stricter or looser.`}/>
      <Stat label="Real gaps" value={analysis.gaps.length} tone={analysis.gaps.length>0?"warn":"ok"}
            sub="Not in latest order, not in pantry"
            tipAlign="right"
            tip={`The candidates for your next basket: items you buy regularly that aren't in your latest delivery (#${analysis.latest.order_number}, ${formatDate(analysis.latest.delivery_date)}) and aren't already in the pantry. Excludes anything ruled out by a household never-restock rule (${analysis.excluded.length} excluded by ${(HOUSEHOLD_RULES.never_restock||[]).length} rule(s)).`}/>
    </div>

    <SuggestedBasket pantry={pantry} outOfStock={outOfStock}/>

    <Section title="Pick your basket gaps" subtitle="Regulars you buy often that are missing from your pantry" tone="info" collapsible defaultOpen={false}
      tip="Compares the items you buy most often against what you currently have. Filters by category below.">
      <p className="text-sm text-stone-700 leading-relaxed">
        Spots items you buy regularly but don't currently have — so they're candidates for your next basket.
      </p>
      <ul className="text-sm text-stone-700 leading-relaxed mt-2 space-y-1 list-disc pl-5">
        <li><strong>Regulars</strong> = items appearing in {minOrders}+ of {analysis.orderCount} orders.</li>
        <li>Each regular is checked against (a) your <strong>latest Tesco delivery</strong> and (b) the <strong>current pantry</strong>.</li>
        <li>If it's missing from both, it's a <strong>likely gap</strong> — usually fresh produce or fast-moving staples.</li>
        <li>Items matching a <strong>household never-restock rule</strong> (e.g. dairy milk — no one drinks it) are filtered out so they don't keep appearing.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3 mt-3 mb-4">
        <label className="text-sm flex items-center gap-2">
          <span className="text-stone-500">Min orders:</span>
          <select value={minOrders} onChange={e=>setMinOrders(parseInt(e.target.value))} className="border border-stone-300 rounded px-2 py-1 text-sm" title="How many separate orders an item needs to appear in to count as a 'regular'. Higher = stricter.">
            <option value={2}>2 of {analysis.orderCount}</option>
            <option value={3}>3 of {analysis.orderCount}</option>
            <option value={4}>4 of {analysis.orderCount}</option>
            <option value={5}>5 of {analysis.orderCount}</option>
          </select>
        </label>
        <span className="text-xs text-stone-500">Higher threshold = stricter definition of 'regular'.</span>
      </div>

      <div className="border-t border-stone-200 pt-4">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h4 className="text-base font-semibold">
            {filter === "gap" ? "Likely real gaps — consider adding to next basket"
            : filter === "restocked" ? "Restocked or already in pantry — no action needed"
            : filter === "excluded" ? "Excluded by household rules"
            : "All regulars"}
          </h4>
          <span className="text-xs text-stone-500">{visible.length} item{visible.length===1?"":"s"}</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          <button onClick={()=>setFilter("gap")} className="pill" data-active={filter==="gap"} title="Items you buy regularly that are NOT in the latest order and NOT in the pantry — the actual restock candidates">Real gaps · {analysis.gaps.length}</button>
          <button onClick={()=>setFilter("restocked")} className="pill" data-active={filter==="restocked"} title="Regulars that ARE in the latest order or pantry — no action needed">Restocked / in pantry · {analysis.restocked.length}</button>
          <button onClick={()=>setFilter("excluded")} className="pill" data-active={filter==="excluded"} title="Regulars filtered out by household never-restock rules">Excluded · {analysis.excluded.length}</button>
          <button onClick={()=>setFilter("all")} className="pill" data-active={filter==="all"} title="Every regular regardless of status">All regulars · {analysis.regulars.length}</button>
        </div>

        {(HOUSEHOLD_RULES.never_restock||[]).length > 0 && filter === "excluded" && <div className="mb-3 p-3 rounded-lg border border-blue-200 bg-blue-50/30">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-2 flex items-center">Household never-restock rules <InfoTip>Patterns the household has explicitly opted out of. Anything matching one of these is filtered out of the 'Real gaps' list.</InfoTip></div>
          <div className="space-y-1.5 text-sm">
            {HOUSEHOLD_RULES.never_restock.map((r,i)=> <div key={i} className="flex items-baseline gap-2">
              <span className="mono text-xs bg-stone-100 px-1.5 py-0.5 rounded">{r.pattern}</span>
              <span className="text-stone-600">{r.reason}</span>
            </div>)}
          </div>
        </div>}

        {visible.length === 0 ? <div className="text-sm text-stone-500">Nothing here at this threshold.</div>
        : <div className="card overflow-hidden">
          <div className="px-3 py-2 border-b border-stone-200 bg-stone-50 text-[11px] uppercase tracking-wider text-stone-500 grid grid-cols-12 gap-2">
            <SortHeader colSpan={1} sortKey="count" sortBy={regSortBy} sortDir={regSortDir} onClick={toggleRegSort} align="center">×</SortHeader>
            <SortHeader colSpan={6} sortKey="item" sortBy={regSortBy} sortDir={regSortDir} onClick={toggleRegSort}>Item</SortHeader>
            <SortHeader colSpan={2} sortKey="lastSeen" sortBy={regSortBy} sortDir={regSortDir} onClick={toggleRegSort}>Last seen</SortHeader>
            <SortHeader colSpan={3} sortKey="status" sortBy={regSortBy} sortDir={regSortDir} onClick={toggleRegSort} align="right"
              disabled={!hasStatusVariance}
              disabledReason={`All rows in the '${filter==="gap"?"Real gaps":filter==="restocked"?"Restocked / in pantry":filter==="excluded"?"Excluded":""}' view share the same status — switch to 'All regulars' to sort by status.`}>Status</SortHeader>
          </div>
          <div className="divide-y divide-stone-100">
            {visible.map((r,i)=> <div key={i} className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-sm">
              <div className="col-span-1 text-center mono text-xs" title={`Appeared in ${r.count} of ${analysis.orderCount} orders`}>{r.count}</div>
              <div className="col-span-6">
                <div className="leading-tight">{r.example}</div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {r.allergen && <Chip tone="warn" title="Contains a Khalil allergen — fine for adults, not for him">Khalil: {r.allergen}</Chip>}
                  {r.pantryItem && <Chip tone="ok" title="Currently in pantry">pantry: {r.pantryItem}</Chip>}
                  {r.excludedReason && <Chip tone="info" title="Filtered out by a household rule">excluded</Chip>}
                </div>
              </div>
              <div className="col-span-2 mono text-xs text-stone-500" title="Most recent order date this appeared in">{r.lastSeenDate?formatDate(r.lastSeenDate):"—"}</div>
              <div className="col-span-3 text-right">
                {r.inLatest ? <Chip tone="ok" title="Just bought — in the most recent order">✓ in latest order</Chip>
                 : r.pantryItem ? <Chip tone="ok" title="Already in the current pantry">in pantry</Chip>
                 : r.excludedReason ? <span className="text-xs text-stone-500" title={`Excluded reason: ${r.excludedReason}`}>{r.excludedReason}</span>
                 : <Chip tone="warn" title="Bought regularly but missing from both the latest order and the pantry">gap</Chip>}
              </div>
            </div>)}
          </div>
        </div>}
      </div>
    </Section>

    <Section
      title="Ingredients that unlock the most recipes"
      subtitle="Ranked by how many household-safe recipes use each ingredient. Adding one boosts the makeability of every recipe listed below it."
      tone="accent"
      collapsible
      defaultOpen={false}
      tip="A forward-looking view: rather than 'what should I buy this week', this asks 'what single ingredient would maximise the recipes I can make from existing pantry?'. Khalil-blocked recipes are excluded from the ranking."
    >
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="text-sm flex items-center gap-2">
          <span className="text-stone-500">Show top:</span>
          <select value={leverageLimit} onChange={e=>setLeverageLimit(parseInt(e.target.value))} className="border border-stone-300 rounded px-2 py-1 text-sm">
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={9999}>All</option>
          </select>
        </label>
        <span className="text-xs text-stone-500">{leverage.length} candidate{leverage.length===1?"":"s"} shown · click any row to see the recipes it affects.</span>
      </div>
      {leverage.length === 0
        ? <div className="text-sm text-stone-500">No leverage opportunities — every recipe is already ≥70% makeable, or all remaining recipes are blocked by Khalil allergens.</div>
        : <LeverageTileGrid items={leverage}/>
      }
    </Section>

  </div>;
}
