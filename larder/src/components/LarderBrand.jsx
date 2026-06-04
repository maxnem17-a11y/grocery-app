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
//   - **Favicon swap re-enabled in 7f-followup.** Originally deferred
//     in 7f-1 (decision A2) because the Vite scaffold's index.html
//     didn't yet carry the favicon `<link>` elements. 7f-followup
//     added them + copied the remaining icon PNGs into
//     `larder/public/icons/`, so the canonical DOM-swap behaviour
//     is now wired through the style-change effect.
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

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, InfoTip } from "./primitives.jsx";
import { daysUntilExpiry } from "../lib/pantry-math.js";

export default function LarderBrand({ pantry, nextDelivery, showHelpBanner, setShowHelpBanner, goToBasket }) {
  // Load saved style on first render. Default to "modern" if nothing saved.
  const [style, setStyle] = useState(() => {
    try { return localStorage.getItem("larder-brand-style") || "modern"; }
    catch { return "modern"; }
  });

  // Persist choice whenever style changes + notify listeners + rewrite
  // favicon <link> hrefs. The favicon swap was re-enabled in 7f-followup
  // (the <link> elements now live in larder/index.html and the icon PNGs
  // in larder/public/icons/ — see canonical L19-21 for the link shape).
  useEffect(() => {
    try { localStorage.setItem("larder-brand-style", style); } catch {}
    // Mirror to <html data-brand-style="..."> so CSS in index.html can scope
    // retro-only rules. The inline boot script in index.html sets this before
    // first paint; this effect keeps it in sync when the user toggles.
    try { document.documentElement.dataset.brandStyle = style; } catch {}
    const t = document.getElementById("favicon-touch");
    const i192 = document.getElementById("favicon-192");
    const i512 = document.getElementById("favicon-512");
    if (t) t.href = `icons/larder-${style}-apple-touch.png`;
    if (i192) i192.href = `icons/larder-${style}-192.png`;
    if (i512) i512.href = `icons/larder-${style}-512.png`;
    // Notify other components (e.g. TabIcon) that the brand style has changed.
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

  // Pantry-fill tooltip figures: in-stock items tracked + how many are
  // expiring within 5 days (matches the "Going soon" rail window).
  const itemsTracked = useMemo(
    () => (pantry || []).filter(p => !p._out_of_stock).length, [pantry]);
  const expiringSoon = useMemo(() => (pantry || []).filter(p => {
    if (p._out_of_stock) return false;
    const d = daysUntilExpiry(p);
    return d !== null && d >= 0 && d <= 5;
  }).length, [pantry]);

  // Preferences popover (style toggle + Help, demoted out of the header).
  const [prefsOpen, setPrefsOpen] = useState(false);
  const prefsRef = useRef(null);
  useEffect(() => {
    if (!prefsOpen) return;
    const onDown = (e) => { if (prefsRef.current && !prefsRef.current.contains(e.target)) setPrefsOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setPrefsOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [prefsOpen]);

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
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <button
              onClick={() => goToBasket && goToBasket()}
              className="pill"
              title="Go to the Basket tab"
            >
              {deliveryLine} →
            </button>
            <span className="flex items-center gap-1.5" title={`Pantry ${fillPct}% full`}>
              <span style={{ display: "inline-block", width: 72 }}><Bar pct={fillPct} /></span>
              <span className="text-xs text-stone-600">{fillPct}%</span>
              <InfoTip>{fillPct}% — {itemsTracked} items tracked · {expiringSoon} expiring soon</InfoTip>
            </span>
          </div>
        </div>
      </div>
      <div className="relative" ref={prefsRef}>
        <button
          onClick={() => setPrefsOpen(o => !o)}
          aria-haspopup="true"
          aria-expanded={prefsOpen}
          aria-label="Preferences"
          className="pill"
          title="Preferences"
        >
          ⚙
        </button>
        {prefsOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-stone-200 bg-white p-2.5 shadow-lg">
            <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">Jar style</div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setStyle("modern")} data-active={style === "modern"}
                      className="pill" title="Clean forest-green jar">modern</button>
              <button onClick={() => setStyle("retro")} data-active={style === "retro"}
                      className="pill" title="16-bit pixel-art jar">retro</button>
            </div>
            {setShowHelpBanner && (
              <button
                onClick={() => { setShowHelpBanner(true); setPrefsOpen(false); }}
                className="pill mt-2.5 w-full"
                title="Reopen the introduction panel"
              >
                ? Help
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
