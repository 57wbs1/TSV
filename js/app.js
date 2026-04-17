// ════════════════════════════════════════════════════════════
// TSV BKK PWA — Main Application
// ════════════════════════════════════════════════════════════

const STATE = {
  currentUser: null,
  currentTab: 'home',
  memberStatuses: {},
  learnings: [],
  currentDay: null,
  scheduleDay: 1,
  calendarCategoryFilter: 'all',
  pollTimer: null,
  map: null,
  mapMarkers: {},
  reportSent: { evening: false, midnight: false },
  locationFilter: 'all',
  offlineMode: false,
  currentVisitId: null,
  composeAhha: false
};

// ═══════════ API LAYER ═══════════════════════════════════════
const API = {
  async get(action) {
    if (!CONFIG.apiUrl || CONFIG.apiUrl.startsWith('YOUR_')) {
      STATE.offlineMode = true;
      return null;
    }
    try {
      const res = await fetch(`${CONFIG.apiUrl}?action=${action}`, { method: 'GET' });
      const json = await res.json();
      return json.ok ? json.data : null;
    } catch (e) { STATE.offlineMode = true; return null; }
  },
  async post(action, data) {
    if (!CONFIG.apiUrl || CONFIG.apiUrl.startsWith('YOUR_')) {
      STATE.offlineMode = true;
      return null;
    }
    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        body: JSON.stringify({ action, ...data }),
        headers: { 'Content-Type': 'text/plain' }
      });
      const json = await res.json();
      return json.ok ? json.data : null;
    } catch (e) { STATE.offlineMode = true; return null; }
  }
};

// ═══════════ TELEGRAM ════════════════════════════════════════
const TELEGRAM = {
  async send(text, chatId) {
    const token = CONFIG.telegram.botToken;
    const cid = chatId || CONFIG.telegram.chatId;
    if (!token || token.startsWith('YOUR_') || !cid || cid.startsWith('YOUR_')) {
      toast('⚠️ Telegram not configured in config.js');
      return false;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cid, text, parse_mode: 'HTML' })
      });
      const json = await res.json();
      return json.ok;
    } catch (e) { toast('❌ Telegram send failed'); return false; }
  },

  buildEveningReport() {
    const all = MEMBERS;
    const st = STATE.memberStatuses;
    const out = all.filter(m => st[m.id]?.status === 'out');
    const inH = all.filter(m => !st[m.id] || st[m.id].status !== 'out');
    const date = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', timeZone:'Asia/Bangkok' });

    let msg = `📍 <b>TSV SITREP | 2300H ${date}</b>\n\nHeadcount: ${inH.length}/${all.length} In Hotel | ${out.length} Out\n\n`;
    if (out.length) {
      msg += `<b>OUT OF HOTEL:</b>\n`;
      out.forEach(m => {
        const s = st[m.id] || {};
        const loc = s.locationText ? ` — ${s.locationText}` : '';
        const bd = s.buddyWith ? ` (w/ ${s.buddyWith})` : '';
        msg += `🔴 ${m.shortName}${loc}${bd}\n`;
      });
      msg += '\n';
    }
    msg += `<b>By Syndicate:</b>\n`;
    groupOrder().filter(g => g !== 'Leadership').forEach(gk => {
      const mem = membersInGroup(gk);
      const o = mem.filter(m => st[m.id]?.status === 'out').length;
      const i = mem.length - o;
      msg += `${o === 0 ? '✅' : '⚠️'} ${gk}: ${i}/${mem.length} In\n`;
    });
    msg += `\n⏰ <i>All to be back by 0200H</i>`;
    return msg;
  },

  buildMidnightReport() {
    const all = MEMBERS;
    const st = STATE.memberStatuses;
    const out = all.filter(m => st[m.id]?.status === 'out');
    const date = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', timeZone:'Asia/Bangkok' });
    if (out.length === 0)
      return `✅ <b>TSV EOD | 0200H ${date}</b>\n\nAll ${all.length}/${all.length} In Hotel.\nGood night! 🌙`;
    let msg = `⚠️ <b>TSV EOD | 0200H ${date}</b>\n\n${all.length - out.length}/${all.length} In Hotel.\n\n<b>OUTSTANDING:</b>\n`;
    out.forEach(m => {
      const s = st[m.id] || {};
      const loc = s.locationText ? ` — ${s.locationText}` : ' — last location unknown';
      const upd = s.lastUpdated ? ` (last upd: ${new Date(s.lastUpdated).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})})` : '';
      msg += `🔴 ${m.name}${loc}${upd}\n`;
    });
    return msg;
  }
};

// ═══════════ UTILITIES ═══════════════════════════════════════
function el(id) { return document.getElementById(id); }
function qs(s, p) { return (p || document).querySelector(s); }

let toastTimer;
function toast(msg, ms = 3000) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function bkkNow() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })); }
function formatBKKTime(d = bkkNow()) { return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false }); }

function getCurrentDay() {
  const dateStr = bkkNow().toISOString().split('T')[0];
  return DAYS.find(d => d.date === dateStr) || null;
}

function getTripStatus() {
  const now = bkkNow();
  const start = new Date(DAYS[0].date + 'T00:00:00+07:00');
  const end = new Date(DAYS[DAYS.length - 1].date + 'T23:59:59+07:00');
  if (now < start) {
    const days = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
    return { phase: 'before', days };
  }
  if (now > end) return { phase: 'after' };
  return { phase: 'during', day: getCurrentDay() };
}

function getMemberById(id) { return MEMBERS.find(m => m.id === id); }
function getStatusOf(id) { return STATE.memberStatuses[id] || { status:'in_hotel', locationText:'', buddyWith:'' }; }
function inCount() { return MEMBERS.filter(m => getStatusOf(m.id).status !== 'out').length; }
function outCount() { return MEMBERS.filter(m => getStatusOf(m.id).status === 'out').length; }
function synColor(g) { return groupColorFor(g); }
function groupOrder() { return computeGroupOrder(); }
function membersInGroup(g) { return MEMBERS.filter(m => memberGroupKey(m) === g); }
function isAdmin() {
  const u = STATE.currentUser;
  if (!u) return false;
  if (CONFIG.adminIds.includes(u.id)) return true;
  if (u.isAdmin === true || u.isAdmin === 'true') return true; // approved via admin request
  return false;
}

// Who can see all syndicates (not just their own)?
// Admins + Staff/Leadership members.
function canSeeAllSyndicates() {
  const u = STATE.currentUser;
  if (!u) return false;
  if (isAdmin()) return true;
  if (u.csc === 'Staff' || u.syndicate === 'Leadership') return true;
  return false;
}

// Filter group order for current user's visibility
function visibleGroups() {
  if (canSeeAllSyndicates()) return groupOrder();
  const u = STATE.currentUser;
  if (!u) return [];
  return [memberGroupKey(u)];
}
function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ═══════════ LOGIN FLOW (Syndicate → Name → PIN) ═════════════
let pinBuffer = '';
let loginCandidateMember = null;

function showLoginFlow() {
  el('login-flow').classList.remove('hidden');
  goToSynStep();
}
function hideLoginFlow() { el('login-flow').classList.add('hidden'); }

function goToSynStep() {
  el('login-step-syn').classList.remove('hidden');
  el('login-step-name').classList.add('hidden');
  el('login-step-pin').classList.add('hidden');
  renderLoginSyndicateList();
}
function backToSynStep() { goToSynStep(); }

function renderLoginSyndicateList() {
  const list = el('login-syn-list');
  list.innerHTML = '';
  groupOrder().forEach(gk => {
    const mem = membersInGroup(gk);
    if (!mem.length) return;
    const display = formatGroupDisplay(gk);
    const card = document.createElement('button');
    card.className = 'login-group-card';
    card.innerHTML = `
      <div class="lg-badge">${gk === 'Leadership' ? '★' : (mem[0].syndicate || '?')}</div>
      <div class="lg-info">
        <div class="lg-title">${escapeHtml(display)}</div>
        <div class="lg-sub">${mem.length} ${mem.length === 1 ? 'member' : 'members'}</div>
      </div>
      <div class="lg-arrow">›</div>`;
    card.addEventListener('click', () => goToNameStep(gk));
    list.appendChild(card);
  });
}

function goToNameStep(groupKey) {
  el('login-step-syn').classList.add('hidden');
  el('login-step-name').classList.remove('hidden');
  el('login-step-pin').classList.add('hidden');
  el('login-syn-label').textContent = formatGroupDisplay(groupKey);
  window._loginActiveGroup = groupKey;

  const grid = el('login-name-list');
  grid.innerHTML = '';
  membersInGroup(groupKey).forEach(m => {
    const card = document.createElement('button');
    card.className = 'login-name-card';
    card.textContent = m.shortName || m.name;
    card.addEventListener('click', () => goToPinStep(m));
    grid.appendChild(card);
  });
  // "Not in list" button lives on this step now
  const addBtn = document.createElement('button');
  addBtn.className = 'login-name-card';
  addBtn.style.cssText = 'border-style:dashed;opacity:.8;grid-column:span 2';
  addBtn.innerHTML = '➕ I\'m not here — register me';
  addBtn.addEventListener('click', () => {
    hideLoginFlow();
    showSelfRegisterWithDefault(groupKey);
  });
  grid.appendChild(addBtn);
}
function backToNameStep() {
  if (loginCandidateMember) {
    goToNameStep(memberGroupKey(loginCandidateMember));
  } else {
    goToSynStep();
  }
}

function goToPinStep(member) {
  loginCandidateMember = member;
  el('login-step-name').classList.add('hidden');
  el('login-step-pin').classList.remove('hidden');
  el('login-user-label').innerHTML = `Welcome, <b>${escapeHtml(member.shortName || member.name)}</b><br>Enter your 4-digit PIN`;
  pinBuffer = '';
  renderPinDots();
  el('pin-error').classList.add('hidden');
}

function renderPinDots() {
  const dots = el('pin-dots');
  if (!dots) return;
  [...dots.children].forEach((d, i) => d.classList.toggle('filled', i < pinBuffer.length));
}

function setupPinKeypad() {
  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.k;
      if (!k) return;
      if (k === 'back') pinBuffer = pinBuffer.slice(0, -1);
      else if (pinBuffer.length < 4) pinBuffer += k;
      renderPinDots();
      el('pin-error').classList.add('hidden');
      if (pinBuffer.length === 4) setTimeout(tryPin, 150);
    });
  });
}

function tryPin() {
  const expectedPin = loginCandidateMember?.pin || CONFIG.defaultPin || '0000';
  if (pinBuffer === expectedPin) {
    saveIdentity(loginCandidateMember);
    hideLoginFlow();
    initMemberInSheet(loginCandidateMember);
    startApp();
  } else {
    el('pin-dots').classList.add('shake');
    el('pin-error').classList.remove('hidden');
    navigator.vibrate?.(200);
    setTimeout(() => {
      pinBuffer = '';
      renderPinDots();
      el('pin-dots').classList.remove('shake');
    }, 400);
  }
}

window.backToSynStep = backToSynStep;
window.backToNameStep = backToNameStep;

// ═══════ SWIPE-DOWN TO CLOSE for bottom sheet modals ════════
function attachSwipeDownClose(modalEl, sheetSelector, onClose) {
  const sheet = modalEl.querySelector(sheetSelector);
  if (!sheet) return;
  let startY = 0, currentY = 0, dragging = false, startScroll = 0;
  const scrollContainer = sheet.querySelector('[id$="-body"], .editor-body') || sheet;

  sheet.addEventListener('touchstart', e => {
    startScroll = scrollContainer.scrollTop || 0;
    if (startScroll > 0) return; // only if content scrolled to top
    startY = e.touches[0].clientY;
    dragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!dragging) return;
    currentY = e.touches[0].clientY - startY;
    if (currentY < 0) currentY = 0;
    sheet.style.transform = `translateY(${currentY}px)`;
  }, { passive: true });

  sheet.addEventListener('touchend', () => {
    if (!dragging) return;
    sheet.style.transition = 'transform .25s var(--ease-out)';
    if (currentY > 120) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => {
        sheet.style.transform = '';
        modalEl.classList.add('hidden');
        if (onClose) onClose();
      }, 240);
    } else {
      sheet.style.transform = '';
    }
    dragging = false;
    currentY = 0;
  });
}

