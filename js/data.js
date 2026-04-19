// ============================================================
// TSV TRIP DATA
// ------------------------------------------------------------
// Contains:
//   • DAYS           — top-level day metadata (5 entries)
//   • CALENDAR_SEED  — detailed time-block events (from xlsx)
//   • VISITS         — learning opportunities w/ PMESII tags
//   • EVENT_CATEGORIES  — color / icon mapping for calendar
//   • PMESII         — framework legend
//   • SOPS           — contingency procedures
//   • EMERGENCY_CONTACTS
// ============================================================

// ── DAYS ─────────────────────────────────────────────────────
const DAYS = [
  { day: 1, date: '2026-04-26', label: 'Sunday',    theme: 'Arrival & Innovation',     color: '#E07B39', icon: '✈️' },
  { day: 2, date: '2026-04-27', label: 'Monday',    theme: 'Military & Academic',      color: '#B5973A', icon: '🎓' },
  { day: 3, date: '2026-04-28', label: 'Tuesday',   theme: 'SCOPE Day',                color: '#2D6E4E', icon: '🔍' },
  { day: 4, date: '2026-04-29', label: 'Wednesday', theme: 'Diplomatic & Policy',      color: '#7B2535', icon: '🏛️' },
  { day: 5, date: '2026-04-30', label: 'Thursday',  theme: 'Reflection & Departure',   color: '#1C2D4E', icon: '🛫' }
];

// ── EVENT CATEGORIES ─────────────────────────────────────────
const EVENT_CATEGORIES = {
  admin:      { label: 'Admin',        color: '#64748b', icon: '📋' },
  flight:     { label: 'Flight',       color: '#1e3a8a', icon: '✈️' },
  movement:   { label: 'Transit',      color: '#0891b2', icon: '🚌' },
  event:      { label: 'Key Event',    color: '#C9A84C', icon: '⭐' },
  meal:       { label: 'Meal',         color: '#16a34a', icon: '🍽️' },
  reflection: { label: 'Reflection',   color: '#7c3aed', icon: '💭' },
  free:       { label: 'Free Time',    color: '#94a3b8', icon: '🌙' },
  scope:      { label: 'SCOPE',        color: '#2D6E4E', icon: '🔍' }
};

// ── PMESII framework ─────────────────────────────────────────
const PMESII = {
  P:     { label: 'Political',        color: '#dc2626', full: 'Political' },
  M:     { label: 'Military',         color: '#065f46', full: 'Military' },
  E:     { label: 'Economic',         color: '#ca8a04', full: 'Economic' },
  S:     { label: 'Social',           color: '#7c3aed', full: 'Social' },
  Info:  { label: 'Information',      color: '#0891b2', full: 'Information' },
  Infra: { label: 'Infrastructure',   color: '#475569', full: 'Infrastructure' }
};

// ── SYNDICATE HYPOTHESES (from Consolidated Hypothesis Doc, 29 Mar 2026) ──
const SYNDICATE_HYPOTHESES = {
  '57 CSC Syn 1': {
    domain: 'P',
    label: 'Political',
    loi: "What does Thailand's handling of border tensions reveal about its approach to escalation control, regional diplomacy, and ASEAN-centred conflict management?",
    hypothesis: "Thailand adopts a stability-first logic to preserve regime continuity under the constitutional monarchy, which shapes how it aligns internal security, military modernisation, and economic transformation to manage rising domestic and geopolitical pressures. It is institutionalised through long-term frameworks such as the 20-year National Strategy. This produces a calibrated approach to border tensions and major-power competition that prioritises escalation control, regional diplomacy, and ASEAN centrality over decisive alignment or resolution, making predictability and internal equilibrium the true benchmarks of its foreign and security behaviour.",
    probes: [
      'Does a consistent "stability-first" logic cut across military, academic, economic, and diplomatic settings?',
      'Do institutions implicitly acknowledge constraints imposed, and is innovation/reform framed as compatible rather than disruptive to existing power structures?',
      'Do some institutions push boundaries more than others? Subtle divergences between official narratives and analytical perspectives?'
    ]
  },
  '57 CSC Syn 3': {
    domain: 'M',
    label: 'Military',
    loi: "Why does Thailand's military establishment retain continuity despite political turnover, and how does this continuity shape force development, joint readiness, and the management of border tensions?",
    hypothesis: "Thailand's military establishment retains continuity despite political turnover because it does not primarily see itself as an instrument of elected civilian governments, but as a guardian of the nation, monarchy, and political order. This institutional self-understanding, especially within the Army, helps explain why force development, joint readiness, and the management of border tensions are shaped by both external defence needs, and the military's enduring role in preserving regime stability, controlling escalation, and safeguarding core state institutions.",
    probes: [
      'Does the military focus more on external defence, or also on internal stability?',
      'When governments change, what stays the same for the military? How does it keep its direction consistent?',
      'What factors shape the decision to escalate or exercise restraint during border sensitivities?'
    ]
  },
  '57 CSC Syn 4': {
    domain: 'E',
    label: 'Economic',
    loi: "How is Thailand pursuing economic transformation and resilience while reducing vulnerability to geopolitical shocks, border instability and energy stress?",
    hypothesis: "Thailand is trying to build a more resilient economy through higher-value industries, foreign investment and better connectivity. But its resilience is still limited by energy dependence and exposure to border and geopolitical shocks, so success will depend on how well Thailand diversifies its partners, protects supply chains and maintains investor confidence during disruption.",
    probes: [
      'Which sectors do Thai officials, firms, and stakeholders consider most critical for long-term resilience?',
      'How seriously are border-related risks assessed? Do energy constraints shape industrial planning?',
      'Is diversification (partners, supply chains) seen as a genuine resilience issue or policy talking point?'
    ]
  },
  '25th CSC (E) Syn 18': {
    domain: 'S',
    label: 'Social',
    loi: "How does Thailand sustain national cohesion and institutional confidence amid political change, economic transformation, border tensions, and social transition?",
    hypothesis: "Thailand maintains national cohesion not through a single political consensus, but through a shared reverence for the Monarchy as a stabilizing apex and a deeply ingrained cultural identity that transcends partisan divides. However, this traditional cohesion is under increasing strain from urban-rural economic disparities and digital social transition, making the key question not whether the anchor holds, but whether it remains equally legitimate across different communities and demographics.",
    probes: [
      'During political/leadership transitions, what institutions or cultural values provide stability?',
      'How is the younger generation\'s view of national identity evolving with digital & economic transformation?',
      'In times of border tension, how does shared national identity shape public confidence in government response?'
    ]
  },
  '26th CSC (E) Syn 14': {
    domain: 'Info',
    label: 'Information',
    loi: "How do Thailand's state institutions, knowledge communities, and digital ecosystems shape the national information environment, and with what implications for public trust and resilience?",
    hypothesis: "Thailand's information environment is shaped by the tension between accelerating digital expansion and persistent constraints on open discourse. Whether state institutions, knowledge communities, and digital platforms can maintain credibility across official messaging, expert assessment, and public experience will determine how that tension resolves.",
    probes: [
      'Does alignment exist between official messaging, institutional behaviour, and public experience?',
      'How do elite/academic interpretations diverge from official discourse?',
      'How does the state understand strategic communication, legitimacy, and resilience?'
    ]
  },
  '27th CSC (E) Syn 18': {
    domain: 'Infra',
    label: 'Infrastructure',
    loi: "How does Thailand's infrastructure development function as a dual-purpose tool for hedging against major-power entrapment and ensuring internal resilience against regional shocks?",
    hypothesis: "Thailand's pursuit of large-scale infrastructure development (specifically the Southern Land Bridge and Eastern Economic Corridor) has dual purposes: it is deliberately aimed at preserving its strategic autonomy by creating multi-alignment assets that make Thailand indispensable to partners, while also increasing its resilience to changes in external factors.",
    probes: [
      'Do Thai officials view infrastructure as economic projects, or tactical bargaining chips in regional security?',
      'Is there evidence of a unified "hedging" strategy, or does balanced posture arise from divergent ministerial positions?',
      'Evidence of diversified tech/partnerships (avoiding path dependency) vs. single-country dependency?'
    ]
  }
};

