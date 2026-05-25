// ============================================================
// GapsView — the Basket tab
// ============================================================
// Step 7j-1: minimal shell that mounts <SuggestedBasket> only.
// The regulars/gaps table from canonical L4242–4484 lands in 7j-2
// alongside its sort state + filter controls + LeverageTileGrid.
//
// Props pass through to SuggestedBasket:
//   pantry      — mapped pantry rows
//   outOfStock  — Set of item names flagged out
// ============================================================

import SuggestedBasket from "./SuggestedBasket.jsx";

export default function GapsView({pantry, outOfStock}) {
  return <div className="space-y-5">
    <SuggestedBasket pantry={pantry} outOfStock={outOfStock} />
  </div>;
}
