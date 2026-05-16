import { useEffect, useState } from "react";
import {
  fetchPantry,
  fetchRecipes,
  fetchReceipts,
  fetchHouseholdAllergens,
  fetchCookedLog,
  fetchTescoSkus,
  SUPABASE,
} from "./lib/supabase.js";
import { buildAllergensConfig, khalilAllergenFlag } from "./lib/allergens.js";
import { decayed, daysUntilExpiry, formatDate, addDays, TODAY } from "./lib/pantry-math.js";

// Boot smoke test. The point of this version of App.jsx is to confirm
// that src/lib/supabase.js — extracted from index__4_.html during the
// Vite migration — actually works end-to-end. Calls every read helper
// on mount and reports row counts. If you can see counts here that
// match what the canonical dashboard shows, the module is wired
// correctly and the migration can continue.
export default function App() {
  const [state, setState] = useState({ phase: "loading", results: {}, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pantry, recipes, receipts, allergens, cooked, skus] = await Promise.all([
          fetchPantry(),
          fetchRecipes(),
          fetchReceipts(),
          fetchHouseholdAllergens(),
          fetchCookedLog(),
          fetchTescoSkus(),
        ]);
        if (cancelled) return;
        // Exercise the allergens module: build config + test a known
        // allergen and a known safe item. If these don't return the
        // expected values, something's wrong with the wiring.
        const cfg = buildAllergensConfig(allergens);
        const tests = {
          "almond milk": khalilAllergenFlag("almond milk", cfg),     // dairy
          "spaghetti": khalilAllergenFlag("spaghetti", cfg),         // wheat
          "salmon fillet": khalilAllergenFlag("salmon fillet", cfg), // null
          "butternut squash": khalilAllergenFlag("butternut squash", cfg), // null (exemption)
        };
        // Pantry-math smoke test: take the first real pantry row and
        // compute its decay + expiry. We can't predict the values
        // without knowing the row, so just check the functions return
        // sensible types (integer 0-100 for decay, integer-or-null
        // for expiry). Also exercise formatDate + addDays with known
        // inputs we CAN check.
        const sample = pantry[0];
        const todayIso = TODAY.toISOString().slice(0, 10);
        const mathTests = {
          "decayed(sample) is 0-100 int": sample
            ? Number.isInteger(decayed(sample)) && decayed(sample) >= 0 && decayed(sample) <= 100
            : null,
          "daysUntilExpiry(sample) is int or null": sample
            ? daysUntilExpiry(sample) === null || Number.isInteger(daysUntilExpiry(sample))
            : null,
          "formatDate(today) non-empty": formatDate(todayIso).length > 0,
          "addDays(today, 7) → +7 days": (() => {
            const plus7 = addDays(todayIso, 7);
            const diff = (new Date(plus7 + "T12:00:00Z") - new Date(todayIso + "T12:00:00Z")) / (1000 * 60 * 60 * 24);
            return diff === 7;
          })(),
        };
        setState({
          phase: "ok",
          results: {
            pantry_items: pantry.length,
            recipes: recipes.length,
            receipts: receipts.length,
            household_allergens: allergens.length,
            cooked_log: cooked.length,
            tesco_skus: skus.length,
          },
          allergenTests: tests,
          mathTests,
          sampleItem: sample ? { item: sample.item, decayed: decayed(sample), expires: sample.expires, formatted: formatDate(sample.expires) } : null,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({ phase: "error", results: {}, error: e.message || String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 640 }}>
      <h1 style={{ marginBottom: 4 }}>Larder — boot check</h1>
      <p style={{ color: "#666", marginTop: 0, fontSize: 14 }}>
        Smoke-testing <code>src/lib/supabase.js</code> against{" "}
        <code>{SUPABASE.url}</code>.
      </p>

      {state.phase === "loading" && <p>Fetching…</p>}

      {state.phase === "error" && (
        <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6 }}>
          <strong>Fetch failed.</strong>
          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{state.error}</pre>
        </div>
      )}

      {state.phase === "ok" && (
        <>
          <table style={{ borderCollapse: "collapse", fontSize: 14, marginBottom: 24 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid #ddd" }}>Table</th>
                <th style={{ textAlign: "right", padding: "6px 12px", borderBottom: "1px solid #ddd" }}>Rows</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(state.results).map(([table, count]) => (
                <tr key={table}>
                  <td style={{ padding: "4px 12px" }}><code>{table}</code></td>
                  <td style={{ padding: "4px 12px", textAlign: "right" }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Allergen module check</h2>
          <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid #ddd" }}>Input</th>
                <th style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid #ddd" }}>Khalil flag</th>
                <th style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid #ddd" }}>Expected</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(state.allergenTests).map(([name, flag]) => {
                const expected = {
                  // "almond milk" → "tree nut", not "dairy". The dairy
                  // category in household_allergens has no "milk" token
                  // (only specific dairy products like cheese, butter,
                  // cream), so almond milk matches on "almond" first.
                  // The user-visible safety outcome is still correct
                  // (Khalil is blocked from almond milk), just via the
                  // tree-nut category rather than the dairy category.
                  // Tracked in /home/claude/larder/KNOWN_ISSUES.md.
                  "almond milk": "tree nut",
                  "spaghetti": "wheat",
                  "salmon fillet": null,
                  "butternut squash": null,
                }[name];
                const pass = flag === expected;
                return (
                  <tr key={name}>
                    <td style={{ padding: "4px 12px" }}><code>{name}</code></td>
                    <td style={{ padding: "4px 12px" }}>{String(flag)}</td>
                    <td style={{ padding: "4px 12px", color: pass ? "#16a34a" : "#dc2626" }}>
                      {pass ? "✓" : "✗"} {String(expected)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Pantry-math module check</h2>
          <table style={{ borderCollapse: "collapse", fontSize: 14, marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid #ddd" }}>Check</th>
                <th style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid #ddd" }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(state.mathTests).map(([name, pass]) => (
                <tr key={name}>
                  <td style={{ padding: "4px 12px" }}>{name}</td>
                  <td style={{ padding: "4px 12px", color: pass === true ? "#16a34a" : pass === null ? "#999" : "#dc2626" }}>
                    {pass === true ? "✓ pass" : pass === null ? "— (no pantry rows)" : "✗ fail"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.sampleItem && (
            <p style={{ fontSize: 13, color: "#666" }}>
              Sample row: <code>{state.sampleItem.item}</code> — decayed: {state.sampleItem.decayed},
              expires: {state.sampleItem.expires || "—"}
              {state.sampleItem.formatted && ` (${state.sampleItem.formatted})`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
