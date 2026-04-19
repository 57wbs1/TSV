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
  ADMINREQ:  { name: 'AdminReq',  headers: ['id','fromId','fromName','fromGroup','message','timestamp','status','resolvedBy','resolvedAt','reason'] },
  CALENDAR:  { name: 'Calendar',  headers: ['id','day','startTime','endTime','title','location','category','attire','remarks','visitId','synicReport','oicsJson','isDeleted','createdAt','updatedAt'] },
  REFLECTIONS: { name: 'Reflections', headers: ['id','authorId','authorName','syndicate','day','content','timestamp'] },
  STATUSLOG:   { name: 'StatusLog',   headers: ['timestamp','memberId','status','locationText','lat','lng','buddyWith','actor'] }
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
      case 'getReflections': data = readReflections(); break;
      case 'getStatusLog': data = readStatusLog(e.parameter.memberId || ''); break;
      case 'getPings':    data = getPings(e.parameter.userId || ''); break;
      case 'fixAllPins':  data = fixAllPins(); break;
      case 'resetCasparPin': data = resetCasparPin(); break;
      case 'getBotChats': data = getBotChats(); break;
      case 'testWeather': data = sendWeatherBriefing(); break;
      case 'testEveningSitrep': data = sendEveningSitrep(); break;
      case 'testMidnightSitrep': data = sendMidnightSitrep(); break;
      case 'installTriggers': data = setupAllTriggers(); break;
      case 'getAdminRequests': data = readSheet(SHEETS.ADMINREQ); break;
      default: return json({ ok: false, error: 'Unknown action: ' + action });
    }
    return json({ ok: true, data });
  } catch (err) {
    return json({ ok: false, error: err.message, stack: err.stack });
  }
}

// ── POST handler ─────────────────────────────────────────────
// Actions that mutate state require a valid `actor` that exists in the
// Members sheet. Prevents a random drive-by with the URL from writing
// junk. Not cryptographically secure (the client code is public), but
// blocks everything short of someone pulling a real member ID from git.
const ACTOR_REQUIRED = new Set([
  'updateStatus','addLearning','addReflection','addIncident',
  'addMember','updateMember','deleteMember','seedMembers',
  'sendPing','addAdminRequest','resolveAdminRequest','postHotwash',
  'sendTelegram'
]);

