// ============================================================
// TSV PWA — Google Apps Script Backend
// Paste this ENTIRE file into Extensions → Apps Script, then
// Deploy → New Deployment → Web App (Execute as: Me, Access: Anyone)
// ============================================================

// Sheet ID — from https://docs.google.com/spreadsheets/d/<ID>/edit
const SHEET_ID = '19IjTK0I_L2NXJ9afqTxf3GkCXbcONio4ORaw-54JOjY';
const HOTWASH_SHEET_ID = '10gub3Ya6rgq70OnaLxf-yGkt8IrhTPC1f7r2Cj7TuMc';
// External Reflections workbook — each syndicate has its own tab so the
// Learning IC can grab their tab and drop into ChatGPT for consolidation.
const REFLECTIONS_EXT_SHEET_ID = '10zMjWkHqWRhPDAHSzv_WWGpLi96csLflhsuHfBHPfng';      // legacy per-syn-tab workbook
const REFLECTIONS_MATRIX_SHEET_ID = '1ejnk-BgdN1LrVOdpcRo_fyzLtU7tP2QmNjxX1hgk-zg';    // Learning Debrief matrix (native Google Sheet)
const REFLECTIONS_MATRIX_GID = 0;
const SPREADSHEET = SpreadsheetApp.openById(SHEET_ID);

// Sheet schemas
const SHEETS = {
  MEMBERS:   { name: 'Members',   headers: ['id','name','shortName','rank','role','csc','syndicate','pin','isAdmin','isDeleted','createdAt','updatedAt'] },
  STATUS:    { name: 'Status',    headers: ['id','status','locationText','lat','lng','buddyWith','roomNumber','lastUpdated'] },
  LEARNINGS: { name: 'Learnings', headers: ['id','authorId','authorName','day','content','isAhha','timestamp','visitId','visitTitle','syndicate'] },
  INCIDENTS: { name: 'Incidents', headers: ['id','reportedBy','type','who','what','where','when','why','how','status','buddy','medicalFacility','actionsText','timestamp'] },
  LOG:       { name: 'Log',       headers: ['timestamp','action','actor','detail'] },
  PINGS:     { name: 'Pings',     headers: ['id','fromId','fromName','toId','message','timestamp','read'] },
  ADMINREQ:  { name: 'AdminReq',  headers: ['id','fromId','fromName','fromGroup','message','timestamp','status','resolvedBy','resolvedAt','reason'] },
  CALENDAR:  { name: 'Calendar',  headers: ['id','day','startTime','endTime','title','location','category','attire','remarks','visitId','synicReport','oicsJson','isDeleted','createdAt','updatedAt'] },
  REFLECTIONS: { name: 'Reflections', headers: ['id','authorId','authorName','syndicate','day','content','timestamp'] },
  STATUSLOG:   { name: 'StatusLog',   headers: ['timestamp','memberId','status','locationText','lat','lng','buddyWith','actor'] },
  PARADE_STATE: { name: 'ParadeState', headers: ['memberId','status','updatedBy','updatedAt'] }
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
      case 'testForceSyn1AllIn': data = forceSyn1AllIn(); break;
      case 'testParadeState':    data = sendParadeStateBroadcast(); break;
      case 'installTriggers': data = setupAllTriggers(); break;
      case 'diagnose':     data = diagnose(); break;
      case 'resetGcal':
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        PropertiesService.getScriptProperties().deleteProperty(GCAL_PROP_KEY);
        data = { ok: true, cleared: 'tsvGcalId — next createTsvCalendar will build a fresh one' };
        break;
      case 'forcePopulateGcal':
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        data = createTsvCalendar();
        break;
      case 'wipeGcalTripEvents':
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        data = wipeGcalTripEvents();
        break;
      case 'ensureIsAdminColumn':
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        data = ensureIsAdminColumn();
        break;
      case 'setupReflectionsSheet':
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        data = setupReflectionsSheet();
        break;
      case 'createTsvCalendar':
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        data = createTsvCalendar();
        break;
      case 'syncFromGoogleCalendar':
        // Callable by any signed-in user — we want pull-to-refresh to kick
        // a GCal sync so edits in Google Calendar propagate immediately.
        data = syncFromGoogleCalendar();
        break;
      case 'shareTsvCalendarWith':
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        data = shareTsvCalendarWith(e.parameter.email || '');
        break;
      case 'renameTsvCalendar':
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        data = renameTsvCalendar();
        break;
      case 'cleanSlateForTrip':
        // Super-admin only. Requires ?actor=caspar&confirm=YES_CLEAR_ALL
        if (e.parameter.actor !== SUPER_ADMIN_ID) { data = { error: 'Unauthorized' }; break; }
        if (e.parameter.confirm !== 'YES_CLEAR_ALL') { data = { error: 'Missing confirm=YES_CLEAR_ALL' }; break; }
        data = cleanSlateForTrip();
        break;
      case 'getAdminRequests': data = readSheet(SHEETS.ADMINREQ); break;
      case 'getTransport':    data = getTransportState(); break;
      case 'getForceInConfig': data = getForceInConfig(); break;
      case 'getParadeState':   data = readParadeState(); break;
      case 'getTelegramConfig': data = getTelegramConfig(); break;
      case 'getCalendar':
        // Returns Calendar sheet rows with times normalised and oicsJson → oics
        data = readSheet(SHEETS.CALENDAR)
          .filter(r => r.isDeleted !== 'true' && r.isDeleted !== true)
          .map(r => ({
            id:          String(r.id          || ''),
            day:         r.day,
            startTime:   _normalizeHHmm(r.startTime),
            endTime:     _normalizeHHmm(r.endTime),
            title:       String(r.title       || ''),
            location:    String(r.location    || ''),
            category:    String(r.category    || ''),
            attire:      String(r.attire      || ''),
            remarks:     String(r.remarks     || ''),
            visitId:     String(r.visitId     || ''),
            synicReport: r.synicReport === 'true' || r.synicReport === true,
            oics:        (() => { try { return JSON.parse(r.oicsJson || '{}'); } catch(e) { return {}; } })(),
            isDeleted:   false
          }));
        break;
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
  'addMember','updateMember','deleteMember','seedMembers','bulkSyncMembers',
  'sendPing','addAdminRequest','resolveAdminRequest','postHotwash',
  'sendTelegram','updateParadeStatus','sendAdhocParadeState'
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
      case 'bulkSyncMembers': data = bulkSyncMembers(body); break;
      case 'sendPing':     data = sendPing(body); break;
      case 'markPingRead': data = markPingRead(body.id); break;
      case 'addAdminRequest':     data = addAdminRequest(body); break;
      case 'resolveAdminRequest': data = resolveAdminRequest(body); break;
      case 'postHotwash':  data = postHotwash(body); break;
      case 'sendTelegram': data = sendTelegramFromServer(body); break;
      case 'updateEvent':      data = updateCalendarEvent(body); break;
      case 'addEvent':         data = addCalendarEvent(body); break;
      case 'deleteEvent':      data = deleteCalendarEvent(body); break;
      case 'updateTransport':  data = updateTransportState(body); break;
      case 'updateParadeStatus': data = updateParadeStatus(body); break;
      case 'sendAdhocParadeState': data = sendAdhocParadeState(body); break;
      case 'seedCalendar':     data = seedCalendarFromServer(); break;
      case 'updateTelegramConfig':  data = updateTelegramConfig(body); break;
      case 'updateForceInConfig':   data = updateForceInConfig(body); break;
      case 'testRouting':           data = testRouting(body); break;
      default: return json({ ok: false, error: 'Unknown action: ' + action });
    }
    return json({ ok: true, data });
  } catch (err) {
    return json({ ok: false, error: err.message, stack: err.stack });
  }
}

// ────────────────────────────────────────────────────────────
// CALENDAR CRUD
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
// TRANSPORT STATE (ScriptProperties — shared across all users)
// ────────────────────────────────────────────────────────────
const TRANSPORT_PROP_KEY = 'tsvTransport';

function getTransportState() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(TRANSPORT_PROP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function updateTransportState(body) {
  // body: { vehicleId, op, synLabel, actorName, driverName, driverPhone, remarks }
  // op: 'board' | 'unboard' | 'boardBatch' | 'pushing' | 'dropped' | 'reset' | 'editDriver'
  // NOTE: field is `op` (not `action`) because `action` collides with the outer
  // doPost dispatcher key when the client spreads payloads.
  const props = PropertiesService.getScriptProperties();
  let state;
  try { state = JSON.parse(props.getProperty(TRANSPORT_PROP_KEY) || '{}'); }
  catch (e) { state = {}; }

  const vid = body.vehicleId || '';
  if (!vid) return { error: 'Missing vehicleId' };

  if (!state[vid]) state[vid] = { status: 'idle', boardedSyns: [], driver: {} };
  const v = state[vid];
  if (!v.driver) v.driver = {};
  const now = new Date().toISOString();

  // Accept either `op` (new) or `action` (legacy) for backward compat
  const op = body.op || body.action;
  switch (op) {
    case 'board':
      if (body.synLabel && !v.boardedSyns.includes(body.synLabel))
        v.boardedSyns.push(body.synLabel);
      break;
    case 'unboard':
      v.boardedSyns = v.boardedSyns.filter(s => s !== body.synLabel);
      break;
    case 'boardBatch':
      // Replace entire boardedSyns list with the provided array + optional remarks.
      // Used both for "Save Progress" (partial) and "Send SITREP" (complete).
      v.boardedSyns = Array.isArray(body.synLabels) ? body.synLabels : [];
      if (body.remarks !== undefined) v.boardingRemarks = body.remarks || '';
      v.boardingUpdatedBy = body.actorName || '';
      v.boardingUpdatedAt = now;
      break;
    case 'pushing':
      v.status    = 'pushing';
      v.pushedBy  = body.actorName || '';
      v.pushedAt  = now;
      v.remarks   = body.remarks || '';
      break;
    case 'dropped':
      // Bus is freed — clear boarded list + boarding notes, return to idle.
      // Use this between rounds to reset for the next boarding cycle.
      v.status    = 'idle';
      v.boardedSyns = [];
      v.lastDroppedBy = body.actorName || '';
      v.lastDroppedAt = now;
      delete v.pushedBy; delete v.pushedAt; delete v.remarks;
      delete v.boardingRemarks; delete v.boardingUpdatedBy; delete v.boardingUpdatedAt;
      break;
    case 'reset':
      v.status = 'idle';
      v.boardedSyns = [];
      delete v.pushedBy; delete v.pushedAt; delete v.remarks;
      delete v.lastDroppedBy; delete v.lastDroppedAt;
      break;
    case 'editDriver':
      v.driver = { name: body.driverName || '', phone: body.driverPhone || '' };
      break;
  }

  v.updatedAt = now;
  props.setProperty(TRANSPORT_PROP_KEY, JSON.stringify(state));
  logAction('transport_' + op, body.actorName || 'unknown', vid);
  return state;
}


// ── Telegram chat routing config (stored in ScriptProperties) ──
// TG_CHAT_DEFAULTS is defined after MAIN_CHAT/SYN1_CHAT constants (see line ~994).
// Functions below reference it after those constants are initialised.

// Saved format (ScriptProperty 'tsvTelegramChats'):
//   { "A1_weather": { "chatId": "-100...", "enabled": true }, ... }
// Legacy format was plain string chatIds — we still accept and auto-upgrade.
function _readTgSaved() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('tsvTelegramChats') || '{}';
    const parsed = JSON.parse(raw);
    const clean = {};
    Object.keys(parsed).forEach(k => {
      const v = parsed[k];
      if (typeof v === 'string') {
        clean[k] = { chatId: v, enabled: true };       // legacy upgrade
      } else if (v && typeof v === 'object') {
        clean[k] = {
          chatId:  v.chatId !== undefined ? String(v.chatId) : '',
          enabled: v.enabled !== false                   // default true
        };
      }
    });
    return clean;
  } catch(e) { return {}; }
}

function getTelegramConfig() {
  const saved = _readTgSaved();
  const result = {};
  Object.keys(TG_CHAT_DEFAULTS).forEach(k => {
    const def = TG_CHAT_DEFAULTS[k];
    const s = saved[k] || {};
    result[k] = {
      label:     def.label,
      defaultId: def.defaultId,
      chatId:    (s.chatId && s.chatId.length) ? s.chatId : def.defaultId,
      enabled:   s.enabled !== undefined ? s.enabled : def.enabled
    };
  });
  return result;
}

function updateTelegramConfig(body) {
  if (body.actor !== SUPER_ADMIN_ID) return { ok: false, error: 'Unauthorized — super admin only' };
  const updates = body.chats || {};
  const saved = _readTgSaved();
  Object.keys(updates).forEach(k => {
    if (!TG_CHAT_DEFAULTS[k]) return;
    const upd = updates[k];
    if (!saved[k]) saved[k] = {};
    if (typeof upd === 'string') {
      // legacy callers still sending just the chatId string
      saved[k].chatId = upd.trim();
    } else if (upd && typeof upd === 'object') {
      if (upd.chatId !== undefined)  saved[k].chatId  = String(upd.chatId).trim();
      if (upd.enabled !== undefined) saved[k].enabled = !!upd.enabled;
    }
  });
  PropertiesService.getScriptProperties().setProperty('tsvTelegramChats', JSON.stringify(saved));
  logAction('updateTelegramConfig', body.actor, 'updated ' + Object.keys(updates).length + ' keys');
  return getTelegramConfig();
}

// Returns chat ID for a routing key, or null if the key is DISABLED.
// Callers MUST check for null and skip the send.
function _tgChatId(channel) {
  const saved = _readTgSaved();
  const def = TG_CHAT_DEFAULTS[channel];
  const s = saved[channel] || {};
  const enabled = s.enabled !== undefined ? s.enabled : (def ? def.enabled : true);
  if (!enabled) return null;
  return (s.chatId && s.chatId.length) ? s.chatId : (def ? def.defaultId : SYN1_CHAT);
}

