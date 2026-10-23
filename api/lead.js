// POST /api/lead  -> forwards the lead JSON to LEAD_WEBHOOK_URL (Google Apps Script, Pabbly, Zapier, CRM…)
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const b = req.body || {};
  const phone = String(b.phone || "").replace(/\D/g, "").slice(-10);
  const email = String(b.email || "").trim();
  if (!String(b.name || "").trim() || !/^[6-9]\d{9}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return res.status(400).json({ ok: false, error: "invalid_input" });
  const lead = Object.assign({}, b, { phone: "+91" + phone, email, received_at: new Date().toISOString(),
    ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim(), user_agent: req.headers["user-agent"] || "" });
  if (!process.env.LEAD_WEBHOOK_URL) { console.error("LEAD_WEBHOOK_URL not set", lead); return res.status(500).json({ ok: false, error: "not_configured" }); }
  try {
    const r = await fetch(process.env.LEAD_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
    if (!r.ok && r.status >= 400) throw new Error("webhook " + r.status);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("lead forward failed:", e.message, lead);
    return res.status(502).json({ ok: false, error: "forward_failed" });
  }
};
