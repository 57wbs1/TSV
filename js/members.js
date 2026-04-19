// ============================================================
// DEFAULT MEMBER ROSTER (seed data)
// ============================================================

const DEFAULT_MEMBERS = [

  // ═══════ 57 CSC — SYNDICATE 1 ═══════
  { id: 'caspar',  name: 'Caspar',  shortName: 'Caspar',  rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'jamal',   name: 'Jamal',   shortName: 'Jamal',   rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'luke',    name: 'Luke',    shortName: 'Luke',    rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'leon',    name: 'Leon',    shortName: 'Leon',    rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'delia',   name: 'Delia',   shortName: 'Delia',   rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'charles', name: 'Charles', shortName: 'Charles', rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'dominic', name: 'Dominic', shortName: 'Dominic', rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'kenny',   name: 'Kenny',   shortName: 'Kenny',   rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'calvin',  name: 'Calvin',  shortName: 'Calvin',  rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'kj',      name: 'KJ',      shortName: 'KJ',      rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'junhao',  name: 'Junhao',  shortName: 'Junhao',  rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },
  { id: 'jayzee',  name: 'Jayzee',  shortName: 'Jayzee',  rank: '', role: 'Member', csc: '57 CSC', syndicate: '1', pin: '0000' },

  // ═══════ PSO (Principal Staff Officers) ═══════
  { id: 'pds',        name: 'LTC Roger Cheong', shortName: 'LTC Roger', rank: 'LTC', role: 'PDS',    csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'tsv_ao',     name: 'Ms Nancy',          shortName: 'Ms Nancy',  rank: '',    role: 'TSV AO', csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'jon_quek',   name: 'LTC Jon Quek',      shortName: 'LTC Jon',   rank: 'LTC', role: 'PSO',    csc: 'Staff', syndicate: 'Leadership', pin: '0000' },

  // ═══════ 57 CSC — SYNDICATE 3 ═══════
  { id: 'grace',      name: 'ME6 Grace Chng',       shortName: 'Grace',      rank: 'ME6', role: 'SL',     csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'umbra',      name: 'Umbra',                shortName: 'Umbra',      rank: '',    role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'wen_jing',   name: 'MAJ Oh Wen-Jing',      shortName: 'Wen Jing',   rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'dehong',     name: 'ME5 Yeo De Hong',      shortName: 'Dehong',     rank: 'ME5', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'glenn',      name: 'MAJ Glenn Seah',       shortName: 'Glenn',      rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'edmund_lim', name: 'MAJ Edmund Lim',       shortName: 'Edmund',     rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'phua_km',    name: 'ME5 Phua Kia Min',     shortName: 'Phua KM',    rank: 'ME5', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'edwin_chua', name: 'MAJ Edwin Chua',       shortName: 'Edwin C',    rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'sia_jx',     name: 'MAJ Sia Jun Xian',     shortName: 'Sia JX',     rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'khor_lq',    name: 'MAJ Khor Liang Quan',  shortName: 'Khor LQ',    rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'arvin',      name: 'MAJ Au Arvin',         shortName: 'Arvin',      rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'david_as',   name: 'MAJ Alsafano David',   shortName: 'David (ID)', rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'thavann',    name: 'MAJ Tha Vannchhiv',    shortName: 'Tha (KH)',   rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'yueyang',    name: 'SQN LDR Yueyang Li',   shortName: 'Yueyang (AU)', rank: 'SQN LDR', role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },

  // ═══════ 57 CSC — SYNDICATE 4 ═══════
  { id: 'alvin',       name: 'ME5 Alvin Chan',            shortName: 'Alvin',        rank: 'ME5', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'liwen',       name: 'MAJ Ooi Li Wen',            shortName: 'LiWen',        rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'oliver',      name: 'MAJ Oliver Ong',            shortName: 'Oliver',       rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'peh_mh',      name: 'MAJ Peh Ming Hui',          shortName: 'Peh MH',       rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'jason_lim',   name: 'ME5 Jason Lim',             shortName: 'Jason L',      rank: 'ME5', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'timothy_oh',  name: 'MAJ Timothy Oh',            shortName: 'Timothy',      rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'lian_jj',     name: 'MAJ Lian Jia Jing',         shortName: 'Lian JJ',      rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'edwin_tan',   name: 'MAJ Edwin Tan',             shortName: 'Edwin T',      rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'tor_jw',      name: 'MAJ Tor Jun Wei',           shortName: 'Tor JW',       rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'william_chang', name: 'MAJ William Chang',       shortName: 'William',      rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'lim_ws',      name: 'MAJ Lim Wei Siong',         shortName: 'Lim WS',       rank: 'MAJ', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'oliver_w',    name: 'LTC Oliver Wallkötter',     shortName: 'Oliver W (DE)', rank: 'LTC', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'ittichai',    name: 'WG CDR Ittichai Nimma',     shortName: 'Ittichai (TH)', rank: 'WG CDR', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'daniel_e',    name: 'LT CDR Daniel Bin Erfanizun', shortName: 'Daniel (MY)', rank: 'LT CDR', role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },

  // ═══════ 25th CSC (E) — Syndicate 18 ═══════
  { id: '25e_ang_tk',    name: 'MAJ Ang Teck Khang',      shortName: 'Ang TK',    rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_fiori',     name: 'ME5 Fiori Leck',          shortName: 'Fiori',     rank: 'ME5', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_tan_cl',    name: 'ME5 Tan Chwee Leng',      shortName: 'Tan CL',    rank: 'ME5', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_zach',      name: 'MAJ Zach Teo',            shortName: 'Zach',      rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_yew_jx',    name: 'MAJ Yew Ji Xiang',        shortName: 'Yew JX',    rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_daniel_q',  name: 'ME5 Daniel Quek',         shortName: 'Daniel Q',  rank: 'ME5', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_dinesh',    name: 'MAJ Dinesh',              shortName: 'Dinesh',    rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_dillon',    name: 'MAJ Dillon Lim',          shortName: 'Dillon',    rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_ong_cs',    name: 'MAJ Ong Chin Soon',       shortName: 'Ong CS',    rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_edward',    name: 'MAJ Edward Poon',         shortName: 'Edward',    rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_yao_wen',   name: 'ME6 Loy Yao Wen',         shortName: 'Yao Wen',   rank: 'ME6', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_justin',    name: 'MAJ Justin Kwan',         shortName: 'Justin',    rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_koh_tw',    name: 'ME5 Koh Tai Wei',         shortName: 'Koh TW',    rank: 'ME5', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '25e_lionel',    name: 'MAJ Lionel Yeo',          shortName: 'Lionel',    rank: 'MAJ', role: 'Member', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },

  // ═══════ 26th CSC (E) — Syndicate 14 ═══════
  { id: '26e_tan_jc',    name: 'MAJ Tan Jin Chuan',       shortName: 'Tan JC',    rank: 'MAJ', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_fengjuan',  name: 'ME5 Tay Fengjuan',        shortName: 'Fengjuan',  rank: 'ME5', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_chia_mc',   name: 'ME5 Chia Ming Cheng',     shortName: 'Chia MC',   rank: 'ME5', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_chong_sr',  name: 'MAJ Chong Shi Rong',      shortName: 'Chong SR',  rank: 'MAJ', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_ho_wei',    name: 'ME5 Ho Wei',              shortName: 'Ho Wei',    rank: 'ME5', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_aw_wy',     name: 'MAJ Aw Wei You',          shortName: 'Aw WY',     rank: 'MAJ', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_sm_tan',    name: 'SWO Tan Soon Meng',       shortName: 'SWO Tan',   rank: 'SWO', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_leonard',   name: 'MAJ Leonard Lim',         shortName: 'Leonard',   rank: 'MAJ', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_sanatana',  name: 'MAJ Sanatana',            shortName: 'Sanatana',  rank: 'MAJ', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_andrew',    name: 'MAJ Andrew Tan',          shortName: 'Andrew',    rank: 'MAJ', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_tim',       name: 'ME5 Tim Chan',            shortName: 'Tim Chan',  rank: 'ME5', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '26e_desmond',   name: 'MAJ Desmond Tan',         shortName: 'Desmond',   rank: 'MAJ', role: 'Member', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },

  // ═══════ 27th CSC (E) — Syndicate 18 ═══════
  { id: '27e_paul',      name: 'MAJ Paul-Matthew Lim',    shortName: 'Paul-M',    rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_yoon_tuck', name: 'MAJ Chen Yoon Tuck',      shortName: 'Yoon Tuck', rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_kwan_mw',   name: 'MAJ Kwan Ming Wei',       shortName: 'Kwan MW',   rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_hew_yh',    name: 'MAJ Hew Yin Hou',         shortName: 'Hew YH',    rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_tay_rx',    name: 'MAJ Tay Run Xuan',        shortName: 'Tay RX',    rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_chua_jc',   name: 'MAJ Chua Jun Chang',      shortName: 'Chua JC',   rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_damian',    name: 'MAJ Damian Teo',          shortName: 'Damian',    rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_karthig',   name: 'MAJ Karthigesan',         shortName: 'Karthig',   rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_peh_wk',    name: 'ME5 Peh Wei Kuan',        shortName: 'Peh WK',    rank: 'ME5', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_charles',   name: 'MAJ Charles Chong',       shortName: 'Charles C', rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_edwin_tm',  name: 'ME5 Edwin Tan Ming Hui',  shortName: 'Edwin TM',  rank: 'ME5', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_chee_jx',   name: 'ME5 Chee Jia Xin',        shortName: 'Chee JX',   rank: 'ME5', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_timothy',   name: 'MAJ Timothy Low',         shortName: 'Timothy L', rank: 'MAJ', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '27e_michael',   name: 'ME5 Michael Ong',         shortName: 'Michael',   rank: 'ME5', role: 'Member', csc: '27th CSC (E)', syndicate: '18', pin: '0000' },

  // ═══════ Leadership / DS additions ═══════
  { id: 'comdt',       name: 'COL Fun Mun Poh',     shortName: 'COL Fun',   rank: 'COL',  role: 'HOD',    csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'shelly',      name: 'WCDR Shelly',         shortName: 'Shelly',    rank: 'WCDR', role: 'DS',     csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'soh_wl',      name: 'SLTC Soh Wai Leong',  shortName: 'Soh WL',    rank: 'SLTC', role: 'PSO',    csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'alfred_chua', name: 'SLTC Alfred Chua',    shortName: 'Alfred',    rank: 'SLTC', role: 'DS',     csc: 'Staff', syndicate: 'Leadership', pin: '0000' }
];