// Send a routed message. Respects enable/disable + chat-ID override.
// If overrideChatId is set (test mode), always sends there regardless.
// Returns 'sent' / 'disabled' / 'no-chat' so callers can log.
function _tgSendRouted(msg, channel, overrideChatId) {
  if (overrideChatId) { tgSend(msg, overrideChatId); return 'sent-override'; }
  const chatId = _tgChatId(channel);
  if (chatId === null) {
    logAction('tg_disabled', 'server', channel);
    return 'disabled';
  }
  tgSend(msg, chatId);
  return 'sent';
}

// ── testRouting: fires the ACTUAL message template for a given routing key ──
// to a specified chat ID (the one in the settings input, not the saved one).
// Lets the super-admin QC the real message format before committing a chat ID.
function testRouting(body) {
  const key    = String(body.key || '').trim();
  const chatId = String(body.chatId || '').trim();
  if (!key || !chatId) return { ok: false, error: 'Missing key or chatId' };

  try {
    switch (key) {
      case 'A1_weather':    sendWeatherBriefing(chatId);      return { ok: true, sent: 'A1 weather briefing' };
      case 'A2_reminder':   sendDailyReminder(null, chatId);  return { ok: true, sent: 'A2 pre-trip reminder' };
      case 'A3_evening':    sendEveningSitrep(chatId);        return { ok: true, sent: 'A3 evening sitrep' };
      case 'A4_midnight':   sendMidnightSitrep(chatId);       return { ok: true, sent: 'A4 midnight curfew sitrep' };
      case 'A5_parade':     sendParadeStateBroadcast(chatId); return { ok: true, sent: 'A5 parade state' };
      case 'M1_ir':             _sendSampleM(chatId, 'M1');  return { ok: true, sent: 'M1 incident report sample' };
      case 'M2_bus_boarding':   _sendSampleM(chatId, 'M2');  return { ok: true, sent: 'M2 bus boarding sample' };
      case 'M3_bus_pushing':    _sendSampleM(chatId, 'M3');  return { ok: true, sent: 'M3 bus pushing sample' };
      case 'M4_flight_board':   _sendSampleM(chatId, 'M4');  return { ok: true, sent: 'M4 flight boarding sample' };
      case 'M5_sitrep':         _sendSampleM(chatId, 'M5');  return { ok: true, sent: 'M5 ad-hoc sitrep sample' };
      case 'M6_all_back_in':    _sendSampleM(chatId, 'M6');  return { ok: true, sent: 'M6 all-back-in sample' };
      case 'M7_parade':
        // Fire the REAL parade state template (built from live data) to the test chat
        tgSend(_buildParadeStateMessage(), chatId);
        return { ok: true, sent: 'M7 ad-hoc parade state' };
      default: return { ok: false, error: 'Unknown routing key: ' + key };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Sample message builders for M-series (client-triggered messages).
// These mirror what the PWA actually sends, so the QC is faithful.
function _sendSampleM(chatId, which) {
  const now = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Bangkok' }).replace(':','');
  let msg = '<i>[TEST PREVIEW — this is the live format for M-series messages]</i>\n\n';
  switch (which) {
    case 'M1': // Incident Report
      msg += `🚨 <b>INCIDENT REPORT</b>

<b>Type:</b> Medical (minor)
<b>Who:</b> CPT John Tan (25E)
<b>What:</b> Mild heat exhaustion during outdoor visit
<b>Where:</b> True Digital Park, Bangkok
<b>When:</b> 28 Apr 1430H
<b>Why:</b> Extended outdoor exposure in high humidity
<b>How:</b> Hydration + rest in AC area

<b>Buddy:</b> CPT Alex Lim
<b>Status:</b> Recovered, monitored
<b>Medical:</b> Onsite first aid, no hospital needed

<b>Actions taken:</b>
• Moved to shade + air-conditioned area
• Oral rehydration + electrolytes
• Monitored 30 min — vitals normal
• Resumed participation

— End of IR —`;
      break;

    case 'M2': // Bus Boarding Sitrep
      msg += `🚌 <b>Boarding Update — Bus 1</b>
Boarded (75%): Syn 1, 27E, DS1
Driver: Khun Somsak
⚠️ Remarks: Dy CC delayed — 5 min away
🕐 ${now}H`;
      break;

    case 'M3': // Bus Pushing Sitrep
      msg += `🚌 <b>Bus 1 is pushing</b>
Pax: Syn 1, 27E, Dy CC, DS1
Driver: Khun Somsak (+66 81 234 5678)
⚠️ Remarks: 1 pax from Syn 1 joining Bus 2 (seating rearrangement)
🕐 ${now}H`;
      break;

    case 'M4': // Flight Boarding Sitrep
      msg += `✈️ <b>Boarding Update — SQ708 · SIN→BKK (0930H)</b>
Boarded: Syn 1, 27E, Dy CC, DS1, Syn 3, 26E, DS3, DSE, Syn 4, 25E, DS4, CXO, HOD, SO
⚠️ Remarks: All present at gate. Boarding commenced 0900H.
🕐 ${now}H`;
      break;

    case 'M5': // Ad-hoc Sitrep / Parade State
      msg += `<b>ADHOC SITREP</b>
${now}H

In Hotel
57 SYN 1: 10/11 (91%) ⚠️

Refer to TSV App for Details`;
      break;

    case 'M6': // All-Back-In Confirmation
      msg += `<b>ALL BACK IN — 57 SYN 1</b>
${now}H

57 SYN 1: 11/11 (100%) ✅
All members accounted for in hotel.

Refer to TSV App for Details`;
      break;

    default:
      msg += '(Unknown M-series key)';
  }
  tgSend(msg, chatId);
}

// ────────────────────────────────────────────────────────────
// CALENDAR CRUD
// ────────────────────────────────────────────────────────────
function _calSheet() { return getOrCreateSheet(SHEETS.CALENDAR); }
function _calHeaders(sheet) {
  const rows = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues();
  return rows[0];
}

function updateCalendarEvent(body) {
  const sheet = _calSheet();
  const rows  = sheet.getDataRange().getValues();
  const h     = rows[0];
  const idCol = h.indexOf('id');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) !== String(body.id)) continue;
    const now = new Date().toISOString();
    const newRow = h.map(col => {
      switch (col) {
        case 'id':          return body.id;
        case 'day':         return body.day || rows[i][h.indexOf('day')];
        case 'startTime':   return body.startTime || '';
        case 'endTime':     return body.endTime || '';
        case 'title':       return body.title || '';
        case 'location':    return body.location || '';
        case 'category':    return body.category || 'event';
        case 'attire':      return body.attire || '';
        case 'remarks':     return body.remarks || '';
        case 'visitId':     return body.visitId || '';
        case 'synicReport': return body.synicReport ? 'true' : 'false';
        case 'oicsJson':    return typeof body.oics === 'object' ? JSON.stringify(body.oics) : (body.oicsJson || '{}');
        case 'isDeleted':   return 'false';
        case 'createdAt':   return rows[i][h.indexOf('createdAt')] || now;
        case 'updatedAt':   return now;
        default:            return rows[i][h.indexOf(col)] || '';
      }
    });
    sheet.getRange(i + 1, 1, 1, h.length).setValues([newRow]);
    logAction('updateEvent', body.actor || 'unknown', body.id);
    return { updated: body.id };
  }
  return { error: 'Event not found: ' + body.id };
}

function addCalendarEvent(body) {
  const sheet = _calSheet();
  const now   = new Date().toISOString();
  const h     = _calHeaders(sheet);
  const newRow = h.map(col => {
    switch (col) {
      case 'id':          return body.id || ('ev_' + Date.now());
      case 'day':         return body.day || 1;
      case 'startTime':   return body.startTime || '';
      case 'endTime':     return body.endTime || '';
      case 'title':       return body.title || '';
      case 'location':    return body.location || '';
      case 'category':    return body.category || 'event';
      case 'attire':      return body.attire || '';
      case 'remarks':     return body.remarks || '';
      case 'visitId':     return body.visitId || '';
      case 'synicReport': return body.synicReport ? 'true' : 'false';
      case 'oicsJson':    return typeof body.oics === 'object' ? JSON.stringify(body.oics) : (body.oicsJson || '{}');
      case 'isDeleted':   return 'false';
      case 'createdAt':   return now;
      case 'updatedAt':   return now;
      default:            return '';
    }
  });
  sheet.appendRow(newRow);
  logAction('addEvent', body.actor || 'unknown', body.id || '');
  return { added: body.id };
}

function deleteCalendarEvent(body) {
  const sheet = _calSheet();
  const rows  = sheet.getDataRange().getValues();
  const h     = rows[0];
  const idCol = h.indexOf('id');
  const delCol = h.indexOf('isDeleted');
  const updCol = h.indexOf('updatedAt');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) !== String(body.id)) continue;
    if (delCol >= 0) sheet.getRange(i + 1, delCol + 1).setValue('true');
    if (updCol >= 0) sheet.getRange(i + 1, updCol + 1).setValue(new Date().toISOString());
    logAction('deleteEvent', body.actor || 'unknown', body.id);
    return { deleted: body.id };
  }
  return { error: 'Event not found: ' + body.id };
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

