# Figure Slim · Malad West · Diwali landing page (U-Lipolysis + GLP-1)

Deploy this folder to Vercel (no build step).

Environment variable (Vercel → Settings → Environment Variables):
- `LEAD_WEBHOOK_URL` – where each lead is sent as JSON (Google Apps Script web app, Pabbly, Zapier or CRM webhook).

Page settings (top of the `<script>` in index.html):
- `META_PIXEL_ID` – Figure Slim pixel; fires PageView and Lead (value = chosen offer price) on successful submit.
- `OFFER_END` – optional real end date; the top ribbon then shows a live "Ends in…" countdown.
- `AUTO_POPUP_SECONDS` – popup opens once per visit after this delay (and on exit intent on desktop). 0 turns it off.

Lead fields: name, phone, email, treatment (U-Lipolysis / GLP-1 Weight Loss / Need a suggestion), offer, offer_value, clinic, form (popup/inline), page, utm, submitted_at, received_at, ip, user_agent.