function setupModalSwipes() {
  attachSwipeDownClose(el('members-modal'), '.members-sheet');
  attachSwipeDownClose(el('settings-modal'), '#settings-sheet');
  attachSwipeDownClose(el('member-editor'), '.editor-sheet', () => { _editingMemberId = null; });
  attachSwipeDownClose(el('event-editor'), '.editor-sheet');
  attachSwipeDownClose(el('event-detail-modal'), '.visit-detail-sheet');
  attachSwipeDownClose(el('visit-detail-modal'), '.visit-detail-sheet');
  attachSwipeDownClose(el('buddy-modal'), '.buddy-sheet');
}

function logout() {
  localStorage.removeItem('tsv_user');
  STATE.currentUser = null;
  loginCandidateMember = null;
  el('app').classList.remove('visible');
  showLoginFlow();
}
window.logout = logout;

// ═══════════ NAVIGATION ══════════════════════════════════════
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  el(`tab-${tabId}`)?.classList.add('active');
  el(`nav-${tabId}`)?.classList.add('active');
  STATE.currentTab = tabId;

  if (tabId === 'home')      renderHome();
  if (tabId === 'calendar')  renderCalendar();
  if (tabId === 'location')  renderLocation();
  if (tabId === 'rooms')     renderRooms();
  if (tabId === 'map')       initMap();
  if (tabId === 'learnings') renderLearnings();
  if (tabId === 'ir')        renderIR();
  if (tabId === 'sop')       renderSOP();
}

// ═══════════ IDENTITY ════════════════════════════════════════
function loadIdentity() {
  const saved = localStorage.getItem('tsv_user');
  if (saved) {
    try { STATE.currentUser = JSON.parse(saved); return true; } catch { return false; }
  }
  return false;
}
function saveIdentity(m) {
  STATE.currentUser = m;
  localStorage.setItem('tsv_user', JSON.stringify(m));
}
function showIdentityModal() { el('identity-modal').classList.remove('hidden'); renderMemberPicker(''); }
function hideIdentityModal() { el('identity-modal').classList.add('hidden'); }

function renderMemberPicker(q) {
  const list = el('member-list');
  list.innerHTML = '';
  const query = (q || '').toLowerCase();
  const filtered = MEMBERS.filter(m =>
    !query || m.name.toLowerCase().includes(query) || (m.role||'').toLowerCase().includes(query) ||
    (m.csc||'').toLowerCase().includes(query) || String(m.syndicate||'').toLowerCase().includes(query));

  groupOrder().forEach(gk => {
    const gm = filtered.filter(m => memberGroupKey(m) === gk);
    if (!gm.length) return;
    const hdr = document.createElement('div');
    hdr.className = 'syn-group-header';
    hdr.textContent = gk;
    list.appendChild(hdr);
    gm.forEach(m => {
      const item = document.createElement('div');
      item.className = 'member-pick-item';
      item.innerHTML = `
        <span class="badge" style="background:${synColor(gk)}">${gk === 'Leadership' ? 'STAFF' : m.syndicate}</span>
        <div>
          <div class="name">${escapeHtml(m.name)}</div>
          <div class="role">${escapeHtml(m.role || '')}${m.csc && m.csc !== 'Staff' ? ' · ' + escapeHtml(m.csc) : ''}</div>
        </div>`;
      item.addEventListener('click', () => {
        saveIdentity(m);
        hideIdentityModal();
        initMemberInSheet(m);
        startApp();
      });
      list.appendChild(item);
    });
  });

  if (!list.children.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">👥</div><p>No members match.<br>Use <b>"I\'m not in the list"</b> above to register.</p></div>';
  }
}

async function initMemberInSheet(member) {
  if (STATE.offlineMode) return;
  await API.post('updateStatus', {
    memberId: member.id, name: member.name, shortName: member.shortName,
    role: member.role, syndicate: member.syndicate,
    status: 'in_hotel', locationText: '', lat: '', lng: ''
  });
}

// ═══════════ SELF-REGISTER ═══════════════════════════════════
window.showSelfRegisterWithDefault = function(groupKey) {
  window._selfRegisterDefaultGroup = groupKey;
  showSelfRegister();
};

window.showSelfRegister = function() {
  hideIdentityModal();
  el('self-register-modal').classList.remove('hidden');

  el('sr-rank').innerHTML = DEFAULT_RANK_OPTIONS.map(r => `<option value="${r}">${r || '(none)'}</option>`).join('');
  el('sr-role').innerHTML = DEFAULT_ROLE_OPTIONS.map(r => `<option value="${r}">${r}</option>`).join('');
  const cscs = getCSCsInUse();
  // If arriving from a syndicate button, pre-select that CSC + Syn
  const defGroup = window._selfRegisterDefaultGroup;
  let defCsc = cscs[0], defSyn = null;
  if (defGroup && defGroup !== 'Leadership') {
    const match = defGroup.match(/^(.+?)\s*Syn\s*(\S+)$/i);
    if (match) { defCsc = match[1].trim(); defSyn = match[2]; }
  }
  el('sr-csc').innerHTML = cscs.map(c => `<option value="${c}" ${c === defCsc ? 'selected' : ''}>${c}</option>`).join('') + '<option value="__custom__">➕ Add new CSC…</option>';
  populateSelfRegSyn(defCsc, defSyn);
  window._selfRegisterDefaultGroup = null;

  ['sr-name','sr-shortName','sr-custom-csc','sr-custom-syn'].forEach(id => el(id).value = '');
  el('sr-custom-csc-wrap').classList.add('hidden');
  el('sr-custom-syn-wrap').classList.add('hidden');
};
window.hideSelfRegister = function() {
  el('self-register-modal').classList.add('hidden');
  showIdentityModal();
};
function populateSelfRegSyn(csc, preselectSyn) {
  const syns = getSyndicatesForCSC(csc);
  if (!syns.length) syns.push('1');
  el('sr-syn').innerHTML = syns.map(s => `<option value="${s}" ${String(preselectSyn) === String(s) ? 'selected' : ''}>${s}</option>`).join('') + '<option value="__custom__">➕ Add new Syndicate…</option>';
}
window.onSelfRegCSCChange = function() {
  const v = el('sr-csc').value;
  if (v === '__custom__') {
    el('sr-custom-csc-wrap').classList.remove('hidden');
    populateSelfRegSyn('');
  } else {
    el('sr-custom-csc-wrap').classList.add('hidden');
    populateSelfRegSyn(v);
  }
};
document.addEventListener('change', e => {
  if (e.target?.id === 'sr-syn') {
    el('sr-custom-syn-wrap').classList.toggle('hidden', e.target.value !== '__custom__');
  }
});
window.submitSelfRegister = async function() {
  const name = el('sr-name').value.trim();
  const shortName = el('sr-shortName').value.trim() || name;
  const rank = el('sr-rank').value;
  const role = el('sr-role').value;
  let csc = el('sr-csc').value;
  let syn = el('sr-syn').value;
  if (csc === '__custom__') csc = el('sr-custom-csc').value.trim();
  if (syn === '__custom__') syn = el('sr-custom-syn').value.trim();

  if (!name) return toast('Name is required');
  if (!csc) return toast('CSC is required');
  if (!syn) return toast('Syndicate is required');

  const id = 'm_' + Date.now() + '_' + Math.floor(Math.random()*1000);
  const newMember = { id, name, shortName, rank, role, csc, syndicate: syn };

  MEMBERS.push(newMember);
  el('self-register-modal').classList.add('hidden');

  await API.post('addMember', { ...newMember, actor: id });
  saveIdentity(newMember);
  initMemberInSheet(newMember);
  toast(`✅ Welcome, ${shortName}!`);
  startApp();
};

// ═══════════ DATA SYNC ═══════════════════════════════════════
async function syncMembers() {
  const data = await API.get('getMembers');
  if (!data || !Array.isArray(data) || data.length === 0) return;
  MEMBERS = data.map(row => ({
    id: String(row.id), name: row.name || '', shortName: row.shortName || row.name || '',
    rank: row.rank || '', role: row.role || 'Member',
    csc: row.csc || '', syndicate: String(row.syndicate || ''),
    pin: row.pin || '0000',
    isAdmin: row.isAdmin === 'true' || row.isAdmin === true
  }));
  // Refresh current user's flags (e.g., isAdmin just approved)
  if (STATE.currentUser) {
    const me = MEMBERS.find(m => m.id === STATE.currentUser.id);
    if (me) {
      STATE.currentUser = { ...STATE.currentUser, ...me };
      saveIdentity(STATE.currentUser);
    }
  }
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.currentTab === 'home')     renderHome();
}

async function syncStatuses() {
  const data = await API.get('getStatuses');
  if (!data) return;
  const map = {};
  data.forEach(r => {
    if (r.id) map[r.id] = {
      status: r.status || 'in_hotel',
      locationText: r.locationText || '',
      lat: parseFloat(r.lat) || null,
      lng: parseFloat(r.lng) || null,
      buddyWith: r.buddyWith || '',
      roomNumber: r.roomNumber || '',
      lastUpdated: r.lastUpdated || ''
    };
  });
  STATE.memberStatuses = map;
  if (STATE.currentTab === 'home')     renderHome();
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.currentTab === 'map')      updateMapMarkers();
}

async function syncLearnings() {
  const data = await API.get('getLearnings');
  if (!data) return;
  STATE.learnings = data;
  if (STATE.currentTab === 'learnings') renderLearnings();
}

async function syncCalendar() {
  const data = await API.get('getCalendar');
  if (!Array.isArray(data) || !data.length) return;
  // Merge: Sheet is source of truth when present
  CALENDAR_EVENTS = data.map(r => ({
    id: String(r.id),
    day: parseInt(r.day),
    startTime: r.startTime,
    endTime: r.endTime,
    title: r.title,
    location: r.location,
    category: r.category,
    attire: r.attire,
    visitId: r.visitId,
    remarks: r.remarks,
    oics: r.oics ? (typeof r.oics === 'string' ? safeJson(r.oics) : r.oics) : {},
    isDeleted: r.isDeleted
  }));
  if (STATE.currentTab === 'calendar') renderCalendar();
  if (STATE.currentTab === 'home') renderHome();
}

async function seedIfEmpty() {
  if (STATE.offlineMode) return;
  const members = await API.get('getMembers');
  if (Array.isArray(members) && members.length === 0) await API.post('seedMembers', { members: DEFAULT_MEMBERS });
  const cal = await API.get('getCalendar');
  if (Array.isArray(cal) && cal.length === 0) await API.post('seedCalendar', { events: CALENDAR_SEED });
  await syncMembers();
  await syncCalendar();
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

function startPolling() {
  if (STATE.pollTimer) clearInterval(STATE.pollTimer);
  syncMembers().then(syncStatuses);
  syncLearnings();
  syncCalendar();
  STATE.pollTimer = setInterval(() => {
    syncMembers();
    syncStatuses();
    if (STATE.currentTab === 'learnings') syncLearnings();
    if (STATE.currentTab === 'calendar') syncCalendar();
  }, CONFIG.pollInterval);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { syncMembers(); syncStatuses(); }
  });
}

