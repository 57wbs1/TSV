// ============================================================
// TSV PWA — Google Apps Script Backend
// Paste this ENTIRE file into Extensions → Apps Script, then
// Deploy → New Deployment → Web App (Execute as: Me, Access: Anyone)
// ============================================================

// Sheet ID — from https://docs.google.com/spreadsheets/d/<ID>/edit
const SHEET_ID = '19IjTK0I_L2NXJ9afqTxf3GkCXbcONio4ORaw-54JOjY';
const HOTWASH_SHEET_ID = '10gub3Ya6rgq70OnaLxf-yGkt8IrhTPC1f7r2Cj7TuMc';
const SPREADSHEET = SpreadsheetApp.openById(SHEET_ID);

// Sheet schemas
const SHEETS = {
  MEMBERS:   { name: 'Members',   headers: ['id','name','shortName','rank','role','csc','syndicate','pin','isAdmin','isDeleted','createdAt','updatedAt'] },
  STATUS:    { name: 'Status',    headers: ['id','status','locationText','lat','lng','buddyWith','roomNumber','lastUpdated'] },
  LEARNINGS: { name: 'Learnings', headers: ['id','authorId','authorName','day','content','isAhha','timestamp'] },
  INCIDENTS: { name: 'Incidents', headers: ['id','reportedBy','type','who','what','where','when','why','how','status','buddy','medicalFacility','actionsText','timestamp'] },
  LOG:       { name: 'Log',       headers: ['timestamp','action','actor','detail'] },
  PINGS:     { name: 'Pings',     headers: ['id','fromId','fromName','toId','message','timestamp','read'] },
  ADMINREQ:  { name: 'AdminReq',  headers: ['id','fromId','fromName','fromGroup','message','timestamp','status','resolvedBy','resolvedAt','reason'] }
};

// ── Response helper ──────────────────────────────────────────
function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET handler ──────────────────────────────────────────────
function doGet(e) {
  try {
    const action = (e.parameter.action || '').trim();
    let data;

    switch (action) {
      case 'ping':        data = { ok: true, ts: new Date().toISOString() }; break;
      case 'getAll':      data = { members: readMembers(), statuses: readStatuses(), learnings: readLearnings() }; break;
      case 'getMembers':  data = readMembers(); break;
      case 'getStatuses': data = readStatuses(); break;
      case 'getLearnings':data = readLearnings(); break;
      case 'getPings':    data = getPings(e.parameter.userId || ''); break;
      case 'getAdminRequests': data = readSheet(SHEETS.ADMINREQ); break;
      default: return json({ ok: false, error: 'Unknown action: ' + action });
    }
    return json({ ok: true, data });
  } catch (err) {
    return json({ ok: false, error: err.message, stack: err.stack });
  }
}

// ── POST handler ─────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = (body.action || '').trim();
    let data;

    switch (action) {
      case 'updateStatus': data = updateStatus(body); break;
      case 'addLearning':  data = addLearning(body); break;
      case 'addIncident':  data = addIncident(body); break;
      case 'addMember':    data = addMember(body); break;
      case 'updateMember': data = updateMember(body); break;
      case 'deleteMember': data = deleteMember(body); break;
      case 'seedMembers':  data = seedMembers(body.members || []); break;
      case 'sendPing':     data = sendPing(body); break;
      case 'markPingRead': data = markPingRead(body.id); break;
      case 'addAdminRequest':     data = addAdminRequest(body); break;
      case 'resolveAdminRequest': data = resolveAdminRequest(body); break;
      case 'postHotwash':  data = postHotwash(body); break;
      default: return json({ ok: false, error: 'Unknown action: ' + action });
    }
    return json({ ok: true, data });
  } catch (err) {
    return json({ ok: false, error: err.message, stack: err.stack });
  }
}

// ────────────────────────────────────────────────────────────
// MEMBERS CRUD
// ────────────────────────────────────────────────────────────

function readMembers() {
  const rows = readSheet(SHEETS.MEMBERS);
  return rows.filter(r => r.isDeleted !== 'true' && r.isDeleted !== true);
}

