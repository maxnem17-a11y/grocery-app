# Grocery Intelligence — Project README

*Single-user, single-household grocery operating system for a London family with complex dietary requirements. This README documents the system as it stands. For deeper product-strategy context see `grocery-intelligence-product-audit.md`. For credentials and rotation see `CREDENTIALS.md`.*

*Last updated: 2026-05-15 · current build: `index-1-1-9.html` · changelog version `2026-05-15.2`.*

---

## 1. The household

Three eaters with distinct constraints. These drive every meal, basket, and recipe decision in the system.

| Eater | Profile | Key constraints |
|---|---|---|
| **Max** | Pescatarian adult, Muay Thai 3×/week, building toward weight training | Target ≥45g protein/serving (1.8–2g/kg at 75kg). No meat. Fish, seafood, eggs, dairy all fine. |
| **Emily** | No-pork omnivore | Eats fish, chicken, beef, etc. No pork or pork derivatives. |
| **Khalil** (age 2) | Multi-allergen toddler | **Blocked:** eggs, dairy (all forms), wheat (all forms), lentils, peas (all forms incl. mangetout/sugar-snap), chickpeas, avocado, beef, all beans, all tree nuts. **Peanuts are safe.** Soy sauce often contains wheat — flag, use tamari. Oat milk may contain gluten — flag as uncertain. |

**Whole-household meals** must contain none of Khalil's blocked items. **Adults-only meals** flag clearly which allergen is present.

Note: nobody in the household drinks dairy milk. Defaults for plant milks are oat milk and soya milk.

---

## 2. System architecture

The system has two halves that communicate via Supabase:

```
┌─────────────────────────────────┐         ┌──────────────────────────────────┐
│   Claude assistant              │         │   Static React dashboard          │
│   (system prompt + skills)      │         │   index-1-1-9.html                │
│                                 │         │                                   │
│   - parses receipts (.eml)      │         │   - read-mostly view              │
│   - applies confidence decay    │         │   - pantry edits (toggle, qty)    │
│   - suggests meals              │         │   - cooked-log writes             │
│   - manages JSON state          │         │   - receipt parser + Save         │
└────────────┬────────────────────┘         └─────────────┬────────────────────┘
             │                                            │
             │              ┌──────────────────┐          │
             └─────────────►│   Supabase       │◄─────────┘
                            │   (Postgres)     │
                            │                  │
                            │   - pantry_items │
                            │   - recipes      │
                            │   - receipts     │
                            │   - cooked_log   │
                            │   - allergens    │
                            │   - tesco_skus   │
                            └────────┬─────────┘
                                     │
                                     │ writes via
                                     ▼
                            ┌──────────────────┐
                            │  Edge Function   │
                            │  ingest-receipt  │  (thin write API,
                            │                  │   dedup, multi-retailer)
                            └──────────────────┘
```

**Source of truth:** Supabase Postgres. Both halves read from it, both halves can write to it (dashboard writes pantry edits + cooked-log + receipts via the Edge Function; Claude writes via the Python skill for backfill).

**Single user:** Max. Every UX decision assumes one operator who already knows the system.

---

## 3. Supabase project

- **Project ref:** `odevqzgdwwqgryybgbyf`
- **Region:** eu-west-1
- **Postgres:** 17.6.1.121
- **Dashboard:** https://supabase.com/dashboard/project/odevqzgdwwqgryybgbyf

### Tables

| Table | Rows | RLS | Purpose |
|---|---|---|---|
| `pantry_items` | 86 | enabled (open) | Current pantry state; out-of-stock + qty_adjustment columns sync from dashboard. |
| `receipts` | 13 | enabled (open) | Tesco delivery history. New rows added via `ingest-receipt` Edge Function. |
| `receipt_items` | 465 | enabled (open) | Line items per receipt; linked via `receipt_id`. |
| `recipes` | 178 | **disabled** ⚠️ | Recipe library with audience + eater tags. |
| `cooked_log` | 0 | enabled | Records when a recipe was cooked. Writes from dashboard. |
| `household_allergens` | 132 | enabled (read) | Allergen tokens per eater; powers Khalil-safety flagging. |
| `tesco_skus` | 40 | **disabled** ⚠️ | Tesco SKU index for basket auto-fill. |

