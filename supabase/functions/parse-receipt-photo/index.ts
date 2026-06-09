// Supabase Edge Function: parse-receipt-photo
//
// Vision-based parser for PHOTOGRAPHED paper till receipts (Sainsbury's,
// Tesco-paper, Co-op, Lidl, Aldi, M&S, …). Complements `ingest-receipt`,
// which only handles Tesco .eml/.pdf. This function does NOT write to the
// database — it returns an `order`-shaped object that the client previews
// and then saves through the existing `ingest-receipt` `{ retailer, order }`
// path (so dedup + receipt_items insert + replenishment all reuse the
// canonical write path).
//
// Request (POST, JSON):
//   { image_base64: string, media_type: "image/jpeg"|"image/png"|"image/webp"|"image/gif",
//     retailer?: string, source_file?: string }
//
// Auth: shared X-Ingest-Secret header (same value as ingest-receipt) +
//       verify_jwt=false at the platform level. Anon key in Authorization.
//
// Response:
//   { status: "parsed", retailer, order, confidence, notes }
//   { status: "error", code, message }
//
// Requires the ANTHROPIC_API_KEY secret. Set it once with:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (or via the dashboard)

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
// Vision model. Sonnet 4.6 reads crumpled/rotated thermal receipts reliably;
// override with the RECEIPT_VISION_MODEL secret if you want cheaper/faster.
const MODEL = Deno.env.get("RECEIPT_VISION_MODEL") || "claude-sonnet-4-6";

// Same shared secret as ingest-receipt. NOT a real secret — raises the bar
// against drive-by callers who only have the public anon key.
const INGEST_SECRET = "f07caca7c07e77ece835138a152ffa8c";

// Retailers ingest-receipt accepts (keep in sync with its ALLOWED_RETAILERS).
const ALLOWED_RETAILERS = new Set([
  "tesco", "ocado", "sainsburys", "waitrose", "asda", "morrisons",
  "aldi", "lidl", "coop", "mands", "iceland", "other",
]);