function _validateActor(actor) {
  if (!actor) return false;
  // Allow internal / migration actors
  if (actor === 'migration_v2' || actor === 'system' || actor === SUPER_ADMIN_ID) return true;
  try {
    const rows = readSheet(SHEETS.MEMBERS);
    return rows.some(r => String(r.id) === String(actor) && r.isDeleted !== 'true' && r.isDeleted !== true);
  } catch (e) { return true; /* fail open if sheet read fails */ }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');

    // Detect Telegram webhook payload — has top-level update_id
    if (body.update_id !== undefined) {
      return handleTelegramUpdate(body);
    }

    const action = (body.action || '').trim();

    // Actor gate — mutating actions must come from a known member
    if (ACTOR_REQUIRED.has(action) && !_validateActor(body.actor)) {
      return json({ ok: false, error: 'Unauthorized: unknown actor' });
    }

    let data;

    switch (action) {
      case 'updateStatus': data = updateStatus(body); break;
      case 'addLearning':  data = addLearning(body); break;
      case 'addReflection':data = addReflection(body); break;
      case 'addIncident':  data = addIncident(body); break;
      case 'addMember':    data = addMember(body); break;
      case 'updateMember': data = updateMember(body); break;
      case 'deleteMember': data = deleteMember(body); break;
      case 'seedMembers':  data = seedMembers(body.members || [], body.actor); break;
      case 'sendPing':     data = sendPing(body); break;
      case 'markPingRead': data = markPingRead(body.id); break;
      case 'addAdminRequest':     data = addAdminRequest(body); break;
      case 'resolveAdminRequest': data = resolveAdminRequest(body); break;
      case 'postHotwash':  data = postHotwash(body); break;
      case 'sendTelegram': data = sendTelegramFromServer(body); break;
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

// Super-admin gate — only Caspar can grant/revoke admin rights.
// Matches CONFIG.superAdminId on the client.
const SUPER_ADMIN_ID = 'caspar';

// Force the PIN column to text format so Sheets doesn't coerce
// '0000' → 0 or '1234' → 1234. Cheap; called on every member mutation.
function _ensurePinColumnText(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const pinCol = headers.indexOf('pin');
  if (pinCol < 0) return;
  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, pinCol + 1, lastRow - 1, 1).setNumberFormat('@');
}

function _padPin(v) {
  return String(v == null ? '0000' : v).padStart(4, '0');
}

function addMember(data) {
  const sheet = getOrCreateSheet(SHEETS.MEMBERS);
  _ensurePinColumnText(sheet);
  const id = data.id || ('m_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
  const now = new Date().toISOString();
  const isAdminValue = (data.actor === SUPER_ADMIN_ID) ? (data.isAdmin || 'false') : 'false';
  const pinPadded = _padPin(data.pin);
  sheet.appendRow([
    id,
    data.name || '',
    data.shortName || data.name || '',
    data.rank || '',
    data.role || 'Member',
    data.csc || '',
    data.syndicate || '',
    pinPadded,
    isAdminValue,
    'false',
    now,
    now
  ]);
  // Re-apply text format on the new row's pin cell, then re-set the value
  // to guarantee it lands as a string (appendRow can still coerce otherwise).
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pinCol = headers.indexOf('pin');
  if (pinCol >= 0) {
    const newRow = sheet.getLastRow();
    sheet.getRange(newRow, pinCol + 1).setNumberFormat('@').setValue(pinPadded);
  }
  logAction('addMember', data.actor || '', `${data.name} (${data.csc} S${data.syndicate})`);
  return { id };
}

function updateMember(data) {
  const sheet = getOrCreateSheet(SHEETS.MEMBERS);
  _ensurePinColumnText(sheet);
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
        row[headers.indexOf('pin')] = _padPin(data.pin);
      // Only super-admin may change isAdmin. Silently drop for anyone else.
      if (data.isAdmin !== undefined && headers.indexOf('isAdmin') >= 0
          && data.actor === SUPER_ADMIN_ID)
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
function seedMembers(members, actor) {
  if (!members.length) return { added: 0 };

  // Mutex — one seed per 10 min. Stops two admins opening the app at the
  // same time from each writing the same rows.
  const props = PropertiesService.getScriptProperties();
  const lastSeed = parseInt(props.getProperty('lastSeedTs') || '0');
  const nowTs = Date.now();
  if (nowTs - lastSeed < 10 * 60 * 1000) {
    logAction('seedMembers', actor || '', 'skipped-mutex');
    return { added: 0, skipped: 'mutex-cooling' };
  }
  props.setProperty('lastSeedTs', String(nowTs));

  const sheet = getOrCreateSheet(SHEETS.MEMBERS);
  _ensurePinColumnText(sheet);
  const existing = sheet.getDataRange().getValues().slice(1).map(r => r[0]);
  let added = 0;
  const now = new Date().toISOString();

  members.forEach(m => {
    if (!existing.includes(m.id)) {
      sheet.appendRow([m.id, m.name || '', m.shortName || m.name || '', m.rank || '',
                       m.role || 'Member', m.csc || '', m.syndicate || '',
                       _padPin(m.pin), m.isAdmin || 'false', 'false', now, now]);
      added++;
    }
  });
  // Re-enforce pin text format on all new rows
  _ensurePinColumnText(sheet);
  logAction('seedMembers', actor || '', `added ${added}`);
  return { added, total: members.length };
}

// ── Telegram relay ───────────────────────────────────────────
// Clients no longer ship the bot token (which would be public on GitHub).
// They POST here, server-side holds the token + sends.
const TELEGRAM_BOT_TOKEN = '8623156706:AAHv8vGrjxr1Kj4s8_k3EoruBlx1l_EhziQ';

// Returns every chat the bot has seen recently — essential for finding
// the actual negative group-chat IDs once you've added the bot + sent
// a message in each group.
function getBotChats() {
  try {
    const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/getUpdates', {
      method: 'get', muteHttpExceptions: true
    });
    const body = JSON.parse(res.getContentText());
    if (!body.ok) return { error: body };
    const seen = {};
    (body.result || []).forEach(u => {
      const msg = u.message || u.edited_message || u.channel_post || u.my_chat_member || {};
      const chat = msg.chat || u.my_chat_member?.chat;
      if (!chat) return;
      const key = chat.id + '';
      if (!seen[key]) {
        seen[key] = {
          chatId: chat.id,
          type: chat.type,
          title: chat.title || (chat.first_name ? chat.first_name + (chat.last_name ? ' ' + chat.last_name : '') : ''),
          username: chat.username || '',
          lastMessagePreview: (msg.text || '').slice(0, 60)
        };
      }
    });
    return { chats: Object.values(seen), totalUpdates: (body.result || []).length };
  } catch (e) {
    return { error: e.message };
  }
}

function sendTelegramFromServer(data) {
  const text = data.text || '';
  const chatId = data.chatId || '';
  const parseMode = data.parseMode || 'HTML';
  if (!text || !chatId) return { ok: false, error: 'missing text/chatId' };
  try {
    const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: parseMode }),
      muteHttpExceptions: true
    });
    const body = JSON.parse(res.getContentText());
    return body;
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

  // Append-only audit trail — never overwritten, so admins can reconstruct
  // a member's IN/OUT history even if the live row is later overwritten.
  try {
    const logSheet = getOrCreateSheet(SHEETS.STATUSLOG);
    logSheet.appendRow([
      now,
      data.memberId || '',
      data.status || 'in_hotel',
      data.locationText || '',
      data.lat || '',
      data.lng || '',
      buddyStr,
      data.actor || data.memberId || ''
    ]);
  } catch (e) { /* non-blocking — live status already saved */ }

  logAction('updateStatus', data.memberId, data.status);
  return { updated: data.memberId };
}

