// ============================================================
// AuditView — the Stats / library-health tab
// ============================================================
// Verbatim port of canonical index.html L4485–4791 (AuditView)
// and L4793–4809 (GapCard, co-located here because it's used
// only by this view).
//
// Structural changes vs. canonical (per migration principle #4,
// behaviour identical):
//   - hooks via named import from "react"
//   - context reads use the extracted hooks
//       useAllergens() / useReceipts() / useRecipes()
//     instead of canonical's bare useContext(...) calls
//   - RECIPES module global → `recipes` read from RecipesContext.
//     `updateRecipePage` + `version` (the canonical
//     `recipesVersion`) come from the same hook — previously these
//     were threaded through props from App.jsx, but post-7g/7h
//     the context owns them since PlannerView is now a second
//     consumer.
//   - primitives + helpers imported, no inline definitions
//
// Props (post-7g):
//   pantry      — array of mapped pantry rows
//   cooked      — array of mapped cooked-log rows (only the
//                 length is consumed)
//   outOfStock  — Set of item names currently flagged out
// ============================================================

import { useMemo, useState } from "react";
import { Bar, Chip, Section, Stat } from "./primitives.jsx";
import { daysUntilExpiry, decayed, formatDate } from "../lib/pantry-math.js";
import { audienceFromFlags, flagsForRecipe } from "../lib/allergens.js";
import { useAllergens } from "../contexts/AllergensContext.jsx";
import { useReceipts } from "../contexts/ReceiptsContext.jsx";
import { useRecipes } from "../contexts/RecipesContext.jsx";

