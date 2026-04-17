// ============================================================
// DEFAULT MEMBER ROSTER (seed data)
// ------------------------------------------------------------
// Each member has:
//   id         — unique, no spaces
//   name       — display name
//   shortName  — compact label
//   rank       — optional
//   role       — Member / Syn IC / SL / etc
//   csc        — "57 CSC", "26th CSC (E)", "Staff", etc.
//   syndicate  — "1", "3", "14", "Leadership"
//   pin        — 4-digit personal PIN (default "0000" for seeded)
// ============================================================

const DEFAULT_MEMBERS = [

  // ═══════ 57 CSC — SYNDICATE 1 (Caspar's Syndicate) ═══════
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

  // ═══════ STAFF / LEADERSHIP ═══════
  { id: 'hod',         name: 'COL Kong Eu Yen',  shortName: 'COL Kong',    rank: 'COL', role: 'HOD',         csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'pds',         name: 'LTC Roger Cheong', shortName: 'LTC Roger',   rank: 'LTC', role: 'PDS',         csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'tsv_ao',      name: 'Ms Nancy',          shortName: 'Ms Nancy',    rank: '',    role: 'TSV AO',      csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'sl',          name: 'ME6 Grace',         shortName: 'ME6 Grace',   rank: 'ME6', role: 'SL',          csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'dysl',        name: 'MAJ Dominic',       shortName: 'MAJ Dominic', rank: 'MAJ', role: 'Dy SL',       csc: 'Staff', syndicate: 'Leadership', pin: '0000' },

  // ═══════ OTHER 57 CSC SYNDICATES ═══════
  { id: '57s3_ic', name: '57 CSC S3 — Syn IC', shortName: '57S3 IC', rank: '', role: 'Syn IC', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: '57s4_ic', name: '57 CSC S4 — Syn IC', shortName: '57S4 IC', rank: '', role: 'Syn IC', csc: '57 CSC', syndicate: '4', pin: '0000' },

  // ═══════ 25th / 26th / 27th CSC (E) ═══════
  { id: '25es18_ic', name: '25th CSC (E) S18 — Syn IC', shortName: '25ES18 IC', rank: '', role: 'Syn IC', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '26es14_ic', name: '26th CSC (E) S14 — Syn IC', shortName: '26ES14 IC', rank: '', role: 'Syn IC', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '27es18_ic', name: '27th CSC (E) S18 — Syn IC', shortName: '27ES18 IC', rank: '', role: 'Syn IC', csc: '27th CSC (E)', syndicate: '18', pin: '0000' }
];

let MEMBERS = [...DEFAULT_MEMBERS];

// Always show 57 CSC Syn 1 first (Caspar's syndicate)
const PRIORITY_GROUP = '57 CSC Syn 1';

const DEFAULT_CSC_OPTIONS = ['57 CSC', '25th CSC (E)', '26th CSC (E)', '27th CSC (E)', 'Staff'];

const DEFAULT_ROLE_OPTIONS = ['Member', 'Syn IC', 'HOD', 'PDS', 'TSV AO',
  'SL', 'Dy SL', 'Safety IC', 'Security IC', 'Log IC', 'Learning IC', 'Comm IC', 'DS', 'Observer'];

const DEFAULT_RANK_OPTIONS = ['', 'CPT', 'MAJ', 'LTC', 'COL', 'BG',
  'ME3', 'ME4', 'ME5', 'ME6', 'ME7', 'ME8', 'CWO', 'SWO', 'MWO', 'Ms', 'Mr'];

// ── Helpers ──────────────────────────────────────────────────
function memberGroupKey(m) {
  if (!m) return 'Leadership';
  if (m.csc === 'Staff' || m.syndicate === 'Leadership') return 'Leadership';
  return `${m.csc} Syn ${m.syndicate}`;
}

// Compact display: "57 CSC Syn 1" → "57 SYN 1", "26th CSC (E) Syn 14" → "26E"
function formatGroupDisplay(groupKey) {
  if (groupKey === 'Leadership') return 'Leadership';
  // Executive courses: show compact "25E", "26E", "27E"
  const execMatch = groupKey.match(/^(\d+)(?:th)?\s*CSC\s*\(E\)\s*Syn\s*(\S+)$/i);
  if (execMatch) return `${execMatch[1]}E`;
  // Main courses: "57 SYN 1"
  const mainMatch = groupKey.match(/^(\d+)(?:th)?\s*CSC\s*Syn\s*(\S+)$/i);
  if (mainMatch) return `${mainMatch[1]} SYN ${mainMatch[2]}`;
  return groupKey;
}

function groupColorFor(groupKey) {
  if (groupKey === 'Leadership') return '#1C2D4E';
  if (groupKey === PRIORITY_GROUP) return '#003580';   // Caspar's group gets Thai blue
  const palette = ['#2D6E4E', '#E07B39', '#7B2535', '#B5973A',
                   '#5A2D8C', '#0EA5E9', '#EC4899', '#10B981', '#F97316', '#64748B'];
  let hash = 0;
  for (const ch of groupKey) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

// Group order: 57 SYN 1 → Leadership → 57 SYN 3 → 57 SYN 4 → 25E → 26E → 27E
function computeGroupOrder() {
  const set = new Set();
  MEMBERS.forEach(m => set.add(memberGroupKey(m)));
  const all = [...set];
  const priority = {};
  priority[PRIORITY_GROUP] = 0;   // 57 CSC Syn 1
  priority['Leadership'] = 1;
  // Other 57 CSC syndicates get 10+n
  // Executive courses get 20+n
  all.forEach(gk => {
    if (priority[gk] !== undefined) return;
    if (/^57 CSC Syn /.test(gk)) {
      const n = parseInt(gk.replace(/\D/g, '')) || 99;
      priority[gk] = 10 + n;
    } else if (/\(E\) Syn /.test(gk)) {
      const m = gk.match(/^(\d+)/);
      priority[gk] = 20 + (m ? parseInt(m[1]) : 99);
    } else {
      priority[gk] = 99;
    }
  });
  all.sort((a, b) => priority[a] - priority[b]);
  return all;
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

// Syndicate 1 members (for auto SITREP)
function getSyn1Members() {
  return MEMBERS.filter(m => m.csc === '57 CSC' && String(m.syndicate) === '1');
}