function readStatusLog(memberId) {
  const rows = readSheet(SHEETS.STATUSLOG);
  if (!memberId) return rows.slice(-500).reverse();  // last 500 globally
  return rows.filter(r => r.memberId === memberId).reverse();
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

function readReflections() {
  return readSheet(SHEETS.REFLECTIONS).reverse(); // newest first
}

function addReflection(data) {
  const sheet = getOrCreateSheet(SHEETS.REFLECTIONS);
  const id = 'R' + Date.now();
  sheet.appendRow([
    id,
    data.authorId || '',
    data.authorName || '',
    data.syndicate || '',
    data.day || '',
    data.content || '',
    new Date().toISOString()
  ]);
  logAction('addReflection', data.authorId, (data.content || '').substring(0, 50));
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
// MAIN_CHAT → A1 (1900H pre-trip reminders, broad supergroup)
// SYN1_CHAT → A2 (2300H SITREP) + A3 (0200H Curfew Report) — ops group
const MAIN_CHAT   = '-1003468474144';
const SYN1_CHAT   = '-5257572976';

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

// ── 1900H: cheerful next-day preview (to MAIN chat) ──
// Messages are hardcoded here (not read from Calendar sheet) so they're
// always available and can be tweaked freely without touching the app.
const DAILY_PREVIEWS = {
  // ── T-3 · sent on 23 Apr (key is "tomorrow's date") ──
  '2026-04-24':
`⏳ <b>3 days to TSV Bangkok</b>

The countdown is on! 🎒

A gentle nudge — things worth sorting this week:

✅ Passport valid through Oct 2026
✅ Travel insurance confirmed
✅ No. 3 Uniform pressed and packed
✅ Smart casual set ready (long pants, collared top, covered shoes)
✅ Plug adapter (TH uses Type A / B / C)
✅ Personal meds + any prescriptions

—

📱 If you haven't already — install the app on your phone's home screen:

<b>iPhone:</b> Safari → Share → Add to Home Screen

<b>Android:</b> Chrome → ⋮ → Install app

https://57wbs1.github.io/TSV/

Default PIN is <b>0000</b> — change it after first login.

—

Any questions, hit your Syn IC.

Let's go! ✈️`,

  // ── T-2 · sent on 24 Apr ──
  '2026-04-25':
`⏳ <b>2 days to TSV Bangkok</b>

Almost there! 🛫

Final-stretch checklist:

✅ Booking reference received (check your email)
✅ Online check-in opens ~48h out — do it early
✅ Charge everything; pack chargers + power bank
✅ Local currency / card set up
✅ App installed, logged in, PIN changed

—

🏨 <b>Hotel:</b> Pullman Bangkok Hotel G

✈️ <b>Outbound:</b> SQ 708 · 0930H Sun 26 Apr

📍 Check-in opens <b>0600H at Changi T2</b>

—

📱 Open the app → pick your syndicate → pick your name → PIN
https://57wbs1.github.io/TSV/

—

One more sleep after tonight. Rest up today. 🌙`,

  '2026-04-26':
`🇹🇭 🛫 <b>Tomorrow is THE DAY</b>

<b>Sunday, 26 April</b>

<b>Day 1 · ✈️ Arrival & Innovation</b>

Here we go! 🎉

Bright-and-early start at Changi T2.

Check-in from 0600H.

Cohort photo at Dreamscape by 0730H.

Wheels-up on <b>SQ 708 at 0930H</b>. ✈️

Land in Bangkok at 1130H, then straight to lunch.

Out to the <b>Chao Phraya River</b> for a 3-hour Long Tail Boat tour 🚤 — the best way to feel the city's pulse.

Check into <b>Pullman Bangkok Hotel G</b> by 1830H.

Syndicate reflections, then Executive Time from 1930H — explore, eat, rest up. 🏨

—

👔 <b>Attire:</b> Smart Casual (long pants, collared top, covered shoes)

📱 Full schedule in the app:
https://57wbs1.github.io/TSV/

📍 Please <b>update your status & room</b> in the app when you check in!

Let's make it a great start.

See everyone at the airport! 🌟`,

  '2026-04-27':
`🌅 <b>Tomorrow</b>

<b>Monday, 27 April</b>

<b>Day 2 · 🎓 Military & Academic</b>

Big day of learning ahead! 💡

<b>Morning:</b>

Bus out at 0830H for a guided tour of <b>True Digital Park</b>.

Startup culture meets corporate scale — Thailand's innovation story up close. 🏙️

<b>Afternoon:</b>

Quick change into No. 3 Uniform.

Visit <b>ISIS at Chulalongkorn University</b> — two keynote addresses + Q&A on Thailand's security and international affairs. 🎓

Back to Pullman by 1630H for syndicate reflections.

Executive Time from 1730H.

—

👔 <b>Attire:</b>
Smart Casual AM · No. 3 Uniform from 1300H

📱 Full details:
https://57wbs1.github.io/TSV/

📍 Syndicate ICs are tracking — please keep your <b>status</b> updated in the app.

Rest well tonight! 🌙`,

  '2026-04-28':
`🔍 <b>Tomorrow</b>

<b>Tuesday, 28 April</b>

<b>Day 3 · 🔍 SCOPE Day</b>

Field research day! 🗺️

Time to put boots on the ground for the hypotheses.

📍 <b>Syndicate sites:</b>

• Ayutthaya — Heritage & Economy
• Chonburi / Rayong — EEC Corridor
• Kanchanaburi — Society & Memory

Move out by 0800H.

<b>Mandatory check-ins every 4 hours:</b>
1000H · 1400H · 1800H · 2200H

Keep your Syn IC in the loop! 📡

—

👔 <b>Attire:</b> Smart Casual

📱 Group-specific details:
https://57wbs1.github.io/TSV/

📍 Status updates are <b>critical</b> on SCOPE day — please keep the app live throughout!

Stay sharp, stay safe.

Come back with the good stuff. 🎯`,

  '2026-04-29':
`🏛️ <b>Tomorrow</b>

<b>Wednesday, 29 April</b>

<b>Day 4 · 🏛️ Diplomatic & Policy</b>

Our most formal day. Look sharp! 🎖️

<b>Morning:</b>

0830H bus to the <b>Royal Thai Army Command &amp; General Staff College</b>.

Call on Comd, Exchange of Briefs, cohort discussion, campus tour.

A rare chance to engage a partner military institution. 🤝

<b>Afternoon:</b>

SAF Officers head to the <b>Singapore Embassy</b>.

Engagement with DAO at 1400H.

Engagement with the SG Ambassador at 1500H.

Int Officers return to hotel.

Back at Pullman by 1630H for syndicate reflections + comm huddle.

—

👔 <b>Attire:</b> No. 3 Uniform all day

📱 Full details:
https://57wbs1.github.io/TSV/

📍 Please keep your <b>status and room</b> updated in the app.

Bring your A-game.

Both institutions are looking forward to meeting us. 🇸🇬🇹🇭`,

  '2026-04-30':
`🛫 <b>Tomorrow</b>

<b>Thursday, 30 April</b>

<b>Day 5 · 🛫 Reflection & Departure</b>

Last day together — let's bring it home. 🌅

<b>Morning (0600–1030H):</b>

Breakfast + syndicate-level reflections.

Consolidate observations, link back to the PMESII hypotheses, prep the writeup. ✍️

Check-out by 1100H.

Buses roll at 1130H to <b>Suvarnabhumi</b>.

Airport check-in + lunch (self-funded).

Attendance check at the gate by 1430H.

<b>SQ 709 departs 1530H.</b> ✈️

Dinner on the plane.

Land at Changi T2 around 1900H.

Last man out of arrival hall = home.

—

👔 <b>Attire:</b> Smart Casual

📱 Full details:
https://57wbs1.github.io/TSV/

📍 One more round of status updates tomorrow!

Thanks for a great trip.

See everyone at the gate! 👋`
};

// Pass `forceDate` (e.g. '2026-04-26') to test any day regardless of today's date.
function sendDailyReminder(forceDate) {
  const bkk = bkkNow();
  const tmr = forceDate
    ? new Date(forceDate + 'T00:00:00+07:00')
    : new Date(bkk.getTime() + 24*60*60*1000);
  const tmrDate = forceDate || Utilities.formatDate(tmr, 'Asia/Bangkok', 'yyyy-MM-dd');

  const msg = DAILY_PREVIEWS[tmrDate];
  if (!msg) {
    logAction('reminder_skip', 'server', 'not trip day: ' + tmrDate);
    return 'Not a trip-eve day: ' + tmrDate;
  }

  tgSend(msg, MAIN_CHAT);
  logAction('reminder_sent', 'server', tmrDate);
  return 'Sent reminder for ' + tmrDate;
}


// ── SITREP helpers (server-side group formatting) ─────────────
// Mirrors client's memberGroupKey + formatGroupDisplay so the all-syndicate
// SITREP lists groups in the same order and labels as the app.
function _memberGroupKey(m) {
  if (!m) return 'Leadership';
  if (m.csc === 'Staff' || String(m.syndicate) === 'Leadership') return 'Leadership';
  return m.csc + ' Syn ' + m.syndicate;
}
function _formatGroup(gk) {
  if (gk === 'Leadership') return 'PSO';
  var em = gk.match(/^(\d+)(?:th)?\s*CSC\s*\(E\)\s*Syn\s*(\S+)$/i);
  if (em) return em[1] + 'E';
  var mm = gk.match(/^(\d+)(?:th)?\s*CSC\s*Syn\s*(\S+)$/i);
  if (mm) return mm[1] + ' SYN ' + mm[2];
  return gk;
}
function _groupPriority(gk) {
  if (gk === 'Leadership') return 1;  // PSO second after Syn 1
  var main = gk.match(/^57 CSC Syn (\d+)$/i);
  if (main) return parseInt(main[1]) === 1 ? 0 : 10 + parseInt(main[1]);
  var exec = gk.match(/^(\d+)(?:th)?\s*CSC\s*\(E\)/i);
  if (exec) return 100 + parseInt(exec[1]);
  return 999;
}

// Returns: {
//   groups:   [{ gk, label, inC, outCount, total, members, outMembers }, …]  (ordered)
//   totals:   { inC, outC, total }
// }
// If forceAllInGroups is provided (array of group keys), those groups are
// reported as fully IN regardless of their actual Status sheet rows.
function _buildSitrepData(forceAllInGroups) {
  forceAllInGroups = forceAllInGroups || [];
  const members = readSheet(SHEETS.MEMBERS).filter(m =>
    m.isDeleted !== 'true' && m.isDeleted !== true
  );
  const statuses = readSheet(SHEETS.STATUS);
  const statusMap = {};
  statuses.forEach(s => { statusMap[s.id] = s; });

  const byGroup = {};
  members.forEach(m => {
    const gk = _memberGroupKey(m);
    if (!byGroup[gk]) byGroup[gk] = [];
    byGroup[gk].push(m);
  });

  const groupKeys = Object.keys(byGroup).sort((a, b) => _groupPriority(a) - _groupPriority(b));

  const groups = groupKeys.map(gk => {
    const memberList = byGroup[gk];
    const forceAllIn = forceAllInGroups.indexOf(gk) >= 0;
    const outMembers = forceAllIn ? [] : memberList.filter(m => {
      const st = statusMap[m.id];
      return st && st.status === 'out';
    });
    return {
      gk: gk,
      label: _formatGroup(gk),
      total: memberList.length,
      inC: memberList.length - outMembers.length,
      outCount: outMembers.length,
      outMembers: outMembers.map(m => ({
        name: m.shortName || m.name,
        loc: (statusMap[m.id] && statusMap[m.id].locationText || '').toString().trim() || 'Vicinity of Hotel',
        groupLabel: _formatGroup(gk)
      }))
    };
  });

  const totals = groups.reduce((acc, g) => ({
    inC: acc.inC + g.inC,
    outC: acc.outC + g.outCount,
    total: acc.total + g.total
  }), { inC: 0, outC: 0, total: 0 });

  return { groups: groups, totals: totals };
}

function _buildSitrepMessage(data, header, dateLabel) {
  // Header + date on ONE bold line: "2300H SITREP - 19 APR SUN"
  let msg = '<b>' + header + ' - ' + dateLabel + '</b>\n\n';
  data.groups.forEach(g => {
    const pct = g.total ? Math.round(g.inC / g.total * 100) : 0;
    const tick = pct === 100 ? '✅' : '⚠️';
    msg += g.label + ': ' + g.inC + '/' + g.total + ' (' + pct + '%) ' + tick + '\n';
  });
  const outTick = data.totals.outC === 0 ? ' ✅' : '';
  msg += '\n<b>Out: ' + data.totals.outC + '/' + data.totals.total + outTick + '</b>\n';
  msg += '<b>Location: Refer to TSV App for Details</b>\n\n';
  msg += 'End of SITREP';
  return msg;
}

// ── 2300H SITREP: all syndicates, actual status ──
function sendEveningSitrep() {
  const bkk = bkkNow();
  const dateLabel = Utilities.formatDate(bkk, 'Asia/Bangkok', 'd MMM EEE').toUpperCase();
  const data = _buildSitrepData([]);   // no forced all-in
  const msg = _buildSitrepMessage(data, '2300H SITREP', dateLabel);
  tgSend(msg, SYN1_CHAT);
  logAction('sitrep_2300', 'server', data.totals.inC + '/' + data.totals.total);
  return 'Sent 2300H';
}

// ── 0200H SITREP: all syndicates, but Syn 1 forced all-in per curfew spec ──
function sendMidnightSitrep() {
  const bkk = bkkNow();
  const yesterday = new Date(bkk.getTime() - 24*60*60*1000);
  const yLabel = Utilities.formatDate(yesterday, 'Asia/Bangkok', 'd MMM EEE').toUpperCase();
  const data = _buildSitrepData(['57 CSC Syn 1']);   // force Syn 1 all-in only
  const msg = _buildSitrepMessage(data, '0200H SITREP', yLabel);
  tgSend(msg, SYN1_CHAT);
  logAction('sitrep_0200', 'server', data.totals.inC + '/' + data.totals.total);
  return 'Sent 0200H';
}

// ── 0600H: Bangkok weather briefing (to announce chat) ──
// Pulls the day's forecast from Open-Meteo (free, no key) and builds a
// briefing with tailored advice based on max temp + humidity + rain.
function sendWeatherBriefing() {
  const bkk = bkkNow();
  const dateLabel = Utilities.formatDate(bkk, 'Asia/Bangkok', 'EEEE, d MMM');
  const today = Utilities.formatDate(bkk, 'Asia/Bangkok', 'yyyy-MM-dd');

  // Pullman Bangkok (Silom). lat/lng matches CONFIG.hotel on client.
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=13.7256&longitude=100.5279'
    + '&timezone=Asia%2FBangkok'
    + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,'
    +   'uv_index_max,precipitation_sum,precipitation_probability_max,weather_code'
    + '&forecast_days=1';

  let tMax = null, tMin = null, feelsMax = null, uvMax = null, rainSum = 0, rainProb = 0;
  let curT = null, curRH = null, curWind = null, curCode = null, dailyCode = null;
  try {
    const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    const body = JSON.parse(res.getContentText());
    if (body.current) {
      curT    = body.current.temperature_2m;
      curRH   = body.current.relative_humidity_2m;
      curWind = body.current.wind_speed_10m;
      curCode = body.current.weather_code;
    }
    if (body.daily) {
      tMax     = body.daily.temperature_2m_max?.[0];
      tMin     = body.daily.temperature_2m_min?.[0];
      feelsMax = body.daily.apparent_temperature_max?.[0];
      uvMax    = body.daily.uv_index_max?.[0];
      rainSum  = body.daily.precipitation_sum?.[0] || 0;
      rainProb = body.daily.precipitation_probability_max?.[0] || 0;
      dailyCode= body.daily.weather_code?.[0];
    }
  } catch (e) {
    logAction('weather_fail', 'server', e.message);
    tgSend('<b>☀️ Weather briefing</b>\nCouldn\'t reach the weather service — defaulting: stay hydrated, wear light layers, bring rain cover.', MAIN_CHAT);
    return 'Weather fetch failed';
  }

  // Emoji + description for weather code
  const codeMap = {
    0:['☀️','Clear sky'], 1:['🌤️','Mainly clear'], 2:['⛅','Partly cloudy'], 3:['☁️','Overcast'],
    45:['🌫️','Fog'], 48:['🌫️','Rime fog'],
    51:['🌦️','Light drizzle'], 53:['🌦️','Drizzle'], 55:['🌦️','Dense drizzle'],
    61:['🌧️','Light rain'], 63:['🌧️','Rain'], 65:['🌧️','Heavy rain'],
    80:['🌦️','Rain showers'], 81:['🌧️','Heavy showers'], 82:['⛈️','Violent showers'],
    95:['⛈️','Thunderstorm'], 96:['⛈️','Thunder + hail'], 99:['⛈️','Severe thunderstorm']
  };
  const wc = codeMap[dailyCode] || codeMap[curCode] || ['🌡️','Mixed'];

  // Advice engine — layered based on actual conditions
  const tips = [];
  const fMax = feelsMax != null ? feelsMax : tMax;
  if (fMax != null && fMax >= 36)      tips.push('🥵 <b>Feels like ' + Math.round(fMax) + '°C</b> — avoid direct sun 1100–1500H. Hat + sunglasses essential.');
  else if (fMax != null && fMax >= 33) tips.push('☀️ Feels like ' + Math.round(fMax) + '°C — stay in shade when possible.');
  if (tMax != null && tMax >= 34)      tips.push('💧 Carry 1.5–2L water per person. Refill before every move.');
  else                                 tips.push('💧 Carry a 1L bottle — top up at each venue.');
  if (rainProb >= 60 || rainSum >= 5)  tips.push('☂️ <b>' + rainProb + '% rain</b> (up to ' + Math.round(rainSum) + 'mm) — bring a compact umbrella or poncho.');
  else if (rainProb >= 30)             tips.push('🌦️ ' + rainProb + '% chance of rain — pack a small umbrella.');
  if (uvMax != null && uvMax >= 8)     tips.push('🧴 <b>UV ' + Math.round(uvMax) + ' (very high)</b> — SPF 30+ sunscreen, reapply every 2h.');
  else if (uvMax != null && uvMax >= 6)tips.push('🧴 UV ' + Math.round(uvMax) + ' — sunscreen recommended.');
  if (curRH != null && curRH >= 75)    tips.push('💨 Humidity ' + Math.round(curRH) + '% — expect sweat; bring a spare shirt for evening events.');
  if (/uniform|no.?3|no.?4/i.test('') || false) { /* future hook if event attire comes in */ }
  tips.push('🏃 Pace yourselves — Bangkok heat is cumulative across the day.');

  let msg = '<b>🌤️ BKK Weather — ' + dateLabel + '</b>\n';
  msg += '\n' + wc[0] + ' <b>' + wc[1] + '</b>\n';
  if (tMax != null && tMin != null) msg += '🌡️ ' + Math.round(tMin) + '°C → ' + Math.round(tMax) + '°C';
  if (feelsMax != null)              msg += ' · feels ' + Math.round(feelsMax) + '°C';
  msg += '\n';
  if (curT != null)   msg += '⏱️ Now: ' + Math.round(curT) + '°C';
  if (curRH != null)  msg += ' · ' + Math.round(curRH) + '% humidity';
  if (curWind != null)msg += ' · ' + Math.round(curWind) + ' km/h';
  msg += '\n';
  if (rainProb)       msg += '🌧️ Rain: ' + rainProb + '% · ' + (Math.round(rainSum*10)/10) + 'mm\n';
  if (uvMax != null)  msg += '☀️ UV: ' + Math.round(uvMax) + '/11\n';

  msg += '\n<b>Today\'s tips</b>\n' + tips.map(t => '• ' + t).join('\n');
  msg += '\n\nStay sharp 🇹🇭';

  tgSend(msg, MAIN_CHAT);
  logAction('weather_0600', 'server', (tMax||'?') + '°C ' + wc[1]);
  return 'Sent weather ' + today;
}

// ── Setup: run this ONCE from Apps Script editor ──
function setupAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (['sendDailyReminder','sendEveningSitrep','sendMidnightSitrep','sendWeatherBriefing'].indexOf(fn) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sendWeatherBriefing')
    .timeBased().atHour(6).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendDailyReminder')
    .timeBased().atHour(19).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendEveningSitrep')
    .timeBased().atHour(23).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendMidnightSitrep')
    .timeBased().atHour(2).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  return '✓ 4 triggers installed: 0600H weather · 1900H reminder · 2300H SITREP · 0200H Curfew (BKK daily)';
}


// ════════════════════════════════════════════════════════════
// TELEGRAM WEBHOOK — auto-reply to PMs from anyone except Caspar
// One-time setup: run setTelegramWebhook() from the editor.
// ════════════════════════════════════════════════════════════

const OWNER_TELEGRAM_ID = '922547929';  // Caspar — only user bot "answers to"

const AUTO_REPLY = "I am Shaft's bot, and no one elses. i answer to no one but him, and so does he. Please fuck right off we are not interested in anything you have to offer and leave us the fuck alone, Good Day :)";

function handleTelegramUpdate(update) {
  try {
    const msg = update.message || update.edited_message;
    if (!msg || !msg.chat) return json({ ok: true });

    // Only engage in private chats — never in groups or channels
    if (msg.chat.type !== 'private') return json({ ok: true });

    const fromId = String(msg.from && msg.from.id);
    // Ignore the owner so Caspar can DM the bot freely (for future commands)
    if (fromId === OWNER_TELEGRAM_ID) return json({ ok: true });

    // Everyone else gets the auto-reply
    tgSend(AUTO_REPLY, String(msg.chat.id));
    logAction('tg_autoreply', fromId, (msg.from && (msg.from.username || msg.from.first_name)) || '?');
  } catch (e) {
    logAction('tg_autoreply_fail', 'webhook', e.message);
  }
  return json({ ok: true });
}

// Run ONCE to point the bot at this Apps Script web app
function setTelegramWebhook() {
  // Your current deployment URL:
  const url = 'https://script.google.com/macros/s/AKfycbyrrHPMKvtAgjKUJIDfzf-VCzXddgcO4JCvJ3k7C3OqO50oF44-5esCvTID5XNRGrK3/exec';
  const res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + BOT_TOKEN + '/setWebhook?url=' + encodeURIComponent(url),
    { muteHttpExceptions: true }
  );
  const r = res.getContentText();
  logAction('tg_webhook_set', 'setup', r);
  return r;
}

function getTelegramWebhookInfo() {
  const res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + BOT_TOKEN + '/getWebhookInfo',
    { muteHttpExceptions: true }
  );
  return res.getContentText();
}

