// ============================================================
// ReceiptParser — drag-and-drop receipt upload + parse preview + save
// ============================================================
// Verbatim port of canonical index.html L2903–3320. Step 7k.
//
// Two input paths:
//   - .eml: file.text() → POST raw to ingest-receipt with
//           ?dry_run=true → preview from the returned `order`
//           field → Save re-POSTs the same raw text without
//           ?dry_run=true. Server parser is canonical.
//   - .pdf: pdf.js extracts text → parseTesco() in the browser
//           produces the order locally → preview from that.
//           Save POSTs the pre-parsed `order` via the legacy
//           { retailer, order } shape (server parser isn't
//           compatible with pdf.js text output).
//
// Mounted by OrdersView in two positions:
//   1. Empty-state fallback when no orders are loaded yet
//   2. Between the KPI strip and the spend chart, as a primary
//      action affordance
//
// Each mount has its own React state (file selection, save state,
// archive-existence lookup, etc.) — independent instances.
//
// Structural changes vs canonical:
//   - hooks via named import
//   - context destructure: useReceipts() returns { ..., refresh,
//     localAppend } (step 7k absorbed canonical's sister
//     ReceiptsRefreshContext into the main context)
//   - helpers + primitives imported
// ============================================================

import { useCallback, useMemo, useRef, useState } from "react";
import { Chip, KV, Section } from "./primitives.jsx";
import { formatDate } from "../lib/pantry-math.js";
import { ingestReceipt, parseReceiptPhoto } from "../lib/supabase.js";
import { detectRetailer, extractPdfText, imageToDownscaledBase64, ordersKhalilFlag, parseTesco, readEmlText } from "../lib/receipt-parse.js";
import { computeReplenishment } from "../lib/replenishment.js";
import { useReceipts } from "../contexts/ReceiptsContext.jsx";
import ReplenishmentPreview from "./ReplenishmentPreview.jsx";