**RLS advisory:** `recipes` and `tesco_skus` have RLS disabled. Not blocking, but flagged. Fix is `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus an appropriate read policy.

### Indexes worth knowing about

- `receipts_retailer_order_number_uniq` — unique partial index on `(retailer, order_number)` where `order_number IS NOT NULL`. Enforces dedup at DB level; the `ingest-receipt` function also dedupes in app code as defense in depth.
- `receipts_source_order_number_unique` — older unique index on `(source, order_number)`. Pre-existing, harmless, but `(retailer, order_number)` is the canonical key going forward.

---

## 4. Edge Function: `ingest-receipt`

Single canonical HTTP write API for the receipts archive. Deployed at:

```
https://odevqzgdwwqgryybgbyf.supabase.co/functions/v1/ingest-receipt
```

**What it does:** validates an incoming order payload, dedupes by `(retailer, order_number)`, inserts the receipt header + line items atomically. Returns one of `saved` / `duplicate` / `error`.

**What it does NOT do:** parse receipts. Parsers live wherever makes sense per caller:

- **Dashboard:** in-browser JS parser (`parseTesco` in `index-1-1-9.html`) — instant preview
- **Claude session:** Python `grocery-receipt-archive` skill — used for historical backfill of `.eml` files
- **Future email webhook (if ever built):** server-side TS parser inside or alongside the function

All three call the same function for the actual write. Multi-retailer extension is purely additive: drop in a new parser, add the retailer slug to the function's `ALLOWED_RETAILERS` set.

**Allowlist:** `tesco`, `ocado`, `sainsburys`, `waitrose`. Only Tesco has a working parser in the dashboard today.

**Auth:** two layers — see `CREDENTIALS.md`.

**Logs:** https://supabase.com/dashboard/project/odevqzgdwwqgryybgbyf/functions/ingest-receipt/logs

### Response shapes

```json
// Saved
{ "status": "saved", "receipt_id": "uuid", "items_inserted": 27 }

// Duplicate (already in archive)
{ "status": "duplicate", "existing_id": "uuid", "existing_delivery_date": "2026-05-11" }

