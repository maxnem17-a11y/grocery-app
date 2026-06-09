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

**Supported shops:** the vision model recognises any UK supermarket, but a
parsed receipt can only be *saved* if its retailer is in `ingest-receipt`'s
`ALLOWED_RETAILERS` set — currently `tesco, ocado, sainsburys, waitrose`. Other
shops (Aldi, Lidl, M&S, Co-op, Asda, Morrisons) parse fine but fail at save with
`unsupported_retailer`. To enable them, add the slug to `ALLOWED_RETAILERS` in
`ingest-receipt` and redeploy — a one-line change (deliberately deferred here to
avoid redeploying the canonical Tesco write path).

**Required secret:** `ANTHROPIC_API_KEY` (an Anthropic API key, billed
separately from any Claude subscription). Optional: `RECEIPT_VISION_MODEL`
(defaults to `claude-sonnet-4-6`). Set with:

```
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

or via the dashboard → Project Settings → Edge Functions → Secrets.