// ── bulkSyncMembers: full roster reconciliation (super-admin only) ──
// Upserts existing rows (name, shortName, rank, role, csc, syndicate — never
// pin / isAdmin flags) and soft-deletes any row whose id isn't in the input.
// Preserves PINs so existing users can still log in with their custom PINs.
function bulkSyncMembers(body) {
  if (body.actor !== SUPER_ADMIN_ID) return { ok: false, error: 'Unauthorized — super admin only' };
  const newRoster = Array.isArray(body.members) ? body.members : [];
  if (!newRoster.length) return { ok: false, error: 'Empty roster — refuse to wipe sheet' };

  const sheet = getOrCreateSheet(SHEETS.MEMBERS);
  _ensurePinColumnText(sheet);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const now = new Date().toISOString();

  const col = {
    id:        headers.indexOf('id'),
    name:      headers.indexOf('name'),
    shortName: headers.indexOf('shortName'),
    rank:      headers.indexOf('rank'),
    role:      headers.indexOf('role'),
    csc:       headers.indexOf('csc'),
    syndicate: headers.indexOf('syndicate'),
    pin:       headers.indexOf('pin'),
    isAdmin:   headers.indexOf('isAdmin'),
    isDeleted: headers.indexOf('isDeleted'),
    createdAt: headers.indexOf('createdAt'),
    updatedAt: headers.indexOf('updatedAt')
  };

  const existingById = {};
  for (let i = 1; i < rows.length; i++) {
    const id = rows[i][col.id];
    if (id) existingById[id] = i + 1;    // 1-indexed row number
  }
  const newIds = new Set(newRoster.map(m => m.id).filter(Boolean));

  let updated = 0, added = 0, softDeleted = 0, restored = 0;

  newRoster.forEach(m => {
    const rowNum = existingById[m.id];
    if (rowNum) {
      // Existing — update fields but keep pin + isAdmin + createdAt
      const r = rows[rowNum - 1];
      const currentIsDeleted = String(r[col.isDeleted]) === 'true' || r[col.isDeleted] === true;
      if (col.name      >= 0) sheet.getRange(rowNum, col.name      + 1).setValue(m.name      || r[col.name]);
      if (col.shortName >= 0) sheet.getRange(rowNum, col.shortName + 1).setValue(m.shortName || r[col.shortName]);
      if (col.rank      >= 0) sheet.getRange(rowNum, col.rank      + 1).setValue(m.rank      || r[col.rank]);
      if (col.role      >= 0) sheet.getRange(rowNum, col.role      + 1).setValue(m.role      || r[col.role]);
      if (col.csc       >= 0) sheet.getRange(rowNum, col.csc       + 1).setValue(m.csc       || r[col.csc]);
      if (col.syndicate >= 0) sheet.getRange(rowNum, col.syndicate + 1).setValue(m.syndicate || r[col.syndicate]);
      if (currentIsDeleted && col.isDeleted >= 0) {
        sheet.getRange(rowNum, col.isDeleted + 1).setValue('false');
        restored++;
      }
      if (col.updatedAt >= 0) sheet.getRange(rowNum, col.updatedAt + 1).setValue(now);
      updated++;
    } else {
      // New member — full row
      sheet.appendRow([m.id, m.name || '', m.shortName || m.name || '', m.rank || '',
                       m.role || 'Member', m.csc || '', m.syndicate || '',
                       _padPin(m.pin), m.isAdmin || 'false', 'false', now, now]);
      added++;
    }
  });

  // Soft-delete anything in the sheet but not in the new roster
  Object.keys(existingById).forEach(id => {
    if (newIds.has(id)) return;
    const rowNum = existingById[id];
    const currentIsDeleted = String(rows[rowNum - 1][col.isDeleted]) === 'true' || rows[rowNum - 1][col.isDeleted] === true;
    if (!currentIsDeleted && col.isDeleted >= 0) {
      sheet.getRange(rowNum, col.isDeleted + 1).setValue('true');
      if (col.updatedAt >= 0) sheet.getRange(rowNum, col.updatedAt + 1).setValue(now);
      softDeleted++;
    }
  });

  _ensurePinColumnText(sheet);
  logAction('bulkSyncMembers', body.actor, `+${added} ~${updated} -${softDeleted} restored=${restored}`);
  return { ok: true, added, updated, softDeleted, restored, totalInRoster: newRoster.length };
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

// Ensures visitId/visitTitle/syndicate columns exist on the Learnings sheet.
// Safe to call on every write — only adds columns that are missing.
function _ensureLearningsColumns(sheet) {
  if (sheet.getLastRow() === 0) return;
  const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  ['visitId', 'visitTitle', 'syndicate'].forEach(col => {
    if (!existing.includes(col)) {
      const nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue(col);
      existing.push(col);
    }
  });
}

function addLearning(data) {
  const sheet = getOrCreateSheet(SHEETS.LEARNINGS);
  _ensureLearningsColumns(sheet);
  // Build row from the actual header order (handles both old 7-col and new 10-col sheets)
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const id = 'L' + Date.now();
  const vals = {
    id,
    authorId:   data.authorId   || '',
    authorName: data.authorName || '',
    day:        data.day        || '',
    content:    data.content    || '',
    isAhha:     data.isAhha ? 'true' : 'false',
    timestamp:  new Date().toISOString(),
    visitId:    data.visitId    || '',
    visitTitle: data.visitTitle || '',
    syndicate:  data.syndicate  || ''
  };
  sheet.appendRow(headers.map(h => (vals[h] !== undefined ? vals[h] : '')));
  logAction('addLearning', data.authorId, (data.content || '').substring(0, 50));
  return { id };
}

function readReflections() {
  return readSheet(SHEETS.REFLECTIONS).reverse(); // newest first
}

function addReflection(data) {
  const sheet = getOrCreateSheet(SHEETS.REFLECTIONS);
  const id = 'R' + Date.now();
  const nowIso = new Date().toISOString();
  // Concatenate the 4 fields into a single `content` string for the internal
  // feed display. Preserves structure for the section parser.
  const composed = [
    data.obs      && 'Key Observations:\n'     + data.obs,
    data.patterns && 'Patterns & Hypothesis:\n' + data.patterns,
    data.impl     && 'Implications for Singapore:\n' + data.impl,
    data.ahha     && 'Ah-Ha Moments:\n'        + data.ahha
  ].filter(Boolean).join('\n\n') || (data.content || '');

  sheet.appendRow([
    id,
    data.authorId || '',
    data.authorName || '',
    data.syndicate || '',
    data.day || '',
    composed,
    nowIso
  ]);
  // Best-effort write to the external Learning Debrief matrix sheet.
  // Fully defensive: any error (permission, file-not-a-native-Sheet, network)
  // is swallowed so the internal save above always succeeds.
  let matrixResult = 'skipped';
  try {
    matrixResult = appendReflectionMatrix(data, nowIso);
  } catch (e) {
    matrixResult = 'error:' + (e && e.message ? e.message : String(e));
    try { logAction('reflection_matrix_fail', 'server', matrixResult.slice(0, 200)); } catch (_) {}
  }
  try { logAction('addReflection', data.authorId, (data.syndicate || '') + ' · matrix=' + matrixResult.slice(0, 40)); } catch (_) {}
  return { id, matrixResult };
}

// ── Learning Debrief Matrix ───────────────────────────────────
// Target layout (single tab):
//   Row 1 headers: | Learning Debrief | Syn 1 (P) | Syn 3 (M) | Syn 4 (E) | 25E (S) | 26E (I) | 27E (Infra)
//   Row 2: Key observations ...
//   Row 3: Patterns & Hypothesis Testing ...
//   Row 4: Implications for Singapore ...
//   Row 5: Ah-ha moments ...
// Each incoming reflection appends its 4 field values to the corresponding
// (row, syn-col) cells — accumulating author-tagged entries.
const MATRIX_SYN_COLUMN = {
  '57 SYN 1':    2,   // B — Political
  '57 SYN 3':    3,   // C — Military
  '57 SYN 4':    4,   // D — Economic
  '25E':         5,   // E — Social
  '26E':         6,   // F — Information
  '27E':         7,   // G — Infrastructure
  // Edge cases — attach to Syn 1 (PMESII Political) for lack of own column
  'PSO':         2,
  'Leadership':  2,
  '57 SYN 9':    2
};
const MATRIX_FIELD_ROW = {
  obs:      2,   // "Key observations"
  patterns: 3,   // "Patterns & Hypothesis Testing"
  impl:     4,   // "Implications (if any) for Singapore"
  ahha:     5    // "Ah-ha moments"
};

function _matrixSynColumn(syndicate) {
  const s = String(syndicate || '').trim();
  if (MATRIX_SYN_COLUMN[s] !== undefined) return MATRIX_SYN_COLUMN[s];
  // Fuzzy fallback
  if (/^57\s*SYN\s*1$/i.test(s)) return MATRIX_SYN_COLUMN['57 SYN 1'];
  if (/^57\s*SYN\s*3$/i.test(s)) return MATRIX_SYN_COLUMN['57 SYN 3'];
  if (/^57\s*SYN\s*4$/i.test(s)) return MATRIX_SYN_COLUMN['57 SYN 4'];
  if (/^25\s*E$/i.test(s))       return MATRIX_SYN_COLUMN['25E'];
  if (/^26\s*E$/i.test(s))       return MATRIX_SYN_COLUMN['26E'];
  if (/^27\s*E$/i.test(s))       return MATRIX_SYN_COLUMN['27E'];
  return MATRIX_SYN_COLUMN['57 SYN 1'];   // safe default
}

// Standard matrix scaffold: 1 header row + 4 prompt rows × 7 columns (label + 6 syns).
const MATRIX_HEADERS = [
  'Learning Debrief',
  'Syn 1 (Political)',
  'Syn 3 (Military)',
  'Syn 4 (Economic)',
  '25E (Social)',
  '26E (Info)',
  '27E (Infra)'
];
const MATRIX_PROMPT_LABELS = {
  2: 'Key observations\n\nWhat were the top 2-3 field observations in your PMESII domain?',
  3: 'Patterns & Hypothesis Testing\n\nHow did the key observations relate to PMESII and the learning hypothesis? Any findings, confirmations, surprises or gaps?',
  4: 'Implications (if any) for Singapore\n\nAny strategic (Singapore, ASEAN), operational (defence, civil, organisational, etc), or personal (leadership, professional) insights?',
  5: 'Ah-ha moments\n\nAny significant points to share, cross-PMESII linkages observed, matters to escalate'
};

// Trip day → display date. Keep in sync with js/data.js DAYS[].
const TRIP_DAY_DATES = {
  '1': { label: '26 Apr', bkkDate: '2026-04-26' },   // Day 1 · Sun · SIN→BKK
  '2': { label: '27 Apr', bkkDate: '2026-04-27' },
  '3': { label: '28 Apr', bkkDate: '2026-04-28' },
  '4': { label: '29 Apr', bkkDate: '2026-04-29' },
  '5': { label: '30 Apr', bkkDate: '2026-04-30' }    // Day 5 · Thu · BKK→SIN
};
function _matrixTabNameForDay(day) {
  const key = String(day || '').trim();
  const meta = TRIP_DAY_DATES[key];
  if (meta) return `Day ${key} · ${meta.label}`;
  return 'General';     // unknown / missing day → collect-all tab
}

// Ensure the matrix scaffold exists in the given tab: headers on row 1,
// prompts in column A rows 2-5. Safe to call repeatedly.
function _ensureMatrixScaffold(tab) {
  const headerRange = tab.getRange(1, 1, 1, MATRIX_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const headersMissing = currentHeaders.every(c => !String(c || '').trim());
  if (headersMissing) {
    headerRange.setValues([MATRIX_HEADERS])
      .setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff')
      .setVerticalAlignment('middle').setHorizontalAlignment('center');
    tab.setFrozenRows(1);
    tab.setColumnWidth(1, 240);
    for (let c = 2; c <= MATRIX_HEADERS.length; c++) tab.setColumnWidth(c, 280);
  }
  [2, 3, 4, 5].forEach(row => {
    const cell = tab.getRange(row, 1);
    if (!String(cell.getValue() || '').trim()) {
      cell.setValue(MATRIX_PROMPT_LABELS[row])
          .setFontWeight('bold').setWrap(true).setVerticalAlignment('top')
          .setBackground('#e0e7ff');
      tab.setRowHeight(row, 140);
    }
  });
}

// Get (or create) the tab for this trip day. Each day has its own matrix.
function _ensureDayTab(ss, day) {
  const tabName = _matrixTabNameForDay(day);
  let tab = ss.getSheetByName(tabName);
  if (!tab) {
    tab = ss.insertSheet(tabName);
    _ensureMatrixScaffold(tab);
    // Drop the default 'Sheet1' if it's empty and we now have named tabs
    try {
      const s1 = ss.getSheetByName('Sheet1');
      if (s1 && s1.getLastRow() <= 1 && s1.getSheetId() !== tab.getSheetId()) {
        ss.deleteSheet(s1);
      }
    } catch (e) { /* ignore */ }
  } else {
    _ensureMatrixScaffold(tab);
  }
  return { tab, tabName };
}

function appendReflectionMatrix(data, timestampIso) {
  // Concurrent writes from multiple members submitting to the same cell
  // would race (classic read-modify-write: both read empty, both write, one
  // overwrites the other). LockService serializes all reflection writes
  // across all Apps Script instances so no data is lost.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);   // wait up to 25s for the lock
  } catch (e) {
    // Couldn't acquire — very rare. Better to proceed than drop the entry.
    logAction('reflection_lock_timeout', 'server', 'proceeding without lock');
  }
  try {
    const ss = SpreadsheetApp.openById(REFLECTIONS_MATRIX_SHEET_ID);
    const { tab, tabName } = _ensureDayTab(ss, data.day);

    const col = _matrixSynColumn(data.syndicate);
    const bkkTs = Utilities.formatDate(new Date(timestampIso), 'Asia/Bangkok', 'd MMM · HH:mm');
    const author = (data.authorName || data.authorId || 'Anon').toString();
    const header = `— ${author} · ${bkkTs}H —`;

    const fields = ['obs', 'patterns', 'impl', 'ahha'];
    let wrote = 0;
    fields.forEach(f => {
      const value = (data[f] || '').toString().trim();
      if (!value) return;
      const row = MATRIX_FIELD_ROW[f];
      const cell = tab.getRange(row, col);
      const existing = String(cell.getValue() || '').trim();
      const entry = `${header}\n${value}`;
      const combined = existing ? `${existing}\n\n${entry}` : entry;
      cell.setValue(combined);
      cell.setWrap(true);
      cell.setVerticalAlignment('top');
      wrote++;
    });
    // Force the write to flush before releasing the lock (otherwise a
    // pending batch could commit after the next lock-holder starts reading).
    SpreadsheetApp.flush();
    return `ok · tab "${tabName}" · wrote ${wrote} fields to col ${col}`;
  } finally {
    try { if (lock.hasLock()) lock.releaseLock(); } catch (e) { /* ignore */ }
  }
}

// Tabs on the external workbook — one per syndicate for the Learning IC.
// ChatGPT-friendly Q&A layout: timestamp, day, author, then the four
// reflection-template sections split into columns + raw content as a
// catch-all for unstructured submissions.
const REFLECTION_TABS = ['57 SYN 1', '57 SYN 3', '57 SYN 4', '25E', '26E', '27E'];
const REFLECTION_HEADERS = [
  'Timestamp (BKK)', 'Day', 'Author',
  'Q: Observations',
  'Q: Implications for SG / SAF',
  'Q: Key Takeaway / Ah-Ha',
  'Q: Follow-up Questions',
  'Raw Content'
];

// Returns the tab name for a given syndicate label (as app would send it).
// e.g. 'PSO', '57 SYN 1' → '57 SYN 1'; '25E' → '25E'.
function _reflectionTabFor(syndicate) {
  const s = String(syndicate || '').trim();
  if (!s) return '57 SYN 1';
  // Normalise common variants
  if (/^57\s*SYN\s*1$/i.test(s)) return '57 SYN 1';
  if (/^57\s*SYN\s*3$/i.test(s)) return '57 SYN 3';
  if (/^57\s*SYN\s*4$/i.test(s)) return '57 SYN 4';
  if (/^25\s*E$/i.test(s))  return '25E';
  if (/^26\s*E$/i.test(s))  return '26E';
  if (/^27\s*E$/i.test(s))  return '27E';
  if (/^PSO|LEAD/i.test(s)) return '57 SYN 1';   // PSO contributions land under Syn 1
  return s;
}

// Parse the reflection template sections out of free-form text. Looks
// for the exact headings used in REFLECTION_TEMPLATE. Returns columns
// [observations, implications, ahha, followups] — empty string if not
// found. If user didn't use the template, everything goes to Raw Content.
function _parseReflectionSections(text) {
  const t = String(text || '');
  const sections = { observations: '', implications: '', ahha: '', followups: '' };
  // Flexible matching — headers can be slightly reworded
  const patterns = [
    { key: 'observations', re: /what did we observe\?([\s\S]*?)(?=what does it mean|key takeaway|follow[-\s]*up|$)/i },
    { key: 'implications',  re: /what does it mean[^\n]*([\s\S]*?)(?=key takeaway|follow[-\s]*up|$)/i },
    { key: 'ahha',          re: /key takeaway[^\n]*([\s\S]*?)(?=follow[-\s]*up|$)/i },
    { key: 'followups',     re: /follow[-\s]*up[^\n]*([\s\S]*?)$/i }
  ];
  patterns.forEach(p => {
    const m = t.match(p.re);
    if (m && m[1]) sections[p.key] = m[1].trim().replace(/^[•\-\*]\s*/gm, '• ');
  });
  return sections;
}

function appendReflectionExternal(data, timestampIso) {
  const ss = SpreadsheetApp.openById(REFLECTIONS_EXT_SHEET_ID);
  const tabName = _reflectionTabFor(data.syndicate);
  let tab = ss.getSheetByName(tabName);
  if (!tab) {
    tab = ss.insertSheet(tabName);
    tab.getRange(1, 1, 1, REFLECTION_HEADERS.length).setValues([REFLECTION_HEADERS]).setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    tab.setFrozenRows(1);
    tab.setColumnWidths(1, 1, 160);
    tab.setColumnWidths(2, 1, 60);
    tab.setColumnWidths(3, 1, 140);
    for (let c = 4; c <= 7; c++) tab.setColumnWidths(c, 1, 340);
    tab.setColumnWidths(8, 1, 400);
  }
  const bkkTs = Utilities.formatDate(new Date(timestampIso), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  const s = _parseReflectionSections(data.content);
  tab.appendRow([
    bkkTs,
    data.day ? 'Day ' + data.day : '',
    data.authorName || '',
    s.observations,
    s.implications,
    s.ahha,
    s.followups,
    data.content || ''
  ]);
}

// One-shot util: initialise all six syndicate tabs in the external
// Reflections workbook with headers + formatting. Safe to run multiple
// times — skips tabs that already exist.
function setupReflectionsSheet() {
  const ss = SpreadsheetApp.openById(REFLECTIONS_EXT_SHEET_ID);
  const created = [];
  REFLECTION_TABS.forEach(name => {
    if (ss.getSheetByName(name)) { created.push(name + ' (exists)'); return; }
    const tab = ss.insertSheet(name);
    tab.getRange(1, 1, 1, REFLECTION_HEADERS.length).setValues([REFLECTION_HEADERS]).setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    tab.setFrozenRows(1);
    tab.setColumnWidths(1, 1, 160);
    tab.setColumnWidths(2, 1, 60);
    tab.setColumnWidths(3, 1, 140);
    for (let c = 4; c <= 7; c++) tab.setColumnWidths(c, 1, 340);
    tab.setColumnWidths(8, 1, 400);
    created.push(name + ' (created)');
  });
  // Drop the default 'Sheet1' if it's empty and we now have named tabs
  const sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() <= 1 && ss.getSheets().length > 1) {
    ss.deleteSheet(sheet1);
    created.push('Sheet1 (removed)');
  }
  return { tabs: created };
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

// ── Telegram chat routing defaults ──────────────────────────
// A-series: server-scheduled broadcasts (0600H/1900H/2300H/0200H)
// M-series: client-triggered ad-hoc messages from the PWA
// Each key has { label, defaultId, enabled } — super admin can override
// chatId (the actual destination) AND enabled (skip if false) in Settings.
const TG_CHAT_DEFAULTS = {
  A1_weather:       { label: 'A1 · 0600H Weather Briefing',         defaultId: MAIN_CHAT,  enabled: true },
  A2_reminder:      { label: 'A2 · 1900H Pre-trip Reminder',        defaultId: MAIN_CHAT,  enabled: true },
  A3_evening:       { label: 'A3 · 2300H Evening Sitrep',           defaultId: SYN1_CHAT,  enabled: true },
  A4_midnight:      { label: 'A4 · 0200H Midnight Curfew Report',   defaultId: SYN1_CHAT,  enabled: true },
  A5_parade:        { label: 'A5 · 0830H Parade State',             defaultId: SYN1_CHAT,  enabled: true },
  M1_ir:            { label: 'M1 · Incident Report (IR)',           defaultId: SYN1_CHAT,  enabled: true },
  M2_bus_boarding:  { label: 'M2 · Bus Boarding Sitrep',            defaultId: SYN1_CHAT,  enabled: true },
  M3_bus_pushing:   { label: 'M3 · Bus Pushing Sitrep',             defaultId: SYN1_CHAT,  enabled: true },
  M4_flight_board:  { label: 'M4 · Flight Boarding Sitrep',         defaultId: SYN1_CHAT,  enabled: true },
  M5_sitrep:        { label: 'M5 · Ad-hoc Sitrep',                  defaultId: SYN1_CHAT,  enabled: true },
  M6_all_back_in:   { label: 'M6 · All-Back-In Confirmation',       defaultId: SYN1_CHAT,  enabled: true },
  M7_parade:        { label: 'M7 · Ad-hoc Parade State',            defaultId: SYN1_CHAT,  enabled: true }
};

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
  // ── T-5 · sent on 20 Apr (key = tomorrow's date) ──
  '2026-04-21':
`⏳ <b>5 days to TSV Bangkok</b>

Still a week out — perfect time to get set up. 🧳

A few things worth sorting this week:

✅ Passport valid through Oct 2026
✅ Travel insurance sorted
✅ No. 3 Uniform pressed and packed
✅ Smart casual kit ready (long pants, collared top, covered shoes)
✅ Plug adapter (TH uses Type A / B / C)
✅ Personal meds + any prescriptions

—

📱 Install the app on your phone now — takes 30 seconds:

<b>iPhone:</b> Safari → Share → Add to Home Screen

<b>Android:</b> Chrome → ⋮ → Install app

https://57wbs1.github.io/TSV/

Default PIN is <b>0000</b> — change it after first login.

—

Any questions, your Syn IC is on call.

Countdown is on. ✈️`,

  // ── T-4 · sent on 21 Apr ──
  '2026-04-22':
`⏳ <b>4 days to TSV Bangkok</b>

Halfway through the week! 🎒

Time to tick off the big-ticket items:

✅ App installed + logged in
✅ PIN changed from the default
✅ Passport out of the drawer and into your bag
✅ Check your booking email — booking ref handy
✅ Any prescription meds picked up

—

🏨 <b>Hotel:</b> Pullman Bangkok Hotel G
✈️ <b>Outbound:</b> SQ 708 · 0930H Sun 26 Apr
📍 Changi T2 · Check-in 0630–0840H · Boarding 0900H · Gate closes 0920H

—

📱 Full schedule lives in the app — give it a browse:
https://57wbs1.github.io/TSV/

Light and steady from here. 💪`,

  // ── T-3 · sent on 22 Apr ──
  '2026-04-23':
`⏳ <b>3 days to TSV Bangkok</b>

Getting close! 🛫

Final-stretch checks:

✅ Online check-in opens ~48h out — do it early
✅ Charge everything; pack chargers + power bank
✅ Local currency / card set up
✅ Smart casual + No. 3 pressed
✅ App installed, logged in, PIN changed

—

📱 Open the app → pick your syndicate → pick your name → PIN
https://57wbs1.github.io/TSV/

Hit your Syn IC with any last-minute questions.

Almost go-time. ✈️`,

  // ── T-2 · sent on 23 Apr (key = 24 Apr) — original entry ──
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

📍 Changi T2 · Check-in 0630–0840H · Boarding 0900H · Gate closes 0920H

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

Check-in counter 0630–<b>0840H</b> · Boarding 0900H · Gate closes 0920H.

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
function sendDailyReminder(forceDate, overrideChatId) {
  const bkk = bkkNow();
  const tmr = forceDate
    ? new Date(forceDate + 'T00:00:00+07:00')
    : new Date(bkk.getTime() + 24*60*60*1000);
  const tmrDate = forceDate || Utilities.formatDate(tmr, 'Asia/Bangkok', 'yyyy-MM-dd');

  let msg = DAILY_PREVIEWS[tmrDate];
  if (!msg) {
    // For test / QC: if it's not a trip-eve day, pick the nearest upcoming preview
    if (overrideChatId) {
      const keys = Object.keys(DAILY_PREVIEWS).sort();
      const upcoming = keys.find(k => k >= Utilities.formatDate(bkk, 'Asia/Bangkok', 'yyyy-MM-dd')) || keys[0];
      if (upcoming) msg = '<b>[TEST PREVIEW — ' + upcoming + ']</b>\n\n' + DAILY_PREVIEWS[upcoming];
    }
    if (!msg) {
      logAction('reminder_skip', 'server', 'not trip day: ' + tmrDate);
      return 'Not a trip-eve day: ' + tmrDate;
    }
  }

  const sr2 = _tgSendRouted(msg, 'A2_reminder', overrideChatId);
  if (sr2 === 'disabled') { logAction('reminder_disabled', 'server', tmrDate); return 'A2 disabled'; }
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
  if (gk === 'Leadership') return 0;  // PSO first (COL Fun etc.)
  var main = gk.match(/^57 CSC Syn (\d+)$/i);
  if (main) return parseInt(main[1]) === 1 ? 1 : 10 + parseInt(main[1]);
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
        loc: (statusMap[m.id] && statusMap[m.id].locationText || '').toString().trim() || 'Out of Hotel',
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
function sendEveningSitrep(overrideChatId) {
  const bkk = bkkNow();
  const dateLabel = Utilities.formatDate(bkk, 'Asia/Bangkok', 'd MMM EEE').toUpperCase();
  const data = _buildSitrepData([]);   // no forced all-in
  const msg = _buildSitrepMessage(data, '2300H SITREP', dateLabel);
  const sr3 = _tgSendRouted(msg, 'A3_evening', overrideChatId);
  if (sr3 === 'disabled') { logAction('sitrep_2300_disabled', 'server', ''); return 'A3 disabled'; }
  logAction('sitrep_2300', 'server', data.totals.inC + '/' + data.totals.total);
  return 'Sent 2300H';
}

// ── 0200H SITREP: all syndicates, forced groups reported as all-in ──
function sendMidnightSitrep(overrideChatId) {
  const bkk = bkkNow();
  const yesterday = new Date(bkk.getTime() - 24*60*60*1000);
  const yLabel = Utilities.formatDate(yesterday, 'Asia/Bangkok', 'd MMM EEE').toUpperCase();
  // Read from the same config the 0130H auto-force-in uses (super-admin configurable)
  const data = _buildSitrepData(_getForceInGroups());
  const msg = _buildSitrepMessage(data, '0200H SITREP', yLabel);
  const sr4 = _tgSendRouted(msg, 'A4_midnight', overrideChatId);
  if (sr4 === 'disabled') { logAction('sitrep_0200_disabled', 'server', ''); return 'A4 disabled'; }
  logAction('sitrep_0200', 'server', data.totals.inC + '/' + data.totals.total);
  return 'Sent 0200H';
}

// ── Air quality helpers ──
// Singapore PSI from data.gov.sg (no key).
// Tries the v2 open API first (2024+ endpoint), falls back to legacy v1.
// Returns { value, label, band, emoji, source, pm25 } or null.
function _fetchSgPsi() {
  function _parseItem(item) {
    if (!item) return null;
    const psi  = (item.readings && item.readings.psi_twenty_four_hourly)  || {};
    const pm25 = (item.readings && item.readings.pm25_twenty_four_hourly) || {};
    const v = psi.national != null ? psi.national : null;
    if (v == null) return null;
    return Object.assign(_psiBand(v, 'PSI'), {
      value: v, source: 'NEA · SG (24h)',
      pm25: pm25.national != null ? pm25.national : null,
      updatedAt: item.update_timestamp || item.timestamp
    });
  }
  try {
    // v2 endpoint (api-open.data.gov.sg — current as of 2024)
    let res = UrlFetchApp.fetch('https://api-open.data.gov.sg/v2/real-time/api/psi', {
      method: 'get', muteHttpExceptions: true
    });
    if (res.getResponseCode() < 400) {
      const body = JSON.parse(res.getContentText());
      const item = (body.data && body.data.items && body.data.items[0]) || null;
      const result = _parseItem(item);
      if (result) return result;
    }
    // Legacy v1 fallback
    res = UrlFetchApp.fetch('https://api.data.gov.sg/v1/environment/psi', {
      method: 'get', muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 400) return null;
    const body = JSON.parse(res.getContentText());
    return _parseItem((body.items && body.items[0]) || null);
  } catch (e) {
    logAction('psi_fail', 'server', e.message);
    return null;
  }
}

// Bangkok hourly AQI (US scale) from Open-Meteo air-quality API (no key).
function _fetchBkkAqi() {
  try {
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
      + '?latitude=13.7256&longitude=100.5279'
      + '&hourly=us_aqi,pm2_5,pm10'
      + '&timezone=Asia%2FBangkok&forecast_days=1';
    const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    if (res.getResponseCode() >= 400) return null;
    const body = JSON.parse(res.getContentText());
    const idx = new Date(Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss")).getHours();
    const aqiArr = (body.hourly && body.hourly.us_aqi) || [];
    const pm25Arr = (body.hourly && body.hourly.pm2_5) || [];
    const v = aqiArr[idx];
    if (v == null) return null;
    return Object.assign(_psiBand(v, 'AQI'), {
      value: Math.round(v),
      source: 'Open-Meteo · BKK (US AQI)',
      pm25: pm25Arr[idx] != null ? Math.round(pm25Arr[idx]) : null
    });
  } catch (e) { return null; }
}

// Shared band scale (works for both PSI and US AQI — breakpoints align closely
// for the purposes of a morning health advisory).
function _psiBand(v, label) {
  if (v <= 50)  return { label, emoji: '🟢', band: 'Good' };
  if (v <= 100) return { label, emoji: '🟡', band: 'Moderate' };
  if (v <= 150) return { label, emoji: '🟠', band: 'Unhealthy for Sensitive' };
  if (v <= 200) return { label, emoji: '🟠', band: 'Unhealthy' };
  if (v <= 300) return { label, emoji: '🔴', band: 'Very Unhealthy' };
  return              { label, emoji: '🟣', band: 'Hazardous' };
}

// ── 0600H: Bangkok weather briefing (to announce chat) ──
// Pulls the day's forecast from Open-Meteo (free, no key) and builds a
// briefing with tailored advice based on max temp + humidity + rain.
function sendWeatherBriefing(overrideChatId) {
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
    + '&hourly=temperature_2m,apparent_temperature'
    + '&forecast_days=2';

  let tMax = null, tMin = null, feelsMax = null, uvMax = null, rainSum = 0, rainProb = 0;
  let curT = null, curRH = null, curWind = null, curCode = null, dailyCode = null;
  let noonT = null, noonFeels = null;
  let tmrMax = null, tmrMin = null, tmrCode = null;
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
      tmrMax   = body.daily.temperature_2m_max?.[1] ?? null;
      tmrMin   = body.daily.temperature_2m_min?.[1] ?? null;
      tmrCode  = body.daily.weather_code?.[1] ?? null;
    }
    if (body.hourly) {
      noonT     = body.hourly.temperature_2m?.[12] ?? null;
      noonFeels = body.hourly.apparent_temperature?.[12] ?? null;
    }
  } catch (e) {
    logAction('weather_fail', 'server', e.message);
    _tgSendRouted('<b>☀️ Weather briefing</b>\nCouldn\'t reach the weather service — defaulting: stay hydrated, wear light layers, bring rain cover.', 'A1_weather', overrideChatId);
    return 'Weather fetch failed';
  }

  // Emoji + description for weather code
  const codeMap = {
    0:['☀️','Clear sky'], 1:['🌤️','Mainly clear'], 2:['⛅','Partly cloudy'], 3:['☁️','Overcast'],
    4:['🌤️','Mainly clear'], 5:['⛅','Partly cloudy'], 6:['☁️','Overcast'],
    45:['🌫️','Fog'], 48:['🌫️','Rime fog'],
    51:['🌦️','Light drizzle'], 53:['🌦️','Drizzle'], 55:['🌦️','Dense drizzle'],
    56:['🌧️','Freezing drizzle'], 57:['🌧️','Dense freezing drizzle'],
    61:['🌧️','Light rain'], 63:['🌧️','Rain'], 65:['🌧️','Heavy rain'],
    66:['🌧️','Freezing rain'], 67:['🌧️','Heavy freezing rain'],
    71:['🌨️','Light snow'], 73:['🌨️','Snow'], 75:['❄️','Heavy snow'], 77:['🌨️','Snow grains'],
    80:['🌦️','Rain showers'], 81:['🌧️','Heavy showers'], 82:['⛈️','Violent showers'],
    85:['🌨️','Snow showers'], 86:['❄️','Heavy snow showers'],
    95:['⛈️','Thunderstorm'], 96:['⛈️','Thunder + hail'], 99:['⛈️','Severe thunderstorm']
  };
  const wc = codeMap[dailyCode] || codeMap[curCode] || ['🌡️','Variable conditions'];

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

  // Today's programme — pulls from Calendar sheet filtered to today's
  // trip day. Finds the first event (by start time) and uses its attire.
  const dayMeta = DAYS_MAP[today];
  let programmeBlock = '';
  let firstAttire = '';
  if (dayMeta) {
    try {
      const cal = readSheet(SHEETS.CALENDAR)
        .map(e => Object.assign({}, e, { startTime: _normalizeHHmm(e.startTime), endTime: _normalizeHHmm(e.endTime) }))
        .filter(e =>
          parseInt(e.day) === dayMeta.day &&
          e.isDeleted !== 'true' && e.isDeleted !== true
        );
      cal.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      // Gist: pick up to 4 'big' events (skip admin / flight / transit where
      // possible, unless they're the only ones). If fewer than 3 after
      // filtering, fall back to first 4 chronologically.
      const keyCats = ['visit','learning','scope','event','key'];
      let gist = cal.filter(e => keyCats.indexOf((e.category || '').toLowerCase()) >= 0).slice(0, 4);
      if (gist.length < 3) gist = cal.slice(0, 4);
      if (cal.length) firstAttire = cal[0].attire || '';

      if (gist.length) {
        programmeBlock = '\n<b>Today · Day ' + dayMeta.day + ' · ' + dayMeta.icon + ' ' + dayMeta.theme + '</b>\n';
        gist.forEach(ev => {
          const t = (ev.startTime || '').replace(':','');
          programmeBlock += '• ' + (t ? t + 'H · ' : '') + (ev.title || '') + '\n';
        });
        if (firstAttire) {
          programmeBlock += '\n👔 <b>Attire for first event:</b> ' + firstAttire + '\n';
        }
      }
    } catch (e) { logAction('weather_programme_fail','server', e.message); }
  } else {
    // Pre-trip morning — rich countdown block
    const tripStartPre = new Date('2026-04-26T00:00:00+07:00');
    const tripEndPre   = new Date('2026-04-30T23:59:59+07:00');
    const nowTsPre = bkk.getTime();
    if (nowTsPre < tripStartPre.getTime()) {
      const daysOut = Math.ceil((tripStartPre.getTime() - nowTsPre) / (24*60*60*1000));
      programmeBlock = '\n🛫 <b>' + daysOut + ' day' + (daysOut===1?'':'s') + ' to TSV Bangkok</b>\n\n📋 <b>Prep checklist:</b>\n';
      if (daysOut >= 5) {
        programmeBlock += '✅ Passport valid ≥6 months?\n';
        programmeBlock += '✅ Air ticket printed / downloaded?\n';
        programmeBlock += '✅ SQ708 · departs <b>0930H</b> Changi T2 · check-in 0630–0840H · gate closes 0920H\n';
        programmeBlock += '✅ <b>No. 3 Uniform</b> serviceable — pressed + packed?\n';
        programmeBlock += '✅ Smart Casual packed (for non-uniform events)?\n';
        programmeBlock += '✅ Toiletries + medications packed?\n';
        programmeBlock += '✅ Running shoes + workout gear?\n';
        programmeBlock += '✅ International data roaming activated?\n';
        programmeBlock += '✅ SGD/THB exchanged?\n';
      } else if (daysOut === 4) {
        programmeBlock += '✅ Passport valid ≥6 months?\n';
        programmeBlock += '✅ Air ticket printed / downloaded?\n';
        programmeBlock += '✅ SQ708 · departs <b>0930H</b> Changi T2 · check-in 0630–0840H · gate closes 0920H\n';
        programmeBlock += '✅ <b>No. 3 Uniform</b> serviceable — pressed + packed?\n';
        programmeBlock += '✅ Smart Casual packed (for non-uniform events)?\n';
        programmeBlock += '✅ Toiletries + medications packed?\n';
        programmeBlock += '✅ Running shoes + workout gear?\n';
        programmeBlock += '✅ International data roaming activated?\n';
        programmeBlock += '✅ SGD/THB exchanged?\n';
        programmeBlock += '✅ Bags packed and under 25kg?\n';
      } else if (daysOut === 3) {
        programmeBlock += '✅ Final bag weight check (25kg limit)\n';
        programmeBlock += '✅ Valuables: phone, wallet, powerbank, earphones?\n';
        programmeBlock += '✅ <b>No. 3 Uniform</b> + Smart Casual confirmed?\n';
      } else if (daysOut <= 2) {
        programmeBlock += '✅ SQ708 departs <b>0930H</b> Changi T2 (Sun 26 Apr)\n';
        programmeBlock += '✅ Check-in counter: 0630–<b>0840H</b> (closes 50 min before)\n';
        programmeBlock += '✅ Boarding 0900H · Gate closes <b>0920H</b>\n';
        programmeBlock += '✅ Aim to reach airport by 0700H for buffer\n';
        programmeBlock += '✅ Have boarding pass ready (SingaporeAir app or printed)\n';
        if (daysOut <= 1) {
          programmeBlock += '✅ <b>Set alarm — 0500H wake-up recommended</b>\n';
          programmeBlock += '✅ Full charge phone + powerbank tonight\n';
        }
      }
      // (Tomorrow's forecast intentionally omitted — 0600H briefing covers today only)
    } else if (nowTsPre > tripEndPre.getTime()) {
      programmeBlock = '\n🏡 <b>Trip complete — welcome home.</b>\n';
    }
  }

  // Air quality — pre-trip (SG PSI for NEA scale) and in-trip (BKK US AQI).
  // Post-trip: SG PSI again so the community still gets the advisory.
  const tripStart = new Date('2026-04-26T00:00:00+07:00');
  const tripEnd   = new Date('2026-04-30T23:59:59+07:00');
  const nowTs     = bkk.getTime();
  const inTrip    = (nowTs >= tripStart.getTime() && nowTs <= tripEnd.getTime());

  // Air quality: Bangkok AQI is the primary reading for this trip.
  // SG PSI not shown here — this is a Bangkok weather briefing.
  const bkkAqi = _fetchBkkAqi();

  // Mask/health advisory based on Bangkok AQI
  if (bkkAqi) {
    if (bkkAqi.value > 200)      tips.unshift('🚨 <b>BKK AQI ' + bkkAqi.value + ' — ' + bkkAqi.band + '</b>. N95 MANDATORY. Avoid all outdoor exposure. Close hotel windows.');
    else if (bkkAqi.value > 150) tips.unshift('😷 <b>BKK AQI ' + bkkAqi.value + ' — ' + bkkAqi.band + '</b>. Wear N95 outdoors. Limit outdoor time. Keep hotel windows closed.');
    else if (bkkAqi.value > 100) tips.unshift('😷 <b>🟠 BKK AQI ' + bkkAqi.value + ' — ' + bkkAqi.band + '</b>. Orange — <b>wear a surgical mask outdoors.</b>');
    else if (bkkAqi.value > 50)  tips.unshift('🫧 BKK AQI ' + bkkAqi.value + ' — ' + bkkAqi.band + '. Moderate — sensitive groups consider a mask outdoors.');
  }

  let msg = '☀️ <b>Good morning, TSV!</b>\n';
  msg += dateLabel + '\n';
  msg += '\n' + wc[0] + ' <b>' + wc[1] + '</b>\n';
  if (tMax != null && tMin != null) {
    msg += '🌡️ Low ' + Math.round(tMin) + '°C';
    if (noonT != null) msg += ' · Midday ' + Math.round(noonT) + '°C';
    msg += ' → High ' + Math.round(tMax) + '°C\n';
    const fPeak = noonFeels != null ? noonFeels : (feelsMax != null ? feelsMax : tMax);
    const feelsStr = fPeak != null ? Math.round(fPeak) + '°C' : '—';
    let soWhat = 'Comfortable for outdoor activities.';
    if (fPeak != null && fPeak >= 38)       soWhat = 'Stay in shade 1100–1500H. Heat stroke risk for extended outdoor exposure.';
    else if (fPeak != null && fPeak >= 35)  soWhat = 'Limit prolonged direct sun. Keep water within reach at all times.';
    else if (fPeak != null && fPeak >= 32)  soWhat = 'Hot day — dress light, top up water every 60 min.';
    msg += '💧 Feels like ' + feelsStr + ' at peak — ' + soWhat + '\n';
  }
  if (curT != null)   msg += '⏱️ Now: ' + Math.round(curT) + '°C';
  if (curRH != null)  msg += ' · ' + Math.round(curRH) + '% humidity';
  if (curWind != null)msg += ' · ' + Math.round(curWind) + ' km/h';
  msg += '\n';
  if (rainProb)       msg += '🌧️ Rain: ' + rainProb + '% · ' + (Math.round(rainSum*10)/10) + 'mm\n';
  if (uvMax != null)  msg += '☀️ UV: ' + Math.round(uvMax) + '/11\n';

  // Air quality — Bangkok only. This is a BKK weather briefing, SG PSI not relevant.
  msg += '\n<b>🌬️ Bangkok Air Quality</b>\n';
  if (bkkAqi) {
    msg += bkkAqi.emoji + ' AQI ' + bkkAqi.value + ' · ' + bkkAqi.band +
      (bkkAqi.pm25 != null ? ' · PM2.5 ' + Math.round(bkkAqi.pm25) + '㎍/㎥' : '') + '\n';
  } else {
    msg += '⚪ BKK AQI data unavailable — check AirVisual or BMA app\n';
  }

  msg += programmeBlock;

  msg += '\n<b>Today\'s tips</b>\n' + tips.map(t => '• ' + t).join('\n');
  msg += '\n\nStay sharp 🇹🇭';

  const sr1 = _tgSendRouted(msg, 'A1_weather', overrideChatId);
  if (sr1 === 'disabled') { logAction('weather_disabled', 'server', ''); return 'A1 disabled'; }
  const aqiTag = bkkAqi ? 'BKK' + bkkAqi.value : '';
  logAction('weather_0600', 'server', (tMax||'?') + '°C ' + wc[1] + (aqiTag ? ' · ' + aqiTag : ''));
  return 'Sent weather ' + today + (aqiTag ? ' (' + aqiTag + ')' : '');
}

// ── Setup: run this ONCE from Apps Script editor ──
function setupAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (['sendDailyReminder','sendEveningSitrep','sendMidnightSitrep','sendWeatherBriefing','syncFromGoogleCalendar','forceSyn1AllIn','sendParadeStateBroadcast'].indexOf(fn) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sendWeatherBriefing')
    .timeBased().atHour(6).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  // 0830H BKK: daily parade state broadcast (A5)
  ScriptApp.newTrigger('sendParadeStateBroadcast')
    .timeBased().atHour(8).nearMinute(30).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendDailyReminder')
    .timeBased().atHour(19).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendEveningSitrep')
    .timeBased().atHour(23).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  // 0130H BKK: force all Syn 1 members to IN (strict curfew, no exceptions).
  // Runs BEFORE 0200H midnight sitrep so the sitrep reflects the enforced state.
  ScriptApp.newTrigger('forceSyn1AllIn')
    .timeBased().atHour(1).nearMinute(30).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendMidnightSitrep')
    .timeBased().atHour(2).nearMinute(0).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('syncFromGoogleCalendar')
    .timeBased().everyMinutes(15).create();
  return '✓ 7 triggers: 0600H weather · 0830H Parade · 1900H reminder · 2300H SITREP · 0130H Syn1-force-in · 0200H Curfew · every 15min GCal pull';
}

// ── 0130H BKK: force selected groups to IN status ──
// Runs nightly BEFORE the 0200H curfew sitrep. Overrides status for any
// syndicate configured via ScriptProperties (super-admin toggles in the PWA).
// Default: only 57 CSC Syn 1 (hard 0200H curfew).
const FORCE_IN_PROP_KEY  = 'tsvForceInGroups';
const FORCE_IN_META_KEY  = 'tsvForceInMeta';   // last-run metadata for UI display

function _getForceInGroups() {
  try {
    const saved = PropertiesService.getScriptProperties().getProperty(FORCE_IN_PROP_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* fall through */ }
  return ['57 CSC Syn 1'];   // default: only Syn 1
}

// ════════════════════════════════════════════════════════════
// PARADE STATE — daily operational status per member
// Default status is 'Present'. Anyone (self) + admin (others) can edit.
// ════════════════════════════════════════════════════════════

function readParadeState() {
  const rows = readSheet(SHEETS.PARADE_STATE);
  const out = {};
  rows.forEach(r => {
    if (r.memberId) out[r.memberId] = {
      status: r.status || 'Present',
      updatedBy: r.updatedBy || '',
      updatedAt: r.updatedAt || ''
    };
  });
  return out;
}

function updateParadeStatus(body) {
  const memberId = body.memberId || '';
  if (!memberId) return { ok: false, error: 'Missing memberId' };
  const status = String(body.status || 'Present').trim() || 'Present';

  const sheet = getOrCreateSheet(SHEETS.PARADE_STATE);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('memberId');
  const now = new Date().toISOString();

  let foundRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === memberId) { foundRow = i + 1; break; }
  }
  const newRow = [memberId, status, body.actor || body.actorName || '', now];
  if (foundRow > 0) sheet.getRange(foundRow, 1, 1, headers.length).setValues([newRow]);
  else               sheet.appendRow(newRow);

  logAction('paradeState', body.actor || '', memberId + ' = ' + status.slice(0, 60));
  return { ok: true, memberId, status };
}

// Build the Telegram parade-state message.
//   options:
//     groupKeys (array) — if non-empty, only include these syndicates
//                         (and only their members' remarks)
//     remarks (string)  — free-text footer
//   Single-syndicate → header includes the syn label
//   Multi/all-syndicate → standard date header; always lists who's not around
//                         (user spec: never "Refer to TSV App" for parade state)
function _buildParadeStateMessage(options) {
  const opts = options || {};
  const wantGroups = Array.isArray(opts.groupKeys) && opts.groupKeys.length
    ? new Set(opts.groupKeys) : null;   // null = all groups
  const members = readSheet(SHEETS.MEMBERS).filter(m =>
    m.isDeleted !== 'true' && m.isDeleted !== true
  );
  const state = readParadeState();

  const byGroup = {};
  members.forEach(m => {
    const gk = _memberGroupKey(m);
    if (!byGroup[gk]) byGroup[gk] = [];
    byGroup[gk].push(m);
  });
  let groups = Object.keys(byGroup).sort((a, b) => _groupPriority(a) - _groupPriority(b));
  if (wantGroups) groups = groups.filter(g => wantGroups.has(g));
  if (!groups.length) groups = Object.keys(byGroup);   // safety fallback

  const bkk = bkkNow();
  const dateLabel = Utilities.formatDate(bkk, 'Asia/Bangkok', 'd MMM (EEE)').toUpperCase();

  // Header varies: single-syn includes the syn label on line 2
  let msg = `<b>PARADE STATE FOR ${dateLabel}</b>\n`;
  if (groups.length === 1) msg += `<b>${_formatGroup(groups[0])}</b>\n`;
  msg += `\n`;

  const remarks = [];
  groups.forEach(gk => {
    const grp = byGroup[gk];
    let present = 0;
    grp.forEach(m => {
      const entry = state[m.id];
      const st = entry && entry.status ? entry.status : 'Present';
      if (st === 'Present') present++;
      else remarks.push({ gk, name: m.shortName || m.name, status: st, rank: m.rank || '' });
    });
    // ✅ when fully present, ⚠️ when anyone is non-Present
    const tick = (present === grp.length) ? '✅' : '⚠️';
    msg += `${_formatGroup(gk)}: ${present} / ${grp.length} ${tick}\n`;
  });

  msg += `\n<b>Remarks</b>\n`;
  if (remarks.length === 0) {
    msg += 'Nil — all personnel present ✅\n';
  } else {
    remarks.forEach(r => {
      const nameWithRank = r.rank ? `${r.rank} ${r.name}` : r.name;
      msg += `${_formatGroup(r.gk)}: ${nameWithRank} — ${r.status}\n`;
    });
  }

  if (opts.remarks) {
    msg += `\n${String(opts.remarks).trim()}\n`;
  }
  msg += `\n<b>END OF PARADE STATE</b>`;
  return msg;
}

// Server-scheduled 0830H daily broadcast (A5_parade)
function sendParadeStateBroadcast(overrideChatId) {
  const msg = _buildParadeStateMessage();
  const sr = _tgSendRouted(msg, 'A5_parade', overrideChatId);
  if (sr === 'disabled') { logAction('parade_disabled', 'server', ''); return 'A5 disabled'; }
  logAction('parade_0830', 'server', 'sent');
  return 'Parade State 0830H sent';
}

// Client-triggered ad-hoc parade state (M7_parade)
// body: { groupKeys?: [syn...], remarks?: string, actor }
// Empty/missing groupKeys = all syndicates ("mass send")
function sendAdhocParadeState(body) {
  const groupKeys = Array.isArray(body && body.groupKeys) ? body.groupKeys : [];
  const msg = _buildParadeStateMessage({
    groupKeys,
    remarks: body ? body.remarks : ''
  });
  const sr = _tgSendRouted(msg, 'M7_parade');
  if (sr === 'disabled') return { ok: false, error: 'M7_parade disabled in settings' };
  const label = groupKeys.length === 0 ? 'mass (all syns)'
              : groupKeys.length === 1 ? _formatGroup(groupKeys[0])
              : groupKeys.length + ' syns';
  logAction('parade_adhoc', body ? (body.actor || '') : '', label);
  return { ok: true, sent: 'parade state · ' + label };
}

function forceSyn1AllIn() {
  const targetGroups = _getForceInGroups();
  if (!targetGroups.length) {
    logAction('force_syn_skip', 'server', 'no groups configured');
    return 'No groups configured for auto force-in';
  }

  const members = readSheet(SHEETS.MEMBERS).filter(m =>
    m.isDeleted !== 'true' && m.isDeleted !== true
  );
  const targetMembers = members.filter(m => targetGroups.indexOf(_memberGroupKey(m)) >= 0);
  if (!targetMembers.length) {
    logAction('force_syn_skip', 'server', 'no members in configured groups');
    return 'No members in configured groups: ' + targetGroups.join(', ');
  }

  const sheet = getOrCreateSheet(SHEETS.STATUS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  const now = new Date().toISOString();
  const logSheet = getOrCreateSheet(SHEETS.STATUSLOG);

  let forcedCount = 0;
  targetMembers.forEach(m => {
    let foundRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][idCol] === m.id) { foundRow = i + 1; break; }
    }
    const roomNum = foundRow > 0 ? rows[foundRow - 1][headers.indexOf('roomNumber')] : '';
    const newRow = [
      m.id,
      'in',                 // Force status to IN
      'Hotel (curfew)',     // Override location to hotel
      '', '',               // Clear GPS
      '',                   // Clear buddyWith
      roomNum || '',
      now
    ];
    if (foundRow > 0) {
      sheet.getRange(foundRow, 1, 1, headers.length).setValues([newRow]);
    } else {
      sheet.appendRow(newRow);
    }
    try {
      logSheet.appendRow([now, m.id, 'in', 'Hotel (curfew)', '', '', '', 'system_0130H_force']);
    } catch (e) { /* non-blocking */ }
    forcedCount++;
  });

  // Persist run metadata so the settings UI can show "last enforced"
  try {
    PropertiesService.getScriptProperties().setProperty(FORCE_IN_META_KEY, JSON.stringify({
      lastRunAt: now,
      groups: targetGroups,
      count: forcedCount
    }));
  } catch (e) { /* non-blocking */ }

  logAction('force_syn_in', 'system', forcedCount + ' members · groups=' + targetGroups.join(','));
  return 'Forced ' + forcedCount + ' members in [' + targetGroups.join(', ') + '] to IN at 0130H';
}