let MEMBERS = [...DEFAULT_MEMBERS];

const PRIORITY_GROUP = '57 CSC Syn 1';

const DEFAULT_CSC_OPTIONS = ['57 CSC', '25th CSC (E)', '26th CSC (E)', '27th CSC (E)', 'Staff'];
const DEFAULT_ROLE_OPTIONS = ['Member', 'Syn IC', 'HOD', 'PDS', 'TSV AO', 'PSO',
  'SL', 'Dy SL', 'Safety IC', 'Security IC', 'Log IC', 'Learning IC', 'Comm IC', 'DS', 'Observer'];
const DEFAULT_RANK_OPTIONS = ['', 'CPT', 'MAJ', 'LTC', 'COL', 'BG',
  'ME3', 'ME4', 'ME5', 'ME6', 'ME7', 'ME8', 'CWO', 'SWO', 'MWO', 'Ms', 'Mr'];

// ── Helpers ──────────────────────────────────────────────────
function memberGroupKey(m) {
  if (!m) return 'Leadership';
  if (m.csc === 'Staff' || m.syndicate === 'Leadership') return 'Leadership';
  return `${m.csc} Syn ${m.syndicate}`;
}

// Compact display: "57 CSC Syn 1" → "57 SYN 1", "26th CSC (E) Syn 14" → "26E", "Leadership" → "PSO"
function formatGroupDisplay(groupKey) {
  if (groupKey === 'Leadership') return 'PSO';
  const execMatch = groupKey.match(/^(\d+)(?:th)?\s*CSC\s*\(E\)\s*Syn\s*(\S+)$/i);
  if (execMatch) return `${execMatch[1]}E`;
  const mainMatch = groupKey.match(/^(\d+)(?:th)?\s*CSC\s*Syn\s*(\S+)$/i);
  if (mainMatch) return `${mainMatch[1]} SYN ${mainMatch[2]}`;
  return groupKey;
}