// ═══════════ HOME TAB ════════════════════════════════════════
function renderHome() {
  const trip = getTripStatus();
  const bkk = bkkNow();
  const inC = inCount(), outC = outCount(), total = MEMBERS.length;
  const user = STATE.currentUser;
  const myStatus = getStatusOf(user?.id || '');
  const myGroup = user ? memberGroupKey(user) : null;
  const myHypothesis = myGroup ? getHypothesisForGroup(myGroup) : null;

  // Hero varies with trip phase
  let heroHtml, nextEventHtml = '';
  if (trip.phase === 'before') {
    heroHtml = `
      <div class="home-hero" style="background:linear-gradient(135deg, #003580, #0056b3)">
        <div class="hero-content">
          <span class="hero-day-label">● Pre-Trip · Ready-State</span>
          <div class="hero-theme">🛫 Trip starts in ${trip.days} day${trip.days === 1 ? '' : 's'}</div>
          <div class="hero-date">First day: ${new Date(DAYS[0].date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}</div>
          <div class="hero-time" id="live-time">${formatBKKTime(bkk)}</div>
          <div class="hero-time-label">Bangkok / Singapore Time</div>
        </div>
      </div>`;
  } else if (trip.phase === 'after') {
    heroHtml = `
      <div class="home-hero" style="background:linear-gradient(135deg, #1C2D4E, #334155)">
        <div class="hero-content">
          <span class="hero-day-label">● Trip Complete</span>
          <div class="hero-theme">✈️ Safe journey home</div>
          <div class="hero-date">Reflect and consolidate learnings</div>
          <div class="hero-time" id="live-time">${formatBKKTime(bkk)}</div>
          <div class="hero-time-label">Bangkok / Singapore Time</div>
        </div>
      </div>`;
  } else {
    const day = trip.day;
    STATE.currentDay = day;
    const nextEvent = day ? getNextEvent(day, bkk) : null;
    heroHtml = `
      <div class="home-hero">
        <div class="hero-content">
          <span class="hero-day-label">● Day ${day.day} · ${day.label}</span>
          <div class="hero-theme">${day.icon} ${day.theme}</div>
          <div class="hero-date">${new Date(day.date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
          <div class="hero-time" id="live-time">${formatBKKTime(bkk)}</div>
          <div class="hero-time-label">Bangkok / Singapore Time</div>
        </div>
      </div>`;
    if (nextEvent) {
      nextEventHtml = `
        <div class="next-event-card">
          <div class="ne-header" style="background:linear-gradient(135deg, ${day.color}, ${day.color}dd)">
            <span class="ne-dot"></span>Next Event
          </div>
          <div class="ne-body">
            <div class="ne-time">${nextEvent.startTime}–${nextEvent.endTime}</div>
            <div class="ne-event">${escapeHtml(nextEvent.title)}</div>
            <div class="ne-location">📍 ${escapeHtml(nextEvent.location || '')}</div>
            ${nextEvent.attire ? `<div class="ne-attire">👔 ${escapeHtml(nextEvent.attire)}</div>` : ''}
            ${nextEvent.remarks ? `<div class="ne-remarks">${escapeHtml(nextEvent.remarks)}</div>` : ''}
          </div>
        </div>`;
    }
  }

  el('tab-home').innerHTML = `
    ${STATE.offlineMode ? `<div class="alert alert-orange">⚠️ API not configured — local data only.</div>` : ''}

    ${heroHtml}

    <div class="parade-grid">
      <div class="parade-card in"><div class="big-num green">${inC}</div><div class="label">In Hotel</div></div>
      <div class="parade-card out"><div class="big-num ${outC>0?'red':'green'}">${outC}</div><div class="label">Out</div></div>
      <div class="parade-card total"><div class="big-num blue">${total}</div><div class="label">Total</div></div>
      <div class="parade-card status"><div class="big-num gold">${outC===0?'✓':outC}</div><div class="label">${outC===0?'All In':'Out Now'}</div></div>
    </div>

    ${nextEventHtml}

    <div class="my-status-bar">
      <div class="user-icon">👤</div>
      <div class="user-info">
        <div class="user-name">${user ? escapeHtml(user.name) : '—'}</div>
        <div class="user-role">${user ? `${escapeHtml(user.role || '')} · ${user && myGroup ? escapeHtml(formatGroupDisplay(myGroup)) : ''}` : 'Not signed in'}</div>
      </div>
      <span class="status-pill ${myStatus.status==='out'?'pill-out':'pill-in'}">${myStatus.status==='out'?'🔴 OUT':'🟢 IN'}</span>
    </div>

    ${isAdmin() ? `
    <div class="card" style="margin-top:12px">
      <div class="card-header"><span class="icon">📡</span><h3>Admin — Reports</h3></div>
      <div class="card-body">
        <button class="btn btn-primary btn-block" onclick="showAdhocPicker()">📤 Send Adhoc SITREP</button>
        <p style="font-size:11px;color:var(--text-2);margin-top:8px;text-align:center">2300H and 0200H reports run automatically in the background.</p>
      </div>
    </div>` : ''}

    ${myHypothesis ? `
    <div class="card" style="margin-top:12px">
      <div class="card-header" style="background:linear-gradient(135deg, #fef3c7, #fde68a)">
        <span class="icon">🧭</span>
        <h3 style="color:#78350f">${myHypothesis.label} · Your Syndicate's Hypothesis</h3>
      </div>
      <div class="card-body">
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--text-2);text-transform:uppercase;margin-bottom:6px">Line of Inquiry</div>
        <p style="font-size:13px;line-height:1.55;font-style:italic;color:var(--text-2);margin-bottom:10px">${escapeHtml(myHypothesis.loi)}</p>
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--text-2);text-transform:uppercase;margin-bottom:6px">Hypothesis</div>
        <p style="font-size:13.5px;line-height:1.6">${escapeHtml(myHypothesis.hypothesis)}</p>
      </div>
    </div>` : ''}
  `;

  clearInterval(window._clockTimer);
  window._clockTimer = setInterval(() => {
    const e = el('live-time');
    if (e) e.textContent = formatBKKTime(bkkNow());
  }, 1000);
}

// ═══════════ ADHOC SITREP PICKER ═════════════════════════════
window.showAdhocPicker = function() {
  const opts = groupOrder()
    .filter(g => g !== 'Leadership')
    .map(g => ({ key: g, label: formatGroupDisplay(g), count: membersInGroup(g).length }));

  const rows = opts.map(o => `
    <button class="adhoc-row" onclick="sendSyndicateSITREP('${o.key.replace(/'/g,"\\'")}'); closeAdhocPicker()">
      <span>${escapeHtml(o.label)}</span>
      <span class="ah-count">${o.count} ${o.count === 1 ? 'member' : 'members'}</span>
    </button>`).join('');

  const wrap = document.createElement('div');
  wrap.id = 'adhoc-picker';
  wrap.className = 'adhoc-picker';
  wrap.innerHTML = `
    <div class="adhoc-sheet">
      <h3>📤 Send Adhoc SITREP</h3>
      <p class="ah-sub">Which syndicate?</p>
      ${rows}
      <button class="adhoc-row mass" onclick="sendAllSITREPs(); closeAdhocPicker()">
        📣 Mass send — all syndicates
      </button>
      <button class="adhoc-cancel" onclick="closeAdhocPicker()">Cancel</button>
    </div>`;
  document.body.appendChild(wrap);
};
window.closeAdhocPicker = function() { el('adhoc-picker')?.remove(); };

window.sendAllSITREPs = async function() {
  toast('📡 Sending all syndicates...');
  const groups = groupOrder().filter(g => g !== 'Leadership');
  for (const g of groups) {
    await sendSyndicateSITREP(g, true);
    await new Promise(r => setTimeout(r, 400));
  }
  toast('✅ All SITREPs sent');
};

function getNextEvent(day, now) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const events = eventsForDay(day.day);
  for (const ev of events) {
    if (!ev.startTime || ev.startTime === 'Full Day') continue;
    const [h, m] = ev.startTime.split(':').map(Number);
    if (isNaN(h)) continue;
    if (h * 60 + m >= mins) return ev;
  }
  return null;
}

// ═══════════ CALENDAR TAB ════════════════════════════════════
function renderCalendar() {
  const dayTabs = DAYS.map(d => `
    <button class="day-tab ${STATE.scheduleDay === d.day ? 'active' : ''}"
      style="${STATE.scheduleDay === d.day ? `background:${d.color}` : ''}"
      onclick="selectCalendarDay(${d.day})">
      ${d.icon} ${d.day}
    </button>`).join('');

  const day = DAYS.find(d => d.day === STATE.scheduleDay) || DAYS[0];
  const allEvents = eventsForDay(day.day);
  const catFilter = STATE.calendarCategoryFilter;
  const events = catFilter === 'all' ? allEvents : allEvents.filter(e => e.category === catFilter);

  const catChips = ['all', ...Object.keys(EVENT_CATEGORIES)].map(c => {
    const cat = EVENT_CATEGORIES[c];
    const active = STATE.calendarCategoryFilter === c;
    return `<button class="cat-chip ${active?'active':''}"
      style="${active && cat ? `background:${cat.color}` : ''}"
      onclick="setCalFilter('${c}')">
      ${c === 'all' ? '◎ All' : `${cat.icon} ${cat.label}`}
    </button>`;
  }).join('');

  const nowMins = bkkNow().getHours() * 60 + bkkNow().getMinutes();
  const isToday = bkkNow().toISOString().split('T')[0] === day.date;

  const eventHtml = events.map(ev => {
    const cat = EVENT_CATEGORIES[ev.category] || EVENT_CATEGORIES.event;
    const isNow = isToday && isEventNow(ev, nowMins);
    const hasVisit = ev.visitId && getVisitById(ev.visitId);
    return `
      <div class="cal-event">
        <div class="cal-event-time">
          <div class="ce-start">${ev.startTime}</div>
          <div class="ce-end">${ev.endTime !== ev.startTime ? ev.endTime : ''}</div>
        </div>
        <div class="cal-event-card ${isNow?'now':''}" style="border-left-color:${cat.color}" onclick="showEventDetail('${ev.id}')">
          <div class="ce-title">${cat.icon} ${escapeHtml(ev.title)}</div>
          ${ev.location ? `<div class="ce-loc">📍 ${escapeHtml(ev.location)}</div>` : ''}
          <div class="ce-badges">
            <span class="ce-badge cat" style="background:${cat.color}">${cat.label}</span>
            ${ev.attire ? `<span class="ce-badge attire">👔 ${escapeHtml(ev.attire)}</span>` : ''}
            ${hasVisit ? `<span class="ce-badge visit">💡 Learning Visit</span>` : ''}
            ${isNow ? `<span class="ce-badge" style="background:var(--green-500);color:white">● NOW</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const scopeNotice = day.day === 3 ? `
    <div class="scope-notice">
      <h4>🔍 SCOPE Day — Syndicate-led Field Research</h4>
      <p>Groups disperse to Ayutthaya, Chonburi/Rayong (EEC) and Kanchanaburi. Mandatory check-ins at 1000H, 1400H, 1800H, 2200H.</p>
    </div>` : '';

  el('tab-calendar').innerHTML = `
    <div class="sticky-header">
      <div class="day-tabs-wrap">
        <div class="calendar-toolbar">
          <div class="day-tabs" style="flex:1">${dayTabs}</div>
          ${isAdmin() ? `<button class="calendar-fab" onclick="openEventEditor()" title="Add event">+</button>` : ''}
        </div>
      </div>
      <div class="schedule-day-banner" style="background:linear-gradient(135deg, ${day.color}, ${day.color}cc)">
        <div class="db-label">Day ${day.day} · ${day.label}</div>
        <div class="db-theme">${day.icon} ${day.theme}</div>
        <div class="db-date">${new Date(day.date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}</div>
      </div>
    </div>
    ${scopeNotice}
    <div class="category-filter">${catChips}</div>
    <div class="cal-event-list">${eventHtml || '<div class="empty-state"><div class="icon">📅</div><p>No events match this filter.</p></div>'}</div>
  `;
}

function isEventNow(ev, nowMins) {
  const [sh, sm] = (ev.startTime||'').split(':').map(Number);
  const [eh, em] = (ev.endTime||'').split(':').map(Number);
  if (isNaN(sh)) return false;
  let start = sh * 60 + sm;
  let end = isNaN(eh) ? start + 30 : eh * 60 + em;
  if (end < start) end += 24 * 60; // crosses midnight
  return nowMins >= start && nowMins < end;
}

window.selectCalendarDay = function(d) { STATE.scheduleDay = d; renderCalendar(); };
window.setCalFilter = function(c) { STATE.calendarCategoryFilter = c; renderCalendar(); };

// Swipe between days on Calendar tab
function setupCalendarSwipe() {
  const container = el('tab-calendar');
  if (!container) return;
  let sx = 0, sy = 0, tracking = false;
  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  container.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // not horizontal swipe
    const cur = STATE.scheduleDay;
    if (dx < 0 && cur < DAYS.length) { STATE.scheduleDay = cur + 1; renderCalendar(); }
    else if (dx > 0 && cur > 1)      { STATE.scheduleDay = cur - 1; renderCalendar(); }
  }, { passive: true });
}

