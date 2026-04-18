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
  composeAhha: false,
  learnSubTab: 'visits',
  reflections: []
};

// ═══════════ API LAYER ═══════════════════════════════════════
const API = {
  get configured() {
    return CONFIG.apiUrl && !CONFIG.apiUrl.startsWith('YOUR_');
  },
  async get(action) {
    if (!this.configured) { STATE.apiState = 'unconfigured'; return null; }
    try {
      const res = await fetch(`${CONFIG.apiUrl}?action=${action}`, { method: 'GET' });
      const json = await res.json();
      STATE.apiState = 'online';      // successful call → clear any past failure
      STATE.offlineMode = false;
      return json.ok ? json.data : null;
    } catch (e) {
      STATE.apiState = navigator.onLine ? 'error' : 'offline';
      STATE.offlineMode = true;
      return null;
    }
  },
  async post(action, data) {
    if (!this.configured) { STATE.apiState = 'unconfigured'; return null; }
    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        body: JSON.stringify({ action, ...data }),
        headers: { 'Content-Type': 'text/plain' }
      });
      const json = await res.json();
      STATE.apiState = 'online';
      STATE.offlineMode = false;
      return json.ok ? json.data : null;
    } catch (e) {
      STATE.apiState = navigator.onLine ? 'error' : 'offline';
      STATE.offlineMode = true;
      return null;
    }
  }
};

// Auto-refresh the home banner when connectivity changes
window.addEventListener('online',  () => { if (STATE.currentTab === 'home') renderHome(); syncStatuses(); });
window.addEventListener('offline', () => { STATE.apiState = 'offline'; if (STATE.currentTab === 'home') renderHome(); });

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

// ─── WEATHER ─────────────────────────────────────────────────
function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code >= 1 && code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if (code >= 61 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code >= 95 && code <= 99) return '⛈️';
  return '🌤️';
}
function weatherLabel(code) {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return '—';
}

async function fetchWeather() {
  const cached = (() => { try { return JSON.parse(localStorage.getItem('tsv_weather') || 'null'); } catch { return null; } })();
  if (cached && (Date.now() - cached.ts) < 30*60*1000) return cached.data;

  const lat = CONFIG.hotel.lat || 13.7256;
  const lng = CONFIG.hotel.lng || 100.5279;
  try {
    const [w, aq] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia/Bangkok&forecast_days=1`).then(r => r.json()).catch(()=>null),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5&timezone=Asia/Bangkok`).then(r => r.json()).catch(()=>null)
    ]);
    if (!w || !w.current) return null;
    const data = {
      temp: Math.round(w.current.temperature_2m),
      high: Math.round(w.daily?.temperature_2m_max?.[0] ?? w.current.temperature_2m),
      low:  Math.round(w.daily?.temperature_2m_min?.[0] ?? w.current.temperature_2m),
      code: w.current.weather_code,
      psi:  aq?.current?.us_aqi != null ? Math.round(aq.current.us_aqi) : null
    };
    localStorage.setItem('tsv_weather', JSON.stringify({ ts: Date.now(), data }));
    return data;
  } catch (e) { return null; }
}

async function refreshWeather() {
  const data = await fetchWeather();
  if (!data) return;
  STATE.weather = data;
  const el2 = el('home-weather');
  if (el2) el2.outerHTML = renderWeatherStrip();
}

function renderWeatherStrip() {
  const d = STATE.weather;
  if (!d) return `<div id="home-weather" class="weather-strip loading"><span class="w-icon">🌤️</span><span class="w-temp">—°</span><span class="w-range">Loading weather…</span></div>`;
  const psi = d.psi != null ? `<span class="w-psi"><b>PSI</b> ${d.psi}</span>` : '';
  return `<div id="home-weather" class="weather-strip">
    <span class="w-icon">${weatherIcon(d.code)}</span>
    <span class="w-temp">${d.temp}°</span>
    <span class="w-range"><span class="w-hl">H</span> ${d.high}° · <span class="w-hl">L</span> ${d.low}°</span>
    ${psi}
    <span class="w-cond">${weatherLabel(d.code)}</span>
  </div>`;
}
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
// Real underlying admin permission (doesn't change with view toggle)
function hasAdminRights() {
  const u = STATE.currentUser;
  if (!u) return false;
  if (CONFIG.adminIds.includes(u.id)) return true;
  if (u.isAdmin === true || u.isAdmin === 'true') return true;
  return false;
}

// What the UI uses — respects the admin's "View as Non-Admin" toggle
function isAdmin() {
  if (!hasAdminRights()) return false;
  if (localStorage.getItem('tsv_admin_view_as') === 'non-admin') return false;
  return true;
}

// Tracker and Rooms: non-admins see only their own syndicate.
// (Buddy picker overrides this to always show all — that's the cross-syndicate case.)
function canSeeAllSyndicates() {
  const u = STATE.currentUser;
  if (!u) return false;
  if (isAdmin()) return true;
  if (u.csc === 'Staff' || u.syndicate === 'Leadership') return true;
  return false;
}
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
  // Use swipe-RIGHT (from left edge) for full-content modals — lets users
  // scroll the body freely without the swipe-down handler hijacking touches.
  attachSwipeRightClose(el('members-modal'), '.members-sheet');
  attachSwipeRightClose(el('member-editor'), '.editor-sheet', () => { _editingMemberId = null; });
  attachSwipeRightClose(el('event-editor'), '.editor-sheet');
  attachSwipeRightClose(el('visit-detail-modal'), '.visit-detail-sheet');
  attachSwipeDownClose(el('buddy-modal'), '.buddy-sheet');
}

// Swipe-right-to-close — page-turn feel: as the sheet slides right, the
// backdrop fades out proportionally, revealing the app behind. Only arms
// from the left 30% so normal taps/scrolls in the body aren't hijacked.
function attachSwipeRightClose(modalEl, sheetSelector, onClose) {
  const sheet = modalEl.querySelector(sheetSelector);
  if (!sheet) return;
  let startX = 0, startY = 0, currentX = 0, dragging = false, locked = false;

  sheet.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    if (startX > window.innerWidth * 0.30) return;
    dragging = true;
    locked = false;
    currentX = 0;
    sheet.style.transition = 'none';
    modalEl.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!locked) {
      if (Math.abs(dy) > Math.abs(dx)) { dragging = false; return; }
      locked = true;
      // Kill backdrop-filter the moment we commit to a horizontal drag — it was
      // creating a stacking context that stopped the main app from showing through
      // even when the modal's bg alpha reached 0.
      modalEl.style.backdropFilter = 'none';
      modalEl.style.webkitBackdropFilter = 'none';
    }
    if (dx < 0) { currentX = 0; sheet.style.transform = ''; modalEl.style.backgroundColor = ''; return; }
    currentX = dx;
    sheet.style.transform = `translateX(${currentX}px)`;
    const progress = Math.min(currentX / window.innerWidth, 1);
    const alpha = 0.55 * (1 - progress);
    modalEl.style.backgroundColor = `rgba(15,23,42,${alpha})`;
  }, { passive: true });

  sheet.addEventListener('touchend', () => {
    if (!dragging) return;
    sheet.style.transition = 'transform .22s var(--ease-out)';
    modalEl.style.transition = 'background-color .22s var(--ease-out)';
    if (currentX > 100) {
      sheet.style.transform = 'translateX(100%)';
      modalEl.style.backgroundColor = 'rgba(15,23,42,0)';
      setTimeout(() => {
        sheet.style.transform = '';
        sheet.style.transition = '';
        modalEl.style.backgroundColor = '';
        modalEl.style.backdropFilter = '';
        modalEl.style.webkitBackdropFilter = '';
        modalEl.style.transition = '';
        modalEl.classList.add('hidden');
        if (onClose) onClose();
      }, 220);
    } else {
      sheet.style.transform = '';
      modalEl.style.backgroundColor = '';
      modalEl.style.backdropFilter = '';
      modalEl.style.webkitBackdropFilter = '';
    }
    dragging = false;
    locked = false;
    currentX = 0;
  });
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
  if (tabId === 'learnings') { renderLearnings(); syncLearnings(); if (STATE.learnSubTab === 'reflections') syncReflections(); }
  if (tabId === 'ir')        renderIR();
  if (tabId === 'sop')       renderSOP();
  if (tabId === 'settings')  renderSettings();
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
let _lastMembersHash = '';
let _lastLearningsHash = '';
let _lastCalendarHash = '';
let _lastPingsHash = '';

async function syncMembers() {
  const data = await API.get('getMembers');
  if (!data || !Array.isArray(data) || data.length === 0) return;
  const hash = JSON.stringify(data);
  if (hash === _lastMembersHash) return;
  _lastMembersHash = hash;

  MEMBERS = data.map(row => ({
    id: String(row.id), name: row.name || '', shortName: row.shortName || row.name || '',
    rank: row.rank || '', role: row.role || 'Member',
    csc: row.csc || '', syndicate: String(row.syndicate || ''),
    pin: row.pin || '0000',
    isAdmin: row.isAdmin === 'true' || row.isAdmin === true
  }));
  if (STATE.currentUser) {
    const me = MEMBERS.find(m => m.id === STATE.currentUser.id);
    if (me) {
      STATE.currentUser = { ...STATE.currentUser, ...me };
      saveIdentity(STATE.currentUser);
    }
  }
  if (anyModalOpen() || STATE.isTouching) return;
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.currentTab === 'rooms')    renderRooms();
  if (STATE.currentTab === 'home')     renderHome();
}

