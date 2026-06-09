// ============================================================
// OrdersView — the Orders tab (Tesco delivery history + spend)
// ============================================================
// Verbatim port of canonical index.html L3322–3685. Step 7k.
//
// Renders the Tesco order archive with spend chart, repeat-
// purchase patterns, Khalil allergen exposure across history,
// substitution + unavailable logs, parse warnings, and the
// "Spend by pantry category" rollup that uses the SKU index
// to bridge receipt line items → pantry categories.
//
// Mounts <ReceiptParser/> in two positions:
//   1. Empty-state fallback when orders.length === 0
//   2. Between the KPI strip and the "Spend over time" chart
//
// Each mount is an independent ReceiptParser instance with its
// own state (file selection, save state, etc.).
//
// Structural changes vs canonical:
//   - hooks via named import
//   - useContext(ReceiptsContext) / useContext(TescoSkusContext)
//     → useReceipts() / useTescoSkus()
//   - helpers + primitives imported
//
// Props:
//   pantry — mapped pantry rows; drives the spend-by-pantry-category
//            join (each receipt line → SKU → basket_key → pantry item
//            → pantry category)
// ============================================================

import { useMemo, useState } from "react";
import { Chip, KV, Section } from "./primitives.jsx";
import ReceiptParser from "./ReceiptParser.jsx";
import SpendChart from "./SpendChart.jsx";
import { formatDate } from "../lib/pantry-math.js";
import { ordersKhalilFlag } from "../lib/receipt-parse.js";
import { lookupSku } from "../lib/tesco-skus.js";
import { useReceipts } from "../contexts/ReceiptsContext.jsx";
import { useTescoSkus } from "../contexts/TescoSkusContext.jsx";

