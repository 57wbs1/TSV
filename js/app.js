// ════════════════════════════════════════════════════════════
// TSV BKK PWA — Main Application
// ════════════════════════════════════════════════════════════

// App version + changelog. Bumped alongside SW cache. On first open
// after an update, the user sees a toast explaining what's new.
const APP_VERSION = 'v55';
const APP_CHANGELOG = [
  '📱 New: Install Guide (Settings → Install as App)',
  '🌤️ New: 0600H Bangkok weather briefing (announce chat)',
  '📡 Telegram routing: ops chat vs announce chat',
  '✨ Auto-GPS when leaving hotel',
  '👥 Syn ICs: one-tap "All back in"'
];

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
  reflections: [],
  // False until the first successful syncMembers() completes. Until then,
  // counts (90 from the seed) would mislead — so we show '…' instead of a
  // number on Home / Tracker to avoid the 90→88 flash.
  membersSynced: false
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
    const resp = await this._postRaw(action, data);
    if (!resp) return null;
    return resp.ok ? resp.data : null;
  },
  // Variant that surfaces the full server response so callers can read
  // json.error / json.description / json.data independently. Use when you
  // need to tell the user exactly why something failed.
  async postRaw(action, data) {
    return this._postRaw(action, data);
  },
  async _postRaw(action, data) {
    if (!this.configured) { STATE.apiState = 'unconfigured'; return null; }
    // Always include an `actor` (server gate requires it for mutations).
    const payload = { action, actor: (data && data.actor) || STATE.currentUser?.id || '', ...data };
    if (!payload.actor && STATE.currentUser?.id) payload.actor = STATE.currentUser.id;
    const domain = MUTATION_DOMAIN[action];
    if (domain) lockSync(domain);
    beginSaving(action);
    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain' }
      });
      // Track HTTP-level errors (GAS auth redirects, quota hits) separately
      // from JSON parse errors and network failures so callers can report
      // accurately instead of showing a misleading "offline?".
      if (!res.ok) {
        STATE.lastApiError = `HTTP ${res.status} ${res.statusText || ''}`.trim();
        console.warn('[API]', action, STATE.lastApiError);
      }
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); }
      catch (parseErr) {
        // Apps Script returned HTML (usually a Google login/auth page) — happens
        // when the deployment's access changes or the URL is slightly off.
        STATE.lastApiError = text.length > 0 && text.trim().startsWith('<')
          ? 'Apps Script returned HTML (auth/redirect — redeploy web app with "Anyone" access)'
          : 'Invalid JSON response: ' + parseErr.message;
        console.warn('[API]', action, STATE.lastApiError, text.slice(0, 200));
        return null;
      }
      STATE.apiState = 'online';
      STATE.offlineMode = false;
      STATE.lastApiError = null;
      if (!json.ok && json.error) console.warn('[API]', action, json.error);
      return json;
    } catch (e) {
      STATE.apiState = navigator.onLine ? 'error' : 'offline';
      STATE.offlineMode = true;
      STATE.lastApiError = e.message || 'network error';
      console.warn('[API]', action, 'fetch failed:', e.message);
      // Queue non-idempotent writes for retry when back online.
      if (QUEUEABLE_ACTIONS.has(action)) enqueueWrite(action, payload);
      return null;
    } finally {
      if (domain) unlockSync(domain);
      endSaving(action);
    }
  }
};

// Type-coercion guards — Google Sheets auto-converts numeric-looking strings
// to numbers on write. These helpers force them back to predictable JS types.
function cStr(v, fallback = '') { return v == null || v === '' ? fallback : String(v); }
function cNum(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function cBool(v) { return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1'; }

// Actions we'll retry later if the POST fails. Reads + idempotent operations
// are excluded. Excluded also: sendPing, sendTelegram (time-sensitive, stale
// retry is worse than drop).
const QUEUEABLE_ACTIONS = new Set([
  'updateStatus', 'addLearning', 'addReflection', 'addIncident',
  'postHotwash', 'updateMember'
]);
const QUEUE_KEY = 'tsv_offline_queue_v1';

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} }
function enqueueWrite(action, payload) {
  const q = loadQueue();
  q.push({ action, payload, ts: Date.now(), tries: 0 });
  saveQueue(q);
  updateQueueIndicator();
}
async function flushQueue() {
  if (!navigator.onLine) return;
  let q = loadQueue();
  if (!q.length) return;
  const keep = [];
  for (const entry of q) {
    if (!API.configured) { keep.push(entry); continue; }
    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(entry.payload)
      });
      const json = await res.json();
      if (!json.ok) {
        entry.tries = (entry.tries || 0) + 1;
        if (entry.tries < 5) keep.push(entry);  // drop after 5 failed tries
      }
    } catch {
      entry.tries = (entry.tries || 0) + 1;
      if (entry.tries < 5) keep.push(entry);
    }
  }
  saveQueue(keep);
  updateQueueIndicator();
  if (keep.length === 0 && q.length > 0) toast(`✓ Synced ${q.length} pending changes`);
}
function updateQueueIndicator() {
  const n = loadQueue().length;
  const el0 = el('queue-indicator');
  if (!el0) return;
  if (n === 0) { el0.classList.add('hidden'); return; }
  el0.classList.remove('hidden');
  el0.textContent = `⏳ ${n} pending`;
}

// Centre-screen sync HUD helpers. Wrap any user-initiated async action
// with withLoader('label', () => …) to show a blocking spinner + message
// while the promise is in flight. Counter-based so nested calls don't
// hide the overlay prematurely.
let _syncOverlayCount = 0;
function showSyncOverlay(label = 'Syncing…') {
  _syncOverlayCount++;
  const o = el('sync-overlay');
  if (!o) return;
  const lbl = o.querySelector('.so-label');
  if (lbl) lbl.textContent = label;
  o.classList.remove('hidden');
  o.setAttribute('aria-hidden', 'false');
}
function hideSyncOverlay() {
  _syncOverlayCount = Math.max(0, _syncOverlayCount - 1);
  if (_syncOverlayCount === 0) {
    const o = el('sync-overlay');
    if (o) { o.classList.add('hidden'); o.setAttribute('aria-hidden', 'true'); }
  }
}
async function withLoader(label, fn) {
  showSyncOverlay(label);
  try { return await fn(); }
  finally { hideSyncOverlay(); }
}

// Saving indicator — shows a floating chip while any mutation is in flight.
let _savingCount = 0;
function beginSaving() {
  _savingCount++;
  const chip = el('saving-chip');
  if (chip) chip.classList.remove('hidden');
}
function endSaving() {
  _savingCount = Math.max(0, _savingCount - 1);
  if (_savingCount === 0) {
    const chip = el('saving-chip');
    if (chip) chip.classList.add('hidden');
  }
}
window.addEventListener('online', () => { flushQueue(); });

// Show a one-time changelog toast after an app update. Compares against
// the version last acknowledged in localStorage.
function maybeShowChangelog() {
  const seen = localStorage.getItem('tsv_version_seen');
  if (seen === APP_VERSION) return;
  localStorage.setItem('tsv_version_seen', APP_VERSION);
  if (!seen) return;  // first-ever open — don't spam welcome
  setTimeout(() => {
    const card = document.createElement('div');
    card.className = 'changelog-card';
    card.innerHTML = `
      <div class="changelog-header">
        <span>⬆️ Updated to ${APP_VERSION}</span>
        <button class="changelog-close" onclick="this.closest('.changelog-card').remove()">✕</button>
      </div>
      <ul class="changelog-list">${APP_CHANGELOG.map(l => `<li>${l}</li>`).join('')}</ul>
    `;
    document.body.appendChild(card);
    setTimeout(() => card.remove(), 9000);
  }, 1200);
}
setInterval(() => { if (navigator.onLine) flushQueue(); }, 45 * 1000);

// Which sync domain each mutating action touches. Used by API.post to auto-
// lock the matching sync() so it can't run during the mutation.
const MUTATION_DOMAIN = {
  updateStatus:     'statuses',
  addLearning:      'learnings',
  addReflection:    'reflections',
  addMember:        'members',
  updateMember:     'members',
  deleteMember:     'members',
  seedMembers:      'members'
};

// Auto-refresh the home banner when connectivity changes
window.addEventListener('online',  () => { if (STATE.currentTab === 'home') renderHome(); syncStatuses(); });
window.addEventListener('offline', () => { STATE.apiState = 'offline'; if (STATE.currentTab === 'home') renderHome(); });

// ═══════════ TELEGRAM ════════════════════════════════════════
// The bot token is no longer in the client — we relay through Apps Script
// so the token stays server-side. See sendTelegramFromServer() in Code.gs.
const TELEGRAM = {
  async send(text, chatId, parseMode) {
    const cid = chatId || CONFIG.telegram.chatId;
    if (!cid || String(cid).startsWith('YOUR_')) {
      toast('⚠️ Telegram chat not configured');
      return false;
    }
    const user = STATE.currentUser;
    const resp = await API.post('sendTelegram', {
      chatId: String(cid),
      text,
      parseMode: parseMode || 'HTML',
      actor: user?.id || 'system'
    });
    // Surface the actual failure reason so users know why a send didn't land.
    // resp is null on network failure, an object otherwise.
    if (!resp) {
      toast('❌ No response from server (offline?)');
      console.error('[telegram] no response for chat', cid);
      return false;
    }
    if (resp.ok === false) {
      const desc = resp.description || resp.error || 'unknown error';
      toast('❌ Telegram: ' + desc);
      console.error('[telegram] rejected', cid, resp);
      return false;
    }
    return true;
  },

  // Send by routing key (respects enable/disable + chat ID override configured
  // in Settings → Admin-Tele). Falls back to CONFIG defaults only if the server
  // config failed to load. If the key is disabled, returns false and toasts.
  async sendRouted(routingKey, text, parseMode) {
    const cfg = (STATE.telegramConfig || {})[routingKey];
    if (cfg && cfg.enabled === false) {
      toast(`⏸ ${routingKey} disabled in settings — not sent`);
      console.warn('[telegram] routing disabled:', routingKey);
      return false;
    }
    // Prefer the configured chatId; fall back to a reasonable CONFIG default
    // so the app still works offline / before first config load.
    const FALLBACK = {
      A1_weather:      CONFIG.telegram.announceChatId || CONFIG.telegram.chatId,
      A2_reminder:     CONFIG.telegram.announceChatId || CONFIG.telegram.chatId,
      A3_evening:      CONFIG.telegram.opsChatId      || CONFIG.telegram.chatId,
      A4_midnight:     CONFIG.telegram.opsChatId      || CONFIG.telegram.chatId,
      M1_ir:           CONFIG.telegram.irChatId       || CONFIG.telegram.opsChatId,
      M2_bus_boarding: CONFIG.telegram.opsChatId      || CONFIG.telegram.chatId,
      M3_bus_pushing:  CONFIG.telegram.opsChatId      || CONFIG.telegram.chatId,
      M4_flight_board: CONFIG.telegram.opsChatId      || CONFIG.telegram.chatId,
      M5_sitrep:       CONFIG.telegram.opsChatId      || CONFIG.telegram.chatId,
      M6_all_back_in:  CONFIG.telegram.syn1ChatId     || CONFIG.telegram.opsChatId
    };
    const chatId = cfg?.chatId || FALLBACK[routingKey] || CONFIG.telegram.chatId;
    return this.send(text, chatId, parseMode);
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
  // Open-Meteo source link — opens their Bangkok forecast page
  const src = 'https://open-meteo.com/en/docs?latitude=13.7256&longitude=100.5279&hourly=temperature_2m';
  const srcUrl = `https://www.google.com/search?q=bangkok+weather`;
  if (!d) return `<a id="home-weather" class="weather-strip loading" href="${srcUrl}" target="_blank" rel="noopener"><span class="w-label">BKK Weather</span><span class="w-icon">🌤️</span><span class="w-temp">—°</span><span class="w-range">Loading…</span></a>`;
  // Bangkok US-AQI (equivalent to PSI scale). Flag Orange (>100) with 😷.
  let aqiBadge = '';
  if (d.psi != null) {
    const v = d.psi;
    const emoji = v <= 50 ? '🟢' : v <= 100 ? '🟡' : v <= 150 ? '🟠' : v <= 200 ? '🟠' : v <= 300 ? '🔴' : '🟣';
    const warn  = v > 100 ? ' 😷' : '';
    aqiBadge = `<span class="w-psi" style="${v > 100 ? 'background:#fef3c7;color:#92400e;font-weight:800' : ''}">${emoji} <b>BKK AQI</b> ${v}${warn}</span>`;
  }
  return `<a id="home-weather" class="weather-strip" href="${srcUrl}" target="_blank" rel="noopener" title="Tap for full forecast">
    <span class="w-label">BKK Weather</span>
    <span class="w-icon">${weatherIcon(d.code)}</span>
    <span class="w-temp">${d.temp}°</span>
    <span class="w-range"><span class="w-hl">H</span> ${d.high}° · <span class="w-hl">L</span> ${d.low}°</span>
    ${aqiBadge}
    <span class="w-cond">${weatherLabel(d.code)}</span>
    <span class="w-ext">↗</span>
  </a>`;
}

// ── SGD → THB rate card ─────────────────────────────────────
async function fetchFxRate() {
  const cached = (() => { try { return JSON.parse(localStorage.getItem('tsv_fx') || 'null'); } catch { return null; } })();
  if (cached && (Date.now() - cached.ts) < 60*60*1000) return cached.data;   // 1h cache
  try {
    // Free FX source, no key required, CORS-enabled
    const j = await fetch('https://open.er-api.com/v6/latest/SGD').then(r => r.json()).catch(() => null);
    const rate = j?.rates?.THB;
    if (!rate) return null;
    const data = { rate, ts: Date.now() };
    localStorage.setItem('tsv_fx', JSON.stringify({ ts: Date.now(), data }));
    return data;
  } catch { return null; }
}
async function refreshFx() {
  const d = await fetchFxRate();
  if (!d) return;
  STATE.fx = d;
  const el2 = el('home-fx');
  if (el2) el2.outerHTML = renderFxCard();
}
function renderFxCard() {
  const d = STATE.fx;
  const srcUrl = 'https://www.google.com/search?q=SGD+to+THB';
  if (!d) return `<a id="home-fx" class="fx-card loading" href="${srcUrl}" target="_blank" rel="noopener"><span class="fx-label">SGD → THB</span><span class="fx-rate">—</span><span class="fx-ext">↗</span></a>`;
  const when = new Date(d.ts).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Bangkok' });
  return `<a id="home-fx" class="fx-card" href="${srcUrl}" target="_blank" rel="noopener" title="Tap for live rate">
    <span class="fx-label">SGD → THB</span>
    <span class="fx-pair"><b>S$1</b> = <b>฿${d.rate.toFixed(2)}</b></span>
    <span class="fx-sub">Updated ${when} · tap for live</span>
    <span class="fx-ext">↗</span>
  </a>`;
}
function formatBKKTime(d = bkkNow()) { return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false }); }

// Hero time block — BKK (K suffix, dominant) + SG (H suffix, secondary).
// Uses a fresh Date each call and lets the runtime handle the timezone —
// the old bkkNow() trick was producing a UTC-anchored Date that then
// re-shifted under the browser's own locale, causing the 14:31 bug.
function formatHeroTimes() {
  const now = new Date();
  const fmt = tz => now.toLocaleTimeString('en-GB', {
    hour:'2-digit', minute:'2-digit', second:'2-digit',
    hour12:false, timeZone: tz
  });
  return { bkk: fmt('Asia/Bangkok'), sg: fmt('Asia/Singapore') };
}
function renderHeroTimeBlock() {
  const t = formatHeroTimes();
  return `
    <div class="hero-time" id="live-time">
      <div class="ht-primary">
        <span class="ht-city">BKK</span>
        <span class="ht-val ht-val-main">${t.bkk} K</span>
      </div>
      <div class="ht-secondary">
        <span class="ht-city-sg">SG</span>
        <span class="ht-val-sg">${t.sg} H</span>
      </div>
    </div>`;
}
// Today in DDD DD MM format: e.g. "SUN 26 APR" (always rendered in BKK tz)
function formatTodayShort() {
  return new Date().toLocaleDateString('en-GB', {
    weekday:'short', day:'2-digit', month:'short', timeZone:'Asia/Bangkok'
  }).toUpperCase().replace(/,/g, '');
}

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

// Filter buddyWith string to only include people who are still OUT.
// buddyWith stores shortName (or name) as comma-separated string.
// If Caspar goes back IN, his name disappears from everyone else's buddy display.
function filterActiveBuddies(buddyWithStr) {
  if (!buddyWithStr) return '';
  return buddyWithStr.split(',').map(s => s.trim()).filter(name => {
    if (!name) return false;
    const m = MEMBERS.find(m => (m.shortName || m.name) === name || m.name === name);
    if (!m) return true; // unknown → keep (don't silently drop)
    return getStatusOf(m.id).status === 'out';
  }).join(', ');
}