// Error
{ "status": "error", "code": "unsupported_retailer | invalid_order | bad_json | unauthorized | insert_failed | items_insert_failed | network", "message": "..." }
```

---

## 5. Weekly workflow

### Session start (Monday, ~5 min)
1. Open a new Claude chat in this project
2. Paste the pantry state JSON from last session (or rely on Supabase being canonical)
3. State what was cooked since last session — Claude applies confidence decay, reduces quantities, flags expiring items

### Pre-shop planning (~5 min)
- Ask for a meal plan for the week
- Claude suggests 5–7 meals prioritising expiring items and pantry overlap
- Each meal tagged ✅ (whole household), 👨‍👩‍ (adults only), or ⚠️ (check)
- Protein target flagged per meal (≥45g for adult, ≥20g for whole household)

### Receipt processing (~30 seconds, **after delivery**)
- Open the dashboard, Orders tab → **Add receipt** section
- Drop the `.eml` or `.pdf` receipt → preview → click **Save to archive**
- Order appears in the history below immediately
- Khalil-allergen items in the new order are flagged in the preview

### Mid-week check-ins (~1 min)
- Quick chat: "we cooked X last night", "what can I make tonight?"
- Pantry stays roughly accurate

### End of week review (optional, ~5 min)
- Ask for a week summary
- Flags waste signals, protein hit rate, patterns

**Shopping frequency:** weekly fresh shop recommended (produce, fish, tofu, herbs). Tinned/dry goods top-up every 2–3 weeks. Bi-weekly fresh shopping is not recommended given Khalil's dietary complexity and the speed of fresh produce confidence decay.

---

## 6. Project files

### Live data
- `index-1-1-9.html` — **current dashboard**. Build version `2026-05-15.2`.
- `index-1-1-8.html` — previous build, kept for rollback. Predates the Edge Function write path.
- `manifest.json` — recipe library index with counts and known gaps.
- `current_pantry.json` — pantry snapshot (Supabase is canonical; this is a JSON export for session bootstrap).
- `orders.json` — receipts archive (Supabase is canonical; this is an export).
- `tesco-orders.json` — legacy filename, same content as `orders.json`. Kept for backward compatibility.

### Recipe library (178 recipes total)
- `east-*.json` — 5 chapters of Meera Sodha's *East*: curries (8), rice/tofu/pulses (18), snacks/salads/noodles (9), vegetables/sides (7), condiments/sweet (6)
- `ottolenghi-simple.json` — *Ottolenghi Simple* (17 recipes)
- `dishoom.json` — *Dishoom: From Bombay with Love* (23 recipes)
- `africana.json` — African recipes (~40 recipes)
- `west-winds.json` — Australian/global recipes (~30 recipes)
- `saved-links.json` — 6 hand-curated web recipes
- `khalil-safe-meals.json` — derived view: 37 recipes safe for Khalil
- `max-pescatarian.json` — derived view: 93 recipes Max can eat

Every recipe carries:
- `"audience"`: `"whole-household"` | `"check"` | `"adults-only"`
- `"eaters"`: array from `["max", "emily", "khalil"]`

Library totals (last verified 2026-05-11): **27 whole-household · 10 needs-check · 57 adults-only**.

### Other context
- `meal_ideas.json`, `recipes__3_.json` — supplementary recipes
- `meals-cooked.json` — log of what's been made
- `fitness_mindset.json`, `gardening.json`, `educational.json`, `what_i_eat_in_a_day.json` — context files for non-grocery topics
- `_pending-verification.md` — saved links that didn't fit cleanly into the library
- `grocery-intelligence-product-audit.md` — 387-line product-strategy review (May 2026). Worth reading once.

---

## 7. Skills

Two custom skills under `/mnt/skills/user/`:

### `grocery-receipt-archive`
Parses `.eml` receipts into the `orders.json` schema. Currently used for **historical backfill only** — going forward, new receipts come in via the dashboard Edge Function. Retailers detected (Tesco parsed; Ocado, Sainsbury's, Waitrose, Amazon Fresh detected but parsers pending).

Output schema is the source of truth that the Edge Function's `validateOrder` mirrors. If you change the schema, change both.

### `grocery-intelligence`
The session-level assistant logic: pantry confidence decay, meal suggestion, audience tagging, allergen filtering. Loaded by the system prompt when discussing groceries.

---

## 8. Recipe classification rules

Derived programmatically using:

- **Khalil-blocked:** eggs, dairy, wheat, lentils, peas (all forms), chickpeas, avocado, beef, all beans (legume seeds — green/runner/french beans excluded), all tree nuts
- **Peanuts:** safe (treated as override against `pea` family)
- **Plant milks:** coconut milk, almond milk, etc. — NOT classified as dairy
- **Uncertain bucket:** soy sauce (may contain wheat — use tamari), oat milk (may contain gluten), soba noodles (often buckwheat-wheat blend)

Classification:
- `audience = "whole-household"` if no Khalil block found
- `audience = "check"` if uncertain items present but no hard blocks
- `audience = "adults-only"` otherwise

`eaters` built by removing whoever is blocked: meat tokens block Max, pork tokens block Emily, the allergen set blocks Khalil.

Manual tags override programmatic ones — the assistant respects whatever's in the file.

---

## 9. Decision log

Key architectural decisions taken to date. Earlier decisions are summarised; the Edge Function decision (most recent and most consequential) is detailed here for future reference.

### 2026-05-15: Edge Function as canonical write path

**Problem:** receipt parser shipped in `index-1-1-8.html` was preview-only — extracted order JSON, user copied it, pasted into a Claude session, Python skill wrote to Supabase. Three-step shuffle.

**Options considered:**

- **A:** Direct dashboard writes with anon key. Simplest. Parser stays in browser. Cons: when multi-retailer arrives, each parser has its own write path; nothing to share with a future email-forwarding webhook.
- **B:** Email-forwarding auto-ingest (CloudMailin/SendGrid Inbound → webhook → Supabase). Zero-touch. Cons: 6 hops, ~£10/mo for inbound email service, harder to debug.
- **C:** Edge Function as a thin write API with parsers staying per-caller. Compromise.

**Chosen: C.** Reasoning:
- Multi-retailer is on the roadmap, so a shared write path pays off
- Future email-webhook (Option B) calls the same endpoint as the dashboard
- Parser-in-function (full TS port of 486-line Python parser) rejected as overkill — parser stays where it makes sense per caller
- Result: ~80 lines of TS in the function, parser stays in-browser for instant preview

**Implementation notes:**
- Auth: platform-level `verify_jwt: true` (anon key satisfies) + custom `X-Ingest-Secret` header
- Dedup: `(retailer, order_number)` checked in app code + enforced by unique partial index
- Duplicate uploads return a friendly status, no overwrite, no data loss
- Schema additions: unique index on `(retailer, order_number)` where `order_number IS NOT NULL`

### Earlier decisions

- **Supabase as source of truth:** previously Claude/JSON files were canonical; migrated in mid-May 2026. Dashboard now reads from Supabase, with localStorage as a fallback/cache for pantry edits.
- **`receipts` table renamed from `tesco_orders`:** retailer column added with default `'tesco'`. Schema-ready for multi-retailer.
- **Recipe audience + eater tagging programmatic:** done 2026-05-11. Every recipe in the library has both tags. Manual overrides respected.

---

## 10. Open follow-ups

Things that aren't done but should be acknowledged:

1. **Live end-to-end smoke test of the Edge Function is still pending** — the first real receipt upload will be the live test. Function source has been manually verified; dedup query path verified against existing data.
2. **RLS advisory on `recipes` and `tesco_skus`** — not blocking but flagged.
3. **Amendment handling** — if Tesco re-sends an order with the same order_number, the Edge Function rejects as duplicate. The Python skill replaces on collision. Worth aligning if/when this happens in practice.
4. **No "force overwrite" option** in the dashboard — if you genuinely want to replace an order, you delete the old row in Supabase first. Probably fine.
5. **Other retailers** — Ocado/Sainsbury's/Waitrose parsers don't exist yet. The function allowlist includes them; parsers come when needed.

---

## 11. How to operate

### Daily / weekly
- Use the dashboard for pantry edits and receipt uploads
- Use Claude chat for meal planning and mid-week questions
- Both halves stay in sync via Supabase

### When something breaks
1. **Dashboard not loading:** check Supabase project health at the dashboard URL above
2. **Save to archive fails:** check Edge Function logs (link in §4)
3. **Recipe count or counts feel wrong:** `manifest.json` has the canonical counts; if Supabase disagrees, the migration is incomplete

### When adding things
- **New recipe from a book/photo:** drop the photo into a Claude session, ask to parse + add. The skill will tag audience + eaters automatically.
- **New receipt:** drop into dashboard → Save. Don't bother with the Python skill unless backfilling history.
- **New retailer:** (1) add slug to `ALLOWED_RETAILERS` in the Edge Function and redeploy, (2) add a `parseXxx()` function and detector branch in the dashboard's `ReceiptParser`, (3) update this README.

---

## 12. History (preserved from earlier README)

The original README documented a one-off data migration on 2026-05-11 that added audience/eaters tags to every recipe and allergen flags to every pantry item. Those classifications are described in §8 above. Counts at the time of migration:

- Pantry: 10 son_allergen, 2 check, 46 household_safe
- Recipes: 27 whole-household, 10 needs-check, 57 adults-only

(Recipe count has grown since — current total is 178 across the full library.)

Audience tags are derived programmatically; manual tags in source files override the classifier. The assistant respects whatever is in the file.