export default function AuditView({pantry, cooked, outOfStock}){
  const { allergens } = useAllergens();
  const { receipts } = useReceipts();
  // recipes + updateRecipePage + version come from RecipesContext (7g/7h
  // refactor). Previously updateRecipePage + recipesVersion were threaded
  // down from App.jsx as props; the context-based shape eliminates that
  // drilling now that there are two consumers (AuditView + PlannerView).
  const { recipes, updateRecipePage, version: recipesVersion } = useRecipes();
  // Global counters shown at the very top of the tab — moved here from the App
  // header in v9 so the home page stays focused on the brand block + tab nav.
  const oosSet = outOfStock || new Set();
  const expiringCount = pantry.filter(p=>!oosSet.has(p.item) && daysUntilExpiry(p)!==null && daysUntilExpiry(p)<=5).length;
  const cookedCount = (cooked || []).length;
  const lastReceiptDate = receipts.length
    ? receipts.map(r => r.delivery_date).filter(Boolean).sort().pop()
    : null;
  const decorated = useMemo(()=> recipes.map(r=>{
    const f = flagsForRecipe(r, allergens);
    return {...r, _flags:f, _audience: r.audience || audienceFromFlags(f)};
  }), [recipes, allergens, recipesVersion]);

  const byAudience = {
    "whole-household": decorated.filter(r=>r._audience==="whole-household"),
    "check": decorated.filter(r=>r._audience==="check"),
    "adults-only": decorated.filter(r=>r._audience==="adults-only"),
  };
  // Now most files have audience tags (we fixed them)
  const taggedRecipes = recipes.filter(r => r.audience).length;
  const untagged = recipes.length - taggedRecipes;
  const hasMakeablePct = recipes.filter(r=> r.makeable_pct !== null && r.makeable_pct !== undefined).length;
  const pantryWithFlags = pantry.filter(p=>p.allergen_flag).length;

  const sources = [...new Set(recipes.map(r=>r._source_file))].sort();
  const bySource = sources.map(s => {
    const list = decorated.filter(r=>r._source_file===s);
    return {
      source: s,
      total: list.length,
      whole: list.filter(r=>r._audience==="whole-household").length,
      check: list.filter(r=>r._audience==="check").length,
      adults: list.filter(r=>r._audience==="adults-only").length,
    };
  });
  // Page-number coverage across book-sourced recipes. The recipe schema uses
  // source.type === "book" with an optional page number; many were imported
  // before page-tagging was systematic. Surfacing this lets the user see which
  // books need a pass to add page refs, which is helpful when cross-referencing
  // a recipe in the physical book during cooking. Excludes web/instagram/other
  // source types — those don't have page numbers by nature.
  // Wrapped in useMemo + keyed on recipesVersion so a row save by either this
  // tab's drilldown or the Recipes-tab pencil affordance triggers a recompute,
  // which drops the missing count and updates the KPI cards in place.
  const { bookRecipes, missingPage, pagePct, missingByBook } = useMemo(() => {
    const books = recipes.filter(r => r.source && r.source.type === "book");
    const missing = books.filter(r => r.source.page == null || r.source.page === "" || r.source.page === 0);
    const pct = books.length ? Math.round(100 * (books.length - missing.length) / books.length) : 100;
    const groups = new Map();
    books.forEach(r => {
      const title = (r.source.title || "Unknown").trim();
      if (!groups.has(title)) groups.set(title, { title, total: 0, missing: 0, missingRecipes: [] });
      const g = groups.get(title);
      g.total += 1;
      if (r.source.page == null || r.source.page === "" || r.source.page === 0) {
        g.missing += 1;
        g.missingRecipes.push({ id: r.id, name: r.name });
      }
    });
    groups.forEach(g => g.missingRecipes.sort((a, b) => a.name.localeCompare(b.name)));
    const byBook = [...groups.values()]
      .map(g => ({ ...g, completePct: g.total ? Math.round(100 * (g.total - g.missing) / g.total) : 100 }))
      .sort((a, b) => b.missing - a.missing); // worst offenders first
    return { bookRecipes: books, missingPage: missing, pagePct: pct, missingByBook: byBook };
  }, [recipes, recipesVersion]);

  // ── Drilldown UI state ──
  // Local-edit + export-to-SQL flow was removed in v28 — now that RLS on
  // public.recipes is confirmed off, the dashboard can PATCH source_page
  // directly via updateRecipePage. State that remains: which book row is
  // expanded, and a per-recipe in-flight/error flag so the row can show a
  // pending state during the network round-trip.
  const [expandedBook, setExpandedBook] = useState(null);
  const [rowSyncErrors, setRowSyncErrors] = useState({}); // {recipeId: errorMessage}
  // Pantry composition + confidence health by category. Combines task 2A (counts
  // and share-of-pantry) with task 2B (avg confidence and expiring-soon count) in
  // one rollup. Items without a category are bucketed under "uncategorised" so the
  // total always reconciles with pantry.length. Items currently marked
  // out-of-stock are excluded from all four metrics — they're not really "in" the
  // pantry until restored.
  const byCategory = useMemo(() => {
    const inStock = pantry.filter(p => !oosSet.has(p.item));
    const groups = new Map();
    inStock.forEach(p => {
      const cat = (p.category && p.category.trim()) ? p.category : "uncategorised";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    });
    const total = inStock.length || 1;
    return [...groups.entries()]
      .map(([cat, items]) => {
        const confSum = items.reduce((s, p) => s + decayed(p), 0);
        const avgConf = Math.round(confSum / items.length);
        const expiring = items.filter(p => {
          const d = daysUntilExpiry(p);
          return d !== null && d <= 5;
        }).length;
        return {
          category: cat,
          count: items.length,
          sharePct: Math.round(100 * items.length / total),
          avgConf,
          expiring,
        };
      })
      .sort((a, b) => b.count - a.count); // largest categories first
  }, [pantry, oosSet]);
  const totalInStock = pantry.filter(p => !oosSet.has(p.item)).length;

  // ── Eaters & dietary requirements (Admin) ──
  // Render the household_allergens config (via useAllergens, defaulted to
  // EMPTY_ALLERGENS by the context) as one card per eater. Khalil's block list
  // is grouped by category (blockByCategory); Max/Emily are flat block lists.
  const CAT_LABELS = {
    wheat: "Wheat / gluten", dairy: "Dairy", eggs: "Eggs", beef: "Beef",
    tree_nuts: "Tree nuts", legumes: "Legumes & pulses", avocado: "Avocado",
  };
  const KHALIL_CAT_ORDER = ["wheat", "dairy", "eggs", "beef", "tree_nuts", "legumes", "avocado"];
  const khalilGroups = KHALIL_CAT_ORDER
    .filter(c => (allergens.khalil?.blockByCategory?.[c] || []).length)
    .map(c => ({ label: CAT_LABELS[c] || c, tone: "danger", tokens: allergens.khalil.blockByCategory[c] }));

  return <div className="space-y-6">
    {/* ===== ADMIN — household config + data-quality tools ===== */}
    <GroupHeader title="Admin" desc="Household eaters & dietary requirements, data-quality checks, and page-number fixes." />

    <Section title="Eaters & dietary requirements" tone="info" collapsible defaultOpen
      tip="Who eats in this household and what each person avoids. Sourced from the household_allergens table in Supabase — the same config that drives recipe audience tags, the Khalil-safe filters, and basket allergen flags. Edit it in Supabase to change what's flagged everywhere.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
        <EaterCard name="Max" diet="Pescatarian"
          desc="No meat or poultry — fish and seafood are fine."
          groups={[{ label: "Avoids", tone: "danger", tokens: allergens.max?.block || [] }]} />
        <EaterCard name="Emily" diet="No pork"
          desc="Avoids pork and pork products."
          groups={[{ label: "Avoids", tone: "danger", tokens: allergens.emily?.block || [] }]} />
        <EaterCard name="Khalil (age 2)" diet="Multiple allergies"
          desc="Strict avoidance across several categories. Peanuts are safe; tree nuts are not."
          groups={[
            ...khalilGroups,
            { label: "Check label", tone: "warn", tokens: allergens.khalil?.uncertain || [] },
            { label: "Confirmed safe", tone: "ok", tokens: allergens.khalil?.safe || [] },
          ]} />
      </div>
    </Section>

    <Section title="Workflow integrity" subtitle="Health check — green means all good, amber means a small fix is needed" tone="ok" collapsible defaultOpen={false}
      tip="Each card reports on one data-quality dimension: are all recipes tagged with an audience, are all pantry items tagged with an allergen flag, etc. Status chip on each card: ✓ OK = nothing to do, ⚠ Fix needed = small repair recommended, ⚠ Critical action needed = fix before relying on this data.">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <GapCard label="Recipes with audience tag" value={taggedRecipes} of={recipes.length} severity={untagged > 0 ? "medium":"low"}
                 note={untagged > 0 ? `${untagged} recipes still untagged — re-import the patched files in /project-updates/.` : "All recipes now carry audience + eaters tags."}/>
        <GapCard label="Pantry items with allergen_flag" value={pantryWithFlags} of={pantry.length} severity={pantryWithFlags < pantry.length ? "medium":"low"}
                 note={pantryWithFlags < pantry.length ? "Some pantry items missing the allergen_flag field — re-import the patched current_pantry.json." : "All pantry items tagged."}/>
        <GapCard label="makeable_pct populated" value={hasMakeablePct} of={recipes.length} severity="low"
                 note="Computed live on every render in this dashboard. Not stored persistently in the JSON — that's fine since pantry changes invalidate it."/>
        <GapCard label="Derived subsets" value="Generated" of="2 files" severity="low"
                 note="khalil-safe-meals.json (38) and max-pescatarian.json (93) regenerated and shipped in /project-updates/."/>
        <GapCard label="Manifest counts" value="Corrected" of="3 fixes" severity="low"
                 note="east-curries (8), east-rice-tofu-pulses (18), east-condiments-sweet (6) now report accurate counts."/>
        <GapCard label="Order archive" value="See Orders tab" of="—" severity="low"
                 note="Spend trends, item frequency, allergen exposure, substitutions and unavailable items — all from the embedded Tesco order archive."/>
      </div>
    </Section>

    <Section title="Recipe page-number coverage"
      subtitle={`${missingPage.length} of ${bookRecipes.length} book recipes missing a page reference (${pagePct}% complete)`}
      tone={missingPage.length > 0 ? "warn" : "ok"}
      collapsible defaultOpen={false}
      tip="Counts how many book-sourced recipes have a page number recorded vs. how many are missing one. Page references are handy when cross-referencing the physical book mid-cook. Web and Instagram recipes are excluded — they don't have page numbers by nature.">
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Book recipes" value={bookRecipes.length}
          tip="Total recipes sourced from a book (source.type === 'book'). Excludes web and Instagram saves."/>
        <Stat label="Missing page numbers" value={missingPage.length}
          tone={missingPage.length > 0 ? "warn" : "ok"}
          tip="Book recipes with no page number in source.page. Worth patching when you have the book to hand — useful for cross-referencing mid-cook."/>
        <Stat label="% complete" value={`${pagePct}%`}
          tone={pagePct >= 90 ? "ok" : pagePct >= 50 ? "warn" : "info"}
          tipAlign="right"
          tip="Percentage of book recipes with a page number recorded. 100% means every book recipe in the library cross-references its source page."/>
      </div>
      {missingByBook.some(b => b.missing > 0) && <>
        <div className="text-xs text-stone-500 mb-2 uppercase tracking-wider">By book — worst offenders first · click a row to add page numbers</div>
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-2 items-center text-[11px] text-stone-500 uppercase tracking-wider px-1">
            <div className="col-span-5">Book</div>
            <div className="col-span-2 text-right">Missing</div>
            <div className="col-span-3">Coverage</div>
            <div className="col-span-2 text-right">% complete</div>
          </div>
          {missingByBook.map(b => {
            const isOpen = expandedBook === b.title;
            return <div key={b.title} className="border-b border-stone-100 last:border-0">
              <div
                role="button" tabIndex={0}
                onClick={()=>setExpandedBook(isOpen ? null : b.title)}
                onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setExpandedBook(isOpen ? null : b.title); } }}
                className={`grid grid-cols-12 gap-2 items-center text-sm py-1.5 cursor-pointer select-none hover:bg-stone-50 ${b.missing === 0 ? "opacity-60" : ""}`}
                title={b.missing > 0 ? "Click to see recipes missing page numbers" : "All recipes in this book are tagged"}
              >
                <div className="col-span-5 font-medium truncate flex items-center gap-1.5" title={b.title}>
                  {b.missing > 0 && <span className="text-stone-400 text-xs shrink-0">{isOpen ? '▼' : '▶'}</span>}
                  {b.missing === 0 && <span className="text-stone-300 text-xs shrink-0">·</span>}
                  <span className="truncate">{b.title}</span>
                </div>
                <div className={`col-span-2 text-right mono text-xs ${b.missing > 0 ? "text-amber-700 font-semibold" : "text-stone-400"}`}>{b.missing} / {b.total}</div>
                <div className="col-span-3"><Bar pct={b.completePct}/></div>
                <div className="col-span-2 text-right mono text-xs text-stone-500">{b.completePct}%</div>
              </div>
              {isOpen && b.missing > 0 && <div className="bg-stone-50 rounded px-3 py-2 my-1 space-y-1">
                <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-1.5">
                  {b.missingRecipes.length} recipe{b.missingRecipes.length === 1 ? "" : "s"} need{b.missingRecipes.length === 1 ? "s" : ""} a page number — enter a number and tab/click away to save
                </div>
                {b.missingRecipes.map(r => {
                  const syncErr = rowSyncErrors[r.id];
                  return <div key={r.id} className="grid grid-cols-12 gap-2 items-center text-sm py-0.5">
                    <div className="col-span-9 truncate" title={r.name}>{r.name}</div>
                    <div className="col-span-3 flex items-center justify-end gap-1.5">
                      {syncErr && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" title={syncErr}></span>}
                      <input
                        type="number"
                        min="1"
                        placeholder="page"
                        defaultValue=""
                        onBlur={(e)=>{
                          const val = e.target.value;
                          if (!val) return; // empty blur — don't fire a no-op save
                          // Clear any prior error optimistically, save, restore on failure
                          setRowSyncErrors(prev => { const n = {...prev}; delete n[r.id]; return n; });
                          updateRecipePage(r.id, val, {
                            onError: (err) => setRowSyncErrors(prev => ({ ...prev, [r.id]: "Couldn't save — try again" })),
                          });
                          // Clear the input so a re-render of this row (which will
                          // disappear from the missing list once the optimistic
                          // mutation lands) doesn't carry the stale value.
                          e.target.value = "";
                        }}
                        onKeyDown={(e)=>{ if(e.key==='Enter'){ e.target.blur(); } }}
                        className="w-16 px-2 py-0.5 text-xs border border-stone-300 rounded mono text-right focus:outline-none focus:border-amber-500"
                        title="Enter the page number, then Tab or Enter to save to Supabase"
                      />
                    </div>
                  </div>;
                })}
              </div>}
            </div>;
          })}
        </div>
      </>}
    </Section>

    {/* ===== STATS — read-only library + pantry metrics ===== */}
    <GroupHeader title="Stats" desc="Read-only metrics across your recipe library and pantry — nothing here changes your data." />

    <div className="text-stone-600 text-sm border border-stone-200 rounded-lg px-4 py-3 flex flex-wrap items-baseline justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-1">
        <span title="Total recipes across all sources">{recipes.length} recipes</span>
        <span className="text-stone-300">·</span>
        <span title="Items currently tracked in your pantry">{pantry.length} pantry items</span>
        <span className="text-stone-300">·</span>
        <span title="Pantry items expiring in 5 days or fewer">{expiringCount} expiring soon</span>
        <span className="text-stone-300">·</span>
        <span title="Recipes you've marked cooked in this browser">{cookedCount} cooked</span>
        <span className="text-stone-300">·</span>
        <span title="Tesco deliveries parsed from receipt emails">{receipts.length} orders</span>
      </div>
      <span className="text-xs text-stone-500 mono">{lastReceiptDate ? `last receipt: ${formatDate(lastReceiptDate)}` : "no receipts yet"}</span>
    </div>

    <Section title="Pantry composition & health"
      subtitle="By category — what's in the kitchen and which categories are at risk"
      collapsible defaultOpen={false}
      tip="Two views in one section: (1) how the in-stock pantry breaks down by category — count, share of total, and an at-a-glance bar; (2) the average confidence score per category plus how many items in each are expiring in ≤5 days. Out-of-stock items are excluded throughout — they're not really in the pantry until restored. Confidence decays automatically by category type, so this rolls up that decay so you can see at a glance which categories are quietly rotting (e.g. produce at 35% avg vs. dry-goods at 92%).">
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Categories tracked" value={byCategory.length}
          tip="Distinct category values currently in the in-stock pantry. Items without a category are bucketed under 'uncategorised'."/>
        <Stat label="In-stock items" value={totalInStock}
          tip="Pantry items not marked out-of-stock. This is the denominator for the share-of-pantry percentages below."/>
        <Stat label="Categories <50% avg" value={byCategory.filter(c=>c.avgConf<50).length}
          tone={byCategory.filter(c=>c.avgConf<50).length>0?"warn":"ok"}
          tipAlign="right"
          tip="Categories whose average confidence has dropped below 50%. Usually means a fresh-produce or dairy category that's been sitting a while — worth checking in person or buying fresh."/>
      </div>
      <div className="text-xs text-stone-500 mb-2 uppercase tracking-wider">Composition (by item count)</div>
      <div className="space-y-1 mb-5">
        {byCategory.map(c => <div key={c.category} className="grid grid-cols-12 gap-2 items-center text-sm">
          <div className="col-span-4 font-medium">{c.category}</div>
          <div className="col-span-1 text-right text-stone-500 text-xs mono">{c.count}</div>
          <div className="col-span-6">
            <div className="bar"><div style={{width:`${c.sharePct}%`, background:"#78716c"}} title={`${c.sharePct}% of in-stock pantry`}/></div>
          </div>
          <div className="col-span-1 text-right text-stone-500 text-xs mono">{c.sharePct}%</div>
        </div>)}
      </div>
      <div className="text-xs text-stone-500 mb-2 uppercase tracking-wider">Confidence health</div>
      <div className="space-y-1">
        <div className="grid grid-cols-12 gap-2 items-center text-[11px] text-stone-500 uppercase tracking-wider px-1">
          <div className="col-span-4">Category</div>
          <div className="col-span-1 text-right">Items</div>
          <div className="col-span-5">Avg confidence</div>
          <div className="col-span-2 text-right" title="Items in this category expiring in 5 days or fewer">Expiring ≤5d</div>
        </div>
        {byCategory.map(c => <div key={c.category+"-h"} className="grid grid-cols-12 gap-2 items-center text-sm">
          <div className="col-span-4 font-medium">{c.category}</div>
          <div className="col-span-1 text-right text-stone-500 text-xs mono">{c.count}</div>
          <div className="col-span-5 flex items-center gap-2">
            <div className="flex-1"><Bar pct={c.avgConf}/></div>
            <span className="mono text-[10px] text-stone-500 min-w-[28px] text-right">{c.avgConf}%</span>
          </div>
          <div className={`col-span-2 text-right mono text-xs ${c.expiring>0?"text-amber-700 font-semibold":"text-stone-400"}`}>{c.expiring}</div>
        </div>)}
      </div>
    </Section>

    <Section title="Audience breakdown across library"
      collapsible defaultOpen={false}
      tip="How many recipes in each source file are safe for the whole household vs. adults-only vs. need-a-label-check. A high adults-only ratio means most recipes need adaptation if Khalil is eating.">
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <Stat label="Whole-household safe" value={byAudience["whole-household"].length} tone="ok" sub={`${Math.round(100*byAudience["whole-household"].length/recipes.length)}% of library`}
          tip="Recipes with no Khalil-allergen ingredients (no eggs, dairy, wheat, lentils, peas, chickpeas, beans, avocado, beef, tree nuts) and that Max and Emily can also eat."/>
        <Stat label="Needs check" value={byAudience["check"].length} tone="warn"
          tip="Recipes that depend on a brand/label detail — usually soy sauce (use tamari for Khalil), oat products (check gluten), or similar."/>
        <Stat label="Adults only" value={byAudience["adults-only"].length} tone="info" sub={`${Math.round(100*byAudience["adults-only"].length/recipes.length)}%`}
          tipAlign="right"
          tip="Recipes containing a Khalil allergen with no easy adaptation. Plan a parallel Khalil-safe dish on these nights."/>
      </div>
      <div className="text-xs text-stone-500 mb-2 uppercase tracking-wider">By source file</div>
      <div className="space-y-1">
        {bySource.map(s => <div key={s.source} className="grid grid-cols-12 gap-2 items-center text-sm">
          <div className="col-span-4 font-medium">{s.source}</div>
          <div className="col-span-1 text-right text-stone-500 text-xs">{s.total}</div>
          <div className="col-span-7 flex h-3 rounded overflow-hidden border border-stone-200" title={`${s.whole} whole-household · ${s.check} check · ${s.adults} adults-only`}>
            <div style={{flex:s.whole, background:"#16a34a"}} title={`${s.whole} whole-household`}/>
            <div style={{flex:s.check, background:"#d97706"}} title={`${s.check} check`}/>
            <div style={{flex:s.adults, background:"#2563eb"}} title={`${s.adults} adults-only`}/>
          </div>
        </div>)}
        <div className="flex gap-3 text-[11px] text-stone-500 mt-2">
          <span><span className="inline-block w-2 h-2 mr-1 align-middle" style={{background:"#16a34a"}}/>whole-household</span>
          <span><span className="inline-block w-2 h-2 mr-1 align-middle" style={{background:"#d97706"}}/>check</span>
          <span><span className="inline-block w-2 h-2 mr-1 align-middle" style={{background:"#2563eb"}}/>adults-only</span>
        </div>
      </div>
    </Section>
  </div>;
}