function addMember(data) {
  const sheet = getOrCreateSheet(SHEETS.MEMBERS);
  const id = data.id || ('m_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
  const now = new Date().toISOString();
  sheet.appendRow([
    id,
    data.name || '',
    data.shortName || data.name || '',
    data.rank || '',
    data.role || 'Member',
    data.csc || '',
    data.syndicate || '',
    data.pin || '0000',
    data.isAdmin || 'false',
    'false',
    now,
    now
  ]);
  logAction('addMember', data.actor || '', `${data.name} (${data.csc} S${data.syndicate})`);
  return { id };
}

function updateMember(data) {
  const sheet = getOrCreateSheet(SHEETS.MEMBERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  const now = new Date().toISOString();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === data.id) {
      const row = rows[i];
      row[headers.indexOf('name')]      = data.name ?? row[headers.indexOf('name')];
      row[headers.indexOf('shortName')] = data.shortName ?? row[headers.indexOf('shortName')];
      row[headers.indexOf('rank')]      = data.rank ?? row[headers.indexOf('rank')];
      row[headers.indexOf('role')]      = data.role ?? row[headers.indexOf('role')];
      row[headers.indexOf('csc')]       = data.csc ?? row[headers.indexOf('csc')];
      row[headers.indexOf('syndicate')] = data.syndicate ?? row[headers.indexOf('syndicate')];
      if (data.pin !== undefined && headers.indexOf('pin') >= 0)
        row[headers.indexOf('pin')] = data.pin;
      if (data.isAdmin !== undefined && headers.indexOf('isAdmin') >= 0)
        row[headers.indexOf('isAdmin')] = data.isAdmin;
      row[headers.indexOf('updatedAt')] = now;
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
      logAction('updateMember', data.actor || '', data.name);
      return { id: data.id, updated: true };
    }
  }
  return { error: 'Member not found: ' + data.id };
}

function deleteMember(data) {
  const sheet = getOrCreateSheet(SHEETS.MEMBERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  const delCol = headers.indexOf('isDeleted');
  const now = new Date().toISOString();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === data.id) {
      rows[i][delCol] = 'true';
      rows[i][headers.indexOf('updatedAt')] = now;
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([rows[i]]);
      logAction('deleteMember', data.actor || '', data.id);
      return { id: data.id, deleted: true };
    }
  }
  return { error: 'Member not found: ' + data.id };
}

// Seed: only adds members that don't already exist (by id)
function seedMembers(members) {
  if (!members.length) return { added: 0 };
  const sheet = getOrCreateSheet(SHEETS.MEMBERS);
  const existing = sheet.getDataRange().getValues().slice(1).map(r => r[0]);
  let added = 0;
  const now = new Date().toISOString();

  members.forEach(m => {
    if (!existing.includes(m.id)) {
      sheet.appendRow([m.id, m.name || '', m.shortName || m.name || '', m.rank || '',
                       m.role || 'Member', m.csc || '', m.syndicate || '',
                       m.pin || '0000', m.isAdmin || 'false', 'false', now, now]);
      added++;
    }
  });
  logAction('seedMembers', '', `added ${added}`);
  return { added, total: members.length };
}

// ────────────────────────────────────────────────────────────
// STATUS
// ────────────────────────────────────────────────────────────

function readStatuses() {
  return readSheet(SHEETS.STATUS);
}

function updateStatus(data) {
  const sheet = getOrCreateSheet(SHEETS.STATUS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  const now = new Date().toISOString();
  const buddyStr = Array.isArray(data.buddyWith) ? data.buddyWith.join(',') : (data.buddyWith || '');

  let foundRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === data.memberId) { foundRow = i + 1; break; }
  }

  const newRow = [
    data.memberId,
    data.status || 'in_hotel',
    data.locationText || '',
    data.lat || '',
    data.lng || '',
    buddyStr,
    data.roomNumber || '',
    now
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, headers.length).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }

  logAction('updateStatus', data.memberId, data.status);
  return { updated: data.memberId };
}

// ────────────────────────────────────────────────────────────
// LEARNINGS / INCIDENTS
// ────────────────────────────────────────────────────────────

function readLearnings() {
  return readSheet(SHEETS.LEARNINGS).reverse(); // newest first
}

function addLearning(data) {
  const sheet = getOrCreateSheet(SHEETS.LEARNINGS);
  const id = 'L' + Date.now();
  sheet.appendRow([
    id,
    data.authorId || '',
    data.authorName || '',
    data.day || '',
    data.content || '',
    data.isAhha ? 'true' : 'false',
    new Date().toISOString()
  ]);
  logAction('addLearning', data.authorId, (data.content || '').substring(0, 50));
  return { id };
}

