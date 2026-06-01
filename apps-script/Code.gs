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

const BUCKET_META = {
  overdue:  { label: 'Overdue',           color: '#b91c1c' },
  today:    { label: 'Expiring today',    color: '#b45309' },
  tomorrow: { label: 'Expiring tomorrow', color: '#0369a1' },
  soon:     { label: 'Coming up',         color: '#44403c' },
};

function buildBody_(buckets) {
  const total = buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.soon.length;
  const headerDate = displayHeaderDate_(new Date());

  const sections = ['overdue', 'today', 'tomorrow', 'soon']
    .map(function (k) { return section_(k, buckets[k]); })
    .filter(function (s) { return s; })
    .join('');

  return ''
    + '<div style="margin:0;padding:24px 16px;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,sans-serif;color:#1c1917;">'
    +   '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;margin:0 auto;background:#ffffff;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">'
    +     '<tr><td style="padding:22px 24px 18px;">'
    +       '<div style="font-size:11px;font-weight:600;color:#0f766e;letter-spacing:.12em;text-transform:uppercase;">Larder</div>'
    +       '<div style="margin-top:6px;font-size:20px;font-weight:600;color:#1c1917;line-height:1.25;">' + total + ' item' + (total === 1 ? '' : 's') + ' to use soon</div>'
    +       '<div style="margin-top:4px;font-size:13px;color:#78716c;">' + headerDate + '</div>'
    +     '</td></tr>'
    +     sections
    +     '<tr><td style="padding:18px 24px;border-top:1px solid #e7e5e4;text-align:center;font-size:12px;color:#a8a29e;">'
    +       '<a href="https://maxnem17-a11y.github.io/grocery-app/" style="color:#0f766e;text-decoration:none;font-weight:500;">Open Larder</a>'
    +     '</td></tr>'
    +   '</table>'
    + '</div>';
}

function section_(key, items) {
  if (items.length === 0) return '';
  const meta = BUCKET_META[key];
  const header = ''
    + '<tr><td colspan="2" style="padding:18px 24px 8px;border-top:1px solid #e7e5e4;">'
    +   '<div style="font-size:11px;font-weight:600;color:' + meta.color + ';letter-spacing:.1em;text-transform:uppercase;">' + meta.label + ' · ' + items.length + '</div>'
    + '</td></tr>';
  const rows = items.map(function (it, i) {
    const borderTop = i === 0 ? '' : 'border-top:1px solid #f5f5f4;';
    const freezerTag = it.in_freezer
      ? '<span style="display:inline-block;margin-left:8px;padding:1px 7px;background:#e0f2fe;color:#075985;border-radius:999px;font-size:11px;font-weight:500;vertical-align:middle;">freezer</span>'
      : '';
    return ''
      + '<tr>'
      +   '<td style="padding:10px 24px;' + borderTop + 'vertical-align:top;">'
      +     '<div style="font-size:14px;color:#1c1917;">' + escapeHtml_(it.item) + freezerTag + '</div>'
      +     '<div style="margin-top:2px;font-size:12px;color:#a8a29e;">' + escapeHtml_(it.category || '') + '</div>'
      +   '</td>'
      +   '<td style="padding:10px 24px;' + borderTop + 'text-align:right;vertical-align:top;white-space:nowrap;">'
      +     '<div style="font-size:13px;color:#44403c;">' + displayDate_(it.expires) + '</div>'
      +     '<div style="margin-top:2px;font-size:11px;color:' + meta.color + ';font-weight:500;">' + relativeLabel_(it.expires) + '</div>'
      +   '</td>'
      + '</tr>';
  }).join('');
  return header + rows;
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function htmlToPlain_(html) {
  return html
    .replace(/<\/(h[1-6]|p|div|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function isoToday_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function addDaysIso_(d, days) {
  const shifted = new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
  return Utilities.formatDate(shifted, TZ, 'yyyy-MM-dd');
}

const MONTH_NAMES_ = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES_   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function displayDate_(iso) {
  const d = parseIso_(iso);
  return DAY_NAMES_[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES_[d.getMonth()];
}

function displayHeaderDate_(d) {
  return DAY_NAMES_[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES_[d.getMonth()] + ' ' + d.getFullYear();
}

function relativeLabel_(iso) {
  if (iso === isoToday_()) return 'today';
  if (iso === addDaysIso_(new Date(), 1)) return 'tomorrow';
  const days = daysBetween_(isoToday_(), iso);
  if (days < 0) return Math.abs(days) + 'd overdue';
  return 'in ' + days + 'd';
}

function daysBetween_(isoA, isoB) {
  return Math.round((parseIso_(isoB) - parseIso_(isoA)) / (24 * 60 * 60 * 1000));
}

function parseIso_(iso) {
  const p = iso.split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}