// Event detail
window.showEventDetail = function(eventId) {
  const ev = CALENDAR_EVENTS.find(e => e.id === eventId);
  if (!ev) return;
  const cat = EVENT_CATEGORIES[ev.category] || EVENT_CATEGORIES.event;
  const day = DAYS.find(d => d.day === ev.day);
  const visit = ev.visitId ? getVisitById(ev.visitId) : null;

  el('event-detail-title').textContent = ev.title;
  el('event-detail-body').innerHTML = `
    <div class="visit-hero" style="background:linear-gradient(135deg, ${cat.color}, ${cat.color}cc)">
      <div class="visit-hero-icon">${cat.icon}</div>
      <h3>${escapeHtml(ev.title)}</h3>
      <div class="visit-hero-sub">${escapeHtml(ev.location || '')}</div>
      <div class="visit-hero-meta">🗓 ${day ? 'Day '+day.day+' · '+day.date : ''} · ${ev.startTime}${ev.endTime !== ev.startTime ? '–'+ev.endTime : ''}</div>
    </div>
    ${ev.attire ? `<div class="info-block"><h4>👔 Attire</h4><p>${escapeHtml(ev.attire)}</p></div>` : ''}
    ${ev.remarks ? `<div class="info-block"><h4>📝 Remarks</h4><p>${escapeHtml(ev.remarks)}</p></div>` : ''}
    ${ev.oics && Object.keys(ev.oics).length ? `
      <div class="info-block">
        <h4>👥 Functional OICs</h4>
        ${Object.entries(ev.oics).map(([k,v]) => v ? `<p><b>${oicLabel(k)}:</b> ${escapeHtml(v)}</p>` : '').join('')}
      </div>` : ''}
    ${visit ? `
      <div class="info-block hypothesis-block" onclick="hideEventDetail(); openVisitDetail('${visit.id}')" style="cursor:pointer">
        <h4>💡 Linked Learning Visit <span class="inline-edit">View →</span></h4>
        <p><b>${escapeHtml(visit.title)}</b> — ${escapeHtml(visit.subtitle)}</p>
      </div>` : ''}
    ${isAdmin() ? `
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-outline btn-block" onclick="hideEventDetail()">Close</button>
        <button class="btn btn-primary btn-block" onclick="openEventEditor('${ev.id}')">✏️ Edit</button>
      </div>` : ''}
  `;
  el('event-detail-modal').classList.remove('hidden');
};

window.hideEventDetail = function() { el('event-detail-modal').classList.add('hidden'); };

function oicLabel(k) {
  const labels = { tour:'Tour Agency', ops:'Operations', log:'Logistics', sec:'Security', safety:'Safety', learn:'Learning', sa:'SA to HOD' };
  return labels[k] || k;
}

// Event editor (admin)
let _editingEventId = null;
window.openEventEditor = function(eventId) {
  _editingEventId = eventId || null;
  const ev = eventId ? CALENDAR_EVENTS.find(e => e.id === eventId) : null;
  el('event-editor-title').textContent = ev ? 'Edit Event' : 'Add Event';
  el('ev-delete-btn').style.display = ev ? 'inline-flex' : 'none';

  el('ev-day').innerHTML = DAYS.map(d => `<option value="${d.day}" ${ev?.day === d.day ? 'selected' : ''}>Day ${d.day} — ${d.label}</option>`).join('');
  el('ev-category').innerHTML = Object.entries(EVENT_CATEGORIES).map(([k,c]) => `<option value="${k}" ${ev?.category === k ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('');

  el('ev-title').value = ev?.title || '';
  el('ev-start').value = ev?.startTime || '09:00';
  el('ev-end').value = ev?.endTime || '10:00';
  el('ev-location').value = ev?.location || '';
  el('ev-attire').value = ev?.attire || '';
  el('ev-remarks').value = ev?.remarks || '';
  if (!ev) el('ev-day').value = STATE.scheduleDay;

  el('event-detail-modal').classList.add('hidden');
  el('event-editor').classList.remove('hidden');
};
window.hideEventEditor = function() { el('event-editor').classList.add('hidden'); _editingEventId = null; };

window.saveEvent = async function() {
  const payload = {
    day: parseInt(el('ev-day').value),
    startTime: el('ev-start').value,
    endTime: el('ev-end').value,
    title: el('ev-title').value.trim(),
    location: el('ev-location').value.trim(),
    category: el('ev-category').value,
    attire: el('ev-attire').value,
    remarks: el('ev-remarks').value.trim(),
    oics: {},
    actor: STATE.currentUser?.id || ''
  };
  if (!payload.title) return toast('Title is required');

  if (_editingEventId) {
    payload.id = _editingEventId;
    const idx = CALENDAR_EVENTS.findIndex(e => e.id === _editingEventId);
    if (idx >= 0) CALENDAR_EVENTS[idx] = { ...CALENDAR_EVENTS[idx], ...payload };
    await API.post('updateEvent', payload);
    toast('✅ Event updated');
  } else {
    const newId = 'ev_' + Date.now();
    payload.id = newId;
    CALENDAR_EVENTS.push({ ...payload });
    await API.post('addEvent', payload);
    toast('✅ Event added');
  }
  hideEventEditor();
  renderCalendar();
};

window.deleteEventConfirm = async function() {
  if (!_editingEventId) return;
  if (!confirm('Delete this event?')) return;
  CALENDAR_EVENTS = CALENDAR_EVENTS.filter(e => e.id !== _editingEventId);
  await API.post('deleteEvent', { id: _editingEventId, actor: STATE.currentUser?.id || '' });
  hideEventEditor();
  renderCalendar();
  toast('🗑 Event deleted');
};

// ═══════════ LOCATION TAB ════════════════════════════════════
function renderLocation() {
  const user = STATE.currentUser;
  const myStatus = getStatusOf(user?.id || '');
  const visibleGs = visibleGroups();
  // Counts are computed over VISIBLE scope only for non-admins
  const visMembers = canSeeAllSyndicates() ? MEMBERS : MEMBERS.filter(m => visibleGs.includes(memberGroupKey(m)));
  const total = visMembers.length;
  const outC = visMembers.filter(m => getStatusOf(m.id).status === 'out').length;
  const inC = total - outC;

  const synGroups = visibleGs.map(gk => {
    if (STATE.locationFilter !== 'all' && STATE.locationFilter !== gk) return '';
    const members = membersInGroup(gk);
    if (!members.length) return '';
    const synOut = members.filter(m => getStatusOf(m.id).status === 'out').length;
    const synIn = members.length - synOut;
    const allIn = synOut === 0;
    const safeId = gk.replace(/[^a-z0-9]/gi, '_');
    const mySyn = user && memberGroupKey(user) === gk;
    const rows = members.map(m => {
      const st = getStatusOf(m.id);
      const isOut = st.status === 'out';
      const isMe = user && m.id === user.id;
      const canPing = mySyn && !isMe; // only ping within your own syndicate
      return `
        <div class="member-row" ${isMe ? 'style="background:#f0f4ff"' : ''}>
          <div class="status-dot ${isOut ? 'dot-out' : 'dot-in'}"></div>
          <div class="m-info">
            <div class="m-name">${escapeHtml(m.name)}${isMe ? ' <span style="color:var(--blue-600);font-size:11px">(You)</span>' : ''}</div>
            <div class="m-detail">
              ${escapeHtml(m.role || '')}${m.csc && m.csc !== 'Staff' ? ' · ' + escapeHtml(m.csc) : ''}
              ${isOut && st.locationText ? ` · 📍 ${escapeHtml(st.locationText)}` : ''}
            </div>
            ${isOut && st.buddyWith ? `<div class="m-buddy">👥 w/ ${escapeHtml(st.buddyWith)}</div>` : ''}
          </div>
          ${canPing ? `<button class="btn-ping" onclick="event.stopPropagation(); pingMember('${m.id}', '${escapeHtml(m.shortName || m.name).replace(/'/g,"\\'")}'`+`)">👋</button>` : ''}
          <span class="status-pill ${isOut ? 'pill-out' : 'pill-in'}">${isOut ? 'OUT' : 'IN'}</span>
        </div>`;
    }).join('');
    return `
      <div class="syn-group" id="sg-${safeId}">
        <div class="syn-header" style="background:${synColor(gk)}">
          <span class="syn-name" onclick="toggleSynGroup('${safeId}')" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex:1">
            ${formatGroupDisplay(gk)} <span class="syn-arrow" style="font-size:10px;opacity:.8">▼</span>
          </span>
          <button class="syn-sitrep-btn" onclick="sendSyndicateSITREP('${gk.replace(/'/g,"\\'")}')">📤 SITREP</button>
          <span class="syn-count">${synIn}/${members.length} ${allIn ? '✅' : '⚠️'}</span>
        </div>
        <div class="syn-members open" id="syn-members-${safeId}">${rows}</div>
      </div>`;
  }).join('');

  // Filter chips — only show if user sees multiple groups
  const filterChips = visibleGs.length > 1
    ? ['all', ...visibleGs].map(s =>
        `<button class="filter-chip ${STATE.locationFilter === s ? 'active' : ''}" onclick="setLocationFilter('${s.replace(/'/g, "\\'")}')">${s === 'all' ? 'All' : formatGroupDisplay(s)}</button>`
      ).join('')
    : '';

  el('tab-location').innerHTML = `
    ${user ? `
    <div class="my-status-card">
      <div class="status-header"><h3>👤 My Status — ${escapeHtml(user.shortName)}</h3></div>
      <div class="status-body">
        <div class="current-status-display">
          <span class="status-dot ${myStatus.status==='out'?'dot-out':'dot-in'}" style="width:14px;height:14px"></span>
          <div class="status-info">
            <div class="status-label">${myStatus.status==='out'?'🔴 OUT OF HOTEL':'🟢 IN HOTEL'}</div>
            ${myStatus.status==='out' && myStatus.locationText ? `<div class="status-detail">📍 ${escapeHtml(myStatus.locationText)}</div>` : ''}
            ${myStatus.status==='out' && myStatus.buddyWith ? `<div class="status-detail">👥 Buddy: ${escapeHtml(myStatus.buddyWith)}</div>` : ''}
          </div>
        </div>
        <div class="status-buttons">
          ${myStatus.status==='out'
            ? `<button class="btn btn-green" onclick="returnToHotel()">🏨 Return to Hotel</button>`
            : `<button class="btn btn-red" onclick="showBuddyModal()">🚶 Leaving Hotel</button>`
          }
          ${myStatus.lat && myStatus.lng
            ? `<button class="btn btn-stop-track" onclick="stopTracking()" style="padding:12px 8px;font-size:13px;animation:none;box-shadow:0 4px 10px rgba(220,20,60,.3)">🛑 Stop GPS</button>`
            : `<button class="btn btn-primary" onclick="shareGPS()">📡 Share GPS</button>`
          }
        </div>
        ${myStatus.status==='out' ? `
          <button class="btn btn-outline btn-sm btn-block" onclick="updateLocationText()" style="margin-top:8px">📍 Update Location Text</button>` : ''}
        ${myStatus.lat && myStatus.lng ? `
          <div class="tracking-indicator" style="margin-top:10px">
            <div class="live-dot"></div>
            <span>GPS shared · ${myStatus.lat.toFixed(4)}, ${myStatus.lng.toFixed(4)}</span>
          </div>` : ''}
      </div>
    </div>` : `<div class="alert alert-orange">Tap 👤 in header to sign in.</div>`}

    <div class="team-overview">
      <div class="team-stat in"><div class="ts-num green">${inC}</div><div class="ts-label">In Hotel</div></div>
      <div class="team-stat out"><div class="ts-num ${outC>0?'red':'green'}">${outC}</div><div class="ts-label">Out</div></div>
      <div class="team-stat total"><div class="ts-num blue">${total}</div><div class="ts-label">Total</div></div>
    </div>
    <div class="filter-bar">${filterChips}</div>
    <div class="section-title">Team Status</div>
    ${synGroups}
    <div class="alert alert-blue mt-12">🕙 Refreshes every 30s.</div>
  `;
}
window.toggleSynGroup = function(s) {
  const m = el(`syn-members-${s}`), h = qs(`#sg-${s} .syn-header`);
  m?.classList.toggle('open'); h?.classList.toggle('collapsed');
};
window.setLocationFilter = function(f) { STATE.locationFilter = f; renderLocation(); };

