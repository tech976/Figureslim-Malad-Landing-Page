/**
 * Figure Slim · Malad Diwali landing page → Google Sheet
 *
 * Paste this into the Sheet: Extensions → Apps Script → replace Code.gs.
 * Set SECRET below to the same value as SHEET_SECRET in Vercel, then
 * Deploy → New deployment → Web app:
 *   Execute as: Me    Who has access: Anyone
 * Copy the web app URL (ends in /exec) into SHEET_WEBHOOK_URL in Vercel.
 *
 * After editing this script, deploy again with Manage deployments → Edit →
 * Version: New version. That keeps the same /exec URL.
 */

const SECRET = 'PASTE_SHEET_SECRET_HERE';
const TAB_NAME = 'Malad Diwali Leads';

// Column order in the Sheet. The Vercel function sends a row keyed by these names.
const HEADERS = [
  'Submitted (IST)', 'Name', 'Phone', 'Email', 'Treatment', 'Offer', 'Offer value',
  'Clinic', 'Form', 'CRM', 'CRM lead id',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid / gclid',
  'Page', 'IP', 'User agent',
];

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) {}

  if (!SECRET || SECRET === 'PASTE_SHEET_SECRET_HERE' || body.secret !== SECRET) {
    return reply({ ok: false, error: 'unauthorized' });
  }
  if (body.ping) return reply({ ok: true, sheet: SpreadsheetApp.getActive().getName() + ' › ' + TAB_NAME });

  const data = body.row || {};
  // Lock so two leads arriving together can't land on the same row.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getTab();
    sh.appendRow(HEADERS.map(h => clean(data[h])));
    return reply({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// Opening the /exec URL in a browser shows this. Handy to confirm it's deployed.
function doGet() {
  return reply({ ok: true, message: 'Figure Slim lead sheet is live. Leads arrive by POST.' });
}

function getTab() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TAB_NAME);
  if (!sh) {
    // A brand-new Sheet has one empty tab: use it rather than adding a second.
    const tabs = ss.getSheets();
    if (tabs.length === 1 && tabs[0].getLastRow() === 0) sh = tabs[0].setName(TAB_NAME);
    else sh = ss.insertSheet(TAB_NAME);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f3e8d6');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Strings starting with = + - @ would run as formulas (and "+91…" phones would
// turn into numbers). A leading ' keeps them as plain text; Sheets hides it.
function clean(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run this once from the editor (select it, click Run) to create the tab and
// header row and to grant the script permission to edit the Sheet.
function setup() {
  getTab();
}
