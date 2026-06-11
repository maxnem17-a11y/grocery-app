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

// Render a PDF's pages to downscaled JPEG images (base64) so they can go
// through the same Claude-vision parser the photo path uses. Replaces the
// brittle in-browser regex parseTesco for PDF receipts: Claude reads the
// rendered page(s) directly. Caps at maxPages to bound payload/cost.
// Returns [{ base64, mediaType }] (base64 is bare, no data: prefix).
export async function pdfToImageBase64s(file, { maxEdge = 1600, maxPages = 5, quality = 0.85 } = {}) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = Math.min(pdf.numPages, maxPages);
  const out = [];
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const longest = Math.max(base.width, base.height) || 1;
    const scale = Math.min(3, maxEdge / longest); // cap upscaling at 3×
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    // White backdrop so transparent PDFs render legibly as JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    out.push({ base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" });
  }
  return out;
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

  // Total paid — "Total: £82.41" / "Order total £…" etc., taking the largest
  // match. `\btotal` keeps us off "Subtotal"; the optional ":" handles the
  // colon-no-space form Tesco's receipt PDF uses ("Total: £82.41").
  const totalMatches = [...text.matchAll(/(?:order\s+total|grand\s+total|\btotal)\b\s*:?\s*£\s*(\d+\.\d{2})/gi)];
  if (totalMatches.length) {
    order.total_paid_gbp = Math.max(...totalMatches.map(m => parseFloat(m[1])));
  } else {
    const allTotals = [...text.matchAll(/£\s*(\d+\.\d{2})/g)].map(m => parseFloat(m[1]));
    if (allTotals.length) {
      // Heuristic: total is usually the largest single £ value on a receipt
      order.total_paid_gbp = Math.max(...allTotals);
    }
  }

  // Saved — explicit "Saved/Savings £X" line if present; otherwise summed from
  // per-item savings further down (Tesco PDFs have no single savings total).
  const savedMatch = text.match(/(?:total\s+saved|you\s+saved|savings?|clubcard\s+price\s+savings?)[:\s]*£?\s*(\d+\.\d{2})/i);
  if (savedMatch) order.total_saved_gbp = parseFloat(savedMatch[1]);

  // Items. The Tesco receipt PDF lays each purchased line out as
  //   "<qty>  <name>  £<unit> £<total>-£<saved>"
  // where (a) every line carries a trailing "-£<saved>", (b) unit+total are
  // sometimes glued ("£9.75£17.54-£1.96"), and (c) long names wrap across
  // 2–3 visual lines (name / pack-size / prices on separate lines). So we
  // accumulate a record across lines and close it the moment a price tail
  // appears. Parsing is gated to the items table (between the "Unit price
  // Total Saved" column header and EOF) so page-1 summary/address/time lines
  // can't be mis-read as items.
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  // Section headers — purchased items are grouped (Fridge / Cupboard / …).
  const sectionMap = [
    [/^fridge\b/i,                 "fridge"],
    [/^freezer\b/i,                "freezer"],
    [/^frozen\b/i,                 "freezer"],
    [/^cupboard\b/i,               "cupboard"],
    [/^fresh\b|^produce\b/i,       "fresh"],
    [/^bakery\b/i,                 "bakery"],
    [/^drinks\b|^beverages\b/i,    "drinks"],
    [/^(?:household|toiletries|health|baby)\b/i, "household"],
  ];

  // Trailing "£unit £total -£saved" block. Unit/saved optional (qty-1 lines
  // show unit==total; some lines have no saving). Handles glued + spaced forms.
  const PRICE_TAIL = /£\s*(\d+\.\d{2})\s*(?:£\s*(\d+\.\d{2}))?\s*(?:-\s*£\s*(\d+\.\d{2}))?\s*$/;
  const isWasNow   = /\bwas\s+£.*\bnow\b/i;  // "Was £4.50, now £4.05" — skip
  const isItemHead = /qty\s*product/i;        // column-header row — skip

  let inItems = false;       // inside the purchased items table
  let una = false;           // inside the "Unavailable" mini-table
  let currentSection = "cupboard";
  let rec = null;            // { qty, parts: [] } accumulator for one item

  const closeRecord = () => {
    if (!rec) return;
    const blob = rec.parts.join(" ").replace(/\s+/g, " ").trim();
    const pm = blob.match(PRICE_TAIL);
    if (pm) {
      const name = blob.slice(0, pm.index).trim();
      if (/[A-Za-z]/.test(name) && !/^(total|subtotal|order|delivery|saved|clubcard)\b/i.test(name)) {
        const unit  = parseFloat(pm[1]);
        const total = pm[2] != null ? parseFloat(pm[2]) : unit;
        order.items.push({
          qty: rec.qty,
          name,
          unit_price_gbp:  unit,
          total_price_gbp: total,
          saved_gbp: pm[3] != null ? parseFloat(pm[3]) : null,
          section: currentSection,
          status: "purchased",
          substituted_for: null,
        });
      }
    }
    rec = null;
  };

  for (const line of lines) {
    // "Unavailable" mini-table opens at a standalone "Unavailable" header and
    // closes when the purchased table's column header arrives. (Avoids the
    // page-1 "0 substitution and 1 items unavailable" summary line.)
    if (/^unavailable$/i.test(line)) { una = true; continue; }
    if (!inItems && /unit\s*price/i.test(line) && /\btotal\b/i.test(line)) {
      inItems = true; una = false; continue;
    }

    if (una) {
      const um = line.match(/^(\d+)\s+(.+?)\s+unavailable\s*$/i);
      if (um && parseInt(um[1], 10) >= 1) {
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
      continue;
    }

    if (!inItems) continue;
    if (isWasNow.test(line) || isItemHead.test(line)) continue;

    // Section header (short standalone line).
    if (line.length < 40) {
      let matched = false;
      for (const [rgx, name] of sectionMap) {
        if (rgx.test(line)) { closeRecord(); currentSection = name; matched = true; break; }
      }
      if (matched) continue;
    }

    // A new item starts with "<qty> <letter|£>"; anything else is a wrapped
    // continuation of the open record (pack size, name overflow, price line).
    const startM = line.match(/^(\d+)\s+(\S.*)$/);
    if (startM && /^[A-Za-z£]/.test(startM[2])) {
      closeRecord();
      rec = { qty: parseInt(startM[1], 10), parts: [startM[2]] };
    } else if (rec) {
      rec.parts.push(line);
    } else {
      continue;
    }
    if (rec && PRICE_TAIL.test(rec.parts.join(" "))) closeRecord();
  }
  closeRecord();

  // Per-item savings sum (when no explicit savings line was found above).
  if (order.total_saved_gbp == null) {
    const savedSum = order.items.reduce((s, i) => s + (i.saved_gbp || 0), 0);
    if (savedSum > 0) order.total_saved_gbp = +savedSum.toFixed(2);
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
