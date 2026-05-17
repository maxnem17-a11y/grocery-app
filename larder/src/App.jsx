import { useCallback, useEffect, useRef, useState } from "react";
import {
  SUPABASE,
  fetchPantry,
  mapPantryRow,
  patchPantryRow,
} from "./lib/supabase.js";
import PantryView from "./components/PantryView.jsx";
// Smoke import: keeps ReceiptsContext.jsx in the Vite build graph so the
// 7c extraction is verified end-to-end before any view consumes it. Remove
// the `void` lines when the first ReceiptsContext consumer is ported in
// step 7e.
import { useReceipts, ReceiptsProvider } from "./contexts/ReceiptsContext.jsx";
void useReceipts; void ReceiptsProvider;

// ============================================================
// App — Pantry tab shell (step 7d)
// ============================================================
// Mounts <PantryView/> against a real Supabase pantry fetch.
// The pantry sync slice below is a verbatim port from canonical
// index.html (the big App component) — same state model, same
// optimistic-write + rollback + sync-error semantics, same
// 150 ms debounced qty PATCH with a pagehide flush. Behaviour
// matches the canonical file exactly; the rewrite swaps inline
// React.* destructuring for named hook imports and pulls the
// row mapper / fetch / patch helpers from src/lib/supabase.js.
//
// Per migration principle #4 (no behaviour change on a pure
// file-move): no refactoring of the canonical sync model. The
// two refs (qtyDebounceTimers, pendingQtyValues), the
// pantryRef-via-useEffect mirror, and the pagehide flush are
// all preserved as-is even where the React Way would suggest
// simpler equivalents — those simpler equivalents drop edge
// cases the canonical handles (rapid +/- coalesce, latest-value
// PATCH after a burst, iOS-background write survival).
//
// Source mappings (canonical line ranges):
//   - State decls            L5420–5421, L5427, L5430
//   - Boot fetch + seeding   L5446–5544 (pantry slice only)
//   - pantryRef + sync       L5665–5672
//   - setItemSyncError       L5675–5681
//   - toggleOutOfStock       L5685–5723
//   - toggleInFreezer        L5737–5784
//   - adjustQty refs + cb    L5832–5878
//   - pagehide flush         L5898–5943
//
// Deliberately omitted from this step (defer to 7e+):
//   - localStorage first-paint seed for outOfStock/qtyAdjustments/
//     inFreezer (canonical loadState/saveState + persistence
//     effect). First paint is briefly empty until the fetch lands;
//     the toggle/freezer/qty sync behaviour is unaffected.
//   - Other boot-fetch branches (recipes/cooked/receipts/allergens/
//     SKUs) — extracted with their consuming views.
// ============================================================
export default function App() {
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ---- Fetch pantry on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pantryRows = await fetchPantry();
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
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load pantry from Supabase:", err);
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
  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
      <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-stone-300 border-t-stone-800 mb-4"></div>
      <p className="text-stone-500 text-sm">Loading pantry…</p>
    </div>;
  }
  if (loadError) {
    return <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20">
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-2">Couldn't reach Supabase</h2>
        <p className="text-sm text-stone-600 mb-3">The pantry fetch failed with:</p>
        <pre className="mono text-xs bg-stone-100 p-3 rounded mb-3 overflow-x-auto">{loadError}</pre>
        <button onClick={()=>location.reload()} className="pill mt-4">Reload</button>
      </div>
    </div>;
  }

  return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
    <h1 className="text-xl font-semibold mb-4">Larder — Pantry</h1>
    <PantryView
      pantry={pantry}
      outOfStock={outOfStock}
      toggleOutOfStock={toggleOutOfStock}
      inFreezer={inFreezer}
      toggleInFreezer={toggleInFreezer}
      qtyAdjustments={qtyAdjustments}
      adjustQty={adjustQty}
      syncErrors={syncErrors}
    />
  </div>;
}