function getHypothesisForGroup(groupKey) {
  return SYNDICATE_HYPOTHESES[groupKey] || null;
}

// ── CALENDAR EVENTS ─ Detailed from xlsx itinerary ──────────
const CALENDAR_SEED = [

  // ═══════ DAY 1 — 26 Apr Sunday ═══════
  { id:'d1_01', day:1, startTime:'06:00', endTime:'08:30', title:'Commence Check-In', location:'Changi Airport Terminal 2',
    category:'admin', attire:'Smart Casual', synicReport: true,
    oics:{ops:'Syn ICs start reporting attendance @ 0630H'},
    remarks:'Syndicate-level attendance tracking begins.' },
  { id:'d1_02', day:1, startTime:'07:30', endTime:'08:00', title:'Cohort Photo', location:'Dreamscape Indoor Garden, Changi T2',
    category:'event', remarks:'All check-in to be completed.' },
  { id:'d1_03', day:1, startTime:'08:00', endTime:'08:30', title:'Complete Check-In', location:'Changi T2',
    category:'admin' },
  { id:'d1_04', day:1, startTime:'08:30', endTime:'09:00', title:'Attendance Check @ Departure Gate', location:'Changi T2',
    category:'admin', synicReport: true },
  { id:'d1_05', day:1, startTime:'09:00', endTime:'11:00', title:'Outbound Flight SQ 708', location:'SIN → BKK',
    category:'flight', remarks:'Depart 0930H. Breakfast provided by airline.' },
  { id:'d1_06', day:1, startTime:'11:30', endTime:'12:30', title:'Arrival in Bangkok', location:'Suvarnabhumi Airport',
    category:'event', oics:{ops:'Link-up with Thai Tour Agency POC & Buses'} },
  { id:'d1_07', day:1, startTime:'12:30', endTime:'13:00', title:'Movement to Lunch Venue', location:'Airport → TBC',
    category:'movement' },
  { id:'d1_08', day:1, startTime:'13:00', endTime:'14:00', title:'Lunch', location:'TBC (Catered)', category:'meal' },
  { id:'d1_09', day:1, startTime:'14:00', endTime:'14:30', title:'Movement to Chao Phraya River', location:'TBC → Chao Phraya River',
    category:'movement' },
  { id:'d1_10', day:1, startTime:'14:30', endTime:'17:30', title:'Long Tail Boat Tour', location:'Chao Phraya River',
    category:'event', attire:'Smart Casual',
    oics:{safety:'Check for lifejackets on boats (Syn 4E, 27E Infra)'},
    visitId:'boat_tour', remarks:'3-hour boat tour.' },
  { id:'d1_11', day:1, startTime:'18:00', endTime:'18:30', title:'Movement to Hotel', location:'Chao Phraya River → Pullman Bangkok Hotel G',
    category:'movement' },
  { id:'d1_12', day:1, startTime:'18:30', endTime:'19:00', title:'Hotel Check-in / Syndicate Reflections', location:'Pullman Bangkok Hotel G',
    category:'reflection', synicReport: true,
    oics:{tour:'Distribute Room Keys', log:'Distribute Room Keys'},
    remarks:'Submit Rooming List to Syn ICs.' },
  { id:'d1_13', day:1, startTime:'19:00', endTime:'19:30', title:'TSV Comm Huddle w/ PDS', location:'Pullman Bangkok Hotel G',
    category:'reflection',
    oics:{ops:'Attend', log:'Attend', sec:'Attend', safety:'Attend', learn:'Attend + daily debrief submission', sa:'Attend'} },
  { id:'d1_14', day:1, startTime:'19:30', endTime:'02:00', title:'Executive Time', location:'Free',
    category:'free',
    oics:{ops:'Syn ICs report movement in/out of hotel', sec:'Report movement in/out', safety:'Learning Comm Huddle w/ HoD', learn:'Learning Comm Huddle w/ HoD'},
    remarks:'Dinner self-funded. Buddy system for leaving hotel.' },
  { id:'d1_cutoff', day:1, startTime:'02:00', endTime:'02:00', title:'⏱ Daily Cutoff', location:'—',
    category:'admin', remarks:'All members to be in hotel by this time.' },

  // ═══════ DAY 2 — 27 Apr Monday ═══════
  { id:'d2_01', day:2, startTime:'06:00', endTime:'08:00', title:'Breakfast & Admin Time', location:'Pullman Bangkok Hotel G',
    category:'meal', remarks:'Hotel Buffet (Catered).' },
  { id:'d2_02', day:2, startTime:'08:00', endTime:'08:30', title:'Gather & Board Buses', location:'Hotel Lobby',
    category:'admin', remarks:'Group by Bus Level.' },
  { id:'d2_03', day:2, startTime:'08:30', endTime:'09:30', title:'Movement to True Digital Park', location:'Pullman → True Digital Park',
    category:'movement' },
  { id:'d2_04', day:2, startTime:'09:30', endTime:'11:30', title:'Guided Tour @ True Digital Park', location:'True Digital Park',
    category:'event', attire:'Smart Casual',
    oics:{safety:'Syn 1P, Syn 4E, 27E Infra'},
    visitId:'true_digital' },
  { id:'d2_05', day:2, startTime:'11:30', endTime:'12:30', title:'Lunch @ True Digital Park', location:'True Digital Park',
    category:'meal' },
  { id:'d2_06', day:2, startTime:'12:30', endTime:'13:00', title:'Movement to Hotel', location:'TDP → Pullman Bangkok Hotel G',
    category:'movement' },
  { id:'d2_07', day:2, startTime:'13:00', endTime:'13:30', title:'Cohort Attire Change to No. 3 Uniform', location:'Pullman Bangkok Hotel G',
    category:'admin', attire:'No. 3 Uniform',
    oics:{log:'Arrange vehicles to be parked at hotel'} },
  { id:'d2_08', day:2, startTime:'13:30', endTime:'14:00', title:'Movement to ISIS, Chulalongkorn', location:'Pullman → Chulalongkorn University',
    category:'movement' },
  { id:'d2_09', day:2, startTime:'14:00', endTime:'16:00', title:'Visit to ISIS', location:'Kasem Udyanin Building, Faculty of Political Science, ISIS, Chulalongkorn University',
    category:'event', attire:'No. 3 Uniform',
    oics:{tour:'Parking arranged at University', log:'Parking arranged at University', safety:'Syn 1P, Syn 3M, Syn 4E, 25E S, 26E Info, 27E Infra'},
    visitId:'isis',
    remarks:'2× Keynote Address · 1× Q&A session.' },
  { id:'d2_10', day:2, startTime:'16:00', endTime:'16:30', title:'Movement to Hotel', location:'ISIS → Pullman Bangkok Hotel G',
    category:'movement' },
  { id:'d2_11', day:2, startTime:'16:30', endTime:'17:30', title:'Syndicate Reflections / TSV Comm Huddle', location:'Pullman Bangkok Hotel G',
    category:'reflection',
    oics:{ops:'TSV Comm Huddle w/ PDS', log:'Huddle', sec:'Huddle', safety:'Huddle', learn:'Huddle + debrief submission', sa:'Huddle'} },
  { id:'d2_12', day:2, startTime:'17:00', endTime:'17:30', title:'Learning Comm Huddle w/ HoD', location:'Pullman Bangkok Hotel G',
    category:'reflection' },
  { id:'d2_13', day:2, startTime:'17:30', endTime:'02:00', title:'Executive Time', location:'Free',
    category:'free',
    oics:{ops:'Syn ICs report movement in/out', sec:'Report movement in/out'},
    remarks:'Dinner self-funded.' },
  { id:'d2_cutoff', day:2, startTime:'02:00', endTime:'02:00', title:'⏱ Daily Cutoff', location:'—', category:'admin' },

  // ═══════ DAY 3 — 28 Apr Tuesday — SCOPE DAY ═══════
  { id:'d3_01', day:3, startTime:'06:00', endTime:'08:00', title:'Breakfast & Admin Time', location:'Pullman Bangkok Hotel G',
    category:'meal',
    oics:{ops:'Syn ICs update when groups leave hotel'},
    remarks:'SCOPE groups to be filled in after AOP approved by HoD.' },
  { id:'d3_02', day:3, startTime:'08:00', endTime:'10:00', title:'SCOPE — Movement to Research Areas',
    location:'Ayutthaya · Chonburi/Rayong · Kanchanaburi',
    category:'scope', attire:'Smart Casual',
    oics:{safety:'Syn 1P · Syn 3M · Syn 4E · 25E S · 26E Info · 27E Infra'},
    remarks:'Syndicate-led field research.' },
  { id:'d3_03', day:3, startTime:'10:00', endTime:'10:30', title:'✅ 1st Check-In (1000H)', location:'Via Syn IC', category:'scope',
    synicReport: true,
    oics:{ops:'Check-In', log:'Check-In', sec:'Check-In'},
    remarks:'SCOPE teams to Syn IC → TSV Group Chat.' },
  { id:'d3_04', day:3, startTime:'14:00', endTime:'14:30', title:'✅ 2nd Check-In (1400H)', location:'Via Syn IC', category:'scope',
    synicReport: true,
    oics:{ops:'Check-In', log:'Check-In', sec:'Check-In'} },
  { id:'d3_05', day:3, startTime:'18:00', endTime:'18:30', title:'✅ 3rd Check-In (1800H)', location:'Via Syn IC', category:'scope',
    synicReport: true,
    oics:{ops:'Check-In', log:'Check-In', sec:'Check-In'} },
  { id:'d3_06', day:3, startTime:'22:00', endTime:'22:30', title:'✅ Final Check-In (2200H)', location:'Hotel / En-route', category:'scope',
    synicReport: true,
    oics:{ops:'Final Check-In', log:'Final Check-In', sec:'Final Check-In'},
    remarks:'All SCOPE teams should be back in Bangkok.' },
  { id:'d3_cutoff', day:3, startTime:'02:00', endTime:'02:00', title:'⏱ Daily Cutoff', location:'—', category:'admin',
    remarks:'No huddle w/ HoD & PDS required on SCOPE day.' },

  // ═══════ DAY 4 — 29 Apr Wednesday ═══════
  { id:'d4_01', day:4, startTime:'06:00', endTime:'08:00', title:'Breakfast & Admin Time', location:'Pullman Bangkok Hotel G',
    category:'meal' },
  { id:'d4_02', day:4, startTime:'08:00', endTime:'08:30', title:'Gather & Board Buses', location:'Hotel Lobby', category:'admin' },
  { id:'d4_03', day:4, startTime:'08:30', endTime:'09:30', title:'Movement to RTA CGSC', location:'Pullman → RTA CGSC',
    category:'movement' },
  { id:'d4_04', day:4, startTime:'09:30', endTime:'10:00', title:'Call on Comd RTA CGSC',
    location:'818 Rama V Road, Thanon Nakhon Chai Si, Dusit District, Bangkok 10300',
    category:'event', attire:'No. 3 Uniform',
    oics:{log:'No parking for buses — coordinate pickup', safety:'Syn 1P · Syn 3M · 25E S', sa:'Standby gifts & key photo moments'},
    visitId:'rta_cgsc' },
  { id:'d4_05', day:4, startTime:'10:00', endTime:'10:30', title:'Exchange of Briefs (RTA CGSC ↔ GKSCSC)', location:'RTA CGSC',
    category:'event', attire:'No. 3 Uniform', visitId:'rta_cgsc' },
  { id:'d4_06', day:4, startTime:'10:30', endTime:'11:00', title:'Cohort Level Discussion / Q&A', location:'RTA CGSC',
    category:'event', visitId:'rta_cgsc' },
  { id:'d4_07', day:4, startTime:'11:00', endTime:'11:30', title:'Tour of RTA CGSC', location:'RTA CGSC',
    category:'event', visitId:'rta_cgsc' },
  { id:'d4_08', day:4, startTime:'12:00', endTime:'12:30', title:'Movement to Lunch Venue', location:'RTA CGSC → TBC',
    category:'movement' },
  { id:'d4_09', day:4, startTime:'12:30', endTime:'13:30', title:'Lunch', location:'TBC (Catered)', category:'meal' },
  { id:'d4_10', day:4, startTime:'13:30', endTime:'14:00', title:'Movement to SG Embassy / Hotel (IOs)',
    location:'TBC → SG Embassy / Pullman',
    category:'movement',
    oics:{ops:'Check w/ Nancy on IO Plan & Location'},
    remarks:'SAF Officers: 2× 40-seater to Embassy · IOs: 1× Mini-Bus to Hotel.' },
  { id:'d4_11', day:4, startTime:'14:00', endTime:'15:00', title:'Diplomatic Engagement w/ DAO', location:'Singapore Embassy, Bangkok',
    category:'event', attire:'No. 3 Uniform',
    oics:{log:'No parking for buses — coordinate pickup', safety:'Syn 1P · Syn 3M · Syn 4E · 25E S · 26E Info · 27E Infra', sa:'Standby gifts & key photo moments'},
    visitId:'sg_embassy' },
  { id:'d4_12', day:4, startTime:'15:00', endTime:'16:00', title:'Diplomatic Engagement w/ SG Ambassador', location:'Singapore Embassy, Bangkok',
    category:'event', attire:'No. 3 Uniform', visitId:'sg_embassy' },
  { id:'d4_13', day:4, startTime:'16:00', endTime:'16:30', title:'Movement to Hotel', location:'SG Embassy → Pullman Bangkok Hotel G',
    category:'movement' },
  { id:'d4_14', day:4, startTime:'16:30', endTime:'17:00', title:'Syndicate Reflections / TSV Comm Huddle', location:'Pullman Bangkok Hotel G',
    category:'reflection',
    oics:{ops:'Huddle w/ PDS', log:'Huddle', sec:'Huddle', safety:'Huddle', learn:'Huddle + debrief submission', sa:'Huddle'} },
  { id:'d4_15', day:4, startTime:'17:00', endTime:'02:00', title:'Executive Time / Learning Huddle', location:'Free',
    category:'free',
    oics:{ops:'Report movement in/out', sec:'Report movement in/out', safety:'Learning Comm Huddle w/ HoD', learn:'Learning Comm Huddle w/ HoD'},
    remarks:'Dinner self-funded.' },
  { id:'d4_cutoff', day:4, startTime:'02:00', endTime:'02:00', title:'⏱ Daily Cutoff', location:'—', category:'admin' },

  // ═══════ DAY 5 — 30 Apr Thursday ═══════
  { id:'d5_01', day:5, startTime:'06:00', endTime:'10:30', title:'Breakfast / Syndicate Reflections', location:'Pullman Bangkok Hotel G',
    category:'reflection', attire:'Smart Casual',
    oics:{safety:'Syn Learning IC drives reflections'},
    remarks:'Deliverable: Draft writeup (bullet points) — observations, insights, link to hypothesis, lessons for SG.' },
  { id:'d5_02', day:5, startTime:'10:30', endTime:'11:00', title:'Commence Check-Out', location:'Pullman Bangkok Hotel G', category:'admin' },
  { id:'d5_03', day:5, startTime:'11:00', endTime:'11:30', title:'Complete Check-Out & Board Buses', location:'Pullman Bangkok Hotel G',
    category:'admin' },
  { id:'d5_04', day:5, startTime:'11:30', endTime:'12:30', title:'Movement to Suvarnabhumi Airport', location:'Pullman → Suvarnabhumi',
    category:'movement' },
  { id:'d5_05', day:5, startTime:'12:30', endTime:'14:00', title:'Check-In at Airport / Lunch (OTOT)', location:'Suvarnabhumi Airport',
    category:'admin', remarks:'Lunch on your own time.' },
  { id:'d5_06', day:5, startTime:'14:00', endTime:'14:30', title:'Complete Check-In', location:'Suvarnabhumi Airport',
    category:'admin' },
  { id:'d5_07', day:5, startTime:'14:30', endTime:'15:00', title:'Attendance Check @ Departure Gate', location:'Suvarnabhumi Airport',
    category:'admin', synicReport: true },
  { id:'d5_08', day:5, startTime:'15:00', endTime:'19:00', title:'Outbound Flight SQ 709', location:'BKK → SIN',
    category:'flight', remarks:'Depart 1530H. Dinner provided by airline.' },
  { id:'d5_09', day:5, startTime:'19:30', endTime:'20:00', title:'Collect Luggage', location:'Changi Airport Terminal 2',
    category:'admin' },
  { id:'d5_10', day:5, startTime:'20:00', endTime:'20:30', title:'Return Home', location:'—', category:'admin' },
  { id:'d5_11', day:5, startTime:'20:30', endTime:'21:00', title:'Last Man Out of Arrival Hall', location:'Changi Airport Terminal 2',
    category:'admin', synicReport: true, oics:{ops:'Syn ICs update when last person exits arrival hall'} }
];