// ── getForceInConfig / updateForceInConfig (super-admin PWA controls) ──
function getForceInConfig() {
  const members = readSheet(SHEETS.MEMBERS).filter(m =>
    m.isDeleted !== 'true' && m.isDeleted !== true
  );
  const groupCounts = {};
  members.forEach(m => {
    const gk = _memberGroupKey(m);
    groupCounts[gk] = (groupCounts[gk] || 0) + 1;
  });
  const groups = Object.keys(groupCounts).sort((a, b) => _groupPriority(a) - _groupPriority(b));
  const selected = _getForceInGroups();
  let meta = null;
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(FORCE_IN_META_KEY);
    if (raw) meta = JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return {
    groups: groups.map(gk => ({
      gk,
      label: _formatGroup(gk),
      count: groupCounts[gk],
      selected: selected.indexOf(gk) >= 0
    })),
    selected,
    lastRun: meta
  };
}

function updateForceInConfig(body) {
  if (body.actor !== SUPER_ADMIN_ID) return { ok: false, error: 'Unauthorized — super admin only' };
  const groups = Array.isArray(body.groups) ? body.groups.filter(g => typeof g === 'string' && g.length > 0) : [];
  PropertiesService.getScriptProperties().setProperty(FORCE_IN_PROP_KEY, JSON.stringify(groups));
  logAction('updateForceInConfig', body.actor, 'groups=' + groups.join(','));
  return getForceInConfig();
}