function addIncident(data) {
  const sheet = getOrCreateSheet(SHEETS.INCIDENTS);
  const id = 'IR' + Date.now();
  sheet.appendRow([
    id,
    data.reportedBy || '',
    data.type || '',
    data.who || '',
    data.what || '',
    data.where || '',
    data.when || '',
    data.why || '',
    data.how || '',
    data.status || '',
    data.buddy || '',
    data.medicalFacility || '',
    data.actionsText || '',
    new Date().toISOString()
  ]);
  logAction('addIncident', data.reportedBy, data.type);
  return { id };
}

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────

function getOrCreateSheet(schema) {
  let sheet = SPREADSHEET.getSheetByName(schema.name);
  if (!sheet) {
    sheet = SPREADSHEET.insertSheet(schema.name);
    sheet.appendRow(schema.headers);
    sheet.getRange(1, 1, 1, schema.headers.length).setFontWeight('bold').setBackground('#f0f0f0');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(schema.headers);
    sheet.getRange(1, 1, 1, schema.headers.length).setFontWeight('bold').setBackground('#f0f0f0');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readSheet(schema) {
  const sheet = getOrCreateSheet(schema);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function logAction(action, actor, detail) {
  try {
    const sheet = getOrCreateSheet(SHEETS.LOG);
    sheet.appendRow([new Date().toISOString(), action, actor, detail]);
  } catch (e) { /* non-critical */ }
}

// ════════════════════════════════════════════════════════════
// TELEGRAM AUTOMATED BROADCASTS (server-side time triggers)
// Run setupAllTriggers() ONCE from the Apps Script editor to install
// the 1900H, 2300H, and 0200H daily triggers.
// ════════════════════════════════════════════════════════════

const BOT_TOKEN   = '8623156706:AAHv8vGrjxr1Kj4s8_k3EoruBlx1l_EhziQ';
const MAIN_CHAT   = '922547929';   // update to group chat id (-100...) when ready
const SYN1_CHAT   = '922547929';   // update when ready

function tgSend(text, chatId) {
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' }),
      muteHttpExceptions: true
    });
  } catch (e) { logAction('tg_fail', 'server', e.message); }
}

