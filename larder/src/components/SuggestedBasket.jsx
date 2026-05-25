// ============================================================
// SuggestedBasket — basket recommendation engine inside the Basket tab
// ============================================================
// Verbatim port of canonical index.html L1849–2270. Step 7j-1.
//
// Combines three input streams into a single ranked basket:
//   1. Pantry items expiring before the next suggested delivery
//   2. Likely gaps from order history (computeRegularsAndGaps)
//   3. High-leverage ingredients (each unlocks multiple recipes)
//
// Each item is SKU-resolved (lookupSku) for direct Tesco product
// links, with a search-URL fallback. Items get a price estimate
// from buildPriceIndex if the family appeared in past orders.
// Household never-restock rules filter out forbidden items
// (regex patterns + per-SKU exclusions).
//
// Structural changes vs. canonical (no behaviour change):
//   - hooks via named import from "react"
//   - context reads use the extracted hooks (useReceipts,
//     useAllergens, useTescoSkus, useRecipes) instead of bare
//     useContext(...) — matches 7g/7i pattern
//   - RECIPES module global → recipes from useRecipes()
//
// Props:
//   pantry      — mapped pantry rows
//   outOfStock  — Set of item names flagged out
// ============================================================

import { useMemo, useState } from "react";
import { Chip, Section } from "./primitives.jsx";
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

