// ============================================================
// RecipeMicroList — collapsible grid of recipe cards
// ============================================================
// Verbatim port of canonical index.html L2341–2399.
// EaterTile (canonical L1827–1838) was originally co-located here
// in step 7g; promoted to a primitive in step 7i when RecipesView
// became the second consumer.
//
// Each item is a decorated recipe (`r._make`, `r._flags`,
// `r._audience` — see PlannerView's decorated useMemo). Clicking
// a card expands it to show in-pantry / missing ingredient lists,
// per-eater status tiles, optional notes, and the source link/
// citation. Only one card open at a time per list.
//
// Caller decides the items (Planner gives top-6 slices by
// makeability / protein / quickness). The expanded card spans
// the full row width regardless of grid breakpoint.
// ============================================================

import { useState } from "react";
import { AudienceTag, Chip, EaterTile } from "./primitives.jsx";

export default function RecipeMicroList({ items }) {
  const [expanded, setExpanded] = useState(null);
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
    {items.map(r => {
      const total = (r.prep_time_mins || 0) + (r.cook_time_mins || 0);
      const open = expanded === r.id;
      const sourceLabel = r.source && r.source.type === "book"
        ? `${r.source.title || "Book"}${r.source.page ? ` p.${r.source.page}` : ""}`
        : (r._source_file || "");
      return <div key={r.id} className={"card text-sm " + (open ? "sm:col-span-2 lg:col-span-3" : "")}>
        <div role="button" tabIndex={0}
             onClick={(e) => { if (e.target.closest('button,a')) return; setExpanded(open ? null : r.id); }}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(open ? null : r.id); } }}
             className="px-3 py-2.5 cursor-pointer select-none">
          <div className="font-medium leading-tight flex items-start justify-between gap-2">
            <span>{r.name}</span>
            <span className="text-xs text-stone-400 shrink-0">{open ? '▲' : '▼'}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <AudienceTag a={r._audience}/>
            <Chip tone="neutral">{r._make.pct}% have</Chip>
            {total > 0 && <Chip tone="neutral">{total}m</Chip>}
            {r.protein_per_serving_g != null && <Chip tone={r.protein_per_serving_g >= 30 ? "ok" : "neutral"}>{r.protein_per_serving_g}g</Chip>}
          </div>
        </div>
        {open && <div className="px-3 pb-3 grid sm:grid-cols-2 gap-3 text-xs border-t border-stone-100 pt-3">
          <div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">In pantry ({r._make.have.length})</div>
            <ul className="space-y-0.5">
              {r._make.have.map((i, k) => <li key={k} className="text-emerald-700">✓ {i.item}</li>)}
              {!r._make.have.length && <li className="text-stone-400">none</li>}
            </ul>
          </div>
          <div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Missing ({r._make.missing.length})</div>
            <ul className="space-y-0.5">
              {r._make.missing.map((i, k) => <li key={k} className="text-stone-700">○ {i.item}{i.qty ? ` — ${i.qty}${i.unit || ""}` : ""}</li>)}
              {!r._make.missing.length && <li className="text-emerald-700">fully stocked</li>}
            </ul>
          </div>
          <div className="sm:col-span-2 grid sm:grid-cols-3 gap-2">
            <EaterTile name="Khalil" status={r._flags.khalil} reasons={r._flags.khalilReason} uncertain={r._flags.khalilUncertain}/>
            <EaterTile name="Max" status={r._flags.max} reasons={r._flags.maxReason}/>
            <EaterTile name="Emily" status={r._flags.emily} reasons={r._flags.emilyReason}/>
          </div>
          {r.notes && <div className="sm:col-span-2 text-stone-600 bg-stone-50 rounded-lg px-2 py-1.5">📝 {r.notes}</div>}
          {r.source && <div className="sm:col-span-2 text-stone-600">
            {r.source.url
              ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{r.source.title || r.source.url} →</a>
              : <>📖 {r.source.title}{r.source.page ? `, p.${r.source.page}` : ""}{r.source.author ? ` · ${r.source.author}` : ""}</>
            }
          </div>}
          {sourceLabel && !r.source && <div className="sm:col-span-2 text-stone-500">{sourceLabel}</div>}
        </div>}
      </div>;
    })}
    {!items.length && <div className="text-sm text-stone-500 col-span-full">Nothing matching right now.</div>}
  </div>;
}