function bkkNow() {
  // Get current BKK time
  return new Date(Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss"));
}

function timeNormalized(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  const h = parts[0] || 0, m = parts[1] || 0;
  return h < 6 ? h*60 + m + 24*60 : h*60 + m;
}

const DAYS_MAP = {
  '2026-04-26': {day:1, theme:'Arrival & Innovation',   icon:'✈️'},
  '2026-04-27': {day:2, theme:'Military & Academic',     icon:'🎓'},
  '2026-04-28': {day:3, theme:'SCOPE Day',               icon:'🔍'},
  '2026-04-29': {day:4, theme:'Diplomatic & Policy',     icon:'🏛️'},
  '2026-04-30': {day:5, theme:'Reflection & Departure',  icon:'🛫'}
};

// ── 1900H: Next-day preview + location reminder (to MAIN chat) ──
// Pass `forceDate` (e.g. '2026-04-26') to bypass the trip-day check for testing.
function sendDailyReminder(forceDate) {
  const bkk = bkkNow();
  const tmr = forceDate
    ? new Date(forceDate + 'T00:00:00+07:00')
    : new Date(bkk.getTime() + 24*60*60*1000);
  const tmrDate = forceDate || Utilities.formatDate(tmr, 'Asia/Bangkok', 'yyyy-MM-dd');
  const d = DAYS_MAP[tmrDate];
  if (!d) { logAction('reminder_skip', 'server', 'not trip day: ' + tmrDate); return 'Not a trip day: ' + tmrDate; }

  const cal = SPREADSHEET.getSheetByName('Calendar');
  if (!cal) { tgSend('⚠️ Calendar sheet not found', MAIN_CHAT); return 'No sheet'; }

  const rows = cal.getDataRange().getValues();
  const h = rows[0];
  const idx = {
    day: h.indexOf('day'), start: h.indexOf('startTime'),
    title: h.indexOf('title'), cat: h.indexOf('category'),
    attire: h.indexOf('attire'), del: h.indexOf('isDeleted')
  };

  const events = rows.slice(1)
    .filter(r => parseInt(r[idx.day]) === d.day && r[idx.del] !== 'true' && r[idx.del] !== true)
    .filter(r => r[idx.cat] !== 'free' && !String(r[idx.title]).toLowerCase().includes('cutoff'))
    .map(r => ({ start: r[idx.start], title: r[idx.title], attire: r[idx.attire] }))
    .sort((a, b) => timeNormalized(a.start) - timeNormalized(b.start));

  const dateLabel = Utilities.formatDate(tmr, 'Asia/Bangkok', 'EEEE, d MMMM');
  let msg = '🔔 <b>Tomorrow — ' + dateLabel + '</b>\n';
  msg += 'Day ' + d.day + ' · ' + d.icon + ' ' + d.theme + '\n\n';

  const max = 12;
  events.slice(0, max).forEach(e => {
    msg += '• ' + e.start + ' — ' + e.title;
    if (e.attire) msg += '  <i>(' + e.attire + ')</i>';
    msg += '\n';
  });
  if (events.length > max) msg += '  …and ' + (events.length - max) + ' more\n';

  msg += '\n📱 Open the app for full details, attire, and locations:';
  msg += '\nhttps://57wbs1.github.io/TSV/';
  msg += '\n\n📍 Please keep your <b>status and room</b> updated in the app — especially when you check in/out of the hotel.';

  tgSend(msg, MAIN_CHAT);
  logAction('reminder_sent', 'server', tmrDate);
  return 'Sent reminder for ' + tmrDate;
}

// Force-test for any specific date (ignores the "is tomorrow a trip day" gate)
function testDailyReminderFor_D1() { return sendDailyReminder('2026-04-26'); }
function testDailyReminderFor_D2() { return sendDailyReminder('2026-04-27'); }
function testDailyReminderFor_D3() { return sendDailyReminder('2026-04-28'); }
function testDailyReminderFor_D4() { return sendDailyReminder('2026-04-29'); }
function testDailyReminderFor_D5() { return sendDailyReminder('2026-04-30'); }

// ── 2300H: Syn 1 SITREP (actual status) ──
function sendEveningSitrep() {
  const membersAll = readSheet(SHEETS.MEMBERS);
  const members = membersAll.filter(m =>
    m.csc === '57 CSC' && String(m.syndicate) === '1' &&
    m.isDeleted !== 'true' && m.isDeleted !== true
  );
  const statuses = readSheet(SHEETS.STATUS);
  const statusMap = {};
  statuses.forEach(s => { statusMap[s.id] = s; });

  const total = members.length;
  const out = members.filter(m => statusMap[m.id] && statusMap[m.id].status === 'out');
  const inCount = total - out.length;

  const bkk = bkkNow();
  const dateLabel = Utilities.formatDate(bkk, 'Asia/Bangkok', 'd MMMM EEEE');

  let msg = '<b>2300H SITREP - ' + dateLabel + '</b>\n';
  msg += '<b>57 SYN 1</b>\n';
  msg += 'IN HOTEL: ' + inCount + '\n';
  msg += 'OUT: ' + out.length + '\n';
  msg += 'TOTAL: ' + total + '\n';
  if (out.length > 0) {
    msg += '\nLocation\n';
    out.forEach(m => {
      const st = statusMap[m.id] || {};
      const loc = (st.locationText || '').toString().trim() || 'Vicinity of Hotel';
      msg += (m.shortName || m.name) + ' - ' + loc + '\n';
    });
  }
  msg += '\nEnd of SITREP';
  tgSend(msg, SYN1_CHAT);
  logAction('sitrep_2300', 'server', inCount + '/' + total);
  return 'Sent 2300H';
}

// ── 0200H: Curfew Report (always-in per spec) ──
function sendMidnightSitrep() {
  const membersAll = readSheet(SHEETS.MEMBERS);
  const members = membersAll.filter(m =>
    m.csc === '57 CSC' && String(m.syndicate) === '1' &&
    m.isDeleted !== 'true' && m.isDeleted !== true
  );
  const total = members.length;

  const bkk = bkkNow();
  // Curfew covers the previous day's night, so use yesterday's date
  const yesterday = new Date(bkk.getTime() - 24*60*60*1000);
  const yLabel = Utilities.formatDate(yesterday, 'Asia/Bangkok', 'd MMMM EEEE');

  let msg = '<b>Curfew Report - ' + yLabel + '</b>\n';
  msg += '<b>57 SYN 1</b>\n';
  msg += 'IN HOTEL: ' + total + '\n';
  msg += 'OUT: 0\n';
  msg += '\nEnd of Curfew Report';
  tgSend(msg, SYN1_CHAT);
  logAction('sitrep_0200', 'server', total + '/' + total);
  return 'Sent 0200H Curfew';
}

// ── Setup: run this ONCE from Apps Script editor ──
function setupAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'sendDailyReminder' || fn === 'sendEveningSitrep' || fn === 'sendMidnightSitrep') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sendDailyReminder')
    .timeBased().atHour(19).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendEveningSitrep')
    .timeBased().atHour(23).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendMidnightSitrep')
    .timeBased().atHour(2).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  return '✓ 3 triggers installed: 1900H reminder · 2300H SITREP · 0200H EOD (all BKK daily)';
}

