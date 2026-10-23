# Figure Slim · Malad West · Diwali landing page (U-Lipolysis + GLP-1)

Static page on Vercel (no build step). Live: https://figureslimmalad.vercel.app/

## Where leads go

    browser → /api/lead → 1. Figure Slim CRM  (Landing Page lead, Malad branch)
                          2. Google Sheet     (via google-sheet.gs, one row per lead)

`api/lead.js` keeps both keys server-side. The visitor sees success if at least
one destination saved the lead. The Sheet's **CRM** column says `saved` or
`FAILED (…)`, so any lead the CRM missed can be spotted and re-entered.

In the CRM the lead shows **Source: Landing Page**, **Campaign: Diwali 2026 · Malad**,
**Branch: Malad** (from the `Location` field, see the CRM's `backend/lead-branch.js`).
Repeat submissions from the same phone number update the existing CRM lead
instead of creating a duplicate. The Sheet logs every submission.

## Setup

Vercel → Settings → Environment Variables (Production):

| Name | Value |
|---|---|
| `CRM_LEAD_URL` | `https://crm.figureslim.in/api/website/lead` |
| `CRM_LEAD_SECRET` | the CRM's `WEBSITE_LEAD_SECRET` (see below) |
| `SHEET_WEBHOOK_URL` | the Apps Script web app URL, ending in `/exec` |
| `SHEET_SECRET` | any random string of 24+ characters (`openssl rand -hex 24`) |

Get the CRM key from the server:

    ssh figureslim-vps "grep '^WEBSITE_LEAD_SECRET=' /opt/figureslim-crm/.env"

Google Sheet: open it → **Extensions → Apps Script** → paste `google-sheet.gs`
unchanged → run `setup` once and allow access → **Deploy → New deployment →
Web app**, Execute as **Me**, access **Anyone** → copy the `/exec` URL.
The script saves the first `SHEET_SECRET` it receives and accepts only that key
afterwards; run `resetKey` in the script editor if you change it.

**Redeploy after changing environment variables.** Vercel only reads them at
deploy time. Then open `/api/status` to check both connections. It never shows
a key and creates no lead.

## Page settings

Top of the `<script>` in `index.html`:

- `META_PIXEL_ID`: Figure Slim pixel. Fires PageView, and Lead (value = offer price) on submit.
- `OFFER_END`: optional end date; the ribbon then shows a live "Ends in…" countdown.
- `AUTO_POPUP_SECONDS`: popup opens once per visit after this delay (and on exit intent on desktop). 0 turns it off.