// ═══════════ BUDDY / STATUS ACTIONS ══════════════════════════
window.showBuddyModal = function() {
  el('buddy-modal').classList.remove('hidden');
  const list = el('buddy-list');
  list.innerHTML = '';
  const user = STATE.currentUser;
  MEMBERS.filter(m => m.id !== user?.id && getStatusOf(m.id).status !== 'out').forEach(m => {
    const item = document.createElement('div');
    item.className = 'buddy-item';
    item.dataset.id = m.id;
    item.innerHTML = `<span class="bi-dot"></span>${escapeHtml(m.shortName)}`;
    item.addEventListener('click', () => item.classList.toggle('selected'));
    list.appendChild(item);
  });
  if (!list.children.length) list.innerHTML = '<p style="padding:16px;color:var(--text-2);font-size:13px">All other members are out.</p>';
};
window.hideBuddyModal = function() { el('buddy-modal').classList.add('hidden'); };

window.confirmLeaveHotel = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  const buddies = [...document.querySelectorAll('.buddy-item.selected')].map(el => getMemberById(el.dataset.id)?.shortName).filter(Boolean);
  const locText = el('location-text-input')?.value?.trim() || '';
  hideBuddyModal();
  toast('📡 Updating...');
  let lat=null, lng=null;
  try {
    const pos = await new Promise((r,rj) => navigator.geolocation.getCurrentPosition(r,rj,{timeout:5000}));
    lat = pos.coords.latitude; lng = pos.coords.longitude;
  } catch {}
  const payload = {
    memberId: user.id, name: user.name, shortName: user.shortName, role: user.role, syndicate: user.syndicate,
    status: 'out', locationText: locText, lat, lng, buddyWith: buddies.join(', ')
  };
  STATE.memberStatuses[user.id] = { status:'out', locationText:locText, lat, lng, buddyWith:buddies.join(', '), lastUpdated:new Date().toISOString() };
  renderLocation();
  await API.post('updateStatus', payload);
  toast('✅ Updated — travel with buddy!');
};

window.returnToHotel = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  STATE.memberStatuses[user.id] = { status:'in_hotel', locationText:'Hotel', lat:CONFIG.hotel.lat, lng:CONFIG.hotel.lng, buddyWith:'', lastUpdated:new Date().toISOString() };
  renderLocation();
  await API.post('updateStatus', { memberId:user.id, name:user.name, shortName:user.shortName, role:user.role, syndicate:user.syndicate, status:'in_hotel', locationText:'Hotel', lat:CONFIG.hotel.lat, lng:CONFIG.hotel.lng, buddyWith:'' });
  toast('🏨 Welcome back!');
};

window.shareGPS = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  try {
    const pos = await new Promise((r,rj) => navigator.geolocation.getCurrentPosition(r,rj,{timeout:8000}));
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    STATE.memberStatuses[user.id] = { ...getStatusOf(user.id), lat, lng, lastUpdated:new Date().toISOString() };
    await API.post('updateStatus', {
      memberId:user.id, name:user.name, shortName:user.shortName, role:user.role, syndicate:user.syndicate,
      status:getStatusOf(user.id).status, locationText:getStatusOf(user.id).locationText,
      lat, lng, buddyWith:getStatusOf(user.id).buddyWith
    });
    toast('📡 GPS shared!');
    if (STATE.map) updateMapMarkers();
  } catch { toast('❌ GPS unavailable — enter location manually'); }
};

window.updateLocationText = function() {
  const loc = prompt('Current location:');
  if (!loc) return;
  const user = STATE.currentUser;
  STATE.memberStatuses[user.id] = { ...getStatusOf(user.id), locationText:loc, lastUpdated:new Date().toISOString() };
  API.post('updateStatus', { memberId:user.id, name:user.name, shortName:user.shortName, role:user.role, syndicate:user.syndicate, status:'out', locationText:loc, lat:getStatusOf(user.id).lat, lng:getStatusOf(user.id).lng, buddyWith:getStatusOf(user.id).buddyWith });
  renderLocation();
  toast('📍 Updated');
};

