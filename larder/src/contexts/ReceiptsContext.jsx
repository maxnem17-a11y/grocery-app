// ============================================================
// ReceiptsContext — receipts data + load state + refresh/append
// ============================================================
// React context wrapping the Supabase receipts fetch. Provides:
//   - receipts:    mapped receipt rows, oldest-first by delivery_date
//   - loading:     true until the first fetch resolves
//   - error:       Error instance if the fetch failed, else null
//   - refresh:     async () => void; re-fetches and replaces the
//                  in-memory list. Used by ReceiptParser → Save to
//                  archive (after the Edge Function inserts the row
//                  server-side, refresh reconciles).
//   - localAppend: (order, newId) => void; optimistic insert so a
//                  newly-saved receipt appears in OrdersView /
//                  PlannerView / GapsView immediately, before the
//                  background refresh round-trips.
//
// Step 7c extracted receipts as a Provider. Step 7k added refresh
// + localAppend onto the same hook return (decision A1) rather
// than carrying canonical's sister `ReceiptsRefreshContext` —
// canonical kept them separate for a migration-cost reason that
// doesn't apply to us, and absorbing them mirrors the 7g/7h
// RecipesContext pattern (updateRecipePage on the same hook).
//
// refresh/localAppend correspond verbatim to canonical L5364
// (refreshReceipts) and L5376 (localAppendReceipt).
// ============================================================

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchReceipts, mapReceiptRow } from "../lib/supabase.js";

const ReceiptsContext = createContext({
  receipts: [],
  loading: true,
  error: null,
  refresh: async () => {},
  localAppend: () => {},
});

export function ReceiptsProvider({ children }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchReceipts();
        if (cancelled) return;
        setReceipts((rows || []).map(mapReceiptRow));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch receipts from Supabase. Used by ReceiptParser → Save to archive
  // to surface a newly-inserted order immediately. Errors are logged but not
  // surfaced — the optimistic local-append (below) already showed the row.
  // Verbatim port of canonical L5364-5371.
  const refresh = useCallback(async () => {
    try {
      const rows = await fetchReceipts();
      setReceipts((rows || []).map(mapReceiptRow));
    } catch (e) {
      console.warn("refreshReceipts failed:", e);
    }
  }, []);

  // Optimistic append. The Edge Function already inserted the row server-side;
  // this just makes it visible in OrdersView, PlannerView, GapsView without
  // waiting for the network round-trip of a refetch. Shape must match
  // mapReceiptRow's output (snake_case → consumed by OrdersView etc.).
  // Verbatim port of canonical L5376-5385.
  const localAppend = useCallback((order, newId) => {
    if (!order) return;
    setReceipts(prev => [...prev, {
      ...order,
      id: newId,
      // mapReceiptRow normally injects these — keep parity
      retailer: order.retailer || "tesco",
      items: order.items || [],
    }].sort((a, b) => (a.delivery_date || "").localeCompare(b.delivery_date || "")));
  }, []);

  return (
    <ReceiptsContext.Provider value={{ receipts, loading, error, refresh, localAppend }}>
      {children}
    </ReceiptsContext.Provider>
  );
}

export function useReceipts() {
  return useContext(ReceiptsContext);
}