export default function OrdersView({pantry, applyReplenishment}){
  // Receipts now come from Supabase via ReceiptsContext (commit 14.3).
  // The shape matches what RAW.tesco_orders used to provide — items[]
  // with name/section/status/total_price_gbp — so all downstream logic
  // in this component is unchanged. Sort defensively by delivery_date
  // (fetchReceipts already orders by delivery_date.asc, but ContextValue
  // could in principle be reordered).
  const { receipts } = useReceipts();
  // skuIndex bridges receipt line items → pantry items (and therefore pantry
  // categories). Used by the "Spend by pantry category" section below.
  const { skuIndex } = useTescoSkus();
  const orders = useMemo(
    () => (receipts || []).slice().sort((a,b) => (a.delivery_date||"").localeCompare(b.delivery_date||"")),
    [receipts]
  );
  const [expanded, setExpanded] = useState(null);
  // Timeframe filter for "Spend by pantry category". Three options:
  // "all" (every receipt — matches the spend chart), "90d", "30d". 30d/90d
  // are rolling windows ending today, not calendar months. Default "all"
  // because the household has 13 receipts of history and 30d may be sparse.
  const [spendCatWindow, setSpendCatWindow] = useState("all");

  const stats = useMemo(()=>{
    if (!orders.length) return null;
    const totalSpend = orders.reduce((s,o)=> s + (o.total_paid_gbp||0), 0);
    const totalItems = orders.reduce((s,o)=> s + (o.purchased_count||o.item_count||0), 0);
    const totalSaved = orders.reduce((s,o)=> s + (o.total_saved_gbp||0), 0);
    const totalSubs = orders.reduce((s,o)=> s + (o.substitution_count||0), 0);
    const totalUnavail = orders.reduce((s,o)=> s + (o.unavailable_count||0), 0);

    // Spend by section
    const bySection = new Map();
    for (const o of orders) {
      for (const it of o.items||[]) {
        if (it.status === "unavailable") continue;
        const sec = it.section || "uncategorised";
        bySection.set(sec, (bySection.get(sec)||0) + (it.total_price_gbp||0));
      }
    }
    const sectionTotals = [...bySection.entries()].sort((a,b)=> b[1]-a[1]);

    // Repeat-purchase patterns
    const itemMap = new Map();
    for (const o of orders) {
      for (const it of o.items||[]) {
        if (it.status === "unavailable") continue;
        const k = (it.name||"").toLowerCase().trim();
        if (!itemMap.has(k)) itemMap.set(k, {name: it.name, count:0, spend:0, lastDate: o.delivery_date, allergen: ordersKhalilFlag(it.name)});
        const e = itemMap.get(k);
        e.count += 1;
        e.spend += (it.total_price_gbp||0);
        if ((o.delivery_date||"") > (e.lastDate||"")) e.lastDate = o.delivery_date;
      }
    }
    const trends = [...itemMap.values()].sort((a,b)=> b.count - a.count || b.spend - a.spend);

    // Khalil allergen exposure across history
    const khalilExposure = trends.filter(t => t.allergen);

    // Substitution log
    const subs = [];
    for (const o of orders) {
      for (const it of o.items||[]) {
        if (it.status === "substituted") subs.push({...it, delivery_date: o.delivery_date, order_number: o.order_number});
      }
    }

    // Unavailable log
    const unavails = [];
    for (const o of orders) {
      for (const it of o.items||[]) {
        if (it.status === "unavailable") unavails.push({...it, delivery_date: o.delivery_date, order_number: o.order_number});
      }
    }

    // Parse-quality warnings
    const warnings = orders.filter(o => o.parse_quality && o.parse_quality !== "ok");

    return {
      totalSpend, totalItems, totalSaved, totalSubs, totalUnavail,
      sectionTotals, trends, khalilExposure, subs, unavails, warnings,
      avgSpend: totalSpend / orders.length,
    };
  }, [orders]);

  // Spend by pantry category. Joins receipt line items → pantry categories
  // via the SKU index, then aggregates total_price_gbp per category, filtered
  // by spendCatWindow. Kept as a separate useMemo from `stats` because
  // spendCatWindow toggles user-driven — recomputing all of stats on every
  // toggle would be wasteful.
  //
  // Join strategy:
  //   1. lookupSku(item.name, skuIndex) → SKU row → basket_key (canonical key)
  //   2. basket_key → pantry item by exact match on lowercased pantry.item
  //   3. pantry item → pantry.category
  // Any step failing → "uncategorised" bucket. The bucket is always rendered
  // last regardless of spend so it's easy to read the categorised stack first.
  //
  // Spend per line: total_price_gbp if present, else unit_price_gbp × qty,
  // else skip (no price = no spend, not a £0 line). Only `purchased` items
  // count — unavailable lines have no actual spend even when priced.
  const spendByPantryCategory = useMemo(() => {
    if (!orders.length) return {rows: [], totalSpend: 0, matchedPct: 0, totalLines: 0, matchedLines: 0};

    // Build pantry-item → category lookup, lowercased keys for case-insensitive match.
    const pantryCatByItem = new Map();
    (pantry || []).forEach(p => {
      if (p && p.item) {
        pantryCatByItem.set(String(p.item).toLowerCase().trim(), p.category || "uncategorised");
      }
    });

    // Timeframe cutoff. 30d/90d are rolling windows from today.
    let cutoff = null;
    if (spendCatWindow === "30d" || spendCatWindow === "90d") {
      const days = spendCatWindow === "30d" ? 30 : 90;
      const c = new Date();
      c.setDate(c.getDate() - days);
      cutoff = c.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    const byCat = new Map();
    let totalSpend = 0;
    let totalLines = 0;
    let matchedLines = 0;

    for (const o of orders) {
      if (cutoff && (o.delivery_date || "") < cutoff) continue;
      for (const it of o.items || []) {
        if (it.status === "unavailable") continue;
        // Derive line spend
        let spend = it.total_price_gbp;
        if (spend == null && it.unit_price_gbp != null && it.qty != null) {
          spend = it.unit_price_gbp * it.qty;
        }
        if (spend == null) continue;

        totalLines += 1;

        // Resolve receipt name → SKU → basket_key → pantry category
        let cat = "uncategorised";
        const sku = lookupSku(it.name, skuIndex);
        if (sku && sku.basket_key) {
          const pantryCat = pantryCatByItem.get(String(sku.basket_key).toLowerCase().trim());
          if (pantryCat) {
            cat = pantryCat;
            matchedLines += 1;
          }
        }

        byCat.set(cat, (byCat.get(cat) || 0) + spend);
        totalSpend += spend;
      }
    }

    // Sort by spend desc; force "uncategorised" to the bottom regardless of size.
    const rows = [...byCat.entries()]
      .map(([category, spend]) => ({category, spend, sharePct: totalSpend ? Math.round(100 * spend / totalSpend) : 0}))
      .sort((a, b) => {
        if (a.category === "uncategorised" && b.category !== "uncategorised") return 1;
        if (b.category === "uncategorised" && a.category !== "uncategorised") return -1;
        return b.spend - a.spend;
      });

    return {
      rows,
      totalSpend,
      matchedPct: totalLines ? Math.round(100 * matchedLines / totalLines) : 0,
      totalLines,
      matchedLines,
    };
  }, [orders, pantry, skuIndex, spendCatWindow]);

  if (!orders.length) {
    return <div className="space-y-4">
      <div className="card p-6 text-sm text-stone-500 text-center">
        No order history loaded yet. Receipts come from Supabase; if this persists, check the network tab.
      </div>
      <ReceiptParser pantry={pantry} applyReplenishment={applyReplenishment}/>
    </div>;
  }

  const maxSection = Math.max(...stats.sectionTotals.map(([,v])=>v), 1);

  return <div className="space-y-5">
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      <KV label="Orders" value={orders.length} sub={`${formatDate(orders[0].delivery_date)} → ${formatDate(orders[orders.length-1].delivery_date)}`}/>
      <KV label="Total spend" value={`£${stats.totalSpend.toFixed(0)}`} sub="Across all orders"/>
      <KV label="Avg order" value={`£${stats.avgSpend.toFixed(0)}`} sub="Per delivery"/>
      <KV label="Items bought" value={stats.totalItems} sub="Excludes unavailable"/>
      <KV label="Savings" value={`£${stats.totalSaved.toFixed(0)}`} sub="Clubcard / deals"/>
      <KV label="Substitutions" value={stats.totalSubs} sub="Items swapped by Tesco"/>
      <KV label="Unavailable" value={stats.totalUnavail} sub="Ordered, not delivered"/>
    </div>

    <ReceiptParser pantry={pantry} applyReplenishment={applyReplenishment}/>

    <Section title="Spend over time" subtitle="Order totals, oldest → newest" tone="info"
      tip="Each bar is one delivery. Useful for spotting big top-up shops vs. regular weekly shops.">
      <SpendChart orders={orders}/>
    </Section>

    <Section title={`Order history · ${orders.length} orders`} subtitle="Click any order to see line items, substitutions, and unavailable items"
      collapsible defaultOpen={false}
      tip="Every parsed Tesco delivery. Each row shows item count, substitutions (sub), unavailable items, Khalil-allergen exposure (⚠️), and total. Click to expand into the full receipt.">
      <div className="space-y-1.5">
        {orders.slice().reverse().map(o => {
          const open = expanded === o.order_number;
          const allergenLines = (o.items||[]).filter(it => it.status !== "unavailable" && ordersKhalilFlag(it.name)).length;
          return <div key={o.order_number} className="card">
            <div role="button" tabIndex={0}
                 onClick={(e)=>{ if(e.target.closest('button,a')) return; setExpanded(open?null:o.order_number); }}
                 onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setExpanded(open?null:o.order_number);} }}
                 className="px-3 py-2 flex items-center gap-2 flex-wrap text-sm cursor-pointer select-none">
              <span className="mono text-xs text-stone-500 w-28 shrink-0">{formatDate(o.delivery_date)}</span>
              <Chip title="Tesco order number">#{o.order_number}</Chip>
              {o.email_type && <Chip tone="neutral" title="Email type: receipt = post-delivery, confirmation = at-order, amendment = changed before delivery">{o.email_type}</Chip>}
              <span className="flex-1 min-w-[20px]"/>
              <Chip title="Items actually delivered">{o.purchased_count||o.item_count||0} items</Chip>
              {o.substitution_count>0 && <Chip tone="warn" title="Items Tesco swapped in">{o.substitution_count} sub</Chip>}
              {o.unavailable_count>0 && <Chip tone="danger" title="Items ordered but not delivered">{o.unavailable_count} unavail</Chip>}
              {allergenLines>0 && <Chip tone="warn" title={`${allergenLines} delivered items contain a Khalil allergen`}>⚠️ {allergenLines}</Chip>}
              <Chip tone="accent" title="Total paid for this order">£{(o.total_paid_gbp||0).toFixed(2)}</Chip>
              <span className="text-xs text-stone-400">{open?'▲':'▼'}</span>
            </div>
            {open && <div className="px-3 pb-3 text-xs border-t border-stone-100 pt-2">
              {o.parse_warning && <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1 mb-2">⚠️ {o.parse_warning}</div>}
              <div className="overflow-x-auto">
                {/* min-w floor so the 7-column line-item table scrolls sideways
                    on mobile instead of crushing every column together. */}
                <table className="w-full min-w-[640px]">
                  <thead><tr className="text-stone-500"><th className="text-left py-1 w-8">Qty</th><th className="text-left">Item</th><th className="text-left w-24">Section</th><th className="text-right w-14">£/each</th><th className="text-right w-14">Total</th><th className="text-center w-20">Status</th><th className="text-center w-16">Khalil</th></tr></thead>
                  <tbody>{(o.items||[]).map((it,i)=> {
                    const k = ordersKhalilFlag(it.name);
                    return <tr key={i} className="border-t border-stone-100">
                      <td className="py-1 mono">{it.qty}</td>
                      <td>{it.name}{it.substituted_for && <div className="text-[10px] text-amber-700">↻ instead of {it.substituted_for}</div>}</td>
                      <td className="text-stone-500">{it.section||"—"}</td>
                      <td className="text-right mono">{it.unit_price_gbp!=null?`£${it.unit_price_gbp.toFixed(2)}`:"—"}</td>
                      <td className="text-right mono">{it.total_price_gbp!=null?`£${it.total_price_gbp.toFixed(2)}`:"—"}</td>
                      <td className="text-center">{it.status==="substituted"?<Chip tone="warn">sub</Chip>:it.status==="unavailable"?<Chip tone="danger">unavail</Chip>:<span className="text-stone-400">·</span>}</td>
                      <td className="text-center">{k?<Chip tone="warn">{k}</Chip>:<span className="text-emerald-600">✓</span>}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            </div>}
          </div>;
        })}
      </div>
    </Section>

    <Section title="Spend by aisle" subtitle="Categorised by Tesco's order-page section"
      tip="Where the money goes. Aisle labels come straight from Tesco — 'cupboard' tends to dominate because it's a catch-all for non-fridge, non-freezer items.">
      <div className="space-y-1.5">
        {stats.sectionTotals.map(([sec, v]) => <div key={sec} className="flex items-center gap-3">
          <div className="w-28 text-sm shrink-0">{sec}</div>
          <div className="flex-1 bg-stone-100 rounded-full h-5 overflow-hidden">
            <div className="bg-teal-700 h-full" style={{width: `${(v/maxSection)*100}%`}}/>
          </div>
          <div className="mono text-xs w-16 text-right">£{v.toFixed(0)}</div>
        </div>)}
      </div>
    </Section>

    <Section title="Spend by pantry category" subtitle="Receipt items joined to pantry categories via the SKU index"
      tip="Same spend total as the aisle view, but cut by your pantry's category taxonomy (protein, produce, dry-goods, etc.) rather than Tesco's. Items that don't resolve to a pantry category are bucketed as 'uncategorised' at the bottom — these are usually one-off or unfamiliar items not yet in the pantry. Use the toggle to scope to recent shops.">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-stone-500">Window:</span>
          <div className="flex gap-1">
            {[["all", "All time"], ["90d", "Last 90 days"], ["30d", "Last 30 days"]].map(([k, label]) => (
              <button key={k} onClick={() => setSpendCatWindow(k)}
                className="pill" data-active={spendCatWindow === k ? "" : undefined}
                title={`Aggregate spend over ${label.toLowerCase()}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-stone-500 mono">
          £{spendByPantryCategory.totalSpend.toFixed(0)} across {spendByPantryCategory.totalLines} lines · {spendByPantryCategory.matchedPct}% matched to pantry
        </div>
      </div>
      {spendByPantryCategory.rows.length === 0
        ? <div className="text-sm text-stone-500">No purchased lines in this window.</div>
        : (() => {
            const maxCat = Math.max(...spendByPantryCategory.rows.map(r => r.spend), 1);
            return <div className="space-y-1.5">
              {spendByPantryCategory.rows.map(r => <div key={r.category} className="flex items-center gap-3">
                <div className="w-32 text-sm shrink-0">{r.category}</div>
                <div className="flex-1 bg-stone-100 rounded-full h-5 overflow-hidden">
                  <div className={r.category === "uncategorised" ? "bg-stone-400 h-full" : "bg-teal-700 h-full"}
                       style={{width: `${(r.spend/maxCat)*100}%`}}/>
                </div>
                <div className="mono text-xs w-10 text-right text-stone-500">{r.sharePct}%</div>
                <div className="mono text-xs w-16 text-right">£{r.spend.toFixed(0)}</div>
              </div>)}
            </div>;
          })()
      }
    </Section>

    <Section title="Repeat-purchase patterns" subtitle={`${stats.trends.filter(t=>t.count>=2).length} items bought across 2+ orders`}
      collapsible defaultOpen={false}
      tip="Items appearing in 2+ orders, sorted by order count then by total spend. Useful for identifying reliable staples to keep on auto-add.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {stats.trends.filter(t=>t.count>=2).slice(0,30).map((t,i)=> <div key={i} className="card px-2.5 py-1.5 flex items-center justify-between text-xs gap-2">
          <span className="truncate flex-1">{t.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {t.allergen && <Chip tone="warn" title={`Contains ${t.allergen} — Khalil cannot eat`}>{t.allergen}</Chip>}
            <Chip title="Number of orders this item appeared in">×{t.count}</Chip>
            <Chip tone="accent" title="Cumulative spend across all orders">£{t.spend.toFixed(0)}</Chip>
          </div>
        </div>)}
      </div>
    </Section>

    {stats.khalilExposure.length>0 && <Section title="Khalil allergen exposure" subtitle={`${stats.khalilExposure.length} distinct items containing his allergens have been ordered`} tone="warn"
      collapsible defaultOpen={false}
      tip="Items bought historically that Khalil can't eat. Not a problem in itself (these are for the adults), but useful context — anything frequently re-purchased may worth replacing with a Khalil-safe alternative.">
      <div className="grid sm:grid-cols-2 gap-1.5 text-xs">
        {stats.khalilExposure.slice(0,40).map((t,i)=> <div key={i} className="card px-2.5 py-1.5 flex items-center justify-between gap-2">
          <span className="truncate flex-1">{t.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <Chip tone="warn">{t.allergen}</Chip>
            <Chip title="Number of orders">×{t.count}</Chip>
            <span className="text-stone-500 mono" title="Most recent order date">{t.lastDate}</span>
          </div>
        </div>)}
      </div>
    </Section>}

    {stats.subs.length>0 && <Section title={`Substitutions · ${stats.subs.length}`} subtitle="Items Tesco swapped in"
      tip="When Tesco runs out of what you ordered, they swap in a similar item. Worth scanning for repeat substitutions — it usually means the original product needs replacing in your usual basket.">
      <div className="space-y-1 text-xs">
        {stats.subs.slice(0,20).map((s,i)=> <div key={i} className="card px-2.5 py-1.5 flex flex-wrap items-center gap-2">
          <span className="mono text-stone-500 w-28 shrink-0">{formatDate(s.delivery_date)}</span>
          <span className="text-stone-700">{s.substituted_for}</span>
          <span className="text-stone-400">→</span>
          <span className="font-medium">{s.name}</span>
        </div>)}
      </div>
    </Section>}

    {stats.unavails.length>0 && <Section title={`Unavailable items · ${stats.unavails.length}`} subtitle="Items ordered but not delivered"
      collapsible defaultOpen={false}
      tip="Things you tried to order that Tesco couldn't fulfil and had no substitute for. Recurring entries usually mean a product is being phased out — worth finding an alternative.">
      <div className="space-y-1 text-xs">
        {stats.unavails.slice(0,20).map((u,i)=> <div key={i} className="card px-2.5 py-1.5 flex flex-wrap items-center gap-2">
          <span className="mono text-stone-500 w-28 shrink-0">{formatDate(u.delivery_date)}</span>
          <span>{u.name}</span>
        </div>)}
      </div>
    </Section>}

    {stats.warnings.length>0 && <Section title={`Parse warnings · ${stats.warnings.length}`} subtitle="Orders where parsing flagged something" tone="warn"
      tip="Receipts where the parser noticed something odd — usually a truncated email body where line items didn't add up to the order total. Treat these orders' line-item lists as incomplete.">
      <div className="space-y-1 text-xs">
        {stats.warnings.map((w,i)=> <div key={i} className="card px-2.5 py-1.5">
          <span className="mono text-stone-500 mr-2">#{w.order_number}</span> {w.parse_warning}
        </div>)}
      </div>
    </Section>}
  </div>;
}
