// ============================================================
// TSV PWA — Google Apps Script Backend
// Paste this ENTIRE file into Extensions → Apps Script, then
// Deploy → New Deployment → Web App (Execute as: Me, Access: Anyone)
// ============================================================

// Sheet ID — from https://docs.google.com/spreadsheets/d/<ID>/edit
const SHEET_ID = '19IjTK0I_L2NXJ9afqTxf3GkCXbcONio4ORaw-54JOjY';
const SPREADSHEET = SpreadsheetApp.openById(SHEET_ID);

// Sheet schemas
const SHEETS = {
  MEMBERS:   { name: 'Members',   headers: ['id','name','shortName','rank','role','csc','syndicate','pin','isDeleted','createdAt','updatedAt'] },
  STATUS:    { name: 'Status',    headers: ['id','status','locationText','lat','lng','buddyWith','roomNumber','lastUpdated'] },
  LEARNINGS: { name: 'Learnings', headers: ['id','authorId','authorName','day','content','isAhha','timestamp'] },
  INCIDENTS: { name: 'Incidents', headers: ['id','reportedBy','type','who','what','where','when','why','how','status','buddy','medicalFacility','actionsText','timestamp'] },
  LOG:       { name: 'Log',       headers: ['timestamp','action','actor','detail'] }
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
                       m.pin || '0000', 'false', now, now]);
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