// Server-side mirror of CALENDAR_SEED from js/data.js. Used to populate
// the Calendar sheet + GCal if they're empty. Keep in sync with data.js.
const CALENDAR_SEED_SERVER = [
  // DAY 1 — 26 Apr
  { id:'d1_01', day:1, startTime:'06:00', endTime:'08:30', title:'Commence Check-In', location:'Changi Airport Terminal 2', category:'admin', attire:'Smart Casual', synicReport:true, remarks:'Syndicate-level attendance tracking begins.' },
  { id:'d1_02', day:1, startTime:'07:30', endTime:'08:00', title:'Cohort Photo', location:'Dreamscape Indoor Garden, Changi T2', category:'event', remarks:'All check-in to be completed.' },
  { id:'d1_03', day:1, startTime:'08:00', endTime:'08:30', title:'Complete Check-In', location:'Changi T2', category:'admin' },
  { id:'d1_04', day:1, startTime:'08:30', endTime:'09:00', title:'Attendance Check @ Departure Gate', location:'Changi T2', category:'admin', synicReport:true },
  { id:'d1_05', day:1, startTime:'09:00', endTime:'11:00', title:'Outbound Flight SQ 708', location:'SIN → BKK', category:'flight', remarks:'Depart 0930H. Breakfast provided by airline.' },
  { id:'d1_06', day:1, startTime:'11:30', endTime:'12:30', title:'Arrival in Bangkok', location:'Suvarnabhumi Airport', category:'event' },
  { id:'d1_07', day:1, startTime:'12:30', endTime:'13:00', title:'Movement to Lunch Venue', location:'Airport → TBC', category:'movement' },
  { id:'d1_08', day:1, startTime:'13:00', endTime:'14:00', title:'Lunch', location:'TBC (Catered)', category:'meal' },
  { id:'d1_09', day:1, startTime:'14:00', endTime:'14:30', title:'Movement to Chao Phraya River', location:'TBC → Chao Phraya River', category:'movement' },
  { id:'d1_10', day:1, startTime:'14:30', endTime:'17:30', title:'Long Tail Boat Tour', location:'Chao Phraya River', category:'event', attire:'Smart Casual', visitId:'boat_tour', remarks:'3-hour boat tour.' },
  { id:'d1_11', day:1, startTime:'18:00', endTime:'18:30', title:'Movement to Hotel', location:'Chao Phraya → Pullman Bangkok Hotel G', category:'movement' },
  { id:'d1_12', day:1, startTime:'18:30', endTime:'19:00', title:'Hotel Check-in / Syndicate Reflections', location:'Pullman Bangkok Hotel G', category:'reflection', synicReport:true, remarks:'Submit Rooming List to Syn ICs.' },
  { id:'d1_13', day:1, startTime:'19:00', endTime:'19:30', title:'TSV Comm Huddle w/ PDS', location:'Pullman Bangkok Hotel G', category:'reflection' },
  { id:'d1_14', day:1, startTime:'19:30', endTime:'23:59', title:'Executive Time', location:'Free', category:'free', remarks:'Dinner self-funded. Buddy system for leaving hotel.' },

  // DAY 2 — 27 Apr
  { id:'d2_01', day:2, startTime:'06:00', endTime:'08:00', title:'Breakfast & Admin Time', location:'Pullman Bangkok Hotel G', category:'meal', remarks:'Hotel Buffet (Catered).' },
  { id:'d2_02', day:2, startTime:'08:00', endTime:'08:30', title:'Gather & Board Buses', location:'Hotel Lobby', category:'admin', remarks:'Group by Bus Level.' },
  { id:'d2_03', day:2, startTime:'08:30', endTime:'09:30', title:'Movement to True Digital Park', location:'Pullman → True Digital Park', category:'movement' },
  { id:'d2_04', day:2, startTime:'09:30', endTime:'11:30', title:'Guided Tour @ True Digital Park', location:'True Digital Park', category:'event', attire:'Smart Casual', visitId:'true_digital' },
  { id:'d2_05', day:2, startTime:'11:30', endTime:'12:30', title:'Lunch @ True Digital Park', location:'True Digital Park', category:'meal' },
  { id:'d2_06', day:2, startTime:'12:30', endTime:'13:00', title:'Movement to Hotel', location:'TDP → Pullman Bangkok Hotel G', category:'movement' },
  { id:'d2_07', day:2, startTime:'13:00', endTime:'13:30', title:'Cohort Attire Change to No. 3 Uniform', location:'Pullman Bangkok Hotel G', category:'admin', attire:'No. 3 Uniform' },
  { id:'d2_08', day:2, startTime:'13:30', endTime:'14:00', title:'Movement to ISIS, Chulalongkorn', location:'Pullman → Chulalongkorn University', category:'movement' },
  { id:'d2_09', day:2, startTime:'14:00', endTime:'16:00', title:'Visit to ISIS', location:'Kasem Udyanin Building, ISIS, Chulalongkorn University', category:'event', attire:'No. 3 Uniform', visitId:'isis', remarks:'2× Keynote Address · 1× Q&A session.' },
  { id:'d2_10', day:2, startTime:'16:00', endTime:'16:30', title:'Movement to Hotel', location:'ISIS → Pullman Bangkok Hotel G', category:'movement' },
  { id:'d2_11', day:2, startTime:'16:30', endTime:'17:30', title:'Syndicate Reflections / TSV Comm Huddle', location:'Pullman Bangkok Hotel G', category:'reflection' },
  { id:'d2_12', day:2, startTime:'17:00', endTime:'17:30', title:'Learning Comm Huddle w/ HoD', location:'Pullman Bangkok Hotel G', category:'reflection' },
  { id:'d2_13', day:2, startTime:'17:30', endTime:'23:59', title:'Executive Time', location:'Free', category:'free', remarks:'Dinner self-funded.' },

  // DAY 3 — 28 Apr SCOPE DAY
  { id:'d3_01', day:3, startTime:'06:00', endTime:'08:00', title:'Breakfast & Admin Time', location:'Pullman Bangkok Hotel G', category:'meal', remarks:'SCOPE groups to be filled in after AOP approved by HoD.' },
  { id:'d3_02', day:3, startTime:'08:00', endTime:'10:00', title:'SCOPE — Movement to Research Areas', location:'Ayutthaya · Chonburi/Rayong · Kanchanaburi', category:'scope', attire:'Smart Casual', remarks:'Syndicate-led field research.' },
  { id:'d3_03', day:3, startTime:'10:00', endTime:'10:30', title:'✅ 1st Check-In (1000H)', location:'Via Syn IC', category:'scope', synicReport:true, remarks:'SCOPE teams to Syn IC → TSV Group Chat.' },
  { id:'d3_04', day:3, startTime:'14:00', endTime:'14:30', title:'✅ 2nd Check-In (1400H)', location:'Via Syn IC', category:'scope', synicReport:true },
  { id:'d3_05', day:3, startTime:'18:00', endTime:'18:30', title:'✅ 3rd Check-In (1800H)', location:'Via Syn IC', category:'scope', synicReport:true },
  { id:'d3_06', day:3, startTime:'22:00', endTime:'22:30', title:'✅ Final Check-In (2200H)', location:'Hotel / En-route', category:'scope', synicReport:true, remarks:'All SCOPE teams should be back in Bangkok.' },

  // DAY 4 — 29 Apr
  { id:'d4_01', day:4, startTime:'06:00', endTime:'08:00', title:'Breakfast & Admin Time', location:'Pullman Bangkok Hotel G', category:'meal' },
  { id:'d4_02', day:4, startTime:'08:00', endTime:'08:30', title:'Gather & Board Buses', location:'Hotel Lobby', category:'admin' },
  { id:'d4_03', day:4, startTime:'08:30', endTime:'09:30', title:'Movement to RTA CGSC', location:'Pullman → RTA CGSC', category:'movement' },
  { id:'d4_04', day:4, startTime:'09:30', endTime:'10:00', title:'Call on Comd RTA CGSC', location:'818 Rama V Road, Dusit, Bangkok 10300', category:'event', attire:'No. 3 Uniform', visitId:'rta_cgsc' },
  { id:'d4_05', day:4, startTime:'10:00', endTime:'10:30', title:'Exchange of Briefs (RTA CGSC ↔ GKSCSC)', location:'RTA CGSC', category:'event', attire:'No. 3 Uniform', visitId:'rta_cgsc' },
  { id:'d4_06', day:4, startTime:'10:30', endTime:'11:00', title:'Cohort Level Discussion / Q&A', location:'RTA CGSC', category:'event', visitId:'rta_cgsc' },
  { id:'d4_07', day:4, startTime:'11:00', endTime:'11:30', title:'Tour of RTA CGSC', location:'RTA CGSC', category:'event', visitId:'rta_cgsc' },
  { id:'d4_08', day:4, startTime:'12:00', endTime:'12:30', title:'Movement to Lunch Venue', location:'RTA CGSC → TBC', category:'movement' },
  { id:'d4_09', day:4, startTime:'12:30', endTime:'13:30', title:'Lunch', location:'TBC (Catered)', category:'meal' },
  { id:'d4_10', day:4, startTime:'13:30', endTime:'14:00', title:'Movement to SG Embassy / Hotel (IOs)', location:'TBC → SG Embassy / Pullman', category:'movement', remarks:'SAF Officers to Embassy; IOs to Hotel.' },
  { id:'d4_11', day:4, startTime:'14:00', endTime:'15:00', title:'Diplomatic Engagement w/ DAO', location:'Singapore Embassy, Bangkok', category:'event', attire:'No. 3 Uniform', visitId:'sg_embassy' },
  { id:'d4_12', day:4, startTime:'15:00', endTime:'16:00', title:'Diplomatic Engagement w/ SG Ambassador', location:'Singapore Embassy, Bangkok', category:'event', attire:'No. 3 Uniform', visitId:'sg_embassy' },
  { id:'d4_13', day:4, startTime:'16:00', endTime:'16:30', title:'Movement to Hotel', location:'SG Embassy → Pullman Bangkok Hotel G', category:'movement' },
  { id:'d4_14', day:4, startTime:'16:30', endTime:'17:00', title:'Syndicate Reflections / TSV Comm Huddle', location:'Pullman Bangkok Hotel G', category:'reflection' },
  { id:'d4_15', day:4, startTime:'17:00', endTime:'23:59', title:'Executive Time / Learning Huddle', location:'Free', category:'free', remarks:'Dinner self-funded.' },

  // DAY 5 — 30 Apr
  { id:'d5_01', day:5, startTime:'06:00', endTime:'10:30', title:'Breakfast / Syndicate Reflections', location:'Pullman Bangkok Hotel G', category:'reflection', attire:'Smart Casual', remarks:'Draft writeup: observations, insights, link to hypothesis, lessons for SG.' },
  { id:'d5_02', day:5, startTime:'10:30', endTime:'11:00', title:'Commence Check-Out', location:'Pullman Bangkok Hotel G', category:'admin' },
  { id:'d5_03', day:5, startTime:'11:00', endTime:'11:30', title:'Complete Check-Out & Board Buses', location:'Pullman Bangkok Hotel G', category:'admin' },
  { id:'d5_04', day:5, startTime:'11:30', endTime:'12:30', title:'Movement to Suvarnabhumi Airport', location:'Pullman → Suvarnabhumi', category:'movement' },
  { id:'d5_05', day:5, startTime:'12:30', endTime:'14:00', title:'Check-In at Airport / Lunch (OTOT)', location:'Suvarnabhumi Airport', category:'admin', remarks:'Lunch on your own time.' },
  { id:'d5_06', day:5, startTime:'14:00', endTime:'14:30', title:'Complete Check-In', location:'Suvarnabhumi Airport', category:'admin' },
  { id:'d5_07', day:5, startTime:'14:30', endTime:'15:00', title:'Attendance Check @ Departure Gate', location:'Suvarnabhumi Airport', category:'admin', synicReport:true },
  { id:'d5_08', day:5, startTime:'15:00', endTime:'19:00', title:'Outbound Flight SQ 709', location:'BKK → SIN', category:'flight', remarks:'Depart 1530H. Dinner provided by airline.' },
  { id:'d5_09', day:5, startTime:'19:30', endTime:'20:00', title:'Collect Luggage', location:'Changi Airport Terminal 2', category:'admin' },
  { id:'d5_10', day:5, startTime:'20:00', endTime:'20:30', title:'Return Home', location:'—', category:'admin' },
  { id:'d5_11', day:5, startTime:'20:30', endTime:'21:00', title:'Last Man Out of Arrival Hall', location:'Changi Airport Terminal 2', category:'admin', synicReport:true }
];

