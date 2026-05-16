// ============================================================
// ReceiptsContext — receipts data + load state
// ============================================================
// React context wrapping the Supabase receipts fetch. Provides:
//   - receipts: mapped receipt rows, oldest-first by delivery_date
//   - loading: true until the first fetch resolves (success or fail)
//   - error: Error instance if the fetch failed, else null
//
// Mirrors the inline pattern in the canonical index.html (the big
// App component, ~L5360–L5495 + Provider at L6004) but extracted
// into a dedicated component for the Vite scaffold. The canonical
// file also exposes a sister `ReceiptsRefreshContext` for
// ReceiptParser's optimistic-append + refresh flow — deliberately
// omitted here until ReceiptParser itself is ported.
// ============================================================

import { createContext, useContext, useEffect, useState } from "react";
import { fetchReceipts, mapReceiptRow } from "../lib/supabase.js";

const ReceiptsContext = createContext({
  receipts: [],
  loading: true,
  error: null,
});

export function ReceiptsProvider({ children }) {
  const [state, setState] = useState({ receipts: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchReceipts();
        if (cancelled) return;
        setState({
          receipts: (rows || []).map(mapReceiptRow),
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({ receipts: [], loading: false, error: e });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <ReceiptsContext.Provider value={state}>
      {children}
    </ReceiptsContext.Provider>
  );
}

export function useReceipts() {
  return useContext(ReceiptsContext);
}