function groupColorFor(groupKey) {
  if (groupKey === 'Leadership') return '#1C2D4E';
  if (groupKey === PRIORITY_GROUP) return '#003580';
  const palette = ['#2D6E4E', '#E07B39', '#7B2535', '#B5973A',
                   '#5A2D8C', '#0EA5E9', '#EC4899', '#10B981', '#F97316', '#64748B'];
  let hash = 0;
  for (const ch of groupKey) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

// Group order: PSO → 57 SYN 1 → 57 SYN 3 → 57 SYN 4 → 25E → 26E → 27E
function computeGroupOrder() {
  const set = new Set();
  MEMBERS.forEach(m => set.add(memberGroupKey(m)));
  const all = [...set];
  const priority = {};
  priority['Leadership']   = 0;   // PSO / Comdt / DS at the top
  priority[PRIORITY_GROUP] = 1;   // Then 57 SYN 1
  all.forEach(gk => {
    if (priority[gk] !== undefined) return;
    const mainMatch = gk.match(/^57 CSC Syn (\d+)$/i);
    if (mainMatch) { priority[gk] = 10 + parseInt(mainMatch[1]); return; }
    const execMatch = gk.match(/^(\d+)(?:th)?\s*CSC\s*\(E\)/i);
    if (execMatch) { priority[gk] = 100 + parseInt(execMatch[1]); return; }
    priority[gk] = 999;
  });
  all.sort((a, b) => priority[a] - priority[b]);
  return all;
}

// Member sort within a group.
//   Leadership: COL Fun (Comdt) first, then rank-ordered (COL > SLTC > LTC > WCDR).
//   Everyone else: roster order (as added).
const _LEADERSHIP_RANK_WEIGHT = { COL: 0, SLTC: 1, LTC: 2, WCDR: 3, 'WG CDR': 3, 'SQN LDR': 4, MAJ: 5 };
function sortMembersInGroup(members, groupKey) {
  if (groupKey !== 'Leadership') return members;
  return [...members].sort((a, b) => {
    // Comdt always first
    if (a.id === 'comdt' && b.id !== 'comdt') return -1;
    if (b.id === 'comdt' && a.id !== 'comdt') return 1;
    // Then by rank weight (COL high, MAJ low)
    const ra = _LEADERSHIP_RANK_WEIGHT[a.rank] ?? 99;
    const rb = _LEADERSHIP_RANK_WEIGHT[b.rank] ?? 99;
    if (ra !== rb) return ra - rb;
    // Finally by name for stability
    return String(a.name).localeCompare(String(b.name));
  });
}

function getCSCsInUse() {
  const set = new Set(DEFAULT_CSC_OPTIONS);
  MEMBERS.forEach(m => m.csc && set.add(m.csc));
  return [...set].sort();
}

function getSyndicatesForCSC(csc) {
  const set = new Set();
  MEMBERS.filter(m => m.csc === csc).forEach(m => m.syndicate && set.add(m.syndicate));
  return [...set].sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

function getSyn1Members() {
  return MEMBERS.filter(m => m.csc === '57 CSC' && String(m.syndicate) === '1');
}