// Populate the Calendar sheet from CALENDAR_SEED_SERVER. Safe to re-run —
// skips events whose id is already in the sheet.
function seedCalendarFromServer() {
  const sheet = getOrCreateSheet(SHEETS.CALENDAR);
  // Ensure header row
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEETS.CALENDAR.headers);
  }
  const rows = sheet.getDataRange().getValues();
  const existing = new Set(rows.slice(1).map(r => r[0]));
  const now = new Date().toISOString();
  let added = 0;
  CALENDAR_SEED_SERVER.forEach(ev => {
    if (existing.has(ev.id)) return;
    sheet.appendRow([
      ev.id, ev.day, ev.startTime, ev.endTime, ev.title,
      ev.location || '', ev.category || 'event',
      ev.attire || '', ev.remarks || '',
      ev.visitId || '',
      ev.synicReport ? 'true' : 'false',
      '{}', 'false', now, now
    ]);
    added++;
  });
  return { added, total: CALENDAR_SEED_SERVER.length };
}

// ════════════════════════════════════════════════════════════
// GOOGLE CALENDAR SYNC
// One-time: createTsvCalendar() creates 'TSV Bangkok 2026', stores its
// ID in script properties, populates it from the Calendar sheet.
// Ongoing: syncFromGoogleCalendar() runs every 5 min, reads GCal, and
// mirrors changes back to the Calendar sheet. Sheet remains the source
// the app reads from — so the app doesn't need any code change to pick
// up drag-and-drop edits.
// ════════════════════════════════════════════════════════════

