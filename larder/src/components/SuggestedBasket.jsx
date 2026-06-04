// ============================================================
// SuggestedBasket — the one canonical basket view (Basket overhaul)
// ============================================================
// Originally a flat ranked table (canonical L1849–2270, ported 7j-1).
// Restructured in the 2026-06 Basket overhaul into three reason-grouped,
// collapsible sections with per-row remove, an "Excluded for this cycle"
// drawer, and Cook-tab banner linkage. Ranking inputs are unchanged —
// only the grouping/surfacing and the expiring source changed.
//
// Three groups (visual weight high→low matches the reasons):
//   🔴 Replace what's expiring — pantry items the user marked "Used" or
//      "Binned" on the Cook tab banner (last_marked_action). "Still good"
//      suppresses an item from here. NOT raw expiring items — those are
//      triaged on Cook first.
//   🟡 Refill regulars — order-history gaps (computeRegularsAndGaps).
//   🟢 Unlock recipes — leverage picks + ingredients the user added from
//      the leverage table (addedIngredients, lifted to GapsView).
//
// Shared state lifted to GapsView so the basket and the leverage table
// stay in sync:
//   addedIngredients — names added via the leverage "Add to basket" CTA;
//      unioned into the matchSet (so leverage re-ranks) AND surfaced as
//      explicit Unlock-recipes rows.
//   excludedItems    — names removed via the per-row ×; moved to the
//      Excluded drawer, restorable. Persists for this delivery cycle.
//   minOrders        — the "regular" threshold; shared with the KPI so
//      the REAL GAPS count reconciles.
//
// Props:
//   pantry, outOfStock        — mapped pantry rows + out Set
//   minOrders, setMinOrders   — regular threshold (lifted; settings pill)
//   addedIngredients          — Set<string> normalised names (lifted)
//   excludedItems             — Set<string> lowercased basket names (lifted)
//   onRemoveItem(name)        — exclude a row this cycle
//   onRestoreItem(name)       — restore from the Excluded drawer
// ============================================================

import { useMemo, useState } from "react";
import { Chip, InfoTip, Section } from "./primitives.jsx";
import { TODAY, daysUntilExpiry, formatDate } from "../lib/pantry-math.js";
import { lc } from "../lib/text.js";
import { audienceFromFlags, flagsForRecipe } from "../lib/allergens.js";
import { leverageScore, makeability, pantryMatchSet } from "../lib/recipe-match.js";
import { buildPriceIndex, lookupPriceForIngredient } from "../lib/pricing.js";
import { computeRegularsAndGaps } from "../lib/gap-analysis.js";
import { lookupSku, neverRestockReason, tescoSearchUrl } from "../lib/tesco-skus.js";
import { suggestNextDelivery } from "../lib/delivery.js";
import { HOUSEHOLD_RULES } from "../lib/household-rules.js";
import { useAllergens } from "../contexts/AllergensContext.jsx";
import { useReceipts } from "../contexts/ReceiptsContext.jsx";
import { useRecipes } from "../contexts/RecipesContext.jsx";
import { useTescoSkus } from "../contexts/TescoSkusContext.jsx";

// Expiry "why" text + chip tone, per the cross-cutting expiry-formatting
// convention shared with the Cook tab.
function expiryWhy(d, daysToDelivery) {
  if (d < 0) return `expired ${Math.abs(d)}d ago — restock`;
  if (d === 0) return "expires today";
  if (d <= 2) return daysToDelivery > d ? `expires in ${d}d (by delivery)` : `expires in ${d}d`;
  return `expires in ${d}d`;
}
function dayChipTone(d) { return d <= 2 ? "danger" : d <= 5 ? "warn" : "neutral"; }

const GROUP_META = {
  expiring: { emoji: "🔴", label: "Replace what's expiring", tint: "border-l-4 border-l-red-400 bg-red-50/30",
    tip: "Two kinds: items you already marked Used/Binned on the Cook banner (actually gone), and in-stock items projected to expire by the next suggested delivery. Items marked \"Still good\" are suppressed; already-expired items still in stock are triaged on the Cook tab first." },
  gap: { emoji: "🟡", label: "Refill regulars", tint: "border-l-4 border-l-amber-400 bg-amber-50/30",
    tip: "Items you buy regularly that are missing from both your latest order and the pantry." },
  leverage: { emoji: "🟢", label: "Unlock recipes", tint: "border-l-4 border-l-emerald-400 bg-emerald-50/30",
    tip: "High-leverage ingredients — each unlocks several recipes. Includes anything you added from the leverage table below." },
};

