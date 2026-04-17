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
  { id: 'hod',        name: 'COL Kong Eu Yen',  shortName: 'COL Kong',  rank: 'COL', role: 'HOD',    csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'pds',        name: 'LTC Roger Cheong', shortName: 'LTC Roger', rank: 'LTC', role: 'PDS',    csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'tsv_ao',     name: 'Ms Nancy',          shortName: 'Ms Nancy',  rank: '',    role: 'TSV AO', csc: 'Staff', syndicate: 'Leadership', pin: '0000' },
  { id: 'jon_quek',   name: 'LTC Jon Quek',      shortName: 'LTC Jon',   rank: 'LTC', role: 'PSO',    csc: 'Staff', syndicate: 'Leadership', pin: '0000' },

  // ═══════ 57 CSC — SYNDICATE 3 ═══════
  { id: 'grace',      name: 'ME6 Grace',  shortName: 'Grace',    rank: 'ME6', role: 'SL',     csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'umbra',      name: 'Umbra',      shortName: 'Umbra',    rank: '',    role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'wen_jing',   name: 'Wen Jing',   shortName: 'Wen Jing', rank: '',    role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'dehong',     name: 'Dehong',     shortName: 'Dehong',   rank: '',    role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },
  { id: 'glenn',      name: 'Glenn',      shortName: 'Glenn',    rank: '',    role: 'Member', csc: '57 CSC', syndicate: '3', pin: '0000' },

  // ═══════ 57 CSC — SYNDICATE 4 ═══════
  { id: 'alvin',      name: 'Alvin',      shortName: 'Alvin',    rank: '',    role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'liwen',      name: 'LiWen',      shortName: 'LiWen',    rank: '',    role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },
  { id: 'oliver',     name: 'Oliver',     shortName: 'Oliver',   rank: '',    role: 'Member', csc: '57 CSC', syndicate: '4', pin: '0000' },

  // ═══════ 25th / 26th / 27th CSC (E) ═══════
  { id: '25es18_ic',  name: '25E Syn IC', shortName: '25E IC',   rank: '', role: 'Syn IC', csc: '25th CSC (E)', syndicate: '18', pin: '0000' },
  { id: '26es14_ic',  name: '26E Syn IC', shortName: '26E IC',   rank: '', role: 'Syn IC', csc: '26th CSC (E)', syndicate: '14', pin: '0000' },
  { id: '27es18_ic',  name: '27E Syn IC', shortName: '27E IC',   rank: '', role: 'Syn IC', csc: '27th CSC (E)', syndicate: '18', pin: '0000' }
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

// Group order: 57 SYN 1 → PSO → 57 SYN 3 → 57 SYN 4 → 25E → 26E → 27E
function computeGroupOrder() {
  const set = new Set();
  MEMBERS.forEach(m => set.add(memberGroupKey(m)));
  const all = [...set];
  const priority = {};
  priority[PRIORITY_GROUP] = 0;
  priority['Leadership']   = 1;
  all.forEach(gk => {
    if (priority[gk] !== undefined) return;
    // Main course: "57 CSC Syn 3" → use just the syn number (3)
    const mainMatch = gk.match(/^57 CSC Syn (\d+)$/i);
    if (mainMatch) { priority[gk] = 10 + parseInt(mainMatch[1]); return; }
    // Executive courses: "25th CSC (E) Syn 18" → order by course number (25, 26, 27)
    const execMatch = gk.match(/^(\d+)(?:th)?\s*CSC\s*\(E\)/i);
    if (execMatch) { priority[gk] = 100 + parseInt(execMatch[1]); return; }
    priority[gk] = 999;
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

function getSyn1Members() {
  return MEMBERS.filter(m => m.csc === '57 CSC' && String(m.syndicate) === '1');
}
