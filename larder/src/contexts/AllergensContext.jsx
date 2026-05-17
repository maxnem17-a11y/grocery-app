// ============================================================
// AllergensContext — household allergens config + load state
// ============================================================
// React context wrapping the Supabase household_allergens fetch.
// Provides:
//   - allergens: the nested config built by buildAllergensConfig
//                (see src/lib/allergens.js). Initialised to and
//                falls back to EMPTY_ALLERGENS — a safe default
//                meaning "nothing is blocked".
//   - loading:   true until the first fetch resolves (success or fail)
//   - error:     Error instance if the fetch failed, else null
//
// Fallback semantics match canonical index.html L5503–5508:
//   - Fetch success + non-empty rows → setAllergens(buildAllergensConfig(rows))
//   - Fetch success + 0 rows         → console.warn + keep EMPTY_ALLERGENS
//   - Fetch error                    → console.warn + keep EMPTY_ALLERGENS,
//                                       error surfaced through the hook
//
// The "warn but carry on" choice is deliberate: a missed allergen
// warning is bad, but a spurious one or a hard crash during boot
// is worse. The household knows real recipes include flagged
// items, so an "everything is safe" UI would be visibly wrong.
// ============================================================

import { createContext, useContext, useEffect, useState } from "react";
import { fetchHouseholdAllergens } from "../lib/supabase.js";
import { buildAllergensConfig, EMPTY_ALLERGENS } from "../lib/allergens.js";

const AllergensContext = createContext({
  allergens: EMPTY_ALLERGENS,
  loading: true,
  error: null,
});

export function AllergensProvider({ children }) {
  const [state, setState] = useState({
    allergens: EMPTY_ALLERGENS,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchHouseholdAllergens();
        if (cancelled) return;
        if (rows && rows.length) {
          setState({
            allergens: buildAllergensConfig(rows),
            loading: false,
            error: null,
          });
        } else {
          console.warn("Allergens fetch returned no rows — flagging will be disabled.");
          setState({ allergens: EMPTY_ALLERGENS, loading: false, error: null });
        }
      } catch (e) {
        if (cancelled) return;
        console.warn("fetchHouseholdAllergens failed:", e);
        setState({ allergens: EMPTY_ALLERGENS, loading: false, error: e });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AllergensContext.Provider value={state}>
      {children}
    </AllergensContext.Provider>
  );
}

export function useAllergens() {
  return useContext(AllergensContext);
}
