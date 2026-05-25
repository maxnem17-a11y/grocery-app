import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SUPABASE,
  deleteCookedLog,
  fetchCookedLog,
  fetchPantry,
  insertCookedLog,
  mapCookedRow,
  mapPantryRow,
  patchPantryRow,
} from "./lib/supabase.js";
import { suggestNextDelivery } from "./lib/delivery.js";
import PantryView from "./components/PantryView.jsx";
import AuditView from "./components/AuditView.jsx";
import PlannerView from "./components/PlannerView.jsx";
import RecipesView from "./components/RecipesView.jsx";
import LarderBrand from "./components/LarderBrand.jsx";
import LarderFooter from "./components/LarderFooter.jsx";
import TabIcon from "./components/TabIcon.jsx";
import { HelpBanner } from "./components/primitives.jsx";
import { ReceiptsProvider, useReceipts } from "./contexts/ReceiptsContext.jsx";
import { AllergensProvider } from "./contexts/AllergensContext.jsx";
import { RecipesProvider, useRecipes } from "./contexts/RecipesContext.jsx";

// ============================================================
// App — top-level Provider wrap + tab shell
// ============================================================
// Migration history (most recent on top):
//
// 7g/7h — RecipesContext refactor + PlannerView port. The
// module-level `let RECIPES` shape from 7e (`src/lib/recipes.js`,
// now deleted) became a context: RecipesProvider owns the recipes
// state, the updateRecipePage callback (verbatim canonical L5793),
// and an internal version counter. AuditView migrated off props
// (`updateRecipePage` + `recipesVersion` no longer threaded down
// from App.jsx — both consumers use the `useRecipes()` hook).
// PlannerView added as the second consumer, mounted on the new
// "Cook" tab. Default tab also flipped from "pantry" → "planner"
// (canonical-faithful, decision D2).
//
// 7f-3 added <TabIcon> glyphs to each navtab button (modern
// monoline SVG + retro pixel-art, live-swapped via the
// larder-brand-style-change CustomEvent that LarderBrand dispatches).
//
// 7f-2 replaced the 7e ?tab=audit URL toggle with a clickable
// tab strip below <LarderBrand>. In-memory state only (B1).
//
// 7f-1 added <LarderBrand> + <LarderFooter> around the active
// view, plus suggestNextDelivery for the brand's delivery subtitle.
//
// 7e expanded the scaffold from Pantry-only to Pantry + Audit,
// wiring <ReceiptsProvider> + <AllergensProvider> around the tree.
// `updateRecipePage` originally lived here (App.jsx) but moved
// into RecipesContext in 7g/7h.
// ============================================================

export default function App() {
  return (
    <ReceiptsProvider>
      <AllergensProvider>
        <RecipesProvider>
          <AppInner />
        </RecipesProvider>
      </AllergensProvider>
    </ReceiptsProvider>
  );
}

