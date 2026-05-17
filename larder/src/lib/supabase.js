// ============================================================
// Supabase client + fetch helpers
// ============================================================
// Extracted from index__4_.html (L455-720 of canonical file)
// during the Vite migration. Behaviour matches the canonical
// file exactly; the only structural change is that the four
// near-identical write helpers (patchPantryRow, patchRecipeRow,
// insertCookedLog, deleteCookedLog) now share a single sbWrite()
// helper. Same wire calls, same return shapes.
//
// Credentials note: the URL, anon key, and INGEST_SECRET are
// public values — they're served in the dashboard HTML on every
// page load, so embedding them here is no worse than the status
// quo. RLS on the Supabase side controls actual access. If we
// ever want to switch to Vite env vars (import.meta.env.VITE_*)
// we can — but that adds deploy-time config and isn't necessary
// for security. Leaving inline for now.
// ============================================================

export const SUPABASE = {
  url: "https://odevqzgdwwqgryybgbyf.supabase.co",
  anonKey: "sb_publishable_F3K2WRXKHrr4ShwQg971OA_2kvegwp7",
};

// Shared secret for the ingest-receipt Edge Function. NOT a real secret — the
// dashboard source is visible to anyone who opens it. It raises the bar against
// drive-by callers who only have the anon key. To rotate: edit the constant
// in supabase/functions/ingest-receipt/index.ts AND this value, then redeploy
// the function. The Edge Function also enforces a JWT check via verify_jwt=true
// — the anon key satisfies it, so no extra wiring needed in the client.
export const INGEST_SECRET = "f07caca7c07e77ece835138a152ffa8c";
export const INGEST_URL = `${SUPABASE.url}/functions/v1/ingest-receipt`;

