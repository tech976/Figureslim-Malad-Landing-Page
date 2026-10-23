// GET /api/status
//
// Says whether the lead function can reach the CRM and the Google Sheet, and
// whether each accepts its key. Never shows a key; creates no lead and no row.
// Open https://<your-site>/api/status after changing environment variables.

module.exports = async (req, res) => {
  const env = (k) => process.env[k] || '';
  const keyInfo = (v) => ({
    set: !!v,
    length: v.length,
    has_stray_whitespace: v !== v.trim(),
    has_quotes: /^["']|["']$/.test(v),
  });

  const crmUrl = env('CRM_LEAD_URL');
  const crmSecret = env('CRM_LEAD_SECRET');
  const sheetUrl = env('SHEET_WEBHOOK_URL');
  const sheetSecret = env('SHEET_SECRET');

  const out = {
    crm: {
      CRM_LEAD_URL: { set: !!crmUrl, value: crmUrl || null, looks_right: /\/api\/website\/lead\/?$/.test(crmUrl) },
      CRM_LEAD_SECRET: keyInfo(crmSecret),
      reachable: null,
      accepts_key: null,
    },
    sheet: {
      // Workspace accounts get /a/macros/<domain>/s/…/exec instead of /macros/s/…/exec.
      SHEET_WEBHOOK_URL: { set: !!sheetUrl, looks_right: /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[^/]+\/exec$/.test(sheetUrl) },
      SHEET_SECRET: keyInfo(sheetSecret),
      reachable: null,
      accepts_key: null,
    },
  };

  const checks = [];

  if (crmUrl && crmSecret) {
    // Incomplete on purpose: the CRM checks the key first, then skips
    // non-complete submissions, so no lead is created. 401 = wrong key.
    checks.push(fetch(crmUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': crmSecret },
      body: JSON.stringify({ _probe: true, status: 'incomplete' }),
      signal: AbortSignal.timeout(8000),
    }).then((r) => {
      out.crm.reachable = true;
      out.crm.http_status = r.status;
      out.crm.accepts_key = r.status !== 401;
    }).catch((e) => { out.crm.reachable = false; out.crm.error = e.message; }));
  }

  if (sheetUrl && sheetSecret) {
    // ping:true makes the script check the key and return without writing.
    checks.push(fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: sheetSecret, ping: true }),
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    }).then(async (r) => {
      const text = await r.text();
      let body = {};
      try { body = JSON.parse(text); } catch { /* HTML = Google error or login page */ }
      out.sheet.reachable = r.ok && 'ok' in body;
      out.sheet.accepts_key = body.ok === true;
      if (!out.sheet.reachable) out.sheet.error = 'Got a non-JSON reply. Is the web app deployed with access "Anyone"?';
      if (body.sheet) out.sheet.writes_to = body.sheet;
    }).catch((e) => { out.sheet.reachable = false; out.sheet.error = e.message; }));
  }

  await Promise.all(checks);

  const verdict = (name, part, urlOk) => {
    const [urlKey, secretKey] = Object.keys(part);
    if (!part[urlKey].set || !part[secretKey].set) return `${name}: not set up. Add ${urlKey} and ${secretKey} for Production, then redeploy.`;
    if (!urlOk) return `${name}: ${urlKey} looks wrong.`;
    if (part.reachable === false) return `${name}: could not reach it. ${part.error || ''}`.trim();
    if (part.accepts_key === false) return `${name}: rejected the key. Check ${secretKey} matches exactly (no quotes or spaces).`;
    return `${name}: OK`;
  };
  out.verdict = [
    verdict('CRM', out.crm, out.crm.CRM_LEAD_URL.looks_right),
    verdict('Sheet', out.sheet, out.sheet.SHEET_WEBHOOK_URL.looks_right),
  ];

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
};