// ═══════════ MAP TAB ═════════════════════════════════════════
function initMap() {
  if (STATE.map) { updateMapMarkers(); return; }
  if (typeof L === 'undefined') { setTimeout(initMap, 500); return; }
  STATE.map = L.map('leaflet-map').setView([CONFIG.hotel.lat, CONFIG.hotel.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(STATE.map);
  const hotelIcon = L.divIcon({
    html: `<div style="background:#003580;color:white;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,.3)">🏨</div>`,
    className:'', iconSize:[40,40], iconAnchor:[20,20]
  });
  L.marker([CONFIG.hotel.lat, CONFIG.hotel.lng], { icon:hotelIcon }).addTo(STATE.map).bindPopup(`<b>${CONFIG.hotel.name}</b><br>${CONFIG.hotel.address}`);
  updateMapMarkers();
}
function updateMapMarkers() {
  if (!STATE.map) return;
  Object.values(STATE.mapMarkers).forEach(m => m.remove());
  STATE.mapMarkers = {};
  MEMBERS.forEach(m => {
    const st = getStatusOf(m.id);
    if (!st.lat || !st.lng) return;
    const isOut = st.status === 'out';
    const color = isOut ? '#DC143C' : '#22c55e';
    const icon = L.divIcon({
      html: `<div style="background:${color};color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)">${escapeHtml(m.shortName.slice(0,2))}</div>`,
      className:'', iconSize:[32,32], iconAnchor:[16,16]
    });
    const popup = `<b>${escapeHtml(m.name)}</b><br>${isOut ? `🔴 OUT — ${escapeHtml(st.locationText||'shared GPS')}` : '🟢 In Hotel'}${st.buddyWith ? `<br>👥 ${escapeHtml(st.buddyWith)}` : ''}`;
    STATE.mapMarkers[m.id] = L.marker([st.lat, st.lng], { icon }).addTo(STATE.map).bindPopup(popup);
  });
}

// ═══════════ LEARNINGS TAB (Visit-centric) ═══════════════════
function renderLearnings() {
  const user = STATE.currentUser;

  const visitCards = VISITS.map(v => {
    const dayMeta = DAYS.find(d => d.day === v.dayNum);
    const count = getLearningsForVisit(STATE.learnings, v.id).length;
    const pmesiiHtml = v.pmesii.map(p => {
      const meta = PMESII[p];
      return `<span class="pmesii-tag" style="background:${meta?.color||'#999'}" title="${meta?.full||p}">${p}</span>`;
    }).join('');
    const color = dayMeta?.color || '#666';
    return `
      <div class="visit-card" style="--c:${color}" onclick="openVisitDetail('${v.id}')">
        <div class="visit-icon">${v.icon}</div>
        <div class="visit-info">
          <div class="visit-title">${escapeHtml(v.title)}</div>
          <div class="visit-sub">${escapeHtml(v.subtitle)} · Day ${v.dayNum}</div>
          <div class="visit-tags">${pmesiiHtml}</div>
        </div>
        <div class="visit-count-badge">
          <div class="visit-count-num">${count}</div>
          <div class="visit-count-lbl">Posts</div>
        </div>
        <div class="visit-arrow">›</div>
      </div>
    `;
  }).join('');

  el('tab-learnings').innerHTML = `
    <div class="learn-intro">
      <h3>💡 Learning & PMESII Hypotheses</h3>
      <p>Each visit below has a guiding hypothesis. Tap to see learning outcomes and post your observations, ah-ha moments, or implications for SG/SAF.</p>
    </div>
    <div class="section-title">Visits & Tours</div>
    <div class="visit-grid">${visitCards}</div>

    <div style="margin-top:20px" class="section-title">All Learnings Feed</div>
    ${renderLearningFeed(STATE.learnings, null)}
  `;
}

function renderLearningFeed(learnings, visitIdFilter) {
  const filtered = visitIdFilter
    ? learnings.filter(l => l.visitId === visitIdFilter)
    : learnings;
  if (!filtered.length) {
    return `<div class="empty-state"><div class="icon">📝</div><p>No learnings posted yet.<br>Be the first to contribute!</p></div>`;
  }
  return `<div class="learning-feed">${filtered.map(p => {
    const isAhha = p.isAhha === 'true' || p.isAhha === true;
    const visit = p.visitId ? getVisitById(p.visitId) : null;
    const dayMeta = visit ? DAYS.find(d => d.day === visit.dayNum) : (p.day ? DAYS.find(d => d.day == p.day) : null);
    const time = p.timestamp ? new Date(p.timestamp).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
    const badge = visit ? visit.title : (dayMeta ? `Day ${dayMeta.day}` : 'General');
    return `
      <div class="learning-post">
        <div class="post-header">
          ${isAhha ? '<span class="post-ahha">💡</span>' : ''}
          <span class="post-author">${escapeHtml(p.authorName || 'Anonymous')}</span>
          <span class="post-day-badge" style="background:${dayMeta?.color || '#64748b'}">${escapeHtml(badge)}</span>
          <span class="post-time">${time}</span>
        </div>
        <div class="post-body">${escapeHtml(p.content || '').replace(/\n/g,'<br>')}</div>
      </div>`;
  }).join('')}</div>`;
}

// Visit detail modal
window.openVisitDetail = function(visitId) {
  const v = getVisitById(visitId);
  if (!v) return;
  STATE.currentVisitId = visitId;
  STATE.composeAhha = false;
  const dayMeta = DAYS.find(d => d.day === v.dayNum);
  const color = dayMeta?.color || '#003580';
  const visitLearnings = getLearningsForVisit(STATE.learnings, visitId);

  const pmesiiHtml = v.pmesii.map(p => {
    const meta = PMESII[p];
    return `<span class="pmesii-tag" style="background:${meta?.color||'#999'}">${meta?.full||p}</span>`;
  }).join(' ');

  const outcomes = v.learningOutcomes?.length
    ? `<div class="info-block"><h4>📚 Learning Outcomes</h4><ul class="learning-outcomes-list">${v.learningOutcomes.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul></div>`
    : '';

  el('visit-detail-title').textContent = v.title;
  el('visit-detail-body').innerHTML = `
    <div class="visit-hero" style="background:linear-gradient(135deg, ${color}, ${color}cc)">
      <div class="visit-hero-icon">${v.icon}</div>
      <h3>${escapeHtml(v.title)}</h3>
      <div class="visit-hero-sub">${escapeHtml(v.subtitle)}</div>
      <div class="visit-hero-meta">🗓 Day ${v.dayNum} · ${v.date} · ${v.time}</div>
      <div style="margin-top:8px;position:relative">${pmesiiHtml}</div>
    </div>

    <div class="info-block hypothesis-block">
      <h4>🧭 PMESII Hypothesis</h4>
      <p>${escapeHtml(v.hypothesis || 'No hypothesis set yet.')}</p>
    </div>

    ${outcomes}

    ${STATE.currentUser ? `
    <div class="visit-compose">
      <div class="visit-compose-label">
        <span>✍️ Your Learning / Observation</span>
        <button class="btn-draft" onclick="draftForMe('${visitId}')" style="margin-left:auto">✨ Draft for me</button>
      </div>
      <textarea id="visit-compose-text" placeholder="Type your observation, ah-ha moment, or implication for SG/SAF here…"></textarea>
      <div class="compose-toolbar">
        <div class="ahha-toggle ${STATE.composeAhha ? 'active' : ''}" onclick="toggleAhha()">
          💡 <span>${STATE.composeAhha ? 'Ah-Ha!' : 'Mark as Ah-Ha'}</span>
        </div>
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" onclick="postVisitLearning('${visitId}')">Post</button>
      </div>
    </div>` : `<div class="alert alert-orange">Sign in to post learnings.</div>`}

    <div class="section-title">Learnings for this Visit (${visitLearnings.length})</div>
    ${renderLearningFeed(visitLearnings, visitId)}
  `;

  el('visit-detail-modal').classList.remove('hidden');
};

window.hideVisitDetail = function() {
  el('visit-detail-modal').classList.add('hidden');
  STATE.currentVisitId = null;
};

window.toggleAhha = function() {
  STATE.composeAhha = !STATE.composeAhha;
  const btn = qs('.ahha-toggle');
  btn?.classList.toggle('active', STATE.composeAhha);
  if (btn) btn.querySelector('span').textContent = STATE.composeAhha ? 'Ah-Ha!' : 'Mark as Ah-Ha';
};

window.postVisitLearning = async function(visitId) {
  const ta = el('visit-compose-text');
  const content = ta?.value?.trim();
  if (!content) return toast('Type something first');
  const visit = getVisitById(visitId);
  const user = STATE.currentUser;
  const post = {
    authorId: user.id, authorName: user.name,
    day: visit?.dayNum || '',
    visitId: visitId,
    visitTitle: visit?.title || '',
    content: content,
    isAhha: STATE.composeAhha,
    timestamp: new Date().toISOString()
  };
  STATE.learnings.unshift(post);
  ta.value = '';
  STATE.composeAhha = false;

  // Post to internal Learnings sheet AND to the Daily Learning Hotwash sheet
  await Promise.all([
    API.post('addLearning', post),
    API.post('postHotwash', {
      dayTab: String(25 + (visit?.dayNum || 1)),  // Day 1 → tab "26", Day 2 → "27", etc.
      date: visit?.date || '',
      visitTitle: visit?.title || '',
      authorName: user.name,
      syndicate: formatGroupDisplay(memberGroupKey(user)),
      content: content,
      isAhha: STATE.composeAhha ? 'Ah-Ha' : ''
    })
  ]);
  toast('✅ Posted to app + hotwash sheet');
  openVisitDetail(visitId);
};

// "Draft for me" — fills textarea with a curated, humanized starter
window.draftForMe = function(visitId) {
  const draft = getDraftForVisit(visitId);
  if (!draft) { toast('No draft available for this visit'); return; }
  const ta = el('visit-compose-text');
  if (ta) {
    ta.value = draft;
    ta.focus();
    ta.scrollTop = 0;
  }
  toast('✨ Draft inserted — edit freely');
};

// ═══════════ IR TAB ══════════════════════════════════════════
function renderIR() {
  el('tab-ir').innerHTML = `
    <div class="ir-header-banner">
      <h2>🚨 Incident Report</h2>
      <p>5Ws 1H · Sends via Telegram</p>
    </div>
    <div class="ir-form">
      <h3>Incident Details</h3>
      <div class="form-group">
        <label>Incident Type</label>
        <select id="ir-type" onchange="updateIRPreview()">
          <option value="">— Select type —</option>
          <option>Reporting Sick</option><option>Incident / Injury</option>
          <option>Vehicle Accident</option><option>Vehicle Breakdown</option>
          <option>Security / Natural Disaster</option><option>Uncontactable Personnel</option>
          <option>Lost / Stolen Passport</option><option>Airport Issue</option><option>Other</option>
        </select>
      </div>
      <div class="form-group"><div class="w-label"><div class="w-code">W</div>WHO</div><input id="ir-who" type="text" placeholder="Name, rank, syndicate" oninput="updateIRPreview()"></div>
      <div class="form-group"><div class="w-label"><div class="w-code">W</div>WHAT</div><textarea id="ir-what" placeholder="Brief description" oninput="updateIRPreview()"></textarea></div>
      <div class="form-group"><div class="w-label"><div class="w-code">W</div>WHERE</div><input id="ir-where" type="text" placeholder="Location" oninput="updateIRPreview()"></div>
      <div class="form-group"><div class="w-label"><div class="w-code">W</div>WHEN</div><input id="ir-when" type="text" placeholder="e.g. 28 Apr, 2145H" oninput="updateIRPreview()"></div>
      <div class="form-group"><div class="w-label"><div class="w-code">W</div>WHY</div><input id="ir-why" type="text" placeholder="Cause / reason" oninput="updateIRPreview()"></div>
      <div class="form-group"><div class="w-label"><div class="w-code">H</div>HOW</div><textarea id="ir-how" placeholder="Sequence of events" oninput="updateIRPreview()"></textarea></div>
      <div class="form-group"><label>Status / Condition</label><input id="ir-status" type="text" placeholder="e.g. Stable, at BNH Hospital" oninput="updateIRPreview()"></div>
      <div class="form-group"><label>Accompanying Buddy</label><input id="ir-buddy" type="text" oninput="updateIRPreview()"></div>
      <div class="form-group"><label>Medical Facility</label><input id="ir-medical" type="text" oninput="updateIRPreview()"></div>
      <div class="form-group"><label>Actions Taken</label><textarea id="ir-actions" oninput="updateIRPreview()"></textarea></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="icon">📋</span><h3>Message Preview</h3></div>
      <div class="card-body">
        <div class="ir-preview" id="ir-preview">Fill in fields above…</div>
        <div class="ir-actions">
          <button class="btn btn-red" style="flex:1" onclick="sendIR()">📤 Send via Telegram</button>
          <button class="btn btn-outline btn-sm" onclick="copyIR()">📋 Copy</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="icon">📞</span><h3>Emergency Numbers</h3></div>
      <div class="card-body">
        <div class="contact-grid">
          ${EMERGENCY_CONTACTS.map(c => `<div class="contact-card"><div class="c-flag">${c.flag}</div><div class="c-label">${c.label}</div><div class="c-number"><a href="tel:${c.number}">${c.number}</a></div></div>`).join('')}
        </div>
      </div>
    </div>
  `;
  updateIRPreview();
}
window.updateIRPreview = function() {
  const v = id => el(id)?.value?.trim() || '';
  const now = new Date().toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' });
  const text = `🚨 INCIDENT REPORT (${v('ir-type') || 'General'})
Reported by: ${STATE.currentUser?.name || 'Unknown'}
Time of Report: ${now}

1️⃣ WHO: ${v('ir-who') || '—'}
2️⃣ WHAT: ${v('ir-what') || '—'}
3️⃣ WHERE: ${v('ir-where') || '—'}
4️⃣ WHEN: ${v('ir-when') || now}
5️⃣ WHY: ${v('ir-why') || '—'}
6️⃣ HOW: ${v('ir-how') || '—'}

📋 Status: ${v('ir-status') || '—'}
👥 Buddy: ${v('ir-buddy') || '—'}
🏥 Medical: ${v('ir-medical') || '—'}

✅ Actions Taken:
${v('ir-actions') || '—'}

— via TSV PWA`;
  const p = el('ir-preview');
  if (p) p.textContent = text;
  window._irText = text;
};
window.sendIR = async function() {
  if (!window._irText) return toast('Fill in details first');
  const ok = await TELEGRAM.send(window._irText, CONFIG.telegram.irChatId);
  if (ok) {
    toast('✅ IR sent!');
    await API.post('addIncident', {
      reportedBy: STATE.currentUser?.id || 'unknown',
      type: el('ir-type')?.value || '', who: el('ir-who')?.value || '',
      what: el('ir-what')?.value || '', where: el('ir-where')?.value || '',
      when: el('ir-when')?.value || '', why: el('ir-why')?.value || '',
      how: el('ir-how')?.value || '', status: el('ir-status')?.value || '',
      buddy: el('ir-buddy')?.value || '', medicalFacility: el('ir-medical')?.value || '',
      actionsText: el('ir-actions')?.value || ''
    });
  }
};
window.copyIR = function() {
  if (!window._irText) return;
  navigator.clipboard.writeText(window._irText).then(() => toast('📋 Copied'));
};

// ═══════════ SOP TAB ═════════════════════════════════════════
function renderSOP() {
  el('tab-sop').innerHTML = `
    <div class="alert alert-red" style="margin-bottom:12px">
      🚨 <b>Any incident?</b> Use <b>IR tab</b> first, then call Syn IC and SL.
    </div>
    <div class="section-title">Emergency Contacts</div>
    <div class="contact-grid" style="margin-bottom:12px">
      ${EMERGENCY_CONTACTS.map(c => `<div class="contact-card"><div class="c-flag">${c.flag}</div><div class="c-label">${c.label}</div><div class="c-number"><a href="tel:${c.number}">${c.number}</a></div></div>`).join('')}
    </div>
    <div class="section-title">Standard Operating Procedures</div>
    <div class="sop-grid">
      ${SOPS.map(s => `
        <div class="sop-card">
          <div class="sop-card-header" style="border-color:${s.color}" onclick="toggleSOP('${s.id}')">
            <span class="sop-icon">${s.icon}</span>
            <span class="sop-title">${s.title}</span>
            <span class="sop-arrow" id="sop-arrow-${s.id}">▼</span>
          </div>
          <div class="sop-card-body" id="sop-body-${s.id}">${s.content}</div>
        </div>`).join('')}
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-header"><span class="icon">📝</span><h3>Reflection Template</h3></div>
      <div class="card-body">
        <pre style="font-size:12px;line-height:1.7;white-space:pre-wrap;color:var(--text)">${REFLECTION_TEMPLATE}</pre>
        <button class="btn btn-outline btn-sm mt-8" onclick="copyReflectionTemplate()">📋 Copy</button>
      </div>
    </div>
  `;
}
window.toggleSOP = function(id) {
  const b = el(`sop-body-${id}`), a = el(`sop-arrow-${id}`), h = b?.previousElementSibling;
  if (!b) return;
  b.classList.toggle('open');
  if (a) a.textContent = b.classList.contains('open') ? '▲' : '▼';
  if (h) h.classList.toggle('open');
};
window.copyReflectionTemplate = function() { navigator.clipboard.writeText(REFLECTION_TEMPLATE).then(() => toast('📋 Copied')); };

// ═══════════ TELEGRAM REPORTS ════════════════════════════════
window.sendReport = async function(type) {
  const msg = type === 'evening' ? TELEGRAM.buildEveningReport() : TELEGRAM.buildMidnightReport();
  if (!confirm(`Send ${type === 'evening' ? '2300H SITREP' : '0200H All-In'}?\n\n${msg.replace(/<[^>]+>/g,'').slice(0,200)}…`)) return;
  const ok = await TELEGRAM.send(msg);
  if (ok) {
    STATE.reportSent[type] = true;
    toast(`✅ ${type} report sent!`);
    renderHome();
  }
};

function setupReportReminders() {
  setInterval(() => {
    const bkk = bkkNow(), h = bkk.getHours(), m = bkk.getMinutes();
    if (h === CONFIG.reports.eveningHour && m === 0 && !STATE.reportSent.evening)
      showNotification('TSV — 2300H SITREP', 'Time to send parade state.');
    if (h === CONFIG.reports.midnightHour && m === 0 && !STATE.reportSent.midnight)
      showNotification('TSV — 0200H All-In', 'Check all members are back.');
  }, 60000);
}
function showNotification(t, b) {
  if (Notification.permission === 'granted') new Notification(t, { body: b, icon: './icons/icon.svg' });
}
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

// ═══════════ MANAGE MEMBERS (Admin) ══════════════════════════
let _editingMemberId = null;

window.showMembersModal = function() {
  if (!isAdmin()) return toast('Admin access required');
  el('members-modal').classList.remove('hidden');
  renderMembersList();
};
window.hideMembersModal = function() { el('members-modal').classList.add('hidden'); };

if (!STATE.expandedSyns) STATE.expandedSyns = new Set();

window.toggleMgrGroup = function(safeId) {
  const body = el(`mgr-body-${safeId}`);
  const caret = el(`mgr-caret-${safeId}`);
  const gk = body?.dataset?.groupkey;
  if (!body) return;
  body.classList.toggle('open');
  if (caret) caret.textContent = body.classList.contains('open') ? '▲' : '▼';
  if (gk) {
    if (body.classList.contains('open')) STATE.expandedSyns.add(gk);
    else STATE.expandedSyns.delete(gk);
  }
};

window.renderMembersList = function() {
  const q = (el('members-search')?.value || '').toLowerCase();
  const filtered = MEMBERS.filter(m =>
    !q || m.name.toLowerCase().includes(q) || (m.role||'').toLowerCase().includes(q) ||
    (m.csc||'').toLowerCase().includes(q) || String(m.syndicate||'').toLowerCase().includes(q));
  el('members-list-container').innerHTML = groupOrder().map(gk => {
    const grp = filtered.filter(m => memberGroupKey(m) === gk);
    if (!grp.length) return '';
    const safeId = gk.replace(/[^a-z0-9]/gi, '_');
    // Open by default if search filter matches, else respect user's toggle state
    const isOpen = q.length > 0 || STATE.expandedSyns.has(gk);
    return `
      <div class="mgr-group" style="background:${synColor(gk)};cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:space-between" onclick="toggleMgrGroup('${safeId}')">
        <span>${formatGroupDisplay(gk)} · ${grp.length}</span>
        <span id="mgr-caret-${safeId}" style="font-size:10px;opacity:.8">${isOpen?'▲':'▼'}</span>
      </div>
      <div class="mgr-body ${isOpen?'open':''}" id="mgr-body-${safeId}" data-groupkey="${escapeHtml(gk)}">
        ${grp.map(m => `
          <div class="mgr-row">
            <div class="mgr-info">
              <div class="mgr-name">${escapeHtml(m.name)}</div>
              <div class="mgr-meta">${escapeHtml(m.role || '')}${m.rank ? ' · '+escapeHtml(m.rank) : ''} · ${escapeHtml(m.shortName || '—')}</div>
            </div>
            <button class="mgr-edit-btn" onclick="openMemberEditor('${m.id}')">Edit</button>
          </div>`).join('')}
      </div>`;
  }).join('') || '<div class="empty-state"><p>No members</p></div>';
};

window.openMemberEditor = function(memberId) {
  _editingMemberId = memberId || null;
  const m = memberId ? getMemberById(memberId) : null;
  el('editor-title').textContent = m ? 'Edit Member' : 'Add Member';
  el('ed-delete-btn').style.display = m ? 'inline-flex' : 'none';
  el('ed-rank').innerHTML = DEFAULT_RANK_OPTIONS.map(r => `<option value="${r}" ${m?.rank===r?'selected':''}>${r || '(none)'}</option>`).join('');
  el('ed-role').innerHTML = DEFAULT_ROLE_OPTIONS.map(r => `<option value="${r}" ${m?.role===r?'selected':''}>${r}</option>`).join('');
  const cscs = getCSCsInUse();
  el('ed-csc').innerHTML = cscs.map(c => `<option value="${c}" ${m?.csc===c?'selected':''}>${c}</option>`).join('') + '<option value="__custom__">➕ Add new CSC…</option>';
  populateSyndicateDropdown(m?.csc || cscs[0], m?.syndicate);
  el('ed-name').value = m?.name || '';
  el('ed-shortName').value = m?.shortName || '';
  ['ed-custom-csc', 'ed-custom-syn'].forEach(id => el(id).value = '');
  el('ed-custom-csc-wrap').classList.add('hidden');
  el('ed-custom-syn-wrap').classList.add('hidden');
  el('member-editor').classList.remove('hidden');
};
window.hideMemberEditor = function() { el('member-editor').classList.add('hidden'); _editingMemberId = null; };

function populateSyndicateDropdown(csc, sel) {
  const syns = getSyndicatesForCSC(csc);
  if (!syns.length) syns.push('1');
  el('ed-syn').innerHTML = syns.map(s => `<option value="${s}" ${String(sel)===String(s)?'selected':''}>${s}</option>`).join('') + '<option value="__custom__">➕ Add new Syndicate…</option>';
}
window.onCSCChange = function() {
  const v = el('ed-csc').value;
  if (v === '__custom__') { el('ed-custom-csc-wrap').classList.remove('hidden'); populateSyndicateDropdown('', null); }
  else { el('ed-custom-csc-wrap').classList.add('hidden'); populateSyndicateDropdown(v, null); }
};
document.addEventListener('change', e => {
  if (e.target?.id === 'ed-syn') el('ed-custom-syn-wrap').classList.toggle('hidden', e.target.value !== '__custom__');
});

window.saveMember = async function() {
  const name = el('ed-name').value.trim();
  const shortName = el('ed-shortName').value.trim() || name;
  const rank = el('ed-rank').value, role = el('ed-role').value;
  let csc = el('ed-csc').value, syn = el('ed-syn').value;
  if (csc === '__custom__') csc = el('ed-custom-csc').value.trim();
  if (syn === '__custom__') syn = el('ed-custom-syn').value.trim();
  if (!name || !csc || !syn) return toast('Fill required fields');
  const payload = { name, shortName, rank, role, csc, syndicate: syn, actor: STATE.currentUser?.id || '' };
  if (_editingMemberId) {
    payload.id = _editingMemberId;
    const i = MEMBERS.findIndex(m => m.id === _editingMemberId);
    if (i >= 0) MEMBERS[i] = { ...MEMBERS[i], ...payload };
    await API.post('updateMember', payload);
    toast('✅ Updated');
  } else {
    const id = 'm_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    payload.id = id;
    MEMBERS.push({ ...payload });
    await API.post('addMember', payload);
    toast('✅ Added');
  }
  hideMemberEditor();
  await syncMembers();
  renderMembersList();
  if (STATE.currentTab === 'location') renderLocation();
};

window.deleteMemberConfirm = async function() {
  if (!_editingMemberId) return;
  const m = getMemberById(_editingMemberId);
  if (!confirm(`Remove ${m?.name}?`)) return;
  MEMBERS = MEMBERS.filter(x => x.id !== _editingMemberId);
  await API.post('deleteMember', { id: _editingMemberId, actor: STATE.currentUser?.id || '' });
  hideMemberEditor();
  await syncMembers();
  renderMembersList();
  if (STATE.currentTab === 'location') renderLocation();
  toast('🗑 Removed');
};

// ═══════════ APP STARTUP ═════════════════════════════════════
function startApp() {
  applySavedSize();
  applyTheme();
  el('loading').style.display = 'none';
  el('app').classList.add('visible');
  el('btn-switch-user').onclick = showSettingsModal;
  const admin = el('btn-admin');
  admin.onclick = showMembersModal;
  if (isAdmin()) admin.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  STATE.scheduleDay = (getCurrentDay() || DAYS[0]).day;
  switchTab('home');
  startPolling();
  seedIfEmpty();
  setupReportReminders();
  setupSyn1AutoReports();
  setupModalSwipes();
  setupCalendarSwipe();
  requestNotificationPermission();

  // Ping check every 20s
  checkMyPings();
  setInterval(checkMyPings, 20000);

  // Admin requests sync for super-admin
  if (STATE.currentUser?.id === CONFIG.superAdminId) {
    syncAdminRequests();
    setInterval(syncAdminRequests, 30000);
  }
}

// ═══════════ INIT ════════════════════════════════════════════
window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    let refreshingSW = false;
    // When new SW takes control, silently reload ONCE (no prompt)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshingSW) return;
      refreshingSW = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Tell new SW to activate — triggers controllerchange → auto-reload
            newSW.postMessage('SKIP_WAITING');
          }
        });
      });
      // Check for updates every 60s
      setInterval(() => reg.update().catch(() => {}), 60000);
    }).catch(() => {});
  }
  setupPinKeypad();
  el('loading').style.display = 'none';
  if (loadIdentity()) {
    startApp();
  } else {
    showLoginFlow();
  }
});