function AppInner() {
  // ===== Pantry sync slice (verbatim port from canonical, see 7d) =====
  const [pantry, setPantry] = useState([]);
  // TODO: localStorage first-paint seed deferred (v14.5 deprecated; UX nit only)
  // outOfStock and qtyAdjustments are sourced from the pantry rows on
  // boot fetch (Supabase canonical); handlers below update local state
  // optimistically and sync back via patchPantryRow.
  const [outOfStock, setOutOfStock] = useState(new Set());
  const [qtyAdjustments, setQtyAdjustments] = useState({});
  // Freezer override Set — items the user has manually moved to the
  // freezer. Mirrors outOfStock's shape; decay rate switches to the
  // frozen-category rate for these items (see decayed() in pantry-math).
  const [inFreezer, setInFreezer] = useState(new Set());
  // Per-item sync-error map. A row-level red dot + tooltip surfaces
  // failed PATCHes so the user can retry; keyed by item name.
  const [syncErrors, setSyncErrors] = useState({});

  // ===== Cooked log state (7e + 7i) =====
  // Recipes moved into RecipesContext in 7g/7h — this file no longer
  // owns recipes / recipesLoaded / recipesVersion / updateRecipePage.
  // Cooked stays here: PlannerView's "Cooked log" Section + AuditView's
  // counter strip read it as a prop, and RecipesView writes to it via
  // addCooked (step 7i). When/if a second writer appears, this can
  // refactor into a CookedContext mirroring RecipesContext.
  const [cooked, setCooked] = useState([]);
  // Per-recipe sync-error map for cooked-log writes (step 7i). Mirrors
  // pantry's syncErrors shape: { [recipeId]: errorMessage }.
  const [cookedSyncErrors, setCookedSyncErrors] = useState({});
  // Eater-filter state for RecipesView (step 7i). App-scope so it
  // persists across tab switches — matches canonical L5550.
  const [eaterFilter, setEaterFilter] = useState("all");

  // Help banner — closed by default; opens when the user clicks the
  // "? Help" pill rendered in LarderBrand's style-toggle row.
  // Verbatim port of canonical L5439–5443 (step 7f-helpbanner). Note:
  // the dismiss handler writes a `help-dismissed` localStorage flag
  // that's never read back in canonical — preserved verbatim.
  const [showHelpBanner, setShowHelpBanner] = useState(false);
  const dismissHelpBanner = useCallback(() => {
    setShowHelpBanner(false);
    try { localStorage.setItem("grocery-intelligence-v1:help-dismissed", "1"); } catch {}
  }, []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Tab state. Default to Planner (canonical-faithful, decision D2 in
  // 7g). New views grow the `tabs` array. Order matches canonical
  // L5555–5562 — planner / pantry / audit (with gaps + tesco + recipes
  // pending future ports).
  const [tab, setTab] = useState("planner");
  const tabs = [
    ["planner", "Cook", "What to cook this week, grouped by what's expiring, what's whole-household-safe, and what's high-protein."],
    ["recipes", "Recipes", "Search and filter every recipe in your library. Sort by makeability, protein, or prep time."],
    ["pantry", "Pantry", "Everything currently in the kitchen, with expiry and confidence tracking. Mark items out of stock if you've used them up."],
    ["audit", "Stats", ""],
  ];
  const currentTabMeta = tabs.find(t => t[0] === tab);

  // ===== LarderBrand inputs (7f-1) =====
  // receipts comes from ReceiptsContext (Provider mounted in the outer
  // App wrapper). nextDelivery is derived from receipt cadence — the
  // brand block uses it for the "Delivery in N days" subtitle and to
  // brass the modern jar's lid on delivery day. Memoised on receipts so
  // we don't recompute every render.
  const { receipts } = useReceipts();
  const nextDelivery = useMemo(() => suggestNextDelivery(receipts), [receipts]);

  // ===== Recipes loading gate (E2 in 7g) =====
  // RecipesProvider owns the boot fetch; we just need the loading flag
  // here to drive the "No data returned" gate that mirrors canonical
  // L5994 ("if (!recipesLoaded || pantry.length === 0)").
  const { loading: recipesLoading } = useRecipes();

  // ---- Fetch pantry + cooked on mount ----
  // Recipes + receipts + allergens are each owned by their own Provider
  // (mounted in the outer App wrapper); all three boot fetches run in
  // parallel with this one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pantryRows, cookedRows] = await Promise.all([
          fetchPantry(),
          fetchCookedLog().catch((e) => {
            // cooked_log may have no rows / no read perms — non-fatal.
            console.warn("fetchCookedLog failed:", e);
            return [];
          }),
        ]);
        if (cancelled) return;
        const mappedPantry = pantryRows.map(mapPantryRow);
        setPantry(mappedPantry);
        // Seed outOfStock + qtyAdjustments from the row data. Supabase is
        // canonical (commit 14.5) — the boot fetch is the source of truth.
        const oos = new Set(mappedPantry.filter(p => p._out_of_stock).map(p => p.item));
        setOutOfStock(oos);
        const adj = {};
        for (const p of mappedPantry) if (p._qty_adjustment) adj[p.item] = p._qty_adjustment;
        setQtyAdjustments(adj);
        // Same pattern for in_freezer: Set of item names where the row's
        // in_freezer column is true.
        const frz = new Set(mappedPantry.filter(p => p._in_freezer).map(p => p.item));
        setInFreezer(frz);

        // Cooked log — mapped through mapCookedRow to translate the DB
        // column names (recipe_id/cooked_date) to the UI shape
        // (meal_id/date) the canonical file was written against.
        setCooked((cookedRows || []).map(mapCookedRow));

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load from Supabase:", err);
          setLoadError(err.message || String(err));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Ref mirror of `pantry` so callbacks can look up rows by item name
  // without re-binding identity on every render (and without taking
  // `pantry` as a dep on every useCallback that needs to read it).
  const pantryRef = useRef(pantry);
  useEffect(() => { pantryRef.current = pantry; }, [pantry]);

  const findRowByItem = useCallback((itemName) => {
    return (pantryRef.current || []).find(p => p.item === itemName);
  }, []);

  // Helper: set / clear a sync error for a given item.
  const setItemSyncError = useCallback((itemName, message) => {
    setSyncErrors(prev => {
      const next = {...prev};
      if (message) next[itemName] = message; else delete next[itemName];
      return next;
    });
  }, []);

  // Optimistic update + PATCH + rollback on failure.
  // Reverses the local state change if Supabase rejects the write.
  const toggleOutOfStock = useCallback((itemName) => {
    const row = findRowByItem(itemName);
    if (!row) {
      // No matching pantry row — fall back to local-only (legacy behaviour).
      // Shouldn't happen in normal use, but keeps UI responsive if data is odd.
      setOutOfStock(prev => {
        const next = new Set(prev);
        if (next.has(itemName)) next.delete(itemName); else next.add(itemName);
        return next;
      });
      return;
    }
    const wasOut = outOfStock.has(itemName);
    const newOut = !wasOut;
    // 1. Optimistic local update
    setOutOfStock(prev => {
      const next = new Set(prev);
      if (newOut) next.add(itemName); else next.delete(itemName);
      return next;
    });
    setItemSyncError(itemName, null);
    // 2. Fire PATCH in background
    patchPantryRow(row.id, { out_of_stock: newOut })
      .then(() => {
        // 3a. Success: also reflect change on the local pantry row so a
        // later refresh / re-render uses the canonical value.
        setPantry(prev => prev.map(p => p.id === row.id ? {...p, _out_of_stock: newOut} : p));
      })
      .catch(err => {
        // 3b. Failure: roll back the local state change.
        console.error(`Failed to sync out_of_stock for "${itemName}":`, err);
        setOutOfStock(prev => {
          const next = new Set(prev);
          if (wasOut) next.add(itemName); else next.delete(itemName);
          return next;
        });
        setItemSyncError(itemName, "Couldn't save — tap again to retry");
      });
  }, [outOfStock, findRowByItem, setItemSyncError]);

  // Toggle the in_freezer flag for a pantry item. Same optimistic-write
  // pattern as toggleOutOfStock, with two extras:
  //   1. When freezing, stamp today's date into frozen_at. When unfreezing,
  //      clear it. This lets decayed() split decay into pre-freeze (normal
  //      rate) and post-freeze (frozen rate) segments — so freezing a
  //      3-day-old salmon doesn't retroactively boost freshness; it just
  //      stops the bleed from that point forward.
  //   2. Schema fallback for the in_freezer / frozen_at columns: if
  //      Supabase returns 42703 or any "column" error, log it and keep the
  //      local state. The PostgREST error code for "undefined column" is
  //      42703. The frozen_at column ALTER ran in v29 — the fallback is
  //      defence-in-depth in case a future schema change removes it.
  const toggleInFreezer = useCallback((itemName) => {
    const row = findRowByItem(itemName);
    const wasFrozen = inFreezer.has(itemName);
    const newFrozen = !wasFrozen;
    // Today as YYYY-MM-DD (matches the existing `purchased` / `expires` shape).
    const todayIso = new Date().toISOString().slice(0, 10);
    const newFrozenAt = newFrozen ? todayIso : null;
    const wasFrozenAt = row ? (row._frozen_at || null) : null;
    // 1. Optimistic local update on the Set
    setInFreezer(prev => {
      const next = new Set(prev);
      if (newFrozen) next.add(itemName); else next.delete(itemName);
      return next;
    });
    // Also reflect immediately on the pantry row so decayed() picks up the
    // new rate AND the new freeze date this render — otherwise the Freshness
    // bar wouldn't change until the Supabase PATCH round-trips back.
    if (row) {
      setPantry(prev => prev.map(p => p.id === row.id
        ? {...p, _in_freezer: newFrozen, _frozen_at: newFrozenAt}
        : p));
    }
    setItemSyncError(itemName, null);
    if (!row) return; // no row id → local-only, nothing to sync
    // 2. Fire PATCH in background — write both fields in one call
    patchPantryRow(row.id, { in_freezer: newFrozen, frozen_at: newFrozenAt })
      .catch(err => {
        const msg = String(err && err.message || err);
        // Schema not migrated yet — keep local state, just log it.
        if (msg.includes("in_freezer") || msg.includes("frozen_at") || msg.includes("42703") || msg.toLowerCase().includes("column")) {
          console.warn(`Freezer column missing in Supabase pantry_items — keeping local state for "${itemName}". Migrations needed: ALTER TABLE pantry_items ADD COLUMN in_freezer boolean NOT NULL DEFAULT false; ALTER TABLE pantry_items ADD COLUMN frozen_at date;`);
          return;
        }
        // Any other error: roll back both local changes.
        console.error(`Failed to sync freezer state for "${itemName}":`, err);
        setInFreezer(prev => {
          const next = new Set(prev);
          if (wasFrozen) next.add(itemName); else next.delete(itemName);
          return next;
        });
        if (row) {
          setPantry(prev => prev.map(p => p.id === row.id
            ? {...p, _in_freezer: wasFrozen, _frozen_at: wasFrozenAt}
            : p));
        }
        setItemSyncError(itemName, "Couldn't save — tap again to retry");
      });
  }, [inFreezer, findRowByItem, setItemSyncError]);

  // Debounced qty PATCH. Multiple rapid +/- taps coalesce into one network
  // call carrying the final value. Per-item timers so different items don't
  // share a debounce window.
  const qtyDebounceTimers = useRef({}); // {itemName: timeoutId}
  // Track the latest pending qty_adjustment value per item, so the debounced
  // PATCH (firing after the React state update completes) sends the most
  // recent value. Reading from React state directly inside setTimeout would
  // require another useRef on qtyAdjustments — this is simpler.
  const pendingQtyValues = useRef({}); // {itemName: latestValue}
  const adjustQty = useCallback((itemName, delta) => {
    const row = findRowByItem(itemName);
    // Compute the new value synchronously (without going through setState),
    // then update React state and schedule the debounced PATCH separately.
    const prevVal = (pendingQtyValues.current[itemName] !== undefined)
      ? pendingQtyValues.current[itemName]
      : (qtyAdjustments[itemName] || 0);
    const newVal = prevVal + delta;
    pendingQtyValues.current[itemName] = newVal;
    // Update React state
    setQtyAdjustments(prev => {
      const next = {...prev};
      if (newVal === 0) delete next[itemName]; else next[itemName] = newVal;
      return next;
    });
    // No row → local-only (legacy)
    if (!row) return;
    // Schedule the debounced PATCH
    clearTimeout(qtyDebounceTimers.current[itemName]);
    const prevSaved = row._qty_adjustment || 0; // last known server value
    qtyDebounceTimers.current[itemName] = setTimeout(() => {
      setItemSyncError(itemName, null);
      patchPantryRow(row.id, { qty_adjustment: newVal })
        .then(() => {
          // Reflect new server value on the canonical row.
          setPantry(prev => prev.map(p => p.id === row.id ? {...p, _qty_adjustment: newVal} : p));
          delete pendingQtyValues.current[itemName];
        })
        .catch(err => {
          console.error(`Failed to sync qty_adjustment for "${itemName}":`, err);
          // Roll back to the last known server value.
          setQtyAdjustments(prevAdj => {
            const r = {...prevAdj};
            if (prevSaved === 0) delete r[itemName]; else r[itemName] = prevSaved;
            return r;
          });
          pendingQtyValues.current[itemName] = prevSaved;
          setItemSyncError(itemName, "Couldn't save — tap again to retry");
        });
    }, 150);
  }, [qtyAdjustments, findRowByItem, setItemSyncError]);

  // ===== Cooked-log mutation slice (step 7i) =====
  // Verbatim port of canonical L5567 (setCookedSyncError) + L5584
  // (addCooked). Mirrors the pantry sync slice's optimistic-write +
  // rollback + per-row sync-error pattern, but for cooked_log
  // insert/delete instead of pantry_items PATCH.
  const setCookedSyncError = useCallback((mealId, message) => {
    setCookedSyncErrors(prev => {
      const next = {...prev};
      if (message) next[mealId] = message; else delete next[mealId];
      return next;
    });
  }, []);

  // Optimistic toggle of "cooked" status. Mirrors patchPantryRow's pattern:
  // update local state immediately, fire insert/delete in the background,
  // roll back on failure and surface an error via cookedSyncErrors.
  //
  // Adds: POST to cooked_log; on success, attach the server-assigned id to
  //   the local entry (used for later deletes).
  // Removes: DELETE by id; if the local entry has no id (legacy localStorage
  //   state from before this sync existed), fall back to local-only removal
  //   with a console warning.
  const addCooked = useCallback((r) => {
    const today = new Date().toISOString().slice(0,10);
    const existingIdx = cooked.findIndex(c => c.meal_id === r.id);
    const isRemove = existingIdx >= 0;
    setCookedSyncError(r.id, null);

    if (isRemove) {
      // ----- REMOVE path -----
      const removed = cooked[existingIdx];
      // 1. Optimistic local removal
      setCooked(prev => {
        const copy = prev.slice();
        const i = copy.findIndex(c => c.meal_id === r.id);
        if (i >= 0) copy.splice(i, 1);
        return copy;
      });
      // 2. If we don't have a server id, this was a legacy local-only entry
      // — nothing to delete server-side.
      if (!removed.id) {
        console.warn(`addCooked: removing "${r.name}" but local entry has no server id — skipping DELETE`);
        return;
      }
      // 3. Fire DELETE in background
      deleteCookedLog(removed.id)
        .catch(err => {
          console.error(`Failed to delete cooked_log for "${r.name}":`, err);
          // Roll back: re-insert at the same position.
          setCooked(prev => {
            const copy = prev.slice();
            copy.splice(existingIdx, 0, removed);
            return copy;
          });
          setCookedSyncError(r.id, "Couldn't save — tap again to retry");
        });
    } else {
      // ----- ADD path -----
      const localEntry = {
        date: today,
        meal_id: r.id,
        source: r._source_file,
        name: r.name,
        audience: r._audience,
        protein_per_serving_g: r.protein_per_serving_g,
      };
      // 1. Optimistic local insert (no id yet — added when POST succeeds)
      setCooked(prev => [...prev, localEntry]);
      // 2. Map local shape → DB columns and POST
      const payload = {
        recipe_id: r.id,
        cooked_date: today,
        recipe_name: r.name,
        source_file: r._source_file,
        audience: r._audience,
        protein_per_serving_g: r.protein_per_serving_g,
      };
      insertCookedLog(payload)
        .then(rows => {
          // Attach server-assigned id to the local entry so a later un-mark
          // can DELETE it by id rather than guessing.
          const serverId = rows && rows[0] && rows[0].id;
          if (serverId) {
            setCooked(prev => prev.map(c =>
              (c.meal_id === r.id && c.date === today && !c.id)
                ? {...c, id: serverId}
                : c
            ));
          }
        })
        .catch(err => {
          console.error(`Failed to insert cooked_log for "${r.name}":`, err);
          // Roll back the local insert.
          setCooked(prev => prev.filter(c =>
            !(c.meal_id === r.id && c.date === today && !c.id)
          ));
          setCookedSyncError(r.id, "Couldn't save — tap again to retry");
        });
    }
  }, [cooked, setCookedSyncError]);

  // Flush any pending debounced qty PATCHes synchronously on page hide. The
  // 150ms debounce in adjustQty coalesces rapid +/- taps into one network
  // call, but if the user refreshes / backgrounds the app inside that 150ms
  // window the setTimeout is killed before it fires — Supabase never sees
  // the write, and the next boot fetch wipes the local optimistic update.
  // Particularly affects iOS Safari, which aggressively pauses timers on
  // app-switch and pull-to-refresh.
  //
  // Fix: on `pagehide` (the canonical "page is going away" event, fires on
  // refresh + tab close + iOS background) and `visibilitychange→hidden`,
  // synchronously flush every pending value using fetch({keepalive: true}).
  // `keepalive` tells the browser to complete the request even after the
  // page unloads — purpose-built for this.
  //
  // Note: this is fire-and-forget. We can't observe success/failure since
  // the page is going away. The next boot fetch is our verification —
  // if the PATCH landed, the row will reflect it; if it didn't, the
  // localStorage seed has the latest value and the user can re-tap.
  useEffect(() => {
    const flush = () => {
      const pending = pendingQtyValues.current;
      const items = Object.keys(pending);
      if (!items.length) return;
      for (const itemName of items) {
        const newVal = pending[itemName];
        const row = (pantryRef.current || []).find(p => p.item === itemName);
        if (!row || !row.id) continue;
        // Cancel any in-flight debounced setTimeout for this item so it
        // doesn't fire a duplicate PATCH if the page actually survives
        // (e.g. visibilitychange→hidden→visible without a real unload).
        clearTimeout(qtyDebounceTimers.current[itemName]);
        try {
          fetch(`${SUPABASE.url}/rest/v1/pantry_items?id=eq.${row.id}`, {
            method: "PATCH",
            headers: {
              apikey: SUPABASE.anonKey,
              Authorization: `Bearer ${SUPABASE.anonKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ qty_adjustment: newVal }),
            keepalive: true,
          });
        } catch (e) {
          // Nothing useful to do here — the page is unloading. The local
          // optimistic state is in localStorage; user re-taps on next visit
          // if needed.
          console.warn(`Flush PATCH for "${itemName}" failed:`, e);
        }
      }
      // Don't clear pendingQtyValues — if the page survives (visibilitychange
      // path), the in-memory debounce machinery will overwrite anyway, and
      // if it doesn't survive, the ref dies with the page.
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ---- Loading + error gates ----
  // Gate mirrors canonical L5976–6002: spinner while loading, error card
  // on fetch failure, "no data" card if Supabase responded but the
  // pantry/recipes tables came back empty.
  if (loading || recipesLoading) {
    return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
      <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-stone-300 border-t-stone-800 mb-4"></div>
      <p className="text-stone-500 text-sm">Loading…</p>
    </div>;
  }
  if (loadError) {
    return <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20">
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-2">Couldn't reach Supabase</h2>
        <p className="text-sm text-stone-600 mb-3">The boot fetch failed with:</p>
        <pre className="mono text-xs bg-stone-100 p-3 rounded mb-3 overflow-x-auto">{loadError}</pre>
        <button onClick={()=>location.reload()} className="pill mt-4">Reload</button>
      </div>
    </div>;
  }
  if (pantry.length === 0) {
    return <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20">
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-2">No data returned</h2>
        <p className="text-sm text-stone-600">Supabase responded but the pantry table was empty.</p>
        <button onClick={()=>location.reload()} className="pill mt-4">Reload</button>
      </div>
    </div>;
  }

  return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
    <LarderBrand
      pantry={pantry}
      nextDelivery={nextDelivery}
      showHelpBanner={showHelpBanner}
      setShowHelpBanner={setShowHelpBanner}
    />
    {showHelpBanner && <HelpBanner onDismiss={dismissHelpBanner}/>}
    <div className="flex flex-wrap gap-0 mb-1 border-b border-stone-200">
      {tabs.map(([k, l]) => (
        <button key={k} data-active={tab === k} onClick={() => setTab(k)} className="navtab">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <TabIcon kind={k}/>
            {l}
          </span>
        </button>
      ))}
    </div>
    {currentTabMeta && currentTabMeta[2] && <div className="tab-subtitle">{currentTabMeta[2]}</div>}
    {tab === "planner" && <PlannerView
      pantry={pantry}
      outOfStock={outOfStock}
      cooked={cooked}
    />}
    {tab === "recipes" && <RecipesView
      pantry={pantry}
      outOfStock={outOfStock}
      cooked={cooked}
      addCooked={addCooked}
      eaterFilter={eaterFilter}
      setEaterFilter={setEaterFilter}
      cookedSyncErrors={cookedSyncErrors}
    />}
    {tab === "pantry" && <PantryView
      pantry={pantry}
      outOfStock={outOfStock}
      toggleOutOfStock={toggleOutOfStock}
      inFreezer={inFreezer}
      toggleInFreezer={toggleInFreezer}
      qtyAdjustments={qtyAdjustments}
      adjustQty={adjustQty}
      syncErrors={syncErrors}
    />}
    {tab === "audit" && <AuditView
      pantry={pantry}
      cooked={cooked}
      outOfStock={outOfStock}
    />}
    <LarderFooter />
  </div>;
}
