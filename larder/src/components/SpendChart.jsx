// ============================================================
// SpendChart — per-order + timeline spend visualisation
// ============================================================
// Verbatim port of canonical index.html L2483–2620. Step 7k.
//
// Two view modes:
//   "per-order" — one evenly-spaced bar per delivery; relative
//                 order sizes side-by-side without large gaps
//                 eating screen width.
//   "timeline"  — bars positioned on a real date axis; gaps
//                 between orders visible as empty stretches.
//                 Useful for spotting long lapses (e.g. the
//                 2-month break between Jul and Oct 2025).
//
// Toggle defaults to "per-order" to preserve the previous look.
// Pure inline SVG, no chart-lib dependency.
//
// Props:
//   orders — array of mapped receipt rows (each with
//            delivery_date + total_paid_gbp + purchased_count |
//            item_count). Comes from OrdersView's `orders` const.
// ============================================================

import { useState } from "react";
import { formatDate } from "../lib/pantry-math.js";

export default function SpendChart({orders}){
  const [mode, setMode] = useState("per-order");
  if (!orders.length) return null;

  const Toggle = () => (
    <div className="flex items-center gap-1 text-xs mb-2">
      <span className="text-stone-500 mr-1">View:</span>
      {[
        ["per-order", "Per order", "One bar per delivery, evenly spaced"],
        ["timeline",  "Timeline",  "Bars on a real date axis — gaps between orders are visible"],
      ].map(([key, label, tip]) => (
        <button key={key}
          onClick={() => setMode(key)}
          title={tip}
          className={"px-2 py-0.5 rounded border text-xs " +
            (mode === key
              ? "bg-teal-700 text-white border-teal-700"
              : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50")}>
          {label}
        </button>
      ))}
    </div>
  );

  if (mode === "per-order") {
    const max = Math.max(...orders.map(o=>o.total_paid_gbp||0), 1);
    const w = 600, h = 160, pad = 30, barGap = 4;
    const bw = Math.max(8, (w - pad*2 - barGap*(orders.length-1)) / orders.length);
    return <div>
      <Toggle/>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h+30}`} className="w-full" style={{minWidth: orders.length*14}}>
          {orders.map((o,i)=>{
            const v = o.total_paid_gbp||0;
            const bh = (v/max) * (h - pad);
            const x = pad + i*(bw+barGap);
            const y = h - bh;
            return <g key={i}>
              <rect x={x} y={y} width={bw} height={bh} fill="#0f766e" opacity="0.85">
                <title>{`${formatDate(o.delivery_date)}: £${v.toFixed(2)} · ${o.purchased_count||o.item_count||0} items`}</title>
              </rect>
              <text x={x+bw/2} y={y-3} textAnchor="middle" fontSize="9" fill="#44403c">£{Math.round(v)}</text>
              <text x={x+bw/2} y={h+12} textAnchor="middle" fontSize="8" fill="#a8a29e">{(o.delivery_date||"").slice(5)}</text>
            </g>;
          })}
          <line x1={pad} y1={h} x2={w-pad} y2={h} stroke="#d6d3d1" strokeWidth="1"/>
        </svg>
      </div>
    </div>;
  }

  // ---- Timeline mode ----
  // Position each bar by its delivery_date on a continuous time axis.
  // Gaps between distant orders show as empty white space; gaps >45d are
  // shaded amber as a visual cue. Month tick labels along the bottom edge.
  const dated = orders
    .map(o => ({...o, _t: Date.parse(o.delivery_date)}))
    .filter(o => !isNaN(o._t))
    .sort((a,b) => a._t - b._t);
  if (!dated.length) {
    return <div>
      <Toggle/>
      <div className="text-xs text-stone-500">No dated orders to plot on a timeline.</div>
    </div>;
  }
  const tlMax  = Math.max(...dated.map(o => o.total_paid_gbp||0), 1);
  const tMin   = dated[0]._t;
  const tMax   = dated[dated.length-1]._t;
  const w = 720, h = 160, pad = 30;
  const span = Math.max(tMax - tMin, 24*3600*1000); // avoid divide-by-zero
  const xOf = t => pad + ((t - tMin) / span) * (w - pad*2);

  // Month tick lines between tMin and tMax inclusive.
  const ticks = [];
  const d = new Date(tMin);
  d.setUTCDate(1);
  d.setUTCHours(0,0,0,0);
  while (d.getTime() <= tMax) {
    if (d.getTime() >= tMin) ticks.push(new Date(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }

  // Gaps >45 days between consecutive orders.
  const gaps = [];
  for (let i = 1; i < dated.length; i++) {
    const gapDays = (dated[i]._t - dated[i-1]._t) / 86400000;
    if (gapDays > 45) {
      gaps.push({ x1: xOf(dated[i-1]._t), x2: xOf(dated[i]._t), days: Math.round(gapDays) });
    }
  }

  const barW = 9;
  return <div>
    <Toggle/>
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h+40}`} className="w-full" style={{minWidth: 500}}>
        {/* Gap shading */}
        {gaps.map((g, i) => (
          <g key={`gap${i}`}>
            <rect x={g.x1+barW/2} y={pad/2} width={Math.max(0, g.x2-g.x1-barW)} height={h-pad/2}
                  fill="#fef3c7" opacity="0.55"/>
            <text x={(g.x1+g.x2)/2} y={pad/2+10} textAnchor="middle" fontSize="8" fill="#92400e">
              {g.days}d gap
            </text>
          </g>
        ))}
        {/* Month ticks */}
        {ticks.map((t, i) => {
          const x = xOf(t.getTime());
          const label = t.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
          return <g key={`tick${i}`}>
            <line x1={x} y1={h} x2={x} y2={h+3} stroke="#d6d3d1" strokeWidth="1"/>
            <text x={x} y={h+13} textAnchor="middle" fontSize="8" fill="#a8a29e">{label}</text>
          </g>;
        })}
        {/* Baseline */}
        <line x1={pad} y1={h} x2={w-pad} y2={h} stroke="#d6d3d1" strokeWidth="1"/>
        {/* Bars */}
        {dated.map((o, i) => {
          const v = o.total_paid_gbp || 0;
          const bh = (v/tlMax) * (h - pad);
          const x = xOf(o._t) - barW/2;
          const y = h - bh;
          return <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} fill="#0f766e" opacity="0.85">
              <title>{`${formatDate(o.delivery_date)}: £${v.toFixed(2)} · ${o.purchased_count||o.item_count||0} items`}</title>
            </rect>
            <text x={x+barW/2} y={y-3} textAnchor="middle" fontSize="8" fill="#44403c">£{Math.round(v)}</text>
          </g>;
        })}
      </svg>
    </div>
    <div className="text-[10px] text-stone-500 mt-1">
      Bars sit on a true date axis. Amber bands mark gaps longer than 45 days between deliveries.
    </div>
  </div>;
}
