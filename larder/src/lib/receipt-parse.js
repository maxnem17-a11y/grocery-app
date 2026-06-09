// ============================================================
// Receipt-parse — ingest pipeline helpers
// ============================================================
// Verbatim port of canonical index.html:
//   - __pdfjsPromise + loadPdfJs   L2670–2688  (lazy CDN loader)
//   - extractPdfText               L2690–2715  (pdf → text via pdf.js)
//   - readEmlText                  L2721–2723  (file.text() wrapper)
//   - detectRetailer               L2727–2735  (Tesco/Ocado/etc. classifier)
//   - parseTesco                   L2740–2900  (~160 lines of regex parser)
//   - ordersKhalilFlag             L2630–2644  (receipt-item Khalil tagger)
//
// Step 7k. Consumed by ReceiptParser (preview + save flow) and
// OrdersView (ordersKhalilFlag for the line-item Khalil column).
//
// Note: ordersKhalilFlag has the same NAME as `khalilAllergenFlag`
// in allergens.js but a different SIGNATURE and PURPOSE. This one
// is a regex-based receipt-item tagger (no config arg); the
// allergens.js version takes the Supabase-fed config. Don't merge
// them — they handle different input shapes.
//
// Module-level __pdfjsPromise singleton memoises the CDN load so
// multiple ReceiptParser instances or repeated PDF drops only
// trigger one network fetch. Verbatim from canonical.
// ============================================================

// --- Photo receipt → downscaled base64 (for the vision parser) ---
// Phone photos are 2–4MB; the Anthropic vision API recommends a long edge of
// ~1568px and base64 inflates payloads ~33%. Downscale on a canvas to keep the
// request small/fast/cheap and well under the size limit, re-encoding as JPEG.
// Returns { base64, mediaType } — base64 is the bare payload (no data: prefix).
export function imageToDownscaledBase64(file, maxEdge = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
        const scale = Math.min(1, maxEdge / longest);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(url);
        const comma = dataUrl.indexOf(",");
        resolve({ base64: dataUrl.slice(comma + 1), mediaType: "image/jpeg" });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load the image — try a JPG or PNG photo."));
    };
    img.src = url;
  });
}

// --- PDF.js loader (lazy, on first .pdf dropped) ---
let __pdfjsPromise = null;

export function loadPdfJs() {
  if (__pdfjsPromise) return __pdfjsPromise;
  __pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
    s.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error("Failed to load pdf.js"));
    document.head.appendChild(s);
  });
  return __pdfjsPromise;
}

export async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    // Reassemble lines by Y-coordinate to preserve receipt layout
    const items = tc.items.slice().sort((a, b) => (b.transform[5] - a.transform[5]) || (a.transform[4] - b.transform[4]));
    let lastY = null;
    let line = [];
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        out.push(line.join(" "));
        line = [];
      }
      line.push(it.str);
      lastY = y;
    }
    if (line.length) out.push(line.join(" "));
    out.push("");
  }
  return out.join("\n");
}

// Read .eml text (UTF-8 best effort) and forward as-is to the ingest
// function. As of 2026-05-15.3 the dashboard no longer parses .eml in the
// browser — the function does MIME walk + HTML extract + parse server-side.
// We just hand over `file.text()`.
export async function readEmlText(file) {
  return await file.text();
}

// Detect retailer from text — minimal viable: Tesco only for now,
// flag unknown so the user knows manual parse needed.
export function detectRetailer(text, fileName) {
  const t = (text || "").toLowerCase();
  const n = (fileName || "").toLowerCase();
  if (/tesco\.com|tesco\b/.test(t) || /tesco/.test(n)) return "tesco";
  if (/ocado/.test(t) || /ocado/.test(n)) return "ocado";
  if (/sainsbury/.test(t) || /sainsbury/.test(n)) return "sainsburys";
  if (/waitrose/.test(t) || /waitrose/.test(n)) return "waitrose";
  return null;
}

