/**
 * Figure Slim · Malad Diwali landing page → Google Sheet
 *
 * Paste this whole file into the Sheet: Extensions → Apps Script → Code.gs.
 * Nothing needs editing. Then Deploy → New deployment → Web app:
 *   Execute as: Me    Who has access: Anyone
 * Copy the web app URL (ends in /exec) into SHEET_WEBHOOK_URL in Vercel.
 *
 * The key: the first request that brings one (the site's SHEET_SECRET) is
 * saved in Script Properties, and from then on only that key is accepted.
 * To change it, run resetKey() once, then send a request with the new key.
 *
 * After editing this script, publish it with Deploy → New deployment (new URL)
 * or Manage deployments → Edit → Version: New version (same URL).
 */

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

  if (!keyMatches(body.secret)) return reply({ ok: false, error: 'unauthorized' });
  if (body.ping) return reply({ ok: true, sheet: SpreadsheetApp.getActive().getName() + ' › ' + TAB_NAME });

  const data = body.row || {};
  // Lock so two leads arriving together can't land on the same row.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    getTab().appendRow(HEADERS.map(h => clean(data[h])));
    return reply({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// Opening the /exec URL in a browser shows this. Handy to confirm it's deployed.
function doGet() {
  return reply({ ok: true, message: 'Figure Slim lead sheet is live. Leads arrive by POST.' });
}

// Saves the first key it sees (at least 24 characters), then accepts only that key.
function keyMatches(given) {
  if (typeof given !== 'string' || given.length < 24) return false;
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let key = props.getProperty('SHEET_SECRET');
    if (!key) { props.setProperty('SHEET_SECRET', given); key = given; }
    return given === key;
  } finally {
    lock.releaseLock();
  }
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

// Run once from the editor (pick "setup", click Run): creates the tab and header
// row, and asks for permission to edit the Sheet.
function setup() {
  getTab();
}

// Run once to forget the saved key, e.g. after changing SHEET_SECRET in Vercel.
function resetKey() {
  PropertiesService.getScriptProperties().deleteProperty('SHEET_SECRET');
}