export default function SuggestedBasket({pantry, outOfStock}){
  const { receipts } = useReceipts();
  const { allergens } = useAllergens();
  const { skuIndex } = useTescoSkus();
  const { recipes, version: recipesVersion } = useRecipes();

  // Recipe decoration: needed because leverage scoring runs over decorated
  // recipes, and leverage is one of the three basket inputs.
  const matchSet = useMemo(()=> pantryMatchSet(pantry, outOfStock), [pantry, outOfStock]);
  const decorated = useMemo(()=> recipes.map(r=>{
    const m = makeability(r, matchSet);
    const f = flagsForRecipe(r, allergens);
    return {...r, _make:m, _flags:f, _audience: r.audience || audienceFromFlags(f)};
  }), [recipes, matchSet, allergens, recipesVersion]);
  const leverage = useMemo(()=> leverageScore(decorated, matchSet, 12), [decorated, matchSet]);

  // Expiring set (basket input #1).
  const expiring = pantry.filter(p=>!outOfStock.has(p.item)).map(p=>({...p, _dExp:daysUntilExpiry(p)})).filter(p=>p._dExp!==null && p._dExp<=5).sort((a,b)=>a._dExp-b._dExp);

  const priceIndex = useMemo(()=> buildPriceIndex(receipts), [receipts]);
  const gapAnalysis = useMemo(()=> computeRegularsAndGaps(pantry, receipts, allergens, 3, skuIndex), [pantry, receipts, allergens, skuIndex]);
  const nextDelivery = useMemo(()=> suggestNextDelivery(receipts), [receipts]);

  // Track which basket items have already been opened in a Tesco tab (by SKU).
  // Per-session only — resets on page reload so a fresh shop starts clean. We
  // key on SKU rather than name so duplicates and substitutions stay distinct.
  // The "Open next" button advances through openable items in basket order,
  // skipping anything without a SKU (needs_sku_lookup) or anything already
  // opened. One click = one tab, deliberately — pop-up blockers will eat a
  // burst of window.open() calls from a single click, and one-at-a-time
  // keeps the review-as-you-go flow that surfaces wrong product pages early.
  const [openedSkus, setOpenedSkus] = useState(new Set());

  const basket = useMemo(()=>{
    const items = [];
    const seen = new Set(); // dedupe by lowercase canonical name

    // Days until the suggested next delivery — items expiring within this window
    // will need restocking by then.
    const daysToDelivery = nextDelivery.date
      ? Math.max(1, Math.round((new Date(nextDelivery.date + "T12:00:00Z") - TODAY)/(1000*60*60*24)))
      : 7;
    // Add a 2-day buffer so something expiring on delivery day still flags.
    const expiryHorizon = daysToDelivery + 2;

    // Helper: build a basket-item entry from a name + reason + optional pantry context.
    // qtyHint: explicit suggested count (else falls back to typicalQty or 1).
    //
    // SKU resolution (Step 2 of basket automation): look up the item in
    // tesco_skus and attach tesco_sku / tesco_url / khalil_critical to the
    // returned entry. If no match is found, needs_sku_lookup=true is set so
    // downstream steps (export button, Chrome handoff) can mark the item
    // visibly rather than silently dropping it. Resolution is exact-match
    // on the lowercased name; the seeding step used the same normalisation.
    const buildItem = (name, kind, why, whySub, qtyHint) => {
      const priced = lookupPriceForIngredient(name, priceIndex);
      const qty = qtyHint != null ? qtyHint : (priced && priced.typicalQty ? priced.typicalQty : 1);
      const unitPrice = priced ? priced.unitGbp : null;
      const totalPrice = unitPrice != null ? unitPrice * qty : null;
      const skuRow = lookupSku(name, skuIndex);
      return {
        kind, name, why, whySub,
        qty, packSize: priced ? priced.packSize : null,
        unitPrice, totalPrice,
        priceSource: priced ? priced.source : null,
        // Step 2 fields — present on every item; downstream UI/export logic
        // reads these. tesco_sku and tesco_url are null when no SKU row
        // matched; needs_sku_lookup makes that condition explicit for filters.
        // tesco_search_url is always populated (it's just an encoded query) —
        // used as the click target when tesco_url is null, so every basket
        // item is clickable rather than just the seeded ones.
        tesco_sku: skuRow ? skuRow.tesco_sku : null,
        tesco_url: skuRow ? skuRow.tesco_url : null,
        tesco_name: skuRow ? skuRow.tesco_name : null,
        tesco_search_url: tescoSearchUrl(name),
        khalil_critical: skuRow ? !!skuRow.khalil_critical : false,
        needs_sku_lookup: !skuRow,
      };
    };

    // 1) Pantry items expiring before the next delivery — likely needs restocking.
    const expiryRestock = pantry
      .filter(p => !outOfStock.has(p.item))
      .map(p => ({ ...p, _dExp: daysUntilExpiry(p) }))
      .filter(p => p._dExp !== null && p._dExp <= expiryHorizon && p._dExp >= -3)
      .filter(p => !neverRestockReason(p.item, skuIndex))
      .sort((a,b)=> a._dExp - b._dExp);
    for (const p of expiryRestock) {
      const key = lc(p.item);
      if (seen.has(key)) continue;
      seen.add(key);
      const expiryDateStr = p.expires ? formatDate(p.expires) : null;
      const why = p._dExp < 0
        ? `expired ${Math.abs(p._dExp)}d ago — restock`
        : p._dExp === 0
          ? `expires today — restock`
          : `expires in ${p._dExp}d (by delivery)`;
      items.push(buildItem(p.item, "expiring", why, expiryDateStr ? `expiry: ${expiryDateStr}` : null));
    }

    // 2) Likely gaps (from order history) — high signal, you bought these regularly
    const gapCandidates = (gapAnalysis?.gaps || []).slice(0, 20);
    for (const g of gapCandidates) {
      const key = lc(g.example);
      if (seen.has(key)) continue;
      seen.add(key);
      const whySub = g.lastSeenDate ? `last: ${formatDate(g.lastSeenDate)}` : null;
      items.push(buildItem(g.example, "gap", `bought in ${g.count} past orders`, whySub));
    }

    // 3) Top leverage ingredients — adding these unlocks the most blocked recipes
    const leverageCandidates = (leverage || []).slice(0, 12);
    for (const lv of leverageCandidates) {
      const lvName = lv.ingredient || lv.item || "";
      const key = lc(lvName);
      if (!key || seen.has(key)) continue;
      const inPantry = pantry.some(p => lc(p.item).includes(key) || key.includes(lc(p.item)));
      if (inPantry && !outOfStock.has(lvName)) continue;
      if (neverRestockReason(lvName, skuIndex)) continue;
      seen.add(key);
      const unlockCount = lv.unlockedTo70 || lv.unlocks || 0;
      const mentionCount = lv.recipeCount || lv.mentions || 0;
      if (unlockCount === 0 && mentionCount < 3) continue;
      const whyText = unlockCount > 0
        ? `unlocks ${unlockCount} recipe${unlockCount===1?"":"s"} (appears in ${mentionCount})`
        : `appears in ${mentionCount} blocked recipes`;
      // Leverage items: we want 1 pack typically (try-before-bulk), regardless of historical qty
      items.push(buildItem(lvName, "leverage", whyText, null, 1));
    }

    const priced = items.filter(x => x.totalPrice != null);
    const total = priced.reduce((s, x) => s + x.totalPrice, 0);
    const unpriced = items.length - priced.length;
    const counts = {
      expiring: items.filter(x => x.kind === "expiring").length,
      gap: items.filter(x => x.kind === "gap").length,
      leverage: items.filter(x => x.kind === "leverage").length,
    };
    return { items, total, priced: priced.length, unpriced, counts, daysToDelivery };
  }, [gapAnalysis, leverage, pantry, outOfStock, priceIndex, nextDelivery, skuIndex]);

  // ===== Basket actions: Open in Tesco + Export JSON =====
  //
  // Items split into three buckets for the action UI:
  //   - openable: have a tesco_url, not yet opened this session
  //   - opened: already clicked through (kept distinct so the count shows progress)
  //   - blocked: no SKU resolved (needs_sku_lookup=true) — surfaced separately
  //     so they're visible rather than silently dropped
  const openableItems = useMemo(() => {
    return basket.items.filter(b => b.tesco_url && !openedSkus.has(b.tesco_sku));
  }, [basket.items, openedSkus]);

  const blockedItems = useMemo(() => {
    return basket.items.filter(b => b.needs_sku_lookup);
  }, [basket.items]);

  const openNext = () => {
    const next = openableItems[0];
    if (!next) return;
    // window.open returns null if the popup was blocked; we still mark it as
    // opened so the user can advance past it rather than getting stuck. A
    // blocked popup is a user-side setting, not something we can fix from JS.
    window.open(next.tesco_url, "_blank", "noopener,noreferrer");
    setOpenedSkus(prev => {
      const next2 = new Set(prev);
      next2.add(next.tesco_sku);
      return next2;
    });
  };

  const resetOpened = () => setOpenedSkus(new Set());

  // Build the JSON payload for the Claude-in-Chrome handoff. Self-contained:
  // every field the agent needs to add the basket without asking. Includes
  // a _meta block with delivery date and household never-substitute rules
  // (currently regex-based from RAW; SKU-level exclusions are already
  // filtered out of basket.items by neverRestockReason so they won't show).
  //
  // Extracted as a shared builder so both download (file) and copy
  // (clipboard) paths produce identical payloads — important because we
  // don't yet know which Claude-in-Chrome prefers, and divergent payloads
  // would make Step 4 dry runs harder to debug.
  const buildBasketPayload = () => ({
    _meta: {
      generated_at: new Date().toISOString(),
      suggested_delivery_date: nextDelivery.date || null,
      item_count: basket.items.length,
      openable_count: basket.items.filter(b => b.tesco_url).length,
      needs_sku_lookup_count: blockedItems.length,
      estimated_total_gbp: basket.total,
      url_handling: {
        note: "Each item has either tesco_url (direct product page, preferred) or only tesco_search_url (Tesco search results, fallback). If tesco_url is present, go straight to it and Add to Basket. If only tesco_search_url, perform the search and confirm with the user before adding — the search may return multiple plausible products.",
      },
      household_rules: {
        never_substitute_to: (HOUSEHOLD_RULES.never_restock || []).map(r => r.pattern),
        note: "Khalil-critical items must not be substituted. Decline all Tesco substitution offers.",
      },
    },
    items: basket.items.map(b => ({
      name: b.name,
      qty: b.qty,
      pack_size: b.packSize,
      kind: b.kind,
      why: b.why,
      tesco_sku: b.tesco_sku,
      tesco_url: b.tesco_url,
      tesco_name: b.tesco_name,
      tesco_search_url: b.tesco_search_url,
      khalil_critical: b.khalil_critical,
      needs_sku_lookup: b.needs_sku_lookup,
      estimated_total_gbp: b.totalPrice,
    })),
  });

  const downloadBasketJson = () => {
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(buildBasketPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `basket-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy state: "idle" | "copied" | "error". The button shows confirmation
  // for 2 seconds after a successful copy, then resets. Two failure modes:
  //   1. navigator.clipboard unavailable (insecure context / very old browser)
  //   2. permission denied (rare in same-origin; user can deny via prompt)
  // Both fall back to "error" state so the user knows something went wrong
  // rather than silently losing the data.
  const [copyState, setCopyState] = useState("idle");

  const copyBasketJson = async () => {
    const json = JSON.stringify(buildBasketPayload(), null, 2);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API not available");
      await navigator.clipboard.writeText(json);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 3000);
    }
  };

  return basket.items.length > 0 ? (
    <Section title={`Suggested next basket · ${basket.items.length} items`}
      subtitle={basket.priced > 0
        ? `${basket.counts.expiring} expiring · ${basket.counts.gap} gaps · ${basket.counts.leverage} leverage · est. ~£${basket.total.toFixed(2)}${basket.unpriced>0?` (${basket.unpriced} unpriced)`:""}`
        : "Prices not available — no matches in order history"}
      tone="accent" collapsible defaultOpen={false}
      tip="Combines (1) pantry items expiring before the next delivery, (2) likely gaps from order history, and (3) high-leverage ingredients (each unlocks several recipes). Prices are medians from your past Tesco orders.">
      {nextDelivery.date && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-sm flex items-start gap-2">
        <span className="text-base">🚚</span>
        <div className="flex-1">
          <div><strong>Suggested delivery: {formatDate(nextDelivery.date)}</strong> <span className="text-xs text-stone-500">· in {basket.daysToDelivery}d</span></div>
          <div className="text-xs text-stone-600 mt-0.5">{nextDelivery.note}</div>
        </div>
      </div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-stone-500 text-xs uppercase tracking-wider">
            <th className="text-left py-1.5 pr-2">Item</th>
            <th className="text-left py-1.5 pr-2">Qty</th>
            <th className="text-left py-1.5 pr-2">Why</th>
            <th className="text-right py-1.5">Est. price</th>
          </tr></thead>
          <tbody>{basket.items.map((b, i) => {
            const chipTone = b.kind === "expiring" ? "danger" : b.kind === "gap" ? "warn" : "info";
            const chipLabel = b.kind === "expiring" ? "expiring" : b.kind === "gap" ? "gap" : "leverage";
            const qtyLabel = b.qty > 1 ? `${b.qty}×` : "1×";
            const sizeLabel = b.packSize || "pack";
            // Per-row click handler: keep openedSkus in sync with "Open next"
            // so the two flows don't get out of step. Browser handles the
            // navigation via the anchor's href + target=_blank; we only
            // update React state. No preventDefault — letting the link
            // behave normally means cmd/ctrl-click opens in background tab
            // as users expect.
            const markOpened = () => {
              if (!b.tesco_sku) return;
              setOpenedSkus(prev => {
                if (prev.has(b.tesco_sku)) return prev;
                const next = new Set(prev);
                next.add(b.tesco_sku);
                return next;
              });
            };
            const isOpened = b.tesco_sku && openedSkus.has(b.tesco_sku);
            return <tr key={i} className="border-t border-stone-100 align-top">
              <td className="py-2 pr-2">
                <div className="font-medium leading-tight">
                  {b.tesco_url ? (
                    <a
                      href={b.tesco_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={markOpened}
                      className={`hover:underline ${isOpened ? "text-stone-500" : ""}`}
                      title={`Open on Tesco: ${b.tesco_name || b.name}`}
                    >
                      {b.name}
                      {isOpened && <span className="ml-1 text-xs text-stone-400">✓</span>}
                    </a>
                  ) : b.tesco_search_url ? (
                    // No seeded SKU — fall back to a Tesco search link.
                    // Visually distinct (dotted underline + 🔎) so the user
                    // knows it lands on search results, not a product page.
                    // Still counts toward openedSkus by name (since there's
                    // no SKU) so the "Open next" flow advances past it.
                    <a
                      href={b.tesco_search_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-700 hover:underline decoration-dotted underline-offset-2"
                      style={{ textDecoration: "underline dotted", textUnderlineOffset: "2px" }}
                      title={`Tesco search for "${b.name}" — pick the right product manually (no SKU mapped yet)`}
                    >
                      <span className="text-xs mr-0.5">🔎</span>{b.name}
                    </a>
                  ) : (
                    <span>{b.name}</span>
                  )}
                </div>
                <Chip tone={chipTone}>{chipLabel}</Chip>
              </td>
              <td className="py-2 pr-2">
                <div className="mono whitespace-nowrap">{qtyLabel} {sizeLabel}</div>
                {b.unitPrice != null && b.qty > 1 && <div className="text-[10px] text-stone-500 mono mt-0.5">@ £{b.unitPrice.toFixed(2)}/ea</div>}
              </td>
              <td className="py-2 pr-2 text-stone-700">
                <div>{b.why}</div>
                {b.whySub && <div className="text-xs text-stone-500 mt-0.5">{b.whySub}</div>}
              </td>
              <td className="py-2 text-right mono">
                {b.totalPrice != null
                  ? <span className={b.priceSource === "fuzzy" ? "text-stone-500" : ""}>
                      {b.priceSource === "fuzzy" ? "~" : ""}£{b.totalPrice.toFixed(2)}
                    </span>
                  : <span className="text-stone-400">—</span>}
              </td>
            </tr>;
          })}</tbody>
          {basket.priced > 0 && <tfoot>
            <tr className="border-t-2 border-stone-300 font-semibold">
              <td className="py-2 pr-2" colSpan="3">Estimated total ({basket.priced} priced)</td>
              <td className="py-2 text-right mono">£{basket.total.toFixed(2)}</td>
            </tr>
          </tfoot>}
        </table>
      </div>

      {/* Basket actions: open in Tesco one-at-a-time + JSON export.
          One-per-click is deliberate — browsers block popup bursts from a
          single user gesture, and one-at-a-time keeps you reviewing each
          product page as it opens. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(() => {
          // Total items with a Tesco URL — the denominator for the "X of N"
          // progress display. Blocked items (needs_sku_lookup) are excluded
          // from both numerator and denominator so the count stays honest.
          const openableTotal = basket.items.filter(b => b.tesco_url).length;
          const openedCount = openableTotal - openableItems.length;
          if (openableItems.length > 0) {
            return (
              <button
                onClick={openNext}
                className="pill"
                data-active="true"
                title={`Opens "${openableItems[0].name}" in a new Tesco tab. One click = one tab.`}
              >
                🛒 Open next in Tesco: {openableItems[0].name}
                <span className="text-stone-500 ml-1">· {openedCount + 1} of {openableTotal}</span>
              </button>
            );
          }
          if (openableTotal > 0) {
            return (
              <span className="text-sm text-stone-600">
                ✓ All {openableTotal} openable items opened
                <button onClick={resetOpened} className="pill ml-2" title="Clear the opened-items tracker so you can re-open from the top">Reset</button>
              </span>
            );
          }
          return null;
        })()}

        <button
          onClick={downloadBasketJson}
          className="pill"
          title="Download the basket as JSON (for handing off to Claude in Chrome). Includes SKUs, URLs, Khalil-critical flags, and household never-substitute rules."
        >
          ⬇ Export JSON
        </button>

        <button
          onClick={copyBasketJson}
          className="pill"
          data-active={copyState === "copied" ? "true" : undefined}
          title="Copy the basket JSON to clipboard — paste straight into Claude in Chrome. Same payload as Export JSON."
        >
          {copyState === "copied" ? "✓ Copied" : copyState === "error" ? "✗ Copy failed" : "📋 Copy JSON"}
        </button>

        {blockedItems.length > 0 && (
          <span
            className="text-xs text-stone-600 bg-stone-100 border border-stone-200 rounded-full px-2 py-1"
            title="These items don't have a seeded Tesco SKU yet — clicking the item name opens a Tesco search instead of a direct product page. Future seeding pass will replace search links with direct ones."
          >
            🔎 {blockedItems.length} via search
          </span>
        )}
      </div>

      <div className="text-xs text-stone-500 mt-3 leading-relaxed">
        Quantities and pack sizes are based on what you typically order for this product. Prices are medians from your past Tesco orders and may not reflect current Tesco pricing. Fuzzy matches are marked with <span className="mono">~</span> and shown in lighter text. Unpriced items (<span className="mono">—</span>) had no match in order history. Item names with a dotted underline (<span className="mono">🔎</span>) link to a Tesco search rather than a direct product page — these don't have a seeded SKU yet, so pick the right product manually. Suggested delivery is calculated from your past order cadence.
      </div>
    </Section>
  ) : null;
}
