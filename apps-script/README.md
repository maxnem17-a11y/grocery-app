# Larder — Apps Script

Google Apps Script projects that run alongside the Larder web app for
proactive Gmail-based workflows. Backlog reference: `larder/CLAUDE.md`.

Currently houses:

- **`Code.gs` — daily expiry digest (backlog #7).** Fetches pantry rows
  expiring in the next 5 days from Supabase and emails Max a grouped
  digest each morning. Silent when nothing is expiring.

Reserved for the same project (one Apps Script per Google account
shares OAuth scopes — cheaper to bundle):

- Tesco order email auto-ingest (backlog #6). Will live in this same
  `Code.gs` as a separate function + trigger.

---

## One-time setup

You need to be logged into your Google account in a browser for
all of this.

1. **Create the Apps Script project.**
   - Go to <https://script.google.com> → New project.
   - Name it "Larder".
   - Replace the default `Code.gs` contents with the contents of
     this directory's `Code.gs`.

2. **Set script properties** (Project Settings → Script Properties →
   Add script property). Add three properties:

   | Property              | Value                                                                  |
   | --------------------- | ---------------------------------------------------------------------- |
   | `SUPABASE_URL`        | `https://odevqzgdwwqgryybgbyf.supabase.co`                             |
   | `SUPABASE_ANON_KEY`   | (anon publishable key — same one in `larder/src/lib/supabase.js`)      |
   | `DIGEST_RECIPIENT`    | `maxnem17@gmail.com`                                                   |

3. **Grant scopes** by running `sendExpiryDigest` manually once.
   - Select `sendExpiryDigest` in the function dropdown → Run.
   - Apps Script will prompt for OAuth consent — it needs:
     - `https://www.googleapis.com/auth/script.external_request`
       (UrlFetchApp → Supabase REST)
     - `https://www.googleapis.com/auth/gmail.send` (GmailApp)
   - Click through "Advanced → Go to Larder (unsafe)" — this is
     normal for unverified personal Apps Script projects.

4. **Add the daily trigger** (Triggers → Add trigger):
   - Function: `sendExpiryDigest`
   - Event source: Time-driven
   - Type: Day timer
   - Time of day: 7am – 8am (Europe/London — Apps Script uses the
     project's default TZ; verify under Project Settings → General →
     Time zone is set to London).

5. **Verify.** Check the execution log (Executions tab) after the
   first scheduled run. Empty-bucket days will log
   `No items expiring in next 5 days — skipping email.` and send
   nothing.

---

## Maintenance

- **Lookahead window.** Hard-coded to 5 days at the top of `Code.gs`
  (`LOOKAHEAD_DAYS`) to match the existing "Expiring ≤5d" KPI on
  PantryView. Bump to 7 if you want a weekly horizon.

- **Recipient.** Single recipient via `DIGEST_RECIPIENT`. To CC
  Khalil or anyone else, change the `GmailApp.sendEmail` call to pass
  `{ cc: '...' }` in the options object.

- **Sender identity.** Sends as the Apps Script project owner (the
  Google account that set up the trigger). The "From" name is set to
  "Larder" via the `name` option.

- **Failure mode.** If the Supabase fetch fails, the function throws
  and Apps Script logs it under Executions. No retry — the next day's
  trigger naturally retries. If you want Apps Script to email you on
  failure, enable it under Triggers → pencil icon → Failure
  notifications.

- **Rotating the Supabase anon key.** Update `SUPABASE_ANON_KEY` in
  Script Properties. No code change needed.