export default function ReceiptParser({pantry, applyReplenishment}){
  const [status, setStatus]   = useState("idle"); // idle | loading | done | error
  const [parsed, setParsed]   = useState(null);
  const [errorMsg, setError]  = useState(null);
  const [fileName, setFileName] = useState(null);
  const [showJson, setShowJson] = useState(false);
  const [copiedTick, setCopiedTick] = useState(false);
  // Tracks the input path used for the previewed file. The dashboard handles
  // .eml and .pdf differently:
  //   - "eml": file.text() → POST raw to function with ?dry_run=true → preview
  //            from the returned `order` field. Save re-POSTs the same raw text
  //            without ?dry_run=true.
  //   - "pdf": pdf.js extracts text → parseTesco() in the browser produces the
  //            order locally → preview from that. Save POSTs the pre-parsed
  //            `order` via the legacy { retailer, order } shape.
  // PDF text isn't compatible with the server parser (no ` | ` separators),
  // hence the split path. .eml is the canonical path.
  const [inputMode, setInputMode] = useState(null); // "eml" | "pdf" | null
  const [rawEml, setRawEml]       = useState(null); // raw text for the "eml" path; reused on save
  // Archive-existence info from the dry-run lookup. Populated for the .eml path
  // only (PDFs skip dry-run since they're parsed in-browser). Shape:
  //   null              → not yet checked (PDF path, or pre-load)
  //   { exists: false } → not in archive, save will insert
  //   { exists: true, will_replace, existing_id, existing_delivery_date, existing_email_type }
  //                      → in archive; will_replace is true when new payload is
  //                       an amendment AND existing row isn't already the same amendment
  //   { exists: null }  → lookup failed (lookup_error in result); treat as unknown
  const [archiveStatus, setArchiveStatus] = useState(null);
  // Save-to-archive state. Idle until user clicks; transitions to saving →
  // saved / replaced / duplicate / error. Persisted in the component so a
  // successful save stays visible after the parser preview is dismissed via
  // a new file.
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | replaced | duplicate | error
  const [saveResult, setSaveResult] = useState(null); // { receipt_id?, previous_id?, existing_id?, existing_delivery_date?, message? }
  // Once the user clicks Apply or Skip in the replenishment preview, this
  // flips so the preview unmounts. Stays per-file (resets on a new upload).
  const [replenishHandled, setReplenishHandled] = useState(false);
  const { refresh: refreshReceipts, localAppend: localAppendReceipt } = useReceipts();
  const inputRef = useRef(null);
  const cameraRef = useRef(null); // mobile camera capture (photo receipts)

  // Replenishment bucket-up of the parsed receipt against the current
  // pantry. Recomputed whenever either side changes; null when we don't
  // have enough to compute (no parsed order, no delivery date, empty
  // pantry, or no applyReplenishment callback wired). Must sit above any
  // conditional return so hook order is identical across renders.
  const replenishResult = useMemo(() => {
    if (!parsed || !parsed.items || !parsed.delivery_date) return null;
    if (!pantry || pantry.length === 0) return null;
    if (!applyReplenishment) return null;
    return computeReplenishment(parsed.items, pantry, parsed.delivery_date);
  }, [parsed, pantry, applyReplenishment]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setStatus("loading");
    setError(null);
    setParsed(null);
    setFileName(file.name);
    setShowJson(false);
    setSaveState("idle");
    setSaveResult(null);
    setInputMode(null);
    setRawEml(null);
    setArchiveStatus(null);
    setReplenishHandled(false);
    try {
      const lower = file.name.toLowerCase();
      const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf";
      const isEml = lower.endsWith(".eml") || file.type === "message/rfc822";
      const isImage = (file.type || "").startsWith("image/")
        || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(lower);

      if (isImage) {
        // Photo path: downscale on a canvas, POST the base64 to the vision
        // parser (parse-receipt-photo), preview the returned pre-parsed order.
        // Save POSTs that order via the same { retailer, order } path as PDFs.
        let img;
        try {
          img = await imageToDownscaledBase64(file);
        } catch (e) {
          setStatus("error");
          setError(e.message || "Couldn't read that image. HEIC photos may need converting to JPG first.");
          return;
        }
        const result = await parseReceiptPhoto({
          imageBase64: img.base64,
          mediaType: img.mediaType,
          sourceFile: file.name,
        });
        if (result.status !== "parsed" || !result.order) {
          setStatus("error");
          setError(result.code === "vision_unconfigured"
            ? "Photo receipts need a one-time setup: add an ANTHROPIC_API_KEY secret to the Supabase project (Edge Function secrets), then try again."
            : result.code
              ? `${result.code}: ${result.message || "Vision parse failed."}`
              : "Couldn't read the receipt from that photo. Try a clearer, flatter shot.");
          return;
        }
        const order = result.order;
        if (!order.source_file) order.source_file = file.name;
        setParsed(order);
        setInputMode("photo");
        setStatus("done");
        return;
      }

      if (isPdf) {
        // PDF path: extract text via pdf.js, parse in the browser, preview
        // the pre-parsed order. Save will POST the order, not raw text.
        const text = await extractPdfText(file);
        const retailer = detectRetailer(text, file.name);
        if (retailer !== "tesco") {
          setStatus("error");
          setError(retailer
            ? `Detected retailer "${retailer}" — only Tesco is supported in-app right now. Use the grocery-receipt-archive skill in a Claude session for other retailers.`
            : "Couldn't identify the retailer. Only Tesco receipts are currently supported in-app.");
          return;
        }
        const order = parseTesco(text);
        order.source_file = file.name;
        setParsed(order);
        setInputMode("pdf");
        setStatus("done");
        return;
      }

      // .eml path (or unknown extension fallthrough): hand the raw text to
      // the function via dry_run. The function detects/parses server-side.
      const raw = isEml ? await readEmlText(file) : await file.text();

      // Quick local retailer hint — the function will reject non-Tesco eml
      // anyway, but failing here means we don't pay the network round-trip.
      const retailer = detectRetailer(raw, file.name);
      if (retailer && retailer !== "tesco") {
        setStatus("error");
        setError(`Detected retailer "${retailer}" — only Tesco is supported in-app right now. Use the grocery-receipt-archive skill in a Claude session for other retailers.`);
        return;
      }

      const result = await ingestReceipt({
        retailer: "tesco",
        eml: raw,
        dryRun: true,
      });
      if (result.status !== "dry_run") {
        setStatus("error");
        setError(result.code
          ? `${result.code}: ${result.message || "Server parse failed."}`
          : `Server parse failed${result.status ? ` (status: ${result.status})` : ""}.`);
        return;
      }
      const order = result.order || {};
      // The function doesn't set source_file from filename — we know it here.
      if (!order.source_file) order.source_file = file.name;
      setParsed(order);
      setRawEml(raw);
      setInputMode("eml");
      // Derive archive status from the dry-run lookup. The function returns
      // `exists` (true/false/null) plus the existing row's id, delivery_date,
      // and email_type when found. Compute `will_replace` here so the banner
      // logic stays declarative: a save click will replace if the new payload
      // is an amendment AND the existing row isn't already the same amendment.
      if (result.exists === true) {
        const willReplace = order.email_type === "amendment"
          && result.existing_email_type !== "amendment";
        setArchiveStatus({
          exists: true,
          will_replace: willReplace,
          existing_id: result.existing_id,
          existing_delivery_date: result.existing_delivery_date,
          existing_email_type: result.existing_email_type,
        });
      } else if (result.exists === false) {
        setArchiveStatus({ exists: false });
      } else {
        // exists === null/undefined: lookup failed or no order number to check
        setArchiveStatus({ exists: null, lookup_error: result.lookup_error });
      }
      setStatus("done");
    } catch (e) {
      console.error("Receipt parse error", e);
      setStatus("error");
      setError(e.message || "Failed to read the file.");
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const jsonBlob = parsed ? JSON.stringify(parsed, null, 2) : "";

  const copyJson = async () => {
    if (!jsonBlob) return;
    try {
      await navigator.clipboard.writeText(jsonBlob);
      setCopiedTick(true);
      setTimeout(() => setCopiedTick(false), 1800);
    } catch {
      // Fallback: select-and-prompt
      window.prompt("Copy this JSON:", jsonBlob);
    }
  };

  // Save the previewed order to Supabase via the ingest-receipt Edge Function.
  // The function dedupes by (retailer, order_number) and handles the writes
  // atomically — we just POST and react to the response.
  //
  // For .eml inputs, we re-POST the same raw text (no dry_run) so the server
  // parser runs once more and the parsed output is byte-for-byte identical to
  // what we just previewed. For PDF inputs, the raw text isn't usable by the
  // server parser, so we send the pre-parsed `order` instead.
  const saveToArchive = async () => {
    if (!parsed) return;
    setSaveState("saving");
    setSaveResult(null);
    const result = (inputMode === "eml" && rawEml)
      ? await ingestReceipt({ retailer: parsed.retailer || "tesco", eml: rawEml })
      : await ingestReceipt({ retailer: parsed.retailer || "tesco", order: parsed });
    if (result.status === "saved" || result.status === "replaced") {
      setSaveState(result.status);
      setSaveResult(result);
      // Optimistic local-append so the new order appears in OrdersView
      // immediately. Then refetch in the background as a consistency check
      // (refresh will also reconcile the row id and any field the function
      // computed differently from our preview).
      localAppendReceipt(parsed, result.receipt_id);
      refreshReceipts();
    } else if (result.status === "duplicate") {
      setSaveState("duplicate");
      setSaveResult(result);
    } else {
      setSaveState("error");
      setSaveResult(result);
    }
  };

  return <Section title="Add receipt" subtitle="Snap a paper receipt, or add a Tesco .eml / .pdf — then save to the archive"
    collapsible defaultOpen={false}
    tip="Photograph any UK supermarket till receipt (Sainsbury's, Tesco, Waitrose…) and Claude vision reads the items, or drop a Tesco .eml/.pdf. Either way you get a preview with totals + Khalil-allergen flags, can save the order to the archive, and then restock the matching pantry items. The ingest endpoint dedupes, so re-uploading the same receipt is safe.">

    <div onDrop={onDrop} onDragOver={onDragOver}
         className="border-2 border-dashed border-stone-300 rounded-lg p-4 text-center bg-stone-50/50 hover:bg-stone-50 transition-colors">
      <div className="text-sm text-stone-600 mb-2">
        Snap or drop a receipt — <span className="mono">.jpg</span>/<span className="mono">.png</span> photo, or a Tesco <span className="mono">.eml</span>/<span className="mono">.pdf</span>
      </div>
      {/* Camera capture — mobile browsers open the rear camera directly. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
             className="hidden"
             onChange={(e) => handleFile(e.target.files?.[0])} />
      <input ref={inputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.eml,.pdf,message/rfc822,application/pdf"
             className="hidden"
             onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button onClick={() => cameraRef.current?.click()}
                className="px-3 py-1.5 text-sm rounded border border-teal-700 bg-teal-700 text-white hover:bg-teal-800">
          📷 Take photo
        </button>
        <button onClick={() => inputRef.current?.click()}
                className="px-3 py-1.5 text-sm rounded border border-stone-300 bg-white hover:bg-stone-100">
          Choose file…
        </button>
      </div>
      <div className="text-[11px] text-stone-500 mt-2">
        Photos are read by Claude vision (any shop). Tesco .eml parses server-side; .pdf in-browser (loads pdf.js ~1MB).
      </div>
    </div>

    {status === "loading" && (
      <div className="mt-3 text-sm text-stone-500">
        Parsing <span className="mono">{fileName}</span>…
        {inputMode === "photo" || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test((fileName || "").toLowerCase())
          ? <span className="text-stone-400"> reading the photo can take a few seconds.</span>
          : null}
      </div>
    )}

    {status === "error" && (
      <div className="mt-3 text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded px-3 py-2">
        <strong>Couldn't parse {fileName}.</strong> {errorMsg}
      </div>
    )}

    {status === "done" && parsed && (
      <div className="mt-3 space-y-3">
        {parsed.parse_quality !== "ok" && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
            ⚠️ <strong>{parsed.parse_quality.replace(/_/g, " ")}.</strong> {parsed.parse_warning}
          </div>
        )}
        {/* Archive status banner — surfaces what the Save click will do, based on
            the dry-run dedup lookup. Three cases:
              - exists+will_replace: amber, "this will replace the previous version"
              - exists+!will_replace: emerald, "already in archive, nothing to do"
              - exists===null: stone, "could not check archive"
            For new orders (exists===false) we don't render a banner — the default
            assumption is "this is a fresh insert" and the green Save button conveys it.
            Skip entirely for the PDF path (inputMode !== "eml") since dry-run doesn't run. */}
        {inputMode === "eml" && archiveStatus && archiveStatus.exists === true && archiveStatus.will_replace && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
            ⚠️ <strong>This will replace the previous version.</strong>{" "}
            An earlier {archiveStatus.existing_email_type || "receipt"} for order {parsed.order_number} is already in the archive
            (saved {archiveStatus.existing_delivery_date ? formatDate(archiveStatus.existing_delivery_date) : "previously"}).
            Clicking Save will delete it and insert this amendment in its place.
          </div>
        )}
        {inputMode === "eml" && archiveStatus && archiveStatus.exists === true && !archiveStatus.will_replace && (
          <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-3 py-2">
            ✓ <strong>Already in archive.</strong>{" "}
            Order {parsed.order_number} was saved {archiveStatus.existing_delivery_date ? `on ${formatDate(archiveStatus.existing_delivery_date)}` : "previously"}.
            Nothing to do — the preview is for reference only.
          </div>
        )}
        {inputMode === "eml" && archiveStatus && archiveStatus.exists === null && (
          <div className="text-xs bg-stone-100 border border-stone-300 text-stone-700 rounded px-3 py-2">
            Couldn't check archive status{archiveStatus.lookup_error ? ` (${archiveStatus.lookup_error})` : ""}. The Save button will still work — clicking it will return the right result.
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KV label="Date"        value={parsed.delivery_date ? formatDate(parsed.delivery_date) : "—"} sub={parsed.retailer || parsed.email_type || "tesco"}/>
          <KV label="Order #"     value={parsed.order_number || "—"}/>
          <KV label="Total"       value={parsed.total_paid_gbp != null ? `£${parsed.total_paid_gbp.toFixed(2)}` : "—"} sub={parsed.total_saved_gbp ? `saved £${parsed.total_saved_gbp.toFixed(2)}` : null}/>
          <KV label="Items"       value={`${parsed.purchased_count} delivered`} sub={parsed.unavailable_count ? `${parsed.unavailable_count} unavailable` : null}/>
        </div>

        {/* Khalil allergen flags */}
        {(() => {
          const flagged = (parsed.items || [])
            .filter(it => it.status === "purchased")
            .map(it => ({ ...it, _allergen: ordersKhalilFlag(it.name) }))
            .filter(it => it._allergen);
          if (!flagged.length) return null;
          return (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <div className="font-medium text-amber-800 mb-1">⚠️ {flagged.length} Khalil-allergen items in this order:</div>
              <div className="flex flex-wrap gap-1.5">
                {flagged.map((it, i) => (
                  <span key={i} className="chip" title={`Flagged as ${it._allergen}`}>
                    <span className="text-amber-700">{it._allergen}</span>
                    <span className="truncate max-w-[180px]">{it.name}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Items table */}
        <details className="card">
          <summary className="px-3 py-2 text-sm font-medium cursor-pointer select-none">
            ▶ All {parsed.items.length} parsed items
          </summary>
          <div className="px-3 pb-3 text-xs border-t border-stone-100 pt-2 overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-stone-500">
                <th className="text-left py-1 w-8">Qty</th>
                <th className="text-left">Item</th>
                <th className="text-left w-24">Section</th>
                <th className="text-right w-16">£/each</th>
                <th className="text-right w-16">Total</th>
                <th className="text-center w-16">Status</th>
                <th className="text-center w-16">Khalil</th>
              </tr></thead>
              <tbody>{parsed.items.map((it, i) => {
                const k = ordersKhalilFlag(it.name);
                return <tr key={i} className="border-t border-stone-100">
                  <td className="py-1 mono">{it.qty}</td>
                  <td>{it.name}</td>
                  <td className="text-stone-500">{it.section || "—"}</td>
                  <td className="text-right mono">{it.unit_price_gbp != null ? `£${it.unit_price_gbp.toFixed(2)}` : "—"}</td>
                  <td className="text-right mono">{it.total_price_gbp != null ? `£${it.total_price_gbp.toFixed(2)}` : "—"}</td>
                  <td className="text-center">{it.status === "unavailable" ? <Chip tone="danger">unavail</Chip> : <span className="text-stone-400">·</span>}</td>
                  <td className="text-center">{k ? <Chip tone="warn">{k}</Chip> : <span className="text-emerald-600">✓</span>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </details>

        {/* Save to archive — primary action */}
        <div className="card p-3 bg-stone-50">
          <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
            <div className="text-sm font-medium">Save to archive</div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={saveToArchive}
                      disabled={
                        saveState === "saving"
                        || saveState === "saved"
                        || saveState === "replaced"
                        || saveState === "duplicate"
                        || parsed.parse_quality === "no_items_found"
                        // New in 2026-05-15.4: dry-run dedup told us this order
                        // is already in the archive and a save click won't be
                        // a replace — so the click would be a guaranteed no-op
                        // (function would return `duplicate`). Disable rather
                        // than let users click a button documented as inert.
                        || (inputMode === "eml" && archiveStatus && archiveStatus.exists === true && !archiveStatus.will_replace)
                      }
                      title={
                        parsed.parse_quality === "no_items_found"
                          ? "Can't save — no items were extracted. Try a different copy of the receipt."
                        : (inputMode === "eml" && archiveStatus && archiveStatus.exists === true && !archiveStatus.will_replace)
                          ? "Already in archive — nothing to save."
                        : (inputMode === "eml" && archiveStatus && archiveStatus.exists === true && archiveStatus.will_replace)
                          ? "This will replace the previous version of this order."
                        : "Save this order directly to Supabase via the ingest-receipt Edge Function"
                      }
                      className={"text-xs px-3 py-1 rounded border " +
                        (saveState === "saved" || saveState === "replaced"
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : saveState === "duplicate"
                          ? "border-amber-700 bg-amber-50 text-amber-800"
                          : saveState === "error"
                          ? "border-rose-700 bg-rose-50 text-rose-800"
                          : saveState === "saving"
                          ? "border-stone-400 bg-stone-200 text-stone-600 cursor-wait"
                          : (inputMode === "eml" && archiveStatus && archiveStatus.exists === true && archiveStatus.will_replace)
                          ? "border-amber-700 bg-amber-600 text-white hover:bg-amber-700"
                          : "border-teal-700 bg-teal-700 text-white hover:bg-teal-800") +
                        ((parsed.parse_quality === "no_items_found"
                          || (inputMode === "eml" && archiveStatus && archiveStatus.exists === true && !archiveStatus.will_replace))
                          ? " opacity-50 cursor-not-allowed" : "")}>
                {saveState === "saving"    ? "Saving…"
                 : saveState === "saved"   ? "✓ Saved to archive"
                 : saveState === "replaced" ? "✓ Replaced (amendment)"
                 : saveState === "duplicate" ? "Already in archive"
                 : saveState === "error"   ? "Save failed — retry"
                 : (inputMode === "eml" && archiveStatus && archiveStatus.exists === true && !archiveStatus.will_replace)
                   ? "Already in archive"
                 : (inputMode === "eml" && archiveStatus && archiveStatus.exists === true && archiveStatus.will_replace)
                   ? "💾 Save (replace previous)"
                 : "💾 Save to archive"}
              </button>
              <button onClick={() => setShowJson(s => !s)}
                      className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100">
                {showJson ? "Hide JSON" : "Show JSON"}
              </button>
              <button onClick={copyJson}
                      title="Copy the order JSON to clipboard (useful for skill-based backfill or debugging)"
                      className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100">
                {copiedTick ? "Copied ✓" : "📋 Copy"}
              </button>
            </div>
          </div>

          {/* Save result feedback */}
          {saveState === "saved" && saveResult && (
            <div className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-2 py-1.5 mt-1">
              Inserted {saveResult.items_inserted ?? 0} line items. The order is now in the history below.
            </div>
          )}
          {saveState === "replaced" && saveResult && (
            <div className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-2 py-1.5 mt-1">
              Replaced the previous version of this order with the amendment ({saveResult.items_inserted ?? 0} line items). The old row has been deleted.
            </div>
          )}
          {saveState === "duplicate" && saveResult && (
            <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1.5 mt-1">
              This order is already in the archive (saved {saveResult.existing_delivery_date ? formatDate(saveResult.existing_delivery_date) : "previously"}). Nothing was changed.
            </div>
          )}
          {saveState === "error" && saveResult && (
            <div className="text-[11px] bg-rose-50 border border-rose-200 text-rose-800 rounded px-2 py-1.5 mt-1">
              <strong>{saveResult.code || "error"}:</strong> {saveResult.message || "Unknown failure."} {saveResult.code === "network" && "Check your connection and try again."}
            </div>
          )}

          {showJson && (
            <pre className="text-[10px] mono bg-white border border-stone-200 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap mt-2">{jsonBlob}</pre>
          )}
        </div>

        {/* Replenishment preview — surface after any successful save path
            (saved / replaced / duplicate). Duplicate still gets the preview so
            historical orders that never replenished can be reconciled by
            re-uploading the same receipt. Hides once the user clicks Apply
            or Skip; resets when a new file is uploaded. */}
        {replenishResult
         && (saveState === "saved" || saveState === "replaced" || saveState === "duplicate")
         && !replenishHandled
         && (replenishResult.matched.length || replenishResult.ambiguous.length || replenishResult.unmatched.length) > 0
         && (
          <ReplenishmentPreview
            result={replenishResult}
            deliveryDate={parsed.delivery_date}
            onApply={async (rows) => {
              await applyReplenishment(rows, parsed.delivery_date);
              setReplenishHandled(true);
            }}
            onCancel={() => setReplenishHandled(true)}
          />
        )}
      </div>
    )}
  </Section>;
}
