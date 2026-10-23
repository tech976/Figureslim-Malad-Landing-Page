// POST /api/lead
//
// Receives a form submission from the page and sends it to two places:
//   1. the Figure Slim CRM, as a "Landing Page" lead routed to the Malad branch
//   2. a Google Sheet, via an Apps Script web app (see google-sheet.gs)
//
// The CRM and Sheet keys live in Vercel environment variables, so they never
// reach the browser. Either destination can be left unconfigured. The visitor
// sees success if at least one of them saved the lead; the Sheet row records
// whether the CRM got it, so a lead the CRM missed can be found and re-entered.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   CRM_LEAD_URL       https://crm.figureslim.in/api/website/lead
//   CRM_LEAD_SECRET    the CRM's WEBSITE_LEAD_SECRET
//   SHEET_WEBHOOK_URL  the Apps Script web app URL (ends in /exec)
//   SHEET_SECRET       the SECRET set at the top of google-sheet.gs

const CAMPAIGN = 'Diwali 2026 · Malad';

function fail(res, status, code) {
  return res.status(status).json({ ok: false, error: code });
}

// dd-mm-yyyy hh:mm:ss in IST, so the Sheet reads naturally for the Mumbai team.
function istStamp(d) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

async function sendToCrm(lead) {
  const url = process.env.CRM_LEAD_URL;
  const secret = process.env.CRM_LEAD_SECRET;
  if (!url || !secret) return { configured: false, ok: false };

  const u = lead.utm;
  const payload = {
    _channel: 'landing',               // a "Landing Page" lead, not "Website"
    _source: 'malad-diwali-landing',
    _campaign: CAMPAIGN,
    _page: 'Malad Diwali Landing Page',
    status: 'complete',
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    // Must be named exactly "Location": the CRM picks the branch from this
    // field (backend/lead-branch.js). Anything containing "Malad" → Malad.
    Location: lead.clinic,
    message: [
      `Treatment: ${lead.treatment}`,
      `Offer: ${lead.offer}`,
      `Form: ${lead.form === 'popup' ? 'Popup' : 'On-page form'}`,
      Object.keys(u).length ? 'UTM: ' + Object.entries(u).map(([k, v]) => `${k}=${v}`).join(' · ') : '',
    ].filter(Boolean).join('\n'),
  };

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    if (!r.ok) {
      console.error('[lead] CRM rejected:', r.status, text.slice(0, 300));
      return { configured: true, ok: false, error: `HTTP ${r.status}` };
    }
    let out = {};
    try { out = JSON.parse(text); } catch { /* 2xx with non-JSON body still counts */ }
    return { configured: true, ok: true, lead_id: out.lead_id || '' };
  } catch (e) {
    console.error('[lead] CRM unreachable:', e.message);
    return { configured: true, ok: false, error: e.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
}

async function sendToSheet(lead, crm) {
  const url = process.env.SHEET_WEBHOOK_URL;
  const secret = process.env.SHEET_SECRET;
  if (!url || !secret) return { configured: false, ok: false };

  const u = lead.utm;
  // Keys are the Sheet's column headers (google-sheet.gs creates them).
  const row = {
    'Submitted (IST)': istStamp(new Date()),
    'Name': lead.name,
    'Phone': lead.phone,
    'Email': lead.email,
    'Treatment': lead.treatment,
    'Offer': lead.offer,
    'Offer value': lead.offer_value,
    'Clinic': lead.clinic,
    'Form': lead.form,
    'CRM': !crm.configured ? 'not set up' : crm.ok ? 'saved' : `FAILED (${crm.error})`,
    'CRM lead id': crm.lead_id || '',
    'utm_source': u.utm_source || '',
    'utm_medium': u.utm_medium || '',
    'utm_campaign': u.utm_campaign || '',
    'utm_content': u.utm_content || '',
    'utm_term': u.utm_term || '',
    'fbclid / gclid': u.fbclid || u.gclid || '',
    'Page': lead.page,
    'IP': lead.ip,
    'User agent': lead.user_agent,
  };

  try {
    // Apps Script answers /exec with a redirect to the result; fetch follows it.
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, row }),
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    const text = await r.text();
    let out = {};
    try { out = JSON.parse(text); } catch { /* Google error pages are HTML */ }
    if (!r.ok || !out.ok) {
      console.error('[lead] Sheet rejected:', r.status, text.slice(0, 300));
      return { configured: true, ok: false };
    }
    return { configured: true, ok: true };
  } catch (e) {
    console.error('[lead] Sheet unreachable:', e.message);
    return { configured: true, ok: false };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');

  const b = (req.body && typeof req.body === 'object') ? req.body : {};

  // The page validates too, but anything can post here directly.
  const name = String(b.name || '').trim().slice(0, 120);
  const phone10 = String(b.phone || '').replace(/\D/g, '').slice(-10);
  const email = String(b.email || '').trim().slice(0, 200);
  if (name.length < 2 || !/^[6-9]\d{9}$/.test(phone10) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return fail(res, 400, 'invalid_input');

  const utm = {};
  if (b.utm && typeof b.utm === 'object') {
    for (const [k, v] of Object.entries(b.utm).slice(0, 20)) utm[String(k).slice(0, 40)] = String(v).slice(0, 200);
  }

  const lead = {
    name,
    phone: '+91' + phone10,
    email,
    treatment: String(b.treatment || '').slice(0, 60),
    offer: String(b.offer || '').slice(0, 120),
    offer_value: Number(b.offer_value) || 0,
    clinic: String(b.clinic || 'Malad West').slice(0, 60),
    form: b.form === 'popup' ? 'popup' : 'inline',
    page: String(b.page || '').slice(0, 300),
    utm,
    ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
    user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
  };

  // CRM first, so the Sheet row can say whether the CRM got the lead.
  const crm = await sendToCrm(lead);
  const sheet = await sendToSheet(lead, crm);

  if (!crm.configured && !sheet.configured) {
    console.error('[lead] neither the CRM nor the Sheet is configured', lead.name, phone10.slice(-4));
    return fail(res, 500, 'not_configured');
  }
  console.log('[lead]', lead.name, phone10.slice(-4), '| CRM:', crm.ok ? crm.lead_id || 'ok' : crm.configured ? 'FAILED' : 'off',
    '| Sheet:', sheet.ok ? 'ok' : sheet.configured ? 'FAILED' : 'off');

  // At least one copy saved → the visitor is done. Neither → let them retry.
  if (crm.ok || sheet.ok) return res.status(200).json({ ok: true });
  return fail(res, 502, 'save_failed');
};