// GroupHeader — labels the two halves of the Admin tab ("Admin" and
// "Stats"). A plain typographic divider, not a card, so it reads as a
// section break above the cards that follow it.
function GroupHeader({ title, desc }) {
  return <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1 border-b border-stone-200 pb-1.5">
    <h2 className="text-base font-semibold text-stone-800">{title}</h2>
    {desc && <span className="text-xs text-stone-500">{desc}</span>}
  </div>;
}

// EaterCard — one household member's dietary requirements. `groups` is a
// list of { label, tone, tokens } blocks (e.g. Khalil's per-category
// blocks plus "Check label" / "Confirmed safe"); empty groups are
// skipped so a member with no entries in a group doesn't show a stray
// header. Used only by the "Eaters & dietary requirements" Section.
function EaterCard({ name, diet, desc, groups }) {
  return <div className="card p-3 text-sm">
    <div className="font-semibold text-stone-800 leading-tight">{name}</div>
    <div className="text-xs text-teal-700 font-medium">{diet}</div>
    <div className="text-xs text-stone-500 mb-2 leading-snug">{desc}</div>
    {groups.filter(g => g.tokens && g.tokens.length).map(g => (
      <div key={g.label} className="mb-2 last:mb-0">
        <div className="text-[11px] text-stone-500 uppercase tracking-wider mb-1">{g.label} · {g.tokens.length}</div>
        <div className="flex flex-wrap gap-1">
          {g.tokens.map(t => <Chip key={t} tone={g.tone}>{t}</Chip>)}
        </div>
      </div>
    ))}
  </div>;
}

// GapCard — workflow-integrity row card. Lives here because it's
// used only by AuditView's "Workflow integrity" Section. Verbatim
// from canonical L4793–4809.
function GapCard({label, value, of, severity, note}){
  const tone = severity==="high"?"danger":severity==="medium"?"warn":"ok";
  const sevLabel = severity==="high" ? "⚠ Critical action needed"
    : severity==="medium" ? "⚠ Fix needed"
    : "✓ OK";
  const sevTitle = severity==="high" ? "Critical — fix before relying on this data"
    : severity==="medium" ? "Small fix recommended"
    : "All good — no action needed";
  return <div className="card p-3">
    <div className="flex items-start justify-between gap-2 mb-1">
      <div className="font-medium text-sm leading-snug">{label}</div>
      <Chip tone={tone} title={sevTitle}>{sevLabel}</Chip>
    </div>
    <div className="mono text-xs text-stone-500 mb-1.5">{value}{of!==undefined && of!=="—" ? ` / ${of}`:""}</div>
    <div className="text-xs text-stone-600 leading-snug">{note}</div>
  </div>;
}
