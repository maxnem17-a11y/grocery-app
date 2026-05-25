// ============================================================
// RecipesView — the Recipes tab
// ============================================================
// Verbatim port of canonical index.html L1620–1825.
//
// Structural changes vs. canonical (no behaviour change):
//   - hooks via named import from "react"
//   - context reads use the extracted hooks
//       useAllergens() / useRecipes()
//     instead of canonical's bare useContext(...) calls
//   - RECIPES module global → `recipes` from useRecipes()
//   - updateRecipePage + recipesVersion read from useRecipes()
//     instead of props (matches the 7g/7h refactor pattern
//     already in AuditView)
//   - primitives + helpers + EaterTile imported (EaterTile was
//     co-located in RecipeMicroList from 7g; promoted to primitives
//     in 7i since RecipesView is the second consumer)
//
// Props (post-7i):
//   pantry            — array of mapped pantry rows
//   outOfStock        — Set of item names currently flagged out
//   cooked            — array of cooked-log entries; drives the
//                       ✓-cooked badge + the "Cooked this session"
//                       Stat counter
//   addCooked         — App-scope callback that toggles a cooked-log
//                       entry. Verbatim canonical L5584 semantics:
//                       optimistic local insert/remove → background
//                       POST/DELETE → rollback on failure with
//                       sync-error surfacing.
//   eaterFilter       — string ("all" | "khalil" | "whole" | "max" |
//                       "emily"). App-scope state so it persists
//                       across tab switches (canonical pattern).
//   setEaterFilter    — setter for above
//   cookedSyncErrors  — { [recipeId]: errorMessage } map for the
//                       red-dot retry affordance next to the
//                       Mark cooked button
// ============================================================

import { useMemo, useState } from "react";
import { AudienceTag, Bar, Chip, EaterTile, InfoTip, Stat } from "./primitives.jsx";
import { audienceFromFlags, flagsForRecipe } from "../lib/allergens.js";
import { makeability, pantryMatchSet } from "../lib/recipe-match.js";
import { lc } from "../lib/text.js";
import { useAllergens } from "../contexts/AllergensContext.jsx";
import { useRecipes } from "../contexts/RecipesContext.jsx";