// ═══════════ ROOMS TAB ═══════════════════════════════════════
function renderRooms() {
  const user = STATE.currentUser;
  const myStatus = getStatusOf(user?.id || '');
  const myRoom = myStatus.roomNumber || '';
  const filter = STATE.locationFilter;
  const groups = visibleGroups();

  const groupSections = groups.map(gk => {
    if (filter !== 'all' && filter !== gk) return '';
    const members = membersInGroup(gk);
    if (!members.length) return '';
    const rows = members.map(m => {
      const st = getStatusOf(m.id);
      const rm = st.roomNumber || '';
      const isMe = user && m.id === user.id;
      return `
        <div class="room-row" ${isMe ? 'style="background:#f0f4ff"' : ''}>
          <div class="room-number ${rm ? '' : 'empty'}">${rm || '—'}</div>
          <div style="flex:1">
            <div class="room-member-name">${escapeHtml(m.name)}${isMe ? ' <span style="color:var(--blue-600);font-size:11px">(You)</span>' : ''}</div>
            <div class="room-member-role">${escapeHtml(m.role || '')}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="rooms-group">
        <div class="rooms-group-header" style="background:${synColor(gk)}">
          ${formatGroupDisplay(gk)} <span class="count">${members.length} ${members.length === 1 ? 'member' : 'members'}</span>
        </div>
        ${rows}
      </div>`;
  }).join('');

  const filterChips = groups.length > 1
    ? ['all', ...groups].map(s =>
        `<button class="filter-chip ${filter === s ? 'active' : ''}" onclick="setLocationFilter('${s.replace(/'/g, "\\'")}')">${s === 'all' ? 'All' : formatGroupDisplay(s)}</button>`
      ).join('')
    : '';

  el('tab-rooms').innerHTML = `
    <div class="rooms-hero">
      <h3>🛏️ Hotel Room Tracker</h3>
      <p>Pullman Bangkok Hotel G · Update your room so your syndicate knows where to find you.</p>
    </div>

    ${user ? `
    <div class="my-room-card">
      <div>
        <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-2);margin-bottom:4px">My Room</div>
        ${myRoom
          ? `<div class="my-room-display">${escapeHtml(myRoom)}</div>`
          : `<div class="my-room-display empty">Not set yet</div>`}
      </div>
      <input id="my-room-input" class="my-room-input" type="text" inputmode="text"
        placeholder="e.g. 1204" value="${escapeHtml(myRoom)}" maxlength="8">
      <button class="btn btn-primary btn-sm" onclick="saveMyRoom()">Save</button>
    </div>` : `<div class="alert alert-orange">Sign in to set your room.</div>`}

    <div class="filter-bar">${filterChips}</div>
    ${groupSections || '<div class="empty-state"><p>No rooms match.</p></div>'}
  `;
}

window.saveMyRoom = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  const val = el('my-room-input')?.value?.trim();
  const cur = getStatusOf(user.id);
  STATE.memberStatuses[user.id] = { ...cur, roomNumber: val, lastUpdated: new Date().toISOString() };

  await API.post('updateStatus', {
    memberId: user.id, name: user.name, shortName: user.shortName,
    role: user.role, syndicate: user.syndicate,
    status: cur.status || 'in_hotel',
    locationText: cur.locationText || '',
    lat: cur.lat || '', lng: cur.lng || '',
    buddyWith: cur.buddyWith || '',
    roomNumber: val
  });
  renderRooms();
  toast(val ? `🛏 Room ${val} saved` : '🛏 Room cleared');
};

// ═══════════ PER-SYNDICATE SITREP ════════════════════════════
function buildSyndicateSITREP(groupKey, options = {}) {
  const forceAllIn = options.forceAllIn;
  const timeLabel = options.timeLabel || formatBKKTime();
  const members = membersInGroup(groupKey);
  const total = members.length;
  const st = STATE.memberStatuses;
  const out = forceAllIn ? [] : members.filter(m => st[m.id]?.status === 'out');
  const inC = total - out.length;

  let msg = `${groupKey}: ${inC}/${total} in Hotel, ${out.length}/${total} Out\n`;
  if (out.length > 0) {
    msg += `Location\n`;
    out.forEach(m => {
      const loc = (st[m.id]?.locationText || '').trim() || 'Unknown';
      msg += `${m.shortName || m.name} - ${loc}\n`;
    });
  }
  msg += `End of status update`;
  return msg;
}

window.sendSyndicateSITREP = async function(groupKey, auto) {
  const msg = buildSyndicateSITREP(groupKey);
  if (!auto) {
    if (!confirm(`Send this SITREP?\n\n${msg}`)) return;
  }
  const chatId = groupKey === PRIORITY_GROUP ? CONFIG.telegram.syn1ChatId : CONFIG.telegram.chatId;
  const ok = await TELEGRAM.send(msg.replace(/\n/g, '\n'), chatId);
  if (ok && !auto) toast(`✅ ${groupKey} SITREP sent`);
  return ok;
};