function removeTelegramWebhook() {
  const res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + BOT_TOKEN + '/deleteWebhook',
    { muteHttpExceptions: true }
  );
  return res.getContentText();
}

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

// One-shot util: reset caspar's PIN to 0000 as TEXT.
function resetCasparPin() {
  const s = SPREADSHEET.getSheetByName(SHEETS.MEMBERS.name);
  _ensurePinColumnText(s);
  const rows = s.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  const pinCol = headers.indexOf('pin');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === 'caspar') {
      s.getRange(i + 1, pinCol + 1).setNumberFormat('@').setValue('0000');
      Logger.log('Reset caspar PIN at row ' + (i + 1));
      return 'Reset caspar PIN at row ' + (i + 1);
    }
  }
  Logger.log('caspar not found');
  return 'caspar not found';
}

// One-shot util: repair every PIN in the Members sheet back to a
// 4-digit zero-padded string. Handles the historical Sheets number
// coercion that broke logins. Run once from Apps Script editor.
function fixAllPins() {
  const s = SPREADSHEET.getSheetByName(SHEETS.MEMBERS.name);
  _ensurePinColumnText(s);
  const rows = s.getDataRange().getValues();
  const headers = rows[0];
  const pinCol = headers.indexOf('pin');
  if (pinCol < 0) return 'no pin column';
  let fixed = 0;
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i][pinCol];
    if (raw === '' || raw == null) continue;
    const padded = _padPin(raw);
    s.getRange(i + 1, pinCol + 1).setNumberFormat('@').setValue(padded);
    fixed++;
  }
  Logger.log('Fixed ' + fixed + ' pin rows');
  return 'Fixed ' + fixed + ' pin rows';
}