// ============================================================
// Read helper
// ============================================================
// Plain fetch() against the PostgREST endpoint — no need for the
// supabase-js client library. Returns parsed JSON or throws.
export async function sbFetch(path) {
  const res = await fetch(`${SUPABASE.url}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE.anonKey,
      Authorization: `Bearer ${SUPABASE.anonKey}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// ============================================================
// Write helper (POST / PATCH / DELETE)
// ============================================================
// All write paths in the canonical file repeated the same fetch
// boilerplate (apikey + Authorization + Content-Type + Prefer).
// This helper factors it out. Behaviour-identical to the four
// inline blocks it replaces.
//
//   method:  "POST" | "PATCH" | "DELETE"
//   path:    PostgREST path (e.g. "pantry_items?id=eq.<uuid>")
//   body:    JS object to JSON-encode (omit for DELETE)
//   options: { returnRepresentation?: boolean }
//            When true (default for POST/PATCH), adds
//            Prefer: return=representation so the server echoes
//            the row(s). DELETE defaults to false.
//
// Returns: parsed JSON on success (or `true` for DELETE), throws on error.
async function sbWrite(method, path, body, options = {}) {
  const wantsRepresentation = options.returnRepresentation
    ?? (method !== "DELETE");
  const headers = {
    apikey: SUPABASE.anonKey,
    Authorization: `Bearer ${SUPABASE.anonKey}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (wantsRepresentation) headers["Prefer"] = "return=representation";

  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(`${SUPABASE.url}/rest/v1/${path}`, init);
  if (!res.ok) throw new Error(`Supabase ${method} ${res.status}: ${await res.text()}`);
  return method === "DELETE" ? true : res.json();
}

// ============================================================
// Edge Function: ingest-receipt
// ============================================================
// POST to the ingest-receipt function. Two modes:
//
//   ingestReceipt({ retailer, eml, dryRun })
//     — POST raw email text. Function parses server-side. If dryRun, the
//       function returns the parsed order without writing to the DB.
//
//   ingestReceipt({ retailer, order })
//     — POST a pre-parsed order (legacy path, used by the in-browser PDF
//       parser since pdf.js text isn't compatible with the server parser).
//
// Returns one of:
//   { status: "dry_run",   retailer, order }                          (dryRun=true)
//   { status: "saved",     receipt_id, items_inserted }
//   { status: "replaced",  previous_id, receipt_id, items_inserted }  (amendment)
//   { status: "duplicate", existing_id, existing_delivery_date }
//   { status: "error",     code, message? }
// Network failures surface as { status: "error", code: "network", message }.
//
// Exactly one of `eml` / `order` must be provided. If both are passed, `eml`
// wins (the server parser is canonical).
export async function ingestReceipt({ retailer, eml, order, dryRun }) {
  const body = (typeof eml === "string" && eml.length > 0)
    ? { retailer, eml }
    : { retailer, order };
  const url = dryRun ? `${INGEST_URL}?dry_run=true` : INGEST_URL;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE.anonKey}`,
        "X-Ingest-Secret": INGEST_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok && !json.status) {
      return { status: "error", code: "http_" + res.status, message: `HTTP ${res.status}` };
    }
    return json;
  } catch (e) {
    return { status: "error", code: "network", message: e.message || String(e) };
  }
}

// ============================================================
// Table-specific read helpers
// ============================================================

export async function fetchPantry() {
  // ?select=*&order=item.asc — paginate if you ever exceed 1000 rows
  return sbFetch("pantry_items?select=*&order=item.asc&limit=2000");
}

export async function fetchRecipes() {
  return sbFetch("recipes?select=*&order=name.asc&limit=2000");
}

export async function fetchCookedLog() {
  return sbFetch("cooked_log?select=*&order=cooked_date.desc&limit=1000");
}

// Fetch all receipts with their items embedded. PostgREST's embed syntax
// (?select=*,receipt_items(*)) returns each receipt with an `items_raw`
// array of joined receipt_items rows — we rename to `items` in mapReceiptRow
// to match the shape OrdersView and the price-index helpers expect.
//
// Ordering by delivery_date.asc to match the old client-side .sort() in
// TESCO_ORDERS — downstream code expects oldest-first.
export async function fetchReceipts() {
  return sbFetch("receipts?select=*,items_raw:receipt_items(*)&order=delivery_date.asc&limit=2000");
}

// Map a Supabase receipt row (with embedded receipt_items) → the shape the
// existing OrdersView / price-index / pattern-tracking helpers expect.
// Columns are already named to match (delivery_date, total_paid_gbp,
// purchased_count, etc.) — the only translation is:
//   - items_raw (from the embed alias) → items
//   - sort items by position so the order is stable and matches the
//     original receipt sequence (PostgREST doesn't guarantee order on
//     embedded resources unless you ask).
//
// Numeric columns come back as JS numbers via PostgREST so total_paid_gbp,
// total_price_gbp, etc. work directly in arithmetic without parseFloat.
//
// Extracted from canonical index.html L861-891.
export function mapReceiptRow(row) {
  const items = (row.items_raw || [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(it => ({
      name: it.name,
      qty: it.qty,
      unit_price_gbp: it.unit_price_gbp,
      total_price_gbp: it.total_price_gbp,
      saved_gbp: it.saved_gbp,
      section: it.section,
      status: it.status,
      substituted_for: it.substituted_for,
    }));
  return {
    id: row.id,
    order_number: row.order_number,
    email_type: row.email_type,
    delivery_date: row.delivery_date,
    order_placed_date: row.order_placed_date,
    total_paid_gbp: row.total_paid_gbp,
    total_saved_gbp: row.total_saved_gbp,
    substitution_count: row.substitution_count,
    unavailable_count: row.unavailable_count,
    item_count: row.item_count,
    purchased_count: row.purchased_count,
    parse_quality: row.parse_quality,
    parse_warning: row.parse_warning,
    items,
  };
}

// Map a Supabase cooked_log row → the local cooked-log entry shape.
// The DB schema uses recipe_id / cooked_date; the UI was written
// against meal_id / date (pre-Supabase, when entries lived only in
// localStorage). This translation keeps the boot fetch from forcing
// a UI-wide rename for a single column-name preference.
//
// Extracted from canonical index.html L897–907.
export function mapCookedRow(row) {
  return {
    id: row.id,
    meal_id: row.recipe_id,
    date: row.cooked_date,
    name: row.recipe_name,
    source: row.source_file,
    audience: row.audience,
    protein_per_serving_g: row.protein_per_serving_g,
  };
}

// Map a Supabase recipe row → the shape the existing UI expects.
// The UI's loadRecipes() previously flattened many separate arrays
// (east_curries, dishoom, etc.) into one list, tagging each with a
// _source_file like "east-curries". Supabase has no source_file
// column, so we derive it from (source_type, source_title).
//
// Extracted from canonical index.html L914–956 (mapRecipeRow +
// the deriveSourceFile helper it depends on). The page number
// lives at source.page; updateRecipePage (App-scope) mutates it
// via patchRecipeRow on { source_page: nextPage }.
function deriveSourceFile(row) {
  const t = (row.source_title || "").toLowerCase();
  const st = (row.source_type || "").toLowerCase();
  if (st === "instagram") return "instagram-recipes";
  if (st === "web") return "saved-links";
  if (t.startsWith("east")) {
    // East has 5 chapters but a single source_title — best we can do
    // is group all East recipes under one label. UI just uses it for
    // grouping/display.
    return "east";
  }
  if (t.includes("ottolenghi")) return "ottolenghi-simple";
  if (t.includes("dishoom")) return "dishoom";
  if (t.includes("africana")) return "africana";
  if (t.includes("west winds")) return "west-winds";
  return st || "unknown";
}

export function mapRecipeRow(row) {
  return {
    id: row.id,
    name: row.name,
    source: {
      type: row.source_type,
      title: row.source_title,
      page: row.source_page,
      url: row.source_url,
      author: row.source_author,
      date: row.source_date,
    },
    servings: row.servings,
    prep_time_mins: row.prep_time_mins,
    cook_time_mins: row.cook_time_mins,
    tags: row.tags || [],
    audience: row.audience,
    eaters: row.eaters || [],
    ingredients: row.ingredients || [],
    protein_per_serving_g: row.protein_per_serving_g,
    makeable_pct: null,
    notes: row.notes,
    steps: row.steps || [],
    _source_file: deriveSourceFile(row),
  };
}

// Map a Supabase pantry_items row → the shape PantryView and the App-scope
// sync model expect. Columns ride through unchanged except for the four
// _underscore-prefixed passthroughs (out_of_stock, qty_adjustment,
// in_freezer, frozen_at) — naming them with the prefix marks them as
// "client-side computed / synced" so consumers don't confuse them with
// the raw pantry shape used by older code paths.
//
// in_freezer is a manual override (the user dragged a fresh item into
// the freezer) — when true, freshness decay uses the frozen rate
// regardless of the row's category. frozen_at lets decayed() split decay
// into pre-freeze (normal rate) and post-freeze (frozen rate) segments
// — so freezing a 3-day-old salmon doesn't retroactively boost
// freshness; it just stops the bleed.
//
// Extracted from canonical index.html L959–984.
export function mapPantryRow(row) {
  return {
    id: row.id,
    item: row.item,
    category: row.category,
    qty: row.qty,
    confidence: row.confidence,
    purchased: row.purchased,
    expires: row.expires,
    allergen_flag: row.allergen_flag,
    // out_of_stock, qty_adjustment, and in_freezer now live on the row
    // itself (not localStorage) — pass through so the UI can read them.
    _out_of_stock: !!row.out_of_stock,
    _qty_adjustment: row.qty_adjustment || 0,
    _in_freezer: !!row.in_freezer,
    // ISO date string (YYYY-MM-DD) of when the item was moved to the freezer.
    // Null when _in_freezer is false, or when the row predates this column.
    _frozen_at: row.frozen_at || null,
  };
}

// Fetch the household_allergens table — canonical allergen tokens for
// Khalil (block / uncertain / safe_phrase), Max (block), and Emily (block).
// See AllergensContext for the shape consumers expect; mapping happens in
// buildAllergensConfig (lives in allergens module).
export async function fetchHouseholdAllergens() {
  return sbFetch("household_allergens?select=eater,kind,token,category&order=eater.asc,kind.asc");
}

// Fetch the tesco_skus table — basket-key → Tesco SKU/URL mapping with
// Khalil-critical and household-rule-excluded flags. Step 2 of the basket
// automation: this data is joined onto basket items so downstream steps
// (export button, Chrome handoff) can resolve the right Tesco product.
// Only the preferred row per basket_key is needed for resolution.
export async function fetchTescoSkus() {
  return sbFetch("tesco_skus?select=basket_key,tesco_name,tesco_sku,tesco_url,khalil_critical,household_rule_excluded,verified_safe&is_preferred=eq.true&limit=2000");
}

// ============================================================
// Table-specific write helpers
// ============================================================

// PATCH a single pantry row by id. Returns the updated row(s) on success,
// throws on failure. Used by toggleOutOfStock / adjustQty.
// Keying on `id` (uuid PK) rather than `item` text — item is not guaranteed
// unique, so id is the safe match.
export async function patchPantryRow(id, fields) {
  if (!id) throw new Error("patchPantryRow: missing id");
  return sbWrite("PATCH", `pantry_items?id=eq.${id}`, fields);
}

// PATCH a single recipe row by id. Mirrors patchPantryRow but hits the
// `recipes` table. As of v27, public.recipes has RLS disabled, so anon
// PATCHes succeed — this is fine for the narrow case of editing source_page
// (the data-quality task this helper exists for), but it does mean any
// recipe field is writeable from the page. Parked todo (since v14.10):
// enable RLS on recipes with a narrow source_page-only update policy. When
// that lands, callers that try to write other fields will start failing,
// which is the correct outcome — this helper itself doesn't need to change.
export async function patchRecipeRow(id, fields) {
  if (!id) throw new Error("patchRecipeRow: missing id");
  return sbWrite("PATCH", `recipes?id=eq.${id}`, fields);
}

// Insert a cooked_log row. Returns the inserted row(s) (with server-assigned
// id) so the caller can attach the id to the local entry for later deletes.
// Mirrors patchPantryRow's optimistic-write pattern.
export async function insertCookedLog(entry) {
  return sbWrite("POST", "cooked_log", entry);
}

// Delete a cooked_log row by id (uuid PK). Used when the user un-marks a meal
// as cooked. Keyed on id, not meal_id+date, so duplicate entries (same meal
// cooked twice in a day) delete cleanly.
export async function deleteCookedLog(id) {
  if (!id) throw new Error("deleteCookedLog: missing id");
  return sbWrite("DELETE", `cooked_log?id=eq.${id}`);
}
