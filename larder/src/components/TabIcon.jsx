// ============================================================
// TabIcon — brand-style-aware icon for each tab in the nav strip
// ============================================================
// Verbatim port of canonical index.html L4977–5345.
//
// Two helpers in one file:
//
//   useBrandStyle()  ← co-located hook (decision B1 in step 7f-3,
//                       canonical pattern). Mirrors the
//                       `larder-brand-style` localStorage value via
//                       the `larder-brand-style-change` CustomEvent
//                       that LarderBrand dispatches whenever the
//                       user toggles the style pills. No prop
//                       drilling — TabIcon subscribes via the
//                       window event listener.
//
//   TabIcon({kind})  ← default export. Renders a 16×16 SVG matching
//                       the current brand style. Modern = forest-
//                       green monoline; retro = pixel-art via
//                       discrete `<rect>` elements (olive bg,
//                       terracotta accents, cream highlights,
//                       dark-brown outline).
//
// All 6 `kind` values are implemented (planner / recipes / pantry /
// gaps / tesco / audit) even though only `pantry` + `audit` are
// reachable from the current tab strip — verbatim canonical port,
// decision C1 in 7f-3. Future view ports (PlannerView, OrdersView,
// etc.) just add their entry to the `tabs` array in App.jsx; the
// matching SVG is already here.
//
// No external image dependencies: every icon is pure inline SVG.
// ============================================================

import { useEffect, useState } from "react";

function useBrandStyle() {
  const [style, setStyle] = useState(() => {
    try { return localStorage.getItem("larder-brand-style") || "modern"; }
    catch { return "modern"; }
  });
  useEffect(() => {
    const onChange = (e) => setStyle(e.detail || "modern");
    window.addEventListener("larder-brand-style-change", onChange);
    return () => window.removeEventListener("larder-brand-style-change", onChange);
  }, []);
  return style;
}