// ── Live runtime calendar (populated from Sheet, starts as seed)
let CALENDAR_EVENTS = [...CALENDAR_SEED];

// ── VISITS (Learning opportunities) ──────────────────────────
const VISITS_SEED = [
  {
    id: 'boat_tour',
    title: 'Long Tail Boat Tour',
    subtitle: 'Chao Phraya River',
    dayNum: 1, date: '2026-04-26', time: '1430–1730H',
    pmesii: ['S'],
    category: 'cultural', icon: '🚤',
    hypothesis: 'How does the Chao Phraya River shape Bangkok\'s culture, commerce, and daily life?',
    learningOutcomes: ['Observe riverine economy', 'Note urban-river integration']
  },
  {
    id: 'true_digital',
    title: 'True Digital Park',
    subtitle: 'Innovation Ecosystem',
    dayNum: 2, date: '2026-04-27', time: '0930–1100H',
    pmesii: ['E', 'Info'],
    category: 'innovation', icon: '🏙️',
    hypothesis: 'How does Thailand\'s innovation ecosystem compare to Singapore\'s? What are differentiating strengths?',
    learningOutcomes: ['Observe innovation clustering patterns', 'Identify key tech sectors & corporate tenants', 'Map ecosystem actors & linkages']
  },
  {
    id: 'isis',
    title: 'ISIS @ Chulalongkorn',
    subtitle: 'Institute of Security & International Studies',
    dayNum: 2, date: '2026-04-27', time: '1400–1600H',
    pmesii: ['P', 'S'],
    category: 'academic', icon: '🎓',
    hypothesis: 'What are Thailand\'s current strategic priorities and how does academia shape policy?',
    learningOutcomes: ['Identify Thailand\'s strategic concerns', 'Understand civil-military-academic nexus', 'Note regional security views']
  },
  {
    id: 'scope_ayutthaya',
    title: 'SCOPE — Ayutthaya',
    subtitle: 'Heritage & Economy',
    dayNum: 3, date: '2026-04-28', time: 'Full Day',
    pmesii: ['E', 'S'],
    category: 'scope', icon: '🏛️',
    hypothesis: 'How does cultural heritage contribute to Thailand\'s economic soft power and national identity?',
    learningOutcomes: ['Assess heritage tourism economics', 'Observe heritage-modernity integration']
  },
  {
    id: 'scope_eec',
    title: 'SCOPE — Chonburi / Rayong',
    subtitle: 'Eastern Economic Corridor',
    dayNum: 3, date: '2026-04-28', time: 'Full Day',
    pmesii: ['E', 'Infra'],
    category: 'scope', icon: '🏭',
    hypothesis: 'What are the economic and infrastructure implications of Thailand\'s EEC for regional competitiveness?',
    learningOutcomes: ['Map EEC industrial clusters', 'Assess infrastructure maturity', 'Identify FDI patterns']
  },
  {
    id: 'scope_kanchanaburi',
    title: 'SCOPE — Kanchanaburi',
    subtitle: 'Society & Memory',
    dayNum: 3, date: '2026-04-28', time: 'Full Day',
    pmesii: ['S'],
    category: 'scope', icon: '🗿',
    hypothesis: 'How does collective memory shape Thai society, its narrative of WWII, and its strategic outlook?',
    learningOutcomes: ['Observe commemoration practices', 'Note historiographic framing']
  },
  {
    id: 'rta_cgsc',
    title: 'Royal Thai Army CGSC',
    subtitle: 'Military Engagement',
    dayNum: 4, date: '2026-04-29', time: '0900–1130H',
    pmesii: ['M', 'P'],
    category: 'military', icon: '🪖',
    hypothesis: 'How is the RTA structured, and what are current doctrine, training, and force development priorities?',
    learningOutcomes: ['Understand RTA force structure', 'Identify training & education model', 'Note doctrinal alignment w/ SAF']
  },
  {
    id: 'sg_embassy',
    title: 'Singapore Embassy Bangkok',
    subtitle: 'Diplomatic Engagement (DAO + Ambassador)',
    dayNum: 4, date: '2026-04-29', time: '1400–1600H',
    pmesii: ['P'],
    category: 'diplomatic', icon: '🇸🇬',
    hypothesis: 'What are the key bilateral priorities between Singapore and Thailand, and where are emerging areas of cooperation?',
    learningOutcomes: ['Understand current bilateral tempo', 'Identify defence-diplomacy synergies', 'Note Ambassador\'s strategic read']
  }
];