// Manual tests (run from editor to verify)
function testDailyReminder() { return sendDailyReminder(); }
function testEveningSitrep() { return sendEveningSitrep(); }
function testMidnightSitrep() { return sendMidnightSitrep(); }

// ── PINGS ────────────────────────────────────────────────────
function sendPing(data) {
  const sheet = getOrCreateSheet(SHEETS.PINGS);
  const id = 'P' + Date.now() + Math.floor(Math.random()*1000);
  sheet.appendRow([
    id,
    data.fromId || '',
    data.fromName || '',
    data.toId || '',
    data.message || '',
    new Date().toISOString(),
    'false'
  ]);
  return { id };
}

function getPings(userId) {
  if (!userId) return [];
  const rows = readSheet(SHEETS.PINGS);
  return rows.filter(p => p.toId === userId);
}

function markPingRead(id) {
  const sheet = getOrCreateSheet(SHEETS.PINGS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  const readCol = headers.indexOf('read');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === id) {
      sheet.getRange(i+1, readCol+1).setValue('true');
      return { updated: id };
    }
  }
  return { error: 'not found' };
}

// ── ADMIN REQUESTS ───────────────────────────────────────────
function addAdminRequest(data) {
  const sheet = getOrCreateSheet(SHEETS.ADMINREQ);
  const id = 'AR' + Date.now();
  sheet.appendRow([
    id,
    data.fromId || '',
    data.fromName || '',
    data.fromGroup || '',
    data.message || '',
    new Date().toISOString(),
    'pending',
    '',
    '',
    ''
  ]);
  return { id };
}

// ── HOTWASH ──────────────────────────────────────────────────
function postHotwash(data) {
  try {
    const ss = SpreadsheetApp.openById(HOTWASH_SHEET_ID);
    const tabName = String(data.dayTab || '');
    let sheet = ss.getSheetByName(tabName);
    // If tab doesn't exist, try variations, else create it
    if (!sheet) {
      const sheets = ss.getSheets();
      sheet = sheets.find(s => s.getName().includes(tabName));
    }
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(['Timestamp','Date','Visit','Author','Syndicate','Type','Content']);
      sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#f0f0f0');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      new Date().toISOString(),
      data.date || '',
      data.visitTitle || '',
      data.authorName || '',
      data.syndicate || '',
      data.isAhha || '',
      data.content || ''
    ]);
    logAction('postHotwash', data.authorName || '', tabName);
    return { ok: true, tab: tabName };
  } catch (e) {
    return { error: e.message };
  }
}

function resolveAdminRequest(data) {
  const sheet = getOrCreateSheet(SHEETS.ADMINREQ);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === data.id) {
      rows[i][headers.indexOf('status')] = data.status || 'pending';
      rows[i][headers.indexOf('resolvedBy')] = data.actor || '';
      rows[i][headers.indexOf('resolvedAt')] = new Date().toISOString();
      rows[i][headers.indexOf('reason')] = data.reason || '';
      sheet.getRange(i+1, 1, 1, headers.length).setValues([rows[i]]);
      return { updated: data.id };
    }
  }
  return { error: 'not found' };
}
