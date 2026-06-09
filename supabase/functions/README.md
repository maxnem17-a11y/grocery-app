# Supabase Edge Functions

These are the Edge Functions deployed to the `grocery-app` Supabase project
(`odevqzgdwwqgryybgbyf`). They were historically deployed straight from the
dashboard / MCP and not version-controlled; this directory is the canonical
source going forward. Redeploy with `supabase functions deploy <name>` or the
Supabase MCP `deploy_edge_function` tool.

## `ingest-receipt`

Single canonical **write** path for receipts. Accepts either a raw Tesco `.eml`
(`{ retailer:"tesco", eml }`, parsed server-side by `parse_tesco.ts`) or a
pre-parsed order (`{ retailer, order }`). Dedupes on `(retailer, order_number)`.
`?dry_run=true` parses + checks the archive without writing.

Auth: `verify_jwt=false` + a shared `X-Ingest-Secret` header.

## `parse-receipt-photo`

Vision **parser** for photographed paper till receipts (any UK supermarket).
Sends the image to the Anthropic Messages API (Claude vision) with a forced
`emit_receipt` tool call and returns an `order`-shaped object — it does NOT
write. The client previews it, then saves through `ingest-receipt`'s
`{ retailer, order }` path, so dedup + line-item insert + pantry replenishment
all reuse the canonical write path.

Auth: `verify_jwt=false` + the same `X-Ingest-Secret`.

**Supported shops:** both functions share one retailer allowlist —
`tesco, ocado, sainsburys, waitrose, asda, morrisons, aldi, lidl, coop, mands,
iceland, other` (`mands` = M&S, `coop` = Co-op, `other` = the vision parser's
catch-all). The slug must be present in BOTH `parse-receipt-photo`'s and
`ingest-receipt`'s `ALLOWED_RETAILERS` sets (kept in sync). To add another shop,
add the slug to both and redeploy.

Note: `ingest-receipt`'s source (`index.ts` + the Tesco `parse_tesco.ts` parser)
lives in the deployed function and is not duplicated in this repo — fetch it with
the Supabase MCP `get_edge_function` before editing, change only what you need,
and redeploy with both files (a deploy replaces all files).

**Required secret:** `ANTHROPIC_API_KEY` (an Anthropic API key, billed
separately from any Claude subscription). Optional: `RECEIPT_VISION_MODEL`
(defaults to `claude-sonnet-4-6`). Set with:

```
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

or via the dashboard → Project Settings → Edge Functions → Secrets.