let VISITS = [...VISITS_SEED];

// ── Curated drafts per visit (for "Draft for me" button) ──
// Written short, specific, avoiding AI-slop phrases.
const VISIT_DRAFTS = {
  boat_tour: [
    `Observation: River traffic moves on its own rhythm — cargo barges, tourist longtails, ferries crossing all coordinate without signals.\nImplication: When core flow is established over generations, formal control is light. Question for us: does SG rely on formal systems where Thailand relies on custom?\nFollow-up: ask how the river authority handles conflict cases.`,
    `The riverside economy runs vertically — high-end hotels upriver, working docks and temples between, wet markets at the bends. No zoning master plan is apparent.\nImplication for SG: organic mixing could support resilience, but what does it mean for emergency access and enforcement? Worth probing.`,
    `Temples and Grand Palace sit on the same waterway as container traffic. Sacred and commercial share space without friction. That choice of coexistence seems deliberate and very long-running.`
  ],
  true_digital: [
    `TDP reads as a corporate campus more than a startup ecosystem — lots of True Group branding, foreign co-working tenants, fewer visible Thai-founded deeptech stories.\nImplication: Thailand's innovation narrative may be more about attracting capital than growing founders. Contrast with SG's mixed BTO/Block71/JTC model.\nQuestion: who is actually funding Thai seed-stage?`,
    `Innovation ecosystem signals to watch: ratio of Thai-founded to foreign-tenant, depth of corporate venture involvement, whether state funding flows through banks or through equity vehicles.`,
    `Observation: A11 of the facade is polished but the actual tenant mix reveals positioning. If the EEC wants to be more than a manufacturing hub, the startup pipeline has to look less like BKK coworking and more like engineering spin-outs.`
  ],
  isis: [
    `ISIS framed Thailand's position as "strategic flexibility" — not neutrality, not alignment. Their read on US-China is pragmatic, not ideological. Worth contrasting with how SG academics frame the same space.\nQuestion: how does that flexibility hold up under sharper pressure, e.g. chip export controls?`,
    `Observation: The academic tone on the monarchy was careful but not evasive. That tells us something about how Thai elites navigate internal legitimacy while talking to foreigners.\nImplication: watch which topics get volunteered versus which get deflected — the pattern matters more than any single answer.`,
    `Key probe from the Q&A: whether Thai institutions treat ASEAN as a genuine hedge or as cover for bilateral deal-making. The answer reveals whether "ASEAN centrality" is strategy or branding.`
  ],
  scope_ayutthaya: [
    `Heritage tourism is a revenue line, but the state treatment of Ayutthaya as a national memory site runs deeper. The ruins are carefully managed, not merely preserved — they're narrative infrastructure.\nImplication: soft power and domestic legitimacy share the same assets here. We don't have a clean SG equivalent.`,
    `Observation: Visitor flow patterns, which temples are lit at night, what signage uses Thai-only versus multilingual — these are small signals about audience and intent. Worth noting which sites feel built for locals and which for tourists.`,
    `The Thai-Burmese war story gets retold on the ground without bitterness but with clear framing. Historiography as quiet policy. Contrast with how SG tells its own origin narrative.`
  ],
  scope_eec: [
    `EEC visible signals: port upgrades, industrial estates, rail connections. What's less visible: who actually owns what, and whether Thai firms are moving up the value chain or getting locked in as assemblers.\nQuestion: does BOI data match what we see on the ground?`,
    `Observation: Japanese and Chinese investment footprints look different — Japanese is clustered automotive, Chinese is more mixed and newer. The diversification is real but uneven.\nImplication for SG: worth tracking which supply-chain segments Thailand is genuinely competing with us in.`,
    `Infrastructure-wise the EEC looks more built-out than I expected. The question is utilisation. Empty estates and half-full ports tell a different story than press releases do.`
  ],
  scope_kanchanaburi: [
    `The Death Railway and war cemetery are curated with restraint. Thai framing positions the country as witness rather than participant. That's a choice.\nImplication: how a state remembers traumatic episodes shapes how it positions itself regionally. Worth comparing to how SG handles the Sook Ching.`,
    `Observation: Local economy visibly depends on memory tourism. The commercial layer around a solemn site raises the question of whether commemoration and commerce interfere with each other, or reinforce.`,
    `On the ground the war story isn't anti-Japanese — it's more universal victim-of-empire. That framing keeps bilateral relations clean while still serving national identity. Useful pattern to note.`
  ],
  rta_cgsc: [
    `RTA framing of the officer's role leaned toward "guardian" language more than operational detail. The monarchy references were frequent but brief, almost reflexive.\nImplication: the institution sees itself beyond elected civilian control. That shapes every other question — force development, border calls, readiness.`,
    `Observation: The curriculum emphasis gives away priorities. If more time is spent on internal stability than conventional warfighting, that tells us what the institution actually trains for.`,
    `Good probe for this one: what stays the same when governments change. The answer reveals what the RTA sees as its permanent mandate versus what's negotiable.`
  ],
  sg_embassy: [
    `DAO read on current bilateral: steady, technical, few friction points. The real substance comes in what's not on the formal agenda — people-to-people, training exchanges, quiet coordination.\nQuestion: where are emerging areas of cooperation that could be force-multiplied?`,
    `Observation: The Ambassador's framing of Thailand-SG relations was relational, not transactional. That matters in a region where transactional players are getting louder.\nImplication: soft capability — our diplomatic register — is an asset we should keep sharp.`,
    `The embassy engagement revealed more about Thailand via outside lens than any local interlocutor would volunteer. Worth treating DAO reads as calibration, not just briefing.`
  ]
};