const GCAL_NAME = 'TSV26';
const GCAL_TIMEZONE = 'Asia/Bangkok';
const GCAL_PROP_KEY = 'tsvGcalId';

// Day → ISO date lookup (inverse of DAYS_MAP used elsewhere)
function _gcalDateForDay(dayNum) {
  for (const [iso, meta] of Object.entries(DAYS_MAP)) {
    if (meta.day === parseInt(dayNum)) return iso;
  }
  return null;
}

// Build the description block — structured and parseable on sync back.
function _gcalDescription(ev) {
  const lines = [];
  if (ev.category) lines.push('[Category] ' + ev.category);
  if (ev.attire)   lines.push('[Attire] ' + ev.attire);
  if (ev.remarks)  lines.push('[Remarks] ' + ev.remarks);
  if (ev.visitId)  lines.push('[Visit] ' + ev.visitId);
  if (ev.synicReport === true || ev.synicReport === 'true') lines.push('[Syn IC Report] true');
  lines.push('');
  lines.push('— TSV App ref: ' + ev.id + ' (do not remove)');
  return lines.join('\n');
}

// Parse back — extracts fields from a GCal event description that was
// originally written by _gcalDescription. Returns { appId, category,
// attire, remarks, visitId, synicReport } with sensible defaults.
function _parseGcalDescription(desc) {
  const d = String(desc || '');
  const out = { appId: null, category: null, attire: null, remarks: null, visitId: null, synicReport: false };
  let m;
  if ((m = d.match(/\[Category\]\s*([^\n]+)/))) out.category = m[1].trim();
  if ((m = d.match(/\[Attire\]\s*([^\n]+)/)))   out.attire   = m[1].trim();
  if ((m = d.match(/\[Remarks\]\s*([\s\S]*?)(?=\n\[|\n—|$)/))) out.remarks = m[1].trim();
  if ((m = d.match(/\[Visit\]\s*([^\n]+)/)))    out.visitId  = m[1].trim();
  if (/\[Syn IC Report\]\s*(true|yes|y)/i.test(d)) out.synicReport = true;
  if ((m = d.match(/— TSV App ref:\s*([a-zA-Z0-9_-]+)/))) out.appId = m[1].trim();
  return out;
}

function _getOrCreateTsvCalendar() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty(GCAL_PROP_KEY);
  if (existingId) {
    try {
      const cal = CalendarApp.getCalendarById(existingId);
      if (cal) return cal;
    } catch (e) { /* fall through and create */ }
  }
  const cal = CalendarApp.createCalendar(GCAL_NAME, {
    summary: 'GKSCSC Thailand Study Visit 2026 · live itinerary — drag events to rearrange, app pulls every 5 min',
    timeZone: GCAL_TIMEZONE,
    color: CalendarApp.Color.BLUE
  });
  props.setProperty(GCAL_PROP_KEY, cal.getId());
  logAction('gcal_created', 'server', cal.getId());
  return cal;
}

// One-shot: create the GCal if needed, then populate every event from
// the Calendar sheet. Idempotent — if an event with the same App ID
// already exists in GCal, skip it.
function createTsvCalendar() {
  const cal = _getOrCreateTsvCalendar();
  // If Calendar sheet is empty / missing, populate from the server seed
  // so GCal has events to mirror.
  let rows = readSheet(SHEETS.CALENDAR).filter(r =>
    r.isDeleted !== 'true' && r.isDeleted !== true
  );
  if (!rows.length) {
    seedCalendarFromServer();
    rows = readSheet(SHEETS.CALENDAR).filter(r =>
      r.isDeleted !== 'true' && r.isDeleted !== true
    );
  }
  // Build a map of appId → existing GCal event for idempotency
  const windowStart = new Date('2026-04-25T00:00:00+07:00');
  const windowEnd   = new Date('2026-05-02T00:00:00+07:00');
  const existing = cal.getEvents(windowStart, windowEnd);
  const byAppId = {};
  existing.forEach(ev => {
    const p = _parseGcalDescription(ev.getDescription());
    if (p.appId) byAppId[p.appId] = ev;
  });
  let created = 0, skipped = 0, failed = 0, failures = [];
  rows.forEach(r => {
    if (byAppId[r.id]) { skipped++; return; }
    const dateIso = _gcalDateForDay(r.day);
    if (!dateIso) { failed++; failures.push(r.id + ' · no day mapping (day=' + r.day + ')'); return; }
    try {
      const startStr = _normalizeHHmm(r.startTime) || '09:00';
      const endStr   = _normalizeHHmm(r.endTime)   || startStr;
      const start = new Date(dateIso + 'T' + startStr + ':00+07:00');
      const end   = new Date(dateIso + 'T' + endStr   + ':00+07:00');
      // Handle end < start (crosses midnight) by pushing end +24h
      if (end.getTime() <= start.getTime()) end.setTime(end.getTime() + 24*60*60*1000);
      const ev = cal.createEvent(r.title || '(untitled)', start, end, {
        location: r.location || '',
        description: _gcalDescription(r)
      });
      created++;
    } catch (e) {
      failed++;
      failures.push(r.id + ' · ' + e.message);
      logAction('gcal_create_fail', 'server', r.id + ' ' + e.message);
    }
  });
  return {
    calendarId: cal.getId(),
    calendarName: cal.getName(),
    shareUrl: 'https://calendar.google.com/calendar/u/0?cid=' + Utilities.base64Encode(cal.getId()).replace(/=+$/, ''),
    created, skipped, failed, total: rows.length,
    failures: failures.slice(0, 10)
  };
}