// Role label: return role text only if it's meaningful (not the generic "Member").
// "Syn IC", "SL", "Dy SL", "HoD", "PDS", "Admin", etc. are kept.
function meaningfulRole(m) {
  const r = (m.role || '').trim();
  if (!r || r === 'Member') return '';
  return r;
}
function inCount() { return MEMBERS.filter(m => getStatusOf(m.id).status !== 'out').length; }
function outCount() { return MEMBERS.filter(m => getStatusOf(m.id).status === 'out').length; }
// Scoped-to-user helpers: non-admins see their own syndicate counts only.
// Admin / PSO / Staff see the whole cohort.
function scopedMembers() {
  if (canSeeAllSyndicates()) return MEMBERS;
  const vis = visibleGroups();
  return MEMBERS.filter(m => vis.includes(memberGroupKey(m)));
}
function inCountScoped()  { return scopedMembers().filter(m => getStatusOf(m.id).status !== 'out').length; }
function outCountScoped() { return scopedMembers().filter(m => getStatusOf(m.id).status === 'out').length; }
// Display helpers that return '…' until the first server sync completes,
// so we don't flash the seed count before the real one arrives.
function inCountDisplay()    { return STATE.membersSynced ? inCountScoped() : '…'; }
function outCountDisplay()   { return STATE.membersSynced ? outCountScoped() : '…'; }
function totalCountDisplay() { return STATE.membersSynced ? scopedMembers().length : '…'; }
function synColor(g) { return groupColorFor(g); }
function groupOrder() { return computeGroupOrder(); }
function membersInGroup(g) {
  const list = MEMBERS.filter(m => memberGroupKey(m) === g);
  return (typeof sortMembersInGroup === 'function') ? sortMembersInGroup(list, g) : list;
}
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
// Syn IC / SL / Dy SL / Admin can send SITREPs. Regular members can't.
function canSendSitrep() {
  const u = STATE.currentUser;
  if (!u) return false;
  if (isAdmin()) return true;
  const r = (u.role || '').toLowerCase();
  return /\bsyn ic\b|\bsl\b|\bdy sl\b|\bdysl\b/.test(r);
}

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
  // Re-look up the member's PIN from the live MEMBERS array at the moment
  // the user finishes entering their digits. syncMembers() may have completed
  // (and loaded the server's custom PIN) AFTER the user tapped their name —
  // using the stale loginCandidateMember.pin would give '0000' in that window.
  const fresh = loginCandidateMember
    ? MEMBERS.find(m => m.id === loginCandidateMember.id)
    : null;
  const expectedPin = (fresh || loginCandidateMember)?.pin || CONFIG.defaultPin || '0000';
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
// Legacy tab ids redirect to the new nested structure:
//   'learnings' → calendar tab, Visits sub-tab
//   'rooms'     → tracker (location) tab, Rooms sub-tab
const TAB_REDIRECTS = {
  learnings: () => { STATE.calendarSubTab = 'visits';  return 'calendar'; },
  rooms:     () => { STATE.trackerView    = 'rooms';   return 'location'; },
  ir:        () => { STATE.sopSubTab      = 'ir';      return 'sop';      }
};