// ═══════════ AUTO SYN1 REPORTS (2300H / 0200H) ══════════════
function setupSyn1AutoReports() {
  setInterval(async () => {
    const bkk = bkkNow();
    const h = bkk.getHours(), m = bkk.getMinutes();
    const today = bkk.toISOString().split('T')[0];
    const lastSent = JSON.parse(localStorage.getItem('tsv_last_sent') || '{}');

    // 2300H — actual SITREP (Syn 1 only)
    if (h === 23 && m === 0 && lastSent[today + '_2300'] !== true) {
      const msg = buildSyndicateSITREP(PRIORITY_GROUP, { timeLabel: '2300H' });
      const header = `📍 2300H SITREP · ${bkk.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'})}\n`;
      const ok = await TELEGRAM.send(header + msg, CONFIG.telegram.syn1ChatId);
      if (ok) {
        lastSent[today + '_2300'] = true;
        localStorage.setItem('tsv_last_sent', JSON.stringify(lastSent));
      }
    }

    // 0200H — End-of-Day SITREP (Syn 1 only) — labelled as YESTERDAY's date
    if (h === 2 && m === 0 && lastSent[today + '_0200'] !== true) {
      const syn1 = getSyn1Members();
      const yesterday = new Date(bkk.getTime() - 86400000);
      const yLabel = yesterday.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Bangkok'});
      const msg = `${formatGroupDisplay(PRIORITY_GROUP)}: ${syn1.length}/${syn1.length} in Hotel, 0/${syn1.length} Out\nEnd of status update`;
      const header = `✅ EOD Report · ${yLabel} (0200H cutoff)\n`;
      const ok = await TELEGRAM.send(header + msg, CONFIG.telegram.syn1ChatId);
      if (ok) {
        lastSent[today + '_0200'] = true;
        localStorage.setItem('tsv_last_sent', JSON.stringify(lastSent));
      }
    }
  }, 60000);
}

// ═══════════ SETTINGS MODAL ══════════════════════════════════
window.showSettingsModal = function() {
  el('settings-modal').classList.remove('hidden');
  renderSettings();
};
window.hideSettingsModal = function() {
  el('settings-modal').classList.add('hidden');
};

function renderSettings() {
  const user = STATE.currentUser;
  if (!user) {
    el('settings-body').innerHTML = '<div class="alert alert-orange">Sign in first.</div>';
    return;
  }
  const gk = memberGroupKey(user);
  const sizePref = localStorage.getItem('tsv_size') || 'md';
  const themePref = localStorage.getItem('tsv_theme') || 'auto';
  const isSuperAdmin = user.id === CONFIG.superAdminId;
  const adminReqs = STATE.adminRequests || [];
  const pendingReqs = adminReqs.filter(r => r.status === 'pending');

  el('settings-body').innerHTML = `
    <!-- Account -->
    <div class="settings-section">
      <div class="settings-section-header">👤 Account</div>
      <div class="settings-row">
        <div class="sr-label">Name
          <div class="sr-value">${escapeHtml(user.name)}</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="editMyProfile()">Edit</button>
      </div>
      <div class="settings-row">
        <div class="sr-label">Syndicate
          <div class="sr-value">${escapeHtml(formatGroupDisplay(gk))}</div>
        </div>
      </div>
      <div class="settings-row">
        <div class="sr-label">Role
          <div class="sr-value">${escapeHtml(user.role || 'Member')} ${isAdmin() ? '· 👑 Admin' : ''}</div>
        </div>
      </div>
      <div class="settings-row">
        <div class="sr-label">Personal PIN
          <div class="sr-value">•••• (tap to change)</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="changeMyPin()">Change</button>
      </div>
    </div>

    <!-- Display -->
    <div class="settings-section">
      <div class="settings-section-header">🎨 Display</div>
      <div class="settings-row">
        <div class="sr-label">Text Size</div>
      </div>
      <div style="padding:0 16px 14px">
        <div class="size-chooser">
          <button class="${sizePref==='sm'?'active':''}" onclick="setSize('sm')">A-</button>
          <button class="${sizePref==='md'?'active':''}" onclick="setSize('md')">A</button>
          <button class="${sizePref==='lg'?'active':''}" onclick="setSize('lg')">A+</button>
        </div>
      </div>
      <div class="settings-row">
        <div class="sr-label">Theme</div>
      </div>
      <div style="padding:0 16px 14px">
        <div class="theme-chooser">
          <button class="${themePref==='auto'?'active':''}" onclick="setTheme('auto')">🌓<br>Auto</button>
          <button class="${themePref==='light'?'active':''}" onclick="setTheme('light')">☀️<br>Light</button>
          <button class="${themePref==='dark'?'active':''}" onclick="setTheme('dark')">🌙<br>Dark</button>
        </div>
      </div>
    </div>

    <!-- Access -->
    <div class="settings-section">
      <div class="settings-section-header">🔐 Access</div>
      ${isAdmin() ? `
        <div class="settings-row">
          <div class="sr-label">You have Admin rights
            <div class="sr-value">You can see all syndicates, send reports, manage members</div>
          </div>
          <span style="font-size:22px">👑</span>
        </div>
      ` : `
        <div class="settings-row">
          <div class="sr-label">Request Admin Rights
            <div class="sr-value">Lets you see all syndicates in Tracker / Rooms</div>
          </div>
          <button class="btn btn-gold btn-sm" onclick="requestAdminRights()">Request</button>
        </div>
      `}
      ${isSuperAdmin && pendingReqs.length ? `
        <div style="padding:12px 16px;border-top:1px solid var(--border-2)">
          <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2);margin-bottom:8px">Pending Admin Requests (${pendingReqs.length})</div>
          ${pendingReqs.map(r => `
            <div class="admin-request-card">
              <div class="arc-info">
                <b>${escapeHtml(r.fromName)}</b> — ${escapeHtml(r.fromGroup || '')}
                <div style="font-size:11px;margin-top:2px;opacity:.8">${new Date(r.timestamp).toLocaleString('en-GB')}</div>
                ${r.message ? `<div style="font-size:12px;margin-top:4px;font-style:italic">"${escapeHtml(r.message)}"</div>` : ''}
              </div>
              <div class="arc-actions">
                <button class="btn btn-green btn-sm" onclick="approveAdminReq('${r.id}')">✓ Approve</button>
                <button class="btn btn-outline btn-sm" onclick="declineAdminReq('${r.id}')">✕ Decline</button>
              </div>
            </div>`).join('')}
        </div>` : ''}
    </div>

    <!-- Session -->
    <div class="settings-section">
      <div class="settings-section-header">🚪 Session</div>
      <div class="settings-row">
        <div class="sr-label">Sign out
          <div class="sr-value">Back to login screen</div>
        </div>
        <button class="btn btn-red btn-sm" onclick="if(confirm('Sign out?'))logout()">Sign Out</button>
      </div>
    </div>

    <div class="app-footer" style="padding:16px 14px">
      v1.0 · Designed by <b>Shaft · Syn 1</b>
    </div>
  `;
}

window.setSize = function(s) {
  document.documentElement.classList.remove('size-sm','size-md','size-lg');
  document.documentElement.classList.add('size-' + s);
  localStorage.setItem('tsv_size', s);
  renderSettings();
};
window.setTheme = function(t) {
  localStorage.setItem('tsv_theme', t);
  applyTheme();
  renderSettings();
};
function applyTheme() {
  const t = localStorage.getItem('tsv_theme') || 'auto';
  document.documentElement.dataset.theme = t;
  if (t === 'dark') document.documentElement.style.colorScheme = 'dark';
  else if (t === 'light') document.documentElement.style.colorScheme = 'light';
  else document.documentElement.style.colorScheme = 'light dark';
}
function applySavedSize() {
  const s = localStorage.getItem('tsv_size') || 'md';
  document.documentElement.classList.add('size-' + s);
}

window.editMyProfile = function() {
  openMemberEditor(STATE.currentUser.id);
};

window.changeMyPin = async function() {
  const newPin = prompt('Enter new 4-digit PIN:');
  if (!newPin || !/^\d{4}$/.test(newPin)) { toast('PIN must be exactly 4 digits'); return; }
  const user = STATE.currentUser;
  user.pin = newPin;
  saveIdentity(user);
  await API.post('updateMember', { id: user.id, pin: newPin, actor: user.id });
  toast('✅ PIN changed to ' + newPin);
};

window.requestAdminRights = async function() {
  const msg = prompt('Why do you need admin rights? (optional)');
  if (msg === null) return; // cancelled
  const user = STATE.currentUser;
  const payload = {
    fromId: user.id,
    fromName: user.name,
    fromGroup: formatGroupDisplay(memberGroupKey(user)),
    message: msg || '',
    timestamp: new Date().toISOString(),
    status: 'pending'
  };
  await API.post('addAdminRequest', payload);
  toast('✅ Request sent to super-admin');
};

window.approveAdminReq = async function(reqId) {
  const req = (STATE.adminRequests || []).find(r => r.id === reqId);
  if (!req) return;
  if (!confirm(`Approve admin rights for ${req.fromName}?`)) return;
  await API.post('resolveAdminRequest', { id: reqId, status: 'approved', actor: STATE.currentUser.id });
  // Flag member as admin
  await API.post('updateMember', { id: req.fromId, isAdmin: 'true', actor: STATE.currentUser.id });
  // Send a "ping" to inform them
  await API.post('sendPing', { toId: req.fromId, fromId: STATE.currentUser.id, fromName: 'Super Admin', message: '✅ Your admin rights request has been APPROVED.' });
  toast('✅ Approved + member notified');
  await syncAdminRequests();
  renderSettings();
};

window.declineAdminReq = async function(reqId) {
  const req = (STATE.adminRequests || []).find(r => r.id === reqId);
  if (!req) return;
  const reason = prompt('Reason for decline (optional):');
  if (reason === null) return;
  await API.post('resolveAdminRequest', { id: reqId, status: 'declined', actor: STATE.currentUser.id, reason: reason || '' });
  await API.post('sendPing', { toId: req.fromId, fromId: STATE.currentUser.id, fromName: 'Super Admin', message: `❌ Your admin rights request was declined.${reason ? ' Reason: ' + reason : ''}` });
  toast('Declined + member notified');
  await syncAdminRequests();
  renderSettings();
};

async function syncAdminRequests() {
  const data = await API.get('getAdminRequests');
  if (Array.isArray(data)) STATE.adminRequests = data;
}

// ═══════════ PING (within syndicate) ═══════════════════════════
window.pingMember = async function(memberId, shortName) {
  const preset = prompt(`Ping ${shortName} — short message:`, '👋 Where are you?');
  if (!preset) return;
  await API.post('sendPing', {
    toId: memberId,
    fromId: STATE.currentUser.id,
    fromName: STATE.currentUser.shortName || STATE.currentUser.name,
    message: preset
  });
  toast(`👋 Ping sent to ${shortName}`);
};

async function checkMyPings() {
  const user = STATE.currentUser;
  if (!user) return;
  const data = await API.get(`getPings&userId=${encodeURIComponent(user.id)}`);
  if (!Array.isArray(data) || !data.length) return;
  const unread = data.filter(p => p.read !== 'true' && p.read !== true);
  unread.forEach(p => showPingBanner(p));
}
function showPingBanner(ping) {
  const existing = document.querySelectorAll('.ping-banner');
  existing.forEach(e => e.remove());

  const el2 = document.createElement('div');
  el2.className = 'ping-banner';
  el2.innerHTML = `👋 <div><b>${escapeHtml(ping.fromName || 'Someone')}:</b> ${escapeHtml(ping.message || '')}</div>`;
  document.body.appendChild(el2);
  setTimeout(() => el2.remove(), 6000);
  // Mark as read
  API.post('markPingRead', { id: ping.id });
}

// ═══════════ STOP TRACKING ═══════════════════════════════════
window.stopTracking = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  if (!confirm('Stop sharing your GPS location?\nYou will be removed from the live map.')) return;
  const cur = getStatusOf(user.id);
  STATE.memberStatuses[user.id] = { ...cur, lat: null, lng: null, lastUpdated: new Date().toISOString() };
  await API.post('updateStatus', {
    memberId: user.id, name: user.name, shortName: user.shortName,
    role: user.role, syndicate: user.syndicate,
    status: cur.status || 'in_hotel',
    locationText: cur.locationText || '',
    lat: '', lng: '',
    buddyWith: cur.buddyWith || '',
    roomNumber: cur.roomNumber || ''
  });
  toast('🛑 GPS tracking stopped');
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.map) updateMapMarkers();
};
