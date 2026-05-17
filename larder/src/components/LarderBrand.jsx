// ============================================================
// LarderBrand — top-of-page brand block + style toggle
// ============================================================
// Verbatim port of canonical index.html L4824–4960. The jar SVG
// fills/empties based on weighted pantry confidence (fresh items
// ≤14 days count double). On delivery day the modern jar's lid
// turns brass; the retro jar's lid stays pixel-art.
//
// Structural deviations vs canonical (no behaviour change):
//   - hooks imported by name
//   - `export default function`
//   - **A2 (favicon swap omitted in step 7f-1)** — canonical
//     also rewrites the `href` on `#favicon-touch`, `#favicon-192`,
//     and `#favicon-512` in document.head when the style changes.
//     The Vite scaffold's `larder/index.html` doesn't carry those
//     `<link>` elements yet, so the DOM lookups are skipped. See
//     TODO inside the useEffect below; restore alongside the
//     icon-file plumbing in a follow-up step.
//
// Props:
//   pantry              — array of mapped pantry rows; drives fillPct
//   nextDelivery        — { date: "YYYY-MM-DD" | null, ... } from
//                         suggestNextDelivery(receipts)
//   showHelpBanner      — boolean (optional; D2 in 7f-1: caller passes
//                         undefined/false until HelpBanner is ported)
//   setShowHelpBanner   — setter (optional; the ? Help button only
//                         renders when this is truthy AND
//                         !showHelpBanner)
// ============================================================

import { useEffect, useMemo, useState } from "react";

export default function LarderBrand({ pantry, nextDelivery, showHelpBanner, setShowHelpBanner }) {
  // Load saved style on first render. Default to "modern" if nothing saved.
  const [style, setStyle] = useState(() => {
    try { return localStorage.getItem("larder-brand-style") || "modern"; }
    catch { return "modern"; }
  });

  // Persist choice whenever style changes + notify listeners.
  //
  // TODO(7f-followup): favicon <link> swap. Canonical also rewrites
  // the href on #favicon-touch / #favicon-192 / #favicon-512 in
  // document.head. Vite's larder/index.html lacks those <link>
  // elements (decision A2 in step 7f-1); the icon PNGs at the
  // canonical repo's icons/ folder also need to be served by Vite.
  // Restore the DOM lookups here when both pieces land.
  useEffect(() => {
    try { localStorage.setItem("larder-brand-style", style); } catch {}
    // Notify other components (e.g. TabIcon, when ported in 7f-3) that the brand style has changed.
    try { window.dispatchEvent(new CustomEvent("larder-brand-style-change", { detail: style })); } catch {}
  }, [style]);

  // Weighted average confidence — fresh items count double.
  const fillPct = useMemo(() => {
    if (!pantry || pantry.length === 0) return 50;
    const today = new Date();
    let totalWeight = 0;
    let weightedConf = 0;
    for (const item of pantry) {
      if (!item || item.confidence == null) continue;
      const exp = item.expires ? new Date(item.expires + "T12:00:00Z") : null;
      const daysToExp = exp ? (exp - today) / (1000*60*60*24) : 365;
      const isFresh = daysToExp <= 14 && daysToExp >= 0;
      const weight = isFresh ? 2 : 1;
      totalWeight += weight;
      weightedConf += item.confidence * weight;
    }
    if (totalWeight === 0) return 50;
    return Math.round(weightedConf / totalWeight);
  }, [pantry]);

  // Days to next delivery — used to brass the lid on delivery day.
  const daysToDelivery = useMemo(() => {
    if (!nextDelivery || !nextDelivery.date) return null;
    const delivery = new Date(nextDelivery.date + "T12:00:00Z");
    const today = new Date();
    return Math.round((delivery - today) / (1000*60*60*24));
  }, [nextDelivery]);
  const isDeliveryToday = daysToDelivery === 0;

  // --- Modern jar SVG: body fill clipped to jar shape ---
  const renderModernJar = () => {
    const innerTop = 12, innerBottom = 31;
    const innerH = innerBottom - innerTop;
    const fillH = (fillPct / 100) * innerH;
    const fillY = innerBottom - fillH;
    const lidColor = isDeliveryToday ? "#b89455" : "#1f4d2c";
    return (
      <svg width="44" height="56" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg"
           aria-label={`Pantry at ${fillPct}%`}>
        <defs>
          <clipPath id="larder-jar-clip">
            <path d="M 3 9 Q 3 6 6 6 L 22 6 Q 25 6 25 9 L 25 28 Q 25 31 22 31 L 6 31 Q 3 31 3 28 Z"/>
          </clipPath>
        </defs>
        <rect x="6" y="0" width="16" height="5" rx="1.5" fill={lidColor}/>
        <path d="M 3 9 Q 3 6 6 6 L 22 6 Q 25 6 25 9 L 25 28 Q 25 31 22 31 L 6 31 Q 3 31 3 28 Z"
              fill="none" stroke="#1f4d2c" strokeWidth="1.2"/>
        <rect x="2" y={fillY} width="25" height={fillH}
              fill="#1f4d2c" clipPath="url(#larder-jar-clip)"/>
      </svg>
    );
  };

  // --- Retro pixel-art jar: cream overlay covers the "emptied" portion ---
  // The retro PNG can't be repainted, so we drop a coloured div over the top
  // of the jar interior proportional to how empty the pantry is. Olive colour
  // matches the retro icon's background so the mask blends in.
  const renderRetroJar = () => {
    const emptyPct = 100 - fillPct;
    const bodyTopPx = 19;  // top of jar body within the 56px-tall scaled image
    const bodyHPx = 30;    // height of jar body
    const maskHPx = (emptyPct / 100) * bodyHPx;
    return (
      <div style={{ position: "relative", width: 44, height: 56, flexShrink: 0 }}>
        <img src="icons/larder-retro-192.png" alt={`Pantry at ${fillPct}%`}
             width="44" height="56"
             style={{ imageRendering: "pixelated", display: "block" }}/>
        {maskHPx > 0 && (
          <div style={{
            position: "absolute",
            left: "29%", right: "29%",
            top: `${bodyTopPx}px`,
            height: `${maskHPx}px`,
            background: "#b9c660",
            pointerEvents: "none",
          }}/>
        )}
      </div>
    );
  };

  // Delivery subtitle
  let deliveryLine;
  if (daysToDelivery === null) deliveryLine = "No upcoming delivery";
  else if (isDeliveryToday) deliveryLine = "Delivery today";
  else if (daysToDelivery === 1) deliveryLine = "Delivery tomorrow";
  else if (daysToDelivery > 0) deliveryLine = `Delivery in ${daysToDelivery} days`;
  else deliveryLine = "Delivery overdue";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-stone-200">
      <div className="flex items-center gap-3">
        {style === "modern" ? renderModernJar() : renderRetroJar()}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight leading-none"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.02em" }}>
            Larder
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            {deliveryLine} · pantry {fillPct}% full
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-stone-400 mono" style={{ fontSize: "10px", letterSpacing: "1px" }}>STYLE</span>
        <button onClick={() => setStyle("modern")} data-active={style === "modern"}
                className="pill" title="Clean forest-green jar">modern</button>
        <button onClick={() => setStyle("retro")} data-active={style === "retro"}
                className="pill" title="16-bit pixel-art jar">retro</button>
        {setShowHelpBanner && !showHelpBanner && <button onClick={() => setShowHelpBanner(true)} className="pill ml-1" title="Reopen the introduction panel">? Help</button>}
      </div>
    </div>
  );
}