function switchTab(tabId) {
  if (TAB_REDIRECTS[tabId]) tabId = TAB_REDIRECTS[tabId]();

  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  el(`tab-${tabId}`)?.classList.add('active');
  el(`nav-${tabId}`)?.classList.add('active');
  STATE.currentTab = tabId;

  if (tabId === 'home')      renderHome();
  if (tabId === 'calendar')  { renderCalendar(); if (STATE.calendarSubTab === 'visits') syncLearnings(); }
  if (tabId === 'location')  renderLocation();
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
  // Return to the current login flow (Syndicate → Name → PIN), not the legacy
  // identity-modal which no longer exists / has stale state.
  showLoginFlow();
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

// Mutation-in-flight counters per data domain. A sync refuses to run while
// a matching mutation is in flight to stop the server's pre-update response
// from overwriting local state. Count-based so overlapping mutations (e.g.
// two GPS pings in a row) don't release the lock early.
const _syncLocks = { members: 0, statuses: 0, learnings: 0, reflections: 0 };
function lockSync(domain)    { _syncLocks[domain] = (_syncLocks[domain] || 0) + 1; }
function unlockSync(domain)  { _syncLocks[domain] = Math.max(0, (_syncLocks[domain] || 0) - 1); }
function isSyncLocked(domain){ return (_syncLocks[domain] || 0) > 0; }
// Wrap a mutating promise so sync can't race it. Callers reset their own
// hash var afterwards if they need a forced re-seed.
async function mutateWithLock(domain, fn) {
  lockSync(domain);
  try { return await fn(); }
  finally { unlockSync(domain); }
}

async function syncMembers() {
  // Skip sync while any member mutation is in flight — the server's
  // pre-update response would overwrite fresh local state (PIN change,
  // edit, add, delete, seed).
  if (isSyncLocked('members')) return;
  const data = await API.get('getMembers');
  if (!data || !Array.isArray(data) || data.length === 0) return;
  const hash = JSON.stringify(data);
  if (hash === _lastMembersHash) return;
  _lastMembersHash = hash;

  MEMBERS = data.map(row => ({
    id: cStr(row.id),
    name: cStr(row.name),
    shortName: cStr(row.shortName, cStr(row.name)),
    rank: cStr(row.rank),
    role: cStr(row.role, 'Member'),
    csc: cStr(row.csc),
    syndicate: cStr(row.syndicate),
    // Sheets coerces '0000' → 0 and '1234' → 1234 — always force back to
    // a 4-digit zero-padded string so PIN comparison (string) works.
    pin: cStr(row.pin, '0000').padStart(4, '0'),
    isAdmin: cBool(row.isAdmin)
  }));
  STATE.membersSynced = true;
  if (STATE.currentUser) {
    const me = MEMBERS.find(m => m.id === STATE.currentUser.id);
    if (me) {
      // PIN protection: if the local device set a new PIN recently
      // (within 5 minutes), don't let the server response overwrite it.
      // Handles races where a kill-switch reload / SW update triggers
      // a sync before the server has fully committed the PIN write.
      const pinLockUntil = parseInt(localStorage.getItem('tsv_pin_lock_until') || '0');
      const pinLocked = Date.now() < pinLockUntil;
      const preservedPin = pinLocked ? STATE.currentUser.pin : null;
      STATE.currentUser = { ...STATE.currentUser, ...me };
      if (preservedPin) STATE.currentUser.pin = preservedPin;
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
  if (isSyncLocked('statuses')) return;
  const data = await API.get('getStatuses');
  if (!data) return;
  const map = {};
  data.forEach(r => {
    if (r.id) map[cStr(r.id)] = {
      status: cStr(r.status, 'in_hotel'),
      locationText: cStr(r.locationText),
      lat: cNum(r.lat),
      lng: cNum(r.lng),
      buddyWith: cStr(r.buddyWith),
      roomNumber: cStr(r.roomNumber),
      lastUpdated: cStr(r.lastUpdated)
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
  if (isSyncLocked('learnings')) return;
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
  if (isSyncLocked('reflections')) return;
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
    id: cStr(r.id),
    day: parseInt(r.day) || 1,
    startTime: cStr(r.startTime),
    endTime: cStr(r.endTime),
    title: cStr(r.title),
    location: cStr(r.location),
    category: cStr(r.category),
    attire: cStr(r.attire),
    visitId: cStr(r.visitId),
    remarks: cStr(r.remarks),
    oics: r.oics ? (typeof r.oics === 'string' ? safeJson(r.oics) : r.oics) : {},
    isDeleted: cBool(r.isDeleted)
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

  // Live status polling — only when the user is looking at a tab whose
  // UI depends on other members' statuses (Home parade state, Tracker
  // counts, Rooms, Map). Skipped when tab is hidden (visibilitychange
  // still fires a fresh sync on return). 60s keeps the load reasonable
  // for 50 users × 1 read/min on the Sheet.
  STATE._timers.statusPoll = setInterval(() => {
    if (document.hidden) return;
    if (!['home', 'location', 'rooms', 'map'].includes(STATE.currentTab)) return;
    syncStatuses();
  }, 60 * 1000);

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
    // Don't trigger PTR while a modal is open OR the user is typing in a
    // textarea/input — accidental refresh wipes in-progress compose.
    if (anyModalOpen()) { pulling = false; return; }
    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') { pulling = false; return; }
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
      // Hide the small PTR pill immediately — the big centre HUD takes
      // over as the 'refresh in progress' indicator (bigger, clearer,
      // impossible to miss).
      resetIndicator();
      try {
        await withLoader('Refreshing…', async () => {
          // Fire GCal sync in the background — don't block the main refresh.
          // When it completes it triggers a second syncCalendar() pass so
          // any Google Calendar edits (drag-to-reschedule etc) land within
          // a few seconds without holding up the rest of the UI update.
          API.get('syncFromGoogleCalendar').then(() => syncCalendar()).catch(() => {});
          await Promise.all([
            syncMembers(),
            syncStatuses(),
            syncCalendar(),
            syncLearnings(),
            syncReflections()
          ]);
        });
      } catch {}
      toast('✓ Refreshed');
      refreshing = false;
    } else {
      resetIndicator();
    }
  }, { passive: true });
}

// ═══════════ HOME TAB ════════════════════════════════════════
function renderHome() {
  const trip = getTripStatus();
  const bkk = bkkNow();
  const inC = inCountDisplay(), outC = outCountDisplay(), total = totalCountDisplay();
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
          <div class="hero-date">${formatTodayShort(bkk)}</div>
          ${renderHeroTimeBlock(bkk)}
        </div>
      </div>`;
  } else if (trip.phase === 'after') {
    heroHtml = `
      <div class="home-hero" style="background:linear-gradient(135deg, #1C2D4E, #334155)">
        <div class="hero-content">
          <span class="hero-day-label">● Trip Complete</span>
          <div class="hero-theme">✈️ Safe journey home</div>
          <div class="hero-date">${formatTodayShort(bkk)}</div>
          ${renderHeroTimeBlock(bkk)}
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
          <div class="hero-date">${formatTodayShort(bkk)}</div>
          ${renderHeroTimeBlock(bkk)}
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
    ${renderFxCard()}
    ${heroHtml}

    ${canSendSitrep() ? `
    <button class="btn-adhoc-inline" onclick="showAdhocPicker()">📤 Send Adhoc SITREP</button>` : ''}

    <div class="parade-grid two">
      <div class="parade-card in" onclick="showInList()"><div class="big-num green">${inC}</div><div class="label">In Hotel</div><div class="pc-hint">Tap for list</div></div>
      <div class="parade-card out" onclick="showOutList()"><div class="big-num ${outC>0?'red':'green'}">${outC}</div><div class="label">Out</div><div class="pc-hint">Tap for list</div></div>
    </div>

    ${nextEventHtml}

    ${myGroup ? renderMySyndicateMini(myGroup) : ''}

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
    if (!e) return;
    const t = formatHeroTimes();
    const bkkVal = e.querySelector('.ht-val-main');
    const sgVal  = e.querySelector('.ht-val-sg');
    if (bkkVal) bkkVal.textContent = t.bkk + ' K';
    if (sgVal)  sgVal.textContent  = t.sg  + ' H';
  }, 1000);
}

// Read-only mini view of MY syndicate on Home. Shows each member with a
// coloured dot — green = In, red = Out — plus their short location if OUT.
// Clicking doesn't do anything; this is intentionally not editable. For
// editing → use Tracker tab.
function renderMySyndicateMini(groupKey) {
  const members = membersInGroup(groupKey);
  if (!members.length) return '';
  const st = STATE.memberStatuses;
  const inCount = members.filter(m => (st[m.id]?.status || 'in_hotel') !== 'out').length;
  const rows = members.map(m => {
    const s = st[m.id] || {};
    const isOut = s.status === 'out';
    const loc = isOut ? (s.locationText || 'Out') : 'Hotel';
    return `
      <div class="mini-row">
        <span class="mini-dot ${isOut ? 'out' : 'in'}"></span>
        <span class="mini-name">${escapeHtml(m.shortName || m.name)}</span>
        <span class="mini-loc ${isOut ? 'out' : ''}">${escapeHtml(loc)}</span>
      </div>`;
  }).join('');
  const color = synColor(groupKey);
  return `
    <div class="syn-mini-card">
      <div class="syn-mini-header" style="background:${color}">
        <span class="syn-mini-title">${formatGroupDisplay(groupKey)}</span>
        <span class="syn-mini-count">${inCount}/${members.length} In</span>
      </div>
      <div class="syn-mini-body">${rows}</div>
    </div>`;
}

// Home: tap the In Hotel / Out card to see the list with locations.
// Scope respects visibleGroups() — non-admins see their own syndicate.
window.showInList  = function() { _showPresenceList('in');  };
window.showOutList = function() { _showPresenceList('out'); };
function _showPresenceList(mode) {
  const vis = visibleGroups();
  const inScope = MEMBERS.filter(m => vis.includes(memberGroupKey(m)));
  const st = STATE.memberStatuses;
  const list = mode === 'out'
    ? inScope.filter(m => st[m.id]?.status === 'out')
    : inScope.filter(m => (st[m.id]?.status || 'in_hotel') !== 'out');

  const title = mode === 'out' ? '🔴 Out of Hotel' : '🟢 In Hotel';
  const empty = mode === 'out'
    ? '✅ Everyone accounted for.'
    : 'Nobody signed in as In Hotel yet.';

  const body = !list.length
    ? `<div class="pl-empty">${empty}</div>`
    : `<div class="pl-list">${list.map(m => {
        const s = st[m.id] || {};
        const loc = mode === 'out'
          ? (s.locationText ? escapeHtml(s.locationText) : 'location unknown')
          : 'Hotel';
        const activeBuds = filterActiveBuddies(s.buddyWith);
        const buddy = activeBuds ? `<div class="pl-buddy">👥 w/ ${escapeHtml(activeBuds)}</div>` : '';
        const plRole = meaningfulRole(m);
        return `
          <div class="pl-row">
            <span class="pl-dot ${mode==='out'?'out':'in'}"></span>
            <div class="pl-info">
              <div class="pl-name">${escapeHtml(m.shortName || m.name)}${plRole ? ` <span class="pl-role-tag">${escapeHtml(plRole)}</span>` : ''}</div>
              <div class="pl-meta">📍 ${loc}</div>
              ${buddy}
            </div>
          </div>`;
      }).join('')}</div>`;

  const wrap = document.createElement('div');
  wrap.className = 'presence-overlay';
  wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  wrap.innerHTML = `
    <div class="presence-sheet">
      <div class="presence-header">
        <h2>${title} <span class="pl-count">${list.length}</span></h2>
        <button class="close-btn" onclick="this.closest('.presence-overlay').remove()">✕</button>
      </div>
      <div class="presence-body">${body}</div>
    </div>`;
  document.body.appendChild(wrap);
}

// ═══════════ ADHOC SITREP PICKER ═════════════════════════════
window.showAdhocPicker = function() {
  const canAll = canSeeAllSyndicates();
  const allowed = (canAll ? groupOrder() : visibleGroups())
    .filter(g => g !== 'Leadership');
  const opts = allowed.map(g => ({ key: g, label: formatGroupDisplay(g), count: membersInGroup(g).length }));

  if (opts.length === 1) {
    const only = opts[0];
    if (confirm(`Send Adhoc SITREP for ${only.label}?`)) {
      sendSyndicateSITREP(only.key);
    }
    return;
  }

  // Multi-select rows — user can tap multiple syndicates and then hit
  // 'Send selected'. Keeps the mass-send shortcut available too.
  STATE._adhocSelected = new Set();
  const rows = opts.map(o => `
    <button class="adhoc-row adhoc-multi" data-key="${escapeHtml(o.key)}" onclick="toggleAdhocPick(this)">
      <span class="ah-check">☐</span>
      <span class="ah-label">${escapeHtml(o.label)}</span>
      <span class="ah-count">${o.count} ${o.count === 1 ? 'member' : 'members'}</span>
    </button>`).join('');

  const wrap = document.createElement('div');
  wrap.id = 'adhoc-picker';
  wrap.className = 'adhoc-picker';
  wrap.innerHTML = `
    <div class="adhoc-sheet">
      <h3>📤 Send Adhoc SITREP</h3>
      <p class="ah-sub">Tap each syndicate to include. Send when ready.</p>
      ${rows}
      <div class="adhoc-actions">
        <button class="adhoc-cancel" onclick="closeAdhocPicker()">Cancel</button>
        <button id="adhoc-send-btn" class="adhoc-send" onclick="sendAdhocSelected()" disabled>Send selected (0)</button>
      </div>
      ${canAll ? `<button class="adhoc-row mass" onclick="sendAllSITREPs(); closeAdhocPicker()">
        📣 Mass send — all syndicates
      </button>` : ''}
    </div>`;
  document.body.appendChild(wrap);
};

window.toggleAdhocPick = function(btn) {
  const key = btn.dataset.key;
  if (!STATE._adhocSelected) STATE._adhocSelected = new Set();
  const check = btn.querySelector('.ah-check');
  if (STATE._adhocSelected.has(key)) {
    STATE._adhocSelected.delete(key);
    btn.classList.remove('picked');
    if (check) check.textContent = '☐';
  } else {
    STATE._adhocSelected.add(key);
    btn.classList.add('picked');
    if (check) check.textContent = '☑';
  }
  const sendBtn = el('adhoc-send-btn');
  if (sendBtn) {
    const n = STATE._adhocSelected.size;
    sendBtn.disabled = n === 0;
    sendBtn.textContent = `Send selected (${n})`;
  }
};

window.sendAdhocSelected = async function() {
  const picks = [...(STATE._adhocSelected || [])];
  if (!picks.length) return;
  closeAdhocPicker();
  await withLoader(`Sending ${picks.length} SITREP${picks.length > 1 ? 's' : ''}…`, async () => {
    for (const gk of picks) {
      await sendSyndicateSITREP(gk, true);   // auto=true skips confirm
    }
  });
  toast(`✅ Sent ${picks.length} SITREP${picks.length > 1 ? 's' : ''}`);
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
  // Calendar now hosts three sub-tabs: the schedule (default), Visits, Reflections.
  const sub = STATE.calendarSubTab || 'schedule';
  if (sub !== 'schedule') {
    // Delegate to the Learn-style renderers and inject at the top of tab-calendar.
    const container = el('tab-calendar');
    if (!container) return;
    container.innerHTML = `
      <div class="subtab-row" id="calendar-subtabs">
        <button class="subtab-btn" onclick="setCalendarSubTab('schedule')">📅 Calendar</button>
        <button class="subtab-btn ${sub === 'transport'   ? 'active' : ''}" onclick="setCalendarSubTab('transport')">🚌 Transport</button>
        <button class="subtab-btn ${sub === 'reflections' ? 'active' : ''}" onclick="setCalendarSubTab('reflections')">📝 Reflections</button>
        <button class="subtab-btn ${sub === 'visits'      ? 'active' : ''}" onclick="setCalendarSubTab('visits')">💡 Visits</button>
      </div>
      <div id="calendar-sub-content"></div>
    `;
    const body = el('calendar-sub-content');
    if (!body) return;
    if (sub === 'visits')      { body.innerHTML = renderVisitsSubTab(); }
    else if (sub === 'reflections') { body.innerHTML = renderReflectionsSubTab(); syncReflections(); }
    else if (sub === 'transport')   { renderTransportSubTab(body); }
    return;
  }

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
          ${hasVisit ? `<h5>💡 Learning Visit</h5><p><a href="#" onclick="event.preventDefault(); setCalendarSubTab('visits'); openVisitDetail('${ev.visitId}')" style="color:var(--blue-600);font-weight:700">${escapeHtml(getVisitById(ev.visitId).title)} →</a></p>` : ''}
          <div class="cee-actions">
            ${attn ? `<button class="btn-attendance" onclick="event.stopPropagation(); showAttendancePicker('${ev.id}')">📋 Send Attendance</button>` : ''}
            ${isAdmin() ? `<button class="btn-cee-edit" onclick="event.stopPropagation(); openEventEditor('${ev.id}')">✏️ Edit</button>` : ''}
            <button class="btn-cee-close" onclick="event.stopPropagation(); toggleEventExpand(null)">✕ Close</button>
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
    <div class="subtab-row" id="calendar-subtabs">
      <button class="subtab-btn active" onclick="setCalendarSubTab('schedule')">📅 Calendar</button>
      <button class="subtab-btn" onclick="setCalendarSubTab('transport')">🚌 Transport</button>
      <button class="subtab-btn" onclick="setCalendarSubTab('reflections')">📝 Reflections</button>
      <button class="subtab-btn" onclick="setCalendarSubTab('visits')">💡 Visits</button>
    </div>
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
window.setCalendarSubTab = function(sub) {
  STATE.calendarSubTab = sub;
  renderCalendar();
  if (sub === 'visits')      syncLearnings();
  if (sub === 'reflections') syncReflections();
};

// Swipe between Tracker sub-views (List ↔ Map)
// Generic horizontal-swipe helper. Attaches once to a container and calls
// onSwipe(dir) with dir = +1 (left-swipe → next) or -1 (right-swipe → prev).
// Ignores swipes that started on interactive elements (buttons, inputs,
// dropdowns, map canvas) so they don't hijack normal taps.
function attachHSwipe(container, onSwipe) {
  if (!container) return;
  let sx = 0, sy = 0, tracking = false, blocked = false;
  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { tracking = false; return; }
    const t = e.target;
    // Skip if the touch started on something that needs its own horizontal
    // gesture (map, select, dropdown, text input, slider)
    if (t.closest('#leaflet-map, .leaflet-container, select, input, textarea, .map-filter-dd, .map-filter-menu')) {
      blocked = true;
      return;
    }
    blocked = false;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  container.addEventListener('touchend', e => {
    if (!tracking || blocked) { tracking = false; blocked = false; return; }
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    // Min horizontal distance + dominantly horizontal
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    onSwipe(dx < 0 ? +1 : -1);
  }, { passive: true });
}

// Tracker sub-tabs: List ↔ Map ↔ Rooms (Calendar day-nav uses a separate
// swipe handler on the day-tabs-wrap)
function setupTrackerSwipe() {
  const order = ['list', 'map', 'rooms'];
  attachHSwipe(el('tab-location'), dir => {
    const current = STATE.trackerView || 'list';
    const i = order.indexOf(current);
    if (i < 0) return;
    const next = order[Math.min(order.length - 1, Math.max(0, i + dir))];
    if (next !== current) setTrackerView(next);
  });
}

// Calendar sub-tabs: schedule ↔ visits ↔ reflections.
// Within the schedule sub-tab, horizontal swipe instead changes the day.
function setupCalendarSwipe() {
  const order = ['schedule', 'visits', 'reflections'];
  attachHSwipe(el('tab-calendar'), dir => {
    const sub = STATE.calendarSubTab || 'schedule';
    if (sub === 'schedule') {
      // In schedule sub-tab, horizontal swipe navigates days 1-5
      const cur = STATE.scheduleDay;
      if (dir === +1 && cur < DAYS.length) { STATE.scheduleDay = cur + 1; renderCalendar(); }
      else if (dir === -1 && cur > 1)       { STATE.scheduleDay = cur - 1; renderCalendar(); }
      return;
    }
    // In visits or reflections, horizontal swipe hops sub-tabs
    const i = order.indexOf(sub);
    if (i < 0) return;
    const next = order[Math.min(order.length - 1, Math.max(0, i + dir))];
    if (next !== sub) setCalendarSubTab(next);
  });
}

// SOP sub-tabs: SOPs ↔ IR
function setupSopSwipe() {
  const order = ['sops', 'ir'];
  attachHSwipe(el('tab-sop'), dir => {
    const sub = STATE.sopSubTab || 'sops';
    const i = order.indexOf(sub);
    if (i < 0) return;
    const next = order[Math.min(order.length - 1, Math.max(0, i + dir))];
    if (next !== sub) setSopSubTab(next);
  });
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
  // Spec: "[Event] Attendance Check" as header, blank line between sections,
  // "Present" capitalised. Blank lines in Telegram need literal \n\n.
  const msg = `<b>${escapeHtml(ev.title)} Attendance Check</b>

${formatGroupDisplay(groupKey)}: <b>${n}/${total}</b> Present ${status}

${ev.startTime}H · ${dateLabel}`;

  TELEGRAM.sendRouted('M5_sitrep', msg, 'HTML').then(ok => {
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

  // Stash the existing non-editable fields so saveEvent can preserve them.
  STATE._editingEventOriginal = ev ? { ...ev } : null;

  el('ev-title').value = ev?.title || '';
  el('ev-start').value = ev?.startTime || '09:00';
  el('ev-end').value = ev?.endTime || '10:00';
  el('ev-attire').value = ev?.attire || '';
  el('ev-remarks').value = ev?.remarks || '';

  el('event-editor').classList.remove('hidden');
};
window.hideEventEditor = function() { el('event-editor').classList.add('hidden'); _editingEventId = null; };

window.saveEvent = async function() {
  // Preserve fields that are not editable in the slimmed form.
  const orig = STATE._editingEventOriginal || {};
  const payload = {
    day: orig.day ?? STATE.scheduleDay ?? 1,
    startTime: el('ev-start').value,
    endTime: el('ev-end').value,
    title: el('ev-title').value.trim(),
    location: orig.location || '',
    category: orig.category || 'other',
    attire: el('ev-attire').value,
    remarks: el('ev-remarks').value.trim(),
    visitId: orig.visitId || '',
    synicReport: orig.synicReport || false,
    oics: orig.oics || {},
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
  try {
    return _renderLocationImpl();
  } catch (err) {
    console.error('[renderLocation] crash:', err);
    el('tab-location').innerHTML = `
      <div class="alert alert-red" style="margin:14px">
        <b>Tracker failed to render.</b><br>
        ${escapeHtml(err.message || String(err))}<br>
        <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="window.location.reload()">Reload App</button>
      </div>`;
  }
}

function _renderLocationImpl() {
  const user = STATE.currentUser;
  const myStatus = getStatusOf(user?.id || '');
  const visibleGs = visibleGroups();
  // Counts are computed over VISIBLE scope only for non-admins
  const visMembers = canSeeAllSyndicates() ? MEMBERS : MEMBERS.filter(m => visibleGs.includes(memberGroupKey(m)));
  const totalRaw = visMembers.length;
  const outRaw = visMembers.filter(m => getStatusOf(m.id).status === 'out').length;
  const inRaw = totalRaw - outRaw;
  // Until we've confirmed the roster against the server, show '…' instead
  // of the seed count (was flashing 90 before settling to 88).
  const total = STATE.membersSynced ? totalRaw : '…';
  const outC  = STATE.membersSynced ? outRaw : '…';
  const inC   = STATE.membersSynced ? inRaw : '…';

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
    const userRole = (user?.role || '').toLowerCase();
    const isSynIC = mySyn && /\bsyn ic\b|\bsl\b|\bdy sl\b|\bdysl\b/.test(userRole);
    const rows = !isOpen ? '' : members.map(m => {
      const st = getStatusOf(m.id);
      const isOut = st.status === 'out';
      const isMe = user && m.id === user.id;
      // Syn IC + admin can toggle anyone in their syndicate (except themselves
      // — members self-manage via the 'Leaving Hotel' / 'Return to Hotel' flow).
      const canToggle = !isMe && (isAdmin() || isSynIC);
      const roleTag  = meaningfulRole(m);
      const activeBuddies = filterActiveBuddies(st.buddyWith);
      return `
        <div class="member-row" ${isMe ? 'data-me="1"' : ''}>
          <div class="status-dot ${isOut ? 'dot-out' : 'dot-in'}"></div>
          <div class="m-info">
            <div class="m-name">${escapeHtml(m.name)}${isMe ? ' <span class="you-pill">(You)</span>' : ''}</div>
            ${roleTag ? `<div class="m-detail">${escapeHtml(roleTag)}</div>` : ''}
            ${isOut && st.locationText ? `<div class="m-location">📍 ${escapeHtml(st.locationText)}</div>` : ''}
            ${isOut && activeBuddies ? `<div class="m-buddy">👥 w/ ${escapeHtml(activeBuddies)}</div>` : ''}
          </div>
          ${canToggle ? (isOut
            ? `<button class="btn-ic-mark ic-in"  onclick="event.stopPropagation(); icMarkMember('${m.id}', 'in')"  title="Mark ${escapeHtml(m.shortName)} as In Hotel">🏨 In</button>`
            : `<button class="btn-ic-mark ic-out" onclick="event.stopPropagation(); icMarkMember('${m.id}', 'out')" title="Mark ${escapeHtml(m.shortName)} as Out">🚶 Out</button>`
          ) : ''}
          <span class="status-pill ${isOut ? 'pill-out' : 'pill-in'}">${isOut ? 'OUT' : 'IN'}</span>
        </div>`;
    }).join('');
    // Syn IC action: one tap to mark everyone in this syndicate IN.
    // Available to: syn IC of this syndicate, or any admin.
    const myGroup = user && memberGroupKey(user);
    const canBulkIn = isAdmin() || (mySyn && (user?.role === 'Syn IC' || user?.role === 'SL' || user?.role === 'Dy SL'));
    const hasAnyOut = synOut > 0;
    return `
      <div class="syn-group" id="sg-${safeId}">
        <div class="syn-header" style="background:${synColor(gk)}">
          <span class="syn-name" onclick="toggleTrackerGroup('${gk.replace(/'/g,"\\'")}')" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex:1">
            ${formatGroupDisplay(gk)} <span class="syn-arrow" style="font-size:10px;opacity:.8">${isOpen?'▲':'▼'}</span>
          </span>
          ${canBulkIn && hasAnyOut ? `<button class="syn-allin-btn" onclick="event.stopPropagation(); bulkMarkAllIn('${gk.replace(/'/g,"\\'")}')" title="Mark all ${synOut} OUT members as back in hotel">🏨 All In</button>` : ''}
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
      <button class="subtab-btn ${trackerView === 'list'  ? 'active' : ''}" onclick="setTrackerView('list')">📋 List</button>
      <button class="subtab-btn ${trackerView === 'map'   ? 'active' : ''}" onclick="setTrackerView('map')">🗺️ Map</button>
      <button class="subtab-btn ${trackerView === 'rooms' ? 'active' : ''}" onclick="setTrackerView('rooms')">🛏️ Rooms</button>
    </div>
    <div id="tracker-rooms-wrap" style="${trackerView === 'rooms' ? '' : 'display:none'}"></div>
    <div id="tracker-map-wrap" style="${trackerView === 'map' ? '' : 'display:none'}">
      <div class="map-toolbar">
        ${(() => {
          const myStatus = user ? getStatusOf(user.id) : {};
          const sharingGps = !!(myStatus.lat && myStatus.lng);
          const scopeOn = STATE.showScope !== false;
          return `
            ${user ? (sharingGps
              ? `<button class="map-tool-btn map-tool-stop"  onclick="stopTracking()" title="Stop sharing your GPS">🛑 Stop GPS</button>`
              : `<button class="map-tool-btn map-tool-gps"   onclick="shareGPS()"    title="Share your current location">📡 Share GPS</button>`) : ''}
            <button class="map-tool-btn" onclick="locateMe()" title="Pan to my location">📍 Me</button>
            <button class="map-tool-btn ${scopeOn ? 'active' : ''}" onclick="toggleScopePins()" title="Show / hide SCOPE day venues">⭐ SCOPE pins</button>
            <button class="map-tool-btn map-tool-reset" onclick="resetMap()" title="If the map is blank, tap to rebuild">🔁 Reset</button>
          `;
        })()}
      </div>
      ${(() => {
        if (!(STATE.mapSynFilter instanceof Set)) {
          STATE.mapSynFilter = new Set(visibleGs);
        }
        const set = STATE.mapSynFilter;
        const allOn = set.size === visibleGs.length;
        const summary = allOn
          ? `All ${visibleGs.length} syndicates`
          : (set.size === 0 ? 'None selected'
          : [...set].map(g => formatGroupDisplay(g)).slice(0, 3).join(', ') + (set.size > 3 ? ` +${set.size-3}` : ''));
        return `
          <div class="map-filter-dd" id="map-filter-dd">
            <button class="map-filter-btn" onclick="toggleMapFilterDD()">
              <span class="mfd-icon">🎯</span>
              <span class="mfd-summary">${escapeHtml(summary)}</span>
              <span class="mfd-caret">▾</span>
            </button>
            <div class="map-filter-menu hidden" id="map-filter-menu">
              <div class="mfd-row mfd-row-all" onclick="setMapFilterAll()">
                <span class="mfd-check ${allOn ? 'on' : ''}">${allOn ? '✓' : ''}</span>
                <span class="mfd-label"><b>All syndicates</b></span>
              </div>
              <div class="mfd-divider"></div>
              ${visibleGs.map(gk => `
                <div class="mfd-row" onclick="toggleMapSynFilter('${gk.replace(/'/g, "\\'")}')">
                  <span class="mfd-check ${set.has(gk) ? 'on' : ''}" style="${set.has(gk) ? `background:${synColor(gk)};border-color:${synColor(gk)}` : ''}">${set.has(gk) ? '✓' : ''}</span>
                  <span class="mfd-swatch" style="background:${synColor(gk)}"></span>
                  <span class="mfd-label">${formatGroupDisplay(gk)}</span>
                  <span class="mfd-count">${membersInGroup(gk).length}</span>
                </div>
              `).join('')}
              <div class="mfd-divider"></div>
              <button class="mfd-close-btn" onclick="toggleMapFilterDD()">Done</button>
            </div>
          </div>
        `;
      })()}
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
      <div class="msc-row">
        <span class="status-dot ${myStatus.status==='out'?'dot-out':'dot-in'}"></span>
        <span class="msc-name">${escapeHtml(user.shortName)}</span>
        <span class="msc-pill ${myStatus.status==='out'?'msc-out':'msc-in'}">${myStatus.status==='out'?'OUT':'IN HOTEL'}</span>
        ${myStatus.lat && myStatus.lng ? `<span class="msc-gps" title="GPS active">📡</span>` : ''}
      </div>
      ${myStatus.status==='out' && myStatus.locationText ? `<div class="msc-detail">📍 ${escapeHtml(myStatus.locationText)}</div>` : ''}
      ${myStatus.status==='out' && filterActiveBuddies(myStatus.buddyWith) ? `<div class="msc-detail">👥 ${escapeHtml(filterActiveBuddies(myStatus.buddyWith))}</div>` : ''}
      ${myStatus.status==='out' ? `<button class="btn btn-outline btn-sm btn-block" onclick="updateLocationText()" style="margin-top:6px;font-size:11px;padding:5px 10px">📍 Update Location</button>` : ''}
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
  if (trackerView === 'rooms') {
    // renderRooms auto-detects tracker-rooms-wrap when it's visible and
    // writes there directly — no mirroring needed anymore.
    setTimeout(() => renderRooms(), 30);
  }
}

window.setTrackerView = function(view) {
  // When moving TO the map, proactively tear down any old Leaflet instance
  // — renderLocation is about to replace the map container DOM node and
  // leaving a stale map attached to a detached node is what was painting
  // everything black.
  if (view === 'map' && STATE.map) {
    try { STATE.map.remove(); } catch {}
    STATE.map = null;
    STATE.mapMarkers = {};
  }
  STATE.trackerView = view;
  renderLocation();
  if (view === 'map') setTimeout(() => initMap(), 100);
};

// Last-resort recovery for when Leaflet gets into a bad state (zombie
// container, stuck zoom, tiles not loading). Nukes the map instance and
// rebuilds it from scratch against the current DOM node.
// Toggle the SCOPE Day ⭐ pins layer on the map
window.toggleScopePins = function() {
  STATE.showScope = STATE.showScope === false;
  if (!STATE.map || !STATE.scopeLayer) return;
  if (STATE.showScope) STATE.scopeLayer.addTo(STATE.map);
  else STATE.map.removeLayer(STATE.scopeLayer);
  // Update the toolbar button's active state without re-rendering the whole Tracker
  const btns = document.querySelectorAll('.map-tool-btn');
  btns.forEach(b => {
    if (b.textContent.includes('SCOPE')) b.classList.toggle('active', STATE.showScope);
  });
};

// Centre the map on the user's current location. Order of preference:
//   1. cached GPS from Status sheet (shared earlier)
//   2. fresh browser geolocation
// Drops a one-shot "📍 You are here" marker so it's visible even without
// the user sharing GPS to the roster.
window.locateMe = function() {
  if (!STATE.map) return toast('Map not ready');
  const user = STATE.currentUser;
  const cached = user ? getStatusOf(user.id) : {};
  const landUser = (lat, lng) => {
    // Remove any previous "you" marker
    if (STATE._meMarker) { try { STATE.map.removeLayer(STATE._meMarker); } catch {} }
    const meIcon = L.divIcon({
      html: `<div style="background:#3b82f6;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,.35),0 4px 10px rgba(0,0,0,.3);font-weight:900">📍</div>`,
      className:'', iconSize:[28,28], iconAnchor:[14,14]
    });
    STATE._meMarker = L.marker([lat, lng], { icon: meIcon, title: 'You' }).addTo(STATE.map).bindPopup('📍 You are here').openPopup();
    STATE.map.flyTo([lat, lng], Math.max(STATE.map.getZoom(), 14), { duration: 0.6 });
  };
  if (cached.lat && cached.lng) return landUser(cached.lat, cached.lng);
  if (!navigator.geolocation) return toast('GPS not available on this device');
  toast('📡 Locating…');
  navigator.geolocation.getCurrentPosition(
    pos => landUser(pos.coords.latitude, pos.coords.longitude),
    (e) => toast('❌ ' + (e?.code === 1 ? 'Location permission denied' : 'Couldn\'t get location')),
    { timeout: 8000, maximumAge: 30000, enableHighAccuracy: false }
  );
};

window.resetMap = function() {
  try { STATE.map?.remove(); } catch {}
  STATE.map = null;
  STATE.mapMarkers = {};
  setTimeout(() => initMap(), 50);
  toast('🔁 Map rebuilt');
};

window.toggleMapFilterDD = function() {
  const menu = el('map-filter-menu');
  if (menu) menu.classList.toggle('hidden');
};
// Map syndicate filter — dropdown above the map. Toggle individual
// syndicates in/out; 'All' resets to every visible group.
window.toggleMapSynFilter = function(gk) {
  const vis = visibleGroups();
  if (!(STATE.mapSynFilter instanceof Set)) STATE.mapSynFilter = new Set(vis);
  if (STATE.mapSynFilter.has(gk)) {
    STATE.mapSynFilter.delete(gk);
    if (STATE.mapSynFilter.size === 0) STATE.mapSynFilter.add(gk);
  } else {
    STATE.mapSynFilter.add(gk);
  }
  // Refresh ONLY the markers + dropdown UI. Don't re-render the whole
  // Tracker — that would destroy the Leaflet container and blank the map.
  refreshMapFilterUI();
  if (STATE.map) updateMapMarkers();
};
window.setMapFilterAll = function() {
  const vis = visibleGroups();
  if (!(STATE.mapSynFilter instanceof Set)) STATE.mapSynFilter = new Set(vis);
  const allOn = STATE.mapSynFilter.size === vis.length;
  STATE.mapSynFilter = allOn ? new Set([vis[0]]) : new Set(vis);  // toggle on/off
  refreshMapFilterUI();
  if (STATE.map) updateMapMarkers();
};
// Re-render just the filter dropdown innerHTML (tick states + summary)
function refreshMapFilterUI() {
  const dd = el('map-filter-dd');
  if (!dd) return;
  const vis = visibleGroups();
  const set = STATE.mapSynFilter;
  const allOn = set.size === vis.length;
  const summary = allOn
    ? `All ${vis.length} syndicates`
    : (set.size === 0 ? 'None selected'
    : [...set].map(g => formatGroupDisplay(g)).slice(0, 3).join(', ') + (set.size > 3 ? ` +${set.size-3}` : ''));
  const summaryEl = dd.querySelector('.mfd-summary');
  if (summaryEl) summaryEl.textContent = summary;
  // Update tick marks per row
  dd.querySelectorAll('.mfd-row').forEach(row => {
    const check = row.querySelector('.mfd-check');
    if (!check) return;
    // 'All' row
    if (row.classList.contains('mfd-row-all')) {
      check.classList.toggle('on', allOn);
      check.textContent = allOn ? '✓' : '';
      return;
    }
    // Syndicate rows — match by onclick handler
    const onclick = row.getAttribute('onclick') || '';
    const match = onclick.match(/toggleMapSynFilter\('([^']+)'\)/);
    if (match) {
      const gk = match[1].replace(/\\'/g, "'");
      const on = set.has(gk);
      check.classList.toggle('on', on);
      check.textContent = on ? '✓' : '';
      if (on) {
        check.style.background = synColor(gk);
        check.style.borderColor = synColor(gk);
      } else {
        check.style.background = '';
        check.style.borderColor = '';
      }
    }
  });
}
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
window.setRoomsFilter = function(gk) {
  STATE.roomsFilter = gk;
  renderRooms();
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
  const locText = rawLoc || 'Out of Hotel';
  const selectedItems = [...document.querySelectorAll('.buddy-item.selected')];
  const buddyObjs = selectedItems.map(x => getMemberById(x.dataset.id)).filter(Boolean);
  const myLabel = user.shortName || user.name;
  const buddyLabels = buddyObjs.map(b => b.shortName || b.name);
  // Confirm when marking ≥ 2 people out to prevent fat-finger group check-outs
  const totalOut = 1 + buddyObjs.length;
  if (totalOut >= 2) {
    const names = [myLabel, ...buddyLabels].join(', ');
    if (!confirm(`Marking ${totalOut} OUT at "${locText}":\n\n${names}\n\nContinue?`)) return;
  }
  hideBuddyModal();

  // User explicitly does NOT want auto-GPS on Leaving Hotel. Only use
  // coords if the user shared GPS via the 📡 button in the buddy modal
  // (STATE._pendingGPS) or from their existing status. No silent prompt.
  const pending = STATE._pendingGPS;
  const existingStatus = getStatusOf(user.id);
  const useLat = pending ? pending.lat : (existingStatus.lat || '');
  const useLng = pending ? pending.lng : (existingStatus.lng || '');
  STATE._pendingGPS = null;
  const now = new Date().toISOString();

  // Mark ME as out (local) then mark me + all buddies on the server.
  STATE.memberStatuses[user.id] = {
    ...existingStatus,
    status: 'out',
    locationText: locText,
    lat: useLat || null,
    lng: useLng || null,
    buddyWith: buddyLabels.join(', '),
    lastUpdated: now
  };
  const nPeople = 1 + buddyObjs.length;
  // Build every status update up front, then fire them in PARALLEL.
  // Previously this was a sequential for-await loop — 5 buddies × ~1.5s
  // server round-trip = 7-8s blocking the user. Parallel brings it to the
  // slowest single request (~1-2s).
  const payloads = [
    {
      memberId: user.id, name: user.name, shortName: user.shortName,
      role: user.role, syndicate: user.syndicate,
      status: 'out', locationText: locText,
      lat: useLat, lng: useLng,
      buddyWith: buddyLabels.join(', '),
      roomNumber: existingStatus.roomNumber || ''
    }
  ];
  buddyObjs.forEach(b => {
    const otherNames = [myLabel, ...buddyLabels.filter(n => n !== (b.shortName || b.name))];
    const bStatus = getStatusOf(b.id);
    STATE.memberStatuses[b.id] = {
      ...bStatus,
      status: 'out',
      locationText: locText,
      buddyWith: otherNames.join(', '),
      lastUpdated: now
    };
    payloads.push({
      memberId: b.id, name: b.name, shortName: b.shortName,
      role: b.role, syndicate: b.syndicate,
      status: 'out', locationText: locText,
      lat: bStatus.lat || '', lng: bStatus.lng || '',
      buddyWith: otherNames.join(', '),
      roomNumber: bStatus.roomNumber || ''
    });
  });
  await withLoader(`Marking ${nPeople} out of hotel…`, () =>
    Promise.all(payloads.map(p => API.post('updateStatus', p)))
  );

  renderLocation();
  renderPinnedActionBar();
  const n = 1 + buddyObjs.length;
  toast(`✅ ${n} marked OUT — stay safe!`);
};

window.returnToHotel = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  // Stop the live GPS watcher — they're back at the hotel, no need to track.
  if (STATE._gpsWatchId != null) {
    try { navigator.geolocation.clearWatch(STATE._gpsWatchId); } catch {}
    STATE._gpsWatchId = null;
  }
  STATE._lastGpsSent = null;
  STATE.memberStatuses[user.id] = { status:'in_hotel', locationText:'Hotel', lat:CONFIG.hotel.lat, lng:CONFIG.hotel.lng, buddyWith:'', lastUpdated:new Date().toISOString() };
  renderLocation();
  renderPinnedActionBar();
  await withLoader('Marking you back in hotel…', () =>
    API.post('updateStatus', { memberId:user.id, name:user.name, shortName:user.shortName, role:user.role, syndicate:user.syndicate, status:'in_hotel', locationText:'Hotel', lat:CONFIG.hotel.lat, lng:CONFIG.hotel.lng, buddyWith:'' })
  );
  toast('🏨 Welcome back!');
};

// Share GPS: takes an initial fix THEN starts a watchPosition so the
// location updates live as the user moves. Throttled to avoid slamming
// the Sheets API:
//   • Don't POST more than once per 45 seconds
//   • Don't POST unless moved > ~25m from the last sent position
// watchPosition pauses when the PWA is backgrounded by iOS; when the app
// comes back to the foreground, we get a fresh ping and resume.
window.shareGPS = async function() {
  const user = STATE.currentUser;
  if (!user) return;
  if (!navigator.geolocation) return toast('❌ GPS not supported on this device');

  await withLoader('Getting your GPS…', async () => {
    try {
      const pos = await new Promise((r, rj) => navigator.geolocation.getCurrentPosition(r, rj, { timeout: 8000, enableHighAccuracy: true }));
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      STATE.memberStatuses[user.id] = { ...getStatusOf(user.id), lat, lng, lastUpdated: new Date().toISOString() };
      await _postGpsUpdate(user, lat, lng);
      STATE._lastGpsSent = { lat, lng, ts: Date.now() };
      toast('📡 GPS live — tracking every move');
      renderPinnedActionBar();
      if (STATE.map) updateMapMarkers();
    } catch {
      toast('❌ GPS unavailable — enter location manually');
      return;
    }
  });

  // Start the continuous watcher. Clear any existing one first to avoid
  // duplicate posts if the user double-taps Share GPS.
  if (STATE._gpsWatchId != null) {
    try { navigator.geolocation.clearWatch(STATE._gpsWatchId); } catch {}
    STATE._gpsWatchId = null;
  }
  STATE._gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => _handleGpsFix(user, pos),
    (err) => { console.warn('[gps watch] error', err); },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
};

// Called by the geolocation watcher each time the device reports a new
// fix. We keep the UI live on every fix (cheap) but throttle the server
// POST so we don't hammer Sheets.
async function _handleGpsFix(user, pos) {
  const lat = pos.coords.latitude, lng = pos.coords.longitude;
  // Always refresh local UI for responsive feel
  STATE.memberStatuses[user.id] = { ...getStatusOf(user.id), lat, lng, lastUpdated: new Date().toISOString() };
  if (STATE.map) updateMapMarkers();
  // Throttle server updates
  const prev = STATE._lastGpsSent;
  const now = Date.now();
  if (prev) {
    const dt = now - prev.ts;
    const dMeters = _haversineMeters(prev.lat, prev.lng, lat, lng);
    if (dt < 45 * 1000 && dMeters < 25) return;   // too soon and too close — skip
  }
  STATE._lastGpsSent = { lat, lng, ts: now };
  await _postGpsUpdate(user, lat, lng);
}

async function _postGpsUpdate(user, lat, lng) {
  const cur = getStatusOf(user.id);
  await API.post('updateStatus', {
    memberId: user.id, name: user.name, shortName: user.shortName,
    role: user.role, syndicate: user.syndicate,
    status: cur.status || 'in_hotel',
    locationText: cur.locationText || '',
    lat, lng,
    buddyWith: cur.buddyWith || '',
    roomNumber: cur.roomNumber || ''
  });
}

// Great-circle distance in metres — cheap approximation plenty good for
// "did the user move more than 25m" check.
function _haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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
  const mapEl = document.getElementById('leaflet-map');
  // If there's an existing map but it's attached to a stale (now-detached)
  // DOM node — which happens every time renderLocation re-runs innerHTML —
  // tear it down and rebuild. Otherwise the old map holds coords for a dead
  // container and paints as a black rectangle.
  if (STATE.map) {
    const attached = STATE.map.getContainer && STATE.map.getContainer();
    if (attached && attached !== mapEl) {
      try { STATE.map.remove(); } catch {}
      STATE.map = null;
      STATE.mapMarkers = {};
    } else if (attached === mapEl) {
      updateMapMarkers();
      setTimeout(() => STATE.map.invalidateSize(true), 50);
      setTimeout(() => STATE.map.invalidateSize(true), 350);
      return;
    }
  }
  if (!mapEl) { setTimeout(initMap, 200); return; }
  if (typeof L === 'undefined') { setTimeout(initMap, 500); return; }
  // Wait until the container has non-zero size (tab may still be animating in)
  if (mapEl.clientWidth < 50 || mapEl.clientHeight < 50) {
    setTimeout(initMap, 120);
    return;
  }
  STATE.map = L.map('leaflet-map', {
    zoomAnimation: true,
    fadeAnimation: true,
    // Region-wide minZoom so users can zoom out and see both Singapore and
    // Bangkok in the same view during the pre-trip trial.
    minZoom: 5,
    maxZoom: 18,
    // Bounds now cover Singapore → Malaysia → whole of Thailand's study
    // region (incl. Kanchanaburi in the west + Rayong in the east), so
    // members in SG during pre-trial can still see their own location.
    maxBounds: L.latLngBounds([1.00, 99.00], [14.80, 104.50]),
    maxBoundsViscosity: 0.5,
    worldCopyJump: false
  }).setView([CONFIG.hotel.lat, CONFIG.hotel.lng], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'© OpenStreetMap',
    maxZoom:18,
    minZoom:5,
    keepBuffer: 6,           // generous ring of off-screen tiles
    updateWhenIdle: false,
    updateWhenZooming: true, // load tiles mid-zoom so we don't see blanks at the end
    // If a tile errors, show a transparent png instead of the broken-image icon
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
  }).addTo(STATE.map);
  // Safety net — if the container size ever drifts from the map's internal
  // size (common after dvh changes when the iOS address bar toggles),
  // invalidate on every zoom/move end.
  STATE.map.on('zoomend moveend resize', () => {
    // Throttle: only if size genuinely changed
    const el = document.getElementById('leaflet-map');
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const mapSize = STATE.map.getSize();
    if (Math.abs(mapSize.x - w) > 2 || Math.abs(mapSize.y - h) > 2) {
      STATE.map.invalidateSize(false);
    }
  });
  // Also listen for viewport resize (iOS address bar show/hide fires this)
  if (!STATE._mapResizeHandler) {
    STATE._mapResizeHandler = () => { STATE.map?.invalidateSize(true); };
    window.addEventListener('resize', STATE._mapResizeHandler);
    window.addEventListener('orientationchange', STATE._mapResizeHandler);
  }
  const hotelIcon = L.divIcon({
    html: `<div style="background:#003580;color:white;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,.3)">🏨</div>`,
    className:'', iconSize:[40,40], iconAnchor:[20,20]
  });
  L.marker([CONFIG.hotel.lat, CONFIG.hotel.lng], { icon:hotelIcon }).addTo(STATE.map).bindPopup(`<b>${CONFIG.hotel.name}</b><br>${CONFIG.hotel.address}`);

  // SCOPE Day visit pins (⭐). Cluster into a layer group so the show/hide
  // toggle can add/remove them wholesale without touching member markers.
  STATE.scopeLayer = L.layerGroup();
  (typeof SCOPE_LOCATIONS !== 'undefined' ? SCOPE_LOCATIONS : []).forEach(loc => {
    const starIcon = L.divIcon({
      html: `<div style="background:#fbbf24;color:#78350f;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;border:2.5px solid #b45309;box-shadow:0 3px 8px rgba(180,83,9,.45);font-weight:900">⭐</div>`,
      className: '', iconSize: [30, 30], iconAnchor: [15, 15]
    });
    const popup = `<b>${escapeHtml(loc.name)}</b><br><span style="color:#b45309;font-weight:700;font-size:11px">SCOPE Day</span><br>${escapeHtml(loc.syns)}`;
    L.marker([loc.lat, loc.lng], { icon: starIcon, title: loc.name }).bindPopup(popup).addTo(STATE.scopeLayer);
  });
  if (STATE.showScope !== false) STATE.scopeLayer.addTo(STATE.map);

  updateMapMarkers();
}
function updateMapMarkers() {
  if (!STATE.map) return;
  Object.values(STATE.mapMarkers).forEach(m => m.remove());
  STATE.mapMarkers = {};
  // Only plot members whose syndicate is in the active map filter. If the
  // filter Set isn't initialised, default to all visible groups (so the
  // first render shows everyone before the user narrows down).
  const vis = visibleGroups();
  if (!(STATE.mapSynFilter instanceof Set)) STATE.mapSynFilter = new Set(vis);
  const filter = STATE.mapSynFilter;
  MEMBERS.forEach(m => {
    const gk = memberGroupKey(m);
    if (!filter.has(gk)) return;
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

// ═══════════ TRANSPORT SUB-TAB ═══════════════════════════════
const TRANSPORT_BUSES = [
  { id: 'bus1', label: 'Bus 1', pax: 'Syn 1 · 27E · Dy CC · DS1', syns: ['Syn 1', '27E', 'Dy CC', 'DS1'] },
  { id: 'bus2', label: 'Bus 2', pax: 'Syn 3 · 26E · DS3 · DSE',   syns: ['Syn 3', '26E', 'DS3', 'DSE']   },
  { id: 'bus3', label: 'Bus 3', pax: 'Syn 4 · 25E · DS4 · CXO',   syns: ['Syn 4', '25E', 'DS4', 'CXO']   },
  { id: 'car',  label: '🚗 Car', pax: 'HOD · SO',                  syns: ['HOD', 'SO']                    },
];
// All syndicate labels that exist across all vehicles (for flight boarding picker)
const ALL_TRANSPORT_SYNS = ['Syn 1','27E','Dy CC','DS1','Syn 3','26E','DS3','DSE','Syn 4','25E','DS4','CXO','HOD','SO'];

// Returns the short syn label for the current user (for boarding affordance)
function _mySynLabel(user) {
  if (!user) return null;
  const gk = memberGroupKey(user);
  const disp = formatGroupDisplay(gk);
  const MAP = {
    'Syndicate 1':'Syn 1','Syndicate 3':'Syn 3','Syndicate 4':'Syn 4',
    'Leadership':'HOD','PSO':'HOD','SO':'SO',
    '25ES18':'25E','26ES14':'26E','27ES18':'27E',
    'DS1':'DS1','DS3':'DS3','DS4':'DS4','DSE':'DSE','CXO':'CXO','Dy CC':'Dy CC'
  };
  return MAP[disp] || disp;
}

async function refreshTransportState() {
  const data = await API.get('getTransport');
  if (data && typeof data === 'object') STATE.transport = data;
  const body = el('calendar-sub-content');
  if (body && STATE.calendarSubTab === 'transport') _redrawTransport(body);
}

// Which vehicle picker is open; which bus card is expanded for driver details
// Both are stored on STATE dynamically (not in initial STATE declaration)

window.openTransportBoarding = function(vehicleId, isPlane) {
  // Preload any in-progress selection + remarks from server state so Save Progress
  // persists across returns to the modal.
  const v = (STATE.transport || {})[vehicleId] || {};
  STATE.transportModal = {
    vehicleId,
    isPlane: !!isPlane,
    selected: Array.isArray(v.boardedSyns) ? v.boardedSyns.slice() : [],
    remarks:  v.boardingRemarks || ''
  };
  const body = el('calendar-sub-content');
  if (body) _redrawTransport(body);
};

window.closeTransportModal = function() {
  STATE.transportModal = null;
  const body = el('calendar-sub-content');
  if (body) _redrawTransport(body);
};

window.toggleTransportSyn = function(syn) {
  const m = STATE.transportModal;
  if (!m) return;
  // Preserve whatever is in the remarks textbox before re-render
  m.remarks = el('tmod-remarks')?.value ?? m.remarks;
  const idx = m.selected.indexOf(syn);
  if (idx >= 0) m.selected.splice(idx, 1);
  else m.selected.push(syn);
  const body = el('calendar-sub-content');
  if (body) _redrawTransport(body);
};

// Save mid-state: writes current selection + remarks to server, no Telegram.
window.saveTransportProgress = async function() {
  const m = STATE.transportModal;
  if (!m) return;
  const user = STATE.currentUser;
  const actorName = user ? (user.shortName || user.name) : 'unknown';
  const remarks = (el('tmod-remarks')?.value || m.remarks || '').trim();
  // Optimistic update so UI reflects save immediately even if server is slow
  const priorState = STATE.transport ? JSON.parse(JSON.stringify(STATE.transport)) : {};
  if (!STATE.transport) STATE.transport = {};
  if (!STATE.transport[m.vehicleId]) STATE.transport[m.vehicleId] = { status:'idle', boardedSyns:[], driver:{} };
  STATE.transport[m.vehicleId].boardedSyns = m.selected.slice();
  STATE.transport[m.vehicleId].boardingRemarks = remarks;
  const resp = await API.postRaw('updateTransport', {
    vehicleId: m.vehicleId,
    op: 'boardBatch',           // renamed from 'action' (was shadowing outer action)
    synLabels: m.selected,
    remarks,
    actorName
  });
  if (resp && resp.ok && resp.data) {
    STATE.transport = resp.data;
    toast('💾 Progress saved');
  } else {
    // Roll back optimistic update and tell user honestly
    STATE.transport = priorState;
    const err = resp?.error || 'no response (offline?)';
    toast('❌ Save failed — ' + err);
  }
  STATE.transportModal = null;
  const body = el('calendar-sub-content');
  if (body) _redrawTransport(body);
};

// Send SITREP: saves state + sends Telegram to ops chat
window.sendTransportBoarding = async function() {
  const m = STATE.transportModal;
  if (!m) return;
  const user = STATE.currentUser;
  const actorName = user ? (user.shortName || user.name) : 'unknown';
  const veh = m.isPlane ? null : TRANSPORT_BUSES.find(b => b.id === m.vehicleId);
  const remarks = (el('tmod-remarks')?.value || m.remarks || '').trim();

  // Optimistic update
  if (!STATE.transport) STATE.transport = {};
  if (!STATE.transport[m.vehicleId]) STATE.transport[m.vehicleId] = { status:'idle', boardedSyns:[], driver:{} };
  STATE.transport[m.vehicleId].boardedSyns = m.selected.slice();
  STATE.transport[m.vehicleId].boardingRemarks = remarks;
  // 1. Save to server (with remarks)
  const result = await API.post('updateTransport', {
    vehicleId: m.vehicleId,
    op: 'boardBatch',           // renamed from 'action' to avoid outer-action collision
    synLabels: m.selected,
    remarks,
    actorName
  });
  if (result) STATE.transport = result;

  // 2. Build + send Telegram message
  const selList = m.selected.join(', ') || 'None';
  let msg = '';
  if (m.isPlane) {
    const flightLabel = m.vehicleId === 'flight_sq708' ? 'SQ708 · SIN→BKK (0930H)' : 'SQ709 · BKK→SIN (1530H)';
    msg = `✈️ <b>Boarding Update — ${flightLabel}</b>\nBoarded: ${selList}`;
  } else {
    const v = (STATE.transport || {})[m.vehicleId] || {};
    const driver = v.driver || {};
    const pct = veh ? Math.round(m.selected.length / veh.syns.length * 100) : 0;
    msg = `🚌 <b>Boarding Update — ${escapeHtml(veh?.label || m.vehicleId)}</b>\nBoarded (${pct}%): ${selList}`;
    if (driver.name) msg += `\nDriver: ${escapeHtml(driver.name)}`;
  }
  if (remarks) msg += `\n⚠️ Remarks: ${escapeHtml(remarks)}`;
  msg += `\n🕐 ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}H`;

  // Flight → M4, Bus → M2 (separate routing keys — can be disabled independently)
  const routingKey = m.isPlane ? 'M4_flight_board' : 'M2_bus_boarding';
  const ok = await TELEGRAM.sendRouted(routingKey, msg, 'HTML');
  if (ok) toast('✅ Boarding sitrep sent');

  STATE.transportModal = null;
  const body = el('calendar-sub-content');
  if (body) _redrawTransport(body);
};

window.toggleTransportExpand = function(vehicleId) {
  STATE.transportExpanded = (STATE.transportExpanded === vehicleId) ? null : vehicleId;
  const body = el('calendar-sub-content');
  if (body) _redrawTransport(body);
};

window.saveTransportDriver = async function(vehicleId) {
  const nameEl  = el(`tdr-name-${vehicleId}`);
  const phoneEl = el(`tdr-phone-${vehicleId}`);
  const result  = await API.post('updateTransport', {
    vehicleId,
    op: 'editDriver',            // renamed from 'action'
    driverName:  (nameEl?.value  || '').trim(),
    driverPhone: (phoneEl?.value || '').trim(),
    actorName: STATE.currentUser?.shortName || STATE.currentUser?.name || ''
  });
  if (result) { STATE.transport = result; toast('✅ Driver info saved'); }
  STATE.transportExpanded = null;
  const body = el('calendar-sub-content');
  if (body) _redrawTransport(body);
};

// Send pushing sitrep to Telegram ops chat
window.transportSendSitrep = async function(vehicleId) {
  const ts   = STATE.transport || {};
  const v    = ts[vehicleId] || {};
  const veh  = TRANSPORT_BUSES.find(b => b.id === vehicleId);
  if (!veh) return;
  const remarksEl = el(`tsitrep-remarks-${vehicleId}`);
  const remarks   = (remarksEl?.value || '').trim();
  const boarded   = (v.boardedSyns || []).join(', ') || veh.pax;
  let msg = `🚌 <b>${escapeHtml(veh.label)} is pushing</b>\nPax: ${escapeHtml(boarded)}`;
  if (v.driver?.name) msg += `\nDriver: ${escapeHtml(v.driver.name)}`;
  if (remarks)        msg += `\n⚠️ Remarks: ${escapeHtml(remarks)}`;
  msg += `\n🕐 ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}H`;
  const ok = await TELEGRAM.sendRouted('M3_bus_pushing', msg, 'HTML');
  if (ok) {
    toast('✅ Pushing sitrep sent');
    if (remarksEl) remarksEl.value = '';
    const body = el('calendar-sub-content');
    if (body) _redrawTransport(body);
  }
};

window.transportAction = async function(op, vehicleId) {
  // Used for pushing / dropped / reset (non-boarding actions).
  // Param is named `op` to match server-side key and avoid clashing with
  // the outer `action: 'updateTransport'` dispatcher.
  const user = STATE.currentUser;
  const actorName = user ? (user.shortName || user.name) : 'unknown';
  const result = await API.post('updateTransport', { op, vehicleId, actorName });
  if (result) STATE.transport = result;
  const body = el('calendar-sub-content');
  if (body) _redrawTransport(body);
};

// ── Synchronous (no API) redraw of the transport sub-tab ──────
function _redrawTransport(container) {
  const ts       = STATE.transport || {};
  const user     = STATE.currentUser;
  const mySyn    = _mySynLabel(user);
  const canAdmin = isAdmin();
  const expandV  = STATE.transportExpanded || null;
  const modal    = STATE.transportModal;

  // ── MODAL view (single-step boarding: selection + remarks + save/send) ──
  if (modal) {
    const isPlane = modal.isPlane;
    const veh     = isPlane ? null : TRANSPORT_BUSES.find(b => b.id === modal.vehicleId);
    const syns    = isPlane ? ALL_TRANSPORT_SYNS : (veh?.syns || []);
    const title   = isPlane
      ? (modal.vehicleId === 'flight_sq708' ? 'SQ708 · SIN→BKK' : 'SQ709 · BKK→SIN')
      : (veh?.label || modal.vehicleId);
    const pax     = isPlane ? 'All groups' : (veh?.pax || '');
    const pct     = syns.length ? Math.round(modal.selected.length / syns.length * 100) : 0;
    // Send SITREP: any ≥1 selection OR remarks-only (bus may push with short pax).
    // Save Progress: always enabled so you can save remarks even with 0 selected.
    const canSend = modal.selected.length >= 1 || (modal.remarks || '').length > 0 || (el('tmod-remarks')?.value || '').length > 0;
    const canSave = true;

    container.innerHTML = `
      <div style="padding:0 12px 32px">
        <div style="display:flex;align-items:center;gap:10px;padding:14px 0 10px">
          <button class="btn btn-outline btn-sm" onclick="closeTransportModal()">← Cancel</button>
          <div>
            <div style="font-weight:800;font-size:16px">${isPlane ? '✈️' : '🚌'} ${escapeHtml(title)}</div>
            <div style="font-size:12px;color:var(--text-3)">${escapeHtml(pax)}</div>
          </div>
        </div>

        <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:10px">
          ${isPlane ? 'Select groups / syndicates that have boarded:' : 'Select who is present on this bus:'}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
          ${syns.map(s => {
            const on = modal.selected.includes(s);
            return `<button class="btn" style="font-size:14px;padding:10px 16px;${on
              ? 'background:#2563eb;color:#fff;border-color:#2563eb;font-weight:700'
              : 'background:var(--card);color:var(--text);border:1px solid var(--border)'}"
              onclick="toggleTransportSyn('${s}')">
              ${on ? '✅ ' : ''}${escapeHtml(s)}
            </button>`;
          }).join('')}
        </div>

        ${syns.length > 0 ? `
        <div style="margin-bottom:16px">
          <div style="background:#e2e8f0;border-radius:6px;height:10px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct>=100?'#16a34a':'#3b82f6'};border-radius:6px;transition:width .2s"></div>
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px">${modal.selected.length}/${syns.length} selected · ${pct}%${pct>=100?' — All present! ✓':''}</div>
        </div>` : ''}

        <label class="ref-form-label" style="display:block;margin-bottom:6px">Remarks <span style="font-weight:400;opacity:.7">(e.g. "1 pax from Syn 1 in Bus 2", "26E short 1 man at hotel")</span></label>
        <textarea id="tmod-remarks"
          style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;padding:10px;font-size:13px;font-family:inherit;min-height:64px;background:var(--card);color:var(--text);margin-bottom:12px"
          placeholder="Optional — any deviations, late pax, or notes">${escapeHtml(modal.remarks || '')}</textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-outline" style="font-size:14px;padding:12px;opacity:${canSave?1:0.4}"
            ${canSave ? '' : 'disabled'}
            onclick="saveTransportProgress()">💾 Save Progress</button>
          <button class="btn btn-primary" style="font-size:14px;padding:12px;opacity:${canSend?1:0.4}"
            ${canSend ? '' : 'disabled'}
            onclick="sendTransportBoarding()">📤 Send SITREP</button>
        </div>
        <div style="font-size:11px;color:var(--text-3);text-align:center;margin-top:8px">
          <b>💾 Save</b>: persist selection + remarks without sending Telegram (return later to continue).<br>
          <b>📤 Send SITREP</b>: save and post to ops chat — can send with partial (e.g. bus pushing short of some pax).
        </div>
      </div>`;
    return;
  }

  // ── NORMAL cards view ──
  function flightCard(vehicleId, flightNum, route, date, depart, arrive, note) {
    const v       = ts[vehicleId] || { boardedSyns: [] };
    const boarded = v.boardedSyns || [];
    const chips   = boarded.map(s =>
      `<span class="transport-boarded-chip" style="background:#dcfce7;color:#166534">✅ ${escapeHtml(s)}</span>`).join('');
    return `
      <div class="transport-bus-card" style="border-left:4px solid #3b82f6">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="background:#003580;color:#fff;font-size:12px;font-weight:800;border-radius:8px;padding:4px 10px;white-space:nowrap;flex-shrink:0">${escapeHtml(flightNum)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px">${escapeHtml(route)} · ${escapeHtml(date)}</div>
            <div style="font-size:12px;color:var(--text-2);margin-top:1px">Depart ${escapeHtml(depart)} → Arrive ${escapeHtml(arrive)}</div>
            <div style="font-size:11px;color:var(--text-3)">${escapeHtml(note)}</div>
          </div>
        </div>
        ${boarded.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${chips}</div>` : ''}
        <button class="btn btn-sm" style="margin-top:10px;width:100%;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-size:13px"
          onclick="openTransportBoarding('${vehicleId}',true)">✈️ Boarding?</button>
      </div>`;
  }

  function busCard(veh) {
    const v        = ts[veh.id] || { status: 'idle', boardedSyns: [], driver: {} };
    const boarded  = v.boardedSyns || [];
    const status   = v.status || 'idle';
    const driver   = v.driver || {};
    const isExpand = expandV === veh.id;
    const pct      = veh.syns.length ? Math.round(boarded.length / veh.syns.length * 100) : 0;
    const allBoarded = pct >= 100;
    const pushing    = status === 'pushing';
    const barColor   = allBoarded ? '#16a34a' : '#3b82f6';

    const synChips = veh.syns.map(s => {
      const on = boarded.includes(s);
      return `<span class="transport-boarded-chip" style="${on ? 'background:#dcfce7;color:#166534' : 'background:#fee2e2;color:#991b1b'}">
        ${on ? '✅' : '⧖'} ${escapeHtml(s)}
      </span>`;
    }).join('');

    const bar = `
      <div style="margin:10px 0 4px;background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:6px"></div>
      </div>
      <div style="font-size:11px;color:var(--text-3)">${boarded.length}/${veh.syns.length} groups confirmed · ${pct}%</div>`;

    const statusBadge = pushing
      ? `<span style="font-size:11px;background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;padding:2px 7px;border-radius:10px;font-weight:700;margin-left:6px">🚌 Pushing</span>`
      : (allBoarded ? `<span style="font-size:11px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:2px 7px;border-radius:10px;font-weight:700;margin-left:6px">All Boarded ✓</span>` : '');

    const driverSection = isExpand ? `
      <div class="transport-driver-section">
        ${driver.name || driver.phone ? `<div style="font-size:12px;color:var(--text-2);margin-bottom:8px">
          ${driver.name ? `<b>Driver:</b> ${escapeHtml(driver.name)}` : ''}
          ${driver.phone ? ` · <a href="tel:${escapeHtml(driver.phone)}" style="color:var(--blue-500)">${escapeHtml(driver.phone)}</a>` : ''}
        </div>` : ''}
        ${canAdmin ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label class="ref-form-label">Driver Name</label>
              <input id="tdr-name-${veh.id}" type="text" value="${escapeHtml(driver.name||'')}" placeholder="e.g. Khun Somsak"
                style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:7px;padding:6px 8px;font-size:12px;background:var(--card);color:var(--text)">
            </div>
            <div>
              <label class="ref-form-label">Phone</label>
              <input id="tdr-phone-${veh.id}" type="tel" value="${escapeHtml(driver.phone||'')}" placeholder="+66 8X XXX XXXX"
                style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:7px;padding:6px 8px;font-size:12px;background:var(--card);color:var(--text)">
            </div>
          </div>
          <button class="btn btn-sm btn-primary" style="width:100%" onclick="saveTransportDriver('${veh.id}')">Save Driver Info</button>` : ''}
      </div>` : '';

    const sitrepPanel = pushing ? `
      <div class="transport-sitrep-panel">
        <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px">📤 Send Pushing Sitrep to Ops Chat</div>
        <textarea id="tsitrep-remarks-${veh.id}"
          style="width:100%;box-sizing:border-box;border:1px solid #fcd34d;border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit;min-height:48px;background:#fefce8;color:var(--text)"
          placeholder="Optional: e.g. 26E 1 pax joined Bus 1 · Syn 1 short 1 man (at hotel)"></textarea>
        <button class="btn btn-sm" style="width:100%;margin-top:6px;background:#d97706;color:#fff;font-size:13px"
          onclick="transportSendSitrep('${veh.id}')">📤 Send Sitrep</button>
      </div>` : '';

    const hasState = status !== 'idle' || boarded.length > 0;
    const boardBtn = status === 'idle' ? `<button class="btn btn-sm" style="background:#eff6ff;color:#0369a1;border:1px solid #7dd3fc;font-size:13px" onclick="openTransportBoarding('${veh.id}',false)">${boarded.length ? '➕ Continue Boarding' : '🔲 Boarding?'}</button>` : '';
    const pushBtn  = canAdmin && status === 'idle' && allBoarded ? `<button class="btn btn-sm" style="background:#2563eb;color:#fff;font-size:13px" onclick="transportAction('pushing','${veh.id}')">🚌 Mark Pushing</button>` : '';
    // Dropped Off: available whenever there's any boarded state (not just during pushing),
    // so the bus can be cleared between rounds without first marking Pushing.
    const dropBtn  = canAdmin && (pushing || boarded.length > 0) ? `<button class="btn btn-sm" style="background:#16a34a;color:#fff;font-size:13px" onclick="transportAction('dropped','${veh.id}')">✅ Dropped Off</button>` : '';
    const resetBtn = canAdmin && hasState ? `<button class="btn btn-sm btn-outline" style="font-size:12px" onclick="transportAction('reset','${veh.id}')">↺ Reset</button>` : '';

    return `
      <div class="transport-bus-card" style="border-left:4px solid ${pushing ? '#2563eb' : allBoarded ? '#16a34a' : '#e2e8f0'}">
        <div class="transport-bus-header" onclick="toggleTransportExpand('${veh.id}')">
          <div>
            <span style="font-size:15px;font-weight:800">${escapeHtml(veh.label)}</span>${statusBadge}
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">${escapeHtml(veh.pax)}</div>
            ${driver.name ? `<div style="font-size:11px;color:var(--text-3)">🚗 ${escapeHtml(driver.name)}${driver.phone?' · '+escapeHtml(driver.phone):''}</div>` : ''}
          </div>
          <span style="color:var(--text-3);font-size:16px;flex-shrink:0">${isExpand ? '▲' : '▼'}</span>
        </div>
        ${driverSection}
        ${bar}
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${synChips}</div>
        ${v.boardingRemarks ? `<div style="margin-top:8px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:6px 10px;font-size:12px;color:#92400e"><b>📝 Note:</b> ${escapeHtml(v.boardingRemarks)}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          ${boardBtn}${pushBtn}${dropBtn}${resetBtn}
        </div>
        ${sitrepPanel}
        ${v.pushedAt ? `<div style="font-size:10px;color:var(--text-3);margin-top:4px">Pushed ${new Date(v.pushedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}H${v.pushedBy?' by '+escapeHtml(v.pushedBy):''}</div>` : ''}
        ${v.lastDroppedAt ? `<div style="font-size:10px;color:var(--text-3);margin-top:2px">Last dropped ${new Date(v.lastDroppedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}H</div>` : ''}
      </div>`;
  }

  container.innerHTML = `
    <div style="padding:0 0 32px">
      <div class="section-title" style="margin:12px 12px 8px">✈️ Flights</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin:0 12px">
        ${flightCard('flight_sq708','SQ 708','SIN → BKK','Sun 26 Apr','0930H','1100H','Changi T2 · Economy G · 25 kg · Check-in 0630–0840H · Boarding 0900H · Gate closes 0920H')}
        ${flightCard('flight_sq709','SQ 709','BKK → SIN','Thu 30 Apr','1530H','1900H','BKK Suvarnabhumi · Economy G · 25 kg · Check-in 1230–1440H · Boarding 1500H · Gate closes 1520H')}
      </div>
      <div class="section-title" style="margin:20px 12px 8px">🚌 Ground Transport</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin:0 12px">
        ${TRANSPORT_BUSES.map(b => busCard(b)).join('')}
      </div>
    </div>`;
}

async function renderTransportSubTab(container) {
  // Render immediately with cached state — no spinner flash
  _redrawTransport(container);
  // Refresh from server in background
  const data = await API.get('getTransport');
  if (data && typeof data === 'object') {
    STATE.transport = data;
    _redrawTransport(container);
  }
}

function renderReflectionsSubTab() {
  const user = STATE.currentUser;
  const reflections = STATE.reflections || [];
  const sheetUrl   = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/edit`;
  const extSheetUrl = 'https://docs.google.com/spreadsheets/d/10zMjWkHqWRhPDAHSzv_WWGpLi96csLflhsuHfBHPfng/edit';

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
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h4 style="margin:0;font-size:15px;font-weight:800">📝 Daily Reflections</h4>
        <a class="sheet-link" href="${extSheetUrl}" target="_blank" rel="noopener" style="font-size:11px;padding:4px 8px;white-space:nowrap">
          📋 Learning IC ↗
        </a>
      </div>
      <p>End-of-day syndicate reflections. Fill in each field below and tap Post — your response is visible to all and synced to the Learning IC sheet.</p>
    </div>

    ${user ? `
    <div class="visit-compose" style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-color:#818cf8;padding:14px 14px 10px">
      <div class="visit-compose-label" style="color:#3730a3;margin-bottom:12px">
        <span>✍️ Post Your Reflection</span>
        <span style="font-size:11px;font-weight:400;color:#6d6aac;margin-left:6px">· ${escapeHtml(user.shortName || user.name)} · ${escapeHtml(formatGroupDisplay(memberGroupKey(user)))}</span>
      </div>

      <div class="ref-form-field">
        <label class="ref-form-label">🔍 What did we observe?</label>
        <textarea id="ref-obs" rows="3" placeholder="• Observation 1&#10;• Observation 2"></textarea>
      </div>
      <div class="ref-form-field">
        <label class="ref-form-label">🇸🇬 What does it mean for Singapore / SAF?</label>
        <textarea id="ref-impl" rows="3" placeholder="• Implication 1&#10;• Implication 2"></textarea>
      </div>
      <div class="ref-form-field">
        <label class="ref-form-label">💡 Key Takeaway / Ah-Ha:</label>
        <textarea id="ref-ahha" rows="2" placeholder="• Key insight"></textarea>
      </div>
      <div class="ref-form-field">
        <label class="ref-form-label" style="opacity:.8">❓ Follow-up questions <span style="font-weight:400">(optional)</span></label>
        <textarea id="ref-followup" rows="2" placeholder="• Question for further inquiry"></textarea>
      </div>

      <div class="compose-toolbar" style="margin-top:10px">
        <label style="font-size:12px;color:#3730a3;font-weight:700;display:flex;align-items:center;gap:6px">Day
          <select id="reflection-day-select" style="padding:4px 8px;border-radius:6px;border:1px solid #c7d2fe;font-size:12px">
            <option value="">—</option>
            ${DAYS.map(d => `<option value="${d.day}">Day ${d.day}</option>`).join('')}
          </select>
        </label>
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" onclick="postReflection()">Post Reflection</button>
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
    syndicate: formatGroupDisplay(memberGroupKey(user)),
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

  await withLoader('Posting your learning…', () => Promise.all([
    API.post('addLearning', post),
    API.post('postHotwash', {
      dayTab: String(25 + (visit?.dayNum || 1)),
      date: visit?.date || '',
      visitTitle: visit?.title || '',
      authorName: user.name,
      syndicate: formatGroupDisplay(memberGroupKey(user)),
      content: content,
      isAhha: STATE.composeAhha ? 'Ah-Ha' : ''
    })
  ]));
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
  const user = STATE.currentUser;
  if (!user) return toast('Sign in first');
  const obs      = (el('ref-obs')?.value      || '').trim();
  const impl     = (el('ref-impl')?.value     || '').trim();
  const ahha     = (el('ref-ahha')?.value     || '').trim();
  const followup = (el('ref-followup')?.value || '').trim();
  if (!obs && !impl && !ahha) return toast('Fill in at least one field');
  // Concatenate into the standard template format so the server-side
  // section parser (_parseReflectionSections) can split it correctly.
  const parts = [];
  if (obs)      parts.push(`What did we observe?\n${obs}`);
  if (impl)     parts.push(`What does it mean for Singapore / SAF?\n${impl}`);
  if (ahha)     parts.push(`Key Takeaway / Ah-Ha:\n${ahha}`);
  if (followup) parts.push(`Follow-up questions:\n${followup}`);
  const content = parts.join('\n\n');
  const day = el('reflection-day-select')?.value || '';
  const post = {
    authorId:  user.id,
    authorName: user.name,
    syndicate:  formatGroupDisplay(memberGroupKey(user)),
    day,
    content,
    timestamp: new Date().toISOString()
  };
  STATE.reflections.unshift(post);
  // Clear all fields
  ['ref-obs','ref-impl','ref-ahha','ref-followup'].forEach(id => { const el2 = el(id); if (el2) el2.value = ''; });
  await withLoader('Posting reflection…', () => API.post('addReflection', post));
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
  const ok = await withLoader('Sending Incident Report…', () => TELEGRAM.sendRouted('M1_ir', window._irText, 'Markdown'));
  if (!ok) return toast('❌ Telegram send failed');
  toast('✅ IR sent!');
  await API.post('addIncident', {
    reportedBy: STATE.currentUser?.id || 'unknown',
    actor: STATE.currentUser?.id || '',
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
    reportedByName: el('ir-by')?.value || ''
  });
};

window.copyIR = function() {
  if (!window._irText) return;
  navigator.clipboard.writeText(window._irText).then(() => toast('📋 Copied'));
};

// ═══════════ SOP TAB ═════════════════════════════════════════
function renderSOP() {
  const sub = STATE.sopSubTab || 'sops';
  const me = STATE.currentUser;
  const myRole = (me?.role || '').toLowerCase();
  // Only Syn IC / SL / Dy SL / admin may file IRs. Everyone else sees a
  // hand-off notice directing them to their Syn IC + SL first.
  const canFileIR = isAdmin() || /syn ic|\bsl\b|dy sl|dysl/.test(myRole);

  const header = `
    <div class="subtab-row" id="sop-subtabs">
      <button class="subtab-btn ${sub === 'sops' ? 'active' : ''}" onclick="setSopSubTab('sops')">🛡️ SOPs</button>
      <button class="subtab-btn ${sub === 'ir'   ? 'active' : ''}" onclick="setSopSubTab('ir')">🚨 Incident Report for Syn IC</button>
    </div>`;

  if (sub === 'ir') {
    if (!canFileIR) {
      el('tab-sop').innerHTML = `${header}
        <div class="alert alert-red" style="margin:14px 0">
          🚨 <b>For all members:</b> call your Syn IC and SL first. They will file the Incident Report.
        </div>
        <div class="section-title">Emergency Contacts</div>
        <div class="contact-grid" style="margin-bottom:12px">
          ${EMERGENCY_CONTACTS.map(c => `<a class="contact-card" href="tel:${c.dial || c.number}"><div class="c-flag">${c.flag}</div><div class="c-label">${c.label}</div><div class="c-number">${c.number}</div></a>`).join('')}
        </div>`;
      return;
    }
    // IR form lives in #tab-ir in the DOM. Render it, then hoist the body
    // under the SOP sub-tab header so the whole flow is inside SOP.
    renderIR();
    const irHtml = el('tab-ir')?.innerHTML || '';
    el('tab-sop').innerHTML = header + irHtml;
    return;
  }

  el('tab-sop').innerHTML = `${header}
    <div class="alert alert-red" style="margin-bottom:12px">
      🚨 <b>For All — Call Syn IC & SL first.</b> IR submissions are filed by Syn IC only.
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
window.setSopSubTab = function(sub) {
  STATE.sopSubTab = sub;
  renderSOP();
};
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
  // Legacy code path — evening/midnight sitreps are now server-side triggers.
  // Route to M5_sitrep for backward compat if anyone still calls sendReport.
  const ok = await withLoader('Sending SITREP…', () => TELEGRAM.sendRouted('M5_sitrep', msg, 'HTML'));
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
        ${grp.map(m => {
          const isAdm = (m.isAdmin === true || m.isAdmin === 'true' || m.isAdmin === 'TRUE');
          return `
          <div class="mgr-row">
            <div class="mgr-info">
              <div class="mgr-name">${escapeHtml(m.name)}${isAdm ? ' <span class="mgr-admin-badge">👑 ADMIN</span>' : ''}</div>
              <div class="mgr-meta">${escapeHtml(m.role || '')}${m.rank ? ' · '+escapeHtml(m.rank) : ''} · ${escapeHtml(m.shortName || '—')}</div>
            </div>
            <button class="mgr-edit-btn" onclick="openMemberEditor('${m.id}')">Edit</button>
          </div>`;
        }).join('')}
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
  const adminSel = el('ed-admin');
  if (adminRow) adminRow.classList.toggle('hidden', !isSuperAdmin);
  if (adminSel) adminSel.value = (m && (m.isAdmin === true || m.isAdmin === 'true')) ? 'true' : 'false';
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
    payload.isAdmin = el('ed-admin')?.value === 'true' ? 'true' : 'false';
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
  refreshRosterDependentTabs();
};

window.deleteMemberConfirm = async function() {
  if (!_editingMemberId) return;
  const m = getMemberById(_editingMemberId);
  if (!confirm(`Remove ${m?.name}?`)) return;
  // Invalidate the hash so syncMembers can't early-return and skip re-seed
  _lastMembersHash = '';
  MEMBERS = MEMBERS.filter(x => x.id !== _editingMemberId);
  await API.post('deleteMember', { id: _editingMemberId, actor: STATE.currentUser?.id || '' });
  hideMemberEditor();
  await syncMembers();
  renderMembersList();
  refreshRosterDependentTabs();
  toast('🗑 Removed');
};

// Re-render every tab whose contents depend on the member roster (counts,
// filter chips, syndicate groups, parade state). Called after any member
// add/edit/delete. Forces render regardless of anyModalOpen() because the
// user initiated this action and expects to see the result immediately.
function refreshRosterDependentTabs() {
  if (STATE.currentTab === 'home')     renderHome();
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.currentTab === 'rooms')    renderRooms();
  if (STATE.currentTab === 'map')      updateMapMarkers?.();
  renderPinnedActionBar();
}

// ═══════════ APP STARTUP ═════════════════════════════════════
function startApp() {
  applySavedSize();
  applyTheme();
  applyBackgroundPrefs();
  applySavedLayout();
  el('loading').style.display = 'none';
  el('app').classList.add('visible');
  updateQueueIndicator();
  flushQueue();  // drain anything queued from a previous offline session
  maybeShowChangelog();
  maybeShowInstallHint();
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
  refreshFx();
  setInterval(refreshWeather, 30 * 60 * 1000);  // every 30 min
  setInterval(refreshFx, 60 * 60 * 1000);       // every hour (rate doesn't move fast)
  startPolling();
  seedIfEmpty();
  // Load Telegram routing config — EVERY user needs this so M-series sends
  // respect the super-admin's chat-ID + enable/disable settings. Before this
  // fix, PWA Telegram sends went to hardcoded CONFIG defaults regardless of
  // what was saved in Settings.
  loadTelegramConfig();
  setupReportReminders();
  setupSyn1AutoReports();
  setupModalSwipes();
  setupCalendarSwipe();
  setupTrackerSwipe();
  setupSopSwipe();
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
  await withLoader('Refreshing…', async () => {
    try {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting) {
              reg.waiting.postMessage('SKIP_WAITING');
              toast('⬇️ New version, reloading…');
              return;
            }
          }
        } catch {}
      }
      // Kick a GCal pull first so any edits you made in Google Calendar
      // land in the Sheet before we re-read it. Fail-soft: ignore errors
      // (cron still covers the background case).
      try { await API.get('syncFromGoogleCalendar'); } catch {}
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
  });
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
    // Fire-and-forget member sync so the roster (and each member's latest PIN)
    // is current before anyone picks their name and enters their PIN. Without
    // this, a fresh device / post-logout uses the stale DEFAULT_MEMBERS seed
    // where everyone's PIN is '0000' — causing 'new PIN doesn't work' bugs.
    showLoginFlow();
    syncMembers().then(() => {
      // Re-render the syndicate list in case roster counts changed.
      if (!el('login-step-syn').classList.contains('hidden')) renderLoginSyndicateList();
    }).catch(() => {});
  }
});