// Delete every event in the TSV26 calendar inside the trip window.
// Destructive — only callable by super-admin.
function wipeGcalTripEvents() {
  const props = PropertiesService.getScriptProperties();
  const calId = props.getProperty(GCAL_PROP_KEY);
  if (!calId) return { error: 'No TSV calendar configured' };
  const cal = CalendarApp.getCalendarById(calId);
  if (!cal) return { error: 'Calendar lookup failed' };
  const windowStart = new Date('2026-04-25T00:00:00+07:00');
  const windowEnd   = new Date('2026-05-02T00:00:00+07:00');
  const evs = cal.getEvents(windowStart, windowEnd);
  let deleted = 0, failed = 0;
  evs.forEach(ev => {
    try { ev.deleteEvent(); deleted++; }
    catch (e) { failed++; }
  });
  logAction('gcal_wipe', 'server', 'deleted=' + deleted + ' failed=' + failed);
  return { calendarId: calId, deleted, failed };
}

// Sheet time cells can come back as Date objects (with the 1899-12-30 epoch),
// as ISO strings, or as plain "HH:mm" strings. Normalize to "HH:mm".
//
// IMPORTANT: Sheets stores time-only cells as Date objects whose UTC instant
// equals the user-entered time-of-day. e.g. "06:00" → Date(1899-12-30T06:00:00Z).
// Formatting with a real timezone (Asia/Bangkok) corrupts the value by applying
// a historical BMT/ICT offset. So we extract the UTC hours/minutes directly.
function _normalizeHHmm(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const h = v.getUTCHours();
    const m = v.getUTCMinutes();
    return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
  }
  const s = String(v).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return (h.length === 1 ? '0' + h : h) + ':' + m;
  }
  // ISO-like "1899-12-30T06:00:00.000Z" → grab HH:mm directly from the UTC form
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return iso[1] + ':' + iso[2];
  return '';
}

// 5-min cron: read the GCal, for each event find its App ref, and
// update the Calendar sheet row if anything changed. Deletes in GCal
// are ignored (safer — user might have archived by accident).
function syncFromGoogleCalendar() {
  const props = PropertiesService.getScriptProperties();
  const calId = props.getProperty(GCAL_PROP_KEY);
  if (!calId) { logAction('gcal_sync_skip', 'server', 'no calendar id'); return 'No TSV GCal configured'; }
  const cal = CalendarApp.getCalendarById(calId);
  if (!cal) { logAction('gcal_sync_skip', 'server', 'calendar lookup failed'); return 'Calendar not accessible'; }

  const sheet = SPREADSHEET.getSheetByName(SHEETS.CALENDAR.name);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol        = headers.indexOf('id');
  const dayCol       = headers.indexOf('day');
  const startCol     = headers.indexOf('startTime');
  const endCol       = headers.indexOf('endTime');
  const titleCol     = headers.indexOf('title');
  const locCol       = headers.indexOf('location');
  const catCol       = headers.indexOf('category');
  const attireCol    = headers.indexOf('attire');
  const remarksCol   = headers.indexOf('remarks');
  const visitCol     = headers.indexOf('visitId');
  const synicCol     = headers.indexOf('synicReport');
  const updatedCol   = headers.indexOf('updatedAt');

  const windowStart = new Date('2026-04-25T00:00:00+07:00');
  const windowEnd   = new Date('2026-05-02T00:00:00+07:00');
  const events = cal.getEvents(windowStart, windowEnd);

  let updated = 0, unchanged = 0, unmatched = 0;
  const nowIso = new Date().toISOString();

  events.forEach(ev => {
    const parsed = _parseGcalDescription(ev.getDescription());
    if (!parsed.appId) { unmatched++; return; }
    // Find the row with this appId
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][idCol] !== parsed.appId) continue;
      const row = rows[i];
      const evStart = ev.getStartTime();
      const evEnd   = ev.getEndTime();
      const dateStr = Utilities.formatDate(evStart, GCAL_TIMEZONE, 'yyyy-MM-dd');
      const dayMeta = DAYS_MAP[dateStr];
      if (!dayMeta) { unmatched++; return; }
      const newDay     = dayMeta.day;
      const newStart   = Utilities.formatDate(evStart, GCAL_TIMEZONE, 'HH:mm');
      const newEnd     = Utilities.formatDate(evEnd,   GCAL_TIMEZONE, 'HH:mm');
      const newTitle   = ev.getTitle();
      const newLoc     = ev.getLocation();
      const newCat     = parsed.category || row[catCol] || 'event';
      const newAttire  = parsed.attire   != null ? parsed.attire   : row[attireCol];
      const newRemarks = parsed.remarks  != null ? parsed.remarks  : row[remarksCol];
      const newVisit   = parsed.visitId  != null ? parsed.visitId  : row[visitCol];
      const newSynic   = parsed.synicReport ? 'true' : 'false';

      // Any change?
      // IMPORTANT: startTime/endTime in the Calendar sheet are stored as Date
      // objects by Sheets (Excel epoch 1899-12-30THH:MM:00Z). String() on a
      // Date object gives a verbose timestamp, not "HH:mm". Use _normalizeHHmm
      // so the comparison is always "HH:mm" vs "HH:mm" — prevents the "all 59
      // events always changed" re-write loop on every sync pass.
      const changed =
        String(row[dayCol])          !== String(newDay) ||
        _normalizeHHmm(row[startCol])!== newStart ||
        _normalizeHHmm(row[endCol])  !== newEnd ||
        String(row[titleCol])        !== newTitle ||
        String(row[locCol])          !== (newLoc || '') ||
        String(row[catCol])          !== String(newCat) ||
        String(row[attireCol])       !== String(newAttire) ||
        String(row[remarksCol])      !== String(newRemarks) ||
        String(row[visitCol])        !== String(newVisit) ||
        String(row[synicCol])        !== newSynic;

      if (!changed) { unchanged++; return; }

      row[dayCol]     = newDay;
      row[startCol]   = newStart;
      row[endCol]     = newEnd;
      row[titleCol]   = newTitle;
      row[locCol]     = newLoc || '';
      row[catCol]     = newCat;
      if (attireCol >= 0)  row[attireCol]  = newAttire;
      if (remarksCol >= 0) row[remarksCol] = newRemarks;
      if (visitCol >= 0)   row[visitCol]   = newVisit;
      if (synicCol >= 0)   row[synicCol]   = newSynic;
      if (updatedCol >= 0) row[updatedCol] = nowIso;
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
      updated++;
      return;
    }
    unmatched++;
  });

  if (updated > 0) logAction('gcal_sync', 'server', 'updated=' + updated + ' unchanged=' + unchanged + ' unmatched=' + unmatched);
  return { updated, unchanged, unmatched };
}

// Rename the existing TSV calendar if it was created with an older name.
function renameTsvCalendar() {
  const props = PropertiesService.getScriptProperties();
  const calId = props.getProperty(GCAL_PROP_KEY);
  if (!calId) return { error: 'No calendar created yet' };
  const cal = CalendarApp.getCalendarById(calId);
  if (!cal) return { error: 'Calendar lookup failed' };
  const oldName = cal.getName();
  if (oldName === GCAL_NAME) return { ok: true, status: 'already named ' + GCAL_NAME };
  cal.setName(GCAL_NAME);
  return { ok: true, renamed: oldName + ' → ' + GCAL_NAME };
}

// Share the calendar with a given email (view + edit). Run once.
function shareTsvCalendarWith(email) {
  const props = PropertiesService.getScriptProperties();
  const calId = props.getProperty(GCAL_PROP_KEY);
  if (!calId) return { error: 'No calendar created yet' };
  const cal = CalendarApp.getCalendarById(calId);
  if (!cal) return { error: 'Calendar lookup failed' };
  cal.addEditor(email);
  return { ok: true, calendarId: calId, shared: email };
}


// ════════════════════════════════════════════════════════════
// DIAGNOSTICS — read-only peek into trigger state + GCal status
// GET  ?action=diagnose
// ════════════════════════════════════════════════════════════
function diagnose() {
  const out = { ok: true, now: new Date().toISOString(), bkkNow: Utilities.formatDate(bkkNow(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss EEE') };

  // 1. Trigger inventory
  try {
    const triggers = ScriptApp.getProjectTriggers().map(t => {
      const info = { handler: t.getHandlerFunction(), type: String(t.getEventType()) };
      try {
        if (info.type === 'CLOCK') {
          // No getAtHour on triggers; we can only report source/handler
          info.source = String(t.getTriggerSource());
        }
      } catch (e) {}
      return info;
    });
    out.triggers = triggers;
    out.triggerCount = triggers.length;
    out.expectedHandlers = ['sendWeatherBriefing','sendDailyReminder','sendEveningSitrep','sendMidnightSitrep','syncFromGoogleCalendar'];
    out.missingHandlers = out.expectedHandlers.filter(h => !triggers.some(t => t.handler === h));
  } catch (e) { out.triggerError = e.message; }

  // 2. GCal state
  try {
    const calId = PropertiesService.getScriptProperties().getProperty(GCAL_PROP_KEY);
    out.gcalId = calId || null;
    if (calId) {
      const cal = CalendarApp.getCalendarById(calId);
      if (cal) {
        out.gcalName = cal.getName();
        const windowStart = new Date('2026-04-25T00:00:00+07:00');
        const windowEnd   = new Date('2026-05-02T00:00:00+07:00');
        const evs = cal.getEvents(windowStart, windowEnd);
        out.gcalEventCount = evs.length;
        out.gcalFirstFive = evs.slice(0, 5).map(ev => ({
          title: ev.getTitle(),
          start: ev.getStartTime().toISOString(),
          loc:   ev.getLocation() || ''
        }));
      } else {
        out.gcalError = 'calendarId stored but lookup failed';
      }
    }
  } catch (e) { out.gcalError = e.message; }

  // 3. Calendar sheet state
  try {
    const rows = readSheet(SHEETS.CALENDAR).filter(r => r.isDeleted !== 'true' && r.isDeleted !== true);
    out.calendarSheetRows = rows.length;
    out.calendarSheetFirst = rows.slice(0, 3).map(r => ({ id: r.id, day: r.day, t: r.startTime, title: r.title }));
  } catch (e) { out.calendarSheetError = e.message; }

  // 4. Recent Log rows (last 25)
  try {
    const log = readSheet(SHEETS.LOG);
    out.recentLog = log.slice(-25);
  } catch (e) { out.logError = e.message; }

  return out;
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

// Migration: the Members sheet was created without an isAdmin column.
// Every 'grant admin' write since has silently done nothing. This inserts
// the column after pin (position 9) with 'false' as the default for all
// existing rows, and drops any trailing blank columns.
function ensureIsAdminColumn() {
  const sheet = SPREADSHEET.getSheetByName(SHEETS.MEMBERS.name);
  if (!sheet) return { error: 'Members sheet not found' };
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('isAdmin') >= 0) return { ok: true, status: 'already present' };

  const pinIdx = headers.indexOf('pin');
  if (pinIdx < 0) return { error: 'pin column missing — aborting' };
  // Insert a new column AFTER pin (Apps Script col index is 1-based)
  sheet.insertColumnAfter(pinIdx + 1);
  const newCol = pinIdx + 2;   // 1-based index of the new column
  sheet.getRange(1, newCol).setValue('isAdmin');
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const range = sheet.getRange(2, newCol, lastRow - 1, 1);
    // Default everyone to 'false'. Caspar is super-admin by hardcoded ID
    // so the flag doesn't matter for him; everyone else starts non-admin.
    const values = [];
    for (let i = 0; i < lastRow - 1; i++) values.push(['false']);
    range.setValues(values);
    range.setNumberFormat('@');   // force text format
  }
  // Clean up any trailing blank-header column
  const cleanHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (let i = cleanHeaders.length - 1; i > 0; i--) {
    if (!cleanHeaders[i]) {
      sheet.deleteColumn(i + 1);
    } else break;
  }
  return { ok: true, added: 'isAdmin column inserted at position ' + newCol };
}

// Pre-trip clean slate — clears every trip-data sheet but KEEPS the
// roster (Members) and itinerary (Calendar). Run once before the trip.
// Preserves each sheet's header row; only data rows go.
function cleanSlateForTrip() {
  const TARGET_SHEETS = [
    SHEETS.STATUS,      // current in/out/GPS
    SHEETS.STATUSLOG,   // audit trail
    SHEETS.LEARNINGS,   // test learning posts
    SHEETS.REFLECTIONS, // test reflection posts
    SHEETS.INCIDENTS,   // test IR submissions
    SHEETS.PINGS,       // in-app pings
    SHEETS.ADMINREQ,    // admin-rights requests
    SHEETS.LOG          // action log (server-side audit)
  ];
  const summary = [];
  TARGET_SHEETS.forEach(spec => {
    try {
      const sheet = SPREADSHEET.getSheetByName(spec.name);
      if (!sheet) { summary.push(spec.name + ' → not found'); return; }
      const lastRow = sheet.getLastRow();
      const dataRows = Math.max(0, lastRow - 1);
      if (dataRows > 0) {
        sheet.deleteRows(2, dataRows);
      }
      summary.push(spec.name + ' → ' + dataRows + ' rows cleared');
    } catch (e) {
      summary.push(spec.name + ' → FAILED: ' + e.message);
    }
  });
  // Also reset the seed-mutex so subsequent admin boots can re-run any
  // missing-member checks cleanly.
  try { PropertiesService.getScriptProperties().deleteProperty('lastSeedTs'); } catch {}
  logAction('cleanSlateForTrip', 'server', summary.join(' · '));
  return { cleared: summary, ts: new Date().toISOString() };
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