function getDraftForVisit(visitId) {
  const pool = VISIT_DRAFTS[visitId];
  if (!pool || !pool.length) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Helper functions ─────────────────────────────────────────
// Sort events with 00:00-05:59 treated as AFTER 23:59 (late-night cutoff)
function timeToOffsetMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] || 0, m = parts[1] || 0;
  const mins = h * 60 + m;
  // 00:00-05:59 AM is considered "next day" — push after 23:59 by adding 24h
  return h < 6 ? mins + 24 * 60 : mins;
}

function eventsForDay(dayNum) {
  return CALENDAR_EVENTS
    .filter(e => e.day === dayNum && e.isDeleted !== 'true' && e.isDeleted !== true)
    .sort((a, b) => timeToOffsetMinutes(a.startTime) - timeToOffsetMinutes(b.startTime));
}

function findDayByDate(dateStr) {
  return DAYS.find(d => d.date === dateStr);
}

function getVisitById(id) {
  return VISITS.find(v => v.id === id);
}

function getLearningsForVisit(learnings, visitId) {
  return (learnings || []).filter(l => l.visitId === visitId);
}

// ────────────────────────────────────────────────────────────
// SOPs / Contingency (unchanged from earlier)
// ────────────────────────────────────────────────────────────

const SOPS = [
  { id: 'reporting', title: 'Routine Reporting', icon: '📋', color: '#003580',
    content: `<h4>Daily Routine</h4>
<table>
<tr><td><b>Start of Day</b></td><td>Parade State to Syn IC by <b>0800H</b><br>Syn IC to TSV Group Chat by <b>0830H</b></td></tr>
<tr><td><b>End of Day</b></td><td>All to Syn IC by <b>0145H</b><br>Syn IC to TSV Group Chat by <b>0200H</b></td></tr>
</table>
<h4>SCOPE Day — Additional</h4>
<table>
<tr><td><b>Ops Normal</b></td><td>SCOPE teams to Syn IC every <b>4H</b> (1000 · 1400 · 1800 · 2200)</td></tr>
<tr><td><b>End of SCOPE</b></td><td>SCOPE teams to Syn IC → TSV Group Chat (on return to BKK)</td></tr>
</table>` },
  { id: 'ir_process', title: 'Incident Reporting Process', icon: '🚨', color: '#DC143C',
    content: `<p>When an incident occurs:</p>
<ol><li>Individual/Buddy → <b>Syn IC (5Ws, 1H) within 10 mins</b></li>
<li>Syn IC verbal report + updates <b>IR group chat immediately</b></li>
<li>Safety/Security IC seeks guidance from PDS</li>
<li>Safety IC reports to <b>SAFTI MI Ops Room &amp; DFO within 15 mins</b></li>
<li>Follow-up Incident Report within <b>2 hours</b></li>
<li>Safety IC updates DFO/PDS/SL every 2H</li></ol>
<h4>IR Details (5Ws 1H)</h4>
<ul><li><b>Who</b> — person(s) involved</li>
<li><b>What</b> — what happened</li>
<li><b>Where</b> — location</li>
<li><b>When</b> — date &amp; time</li>
<li><b>Why</b> — cause / reason</li>
<li><b>How</b> — how it happened</li>
<li><b>Status</b> — medical facility &amp; condition</li>
<li><b>Buddy</b> — accompanying buddy</li></ul>` },
  { id: 'recall', title: 'Recall Plan', icon: '🔔', color: '#7B2535',
    content: `<p><i>Activated by HOD in emergencies: riots, natural disaster, bomb threats, active shooter.</i></p>
<h4>Chain of Command</h4>
<ul><li><b>HOD</b> — COL Kong Eu Yen (SDS Navy)</li>
<li><b>PDS</b> — LTC Roger Cheong</li>
<li><b>TSV AO</b> — Ms Nancy</li>
<li><b>SL</b> — ME6 Grace · <b>Dy SL</b> — MAJ Dominic</li>
<li><b>Group A Syn ICs:</b> 57S3 · 26ES14 · 27ES18</li>
<li><b>Group B Syn ICs:</b> 57S1 · 57S4 · 25ES18</li></ul>
<h4>Timeline</h4>
<ul><li><b>120 mins</b> (180 mins SCOPE) from activation to recall</li>
<li>Syn ICs broadcast over Syn chat — all acknowledge within 10 mins</li>
<li>15 mins: Syn ICs → Student Leads status</li>
<li>Updates every <b>30 mins</b> on TSV chat</li></ul>` },
  { id: 'sc1_sick', title: 'Sc 1 — Reporting Sick', icon: '🏥', color: '#B5973A',
    content: `<ol><li>Buddy → Syn IC informs SL who updates IR chat</li>
<li>Needs medical attention? <b>NO</b> → rest in hotel, buddy checks 2H. <b>YES</b> → buddy accompanies to nearest facility</li>
<li>Hospitalised? <b>YES</b> → buddy remains, Safety IC starts IR. <b>NO</b> → return to hotel</li>
<li>Safety Officer updates SL/PDS/IR group chat → SL updates HOD</li></ol>
<p><b>Mitigating:</b> Adequate rest &amp; hydration. If unwell, abstain from physical activities.</p>` },
  { id: 'sc2_injury', title: 'Sc 2 — Incident / Injury', icon: '⚠️', color: '#E07B39',
    content: `<ol><li>Buddy → Syn IC informs SL who updates IR chat</li>
<li>Police Station needed? <b>YES</b> → buddy accompanies, SL works w/ PDS &amp; DAO, Safety IC starts IR. <b>NO</b> → medical? refer Sc 1 / return to Hotel ASAP</li>
<li>SL updates HOD</li></ol>
<p><b>Mitigating:</b> Conduct professionally. Avoid potential hotspots.</p>` },
  { id: 'sc3_vehicle', title: 'Sc 3 — Vehicle Incident', icon: '🚌', color: '#2D6E4E',
    content: `<h4>3.1 Accident</h4>
<ol><li>Medical? <b>YES</b> → Call 1669, buddy to hospital → refer Sc 1</li>
<li>Replacement needed? <b>NO</b> → carry on. <b>YES</b> → students remain, SL updates OIC, Safety IC starts IR</li></ol>
<h4>3.2 Breakdown</h4>
<ol><li>Veh IC → Syn IC → SL → Log IC</li>
<li>Log IC checks w/ Contractor for replacement</li>
<li>1 bus &gt;15 min late → affected Syns join other buses. Multiple buses late → all wait, SL informs next location</li></ol>
<p><b>Mitigating:</b> Log IC has contractor &amp; driver contacts.</p>` },
  { id: 'sc4_security', title: 'Sc 4 — Security / Disaster', icon: '🌪️', color: '#1C2D4E',
    content: `<ol><li>Instructions from DAO? <b>YES</b> → HoD decides recall. <b>NO</b> → Security/Safety IC monitors &amp; updates via IR chat</li>
<li>Syn ICs report SITREP: location, status, injuries, assistance required, ETA to RV</li>
<li>Medical? → refer Sc 1 (incl IR)</li>
<li>SL updates HOD</li></ol>
<p><b>Mitigating:</b> All remain contactable. Active news &amp; social media monitoring.</p>` },
  { id: 'sc5_uncontactable', title: 'Sc 5 — Uncontactable Personnel', icon: '📵', color: '#5A2D8C',
    content: `<p><i>If uncontactable &gt;1 hour:</i></p>
<ol><li>Buddy → Syn IC verifies last known location</li>
<li>Syn IC reports to SL &amp; Syn DS</li>
<li>Safety IC starts IR process</li>
<li>HOD decision (w/ DAO): search parties · local authority · recall plan</li></ol>
<p><b>Mitigating:</b> Travel in buddy level minimally · keep Syn IC informed · carry hotel contact card (if phone dies, call hotel → SL).</p>` },
  { id: 'sc6_passport', title: 'Sc 6 — Lost / Stolen Passport', icon: '🛂', color: '#003580',
    content: `<ol><li>Affected student makes police report</li>
<li>Syn IC informs SL who updates IR chat</li>
<li>Embassy in BKK? <b>YES</b> → Inform SG Embassy &amp; DAO, liaise for replacement (AO stays w/ student). <b>NO</b> → Buddy accompanies to nearest Embassy</li>
<li>Security IC starts IR. SL updates HOD.</li></ol>
<p><b>Mitigating:</b> Carry passport copy as ID. Passports locked in hotel safe.</p>` },
  { id: 'sc7_airport', title: 'Sc 7 — Airport Issues', icon: '✈️', color: '#B5973A',
    content: `<ul><li><b>Late Reporting</b> — Syn IC accounts, updates SL, SL manages w/ airline</li>
<li><b>Forgot Documents / Items</b> — Inform SL, assess if retrieval feasible</li>
<li><b>Late for Departure</b> — Syn IC → SL → Log IC + airline</li>
<li><b>Prohibited Item / Suspected Drug</b> — Do NOT resist authorities. Inform SL. SL engages DAO + authorities.</li></ul>` }
];