// ═══════════ ROOMS TAB ═══════════════════════════════════════
function renderRooms() {
  const user = STATE.currentUser;
  const myStatus = getStatusOf(user?.id || '');
  const myRoom = myStatus.roomNumber || '';
  // Rooms has its own filter state so it doesn't clobber / get clobbered by
  // the Tracker list's syndicate filter.
  if (STATE.roomsFilter == null) STATE.roomsFilter = 'all';
  const filter = STATE.roomsFilter;
  const groups = visibleGroups();
  if (!STATE.expandedRoomsGroups) STATE.expandedRoomsGroups = new Set();
  // Non-admins viewing their single syndicate get it expanded BY DEFAULT
  // (one-time, first render only). After that, their toggle state wins —
  // otherwise they could never collapse it. We track the 'seeded' flag
  // in state so the default only applies once per session.
  if (!STATE._roomsAutoExpanded && !canSeeAllSyndicates() && groups.length === 1) {
    STATE.expandedRoomsGroups.add(groups[0]);
    STATE._roomsAutoExpanded = true;
  }

  const groupSections = groups.map(gk => {
    if (filter !== 'all' && filter !== gk) return '';
    const members = membersInGroup(gk);
    if (!members.length) return '';
    const isOpen = STATE.expandedRoomsGroups.has(gk);
    const rows = !isOpen ? '' : members.map(m => {
      const st = getStatusOf(m.id);
      const rm = st.roomNumber || '';
      const isMe = user && m.id === user.id;
      return `
        <div class="room-row" ${isMe ? 'data-me="1"' : ''}>
          <div class="room-number ${rm ? '' : 'empty'}">${rm || '—'}</div>
          <div style="flex:1">
            <div class="room-member-name">${escapeHtml(m.name)}${isMe ? ' <span class="you-pill">(You)</span>' : ''}</div>
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
        `<button class="filter-chip ${filter === s ? 'active' : ''}" onclick="setRoomsFilter('${s.replace(/'/g, "\\'")}')">${s === 'all' ? 'All' : formatGroupDisplay(s)}</button>`
      ).join('')
    : '';

  // Render directly into whichever container is actually visible. When
  // Rooms is a Tracker sub-tab, the live DOM is #tracker-rooms-wrap;
  // #tab-rooms is off-screen and rendering there doesn't reach the user.
  const target = el('tracker-rooms-wrap')?.offsetParent
    ? el('tracker-rooms-wrap')
    : el('tab-rooms');
  if (!target) return;
  target.innerHTML = `
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
  const pct = total ? Math.round(inC / total * 100) : 0;
  const tick = pct === 100 ? '✅' : '⚠️';

  // Simplified format per spec:
  //   ADHOC SITREP (bold)
  //   HHMMH
  //
  //   In Hotel
  //   57 SYN 1: 10/11 (91%) ⚠️
  //
  //   Refer to TSV App for Details
  const bkk = bkkNow();
  const hhmm = options.timeLabel || bkk.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Bangkok' }).replace(':','');

  let msg = `<b>ADHOC SITREP</b>\n${hhmm}H\n\n`;
  msg += `In Hotel\n`;
  msg += `${formatGroupDisplay(groupKey)}: ${inC}/${total} (${pct}%) ${tick}\n\n`;
  msg += `Refer to TSV App for Details`;
  return msg;
}

window.sendSyndicateSITREP = async function(groupKey, auto) {
  const msg = buildSyndicateSITREP(groupKey);
  if (!auto) {
    if (!confirm(`Send this SITREP?\n\n${msg}`)) return;
  }
  const send = () => TELEGRAM.sendRouted('M5_sitrep', msg.replace(/\n/g, '\n'), 'HTML');
  const ok = auto ? await send() : await withLoader(`Sending ${formatGroupDisplay(groupKey)} SITREP…`, send);
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
  const isSuperAdmin = user.id === CONFIG.superAdminId;
  const canSeeAdmin = hasAdminRights() || !hasAdminRights();   // everyone sees Admin tab (request flow is there too)
  // Default sub-tab
  if (!STATE.settingsSubTab) STATE.settingsSubTab = 'me';
  const sub = STATE.settingsSubTab;
  const adminReqs = STATE.adminRequests || [];
  const pendingReqs = adminReqs.filter(r => r.status === 'pending');
  const pendingBadge = (isSuperAdmin && pendingReqs.length) ? ` <span style="display:inline-block;background:#ef4444;color:#fff;border-radius:10px;padding:0 6px;font-size:10px;font-weight:800;margin-left:4px">${pendingReqs.length}</span>` : '';

  const showAdmin = hasAdminRights() || isSuperAdmin;
  const subtabBar = `
    <div class="subtab-bar" style="display:flex;gap:6px;padding:10px 12px 6px;overflow-x:auto">
      <button class="subtab-btn ${sub === 'me'          ? 'active' : ''}" onclick="setSettingsSubTab('me')">👤 Me</button>
      <button class="subtab-btn ${sub === 'display'     ? 'active' : ''}" onclick="setSettingsSubTab('display')">🎨 Display</button>
      ${showAdmin ? `<button class="subtab-btn ${sub === 'admin-tele'   ? 'active' : ''}" onclick="setSettingsSubTab('admin-tele')">📡 Admin · Tele</button>` : ''}
      ${showAdmin ? `<button class="subtab-btn ${sub === 'admin-others' ? 'active' : ''}" onclick="setSettingsSubTab('admin-others')">🔐 Admin · Others${pendingBadge}</button>` : ''}
    </div>`;

  // Guard: if saved sub-tab no longer valid (e.g. non-admin had 'admin-tele'), reset
  if ((sub === 'admin-tele' || sub === 'admin-others') && !showAdmin) {
    STATE.settingsSubTab = 'me';
    return renderSettings();
  }

  let body = '';
  if (sub === 'me')                body = _renderSettingsMe(user, gk);
  else if (sub === 'display')      body = _renderSettingsDisplay();
  else if (sub === 'admin-tele')   body = _renderSettingsAdminTele(user, isSuperAdmin);
  else if (sub === 'admin-others') body = _renderSettingsAdminOthers(user, isSuperAdmin, pendingReqs);

  container.innerHTML = subtabBar + `<div id="settings-sub-content">${body}</div>`;

  // Post-render hooks scoped to each admin sub-tab
  if (sub === 'admin-tele' && isSuperAdmin) {
    const cachedTg = (() => { try { return JSON.parse(localStorage.getItem('tsv_tg_config') || 'null'); } catch { return null; } })();
    if (cachedTg) _renderTelegramConfig(cachedTg, true);
    API.get('getTelegramConfig').then(cfg => {
      if (!cfg) {
        if (!cachedTg) {
          const c = el('tg-config-container');
          if (c) c.innerHTML = `<div style="padding:12px 16px;color:#b91c1c;font-size:12px">⚠️ Could not load Telegram config — check connection and reload.</div>`;
        }
        return;
      }
      localStorage.setItem('tsv_tg_config', JSON.stringify(cfg));
      STATE.telegramConfig = cfg;
      _renderTelegramConfig(cfg, false);
    });
  }
  if (sub === 'admin-others' && isSuperAdmin) {
    const cachedFi = (() => { try { return JSON.parse(localStorage.getItem('tsv_forcein_config') || 'null'); } catch { return null; } })();
    if (cachedFi) _renderForceInConfig(cachedFi, true);
    API.get('getForceInConfig').then(cfg => {
      if (!cfg) {
        if (!cachedFi) {
          const c = el('force-in-container');
          if (c) c.innerHTML = `<div style="padding:12px 16px;color:#b91c1c;font-size:12px">⚠️ Could not load force-in config — check connection.</div>`;
        }
        return;
      }
      localStorage.setItem('tsv_forcein_config', JSON.stringify(cfg));
      _renderForceInConfig(cfg, false);
    });
  }
}

window.setSettingsSubTab = function(sub) {
  STATE.settingsSubTab = sub;
  renderSettings();
};

// ── Settings: ME sub-tab (Account + Session) ──
function _renderSettingsMe(user, gk) {
  return `
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
      <div class="settings-row">
        <div class="sr-label">Install as App
          <div class="sr-value">Add to home screen — iOS + Android</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="showInstallGuide()">📱 Guide</button>
      </div>
      <div class="settings-row">
        <div class="sr-label">Report a Problem
          <div class="sr-value">Something not working? Send Caspar a direct message</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="showErrorReport()">🐛 Submit Error</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-header">🚪 Session</div>
      <div class="settings-row">
        <div class="sr-label">Sign out
          <div class="sr-value">Back to login screen</div>
        </div>
        <button class="btn btn-red btn-sm" onclick="if(confirm('Sign out?'))logout()">Sign Out</button>
      </div>
    </div>`;
}

// ── Settings: DISPLAY sub-tab (theme, size, layout) ──
function _renderSettingsDisplay() {
  const sizePref = localStorage.getItem('tsv_size') || 'md';
  const themePref = localStorage.getItem('tsv_theme') || 'auto';
  return `
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
    </div>`;
}

// ── Settings: ADMIN sub-tab (Access + Telegram config + pending requests) ──
// ── Admin · Tele (super admin only — Telegram routing config) ──
function _renderSettingsAdminTele(user, isSuperAdmin) {
  if (!isSuperAdmin) {
    return `<div class="alert alert-orange" style="margin:12px">Super-admin only. Ask Caspar to grant access.</div>`;
  }
  return `
    <div class="settings-section">
      <div class="settings-section-header">📡 Telegram Chat Routing</div>
      <div style="padding:8px 16px 0;font-size:12px;color:var(--text-3);line-height:1.5">
        Each routing key controls a message type. Tick to <b>enable</b>, untick to <b>silence</b>.
        Paste chat ID to override the default destination. 🧪 Test fires the actual template to verify.
      </div>
      <div id="tg-config-container">
        <div style="padding:12px 16px;color:var(--text-3);font-size:12px">Loading…</div>
      </div>
      <div style="padding:8px 16px 14px">
        <button class="btn btn-primary btn-sm" style="width:100%" onclick="saveTelegramConfig()">💾 Save Routing Config</button>
      </div>
    </div>`;
}

// ── Admin · Others (Access, Force-In, Pending requests) ──
function _renderSettingsAdminOthers(user, isSuperAdmin, pendingReqs) {
  const access = hasAdminRights() ? `
      <div class="settings-row">
        <div class="sr-label">You have Admin rights
          <div class="sr-value">You can see all syndicates, send reports, manage members</div>
        </div>
        <span style="font-size:22px">👑</span>
      </div>
      <div class="settings-row">
        <div class="sr-label">Database
          <div class="sr-value">Raw Google Sheet — TSV master DB</div>
        </div>
        <a class="btn btn-outline btn-sm" href="https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/edit" target="_blank" rel="noopener">View DB ↗</a>
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div class="sr-label">View as…
          <div class="sr-value">Declutter the app by hiding admin-only controls</div>
        </div>
        <div class="theme-chooser">
          <button class="${localStorage.getItem('tsv_admin_view_as') !== 'non-admin' ? 'active' : ''}" onclick="setAdminView('admin')">👑<br>Full Admin</button>
          <button class="${localStorage.getItem('tsv_admin_view_as') === 'non-admin' ? 'active' : ''}" onclick="setAdminView('non-admin')">👤<br>Non-Admin</button>
        </div>
      </div>` : `
      <div class="settings-row">
        <div class="sr-label">Request Admin Rights
          <div class="sr-value">Lets you see all syndicates in Tracker / Rooms</div>
        </div>
        <button class="btn btn-gold btn-sm" onclick="requestAdminRights()">Request</button>
      </div>`;

  const pendingBlock = (isSuperAdmin && pendingReqs.length) ? `
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
      </div>` : '';

  const forceInSection = isSuperAdmin ? `
    <div class="settings-section">
      <div class="settings-section-header">🚨 0130H Auto Force-In</div>
      <div style="padding:8px 16px 0;font-size:12px;color:var(--text-3);line-height:1.5">
        Selected groups are <b>automatically marked IN at 0130H BKK</b> every night (30 min before the 0200H curfew sitrep). Other groups retain their real status.
      </div>
      <div id="force-in-container">
        <div style="padding:12px 16px;color:var(--text-3);font-size:12px">Loading…</div>
      </div>
      <div style="padding:0 16px 14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="testForceInNow()">⚡ Run Now (QC)</button>
        <button class="btn btn-primary btn-sm" onclick="saveForceInConfig()">💾 Save Selection</button>
      </div>
    </div>` : '';

  return `
    <div class="settings-section">
      <div class="settings-section-header">🔐 Access</div>
      ${access}
      ${pendingBlock}
    </div>
    ${forceInSection}`;
}

function _renderTelegramConfig(cfg, fromCache) {
  const c = el('tg-config-container');
  if (!c) return;
  const keys = Object.keys(cfg);
  STATE.telegramConfigKeys = keys;
  STATE.telegramConfigFresh = !fromCache;
  // Also update the live routing state so saves take effect without a reload
  STATE.telegramConfig = cfg;
  c.innerHTML = `
    ${fromCache ? `<div style="padding:4px 16px 8px;font-size:10px;color:var(--text-3)">Showing cached · refreshing from server…</div>` : ''}
    ${keys.map(k => {
      const entry = cfg[k];
      const enabled = entry.enabled !== false;
      const isCustom = entry.chatId !== entry.defaultId;
      return `
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px;${enabled ? '' : 'opacity:.55'}">
        <div style="display:flex;gap:8px;align-items:center">
          <label class="tg-toggle" style="display:inline-flex;align-items:center;cursor:pointer;user-select:none;flex-shrink:0">
            <input type="checkbox" id="tgen-${k}" ${enabled ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--blue-600);margin-right:6px">
            <span class="sr-label" style="font-weight:700">${escapeHtml(entry.label)}</span>
          </label>
          ${enabled ? '' : `<span style="font-size:10px;background:#fee2e2;color:#991b1b;padding:1px 7px;border-radius:10px;font-weight:700">OFF</span>`}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input id="tgcfg-${k}" type="text" value="${escapeHtml(entry.chatId)}"
            style="flex:1;border:1px solid var(--border);border-radius:7px;padding:6px 10px;font-size:12px;font-family:monospace;background:var(--card);color:var(--text)">
          <button class="btn btn-sm btn-outline" style="font-size:11px;padding:5px 8px;white-space:nowrap" onclick="testTelegramChat('${k}')">🧪 Test</button>
        </div>
        <div style="font-size:10px;color:var(--text-3)">Default: ${escapeHtml(entry.defaultId)}${isCustom ? ' · <b style="color:var(--blue-500)">custom</b>' : ''}</div>
      </div>`;
    }).join('')}
    <div style="padding:8px 16px 0;font-size:11px;color:var(--text-3)">
      💡 Tick to <b>enable</b> a routing key. Untick to <b>silence</b> it (server skips sends for that key).
      <br>🧪 Test fires the actual template to the current input value — verify before saving.
    </div>
  `;
}

// Fire the ACTUAL message template for a given routing key to the test chat ID.
// Lets super-admin QC the real format before committing a chat ID change.
window.testTelegramChat = async function(key) {
  const input = el(`tgcfg-${key}`);
  const chatId = (input?.value || '').trim();
  if (!chatId) return toast('Chat ID is empty');
  // Heavy templates (A3/A4 sitrep) can take 5–10s on Apps Script cold start,
  // so show a proper loader instead of a fire-and-forget toast.
  const resp = await withLoader(`📤 Sending ${key} template…`, () =>
    API.postRaw('testRouting', { key, chatId, actor: STATE.currentUser?.id || 'system' })
  );
  // Diagnostic: tell the user *why* it failed, not a vague "offline?"
  if (resp === null) {
    if (!navigator.onLine)        return toast('❌ You are offline — check Wi-Fi/cell');
    const reason = STATE.lastApiError || 'network error';
    // GAS cold start or heavy A3/A4 sitrep can hit the 30s web-app timeout
    return toast('❌ ' + reason + ' — retry in 5s');
  }
  if (resp.ok === false)          return toast('❌ Server error: ' + (resp.error || resp.description || 'unknown'));
  const inner = resp.data;
  if (!inner)                     return toast('❌ Empty response from server');
  if (inner.ok === false)         return toast('❌ ' + (inner.error || 'Send rejected by server'));
  toast('✅ ' + (inner.sent || 'Sent') + ' — QC in Telegram');
};

window.saveTelegramConfig = async function() {
  const keys = STATE.telegramConfigKeys || [];
  if (!keys.length) return toast('Config not loaded yet — wait a moment and retry');
  // Send full { chatId, enabled } per key so the server persists both.
  const chats = {};
  keys.forEach(k => {
    const input = el(`tgcfg-${k}`);
    const toggle = el(`tgen-${k}`);
    chats[k] = {
      chatId:  (input?.value || '').trim(),
      enabled: toggle ? !!toggle.checked : true
    };
  });
  toast('💾 Saving…');
  const resp = await API.postRaw('updateTelegramConfig', { chats, actor: STATE.currentUser?.id });
  if (!resp)                    return toast('❌ Save failed — no response (offline?)');
  if (resp.ok === false)        return toast('❌ Save failed — ' + (resp.error || 'server error'));
  const result = resp.data;
  if (!result)                  return toast('❌ Save failed — empty response');
  // Update live STATE so the very next send honours the new routing without reload
  STATE.telegramConfig = result;
  localStorage.setItem('tsv_tg_config', JSON.stringify(result));
  _renderTelegramConfig(result, false);
  const enabledCount = Object.values(result).filter(v => v.enabled).length;
  toast(`✅ Saved · ${enabledCount}/${keys.length} routing keys enabled`);
};

// ── Telegram routing config: load into STATE on startup ──────
// Used by TELEGRAM.sendRouted() — reads chat ID + enabled flag per key.
function loadTelegramConfig() {
  // 1) Hydrate from localStorage cache immediately so routing works even
  //    before the server responds (offline-tolerant).
  try {
    const cached = JSON.parse(localStorage.getItem('tsv_tg_config') || 'null');
    if (cached) STATE.telegramConfig = cached;
  } catch {}
  // 2) Refresh from server and update cache + STATE.
  API.get('getTelegramConfig').then(cfg => {
    if (!cfg) return;
    STATE.telegramConfig = cfg;
    localStorage.setItem('tsv_tg_config', JSON.stringify(cfg));
  }).catch(() => {});
}

// ── Force-in config (0130H Auto-Force-IN groups) ──────────────
function _renderForceInConfig(cfg, fromCache) {
  const c = el('force-in-container');
  if (!c) return;
  STATE.forceInConfig = cfg;
  const last = cfg.lastRun;
  const lastLine = last ? `
    <div style="padding:6px 16px 10px;font-size:11px;color:var(--text-3)">
      🕐 Last enforced: <b>${new Date(last.lastRunAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}H</b>
      · ${last.count} members · [${(last.groups||[]).join(', ') || 'none'}]
    </div>` : '';
  const rows = (cfg.groups || []).map(g => {
    const checked = g.selected ? 'checked' : '';
    return `
      <label class="settings-row" style="gap:10px;cursor:pointer;user-select:none">
        <input type="checkbox" id="fi-${g.gk.replace(/[^a-z0-9]/gi,'_')}" ${checked}
          data-gk="${escapeHtml(g.gk)}"
          style="width:20px;height:20px;accent-color:var(--blue-600);flex-shrink:0">
        <div class="sr-label" style="flex:1">
          ${escapeHtml(g.label)}
          <div class="sr-value">${g.count} ${g.count === 1 ? 'member' : 'members'} · <span style="font-family:monospace;font-size:10px;opacity:.7">${escapeHtml(g.gk)}</span></div>
        </div>
        ${g.selected ? `<span style="font-size:11px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:2px 7px;border-radius:10px;font-weight:700;white-space:nowrap">🚨 LIVE</span>` : ''}
      </label>`;
  }).join('');
  c.innerHTML = `
    ${fromCache ? `<div style="padding:4px 16px 0;font-size:10px;color:var(--text-3)">Showing cached · refreshing…</div>` : ''}
    ${rows}
    ${lastLine}
  `;
}

window.saveForceInConfig = async function() {
  const cfg = STATE.forceInConfig;
  if (!cfg) return toast('Config not loaded yet');
  const selected = [];
  (cfg.groups || []).forEach(g => {
    const cbId = `fi-${g.gk.replace(/[^a-z0-9]/gi,'_')}`;
    const cb = el(cbId);
    if (cb && cb.checked) selected.push(g.gk);
  });
  toast('💾 Saving…');
  const resp = await API.postRaw('updateForceInConfig', { groups: selected, actor: STATE.currentUser?.id });
  if (!resp)                return toast('❌ Save failed — no response');
  if (resp.ok === false)    return toast('❌ ' + (resp.error || 'Save rejected'));
  const result = resp.data;
  if (!result)              return toast('❌ Empty response');
  localStorage.setItem('tsv_forcein_config', JSON.stringify(result));
  _renderForceInConfig(result, false);
  const label = selected.length ? selected.join(', ') : 'none (auto-force-in disabled)';
  toast('✅ Saved: ' + label);
};

// Manually fire the 0130H force-in now (useful for QC / demo)
window.testForceInNow = async function() {
  const cfg = STATE.forceInConfig;
  const groups = cfg?.selected || [];
  const groupLabel = groups.length ? groups.join(', ') : 'DEFAULT (Syn 1)';
  if (!confirm(`Force groups to IN right now?\n\n[${groupLabel}]\n\nThis overrides any current "out" status for members in these groups. Use for QC / between curfew windows only.`)) return;
  const result = await withLoader('⚡ Forcing groups IN…',
    () => API.get('testForceSyn1AllIn')
  );
  if (!result) return toast('❌ No response — ' + (STATE.lastApiError || 'retry'));
  toast('✅ ' + result);
  // Refresh the config to update the "last enforced" badge
  API.get('getForceInConfig').then(fresh => {
    if (fresh) {
      localStorage.setItem('tsv_forcein_config', JSON.stringify(fresh));
      _renderForceInConfig(fresh, false);
    }
  });
  // Also refresh statuses so the Tracker tab shows the new state
  syncStatuses().catch(() => {});
};

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

window.changeMyPin = function() {
  // iOS PWAs have an unreliable prompt() — it shows a text keyboard and can
  // cause app suspension. Use a proper modal with a numeric-only input.
  const modal = el('pin-change-modal');
  if (!modal) return;
  const input = el('pin-change-input');
  if (input) { input.value = ''; setTimeout(() => input.focus(), 100); }
  el('pin-change-hint').textContent = 'Enter exactly 4 digits';
  el('pin-change-hint').style.color = 'var(--text-3)';
  modal.classList.remove('hidden');
};

window.hidePinChange = function() {
  el('pin-change-modal')?.classList.add('hidden');
};

// ═══════════ SUBMIT ERROR ═════════════════════════════════════
// Sends a DM to Caspar via the LifeLongLearner bot describing what went
// wrong, with auto-attached user + device + version context so issues
// can be triaged without 5 back-and-forth questions.
window.showErrorReport = function() {
  const modal = el('error-report-modal');
  if (!modal) return;
  const ta = el('er-description');
  if (ta) { ta.value = ''; setTimeout(() => ta.focus(), 100); }
  const hint = el('er-hint');
  if (hint) {
    hint.textContent = 'At least 8 characters so Caspar knows what to look for.';
    hint.style.color = 'var(--text-3)';
  }
  modal.classList.remove('hidden');
};
window.hideErrorReport = function() {
  el('error-report-modal')?.classList.add('hidden');
};
window.submitErrorReport = async function() {
  const ta = el('er-description');
  const hint = el('er-hint');
  const desc = (ta?.value || '').trim();
  if (desc.length < 8) {
    hint.textContent = '⚠️ Give me at least a sentence so I can help.';
    hint.style.color = 'var(--red-500, #dc2626)';
    ta?.focus();
    return;
  }
  const u = STATE.currentUser;
  const when = bkkNow().toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Bangkok' });
  const groupLabel = u ? formatGroupDisplay(memberGroupKey(u)) : '—';
  const userLabel  = u ? `${u.name}${u.role ? ' · ' + u.role : ''} · ${groupLabel}` : 'Not signed in';
  const device = navigator.userAgent.replace(/ Mozilla\/.+?\) /, ' ').slice(0, 140);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const tab = STATE.currentTab || '—';
  const queue = (()=>{ try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]').length; } catch { return 0; } })();
  const apiState = STATE.apiState || '—';

  const msg =
    `🐛 <b>TSV App Error</b>\n` +
    `<b>From:</b> ${escapeHtml(userLabel)}\n` +
    `<b>When:</b> ${escapeHtml(when)} BKK\n` +
    `<b>App:</b> ${APP_VERSION}${standalone ? ' (installed)' : ' (browser)'}\n` +
    `<b>Tab:</b> ${escapeHtml(tab)} · API: ${escapeHtml(apiState)} · Queue: ${queue}\n` +
    `<b>Device:</b> <code>${escapeHtml(device)}</code>\n` +
    `\n<b>Description</b>\n${escapeHtml(desc)}`;

  // Send as a DM to Caspar (super-admin's Telegram user ID). Bot can DM
  // him because Caspar has already interacted with it (it's HIS bot).
  const CASPAR_TG_ID = '922547929';
  hint.textContent = '📤 Sending…';
  hint.style.color = 'var(--text-3)';
  const ok = await withLoader('Sending error report…', () => TELEGRAM.send(msg, CASPAR_TG_ID, 'HTML'));
  if (ok) {
    toast('✅ Error report sent — Caspar will take a look');
    hideErrorReport();
  } else {
    hint.textContent = '❌ Couldn\'t send. Check connection and try again.';
    hint.style.color = 'var(--red-500, #dc2626)';
  }
};

// ═══════════ INSTALL GUIDE ════════════════════════════════════
window.showInstallGuide = function() {
  // Auto-detect platform so the correct tab opens first
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  setInstallTab(isAndroid ? 'android' : 'ios');
  el('install-guide-modal')?.classList.remove('hidden');
  // Also update the displayed URL to the live origin so the user can share it
  const urlEl = el('install-url-text');
  if (urlEl) urlEl.textContent = location.origin + location.pathname.replace(/\/[^\/]*$/, '/');
};
window.hideInstallGuide = function() {
  el('install-guide-modal')?.classList.add('hidden');
};
window.setInstallTab = function(which) {
  ['ios','android'].forEach(t => {
    const tab = el('ig-tab-' + t);
    const panel = el('ig-panel-' + t);
    if (tab) tab.classList.toggle('active', t === which);
    if (panel) panel.classList.toggle('hidden', t !== which);
  });
};
window.copyInstallUrl = function() {
  const url = el('install-url-text')?.textContent || location.href;
  navigator.clipboard.writeText(url).then(() => toast('📋 Link copied'));
};
window.dismissInstallHint = function() {
  localStorage.setItem('tsv_install_hint_dismissed', '1');
  el('install-hint')?.classList.add('hidden');
};

// Auto-show the install hint if:
//   - app is NOT running standalone (i.e. still in a browser tab)
//   - user hasn't dismissed it before
function maybeShowInstallHint() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) return;
  if (localStorage.getItem('tsv_install_hint_dismissed') === '1') return;
  // Show after a short delay so it doesn't clash with boot animations
  setTimeout(() => el('install-hint')?.classList.remove('hidden'), 1500);
}

window.submitPinChange = async function() {
  const input = el('pin-change-input');
  const newPin = (input?.value || '').trim();
  const hint = el('pin-change-hint');
  if (!/^\d{4}$/.test(newPin)) {
    hint.textContent = 'PIN must be exactly 4 digits';
    hint.style.color = 'var(--red-600, #dc2626)';
    input?.focus();
    return;
  }
  const user = STATE.currentUser;
  if (!user) { hidePinChange(); return; }
  // Local update first (saved to localStorage + MEMBERS[]) so UI reflects
  // immediately even if the POST is slow. API.post auto-locks the 'members'
  // sync domain for the duration of the call so syncMembers can't race us.
  user.pin = newPin;
  saveIdentity(user);
  const idx = MEMBERS.findIndex(m => m.id === user.id);
  if (idx >= 0) MEMBERS[idx] = { ...MEMBERS[idx], pin: newPin };
  // Lock local PIN for 5 minutes against any accidental overwrite by a
  // racing syncMembers (app update reloads, SW takeover, another tab etc.)
  localStorage.setItem('tsv_pin_lock_until', String(Date.now() + 5 * 60 * 1000));
  _lastMembersHash = '';
  const ok = await withLoader('Updating your PIN…', () =>
    API.post('updateMember', { id: user.id, pin: newPin, actor: user.id })
  );
  if (!ok) {
    hint.textContent = '⚠️ Save failed — check connection';
    hint.style.color = 'var(--red-600, #dc2626)';
    return;
  }
  await syncMembers();
  // Belt-and-braces: reassert the new PIN on currentUser + MEMBERS + storage.
  // syncMembers restores from the lock but this guarantees correctness even
  // if some other code path mutated currentUser in between.
  if (STATE.currentUser) {
    STATE.currentUser.pin = newPin;
    saveIdentity(STATE.currentUser);
  }
  const idx2 = MEMBERS.findIndex(m => m.id === user.id);
  if (idx2 >= 0) MEMBERS[idx2].pin = newPin;
  hidePinChange();
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

  // Shrink the primary (Leaving/Return) so the GPS button has room for a
  // proper label. Both buttons live in the same row; GPS now flex-grows
  // and carries a 'Share GPS' / 'Stop GPS' label.
  const primary = isOut
    ? `<button class="pab-primary returning" onclick="returnToHotel()">🏨 Return</button>`
    : `<button class="pab-primary leaving"   onclick="showBuddyModal()">🚶 Leaving</button>`;

  const gps = hasGPS
    ? `<button class="pab-gps stop"  onclick="stopTracking()"><span class="pab-gps-icon">🛑</span><span class="pab-gps-label">Stop GPS</span></button>`
    : `<button class="pab-gps share" onclick="shareGPS()"><span class="pab-gps-icon">📡</span><span class="pab-gps-label">Share GPS</span></button>`;

  bar.innerHTML = primary + gps;
  bar.classList.remove('hidden');
  // Action row is now inside nav (no separate fixed element).
  // Reserve 56px of extra main-content padding-bottom for the action row.
  document.documentElement.style.setProperty('--action-h', '56px');
}

// ═══════════ STOP TRACKING ═══════════════════════════════════
// Admin: force a member's status back to In Hotel (for those without wifi/forgot to update)
// Syn IC bulk action: mark every OUT member in a syndicate as IN.
window.bulkMarkAllIn = async function(groupKey) {
  const members = membersInGroup(groupKey).filter(m => getStatusOf(m.id).status === 'out');
  if (!members.length) return toast('Everyone in ' + formatGroupDisplay(groupKey) + ' is already in');
  if (!confirm(`Mark all ${members.length} OUT member${members.length>1?'s':''} of ${formatGroupDisplay(groupKey)} as IN HOTEL?`)) return;
  const now = new Date().toISOString();
  // Optimistic local update
  for (const m of members) {
    const cur = getStatusOf(m.id);
    STATE.memberStatuses[m.id] = {
      ...cur, status: 'in_hotel', locationText: 'Hotel',
      buddyWith: '', lastUpdated: now
    };
  }
  renderLocation();
  await withLoader(`Marking ${members.length} back in hotel…`, () =>
    Promise.all(members.map(m => {
      const cur = getStatusOf(m.id);
      return API.post('updateStatus', {
        memberId: m.id, name: m.name, shortName: m.shortName,
        role: m.role, syndicate: m.syndicate,
        status: 'in_hotel', locationText: 'Hotel',
        lat: cur.lat || '', lng: cur.lng || '',
        buddyWith: '', roomNumber: cur.roomNumber || ''
      });
    }))
  );
  toast(`🏨 ${members.length} marked IN`);
};

// Syn IC / Admin: mark another member in or out. For 'out' we send them
// with a generic 'Out of Hotel' label since the IC wouldn't know the
// member's exact location — they can update later via their own device.
window.icMarkMember = async function(memberId, targetStatus) {
  const m = getMemberById(memberId);
  if (!m) return;
  const verb = targetStatus === 'out' ? 'OUT' : 'IN HOTEL';
  if (!confirm(`Mark ${m.shortName || m.name} as ${verb}?`)) return;
  const cur = getStatusOf(memberId);
  const now = new Date().toISOString();
  STATE.memberStatuses[memberId] = {
    ...cur,
    status: targetStatus === 'out' ? 'out' : 'in_hotel',
    locationText: targetStatus === 'out' ? 'Out of Hotel' : 'Hotel',
    buddyWith: targetStatus === 'in' ? '' : cur.buddyWith,
    lastUpdated: now
  };
  renderLocation();
  await withLoader(`Marking ${m.shortName || m.name} ${verb}…`, () =>
    API.post('updateStatus', {
      memberId: m.id, name: m.name, shortName: m.shortName,
      role: m.role, syndicate: m.syndicate,
      status: targetStatus === 'out' ? 'out' : 'in_hotel',
      locationText: targetStatus === 'out' ? 'Out of Hotel' : 'Hotel',
      lat: targetStatus === 'in' ? CONFIG.hotel.lat : (cur.lat || ''),
      lng: targetStatus === 'in' ? CONFIG.hotel.lng : (cur.lng || ''),
      buddyWith: targetStatus === 'in' ? '' : (cur.buddyWith || ''),
      roomNumber: cur.roomNumber || ''
    })
  );
  toast(`✓ ${m.shortName || m.name} marked ${verb}`);
};

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
  // Kill the live watcher so we stop posting new positions
  if (STATE._gpsWatchId != null) {
    try { navigator.geolocation.clearWatch(STATE._gpsWatchId); } catch {}
    STATE._gpsWatchId = null;
  }
  STATE._lastGpsSent = null;
  const cur = getStatusOf(user.id);
  STATE.memberStatuses[user.id] = { ...cur, lat: null, lng: null, lastUpdated: new Date().toISOString() };
  await withLoader('Stopping GPS share…', () =>
    API.post('updateStatus', {
      memberId: user.id, name: user.name, shortName: user.shortName,
      role: user.role, syndicate: user.syndicate,
      status: cur.status || 'in_hotel',
      locationText: cur.locationText || '',
      lat: '', lng: '',
      buddyWith: cur.buddyWith || '',
      roomNumber: cur.roomNumber || ''
    })
  );
  toast('🛑 GPS tracking stopped');
  renderPinnedActionBar();
  if (STATE.currentTab === 'location') renderLocation();
  if (STATE.map) updateMapMarkers();
};