const ALLOWED_MEDIA = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Tool schema the model is forced to call — guarantees structured output.
const EMIT_TOOL = {
  name: "emit_receipt",
  description: "Return the structured contents of a UK supermarket till receipt.",
  input_schema: {
    type: "object",
    properties: {
      retailer: {
        type: "string",
        description:
          "Lowercase retailer slug. One of: tesco, sainsburys, asda, morrisons, " +
          "waitrose, aldi, lidl, coop, mands, iceland, ocado. Use 'other' if unsure.",
      },
      store_location: { type: "string", description: "Store/branch name if printed, else empty." },
      date: { type: "string", description: "Purchase date as ISO YYYY-MM-DD (read from the receipt)." },
      time: { type: "string", description: "Purchase time HH:MM:SS if printed, else empty." },
      receipt_ref: {
        type: "string",
        description:
          "A stable reference for de-duplication, built from any printed " +
          "store number / till number / transaction code, e.g. '8770-S6555-220526-072129'. " +
          "Empty if nothing identifying is printed.",
      },
      total_gbp: { type: ["number", "null"], description: "Balance due / total paid in GBP." },
      items: {
        type: "array",
        description: "Every PURCHASED grocery line item. Exclude totals, change, card, points, store info.",
        items: {
          type: "object",
          properties: {
            qty: { type: "number", description: "Quantity (default 1)." },
            name: {
              type: "string",
              description:
                "Clean, human-readable product name that KEEPS the brand and the key food " +
                "noun so it can be matched to a pantry list. Expand abbreviations using UK " +
                "grocery knowledge: 'BURFORD BROWN x6' -> 'Burford Brown Eggs (6)', " +
                "\"OATLEY B'RISTA\" -> 'Oatly Barista Oat Milk', 'HARBOUR FILLETS X4' -> " +
                "'Harbour Breaded Fish Fillets (4)'. Always include the generic food word " +
                "(eggs, milk, chicken, fish, bread, etc.).",
            },
            raw_text: { type: "string", description: "The line exactly as printed." },
            unit_price_gbp: { type: ["number", "null"] },
            total_price_gbp: { type: ["number", "null"] },
            category: {
              type: "string",
              description: "Coarse aisle: fridge | freezer | produce | bakery | cupboard | drinks | household | other.",
            },
          },
          required: ["qty", "name"],
        },
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      notes: { type: "string", description: "Anything unreadable or uncertain. Empty if clean." },
    },
    required: ["retailer", "date", "items"],
  },
};

const INSTRUCTION =
  "You are reading a UK supermarket till receipt from a phone photo. The photo may be " +
  "rotated, crumpled, creased, or low-contrast — read it carefully in whatever orientation " +
  "it appears. Extract EVERY purchased grocery line item. Give each a clean, human-readable " +
  "product name that keeps the brand and the key food noun, expanding cryptic abbreviations " +
  "using UK grocery knowledge. Include quantity and any printed prices. Skip non-product lines " +
  "(balance due, change, card/payment, Nectar/Clubcard points, store address, VAT number, " +
  "barcodes). Read the purchase date and any store/till/transaction reference for de-duplication. " +
  "If an item is hard to read, still include it with your best guess and lower the confidence. " +
  "Respond by calling the emit_receipt tool — do not write prose.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return json({ status: "error", code: "method_not_allowed", message: "POST only" }, 405);
  }

  const secret = req.headers.get("x-ingest-secret") || "";
  if (secret !== INGEST_SECRET) {
    return json({ status: "error", code: "unauthorized", message: "missing or invalid X-Ingest-Secret" }, 401);
  }

  if (!ANTHROPIC_API_KEY) {
    return json({
      status: "error",
      code: "vision_unconfigured",
      message:
        "ANTHROPIC_API_KEY is not set on this Supabase project. Set it once with " +
        "`supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` (or via the dashboard's " +
        "Edge Function secrets), then retry.",
    }, 503);
  }

  let payload: { image_base64?: string; media_type?: string; retailer?: string; source_file?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ status: "error", code: "bad_json", message: "request body must be JSON" }, 400);
  }

  const imageB64 = (payload.image_base64 || "").trim();
  const mediaType = (payload.media_type || "").trim().toLowerCase();
  if (!imageB64) return json({ status: "error", code: "no_image", message: "image_base64 is required" }, 400);
  if (!ALLOWED_MEDIA.has(mediaType)) {
    return json({
      status: "error",
      code: "bad_media_type",
      message: `media_type must be one of: ${[...ALLOWED_MEDIA].join(", ")} (got '${mediaType}')`,
    }, 400);
  }

  // Call the Anthropic Messages API with a forced tool call for structured output.
  let anthRes: Response;
  try {
    anthRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        tools: [EMIT_TOOL],
        tool_choice: { type: "tool", name: "emit_receipt" },
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageB64 } },
            { type: "text", text: INSTRUCTION },
          ],
        }],
      }),
    });
  } catch (e) {
    return json({ status: "error", code: "vision_network", message: (e as Error).message || "fetch failed" }, 502);
  }

  if (!anthRes.ok) {
    const errText = await anthRes.text().catch(() => "");
    return json({
      status: "error",
      code: "vision_http_" + anthRes.status,
      message: errText.slice(0, 500) || `Anthropic API returned ${anthRes.status}`,
    }, 502);
  }

  let anth: { content?: Array<{ type: string; name?: string; input?: unknown }> };
  try {
    anth = await anthRes.json();
  } catch {
    return json({ status: "error", code: "vision_bad_json", message: "Anthropic response was not JSON" }, 502);
  }

  const toolBlock = (anth.content || []).find(
    (b) => b.type === "tool_use" && b.name === "emit_receipt",
  );
  if (!toolBlock || !toolBlock.input) {
    return json({ status: "error", code: "vision_no_tool", message: "model did not return structured output" }, 502);
  }

  const extracted = toolBlock.input as {
    retailer?: string;
    store_location?: string;
    date?: string;
    time?: string;
    receipt_ref?: string;
    total_gbp?: number | null;
    items?: Array<{
      qty?: number;
      name?: string;
      raw_text?: string;
      unit_price_gbp?: number | null;
      total_price_gbp?: number | null;
      category?: string;
    }>;
    confidence?: string;
    notes?: string;
  };

  // Normalise retailer: prefer the client hint if it's a known slug, else the
  // model's, clamped to the set ingest-receipt accepts.
  const hint = (payload.retailer || "").toLowerCase().trim();
  let retailer = ALLOWED_RETAILERS.has(hint) ? hint : (extracted.retailer || "").toLowerCase().trim();
  if (!ALLOWED_RETAILERS.has(retailer)) retailer = "other";

  const date = (extracted.date || "").trim();
  const items = Array.isArray(extracted.items) ? extracted.items : [];

  // Map vision items to the receipt_items shape ingest-receipt expects.
  const mappedItems = items
    .filter((it) => it && it.name)
    .map((it) => {
      const qty = typeof it.qty === "number" && it.qty > 0 ? it.qty : 1;
      const unit = typeof it.unit_price_gbp === "number" ? it.unit_price_gbp : null;
      let line = typeof it.total_price_gbp === "number" ? it.total_price_gbp : null;
      if (line == null && unit != null) line = Math.round(unit * qty * 100) / 100;
      return {
        qty,
        name: String(it.name).trim(),
        unit_price_gbp: unit,
        total_price_gbp: line,
        saved_gbp: null,
        section: (it.category || "").trim() || null,
        status: "purchased" as const,
        substituted_for: null,
      };
    });

  const lineTotal = Math.round(
    mappedItems.reduce((s, it) => s + (it.total_price_gbp || 0), 0) * 100,
  ) / 100;

  // Synthetic, deterministic order_number so re-uploading the same receipt
  // dedupes (ingest-receipt keys on (retailer, order_number)).
  const compactDate = date.replace(/-/g, "") || "00000000";
  const ref = (extracted.receipt_ref || "").replace(/[^A-Za-z0-9]+/g, "").slice(0, 24);
  const timePart = (extracted.time || "").replace(/[^0-9]/g, "").slice(0, 6);
  const cents = extracted.total_gbp != null ? Math.round(extracted.total_gbp * 100) : lineTotal * 100;
  const orderNumber = ref
    ? `${retailer}-${compactDate}-${ref}`
    : `${retailer}-${compactDate}-${timePart || "000000"}-${cents}`;

  const confidence = ["high", "medium", "low"].includes(extracted.confidence || "")
    ? extracted.confidence!
    : "medium";
  const parseQuality = mappedItems.length === 0
    ? "no_items_found"
    : (confidence === "low" ? "low_confidence" : "ok");

  const order = {
    retailer,
    order_number: orderNumber,
    email_type: "receipt",
    email_subject: null,
    email_date: date || null,
    order_placed_date: null,
    delivery_date: date || null, // NOT NULL in the schema — the receipt date stands in
    delivery_slot: null,
    delivery_address: (extracted.store_location || "").trim() || null,
    total_paid_gbp: extracted.total_gbp ?? null,
    total_saved_gbp: null,
    substitution_count: 0,
    unavailable_count: 0,
    item_count: mappedItems.length,
    purchased_count: mappedItems.length,
    line_items_total_gbp: lineTotal,
    line_items_saved_gbp: 0,
    parse_quality: parseQuality,
    parse_warning: (extracted.notes || "").trim() || null,
    items: mappedItems,
    source_file: payload.source_file || null,
  };

  return json({ status: "parsed", retailer, order, confidence, notes: extracted.notes || null });
});
