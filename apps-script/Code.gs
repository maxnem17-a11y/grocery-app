/**
 * Larder — daily expiry digest (backlog #7)
 *
 * Fetches pantry rows expiring in the next LOOKAHEAD_DAYS days from
 * Supabase, groups them by urgency, and emails Max. Silent when no
 * items are in any bucket (no "nothing expiring" spam).
 *
 * Trigger: time-driven daily, configured to fire around 07:00 BST.
 * Setup: see README.md.
 */

const LOOKAHEAD_DAYS = 5;
const TZ = 'Europe/London';

function sendExpiryDigest() {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const anonKey = props.getProperty('SUPABASE_ANON_KEY');
  const recipient = props.getProperty('DIGEST_RECIPIENT');
  if (!supabaseUrl || !anonKey || !recipient) {
    throw new Error('Missing script properties — set SUPABASE_URL, SUPABASE_ANON_KEY, DIGEST_RECIPIENT (Project Settings → Script Properties).');
  }

  const items = fetchExpiring_(supabaseUrl, anonKey, LOOKAHEAD_DAYS);
  const buckets = bucketByUrgency_(items);
  const total = buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.soon.length;
  if (total === 0) {
    Logger.log('No items expiring in next %d days — skipping email.', LOOKAHEAD_DAYS);
    return;
  }

  const subject = buildSubject_(buckets, total);
  const html = buildBody_(buckets);
  GmailApp.sendEmail(recipient, subject, htmlToPlain_(html), { htmlBody: html, name: 'Larder' });
  Logger.log('Sent: %s', subject);
}

function fetchExpiring_(baseUrl, anonKey, days) {
  const cutoff = addDaysIso_(new Date(), days);
  const path = '/rest/v1/pantry_items'
    + '?select=item,expires,category,in_freezer'
    + '&expires=lte.' + encodeURIComponent(cutoff)
    + '&out_of_stock=eq.false'
    + '&expires=not.is.null'
    + '&order=expires.asc';
  const resp = UrlFetchApp.fetch(baseUrl + path, {
    headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey },
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error('Supabase fetch failed (' + code + '): ' + resp.getContentText().slice(0, 500));
  }
  return JSON.parse(resp.getContentText());
}

function bucketByUrgency_(items) {
  const today = isoToday_();
  const tomorrow = addDaysIso_(new Date(), 1);
  const buckets = { overdue: [], today: [], tomorrow: [], soon: [] };
  for (const it of items) {
    if (it.expires < today) buckets.overdue.push(it);
    else if (it.expires === today) buckets.today.push(it);
    else if (it.expires === tomorrow) buckets.tomorrow.push(it);
    else buckets.soon.push(it);
  }
  return buckets;
}

function buildSubject_(buckets, total) {
  if (buckets.overdue.length > 0) return 'Larder · ' + buckets.overdue.length + ' overdue, ' + total + ' total';
  if (buckets.today.length > 0) return 'Larder · ' + buckets.today.length + ' expiring today, ' + total + ' total';
  return 'Larder · ' + total + ' expiring in next ' + LOOKAHEAD_DAYS + ' days';
}

function buildBody_(buckets) {
  const sections = [
    section_('Overdue', buckets.overdue),
    section_('Today', buckets.today),
    section_('Tomorrow', buckets.tomorrow),
    section_('Next ' + LOOKAHEAD_DAYS + ' days', buckets.soon),
  ].filter(function (s) { return s; });
  return ''
    + '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1c1917;max-width:560px;">'
    + '<h2 style="margin:0 0 16px;font-size:18px;">Larder — expiry digest</h2>'
    + sections.join('')
    + '</div>';
}

function section_(label, items) {
  if (items.length === 0) return '';
  const rows = items.map(function (it) {
    const tag = it.in_freezer ? ' <span style="color:#0369a1;font-size:12px;">[freezer]</span>' : '';
    return ''
      + '<tr>'
      + '<td style="padding:4px 12px 4px 0;">' + escapeHtml_(it.item) + tag + '</td>'
      + '<td style="padding:4px 0;color:#57534e;font-size:13px;">' + it.expires + '</td>'
      + '</tr>';
  }).join('');
  return ''
    + '<h3 style="margin:16px 0 4px;font-size:15px;">' + label + ' (' + items.length + ')</h3>'
    + '<table style="border-collapse:collapse;font-size:14px;">' + rows + '</table>';
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function htmlToPlain_(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isoToday_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function addDaysIso_(d, days) {
  const shifted = new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
  return Utilities.formatDate(shifted, TZ, 'yyyy-MM-dd');
}
