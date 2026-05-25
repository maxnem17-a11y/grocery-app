// ============================================================
// TescoSkusContext — basket-key → SKU index + load state
// ============================================================
// React context wrapping the Supabase tesco_skus fetch.
// Mirrors ReceiptsContext / AllergensContext / RecipesContext
// shapes from 7c / 7e / 7g. Step 7j-1.
//
// Hook return shape:
//   {
//     skuIndex: { byKey: Map, byTescoName: Map, all: [] }
//     loading:  true until the first fetch resolves
//     error:    Error instance if fetch failed, else null
//   }
//
// Default empty index matches canonical L820: consumers don't
// crash before the boot fetch lands. While the index is empty,
// items in SuggestedBasket will surface with skuRow=null and
// needs_sku_lookup=true — non-blocking by design.
// ============================================================

import { createContext, useContext, useEffect, useState } from "react";
import { fetchTescoSkus } from "../lib/supabase.js";
import { buildSkuIndex } from "../lib/tesco-skus.js";

const EMPTY_SKU_INDEX = { byKey: new Map(), byTescoName: new Map(), all: [] };

const TescoSkusContext = createContext({
  skuIndex: EMPTY_SKU_INDEX,
  loading: true,
  error: null,
});

export function TescoSkusProvider({ children }) {
  const [state, setState] = useState({
    skuIndex: EMPTY_SKU_INDEX,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchTescoSkus();
        if (cancelled) return;
        setState({
          skuIndex: buildSkuIndex(rows || []),
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        console.warn("fetchTescoSkus failed — basket items will show needs_sku_lookup:", e);
        setState({ skuIndex: EMPTY_SKU_INDEX, loading: false, error: e });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <TescoSkusContext.Provider value={state}>
      {children}
    </TescoSkusContext.Provider>
  );
}

export function useTescoSkus() {
  return useContext(TescoSkusContext);
}
