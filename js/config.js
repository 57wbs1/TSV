// ============================================================
// TSV PWA CONFIGURATION — edit this file before deploying
// ============================================================

const CONFIG = {

  // ----------------------------------------------------------
  // GOOGLE APPS SCRIPT API ENDPOINT
  // This connects the PWA to your Google Sheet.
  //
  // Setup (one-time, ~5 mins):
  //   1. Open your Google Sheet
  //   2. Extensions → Apps Script
  //   3. Paste the contents of apps-script/Code.gs into the editor
  //   4. Click Deploy → New Deployment → Web App
  //      - Execute as: Me
  //      - Who has access: Anyone
  //   5. Copy the Web App URL and paste below
  // ----------------------------------------------------------
  apiUrl: 'https://script.google.com/macros/s/AKfycbyrrHPMKvtAgjKUJIDfzf-VCzXddgcO4JCvJ3k7C3OqO50oF44-5esCvTID5XNRGrK3/exec',

  // Your Google Sheet ID (from the URL between /d/ and /edit)
  sheetId: '19IjTK0I_L2NXJ9afqTxf3GkCXbcONio4ORaw-54JOjY',

  // How often to refresh member statuses (milliseconds)
  pollInterval: 30000, // 30 seconds

  // ----------------------------------------------------------
  // TELEGRAM BOT
  // 1. Message @BotFather on Telegram → /newbot
  // 2. Copy the bot token below
  // 3. Add the bot to your TSV group chat
  // 4. Get chat ID: send a message in the group, then visit:
  //    https://api.telegram.org/bot<TOKEN>/getUpdates
  //    Find "chat":{"id": ...}
  // ----------------------------------------------------------
  telegram: {
    botToken: '8623156706:AAHv8vGrjxr1Kj4s8_k3EoruBlx1l_EhziQ',

    // For testing: set this to YOUR personal Telegram user ID
    // How: message @getmyid_bot in Telegram, copy the number, paste below
    // Later: replace with the group chat ID (starts with -100...)
    chatId:   '922547929',

    irChatId: '922547929',  // for IR reports

    // Syn 1 chat (for automated 2300H & 0200H reports — ONLY Syn 1 sends automatically)
    syn1ChatId: '922547929'
  },

  // ----------------------------------------------------------
  // HOTEL
  // ----------------------------------------------------------
  hotel: {
    name:    'Pullman Bangkok Hotel G',
    address: '188 Silom Road, Suriyawong, Bang Rak, Bangkok 10500',
    lat:     13.7256,
    lng:     100.5279,
    phone:   '+66 2 238 1991'
  },

  // ----------------------------------------------------------
  // LOGIN — Per-user PIN (replaces the old shared app PIN)
  // Flow: Pick syndicate → Pick name → Enter personal 4-digit PIN
  // Default PIN for pre-seeded users: '0000'
  // ----------------------------------------------------------
  defaultPin: '0000',

  // Admin member IDs — can edit calendar, manage members, send Telegram reports
  adminIds: ['caspar', 'hod', 'pds', 'sl', 'dysl'],

  // ----------------------------------------------------------
  // TRIP INFO
  // ----------------------------------------------------------
  trip: {
    name:      'GKSCSC Thailand Study Visit 2026',
    shortName: 'TSV BKK',
    startDate: '2026-04-26',
    endDate:   '2026-04-30',
    groupLabel: 'TSV'
  },

  // Report reminder times (24h hour, Bangkok = SGT)
  reports: {
    eveningHour:  23,   // 2300H parade state reminder
    midnightHour:  2    // 0200H all-in confirmation reminder
  }
};