const EMERGENCY_CONTACTS = [
  { label: 'Thailand Police',    number: '191',            dial: '191',          flag: '🇹🇭' },
  { label: 'Ambulance / Fire',   number: '1669',           dial: '1669',         flag: '🇹🇭' },
  { label: 'Tourist Police',     number: '1155',           dial: '1155',         flag: '🇹🇭' },
  { label: 'SG Embassy Bangkok', number: '+66 2 286 2111', dial: '+6622862111',  flag: '🇸🇬' },
  { label: 'SAFTI MI Ops Room',  number: '+65 6799 7200',  dial: '+6567997200',  flag: '🇸🇬' },
  { label: 'DFO',                number: '+65 9667 1559',  dial: '+6596671559',  flag: '🇸🇬' },
];

// SCOPE Day (Thursday, Day 3) visit venues — plotted as ⭐ pins on the map
// so members can see where their syndicate is heading. Coordinates are
// approximate — good enough for navigation orientation.
const SCOPE_LOCATIONS = [
  { name: 'Chao Phrom Floating Market',      lat: 14.3594, lng: 100.5689, syns: 'Syn 3B (M)' },
  { name: 'Ayutthaya Historical Park',       lat: 14.3573, lng: 100.5601, syns: 'Syn 3A (M) · Syn 3B (M) · Syn 18 (25E) · Syn 18B (27E)' },
  { name: 'Royal Bang Pa In Golf Club',      lat: 14.2307, lng: 100.5947, syns: 'Syn 3A (M)' },
  { name: 'Ayutthaya River Tour',            lat: 14.3492, lng: 100.5676, syns: 'Syn 18B (27E)' },
  { name: 'National Science & Infotech Museum', lat: 14.0702, lng: 100.6130, syns: 'Syn 14B (E)' },
  { name: 'Rama IX Museum',                  lat: 14.0718, lng: 100.6143, syns: 'Syn 14A (E)' },
  { name: 'The National Memorial',           lat: 13.9872, lng: 100.5854, syns: 'Syn 1B (M) · Syn 14A (E)' },
  { name: 'Muang Boran Cultural Park',       lat: 13.5489, lng: 100.7256, syns: 'Syn 1A (M) · Syn 1B (M)' },
  { name: 'Wat Bang Kung',                   lat: 13.4067, lng: 100.0033, syns: 'Syn 1A (M) · Syn 18A (27E)' },
  { name: 'Maeklong Railway Market',         lat: 13.4131, lng:  99.9978, syns: 'Syn 18A (27E)' },
  { name: 'Eastern Economic Corridor',       lat: 13.0783, lng: 100.9250, syns: 'Syn 18 (25E)' },
  { name: 'Thaitani Cultural Village',       lat: 12.9236, lng: 100.9203, syns: 'Syn 4 (M)' },
  { name: 'Naval Aviation Museum',           lat: 12.6789, lng: 100.9839, syns: 'Syn 4 (M)' },
  { name: 'Wat Pa Pradu Phra Aram Luang',    lat: 12.6769, lng: 101.2750, syns: 'Syn 4 (M)' }
];

const REFLECTION_TEMPLATE = `What did we observe?
• [Observation 1]
• [Observation 2]

What does it mean for Singapore / SAF?
• [Implication 1]

Key Takeaway / Ah-Ha:
• [Insight]

Follow-up questions:
• [Question]`;

// ── Backward-compat SCHEDULE (used by older code paths) ─────
const SCHEDULE = DAYS.map(d => ({ ...d, events: eventsForDay(d.day) }));