let _lastStatusHash = '';
function anyModalOpen() {
  return ['settings-modal','members-modal','member-editor','event-editor',
          'visit-detail-modal','buddy-modal','self-register-modal','adhoc-picker']
    .some(id => { const m = el(id); return m && !m.classList.contains('hidden'); });
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
  // Skip re-render if nothing actually changed — prevents jank on idle polling
  const hash = JSON.stringify(map);
  if (hash === _lastStatusHash) return;
  _lastStatusHash = hash;
  STATE.memberStatuses = map;

  // Don't rip out DOM while user is interacting with a modal or mid-touch
  if (anyModalOpen() || STATE.isTouching) return;

  if (STATE.currentTab === 'home')     renderHome();
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.currentTab === 'rooms')    renderRooms();
  if (STATE.currentTab === 'map')      updateMapMarkers();
  renderPinnedActionBar();
}

async function syncLearnings() {
  const data = await API.get('getLearnings');
  if (!data) return;
  const hash = JSON.stringify(data);
  if (hash === _lastLearningsHash) return;
  _lastLearningsHash = hash;
  STATE.learnings = data;
  if (!anyModalOpen() && STATE.currentTab === 'learnings') renderLearnings();
}

let _lastReflectionsHash = '';
async function syncReflections() {
  const data = await API.get('getReflections');
  if (!Array.isArray(data)) return;
  const hash = JSON.stringify(data);
  if (hash === _lastReflectionsHash) return;
  _lastReflectionsHash = hash;
  STATE.reflections = data;
  if (!anyModalOpen() && STATE.currentTab === 'learnings' && STATE.learnSubTab === 'reflections') renderLearnings();
}

async function syncCalendar() {
  const data = await API.get('getCalendar');
  if (!Array.isArray(data) || !data.length) return;
  const hash = JSON.stringify(data);
  if (hash === _lastCalendarHash) return;
  _lastCalendarHash = hash;
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
  if (anyModalOpen() || STATE.isTouching) return;
  if (STATE.currentTab === 'calendar') renderCalendar();
  if (STATE.currentTab === 'home') renderHome();
}

async function seedIfEmpty() {
  if (STATE.offlineMode) return;
  // Only admins should run seed/migration — no reason for 50 regular users
  // to each hit the API with seed checks on every cold start.
  if (!hasAdminRights()) return;
  // Run in background — don't block startup on any of this.
  (async () => {
    const members = await API.get('getMembers');
    if (Array.isArray(members)) {
      if (members.length === 0) {
        await API.post('seedMembers', { members: DEFAULT_MEMBERS });
      } else {
        const existingIds = new Set(members.map(m => String(m.id)));
        const missing = DEFAULT_MEMBERS.filter(m => !existingIds.has(m.id));
        if (missing.length) await API.post('seedMembers', { members: missing });

        // One-time migration — parallel, not sequential
        const STALE_IDS = [
          'sl', 'dysl', 'safety_ic', 'security_ic', 'log_ic', 'learning_ic', 'comm_ic',
          '57s1_ic', '57s3_ic', '57s4_ic',
          '57s1_m1','57s1_m2','57s1_m3','57s1_m4','57s1_m5','57s1_m6','57s1_m7',
          '57s3_m1','57s3_m2','57s3_m3','57s3_m4','57s3_m5','57s3_m6','57s3_m7',
          '57s4_m1','57s4_m2','57s4_m3','57s4_m4','57s4_m5','57s4_m6','57s4_m7',
          '25es18_m1','25es18_m2','25es18_m3','25es18_m4','25es18_m5','25es18_m6','25es18_m7',
          '26es14_m1','26es14_m2','26es14_m3','26es14_m4','26es14_m5','26es14_m6','26es14_m7',
          '27es18_m1','27es18_m2','27es18_m3','27es18_m4','27es18_m5','27es18_m6','27es18_m7'
        ];
        if (localStorage.getItem('tsv_migrated_v2') !== '1') {
          const toRemove = members.filter(m =>
            STALE_IDS.includes(String(m.id)) && m.isDeleted !== 'true' && m.isDeleted !== true
          );
          await Promise.all(toRemove.map(m =>
            API.post('deleteMember', { id: m.id, actor: 'migration_v2' })
          ));
          localStorage.setItem('tsv_migrated_v2', '1');
        }
      }
    }
    const cal = await API.get('getCalendar');
    if (Array.isArray(cal) && cal.length === 0) await API.post('seedCalendar', { events: CALENDAR_SEED });
  })().catch(() => {});
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

// Smart polling: tier syncs by how often data changes.
//   - Every 30s: statuses (most dynamic)
//   - Every 2 min: members (rarely changes, except admin edits)
//   - Every 5 min: calendar (rarely changes)
//   - On-demand: learnings (only while viewing Learn tab, every 45s)
// All syncs are hash-checked — if nothing changed, no re-render.
// All polls pause when the page is hidden (tab backgrounded).
// No aggressive polling — users refresh on demand (pull-to-refresh),
// after their own actions, on tab switch, or when returning to the app.
function startPolling() {
  Object.keys(STATE._timers || {}).forEach(k => clearInterval(STATE._timers[k]));
  STATE._timers = {};

  // Initial sync — parallel, fire-and-forget so startup isn't blocked
  Promise.all([syncMembers(), syncStatuses(), syncCalendar()]).catch(() => {});

  // Refresh when user comes back to the tab/app
  if (!STATE._visHandler) {
    STATE._visHandler = () => {
      if (!document.hidden) {
        syncStatuses();
        if (STATE.currentTab === 'learnings') {
          syncLearnings();
          if (STATE.learnSubTab === 'reflections') syncReflections();
        }
      }
    };
    document.addEventListener('visibilitychange', STATE._visHandler);
  }
}

// ═══════════ PULL-TO-REFRESH ══════════════════════════════════
function setupPullToRefresh() {
  const main = el('main-content');
  if (!main) return;

  const indicator = document.createElement('div');
  indicator.id = 'ptr-indicator';
  indicator.innerHTML = '<span class="ptr-icon">↓</span>';
  document.body.appendChild(indicator);

  let startY = 0, pullDist = 0, pulling = false, refreshing = false;
  const threshold = 70;

  main.addEventListener('touchstart', (e) => {
    if (refreshing) return;
    if (main.scrollTop > 0) { pulling = false; return; }
    startY = e.touches[0].clientY;
    pulling = true;
    pullDist = 0;
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!pulling || refreshing) return;
    pullDist = e.touches[0].clientY - startY;
    if (pullDist < 0) { pulling = false; resetIndicator(); return; }
    if (main.scrollTop > 0) { pulling = false; resetIndicator(); return; }
    indicator.style.visibility = 'visible';
    const y = Math.min(pullDist * 0.5, 80);
    indicator.style.transform = `translate(-50%, ${y - 60}px)`;
    indicator.style.opacity = Math.min(pullDist / threshold, 1);
    const icon = indicator.querySelector('.ptr-icon');
    if (pullDist > threshold) {
      icon.textContent = '🔄';
      indicator.classList.add('ptr-ready');
    } else {
      icon.textContent = '↓';
      indicator.classList.remove('ptr-ready');
    }
  }, { passive: true });

  function resetIndicator() {
    indicator.style.transform = 'translate(-50%, -60px)';
    indicator.style.opacity = '0';
    setTimeout(() => { if (!refreshing) indicator.style.visibility = 'hidden'; }, 150);
  }

  main.addEventListener('touchend', async () => {
    if (!pulling || refreshing) return;
    pulling = false;
    if (pullDist > threshold) {
      refreshing = true;
      indicator.classList.add('ptr-refreshing');
      indicator.style.transform = 'translate(-50%, 20px)';
      indicator.querySelector('.ptr-icon').textContent = '⟳';
      try {
        await Promise.all([
          syncMembers(),
          syncStatuses(),
          syncCalendar(),
          syncLearnings(),
          syncReflections()
        ]);
      } catch {}
      toast('✓ Refreshed');
      setTimeout(() => {
        indicator.classList.remove('ptr-refreshing', 'ptr-ready');
        refreshing = false;
        resetIndicator();
      }, 500);
    } else {
      resetIndicator();
    }
  }, { passive: true });
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
    ${STATE.apiState === 'offline' ? `<div class="alert alert-orange">📡 Offline — showing last synced data. Pull down to refresh when back online.</div>` : ''}
    ${STATE.apiState === 'error'   ? `<div class="alert alert-orange">⚠️ Couldn't reach the server — showing last synced data.</div>` : ''}
    ${STATE.apiState === 'unconfigured' ? `<div class="alert alert-red">⚙️ API not configured — see config.js</div>` : ''}

    ${renderWeatherStrip()}
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
    if (document.hidden || STATE.currentTab !== 'home') return;
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
    const isExpanded = STATE.expandedEventId === ev.id;
    const attn = isAttendanceEvent(ev);

    let expansionHtml = '';
    if (isExpanded) {
      const oicLines = ev.oics && Object.keys(ev.oics).length
        ? Object.entries(ev.oics).filter(([,v])=>v).map(([k,v])=>`<p><b>${oicLabel(k)}:</b> ${escapeHtml(v)}</p>`).join('')
        : '';
      expansionHtml = `
        <div class="cal-event-expand">
          <div class="cee-title-row">${cat.icon} ${escapeHtml(ev.title)} · ${ev.startTime}${ev.endTime !== ev.startTime ? '–'+ev.endTime : ''}</div>
          ${ev.attire ? `<h5>👔 Attire</h5><p>${escapeHtml(ev.attire)}</p>` : ''}
          ${ev.remarks ? `<h5>📝 Remarks</h5><p>${escapeHtml(ev.remarks)}</p>` : ''}
          ${oicLines ? `<h5>👥 Functional OICs</h5>${oicLines}` : ''}
          ${hasVisit ? `<h5>💡 Learning Visit</h5><p><a href="#" onclick="event.preventDefault(); switchTab('learnings'); openVisitDetail('${ev.visitId}')" style="color:var(--blue-600);font-weight:700">${escapeHtml(getVisitById(ev.visitId).title)} →</a></p>` : ''}
          <div class="cee-actions">
            ${attn ? `<button class="btn-attendance" onclick="event.stopPropagation(); showAttendancePicker('${ev.id}')">📋 Send Attendance</button>` : ''}
            ${isAdmin() ? `<button class="btn btn-outline btn-xs" onclick="event.stopPropagation(); openEventEditor('${ev.id}')">✏️ Edit</button>` : ''}
            <button class="btn btn-outline btn-xs" onclick="event.stopPropagation(); toggleEventExpand(null)">✕ Close</button>
          </div>
        </div>`;
    }

    return `
      <div class="cal-event">
        <div class="cal-event-time">
          <div class="ce-start">${ev.startTime}</div>
          <div class="ce-end">${ev.endTime !== ev.startTime ? ev.endTime : ''}</div>
        </div>
        <div class="cal-event-card ${isNow?'now':''} ${isExpanded?'expanded':''}" style="border-left-color:${cat.color}" onclick="toggleEventExpand('${ev.id}')">
          <div class="ce-title">${cat.icon} ${escapeHtml(ev.title)}</div>
          ${ev.location ? `<div class="ce-loc">📍 ${escapeHtml(ev.location)}</div>` : ''}
          <div class="ce-badges">
            <span class="ce-badge cat" style="background:${cat.color}">${cat.label}</span>
            ${ev.attire ? `<span class="ce-badge attire">👔 ${escapeHtml(ev.attire)}</span>` : ''}
            ${hasVisit ? `<span class="ce-badge visit">💡 Learning Visit</span>` : ''}
            ${attn ? `<span class="ce-badge" style="background:#10b981;color:white;font-weight:800">⭐ SYN IC REPORT</span>` : ''}
            ${isNow ? `<span class="ce-badge" style="background:var(--green-500);color:white">● NOW</span>` : ''}
          </div>
        </div>
      </div>
      ${expansionHtml}`;
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
        <div class="db-main">
          <div class="db-label">Day ${day.day} · ${day.label}</div>
          <div class="db-theme">${day.icon} ${day.theme}</div>
        </div>
        <div class="db-date">${new Date(day.date).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</div>
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

// Swipe between Tracker sub-views (List ↔ Map)
function setupTrackerSwipe() {
  const container = el('tab-location');
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
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const current = STATE.trackerView || 'list';
    if (dx < 0 && current === 'list') setTrackerView('map');
    else if (dx > 0 && current === 'map') setTrackerView('list');
  }, { passive: true });
}

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