export default function RecipesView({pantry, outOfStock, cooked, addCooked, eaterFilter, setEaterFilter, cookedSyncErrors}){
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [sortBy, setSortBy] = useState("makeable");
  const [minMakeable, setMinMakeable] = useState(0);
  const [expanded, setExpanded] = useState(null);
  // Which row's page chip is currently in edit mode. Null when nothing is being
  // edited. We allow only one row at a time — clicking another pencil moves the
  // edit focus rather than opening parallel inputs.
  const [editingPage, setEditingPage] = useState(null);
  // Per-row sync error indicator for failed PATCHes — mirrors the pattern used
  // in PantryView's syncErrors prop.
  const [pageSyncErrors, setPageSyncErrors] = useState({}); // {recipeId: message}

  const { allergens } = useAllergens();
  const { recipes, updateRecipePage, version: recipesVersion } = useRecipes();
  const matchSet = useMemo(()=> pantryMatchSet(pantry, outOfStock), [pantry, outOfStock]);
  const decorated = useMemo(()=> recipes.map(r=>{
    const m = makeability(r, matchSet);
    const f = flagsForRecipe(r, allergens);
    const aud = r.audience || audienceFromFlags(f);
    return {...r, _make:m, _flags:f, _audience:aud};
  }), [recipes, matchSet, allergens, recipesVersion]);

  const sources = [...new Set(recipes.map(r=>r._source_file))].sort();
  const cookedSet = useMemo(()=> new Set(cooked.map(c=>c.meal_id)), [cooked]);

  const filtered = decorated.filter(r=>{
    if (q) {
      const needle = lc(q);
      const inName = lc(r.name).includes(needle);
      const inIngredients = (r.ingredients||[]).some(ing =>
        lc(ing.item).includes(needle) || lc(ing.pantry_match).includes(needle)
      );
      if (!inName && !inIngredients) return false;
    }
    if (source!=="all" && r._source_file !== source) return false;
    if (r._make.pct < minMakeable) return false;
    if (eaterFilter === "khalil" && r._flags.khalil === "blocked") return false;
    if (eaterFilter === "max" && r._flags.max === "blocked") return false;
    if (eaterFilter === "emily" && r._flags.emily === "blocked") return false;
    if (eaterFilter === "whole" && r._audience !== "whole-household") return false;
    return true;
  });
  filtered.sort((a,b)=>{
    if (sortBy==="makeable") return b._make.pct - a._make.pct;
    if (sortBy==="protein") return (b.protein_per_serving_g||0) - (a.protein_per_serving_g||0);
    if (sortBy==="time") return (a.prep_time_mins||0)+(a.cook_time_mins||0) - ((b.prep_time_mins||0)+(b.cook_time_mins||0));
    if (sortBy==="name") return a.name.localeCompare(b.name);
    return 0;
  });

  return <>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <Stat label="In library" value={recipes.length}
        tip="Total recipes across all sources (cookbooks, saved web recipes, Instagram saves)."/>
      <Stat label="Whole-household safe" value={decorated.filter(r=>r._audience==="whole-household").length} tone="ok"
        tip="Recipes everyone can eat — Max (pescatarian), Emily (no pork), and Khalil (allergens). These are the easiest to plan around."/>
      <Stat label="Khalil can eat" value={decorated.filter(r=>r._flags.khalil!=="blocked").length} tone="ok"
        tip="Recipes that don't contain any of Khalil's strict allergens. Some still need a label check (oats, soy sauce) — flagged ⚠️."/>
      <Stat label="Cooked this session" value={cooked.length} tone="info"
        tipAlign="right"
        tip="Recipes you've marked as cooked in this browser. The list is in the Planner tab — paste it into a Claude session to update your canonical pantry."/>
    </div>
    <div className="flex flex-wrap gap-2 mb-3 items-center">
      <input className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]" placeholder="Search by name or ingredient (e.g. tofu, ginger)…" value={q} onChange={e=>setQ(e.target.value)} />
      <select className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm" value={source} onChange={e=>setSource(e.target.value)} title="Filter by which file the recipe came from">
        <option value="all">All sources</option>
        {sources.map(s=> <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm" value={sortBy} onChange={e=>setSortBy(e.target.value)} title="Change how the list is ordered">
        <option value="makeable">Sort: makeability (highest first)</option>
        <option value="protein">Sort: protein per serving</option>
        <option value="time">Sort: total time (quickest first)</option>
        <option value="name">Sort: name (A–Z)</option>
      </select>
      <select className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm" value={eaterFilter} onChange={e=>setEaterFilter(e.target.value)} title="Show only recipes safe for a specific eater">
        <option value="all">All eaters</option>
        <option value="khalil">Khalil-safe only</option>
        <option value="whole">Whole-household only</option>
        <option value="max">Max-safe (pescatarian)</option>
        <option value="emily">Emily-safe (no pork)</option>
      </select>
      <label className="text-xs text-stone-600 flex items-center gap-1" title="Hide recipes where you don't already have at least this percentage of ingredients in your pantry">
        Min makeable {minMakeable}%
        <input type="range" min="0" max="100" step="10" value={minMakeable} onChange={e=>setMinMakeable(+e.target.value)} className="w-24"/>
      </label>
      <InfoTip align="below-right">Search by recipe name or ingredient (e.g. type "tofu" to find every recipe using it), narrow by source/eater, sort the list, and use the slider to hide recipes you don't have enough ingredients for. Click any recipe row to see what's in your pantry vs missing, plus per-eater notes.</InfoTip>
    </div>

    <div className="space-y-2">
      {filtered.map(r=>{
        const total = (r.prep_time_mins||0)+(r.cook_time_mins||0);
        const open = expanded === r.id;
        const wasCooked = cookedSet.has(r.id);
        // Source chip format. For books we show "East · p.115" when a page
        // exists, "East" alone otherwise. Web/instagram recipes just show
        // their source file slug. Book sources get a pencil-icon edit
        // affordance next to the chip (see chipSlot below) — clicking it
        // swaps chip+pencil for an inline input. The input commits on blur
        // or Enter via updateRecipePage (direct save to Supabase since v28).
        const isBook = r.source && r.source.type === "book";
        const currentPage = (r.source && r.source.page) || null;
        const sourceLabel = isBook
          ? `${r.source.title || "Book"}${currentPage ? ` · p.${currentPage}` : ""}`
          : r._source_file;
        const isEditingThis = editingPage === r.id;
        const syncErr = pageSyncErrors[r.id];
        // The chip / edit-input slot. Stays inside the same parent
        // role="button" but onClick handlers stopPropagation so the row
        // doesn't expand/collapse while interacting.
        const chipSlot = isEditingThis
          ? <span className="flex items-center gap-1" onClick={(e)=>e.stopPropagation()}>
              <span className="text-xs text-stone-500 mono">{r.source.title || "Book"} · p.</span>
              <input
                type="number"
                min="1"
                autoFocus
                defaultValue={currentPage ?? ""}
                placeholder="page"
                onBlur={(e)=>{
                  const val = e.target.value;
                  // Empty blur with no prior value: just cancel out of edit mode.
                  if (!val && currentPage == null) { setEditingPage(null); return; }
                  setPageSyncErrors(prev => { const n = {...prev}; delete n[r.id]; return n; });
                  updateRecipePage(r.id, val, {
                    onError: () => setPageSyncErrors(prev => ({ ...prev, [r.id]: "Couldn't save — try again" })),
                  });
                  setEditingPage(null);
                }}
                onKeyDown={(e)=>{
                  if(e.key === 'Enter'){ e.target.blur(); }
                  if(e.key === 'Escape'){ setEditingPage(null); }
                }}
                className="w-16 px-2 py-0.5 text-xs border border-amber-400 rounded mono text-right focus:outline-none focus:border-amber-600"
                title="Enter the page number, then Tab/Enter to save, Esc to cancel"
              />
            </span>
          : <span className="flex items-center gap-1">
              <Chip tone="neutral" title="Source — book + page, or website">{sourceLabel}</Chip>
              {isBook && <button
                onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setEditingPage(r.id); }}
                className="text-stone-400 hover:text-amber-700 text-xs leading-none px-1 py-0.5 rounded hover:bg-amber-50"
                title={currentPage ? "Edit page number" : "Add page number"}
                aria-label={currentPage ? "Edit page number" : "Add page number"}
              >✏️</button>}
              {syncErr && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" title={syncErr}></span>}
            </span>;
        return <div key={r.id} className="card">
          <div role="button" tabIndex={0}
               onClick={(e)=>{ if(e.target.closest('button,a,input')) return; setExpanded(open?null:r.id); }}
               onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setExpanded(open?null:r.id);} }}
               className="px-4 py-3 flex items-center gap-3 flex-wrap cursor-pointer select-none">
            <div className="font-medium flex-1 min-w-[200px] flex items-start justify-between gap-2">
              <span>{r.name}
                {wasCooked && <span className="ml-2 text-xs text-emerald-700">✓ cooked</span>}
              </span>
              <span className="text-xs text-stone-400 shrink-0 sm:hidden">{open?'▲':'▼'}</span>
            </div>
            {chipSlot}
            <AudienceTag a={r._audience}/>
            {(r.protein_per_serving_g!=null) && <Chip tone={r.protein_per_serving_g>=45?"ok":r.protein_per_serving_g>=20?"info":"neutral"} title="Protein per serving — green ≥45g (Max training-day target), blue ≥20g, grey lower">{r.protein_per_serving_g}g protein</Chip>}
            {total>0 && <Chip tone={total<=20?"ok":total<=40?"neutral":"warn"} title="Prep + cook time">{total}m total</Chip>}
            <div className="flex items-center gap-2 min-w-[120px]" title={`You have ${r._make.pct}% of the ingredients for this recipe in your pantry`}>
              <div className="flex-1"><Bar pct={r._make.pct}/></div>
              <span className="mono text-xs">{r._make.pct}%</span>
            </div>
            <span className="text-xs text-stone-400 hidden sm:inline">{open?'▲':'▼'}</span>
            <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); addCooked(r); }} className="pill" data-active={wasCooked} title={wasCooked?"Click to un-mark as cooked":"Log that you cooked this — synced to Supabase. Click again to undo."}>
              {wasCooked ? "✓ Cooked" : "Mark cooked"}
            </button>
            {(cookedSyncErrors||{})[r.id] && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 -ml-1.5 self-center" title={cookedSyncErrors[r.id]}></span>}
          </div>
          {open && <div className="px-4 pb-4 grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-stone-500 uppercase tracking-wider mb-1">In pantry ({r._make.have.length})</div>
              <ul className="space-y-0.5">
                {r._make.have.map((i,k)=> <li key={k} className="text-emerald-700">✓ {i.item}</li>)}
                {!r._make.have.length && <li className="text-stone-400">none</li>}
              </ul>
            </div>
            <div>
              <div className="text-xs text-stone-500 uppercase tracking-wider mb-1">Missing ({r._make.missing.length})</div>
              <ul className="space-y-0.5">
                {r._make.missing.map((i,k)=> <li key={k} className="text-stone-700">○ {i.item}{i.qty?` — ${i.qty}${i.unit||""}`:""}</li>)}
                {!r._make.missing.length && <li className="text-emerald-700">fully stocked</li>}
              </ul>
            </div>
            <div className="sm:col-span-2 grid sm:grid-cols-3 gap-3 pt-2 border-t border-stone-100">
              <EaterTile name="Khalil" status={r._flags.khalil} reasons={r._flags.khalilReason} uncertain={r._flags.khalilUncertain}/>
              <EaterTile name="Max" status={r._flags.max} reasons={r._flags.maxReason}/>
              <EaterTile name="Emily" status={r._flags.emily} reasons={r._flags.emilyReason}/>
            </div>
            {r.notes && <div className="sm:col-span-2 text-xs text-stone-600 bg-stone-50 rounded-lg px-3 py-2">📝 {r.notes}</div>}
            {r.source && <div className="sm:col-span-2 text-xs text-stone-600">
              {r.source.url
                ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{r.source.title || r.source.url} →</a>
                : <>📖 {r.source.title}{r.source.page?`, p.${r.source.page}`:""}{r.source.author?` · ${r.source.author}`:""}</>
              }
            </div>}
          </div>}
        </div>;
      })}
      {!filtered.length && <div className="card px-4 py-6 text-center text-sm text-stone-500">No recipes match.</div>}
    </div>
  </>;
}