export default function SuggestedBasket({ pantry, outOfStock, minOrders = 3, setMinOrders,
  addedIngredients = new Set(), excludedItems = new Set(), onRemoveItem, onRestoreItem }) {
  const { receipts } = useReceipts();
  const { allergens } = useAllergens();
  const { skuIndex } = useTescoSkus();
  const { recipes, version: recipesVersion } = useRecipes();

  // matchSet unions in addedIngredients so leverage re-ranks as the user
  // adds ingredients (added ones count as "available" and drop out).
  const matchSet = useMemo(() => {
    const s = pantryMatchSet(pantry, outOfStock);
    for (const a of addedIngredients) s.add(a);
    return s;
  }, [pantry, outOfStock, addedIngredients]);
  const decorated = useMemo(() => recipes.map(r => {
    const m = makeability(r, matchSet);
    const f = flagsForRecipe(r, allergens);
    return { ...r, _make: m, _flags: f, _audience: r.audience || audienceFromFlags(f) };
  }), [recipes, matchSet, allergens, recipesVersion]);
  const leverage = useMemo(() => leverageScore(decorated.filter(r => r._flags.khalil !== "blocked"), matchSet, 12), [decorated, matchSet]);

  const priceIndex = useMemo(() => buildPriceIndex(receipts), [receipts]);
  const gapAnalysis = useMemo(() => computeRegularsAndGaps(pantry, receipts, allergens, minOrders, skuIndex), [pantry, receipts, allergens, minOrders, skuIndex]);
  const nextDelivery = useMemo(() => suggestNextDelivery(receipts), [receipts]);

  const [openedSkus, setOpenedSkus] = useState(new Set());
  const [groupOpen, setGroupOpen] = useState({ expiring: true, gap: true, leverage: true });
  const [showExcluded, setShowExcluded] = useState(false);
  const [showRegulars, setShowRegulars] = useState(false);
  const [regFilter, setRegFilter] = useState("gap"); // gap | restocked | excluded | all
  const [showSettings, setShowSettings] = useState(false);
  const [copyState, setCopyState] = useState("idle");

  // Build a basket-item entry. SKU + price resolution unchanged from 7j-1.
  const buildItem = useMemo(() => (name, kind, why, whySub, qtyHint) => {
    const priced = lookupPriceForIngredient(name, priceIndex);
    const qty = qtyHint != null ? qtyHint : (priced && priced.typicalQty ? priced.typicalQty : 1);
    const unitPrice = priced ? priced.unitGbp : null;
    const totalPrice = unitPrice != null ? unitPrice * qty : null;
    const skuRow = lookupSku(name, skuIndex);
    return {
      kind, name, why, whySub,
      qty, packSize: priced ? priced.packSize : null,
      unitPrice, totalPrice, priceSource: priced ? priced.source : null,
      tesco_sku: skuRow ? skuRow.tesco_sku : null,
      tesco_url: skuRow ? skuRow.tesco_url : null,
      tesco_name: skuRow ? skuRow.tesco_name : null,
      tesco_search_url: tescoSearchUrl(name),
      khalil_critical: skuRow ? !!skuRow.khalil_critical : false,
      needs_sku_lookup: !skuRow,
    };
  }, [priceIndex, skuIndex]);

  // ----- Build the three groups (+ excluded drawer) -----
  const built = useMemo(() => {
    const seen = new Set();
    const exp = [], gaps = [], lev = [];
    const excl = excludedItems;

    // Days until the next suggested delivery — items expiring within this
    // window need replacing before the shop lands.
    const daysToDelivery = nextDelivery.date
      ? Math.max(1, Math.round((new Date(nextDelivery.date + "T12:00:00Z") - TODAY) / (1000 * 60 * 60 * 24)))
      : 7;

    // A1) ACTUALLY EXPIRED — items the user marked Used/Binned on the Cook
    // banner. These are gone; restock them. expiryKind="expired".
    const triaged = pantry
      .filter(p => p._last_marked_action === "used" || p._last_marked_action === "binned")
      .filter(p => !neverRestockReason(p.item, skuIndex));
    for (const p of triaged) {
      const key = lc(p.item);
      if (seen.has(key)) continue;
      seen.add(key);
      const it = buildItem(p.item, "expiring", `${p._last_marked_action} — restock`, p.expires ? `was due ${formatDate(p.expires)}` : null);
      it.action = p._last_marked_action;
      it.expiryKind = "expired";
      exp.push(it);
    }

    // A2) PROJECTED TO EXPIRE BY DELIVERY — in-stock items not yet expired
    // whose expiry falls on/before the next suggested delivery. Distinct from
    // A1 (still in the pantry, just won't last). "Still good" suppresses an
    // item (its expiry was bumped, so it usually falls out of the window
    // anyway, but exclude explicitly to honour the Cook-tab suppression).
    const projected = pantry
      .filter(p => !outOfStock.has(p.item))
      .filter(p => p._last_marked_action !== "still_good")
      .filter(p => !neverRestockReason(p.item, skuIndex))
      .map(p => ({ ...p, _dExp: daysUntilExpiry(p) }))
      .filter(p => p._dExp !== null && p._dExp >= 0 && p._dExp <= daysToDelivery)
      .sort((a, b) => a._dExp - b._dExp);
    for (const p of projected) {
      const key = lc(p.item);
      if (seen.has(key)) continue;
      seen.add(key);
      const it = buildItem(p.item, "expiring", expiryWhy(p._dExp, daysToDelivery), p.expires ? `expires ${formatDate(p.expires)}` : null);
      it.expiryKind = "projected";
      it.dExp = p._dExp;
      exp.push(it);
    }

    // B) Refill regulars — order-history gaps.
    for (const g of (gapAnalysis?.gaps || [])) {
      const key = lc(g.example);
      if (seen.has(key)) continue;
      seen.add(key);
      gaps.push(buildItem(g.example, "gap", `bought in ${g.count} past orders`, g.lastSeenDate ? `last: ${formatDate(g.lastSeenDate)}` : null));
    }

    // C) Unlock recipes — manual adds first, then auto leverage suggestions.
    for (const name of addedIngredients) {
      const key = lc(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const it = buildItem(name, "leverage", "added — unlocks recipes", null, 1);
      it.manual = true;
      lev.push(it);
    }
    for (const lvr of (leverage || [])) {
      const lvName = lvr.ingredient || lvr.item || "";
      const key = lc(lvName);
      if (!key || seen.has(key)) continue;
      const inPantry = pantry.some(p => lc(p.item).includes(key) || key.includes(lc(p.item)));
      if (inPantry && !outOfStock.has(lvName)) continue;
      if (neverRestockReason(lvName, skuIndex)) continue;
      const unlockCount = lvr.unlockedTo70 || lvr.unlocks || 0;
      const mentionCount = lvr.recipeCount || lvr.mentions || 0;
      if (unlockCount === 0 && mentionCount < 3) continue;
      seen.add(key);
      const it = buildItem(lvName, "leverage", unlockCount > 0
        ? `unlocks ${unlockCount} recipe${unlockCount === 1 ? "" : "s"} (in ${mentionCount})`
        : `appears in ${mentionCount} recipes`, null, 1);
      it.unlockCount = unlockCount;
      lev.push(it);
    }

    const keep = (arr) => arr.filter(x => !excl.has(lc(x.name)));
    const all = [...exp, ...gaps, ...lev];
    return {
      expiring: keep(exp), gap: keep(gaps), leverage: keep(lev),
      excluded: all.filter(x => excl.has(lc(x.name))),
    };
  }, [pantry, outOfStock, gapAnalysis, leverage, addedIngredients, excludedItems, skuIndex, buildItem, nextDelivery]);

  const groupTotal = (arr) => arr.reduce((s, x) => s + (x.totalPrice || 0), 0);
  const allVisible = [...built.expiring, ...built.gap, ...built.leverage];
  const grandTotal = groupTotal(allVisible);
  const pricedCount = allVisible.filter(x => x.totalPrice != null).length;

  // Untriaged expired items still sitting on the Cook tab (bridge hint).
  const untriagedExpired = useMemo(() => pantry.filter(p =>
    !outOfStock.has(p.item) && !p._last_marked_action &&
    (() => { const d = daysUntilExpiry(p); return d !== null && d < 0; })()
  ).length, [pantry, outOfStock]);

  // Direct-SKU vs search-link split (2.8).
  const directCount = allVisible.filter(b => b.tesco_url).length;
  const searchCount = allVisible.filter(b => !b.tesco_url).length;

  // ----- Open-in-Tesco + export (unchanged behaviour, operates on allVisible) -----
  const openableItems = useMemo(() => allVisible.filter(b => b.tesco_url && !openedSkus.has(b.tesco_sku)), [allVisible, openedSkus]);
  const openNext = () => {
    const next = openableItems[0];
    if (!next) return;
    window.open(next.tesco_url, "_blank", "noopener,noreferrer");
    setOpenedSkus(prev => new Set(prev).add(next.tesco_sku));
  };
  const resetOpened = () => setOpenedSkus(new Set());

  const buildBasketPayload = () => ({
    _meta: {
      generated_at: new Date().toISOString(),
      suggested_delivery_date: nextDelivery.date || null,
      item_count: allVisible.length,
      openable_count: directCount,
      needs_sku_lookup_count: searchCount,
      estimated_total_gbp: grandTotal,
      household_rules: {
        never_substitute_to: (HOUSEHOLD_RULES.never_restock || []).map(r => r.pattern),
        note: "Khalil-critical items must not be substituted. Decline all Tesco substitution offers.",
      },
    },
    items: allVisible.map(b => ({
      name: b.name, qty: b.qty, pack_size: b.packSize, kind: b.kind, why: b.why,
      tesco_sku: b.tesco_sku, tesco_url: b.tesco_url, tesco_name: b.tesco_name,
      tesco_search_url: b.tesco_search_url, khalil_critical: b.khalil_critical,
      needs_sku_lookup: b.needs_sku_lookup, estimated_total_gbp: b.totalPrice,
    })),
  });
  const downloadBasketJson = () => {
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(buildBasketPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `basket-${today}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const copyBasketJson = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API not available");
      await navigator.clipboard.writeText(JSON.stringify(buildBasketPayload(), null, 2));
      setCopyState("copied"); setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
      setCopyState("error"); setTimeout(() => setCopyState("idle"), 3000);
    }
  };

  // Waste signal (2.6): per-item "expired uncooked in 2+ of last 3 cycles"
  // needs per-cycle waste history, which the current schema doesn't retain
  // (only the latest last_marked_action is stored, no event log). With <3
  // cycles of waste data we MUST NOT show false positives — so this returns
  // null today and lights up only once a waste-history source exists.
  // TODO: populate from a waste-events log when one lands.
  const wasteFlagFor = () => null;

  // ----- Row renderer (shared across groups) -----
  const markOpened = (b) => {
    if (!b.tesco_sku) return;
    setOpenedSkus(prev => prev.has(b.tesco_sku) ? prev : new Set(prev).add(b.tesco_sku));
  };
  const renderRow = (b, i) => {
    const isOpened = b.tesco_sku && openedSkus.has(b.tesco_sku);
    const qtyLabel = b.qty > 1 ? `${b.qty}×` : "1×";
    const waste = wasteFlagFor(b);
    return (
      <div key={b.kind + ":" + b.name + ":" + i} className="grid grid-cols-12 gap-2 items-start px-3 py-2 text-sm border-t border-stone-100 first:border-t-0">
        <div className="col-span-12 sm:col-span-6">
          <div className="font-medium leading-tight flex items-center gap-1.5 flex-wrap">
            {b.tesco_url ? (
              <a href={b.tesco_url} target="_blank" rel="noopener noreferrer" onClick={() => markOpened(b)}
                 className={`hover:underline ${isOpened ? "text-stone-500" : ""}`} title={`Open on Tesco: ${b.tesco_name || b.name}`}>
                {b.name}{isOpened && <span className="ml-1 text-xs text-stone-400">✓</span>}
              </a>
            ) : (
              <a href={b.tesco_search_url} target="_blank" rel="noopener noreferrer"
                 className="text-stone-700 hover:underline" title={`Tesco search for "${b.name}" — no direct SKU yet, pick the product manually`}>
                {b.name}
              </a>
            )}
            {b.expiryKind === "expired" && <Chip tone="danger" title="You marked this Used/Binned on the Cook tab — restock">expired</Chip>}
            {b.expiryKind === "projected" && <Chip tone={dayChipTone(b.dExp)} title="In stock, projected to expire by your next delivery">{b.dExp === 0 ? "today" : `in ${b.dExp}d`}</Chip>}
            {!b.tesco_url && <Chip tone="warn" title="No direct Tesco product yet — opens a search you complete manually">search</Chip>}
            {b.khalil_critical && <Chip tone="danger" title="Khalil-critical — never substitute">⚠ no sub</Chip>}
            {b.kind === "leverage" && b.unlockCount > 0 && <Chip tone="ok" title="Recipes this ingredient makes makeable">+{b.unlockCount} recipes</Chip>}
            {b.manual && <Chip tone="info" title="You added this from the leverage table">added</Chip>}
          </div>
          {waste && <div className="mt-0.5"><Chip tone="warn" title="Wasted in recent cycles">{waste} — reduce qty?</Chip></div>}
        </div>
        <div className="col-span-4 sm:col-span-2 mono whitespace-nowrap text-xs">
          {qtyLabel} {b.packSize || "pack"}
          {b.unitPrice != null && b.qty > 1 && <div className="text-[10px] text-stone-500 mt-0.5">@ £{b.unitPrice.toFixed(2)}/ea</div>}
        </div>
        <div className="col-span-5 sm:col-span-2 text-stone-700 text-xs">
          <div>{b.why}</div>
          {b.whySub && <div className="text-stone-500 mt-0.5">{b.whySub}</div>}
        </div>
        <div className="col-span-2 sm:col-span-1 text-right mono text-xs">
          {b.totalPrice != null
            ? <span className={b.priceSource === "fuzzy" ? "text-stone-500" : ""}>{b.priceSource === "fuzzy" ? "~" : ""}£{b.totalPrice.toFixed(2)}</span>
            : <span className="text-stone-400">—</span>}
        </div>
        <div className="col-span-1 text-right">
          <button onClick={() => onRemoveItem && onRemoveItem(b.name)} title="Remove from this cycle's basket"
            className="text-stone-400 hover:text-red-600 rounded" style={{ minWidth: 36, minHeight: 36 }}>×</button>
        </div>
      </div>
    );
  };

  const renderGroup = (key) => {
    const items = built[key];
    const meta = GROUP_META[key];
    const open = groupOpen[key];
    const total = groupTotal(items);
    if (key !== "expiring" && items.length === 0) return null; // keep expiring header for the bridge hint
    return (
      <div className={`rounded-lg border border-stone-200 ${meta.tint} overflow-hidden`}>
        <div role="button" tabIndex={0}
          onClick={() => setGroupOpen(g => ({ ...g, [key]: !g[key] }))}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setGroupOpen(g => ({ ...g, [key]: !g[key] })); } }}
          className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none">
          <div className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
            <span className="text-stone-400 text-xs w-3">{open ? "▼" : "▶"}</span>
            <span>{meta.emoji} {meta.label}</span>
            <span className="text-stone-500 font-normal">· {items.length} item{items.length === 1 ? "" : "s"}{total > 0 ? ` · £${total.toFixed(2)}` : ""}</span>
            <InfoTip>{meta.tip}</InfoTip>
          </div>
        </div>
        {open && (
          <div className="bg-white/60">
            {key === "expiring" ? (() => {
              const expired = items.filter(x => x.expiryKind === "expired");
              const projected = items.filter(x => x.expiryKind === "projected");
              return <>
                {items.length === 0 && (
                  <div className="px-3 py-2 text-xs text-stone-600">
                    {untriagedExpired > 0
                      ? <>Nothing to restock yet — {untriagedExpired} expired item{untriagedExpired === 1 ? "" : "s"} await triage on the <strong>Cook tab</strong> (mark Used / Binned / Still good first).</>
                      : "Nothing expiring needs replacing right now."}
                  </div>
                )}
                {expired.length > 0 && <div className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-stone-500">Already expired · {expired.length}</div>}
                {expired.map(renderRow)}
                {projected.length > 0 && <div className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-stone-500">Expiring before delivery · {projected.length}</div>}
                {projected.map(renderRow)}
                {untriagedExpired > 0 && items.length > 0 && (
                  <div className="px-3 py-1.5 text-[11px] text-stone-500">+ {untriagedExpired} expired item{untriagedExpired === 1 ? "" : "s"} still in stock — triage on the Cook tab.</div>
                )}
              </>;
            })() : items.map(renderRow)}
            {/* Refill regulars: the relocated drill-down (2.1) lives here. */}
            {key === "gap" && gapAnalysis?.regulars && (
              <RegularsDrawer
                show={showRegulars} setShow={setShowRegulars}
                filter={regFilter} setFilter={setRegFilter}
                analysis={gapAnalysis} orderCount={receipts.length} minOrders={minOrders} />
            )}
          </div>
        )}
      </div>
    );
  };

  if (allVisible.length === 0 && untriagedExpired === 0 && built.excluded.length === 0) return null;

  return (
    <Section title="Suggested next basket"
      subtitle={pricedCount > 0
        ? `${built.expiring.length} expiring · ${built.gap.length} regulars · ${built.leverage.length} leverage · est. ~£${grandTotal.toFixed(2)}`
        : "Prices not available — no matches in order history"}
      tone="accent"
      tip="One basket grouped by reason: replace what you used/binned, refill regulars you're missing, and unlock recipes with high-leverage ingredients. Prices are medians from past Tesco orders.">

      {/* Delivery banner + settings pill */}
      <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
        {nextDelivery.date ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm flex items-start gap-2 flex-1 min-w-[220px]">
            <span className="text-base">🚚</span>
            <div className="flex-1">
              <div><strong>Suggested delivery: {formatDate(nextDelivery.date)}</strong></div>
              <div className="text-xs text-stone-600 mt-0.5">{nextDelivery.note}</div>
            </div>
          </div>
        ) : <div />}
        <div className="relative">
          <button onClick={() => setShowSettings(s => !s)} className="pill" aria-expanded={showSettings}
            title="Basket settings">⚙ regulars ≥{minOrders}</button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg border border-stone-200 bg-white p-3 shadow-lg text-sm">
              <label className="flex items-center gap-2">
                <span className="text-stone-600">Min orders to count as a regular</span>
              </label>
              <select value={minOrders} onChange={e => setMinOrders && setMinOrders(parseInt(e.target.value))}
                className="mt-1.5 border border-stone-300 rounded px-2 py-1 text-sm w-full">
                {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} of {receipts.length}</option>)}
              </select>
              <p className="text-[11px] text-stone-500 mt-1.5">Higher = stricter definition of a regular purchase.</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {renderGroup("expiring")}
        {renderGroup("gap")}
        {renderGroup("leverage")}
      </div>

      {/* Grand total */}
      {pricedCount > 0 && (
        <div className="flex justify-between items-baseline mt-3 pt-2 border-t-2 border-stone-300 text-sm font-semibold">
          <span>Estimated total ({pricedCount} priced)</span>
          <span className="mono">£{grandTotal.toFixed(2)}</span>
        </div>
      )}

      {/* Excluded for this cycle */}
      {built.excluded.length > 0 && (
        <div className="mt-3 rounded-lg border border-stone-200 overflow-hidden">
          <button onClick={() => setShowExcluded(s => !s)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50">
            <span><span className="text-xs w-3 inline-block">{showExcluded ? "▼" : "▶"}</span> Excluded for this cycle · {built.excluded.length}</span>
          </button>
          {showExcluded && <div className="divide-y divide-stone-100">
            {built.excluded.map((b, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span className="text-stone-500 line-through">{b.name}</span>
                <button onClick={() => onRestoreItem && onRestoreItem(b.name)} className="pill text-xs" title="Put back in the basket">↩ restore</button>
              </div>
            ))}
          </div>}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {openableItems.length > 0 ? (
          <button onClick={openNext} className="pill" data-active="true"
            title={`Opens "${openableItems[0].name}" in a new Tesco tab. One click = one tab.`}>
            🛒 Open next in Tesco: {openableItems[0].name}
            <span className="text-stone-500 ml-1">· {directCount - openableItems.length + 1} of {directCount}</span>
          </button>
        ) : directCount > 0 ? (
          <span className="text-sm text-stone-600">✓ All {directCount} direct items opened
            <button onClick={resetOpened} className="pill ml-2" title="Clear the opened-items tracker">Reset</button>
          </span>
        ) : null}
        <button onClick={downloadBasketJson} className="pill" title="Download the basket as JSON for the Claude-in-Chrome handoff.">⬇ Export JSON</button>
        <button onClick={copyBasketJson} className="pill" data-active={copyState === "copied" ? "true" : undefined}
          title="Copy the basket JSON to clipboard.">
          {copyState === "copied" ? "✓ Copied" : copyState === "error" ? "✗ Copy failed" : "📋 Copy JSON"}
        </button>
        {/* Direct-SKU vs search clarity (2.8) */}
        <span className="text-xs text-stone-600 bg-stone-100 border border-stone-200 rounded-full px-2 py-1 flex items-center gap-1"
          title="Direct = one-tap add on Tesco. Search = no SKU mapped yet, so you pick the product manually on Tesco.">
          {directCount} direct · {searchCount} search <InfoTip>Items tagged “search” open a Tesco search rather than a product page — no SKU is mapped yet, so confirm the right product manually.</InfoTip>
        </span>
      </div>

      <div className="text-xs text-stone-600 mt-3 leading-relaxed">
        Quantities and pack sizes are based on what you typically order. Prices are medians from past Tesco orders and may not reflect current pricing; fuzzy matches show a <span className="mono">~</span> in lighter text and unpriced items show <span className="mono">—</span>. Items tagged <Chip tone="warn">search</Chip> need manual product selection on Tesco. Suggested delivery is from your past order cadence.
      </div>
    </Section>
  );
}

// RegularsDrawer — the relocated "Pick your basket gaps" diagnostic (2.1).
// Lives inside the Refill regulars group as a collapsed drawer; the four
// status filters move here from the now-deleted standalone section.
function RegularsDrawer({ show, setShow, filter, setFilter, analysis, orderCount, minOrders }) {
  const regulars = analysis.regulars || [];
  const gaps = analysis.gaps || [];
  const restocked = regulars.filter(r => r.inLatest || r.pantryItem);
  const excluded = regulars.filter(r => r.excludedReason);
  const rows = filter === "gap" ? gaps : filter === "restocked" ? restocked : filter === "excluded" ? excluded : regulars;
  return (
    <div className="border-t border-stone-200 bg-stone-50/60">
      <button onClick={() => setShow(!show)} className="w-full text-left px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900">
        <span className="w-3 inline-block">{show ? "▼" : "▶"}</span> All regulars (diagnostic) · {regulars.length} from {orderCount} orders
      </button>
      {show && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap gap-1 mb-2">
            <button onClick={() => setFilter("gap")} className="pill text-xs" data-active={filter === "gap"} title="Regular, missing from latest order + pantry">Real gaps · {gaps.length}</button>
            <button onClick={() => setFilter("restocked")} className="pill text-xs" data-active={filter === "restocked"} title="In latest order or pantry — no action">Restocked · {restocked.length}</button>
            <button onClick={() => setFilter("excluded")} className="pill text-xs" data-active={filter === "excluded"} title="Filtered by a household rule">Excluded · {excluded.length}</button>
            <button onClick={() => setFilter("all")} className="pill text-xs" data-active={filter === "all"} title="Every regular">All · {regulars.length}</button>
          </div>
          {rows.length === 0 ? <div className="text-xs text-stone-500">Nothing here at ≥{minOrders} orders.</div>
            : <div className="max-h-56 overflow-y-auto divide-y divide-stone-100 text-xs">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-stone-700 truncate">{r.example} <span className="text-stone-400 mono">×{r.count}</span></span>
                  <span className="shrink-0">
                    {r.inLatest ? <Chip tone="ok">✓ latest</Chip>
                      : r.pantryItem ? <Chip tone="ok">in pantry</Chip>
                        : r.excludedReason ? <span className="text-stone-500">{r.excludedReason}</span>
                          : <Chip tone="warn">gap</Chip>}
                  </span>
                </div>
              ))}
            </div>}
        </div>
      )}
    </div>
  );
}