export default function TabIcon({ kind }) {
  const style = useBrandStyle();
  // Modern: monoline SVG, forest #1f4d2c, 16x16, stroke 1.4.
  const modernCommon = {
    width: 16, height: 16, viewBox: "0 0 16 16",
    fill: "none", stroke: "#1f4d2c", strokeWidth: 1.4,
    strokeLinecap: "round", strokeLinejoin: "round",
    xmlns: "http://www.w3.org/2000/svg",
    style: { flexShrink: 0, display: "block" },
    "aria-hidden": "true",
  };
  if (style === "modern") {
    switch (kind) {
      case "planner": // spiral notebook with three list lines
        return (
          <svg {...modernCommon}>
            <rect x="3.5" y="2.5" width="9" height="11" rx="0.8"/>
            <line x1="3.5" y1="5" x2="2" y2="5"/>
            <line x1="3.5" y1="8" x2="2" y2="8"/>
            <line x1="3.5" y1="11" x2="2" y2="11"/>
            <line x1="6" y1="6" x2="11" y2="6"/>
            <line x1="6" y1="8.5" x2="11" y2="8.5"/>
            <line x1="6" y1="11" x2="9" y2="11"/>
          </svg>
        );
      case "recipes": // open book with centre spine
        return (
          <svg {...modernCommon}>
            <path d="M 8 4.5 C 6 3.2 4 3 2.2 3.2 L 2.2 12.5 C 4 12.3 6 12.5 8 13.8"/>
            <path d="M 8 4.5 C 10 3.2 12 3 13.8 3.2 L 13.8 12.5 C 12 12.3 10 12.5 8 13.8"/>
            <line x1="8" y1="4.5" x2="8" y2="13.8"/>
          </svg>
        );
      case "pantry": // mini brand jar
        return (
          <svg {...modernCommon}>
            <rect x="5" y="2.5" width="6" height="1.8" rx="0.4" fill="#1f4d2c"/>
            <path d="M 3.8 5.5 Q 3.8 4.6 4.7 4.6 L 11.3 4.6 Q 12.2 4.6 12.2 5.5 L 12.2 12.5 Q 12.2 13.4 11.3 13.4 L 4.7 13.4 Q 3.8 13.4 3.8 12.5 Z"/>
            <path d="M 3.8 10 L 12.2 10 L 12.2 12.5 Q 12.2 13.4 11.3 13.4 L 4.7 13.4 Q 3.8 13.4 3.8 12.5 Z" fill="#1f4d2c" stroke="none"/>
          </svg>
        );
      case "gaps": // basket with plus
        return (
          <svg {...modernCommon}>
            <path d="M 2.5 7 L 13.5 7 L 12 13 Q 11.8 13.5 11.2 13.5 L 4.8 13.5 Q 4.2 13.5 4 13 Z"/>
            <path d="M 5 7 L 6.5 4 M 11 7 L 9.5 4"/>
            <line x1="10.5" y1="2.5" x2="13.5" y2="2.5"/>
            <line x1="12" y1="1" x2="12" y2="4"/>
          </svg>
        );
      case "tesco": // parcel box with tape cross
        return (
          <svg {...modernCommon}>
            <rect x="2.5" y="4.5" width="11" height="9" rx="0.5"/>
            <line x1="2.5" y1="7.5" x2="13.5" y2="7.5"/>
            <line x1="8" y1="4.5" x2="8" y2="13.5"/>
            <path d="M 5.5 4.5 L 8 2.5 L 10.5 4.5"/>
          </svg>
        );
      case "audit": // three ascending bars
        return (
          <svg {...modernCommon}>
            <rect x="3" y="9.5" width="2.5" height="4" rx="0.3" fill="#1f4d2c" stroke="none"/>
            <rect x="6.75" y="6.5" width="2.5" height="7" rx="0.3" fill="#1f4d2c" stroke="none"/>
            <rect x="10.5" y="3.5" width="2.5" height="10" rx="0.3" fill="#1f4d2c" stroke="none"/>
          </svg>
        );
      default: return null;
    }
  }
  // Retro: 16x16 pixel art icons, palette #b9c660 olive bg / #f0743c terracotta / #3e200c outline / #fcf0c8 cream.
  // Each icon is a 16x16 SVG with viewBox 0 0 16 16 and shape-rendering=crispEdges so pixels stay sharp at 16px display.
  // Rect coordinates and run-length encoding generated from a 16x16 character grid (see chat for the source plans).
  const retroCommon = {
    width: 16, height: 16, viewBox: "0 0 16 16",
    xmlns: "http://www.w3.org/2000/svg",
    shapeRendering: "crispEdges",
    style: { flexShrink: 0, display: "block" },
    "aria-hidden": "true",
  };
  switch (kind) {
    case "planner": // saucepan with steam
      return (
        <svg {...retroCommon}>
          <rect width="16" height="16" fill="#b9c660"/>
          <rect x="4" y="1" width="1" height="1" fill="#3e200c"/>
          <rect x="8" y="1" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="2" width="1" height="1" fill="#3e200c"/>
          <rect x="5" y="2" width="1" height="1" fill="#3e200c"/>
          <rect x="7" y="2" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="2" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="3" width="1" height="1" fill="#3e200c"/>
          <rect x="5" y="3" width="1" height="1" fill="#3e200c"/>
          <rect x="7" y="3" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="7" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="6" width="11" height="1" fill="#3e200c"/>
          <rect x="1" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="7" width="9" height="1" fill="#fcf0c8"/>
          <rect x="11" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="8" width="9" height="1" fill="#f0743c"/>
          <rect x="11" y="8" width="5" height="1" fill="#3e200c"/>
          <rect x="1" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="9" width="9" height="1" fill="#f0743c"/>
          <rect x="11" y="9" width="5" height="1" fill="#3e200c"/>
          <rect x="1" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="10" width="9" height="1" fill="#f0743c"/>
          <rect x="11" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="11" width="9" height="1" fill="#f0743c"/>
          <rect x="11" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="12" width="9" height="1" fill="#3e200c"/>
        </svg>
      );
    case "recipes": // book
      return (
        <svg {...retroCommon}>
          <rect width="16" height="16" fill="#b9c660"/>
          <rect x="2" y="2" width="6" height="1" fill="#3e200c"/>
          <rect x="9" y="2" width="6" height="1" fill="#3e200c"/>
          <rect x="1" y="3" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="3" width="6" height="1" fill="#fcf0c8"/>
          <rect x="8" y="3" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="3" width="6" height="1" fill="#fcf0c8"/>
          <rect x="15" y="3" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="4" width="1" height="1" fill="#fcf0c8"/>
          <rect x="3" y="4" width="3" height="1" fill="#3e200c"/>
          <rect x="6" y="4" width="2" height="1" fill="#fcf0c8"/>
          <rect x="8" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="4" width="2" height="1" fill="#fcf0c8"/>
          <rect x="11" y="4" width="3" height="1" fill="#3e200c"/>
          <rect x="14" y="4" width="1" height="1" fill="#fcf0c8"/>
          <rect x="15" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="5" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="5" width="6" height="1" fill="#fcf0c8"/>
          <rect x="8" y="5" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="5" width="6" height="1" fill="#fcf0c8"/>
          <rect x="15" y="5" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="6" width="1" height="1" fill="#fcf0c8"/>
          <rect x="3" y="6" width="4" height="1" fill="#3e200c"/>
          <rect x="7" y="6" width="1" height="1" fill="#fcf0c8"/>
          <rect x="8" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="6" width="2" height="1" fill="#fcf0c8"/>
          <rect x="11" y="6" width="3" height="1" fill="#3e200c"/>
          <rect x="14" y="6" width="1" height="1" fill="#fcf0c8"/>
          <rect x="15" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="7" width="6" height="1" fill="#fcf0c8"/>
          <rect x="8" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="7" width="6" height="1" fill="#fcf0c8"/>
          <rect x="15" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="8" width="1" height="1" fill="#fcf0c8"/>
          <rect x="3" y="8" width="4" height="1" fill="#3e200c"/>
          <rect x="7" y="8" width="1" height="1" fill="#fcf0c8"/>
          <rect x="8" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="8" width="2" height="1" fill="#fcf0c8"/>
          <rect x="11" y="8" width="3" height="1" fill="#3e200c"/>
          <rect x="14" y="8" width="1" height="1" fill="#fcf0c8"/>
          <rect x="15" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="9" width="6" height="1" fill="#fcf0c8"/>
          <rect x="8" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="9" width="6" height="1" fill="#fcf0c8"/>
          <rect x="15" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="10" width="1" height="1" fill="#fcf0c8"/>
          <rect x="3" y="10" width="4" height="1" fill="#3e200c"/>
          <rect x="7" y="10" width="1" height="1" fill="#fcf0c8"/>
          <rect x="8" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="10" width="2" height="1" fill="#fcf0c8"/>
          <rect x="11" y="10" width="3" height="1" fill="#3e200c"/>
          <rect x="14" y="10" width="1" height="1" fill="#fcf0c8"/>
          <rect x="15" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="11" width="6" height="1" fill="#fcf0c8"/>
          <rect x="8" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="9" y="11" width="6" height="1" fill="#fcf0c8"/>
          <rect x="15" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="12" width="15" height="1" fill="#3e200c"/>
          <rect x="2" y="13" width="13" height="1" fill="#3e200c"/>
        </svg>
      );
    case "pantry": // jar
      return (
        <svg {...retroCommon}>
          <rect width="16" height="16" fill="#b9c660"/>
          <rect x="4" y="1" width="8" height="1" fill="#3e200c"/>
          <rect x="4" y="2" width="8" height="1" fill="#3e200c"/>
          <rect x="3" y="3" width="10" height="1" fill="#3e200c"/>
          <rect x="3" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="4" width="8" height="1" fill="#fcf0c8"/>
          <rect x="12" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="5" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="5" width="8" height="1" fill="#fcf0c8"/>
          <rect x="12" y="5" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="6" width="8" height="1" fill="#fcf0c8"/>
          <rect x="12" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="7" width="8" height="1" fill="#fcf0c8"/>
          <rect x="12" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="8" width="8" height="1" fill="#fcf0c8"/>
          <rect x="12" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="9" width="8" height="1" fill="#f0743c"/>
          <rect x="12" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="10" width="8" height="1" fill="#f0743c"/>
          <rect x="12" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="11" width="8" height="1" fill="#f0743c"/>
          <rect x="12" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="12" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="12" width="8" height="1" fill="#f0743c"/>
          <rect x="12" y="12" width="1" height="1" fill="#3e200c"/>
          <rect x="3" y="13" width="10" height="1" fill="#3e200c"/>
        </svg>
      );
    case "gaps": // basket
      return (
        <svg {...retroCommon}>
          <rect width="16" height="16" fill="#b9c660"/>
          <rect x="6" y="2" width="4" height="1" fill="#3e200c"/>
          <rect x="4" y="3" width="2" height="1" fill="#3e200c"/>
          <rect x="10" y="3" width="2" height="1" fill="#3e200c"/>
          <rect x="3" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="12" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="5" width="1" height="1" fill="#3e200c"/>
          <rect x="13" y="5" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="13" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="7" width="14" height="1" fill="#3e200c"/>
          <rect x="1" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="8" width="12" height="1" fill="#f0743c"/>
          <rect x="14" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="9" width="1" height="1" fill="#f0743c"/>
          <rect x="3" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="4" y="9" width="1" height="1" fill="#f0743c"/>
          <rect x="5" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="6" y="9" width="1" height="1" fill="#f0743c"/>
          <rect x="7" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="8" y="9" width="1" height="1" fill="#f0743c"/>
          <rect x="9" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="10" y="9" width="1" height="1" fill="#f0743c"/>
          <rect x="11" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="12" y="9" width="1" height="1" fill="#f0743c"/>
          <rect x="13" y="9" width="2" height="1" fill="#3e200c"/>
          <rect x="1" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="10" width="12" height="1" fill="#f0743c"/>
          <rect x="14" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="11" width="12" height="1" fill="#f0743c"/>
          <rect x="14" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="12" width="12" height="1" fill="#3e200c"/>
        </svg>
      );
    case "tesco": // parcel
      return (
        <svg {...retroCommon}>
          <rect width="16" height="16" fill="#b9c660"/>
          <rect x="2" y="2" width="12" height="1" fill="#3e200c"/>
          <rect x="1" y="3" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="3" width="3" height="1" fill="#fcf0c8"/>
          <rect x="5" y="3" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="3" width="2" height="1" fill="#fcf0c8"/>
          <rect x="9" y="3" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="3" width="3" height="1" fill="#fcf0c8"/>
          <rect x="14" y="3" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="4" width="3" height="1" fill="#fcf0c8"/>
          <rect x="5" y="4" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="4" width="2" height="1" fill="#fcf0c8"/>
          <rect x="9" y="4" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="4" width="3" height="1" fill="#fcf0c8"/>
          <rect x="14" y="4" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="5" width="14" height="1" fill="#3e200c"/>
          <rect x="1" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="6" width="4" height="1" fill="#fcf0c8"/>
          <rect x="6" y="6" width="4" height="1" fill="#f0743c"/>
          <rect x="10" y="6" width="4" height="1" fill="#fcf0c8"/>
          <rect x="14" y="6" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="7" width="4" height="1" fill="#fcf0c8"/>
          <rect x="6" y="7" width="4" height="1" fill="#f0743c"/>
          <rect x="10" y="7" width="4" height="1" fill="#fcf0c8"/>
          <rect x="14" y="7" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="8" width="4" height="1" fill="#fcf0c8"/>
          <rect x="6" y="8" width="4" height="1" fill="#f0743c"/>
          <rect x="10" y="8" width="4" height="1" fill="#fcf0c8"/>
          <rect x="14" y="8" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="9" width="4" height="1" fill="#fcf0c8"/>
          <rect x="6" y="9" width="4" height="1" fill="#f0743c"/>
          <rect x="10" y="9" width="4" height="1" fill="#fcf0c8"/>
          <rect x="14" y="9" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="10" width="4" height="1" fill="#fcf0c8"/>
          <rect x="6" y="10" width="4" height="1" fill="#f0743c"/>
          <rect x="10" y="10" width="4" height="1" fill="#fcf0c8"/>
          <rect x="14" y="10" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="11" width="4" height="1" fill="#fcf0c8"/>
          <rect x="6" y="11" width="4" height="1" fill="#f0743c"/>
          <rect x="10" y="11" width="4" height="1" fill="#fcf0c8"/>
          <rect x="14" y="11" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="12" width="1" height="1" fill="#3e200c"/>
          <rect x="2" y="12" width="4" height="1" fill="#fcf0c8"/>
          <rect x="6" y="12" width="4" height="1" fill="#f0743c"/>
          <rect x="10" y="12" width="4" height="1" fill="#fcf0c8"/>
          <rect x="14" y="12" width="1" height="1" fill="#3e200c"/>
          <rect x="1" y="13" width="14" height="1" fill="#3e200c"/>
        </svg>
      );
    case "audit": // bars
      return (
        <svg {...retroCommon}>
          <rect width="16" height="16" fill="#b9c660"/>
          <rect x="11" y="1" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="2" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="3" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="4" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="4" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="5" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="5" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="6" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="6" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="7" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="7" width="2" height="1" fill="#f0743c"/>
          <rect x="3" y="8" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="8" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="8" width="2" height="1" fill="#f0743c"/>
          <rect x="3" y="9" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="9" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="9" width="2" height="1" fill="#f0743c"/>
          <rect x="3" y="10" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="10" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="10" width="2" height="1" fill="#f0743c"/>
          <rect x="3" y="11" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="11" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="11" width="2" height="1" fill="#f0743c"/>
          <rect x="3" y="12" width="2" height="1" fill="#f0743c"/>
          <rect x="7" y="12" width="2" height="1" fill="#f0743c"/>
          <rect x="11" y="12" width="2" height="1" fill="#f0743c"/>
          <rect x="1" y="13" width="14" height="1" fill="#3e200c"/>
        </svg>
      );
    default: return null;
  }
}
