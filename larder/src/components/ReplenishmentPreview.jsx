// ============================================================
// ReplenishmentPreview — three-bucket preview UI after a save
// ============================================================
// Renders the output of computeReplenishment with checkboxes for the
// auto-matched bucket and dropdowns for the ambiguous one. Single
// "Apply" button at the bottom collects the user's selections and
// fires onApply with the deduped list of {id, item} to PATCH.
//
// Props:
//   result        — { matched, ambiguous, unmatched } from
//                   computeReplenishment.
//   deliveryDate  — ISO date string; shown in the header.
//   onApply(rows) — async; receives [{id, item}] (deduped by id) of
//                   pantry rows to mark as purchased on deliveryDate.
//   onCancel()    — user opted out of replenishment for this receipt.
//
// State:
//   autoChecks    — Map(matched-index → boolean)
//   ambiguousPicks— Map(ambiguous-index → pantry-row-id | "skip")
// ============================================================

import { useMemo, useState } from "react";

export default function ReplenishmentPreview({ result, deliveryDate, onApply, onCancel }) {
  const { matched, ambiguous, unmatched } = result;

  // Default: every auto-match checked.
  const [autoChecks, setAutoChecks] = useState(() => {
    const m = new Map();
    matched.forEach((_, i) => m.set(i, true));
    return m;
  });
  // Default: ambiguous picks start as "skip" until the user chooses.
  const [picks, setPicks] = useState(() => {
    const m = new Map();
    ambiguous.forEach((_, i) => m.set(i, "skip"));
    return m;
  });
  const [busy, setBusy] = useState(false);

  const toggleAuto = (i) => setAutoChecks((prev) => {
    const next = new Map(prev);
    next.set(i, !prev.get(i));
    return next;
  });

  const setPick = (i, val) => setPicks((prev) => {
    const next = new Map(prev);
    next.set(i, val);
    return next;
  });

  // Deduped list of {id, item} that will be PATCHed when the user
  // clicks Apply. Memoised so the count in the button stays in sync.
  const selected = useMemo(() => {
    const byId = new Map();
    matched.forEach((m, i) => {
      if (autoChecks.get(i)) byId.set(m.pantryRow.id, { id: m.pantryRow.id, item: m.pantryRow.item });
    });
    ambiguous.forEach((a, i) => {
      const pickId = picks.get(i);
      if (pickId && pickId !== "skip") {
        const row = a.candidates.find((c) => c.id === pickId);
        if (row) byId.set(row.id, { id: row.id, item: row.item });
      }
    });
    return Array.from(byId.values());
  }, [matched, ambiguous, autoChecks, picks]);

  const handleApply = async () => {
    if (busy || !selected.length) return;
    setBusy(true);
    try {
      await onApply(selected);
    } finally {
      setBusy(false);
    }
  };

  if (!matched.length && !ambiguous.length && !unmatched.length) return null;

  return (
    <div className="card p-4 mt-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold mb-0.5">Replenish pantry</h3>
          <p className="text-xs text-stone-500">
            Mark pantry items as purchased on {deliveryDate}. Cancel skips this step; the receipt stays archived.
          </p>
        </div>
      </div>

      {matched.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-stone-700 mb-1.5">
            Auto-matched ({matched.length})
          </div>
          <div className="space-y-1">
            {matched.map((m, i) => (
              <label key={`m${i}`} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!autoChecks.get(i)}
                  onChange={() => toggleAuto(i)}
                />
                <span className="text-stone-600 truncate flex-1">{m.receiptItem.name}</span>
                <span className="text-stone-400">→</span>
                <span className="chip">{m.pantryRow.item}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {ambiguous.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-stone-700 mb-1.5">
            Pick a match ({ambiguous.length})
          </div>
          <div className="space-y-1.5">
            {ambiguous.map((a, i) => (
              <div key={`a${i}`} className="flex items-center gap-2 text-xs">
                <span className="text-stone-600 truncate flex-1">{a.receiptItem.name}</span>
                <select
                  value={picks.get(i) || "skip"}
                  onChange={(e) => setPick(i, e.target.value)}
                  className="text-xs border border-stone-300 rounded px-1 py-0.5"
                >
                  <option value="skip">Skip — not in pantry</option>
                  {a.candidates.map((c) => (
                    <option key={c.id} value={c.id}>{c.item}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {unmatched.length > 0 && (
        <details className="mb-3 text-xs">
          <summary className="font-semibold text-stone-700 cursor-pointer">
            No match ({unmatched.length})
          </summary>
          <p className="text-stone-500 mt-1 mb-1">
            These receipt items don't correspond to a pantry row. Add them in the Pantry tab if you want them tracked.
          </p>
          <ul className="text-stone-600 ml-4 list-disc">
            {unmatched.map((u, i) => (
              <li key={`u${i}`}>{u.receiptItem.name}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex justify-end gap-2 mt-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="pill"
        >
          Skip
        </button>
        <button
          onClick={handleApply}
          disabled={busy || !selected.length}
          className="pill"
          data-active="true"
        >
          {busy ? "Applying…" : `Apply (${selected.length})`}
        </button>
      </div>
    </div>
  );
}