// Parse a Tesco receipt text blob. Best-effort regex extraction designed to
// produce the same shape as the Python skill. Sets parse_quality flags when
// confidence is low.
export function parseTesco(rawText) {
  const text = rawText.replace(/ /g, " ");
  const order = {
    retailer: "tesco",
    order_number: null,
    email_type: null,
    delivery_date: null,
    order_placed_date: null,
    total_paid_gbp: null,
    total_saved_gbp: null,
    item_count: 0,
    purchased_count: 0,
    substitution_count: 0,
    unavailable_count: 0,
    parse_quality: "ok",
    parse_warning: null,
    items: [],
  };

  // Order number — usually 4-4-2 or 4-4-X digits
  const orderNumMatch = text.match(/order\s*(?:number|#|reference)?[:\s]*([\d]{4}[-\s]?[\d]{4}[-\s]?[\d]{2,4})/i)
                     || text.match(/\b(\d{4}-\d{4}-\d{2,4})\b/);
  if (orderNumMatch) {
    order.order_number = orderNumMatch[1].replace(/\s/g, "-");
  }

  // Email type from subject keywords if present
  if (/receipt for your tesco/i.test(text))      order.email_type = "receipt";
  else if (/order.*is confirmed|confirmation/i.test(text)) order.email_type = "confirmation";
  else if (/you'?ve made changes|amendment/i.test(text))   order.email_type = "amendment";

  // Delivery date
  // e.g. "Delivery on Mon, 11 May 2026" or "today" or "tomorrow"
  const dateMatch = text.match(/deliver(?:y|ed)\s+(?:on\s+)?(?:[A-Za-z]+,?\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i)
                 || text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const monthName = dateMatch[2];
    const year = parseInt(dateMatch[3], 10);
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mIdx = months.findIndex(m => monthName.toLowerCase().startsWith(m));
    if (mIdx >= 0) {
      const d = new Date(Date.UTC(year, mIdx, day));
      order.delivery_date = d.toISOString().slice(0, 10);
    }
  }

  // Total paid — look for "Total" followed by £X.XX, taking the largest match
  const totalMatches = [...text.matchAll(/(?:total\s+(?:paid|charged|cost)?|order\s+total|grand\s+total)[:\s]*£?\s*(\d+\.\d{2})/gi)];
  if (totalMatches.length) {
    order.total_paid_gbp = Math.max(...totalMatches.map(m => parseFloat(m[1])));
  } else {
    const allTotals = [...text.matchAll(/£\s*(\d+\.\d{2})/g)].map(m => parseFloat(m[1]));
    if (allTotals.length) {
      // Heuristic: total is usually the largest single £ value on a receipt
      order.total_paid_gbp = Math.max(...allTotals);
    }
  }

  // Saved
  const savedMatch = text.match(/(?:saved|savings|clubcard\s+price\s+savings?)[:\s]*£?\s*(\d+\.\d{2})/i);
  if (savedMatch) order.total_saved_gbp = parseFloat(savedMatch[1]);

  // Items: try to find lines that look like "<qty>  <name>  £<unit>  £<total>"
  // Tesco uses sections (Fridge, Freezer, Cupboard, Unavailable items, etc.)
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  let currentSection = "cupboard";
  let inUnavailable = false;

  // Section headers
  const sectionMap = [
    [/^fridge\b/i,              "fridge"],
    [/^freezer\b/i,              "freezer"],
    [/^cupboard\b/i,             "cupboard"],
    [/^fresh\b|^produce\b/i,    "fresh"],
    [/^bakery\b/i,               "bakery"],
    [/^drinks\b|^beverages\b/i, "drinks"],
    [/^household\b|^toiletries\b/i, "household"],
    [/unavailable/i,             "unavailable"],
  ];

  for (let line of lines) {
    // Section detection — short headerish lines
    if (line.length < 40) {
      for (const [rgx, name] of sectionMap) {
        if (rgx.test(line.trim())) {
          currentSection = name;
          inUnavailable = (name === "unavailable");
          break;
        }
      }
    }

    // Item line patterns:
    //   "2  Boursin Garlic & Herbs Soft Cheese 150g  £3.70  £7.40"
    //   "1 x Tofoo Naked Tofu 280g £2.75"
    //   Some PDFs collapse spaces — be flexible
    const m = line.match(/^(\d+)\s*(?:x\s+)?(.+?)\s+£\s*(\d+\.\d{2})(?:\s+£\s*(\d+\.\d{2}))?\s*$/);
    if (m) {
      const qty = parseInt(m[1], 10);
      const name = m[2].trim();
      const p1 = parseFloat(m[3]);
      const p2 = m[4] ? parseFloat(m[4]) : null;
      // Sanity: name should have at least one letter, not be a section header
      if (!/[A-Za-z]/.test(name)) continue;
      if (/^(total|subtotal|order|delivery|saved|clubcard)\b/i.test(name)) continue;
      order.items.push({
        qty,
        name,
        unit_price_gbp:  p2 != null ? p1 : (qty ? +(p1 / qty).toFixed(2) : p1),
        total_price_gbp: p2 != null ? p2 : p1,
        saved_gbp: null,
        section: inUnavailable ? "unavailable" : currentSection,
        status: inUnavailable ? "unavailable" : "purchased",
        substituted_for: null,
      });
    } else if (inUnavailable) {
      // Unavailable items often have no price line; capture as "1 X NAME"
      const um = line.match(/^(\d+)\s*(?:x\s+)?([A-Za-z].{3,})$/);
      if (um) {
        order.items.push({
          qty: parseInt(um[1], 10),
          name: um[2].trim(),
          unit_price_gbp: null,
          total_price_gbp: null,
          saved_gbp: null,
          section: "unavailable",
          status: "unavailable",
          substituted_for: null,
        });
      }
    }
  }

  // Counts
  order.item_count       = order.items.length;
  order.purchased_count  = order.items.filter(i => i.status === "purchased").length;
  order.unavailable_count = order.items.filter(i => i.status === "unavailable").length;

  // Sanity checks
  const lineItemsTotal = order.items
    .filter(i => i.status === "purchased")
    .reduce((s, i) => s + (i.total_price_gbp || 0), 0);
  if (order.total_paid_gbp && lineItemsTotal > 0) {
    const gap = order.total_paid_gbp - lineItemsTotal;
    if (gap > 5 && (gap / order.total_paid_gbp) > 0.15) {
      order.parse_quality = "truncated_likely";
      order.parse_warning = `Line items sum to £${lineItemsTotal.toFixed(2)} but order total is £${order.total_paid_gbp.toFixed(2)} (£${gap.toFixed(2)} gap). Email may be truncated.`;
    }
  }
  if (!order.items.length) {
    order.parse_quality = "no_items_found";
    order.parse_warning = "No line items could be extracted. The receipt format may be unsupported.";
  }
  if (!order.delivery_date) {
    order.parse_quality = order.parse_quality === "ok" ? "missing_date" : order.parse_quality;
    if (!order.parse_warning) order.parse_warning = "Could not extract delivery date — fill it in manually.";
  }

  return order;
}

// Loose Khalil-allergen tagger for receipt-item names.
// Different shape from allergens.js's `khalilAllergenFlag`:
//   - This one is regex-based and takes no config arg
//   - allergens.js version takes the Supabase-fed allergens config
// Used by OrdersView's line-item Khalil column and ReceiptParser's
// allergen-flags summary. Verbatim canonical L2630-2644.
export function ordersKhalilFlag(name) {
  const n = (name || "").toLowerCase();
  if (/(\b|^)(flour|wheat|breadcrumb|panko|seitan|brioche|sourdough|ciabatt|baguette|pitta|naan|roti|chapati|wholemeal)\b/.test(n)) return "wheat";
  if (/\b(pasta|spaghetti|fusilli|penne|fettuccine|orzo|udon|ramen|soba)\b/.test(n) && !n.includes("gluten free") && !n.includes("gluten-free") && !n.includes("free from")) return "wheat";
  if (/\b(bread|buns?)\b/.test(n) && !n.includes("gluten free") && !n.includes("gluten-free") && !n.includes("free from")) return "wheat";
  if (/\b(milk|cheese|cheddar|feta|paneer|cream|butter|yoghurt|yogurt|ricotta|mozzarella|parmesan|boursin)\b/.test(n)
      && !/(coconut milk|almond milk|oat milk|soya milk|peanut butter)/.test(n)
      && !/(butterhead|butternut)/.test(n)) return "dairy";
  if (/\beggs?\b/.test(n)) return "eggs";
  if (/\b(beef|veal)\b/.test(n)) return "beef";
  if (/\b(walnut|pecan|almond|cashew|pistachio|hazelnut|pine nut)s?\b/.test(n)) return "tree nut";
  if (/\b(lentil|chickpea|black bean|kidney bean|cannellini|edamame|broad bean|baked bean|borlotti|haricot|butter bean)\b/.test(n)) return "legume";
  if (/\bavocado\b/.test(n)) return "avocado";
  return null;
}