window.toggleEventExpand = function(eventId) {
  STATE.expandedEventId = (STATE.expandedEventId === eventId) ? null : eventId;
  renderCalendar();
  // Scroll expanded event into view
  if (STATE.expandedEventId) {
    setTimeout(() => {
      const cards = document.querySelectorAll('.cal-event-card.expanded');
      cards[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
};

function isAttendanceEvent(ev) {
  return ev.synicReport === true;
}

// ═══════════ ATTENDANCE SEND ══════════════════════════════════
window.showAttendancePicker = function(eventId) {
  const ev = CALENDAR_EVENTS.find(e => e.id === eventId);
  if (!ev) return;
  const groups = visibleGroups().filter(g => g !== 'Leadership');
  if (!groups.length) { toast('No syndicate available'); return; }

  const opts = groups.map(g => ({ key: g, label: formatGroupDisplay(g), count: membersInGroup(g).length }));
  const rows = opts.map(o => `
    <button class="adhoc-row" onclick="promptAttendanceCount('${o.key.replace(/'/g,"\\'")}', '${eventId}'); closeAdhocPicker()">
      <span>${escapeHtml(o.label)}</span>
      <span class="ah-count">${o.count} total</span>
    </button>`).join('');

  const wrap = document.createElement('div');
  wrap.id = 'adhoc-picker';
  wrap.className = 'adhoc-picker';
  wrap.innerHTML = `
    <div class="adhoc-sheet">
      <h3>📋 Attendance Report</h3>
      <p class="ah-sub">${escapeHtml(ev.title)} · ${ev.startTime}</p>
      <p class="ah-sub" style="margin-top:-6px">Which syndicate?</p>
      ${rows}
      <button class="adhoc-cancel" onclick="closeAdhocPicker()">Cancel</button>
    </div>`;
  document.body.appendChild(wrap);
};

window.promptAttendanceCount = function(groupKey, eventId) {
  const ev = CALENDAR_EVENTS.find(e => e.id === eventId);
  const total = membersInGroup(groupKey).length;
  const input = prompt(`${formatGroupDisplay(groupKey)}\n\nHow many present? (out of ${total})\n\nEvent: ${ev.title} at ${ev.startTime}`, String(total));
  if (input === null) return;
  const n = parseInt(input);
  if (isNaN(n) || n < 0 || n > total) { toast('Invalid — enter 0 to ' + total); return; }

  const bkk = bkkNow();
  const dateLabel = bkk.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'});
  const status = n === total ? '✅' : '⚠️';
  const msg = `📋 <b>ATTENDANCE</b> ${status}
${formatGroupDisplay(groupKey)}: <b>${n}/${total}</b> present
Event: ${ev.title}
Time: ${ev.startTime}H · ${dateLabel}`;

  TELEGRAM.send(msg, CONFIG.telegram.chatId).then(ok => {
    if (ok) toast(`✅ Attendance sent: ${n}/${total}`);
    else toast('❌ Failed to send');
  });
};

// Kept for compatibility (no-op — now uses inline expansion)
window.showEventDetail = function(eventId) {
  toggleEventExpand(eventId);
};

// Old overlay-modal renderer (unused, kept to avoid breakage if called)
function _legacyShowEventDetail(eventId) {
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

window.hideEventDetail = function() { toggleEventExpand(null); };

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

  if (!STATE.expandedTrackerGroups) STATE.expandedTrackerGroups = new Set();

  const synGroups = visibleGs.map(gk => {
    if (STATE.locationFilter !== 'all' && STATE.locationFilter !== gk) return '';
    const members = membersInGroup(gk);
    if (!members.length) return '';
    const synOut = members.filter(m => getStatusOf(m.id).status === 'out').length;
    const synIn = members.length - synOut;
    const allIn = synOut === 0;
    const safeId = gk.replace(/[^a-z0-9]/gi, '_');
    const mySyn = user && memberGroupKey(user) === gk;
    const isOpen = STATE.expandedTrackerGroups.has(gk);
    const rows = !isOpen ? '' : members.map(m => {
      const st = getStatusOf(m.id);
      const isOut = st.status === 'out';
      const isMe = user && m.id === user.id;
      const canPing = mySyn && !isMe; // only ping within your own syndicate
      const canForce = isAdmin() && !isMe && isOut;  // admin override
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
          ${canForce ? `<button class="btn-force-return" onclick="event.stopPropagation(); forceReturnMember('${m.id}', '${escapeHtml(m.shortName || m.name).replace(/'/g,"\\'")}'`+`)" title="Admin override — mark as returned">🏨</button>` : ''}
          ${canPing ? `<button class="btn-ping" onclick="event.stopPropagation(); pingMember('${m.id}', '${escapeHtml(m.shortName || m.name).replace(/'/g,"\\'")}'`+`)">👋</button>` : ''}
          <span class="status-pill ${isOut ? 'pill-out' : 'pill-in'}">${isOut ? 'OUT' : 'IN'}</span>
        </div>`;
    }).join('');
    return `
      <div class="syn-group" id="sg-${safeId}">
        <div class="syn-header" style="background:${synColor(gk)}">
          <span class="syn-name" onclick="toggleTrackerGroup('${gk.replace(/'/g,"\\'")}')" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex:1">
            ${formatGroupDisplay(gk)} <span class="syn-arrow" style="font-size:10px;opacity:.8">${isOpen?'▲':'▼'}</span>
          </span>
          <button class="syn-sitrep-btn" onclick="event.stopPropagation(); sendSyndicateSITREP('${gk.replace(/'/g,"\\'")}')">📤 SITREP</button>
          <span class="syn-count">${synIn}/${members.length} ${allIn ? '✅' : '⚠️'}</span>
        </div>
        ${isOpen ? `<div class="syn-members open" id="syn-members-${safeId}">${rows}</div>` : ''}
      </div>`;
  }).join('');

  // Filter chips — only show if user sees multiple groups
  const filterChips = visibleGs.length > 1
    ? ['all', ...visibleGs].map(s =>
        `<button class="filter-chip ${STATE.locationFilter === s ? 'active' : ''}" onclick="setLocationFilter('${s.replace(/'/g, "\\'")}')">${s === 'all' ? 'All' : formatGroupDisplay(s)}</button>`
      ).join('')
    : '';

  const trackerView = STATE.trackerView || 'list';

  el('tab-location').innerHTML = `
    <div class="subtab-row" id="tracker-subtabs">
      <button class="subtab-btn ${trackerView === 'list' ? 'active' : ''}" onclick="setTrackerView('list')">📋 List</button>
      <button class="subtab-btn ${trackerView === 'map'  ? 'active' : ''}" onclick="setTrackerView('map')">🗺️ Map</button>
    </div>
    <div id="tracker-map-wrap" style="${trackerView === 'map' ? '' : 'display:none'}">
      <div id="map-container"><div id="leaflet-map"></div></div>
      <div class="map-legend" style="margin-top:10px">
        <div class="legend-item"><div class="legend-dot" style="background:#003580"></div>Hotel</div>
        <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div>In Hotel</div>
        <div class="legend-item"><div class="legend-dot" style="background:#DC143C"></div>Out</div>
      </div>
    </div>
    <div id="tracker-list-wrap" style="${trackerView === 'list' ? '' : 'display:none'}">
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
    <div class="mini-hint">↓ Pull to refresh · swipe ← for Map</div>
    </div>
  `;

  // Initialize the map if the user is already on Map view
  if (trackerView === 'map') {
    setTimeout(() => initMap(), 100);
  }
}

window.setTrackerView = function(view) {
  STATE.trackerView = view;
  renderLocation();
  if (view === 'map') setTimeout(() => initMap(), 100);
};
window.toggleSynGroup = function(s) {
  const m = el(`syn-members-${s}`), h = qs(`#sg-${s} .syn-header`);
  m?.classList.toggle('open'); h?.classList.toggle('collapsed');
};
window.toggleTrackerGroup = function(gk) {
  if (!STATE.expandedTrackerGroups) STATE.expandedTrackerGroups = new Set();
  if (STATE.expandedTrackerGroups.has(gk)) STATE.expandedTrackerGroups.delete(gk);
  else STATE.expandedTrackerGroups.add(gk);
  renderLocation();
};
window.toggleRoomsGroup = function(gk) {
  if (!STATE.expandedRoomsGroups) STATE.expandedRoomsGroups = new Set();
  if (STATE.expandedRoomsGroups.has(gk)) STATE.expandedRoomsGroups.delete(gk);
  else STATE.expandedRoomsGroups.add(gk);
  renderRooms();
};
window.setLocationFilter = function(f) {
  STATE.locationFilter = f;
  if (STATE.currentTab === 'rooms') renderRooms();
  else if (STATE.currentTab === 'location') renderLocation();
};

// ═══════════ BUDDY / STATUS ACTIONS ══════════════════════════
window.showBuddyModal = function() {
  el('buddy-modal').classList.remove('hidden');
  STATE._pendingGPS = null;
  // Reset the in-modal GPS button
  const gpsBtn = el('buddy-gps-btn');
  if (gpsBtn) { gpsBtn.textContent = '📡 GPS'; gpsBtn.disabled = false; gpsBtn.style.background = ''; }
  const gpsStatus = el('buddy-gps-status');
  if (gpsStatus) gpsStatus.style.display = 'none';
  const locInput = el('location-text-input');
  if (locInput) locInput.value = '';

  if (!STATE.expandedBuddyGroups) STATE.expandedBuddyGroups = new Set();
  const user = STATE.currentUser;
  if (!user) return;
  renderBuddyList();
};
window.hideBuddyModal = function() { el('buddy-modal').classList.add('hidden'); };

function renderBuddyList() {
  const list = el('buddy-list');
  const user = STATE.currentUser;
  if (!user) { list.innerHTML = ''; return; }
  const groups = groupOrder();
  const selectedIds = new Set(
    [...document.querySelectorAll('.buddy-item.selected')].map(x => x.dataset.id)
  );

  list.innerHTML = groups.map(gk => {
    const members = membersInGroup(gk)
      .filter(m => m.id !== user.id && getStatusOf(m.id).status !== 'out');
    if (!members.length) return '';
    const isOpen = STATE.expandedBuddyGroups.has(gk);
    const safeId = gk.replace(/[^a-z0-9]/gi, '_');
    const itemsHtml = !isOpen ? '' : members.map(m => {
      const sel = selectedIds.has(m.id) ? 'selected' : '';
      return `<div class="buddy-item ${sel}" data-id="${m.id}" onclick="toggleBuddySelect(this)">
        <span class="bi-dot"></span>${escapeHtml(m.shortName || m.name)}
      </div>`;
    }).join('');
    const selectedCount = members.filter(m => selectedIds.has(m.id)).length;
    return `
      <div class="buddy-group" id="bg-${safeId}">
        <div class="buddy-group-header" style="background:${synColor(gk)}"
          onclick="toggleBuddyGroup('${gk.replace(/'/g,"\\'")}')">
          <span>${formatGroupDisplay(gk)} <span style="opacity:.75;font-weight:600">· ${members.length}</span></span>
          <span style="display:flex;align-items:center;gap:6px">
            ${selectedCount ? `<span class="selcount">${selectedCount} selected</span>` : ''}
            <span style="font-size:10px;opacity:.8">${isOpen?'▲':'▼'}</span>
          </span>
        </div>
        ${isOpen ? `<div class="buddy-group-items">${itemsHtml}</div>` : ''}
      </div>`;
  }).join('') || '<p style="padding:16px;color:var(--text-2);font-size:13px;text-align:center">No members available.</p>';
}

window.toggleBuddyGroup = function(gk) {
  if (!STATE.expandedBuddyGroups) STATE.expandedBuddyGroups = new Set();
  if (STATE.expandedBuddyGroups.has(gk)) STATE.expandedBuddyGroups.delete(gk);
  else STATE.expandedBuddyGroups.add(gk);
  renderBuddyList();
};

window.toggleBuddySelect = function(itemEl) {
  itemEl.classList.toggle('selected');
  // Update the selected-count pill in this group's header without full re-render
  const groupEl = itemEl.closest('.buddy-group');
  if (!groupEl) return;
  const count = groupEl.querySelectorAll('.buddy-item.selected').length;
  const header = groupEl.querySelector('.buddy-group-header');
  const existing = header?.querySelector('.selcount');
  if (count === 0) existing?.remove();
  else {
    if (existing) existing.textContent = count + ' selected';
    else {
      const right = header?.lastElementChild;
      const pill = document.createElement('span');
      pill.className = 'selcount';
      pill.textContent = count + ' selected';
      right?.insertBefore(pill, right.firstElementChild);
    }
  }
};

// Pre-share GPS from inside the buddy modal (before submitting)
window.shareGPSFromBuddyModal = async function() {
  const btn = el('buddy-gps-btn');
  const status = el('buddy-gps-status');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const pos = await new Promise((r, rj) =>
      navigator.geolocation.getCurrentPosition(r, rj, { timeout: 8000, enableHighAccuracy: false })
    );
    STATE._pendingGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (btn) { btn.textContent = '✓ GPS'; btn.style.background = 'linear-gradient(135deg, #16a34a, #22c55e)'; }
    if (status) {
      status.style.display = 'block';
      status.textContent = `📍 GPS captured: ${STATE._pendingGPS.lat.toFixed(4)}, ${STATE._pendingGPS.lng.toFixed(4)}`;
      status.style.color = '#16a34a';
    }
  } catch (e) {
    if (btn) { btn.textContent = '📡 GPS'; btn.disabled = false; }
    if (status) {
      status.style.display = 'block';
      status.textContent = '❌ GPS unavailable — continue without it';
      status.style.color = 'var(--red-500)';
    }
  }
};

window.confirmLeaveHotel = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  const rawLoc = el('location-text-input')?.value?.trim() || '';
  const locText = rawLoc || 'Vicinity of Hotel';
  const selectedItems = [...document.querySelectorAll('.buddy-item.selected')];
  const buddyObjs = selectedItems.map(x => getMemberById(x.dataset.id)).filter(Boolean);
  const myLabel = user.shortName || user.name;
  const buddyLabels = buddyObjs.map(b => b.shortName || b.name);
  hideBuddyModal();

  // Use pending GPS (from the in-modal 📡 button) if shared, else keep existing coords
  const pending = STATE._pendingGPS;
  const existingStatus = getStatusOf(user.id);
  const useLat = pending ? pending.lat : (existingStatus.lat || '');
  const useLng = pending ? pending.lng : (existingStatus.lng || '');
  STATE._pendingGPS = null;
  const now = new Date().toISOString();

  // Mark ME as out
  STATE.memberStatuses[user.id] = {
    ...existingStatus,
    status: 'out',
    locationText: locText,
    lat: useLat || null,
    lng: useLng || null,
    buddyWith: buddyLabels.join(', '),
    lastUpdated: now
  };
  await API.post('updateStatus', {
    memberId: user.id, name: user.name, shortName: user.shortName,
    role: user.role, syndicate: user.syndicate,
    status: 'out', locationText: locText,
    lat: useLat, lng: useLng,
    buddyWith: buddyLabels.join(', '),
    roomNumber: existingStatus.roomNumber || ''
  });

  // Mark EACH buddy as out too — same location text, GPS only for caller
  for (const b of buddyObjs) {
    const otherNames = [myLabel, ...buddyLabels.filter(n => n !== (b.shortName || b.name))];
    const bStatus = getStatusOf(b.id);
    STATE.memberStatuses[b.id] = {
      ...bStatus,
      status: 'out',
      locationText: locText,
      buddyWith: otherNames.join(', '),
      lastUpdated: now
    };
    await API.post('updateStatus', {
      memberId: b.id, name: b.name, shortName: b.shortName,
      role: b.role, syndicate: b.syndicate,
      status: 'out', locationText: locText,
      lat: bStatus.lat || '', lng: bStatus.lng || '',
      buddyWith: otherNames.join(', '),
      roomNumber: bStatus.roomNumber || ''
    });
  }

  renderLocation();
  renderPinnedActionBar();
  const n = 1 + buddyObjs.length;
  toast(`✅ ${n} marked OUT — stay safe!`);
};

window.returnToHotel = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  STATE.memberStatuses[user.id] = { status:'in_hotel', locationText:'Hotel', lat:CONFIG.hotel.lat, lng:CONFIG.hotel.lng, buddyWith:'', lastUpdated:new Date().toISOString() };
  renderLocation();
  renderPinnedActionBar();
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
    renderPinnedActionBar();
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
  if (STATE.map) {
    updateMapMarkers();
    // Ensure map re-measures after tab switch / orientation / action-bar changes
    setTimeout(() => STATE.map.invalidateSize(), 100);
    return;
  }
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
  const sub = STATE.learnSubTab || 'visits';
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/edit`;

  el('tab-learnings').innerHTML = `
    <div class="subtab-row" id="learn-subtabs">
      <button class="subtab-btn ${sub === 'visits' ? 'active' : ''}" onclick="setLearnSubTab('visits')">💡 Visits</button>
      <button class="subtab-btn ${sub === 'reflections' ? 'active' : ''}" onclick="setLearnSubTab('reflections')">📝 Reflections</button>
    </div>
    <a class="sheet-link" href="${sheetUrl}" target="_blank" rel="noopener">
      <span>📊</span> Open Google Sheet · Hypotheses & Posts
      <span class="sheet-link-arrow">↗</span>
    </a>
    <div id="learn-content">
      ${sub === 'visits' ? renderVisitsSubTab() : renderReflectionsSubTab()}
    </div>
  `;
}

function renderVisitsSubTab() {
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

  return `
    <div class="learn-intro">
      <h3>💡 Learning & PMESII Hypotheses</h3>
      <p>Each visit has a guiding hypothesis. Tap to see learning outcomes and post your observations, ah-ha moments, or implications for SG/SAF.</p>
    </div>
    <div class="section-title">Visits & Tours</div>
    <div class="visit-grid">${visitCards}</div>

    <div style="margin-top:20px" class="section-title">All Learnings Feed</div>
    ${renderLearningFeed(STATE.learnings, null)}
  `;
}

function renderReflectionsSubTab() {
  const user = STATE.currentUser;
  const reflections = STATE.reflections || [];
  const mine = user ? reflections.filter(r => r.authorId === user.id) : [];
  const others = user ? reflections.filter(r => r.authorId !== user.id) : reflections;

  const feedHtml = !reflections.length
    ? `<div class="empty-state"><div class="icon">📝</div><p>No reflections posted yet.<br>Be the first to contribute!</p></div>`
    : `<div class="learning-feed">${reflections.map(r => {
        const time = r.timestamp ? new Date(r.timestamp).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
        const dayMeta = r.day ? DAYS.find(d => d.day == r.day) : null;
        return `
          <div class="learning-post">
            <div class="post-header">
              <span class="post-author">${escapeHtml(r.authorName || 'Anonymous')}</span>
              ${r.syndicate ? `<span class="post-day-badge" style="background:#64748b">${escapeHtml(r.syndicate)}</span>` : ''}
              ${dayMeta ? `<span class="post-day-badge" style="background:${dayMeta.color}">Day ${dayMeta.day}</span>` : ''}
              <span class="post-time">${time}</span>
            </div>
            <div class="post-body">${escapeHtml(r.content || '').replace(/\n/g,'<br>')}</div>
          </div>`;
      }).join('')}</div>`;

  return `
    <div class="learn-intro">
      <h3>📝 Daily Reflections</h3>
      <p>Use the template below to guide your end-of-day syndicate reflection. Posts go to the shared Reflections sheet and are visible to everyone.</p>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="card-header"><span class="icon">🧭</span><h3>Reflection Template</h3></div>
      <div class="card-body">
        <pre style="font-size:11.5px;line-height:1.65;white-space:pre-wrap;color:var(--text);margin:0">${REFLECTION_TEMPLATE}</pre>
        <button class="btn btn-outline btn-sm mt-8" onclick="copyReflectionTemplate()">📋 Copy Template</button>
      </div>
    </div>

    ${user ? `
    <div class="visit-compose" style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-color:#818cf8">
      <div class="visit-compose-label" style="color:#3730a3">
        <span>✍️ Post Your Reflection</span>
      </div>
      <textarea id="reflection-compose-text" placeholder="Paste your filled-in template or free-form reflection here…"></textarea>
      <div class="compose-toolbar" style="display:flex;gap:8px;margin-top:10px;align-items:center">
        <label style="font-size:12px;color:#3730a3;font-weight:700">Day:
          <select id="reflection-day-select" style="margin-left:6px;padding:4px 8px;border-radius:6px;border:1px solid #c7d2fe">
            <option value="">—</option>
            ${DAYS.map(d => `<option value="${d.day}">Day ${d.day}</option>`).join('')}
          </select>
        </label>
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" onclick="postReflection()">Post</button>
      </div>
    </div>` : `<div class="alert alert-orange">Sign in to post a reflection.</div>`}

    <div class="section-title" style="margin-top:18px">All Reflections (${reflections.length})</div>
    ${feedHtml}
  `;
}

window.setLearnSubTab = function(tab) {
  STATE.learnSubTab = tab;
  renderLearnings();
  if (tab === 'reflections') syncReflections();
};

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
    ? `<div class="info-block outcomes-block"><h4>📚 Learning Outcomes</h4><ul class="learning-outcomes-list">${v.learningOutcomes.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul></div>`
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

// ═══════════ REFLECTIONS ═════════════════════════════════════
window.postReflection = async function() {
  const ta = el('reflection-compose-text');
  const content = ta?.value?.trim();
  if (!content) return toast('Type your reflection first');
  const user = STATE.currentUser;
  if (!user) return toast('Sign in first');
  const daySel = el('reflection-day-select');
  const day = daySel?.value || '';
  const post = {
    authorId: user.id,
    authorName: user.name,
    syndicate: formatGroupDisplay(memberGroupKey(user)),
    day: day,
    content: content,
    timestamp: new Date().toISOString()
  };
  STATE.reflections.unshift(post);
  ta.value = '';
  await API.post('addReflection', post);
  toast('✅ Reflection posted');
  renderLearnings();
};

// ═══════════ IR TAB ══════════════════════════════════════════
function renderIR() {
  const me = STATE.currentUser;
  const myGroup = me ? formatGroupDisplay(memberGroupKey(me)) : '';
  const myName = me ? `${me.rank ? me.rank + ' ' : ''}${me.name}` : '';
  el('tab-ir').innerHTML = `
    <div class="ir-header-banner">
      <h2>🚨 Incident Report</h2>
      <p>Send to IR chat via Telegram</p>
    </div>
    <div class="ir-form">
      <div class="form-group">
        <label>Report Type</label>
        <div class="size-chooser">
          <button id="ir-type-new"    class="active" onclick="setIRType('NEW')">🆕 New</button>
          <button id="ir-type-update"            onclick="setIRType('UPDATE')">🔄 Update</button>
        </div>
      </div>

      <div class="form-group">
        <label>1) Nature of Incident</label>
        <select id="ir-nature" onchange="updateIRPreview()">
          <option value="">— Select —</option>
          <option>Security</option>
          <option>Safety</option>
          <option>Medical</option>
          <option>Administrative</option>
          <option>Other</option>
        </select>
      </div>

      <div class="form-group">
        <label>2) Brief Description</label>
        <textarea id="ir-desc" placeholder="E.g. On 270426 0900hrs, MAJ Tan reported sick at…" oninput="updateIRPreview()"></textarea>
      </div>

      <div class="form-group">
        <label>3) Status Update</label>
        <input id="ir-status-time" type="text" placeholder="Timestamp — DDMMYY / HHHHRS" oninput="updateIRPreview()">
        <textarea id="ir-status-text" placeholder="E.g. On 270426 0900hrs, MAJ Tan was diagnosed with…" style="margin-top:6px" oninput="updateIRPreview()"></textarea>
      </div>

      <div class="form-group">
        <label>4) Date/Time of Incident</label>
        <input id="ir-when" type="text" placeholder="DDMMYY / HHHHRS — e.g. 270426 / 0900HRS" oninput="updateIRPreview()">
      </div>

      <div class="form-group">
        <label>5) Location of Incident</label>
        <input id="ir-where" type="text" placeholder="Name of place &amp; full address" oninput="updateIRPreview()">
      </div>

      <div class="form-group">
        <label>6) Course / Syn Involved</label>
        <input id="ir-group" type="text" placeholder="E.g. 57th CSC, Syn 1" value="${escapeHtml(myGroup ? (myGroup.includes('SYN') ? '57th CSC, ' + myGroup.replace('57 ','Syn ') : myGroup) : '')}" oninput="updateIRPreview()">
      </div>

      <div class="form-group">
        <label>7) Follow-up Action — Informed NOK?</label>
        <div class="size-chooser">
          <button id="ir-nok-y" onclick="setIRNOK('Y')">✅ Yes</button>
          <button id="ir-nok-n" onclick="setIRNOK('N')">❌ No</button>
          <button id="ir-nok-na" class="active" onclick="setIRNOK('N/A')">— N/A</button>
        </div>
        <input id="ir-followup" type="text" placeholder="Additional follow-up notes" style="margin-top:6px" oninput="updateIRPreview()">
      </div>

      <div class="form-group">
        <label>8) Date/Time of Report to TSV Main Committee</label>
        <input id="ir-reportedTime" type="text" placeholder="DDMMYY / HHHHRS" oninput="updateIRPreview()">
      </div>

      <div class="form-group">
        <label>10) Reported By</label>
        <input id="ir-by" type="text" placeholder="Rank / Name" value="${escapeHtml(myName)}" oninput="updateIRPreview()">
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="icon">📋</span><h3>Telegram Preview</h3></div>
      <div class="card-body">
        <div class="ir-preview" id="ir-preview">Fill in fields above…</div>
        <div class="ir-actions">
          <button class="btn btn-red" style="flex:1" onclick="sendIR()">📤 Send to IR Chat</button>
          <button class="btn btn-outline btn-sm" onclick="copyIR()">📋 Copy</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="icon">📞</span><h3>Emergency Numbers</h3></div>
      <div class="card-body">
        <div class="contact-grid">
          ${EMERGENCY_CONTACTS.map(c => `<a class="contact-card" href="tel:${c.dial || c.number}"><div class="c-flag">${c.flag}</div><div class="c-label">${c.label}</div><div class="c-number">${c.number}</div></a>`).join('')}
        </div>
      </div>
    </div>
  `;
  STATE.irType = STATE.irType || 'NEW';
  STATE.irNOK = STATE.irNOK || 'N/A';
  updateIRPreview();
}

window.setIRType = function(t) {
  STATE.irType = t;
  el('ir-type-new').classList.toggle('active', t === 'NEW');
  el('ir-type-update').classList.toggle('active', t === 'UPDATE');
  updateIRPreview();
};
window.setIRNOK = function(v) {
  STATE.irNOK = v;
  el('ir-nok-y').classList.toggle('active', v === 'Y');
  el('ir-nok-n').classList.toggle('active', v === 'N');
  el('ir-nok-na').classList.toggle('active', v === 'N/A');
  updateIRPreview();
};

window.updateIRPreview = function() {
  const v = id => el(id)?.value?.trim() || '';
  const type = STATE.irType || 'NEW';
  const nok = STATE.irNOK || 'N/A';

  const parts = [];
  parts.push(`*${type}*`);
  parts.push('');
  parts.push(`*Nature Of Incident:*`);
  parts.push(v('ir-nature') || '—');
  parts.push('');
  parts.push(`*2) Brief Description:*`);
  parts.push(v('ir-desc') || '—');
  parts.push('');
  parts.push(`*3) Status Updates:*`);
  const stTime = v('ir-status-time');
  const stText = v('ir-status-text');
  if (stTime) parts.push(stTime);
  if (stText) parts.push(stText);
  if (!stTime && !stText) parts.push('—');
  parts.push('');
  parts.push(`*4) Date/Time Of Incident*`);
  parts.push(v('ir-when') || '—');
  parts.push('');
  parts.push(`*5) Location Of Incident:*`);
  parts.push(v('ir-where') || '—');
  parts.push('');
  parts.push(`*6) Course/Syn Involved:*`);
  parts.push(v('ir-group') || '—');
  parts.push('');
  parts.push(`*7) Follow-up Action:*`);
  parts.push(`Informed NOK? ${nok}${v('ir-followup') ? ' · ' + v('ir-followup') : ''}`);
  parts.push('');
  parts.push(`*8) Date/Time of report to TSV Main Committee:*`);
  parts.push(v('ir-reportedTime') || '—');
  parts.push('');
  parts.push(`*10) Reported By:*`);
  parts.push(v('ir-by') || '—');

  const text = parts.join('\n');
  const p = el('ir-preview');
  if (p) p.textContent = text;
  window._irText = text;
};

window.sendIR = async function() {
  if (!window._irText) return toast('Fill in details first');
  // Telegram supports Markdown (with *bold*) via parse_mode. Use sendMessage with Markdown.
  const token = CONFIG.telegram.botToken;
  const cid = CONFIG.telegram.irChatId;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cid, text: window._irText, parse_mode: 'Markdown' })
    });
    const json = await res.json();
    if (json.ok) {
      toast('✅ IR sent!');
      await API.post('addIncident', {
        reportedBy: STATE.currentUser?.id || 'unknown',
        type: STATE.irType || 'NEW',
        nature: el('ir-nature')?.value || '',
        description: el('ir-desc')?.value || '',
        statusTime: el('ir-status-time')?.value || '',
        statusText: el('ir-status-text')?.value || '',
        when: el('ir-when')?.value || '',
        where: el('ir-where')?.value || '',
        group: el('ir-group')?.value || '',
        nokInformed: STATE.irNOK || 'N/A',
        followup: el('ir-followup')?.value || '',
        reportedTime: el('ir-reportedTime')?.value || '',
        reportedBy: el('ir-by')?.value || ''
      });
    } else {
      toast('❌ Telegram send failed');
    }
  } catch (e) { toast('❌ Send failed'); }
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
      ${EMERGENCY_CONTACTS.map(c => `<a class="contact-card" href="tel:${c.dial || c.number}"><div class="c-flag">${c.flag}</div><div class="c-label">${c.label}</div><div class="c-number">${c.number}</div></a>`).join('')}
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
  // Admin toggle — super-admin (Caspar) only
  const isSuperAdmin = STATE.currentUser?.id === CONFIG.superAdminId;
  const adminRow = el('ed-admin-row');
  const adminBox = el('ed-admin');
  if (adminRow) adminRow.classList.toggle('hidden', !isSuperAdmin);
  if (adminBox) adminBox.checked = !!(m && (m.isAdmin === true || m.isAdmin === 'true'));
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
  // Only super-admin can toggle admin rights — enforced client + server-side
  if (STATE.currentUser?.id === CONFIG.superAdminId) {
    payload.isAdmin = el('ed-admin')?.checked ? 'true' : 'false';
  }
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
  applyBackgroundPrefs();
  applySavedLayout();
  el('loading').style.display = 'none';
  el('app').classList.add('visible');
  // ⚙️ header button removed — Settings is now a dedicated tab in the bottom nav
  const admin = el('btn-admin');
  admin.onclick = showMembersModal;
  if (isAdmin()) admin.classList.remove('hidden');
  const refreshBtn = el('btn-refresh');
  if (refreshBtn) refreshBtn.onclick = manualRefresh;
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  STATE.scheduleDay = (getCurrentDay() || DAYS[0]).day;
  switchTab('home');
  renderPinnedActionBar();
  refreshWeather();
  setInterval(refreshWeather, 30 * 60 * 1000);  // every 30 min
  startPolling();
  seedIfEmpty();
  setupReportReminders();
  setupSyn1AutoReports();
  setupModalSwipes();
  setupCalendarSwipe();
  setupTrackerSwipe();
  setupPullToRefresh();
  requestNotificationPermission();

  // Track touch state to avoid DOM swap during user interaction
  document.addEventListener('touchstart', () => { STATE.isTouching = true; }, { passive: true });
  document.addEventListener('touchend', () => { setTimeout(() => { STATE.isTouching = false; }, 200); }, { passive: true });
  document.addEventListener('touchcancel', () => { STATE.isTouching = false; }, { passive: true });

  // Ping check every 60s (was 20s — 50 users × 20s = too many writes)
  checkMyPings();
  setInterval(checkMyPings, 60000);

  // Admin requests sync for super-admin — every 2 min is plenty
  if (STATE.currentUser?.id === CONFIG.superAdminId) {
    syncAdminRequests();
    setInterval(syncAdminRequests, 2 * 60 * 1000);
  }
}

// Manual refresh — triggered by header 🔄 button
// Also checks for app updates: if a new SW is waiting, skip-waiting + reload.
async function manualRefresh() {
  const btn = el('btn-refresh');
  if (btn) btn.classList.add('spinning');
  try {
    // Check for new app version first — if there is one, take it and reload.
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage('SKIP_WAITING');
            // controllerchange listener will reload us
            toast('⬇️ New version, reloading…');
            return;
          }
        }
      } catch {}
    }
    await Promise.all([
      syncMembers(),
      syncStatuses(),
      syncCalendar(),
      syncLearnings(),
      STATE.learnSubTab === 'reflections' ? syncReflections() : Promise.resolve()
    ]);
    refreshWeather();
    toast('✓ Refreshed');
  } catch {
    toast('⚠ Refresh failed');
  } finally {
    if (btn) setTimeout(() => btn.classList.remove('spinning'), 400);
  }
}

// ═══════════ INIT ════════════════════════════════════════════
window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    let refreshingSW = false;
    // SW's activate no longer force-navigates clients (fixed earlier), so it's
    // safe to simply reload whenever a new SW takes control. The old guard was
    // setting refreshingSW=true when skipping during boot, which PERMANENTLY
    // blocked future reloads — that's why v42→v44 never reached users.
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
            newSW.postMessage('SKIP_WAITING');
          }
        });
      });
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
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
  if (!STATE.expandedRoomsGroups) STATE.expandedRoomsGroups = new Set();
  // Non-admins (who only see their own syndicate) default to expanded; admins default to collapsed
  const nonAdminAutoExpand = !canSeeAllSyndicates() && groups.length === 1;

  const groupSections = groups.map(gk => {
    if (filter !== 'all' && filter !== gk) return '';
    const members = membersInGroup(gk);
    if (!members.length) return '';
    const isOpen = nonAdminAutoExpand || STATE.expandedRoomsGroups.has(gk);
    const rows = !isOpen ? '' : members.map(m => {
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
        <div class="rooms-group-header" style="background:${synColor(gk)};cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleRoomsGroup('${gk.replace(/'/g,"\\'")}')">
          <span>${formatGroupDisplay(gk)} <span class="count">${members.length} ${members.length === 1 ? 'member' : 'members'}</span></span>
          <span style="font-size:10px;opacity:.8">${isOpen?'▲':'▼'}</span>
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
  const members = membersInGroup(groupKey);
  const total = members.length;
  const st = STATE.memberStatuses;
  const out = forceAllIn ? [] : members.filter(m => st[m.id]?.status === 'out');
  const inC = total - out.length;

  const bkk = bkkNow();
  const dateLabel = bkk.toLocaleDateString('en-GB', { day:'numeric', month:'long', weekday:'long', timeZone:'Asia/Bangkok' });
  const timeLabel = options.timeLabel || bkk.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Bangkok' }).replace(':','');
  const header = options.header || `${timeLabel}H SITREP`;

  let msg = `${header} - ${dateLabel}\n`;
  msg += `${formatGroupDisplay(groupKey)}\n`;
  msg += `IN HOTEL: ${inC}\n`;
  msg += `OUT: ${out.length}\n`;
  msg += `TOTAL: ${total}\n`;
  if (out.length > 0) {
    msg += `\nLocation\n`;
    out.forEach(m => {
      const loc = (st[m.id]?.locationText || '').trim() || 'Vicinity of Hotel';
      msg += `${m.shortName || m.name} - ${loc}\n`;
    });
  }
  msg += `\nEnd of SITREP`;
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

// Auto reports (1900H, 2300H, 0200H) are now handled server-side by Apps Script
// time triggers — see apps-script/Code.gs → setupAllTriggers().
// This means they fire reliably even when no one has the app open.
function setupSyn1AutoReports() { /* no-op — server-side now */ }

// ═══════════ SETTINGS TAB ════════════════════════════════════
function renderSettings() {
  const user = STATE.currentUser;
  const container = el('tab-settings');
  if (!user) {
    container.innerHTML = '<div class="alert alert-orange">Sign in first.</div>';
    return;
  }
  const gk = memberGroupKey(user);
  const sizePref = localStorage.getItem('tsv_size') || 'md';
  const themePref = localStorage.getItem('tsv_theme') || 'auto';
  const isSuperAdmin = user.id === CONFIG.superAdminId;
  const adminReqs = STATE.adminRequests || [];
  const pendingReqs = adminReqs.filter(r => r.status === 'pending');

  container.innerHTML = `
    <div class="section-title">⚙️ Settings</div>
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

    <!-- App Display (consolidated) -->
    <div class="settings-section">
      <div class="settings-section-header">📱 App Display</div>

      <div class="settings-row">
        <div class="sr-label">Text Size
          <div class="sr-value">Scales body text only — card sizes stay fixed</div>
        </div>
      </div>
      <div style="padding:0 16px 14px">
        <div class="size-chooser">
          <button class="${sizePref==='sm'?'active':''}" onclick="setSize('sm')">A-</button>
          <button class="${sizePref==='md'?'active':''}" onclick="setSize('md')">A</button>
          <button class="${sizePref==='lg'?'active':''}" onclick="setSize('lg')">A+</button>
        </div>
      </div>

      <div class="settings-row"><div class="sr-label">Theme</div></div>
      <div style="padding:0 16px 14px">
        <div class="theme-chooser">
          <button class="${themePref==='auto'?'active':''}" onclick="setTheme('auto')">🌓<br>Auto</button>
          <button class="${themePref==='light'?'active':''}" onclick="setTheme('light')">☀️<br>Light</button>
          <button class="${themePref==='dark'?'active':''}" onclick="setTheme('dark')">🌙<br>Dark</button>
        </div>
      </div>

      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="sr-label">GKS Watermark Opacity</div>
          <div id="bg-opacity-val" style="font-size:12px;font-weight:700;color:var(--blue-600);font-variant-numeric:tabular-nums">${Math.round((parseFloat(localStorage.getItem('tsv_bg_opacity')||'0.08'))*100)}%</div>
        </div>
        <input type="range" min="0" max="0.2" step="0.01" value="${localStorage.getItem('tsv_bg_opacity')||'0.08'}"
          oninput="setBgOpacity(this.value)" style="width:100%;accent-color:var(--blue-600)">
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="sr-label">Watermark Brightness</div>
          <div id="bg-brightness-val" style="font-size:12px;font-weight:700;color:var(--blue-600);font-variant-numeric:tabular-nums">${Math.round((parseFloat(localStorage.getItem('tsv_bg_brightness')||'1'))*100)}%</div>
        </div>
        <input type="range" min="0.3" max="1.8" step="0.05" value="${localStorage.getItem('tsv_bg_brightness')||'1'}"
          oninput="setBgBrightness(this.value)" style="width:100%;accent-color:var(--blue-600)">
      </div>

      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="sr-label">Header Height
            <div class="sr-value">Top bar height — smaller = more content visible</div>
          </div>
          <div id="lay-hdr-val" style="font-size:12px;font-weight:700;color:var(--blue-600);font-variant-numeric:tabular-nums">${parseInt(localStorage.getItem('tsv_lay_hdr')||'46')}px</div>
        </div>
        <input type="range" min="38" max="68" step="1" value="${localStorage.getItem('tsv_lay_hdr')||'46'}"
          oninput="setLayoutOffset('hdr', this.value)" style="width:100%;accent-color:var(--blue-600)">
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="sr-label">Nav Tab Height</div>
          <div id="lay-navh-val" style="font-size:12px;font-weight:700;color:var(--blue-600);font-variant-numeric:tabular-nums">${parseInt(localStorage.getItem('tsv_lay_navh')||'62')}px</div>
        </div>
        <input type="range" min="50" max="78" step="1" value="${localStorage.getItem('tsv_lay_navh')||'62'}"
          oninput="setLayoutOffset('navh', this.value)" style="width:100%;accent-color:var(--blue-600)">
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="sr-label">Extra Nav Gap
            <div class="sr-value">Extra space above home indicator</div>
          </div>
          <div id="lay-nav-val" style="font-size:12px;font-weight:700;color:var(--blue-600);font-variant-numeric:tabular-nums">${(localStorage.getItem('tsv_lay_nav') || '0')}px</div>
        </div>
        <input type="range" min="0" max="40" step="1" value="${localStorage.getItem('tsv_lay_nav')||'0'}"
          oninput="setLayoutOffset('nav', this.value)" style="width:100%;accent-color:var(--blue-600)">
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="sr-label">iOS Safe-Area
            <div class="sr-value">0% = nav flush to phone bottom · 100% = respects home indicator</div>
          </div>
          <div id="lay-safe-val" style="font-size:12px;font-weight:700;color:var(--blue-600);font-variant-numeric:tabular-nums">${Math.round((parseFloat(localStorage.getItem('tsv_lay_safe')||'0.2'))*100)}%</div>
        </div>
        <input type="range" min="0" max="1" step="0.05" value="${localStorage.getItem('tsv_lay_safe')||'0.2'}"
          oninput="setLayoutOffset('safe', this.value)" style="width:100%;accent-color:var(--blue-600)">
      </div>

      <div style="padding:8px 16px 8px;font-size:11px;color:var(--text-3);text-align:center">
        These preferences save to <b>your device only</b> — they don't affect anyone else.
      </div>
      <div style="padding:0 16px 14px">
        <button class="btn btn-outline btn-block btn-sm" onclick="resetLayout()">↺ Reset to defaults</button>
      </div>
    </div>

    <!-- Access -->
    <div class="settings-section">
      <div class="settings-section-header">🔐 Access</div>
      ${hasAdminRights() ? `
        <div class="settings-row">
          <div class="sr-label">You have Admin rights
            <div class="sr-value">You can see all syndicates, send reports, manage members</div>
          </div>
          <span style="font-size:22px">👑</span>
        </div>
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
          <div class="sr-label">View as…
            <div class="sr-value">Declutter the app by hiding admin-only controls</div>
          </div>
          <div class="theme-chooser">
            <button class="${localStorage.getItem('tsv_admin_view_as') !== 'non-admin' ? 'active' : ''}" onclick="setAdminView('admin')">👑<br>Full Admin</button>
            <button class="${localStorage.getItem('tsv_admin_view_as') === 'non-admin' ? 'active' : ''}" onclick="setAdminView('non-admin')">👤<br>Non-Admin</button>
          </div>
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

window.setAdminView = function(mode) {
  if (mode === 'non-admin') localStorage.setItem('tsv_admin_view_as', 'non-admin');
  else localStorage.removeItem('tsv_admin_view_as');
  // Update header admin-panel button visibility
  const btn = el('btn-admin');
  if (btn) btn.classList.toggle('hidden', !isAdmin());
  // Re-render current tab + settings
  if (STATE.currentTab === 'home')     renderHome();
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.currentTab === 'rooms')    renderRooms();
  if (STATE.currentTab === 'calendar') renderCalendar();
  renderSettings();
  toast(mode === 'non-admin' ? '👤 Viewing as non-admin' : '👑 Admin view restored');
};

window.setSize = function(s) {
  document.documentElement.classList.remove('size-sm','size-md','size-lg');
  document.documentElement.classList.add('size-' + s);
  localStorage.setItem('tsv_size', s);
  renderSettings();
};

window.setLayoutOffset = function(axis, val) {
  if (axis === 'safe') {
    const vf = parseFloat(val);
    localStorage.setItem('tsv_lay_safe', vf);
    document.documentElement.style.setProperty('--safe-factor', vf);
    const l = el('lay-safe-val'); if (l) l.textContent = Math.round(vf*100) + '%';
    return;
  }
  const v = parseInt(val);
  if (axis === 'hdr')  { localStorage.setItem('tsv_lay_hdr', v);  document.documentElement.style.setProperty('--header-h', v + 'px'); const l=el('lay-hdr-val'); if(l) l.textContent = v + 'px'; }
  if (axis === 'nav')  { localStorage.setItem('tsv_lay_nav', v);  document.documentElement.style.setProperty('--nav-pad-b', v + 'px'); const l=el('lay-nav-val'); if(l) l.textContent = v + 'px'; }
  if (axis === 'navh') { localStorage.setItem('tsv_lay_navh', v); document.documentElement.style.setProperty('--nav-h', v + 'px'); const l=el('lay-navh-val'); if(l) l.textContent = v + 'px'; }
};

window.resetLayout = function() {
  ['tsv_lay_hdr','tsv_lay_nav','tsv_lay_navh','tsv_lay_safe'].forEach(k => localStorage.removeItem(k));
  document.documentElement.style.removeProperty('--header-h');
  document.documentElement.style.removeProperty('--nav-pad-b');
  document.documentElement.style.removeProperty('--nav-h');
  document.documentElement.style.removeProperty('--safe-factor');
  renderSettings();
  toast('↺ Layout reset to default');
};

function applySavedLayout() {
  const h  = localStorage.getItem('tsv_lay_hdr');
  const n  = localStorage.getItem('tsv_lay_nav');
  const nh = localStorage.getItem('tsv_lay_navh');
  const sf = localStorage.getItem('tsv_lay_safe');
  // Default safe-factor = 0.2 (tight gap, matches typical native app compactness)
  document.documentElement.style.setProperty('--safe-factor', sf !== null ? sf : '0.2');
  if (h !== null)  document.documentElement.style.setProperty('--header-h', h + 'px');
  if (n !== null)  document.documentElement.style.setProperty('--nav-pad-b', n + 'px');
  if (nh !== null) document.documentElement.style.setProperty('--nav-h', nh + 'px');
}
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

// Background watermark: opacity + brightness, saved per-device
function applyBackgroundPrefs() {
  const op = localStorage.getItem('tsv_bg_opacity');
  const br = localStorage.getItem('tsv_bg_brightness');
  // Cap opacity to 0.2 so existing users who cranked it don't get punch-through
  const capped = op !== null ? Math.min(parseFloat(op), 0.2) : 0.06;
  document.documentElement.style.setProperty('--bg-opacity', String(capped));
  if (op !== null && parseFloat(op) > 0.2) localStorage.setItem('tsv_bg_opacity', '0.2');
  document.documentElement.style.setProperty('--bg-brightness', br !== null ? br : '1');
}
window.setBgOpacity = function(v) {
  localStorage.setItem('tsv_bg_opacity', v);
  document.documentElement.style.setProperty('--bg-opacity', v);
  const el2 = el('bg-opacity-val');
  if (el2) el2.textContent = Math.round(v * 100) + '%';
};
window.setBgBrightness = function(v) {
  localStorage.setItem('tsv_bg_brightness', v);
  document.documentElement.style.setProperty('--bg-brightness', v);
  const el2 = el('bg-brightness-val');
  if (el2) el2.textContent = Math.round(v * 100) + '%';
};

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

// ═══════════ PINNED ACTION BAR (one-handed quick actions) ═══
function renderPinnedActionBar() {
  const bar = el('nav-action-row');
  if (!bar) return;
  const user = STATE.currentUser;
  if (!user) {
    bar.classList.add('hidden');
    document.documentElement.style.setProperty('--action-h', '0px');
    return;
  }
  const st = getStatusOf(user.id);
  const isOut = st.status === 'out';
  const hasGPS = !!(st.lat && st.lng);

  const primary = isOut
    ? `<button class="pab-primary returning" onclick="returnToHotel()">🏨 Return to Hotel</button>`
    : `<button class="pab-primary leaving" onclick="showBuddyModal()">🚶 Leaving Hotel</button>`;

  const gps = hasGPS
    ? `<button class="pab-gps stop" onclick="stopTracking()" title="Stop Sharing GPS">🛑</button>`
    : `<button class="pab-gps share" onclick="shareGPS()" title="Share GPS">📡</button>`;

  bar.innerHTML = primary + gps;
  bar.classList.remove('hidden');
  // Action row is now inside nav (no separate fixed element).
  // Reserve 56px of extra main-content padding-bottom for the action row.
  document.documentElement.style.setProperty('--action-h', '56px');
}

// ═══════════ STOP TRACKING ═══════════════════════════════════
// Admin: force a member's status back to In Hotel (for those without wifi/forgot to update)
window.forceReturnMember = async function(memberId, shortName) {
  if (!isAdmin()) return toast('Admin only');
  if (!confirm(`Mark ${shortName} as Returned to Hotel?\n\nUse this when they don't have app access (no wifi, phone off, etc.)`)) return;
  const m = getMemberById(memberId);
  if (!m) return;
  const cur = getStatusOf(memberId);
  STATE.memberStatuses[memberId] = {
    ...cur,
    status: 'in_hotel',
    locationText: 'Hotel',
    buddyWith: '',
    lastUpdated: new Date().toISOString()
  };
  renderLocation();
  await API.post('updateStatus', {
    memberId: m.id, name: m.name, shortName: m.shortName,
    role: m.role, syndicate: m.syndicate,
    status: 'in_hotel', locationText: 'Hotel',
    lat: cur.lat || '', lng: cur.lng || '',
    buddyWith: '',
    roomNumber: cur.roomNumber || ''
  });
  toast(`✓ ${shortName} marked as In Hotel (admin override)`);
};

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
  renderPinnedActionBar();
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.map) updateMapMarkers();
};
