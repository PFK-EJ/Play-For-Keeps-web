const { useState, useRef, useCallback, useEffect, useMemo } = React;

const SUPABASE_URL = 'https://ymwoabgesjqrojurdxmv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8z6jTCr6BPKmltRnNvEVzA_do7BmXKe';
const sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const DEFAULT_SETTINGS = { format:'Superflex', tep:0.5, ppr:1.0, passTd:5, ppc:0 };
const FORMAT_CHOICES=['Superflex'];
const TEP_CHOICES=[0.5,0.75,1.0], PPR_CHOICES=[1.0], PTD_CHOICES=[4,5,6], PPC_CHOICES=[0];

const sameSettings = (a,b)=> a && b && (a.format||'Superflex')===(b.format||'Superflex') && a.tep===b.tep && a.ppr===b.ppr && a.passTd===b.passTd && a.ppc===b.ppc;

// Per-combo rankings rows in pfk_rankings:
//   - settings = {format, tep, ppr, passTd, ppc}                                   → PUBLISHED (prod)
//   - settings = {format, tep, ppr, passTd, ppc, kind: 'rankings_dev_draft'}       → DEV DRAFT (dev URL only)
//   - settings = {kind: 'rookie_model'} | {kind: 'rookie_model_draft'}             → model rows (separate)
const RANKINGS_DEV_KIND = 'rankings_dev_draft';
const fetchOfficialRankings = async (wanted) => {
  if(!sb) return null;
  try{
    const { data, error } = await sb.from('pfk_rankings').select('*').order('updated_at',{ascending:false});
    if(error||!data?.length) return null;
    // Only return PUBLISHED rows (no kind sentinel) and ONLY ones that exactly match the requested
    // combo. No fallback — non-matching combos must return null so derivation logic can kick in.
    if(wanted) return data.find(r=>!r.settings?.kind && sameSettings(r.settings,wanted)) || null;
    // Wanted not specified: return any published row.
    return data.find(r=>!r.settings?.kind) || null;
  }catch{ return null; }
};
// Fetch the dev-draft rankings row for a given combo (used on dev URL only).
const fetchDevDraftRankings = async (wanted) => {
  if(!sb) return null;
  try{
    const { data } = await sb.from('pfk_rankings').select('*').order('updated_at',{ascending:false});
    if(!data?.length) return null;
    return data.find(r=>r.settings?.kind===RANKINGS_DEV_KIND && sameSettings(r.settings,wanted)) || null;
  }catch{ return null; }
};
// Save the dev-draft rankings row for a combo (overwrites the existing draft for that combo).
const saveDevDraftRankings = async (items, settings) => {
  if(!sb) return { error:'Supabase not loaded' };
  const { data:userData } = await sb.auth.getUser();
  const email = userData?.user?.email || 'PFK Staff';
  const sigSettings = { ...settings, kind: RANKINGS_DEV_KIND };
  const { data:existing } = await sb.from('pfk_rankings').select('id,settings').order('updated_at',{ascending:false});
  const match = (existing||[]).find(r=>r.settings?.kind===RANKINGS_DEV_KIND && sameSettings(r.settings,settings));
  if(match){
    const { error } = await sb.from('pfk_rankings').update({ data:items, updated_by:email, updated_at:new Date().toISOString(), settings:sigSettings }).eq('id',match.id);
    return { error };
  }
  const { error } = await sb.from('pfk_rankings').insert({ data:items, updated_by:email, settings:sigSettings });
  return { error };
};
// Publish current items to PROD for the given combo (writes the no-kind row that prod reads).
const publishToProdRankings = async (items, settings) => {
  // settings already passed without 'kind'; reuse publishOfficialRankings which writes the no-kind row
  return publishOfficialRankings(items, settings);
};
// Dev URL gate: only Evan's email can access dev preview.
const EVAN_EMAIL = 'ejohnson2621@gmail.com';

const publishOfficialRankings = async (items, settings) => {
  if(!sb) return { error: 'Supabase not loaded' };
  const { data:userData } = await sb.auth.getUser();
  const email = userData?.user?.email || 'PFK Staff';
  const { data:existing } = await sb.from('pfk_rankings').select('id,settings').order('updated_at',{ascending:false});
  // Match the published row only (no kind sentinel) — without this, sameSettings could pick
  // an archived or per-combo row and "promote" it back to master, leaving duplicate masters.
  const match = (existing||[]).find(r=>!r.settings?.kind && sameSettings(r.settings,settings));
  if(match){
    const { error } = await sb.from('pfk_rankings').update({ data:items, updated_by:email, updated_at:new Date().toISOString(), settings }).eq('id',match.id);
    return { error };
  }
  const { error } = await sb.from('pfk_rankings').insert({ data:items, updated_by:email, settings });
  return { error };
};
// Rookie model storage — TWO sentinel rows in pfk_rankings:
//   kind='rookie_model'        → published (read by PROD public site, written by PUBLISH MODEL button)
//   kind='rookie_model_draft'  → draft     (read by DEV public site & admin, written by every admin auto-save)
const MODEL_SETTINGS_PUB   = { kind:'rookie_model' };
const MODEL_SETTINGS_DRAFT = { kind:'rookie_model_draft' };
const isDevHost = () => typeof window!=='undefined' && /^(dev\.|localhost|127\.|192\.168\.)/.test(window.location.hostname);
const _kind = s => (s && typeof s==='object') ? s.kind : null;
// Public reader: route by hostname. Dev reads draft (fallback to published if draft missing); prod reads published only.
const fetchModelData = async () => {
  if(!sb) return null;
  try{
    const { data } = await sb.from('pfk_rankings').select('*').order('updated_at',{ascending:false});
    if(!data?.length) return null;
    const pub   = data.find(r=>_kind(r.settings)==='rookie_model');
    const draft = data.find(r=>_kind(r.settings)==='rookie_model_draft');
    return isDevHost() ? (draft || pub) : pub;
  }catch{ return null; }
};
// Admin reader: always draft, fallback to published on first load.
const fetchModelDraft = async () => {
  if(!sb) return null;
  try{
    const { data } = await sb.from('pfk_rankings').select('*').order('updated_at',{ascending:false});
    if(!data?.length) return null;
    return data.find(r=>_kind(r.settings)==='rookie_model_draft') || data.find(r=>_kind(r.settings)==='rookie_model') || null;
  }catch{ return null; }
};
// Admin auto-save: writes the DRAFT row only.
const saveModelData = async (items) => {
  if(!sb) return { error:'Supabase not loaded' };
  const { data:userData } = await sb.auth.getUser();
  const email = userData?.user?.email || 'PFK Staff';
  const { data:existing } = await sb.from('pfk_rankings').select('id,settings').order('updated_at',{ascending:false});
  const match = (existing||[]).find(r=>_kind(r.settings)==='rookie_model_draft');
  if(match){
    const { error } = await sb.from('pfk_rankings').update({ data:items, updated_by:email, updated_at:new Date().toISOString(), settings:MODEL_SETTINGS_DRAFT }).eq('id',match.id);
    return { error };
  }
  const { error } = await sb.from('pfk_rankings').insert({ data:items, updated_by:email, settings:MODEL_SETTINGS_DRAFT });
  return { error };
};
// PUBLISH MODEL button: copies the current draft items into the PUBLISHED row.
const publishModel = async (items) => {
  if(!sb) return { error:'Supabase not loaded' };
  const { data:userData } = await sb.auth.getUser();
  const email = userData?.user?.email || 'PFK Staff';
  const { data:existing } = await sb.from('pfk_rankings').select('id,settings').order('updated_at',{ascending:false});
  const match = (existing||[]).find(r=>_kind(r.settings)==='rookie_model');
  if(match){
    const { error } = await sb.from('pfk_rankings').update({ data:items, updated_by:email, updated_at:new Date().toISOString(), settings:MODEL_SETTINGS_PUB }).eq('id',match.id);
    return { error };
  }
  const { error } = await sb.from('pfk_rankings').insert({ data:items, updated_by:email, settings:MODEL_SETTINGS_PUB });
  return { error };
};

function SettingsToggleBar({value,onChange,compact}){
  const Group = ({label,choices,suffix,current,field})=>(
    <div style={{display:'flex',flexDirection:'column',gap:3,alignItems:'center'}}>
      <div style={{fontSize:11,color:'#777',letterSpacing:1,fontWeight:700,textAlign:'center'}}>{label}</div>
      <div style={{display:'flex',gap:2,background:'#0a0a0a',border:'1px solid #222',borderRadius:6,padding:2}}>
        {choices.map(c=>(
          <button key={c} onClick={()=>onChange({...value,[field]:c})} style={{padding:compact?'3px 8px':'5px 10px',background:current===c?'#FFD700':'transparent',color:current===c?'#000':'#888',border:'none',borderRadius:4,cursor:'pointer',fontSize:13,fontWeight:700}}>{c}{suffix}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
      {FORMAT_CHOICES.length>1 && <Group label="FORMAT" choices={FORMAT_CHOICES} suffix="" current={value.format||'Superflex'} field="format"/>}
      <Group label="TEP" choices={TEP_CHOICES} suffix="" current={value.tep} field="tep"/>
      <Group label="PASS TD" choices={PTD_CHOICES} suffix="pt" current={value.passTd} field="passTd"/>
    </div>
  );
}

const TIER_COLORS = ["#FFD700","#FFC107","#FFAA00","#E09000","#d97706","#c2840a","#a37820","#8B6914","#a3a3a3","#7c8896"];
const POS_COLORS = { WR:"#3b82f6", RB:"#10b981", TE:"#f59e0b", QB:"#ef4444" };
const INITIAL_TIERS = ["Untouchable","X-Factor","Super-Star","Star","Starter","Good Depth","Bench Player","Roster Clogger","Taxi Squad","Waivers"];
// Dynamic per-class auto-tier algorithm.
// PFK_TIER_TARGETS[i] = the 0-indexed position where tier (i+2) begins in a sorted-desc PFK list.
// PFK_TIER_WINDOWS[i] = how far to look around that target for the largest natural PFK gap to snap to.
// Top tiers are precise (small windows, small target sizes). Bottom tiers are broader.
// At call time: scoresDesc is the array of PFK scores sorted desc, returns 9 boundary positions
// for 10 tiers. Tier names come from src in order.
const PFK_TIER_TARGETS = [1, 2, 4, 7, 14, 22, 33, 47, 62];
const PFK_TIER_WINDOWS = [0, 1, 1, 1, 2, 2, 2, 2, 2];
const autoTierBoundaries = (scoresDesc, tierCount = 10) => {
  const n = scoresDesc.length;
  if(n === 0) return [];
  const numBoundaries = Math.min(tierCount - 1, PFK_TIER_TARGETS.length);
  const out = [];
  let prev = 0;
  for(let i = 0; i < numBoundaries; i++){
    const target = Math.min(PFK_TIER_TARGETS[i], n);
    const w = PFK_TIER_WINDOWS[i];
    if(w === 0){ out.push(target); prev = target; continue; }
    const lo = Math.max(prev + 1, target - w);
    const hi = Math.min(target + w, n - 1);
    if(hi < lo){ out.push(target); prev = target; continue; }
    let bestPos = lo, bestGap = -Infinity;
    for(let pos = lo; pos <= hi; pos++){
      const gap = (scoresDesc[pos - 1] ?? 0) - (scoresDesc[pos] ?? 0);
      if(gap > bestGap){ bestGap = gap; bestPos = pos; }
    }
    out.push(bestPos);
    prev = bestPos;
  }
  return out;
};

const buildInitialList = () => {
  const players = [
    {id:"p1",name:"Jeremiyah Love",pos:"RB",age:21.3,college:"Notre Dame",nflTeam:"ARI",pick:"1.03"},
    {id:"p2",name:"Fernando Mendoza",pos:"QB",age:22.9,college:"Indiana",nflTeam:"LV",pick:"1.01"},
    {id:"p3",name:"Carnell Tate",pos:"WR",age:21.6,college:"Ohio State",nflTeam:"TEN",pick:"1.04"},
    {id:"p4",name:"Makai Lemon",pos:"WR",age:22.3,college:"USC",nflTeam:"PHI",pick:"1.20"},
    {id:"p5",name:"KC Concepcion",pos:"WR",age:21.9,college:"Texas A&M",nflTeam:"CLE",pick:"1.24"},
    {id:"p6",name:"Kenyon Sadiq",pos:"TE",age:21.5,college:"Oregon",nflTeam:"NYJ",pick:"1.16"},
    {id:"p7",name:"Denzel Boston",pos:"WR",age:22.7,college:"Washington",nflTeam:"NYG"},
    {id:"p8",name:"Jordyn Tyson",pos:"WR",age:22.1,college:"Arizona State",nflTeam:"NO",pick:"1.08"},
    {id:"p9",name:"Omar Cooper Jr.",pos:"WR",age:22.7,college:"Indiana",nflTeam:"NYJ",pick:"1.30"},
    {id:"p10",name:"Jadarian Price",pos:"RB",age:22.9,college:"Notre Dame",nflTeam:"SEA",pick:"1.32"},
    {id:"p11",name:"Zachariah Branch",pos:"WR",age:22.4,college:"Georgia",nflTeam:"ATL"},
    {id:"p12",name:"Jonah Coleman",pos:"RB",age:22.9,college:"Washington",nflTeam:"DEN"},
    {id:"p13",name:"Kaytron Allen",pos:"RB",age:23.7,college:"Penn State",nflTeam:"IND"},
    {id:"p14",name:"Ty Simpson",pos:"QB",age:23.0,college:"Alabama",nflTeam:"LAR",pick:"1.13"},
    {id:"p15",name:"Elijah Sarratt",pos:"WR",age:23.3,college:"Indiana",nflTeam:"IND"},
    {id:"p16",name:"Michael Trigg",pos:"TE",age:24.2,college:"Baylor",nflTeam:"MIN"},
    {id:"p17",name:"Eli Stowers",pos:"TE",age:23.3,college:"Vanderbilt",nflTeam:"ATL"},
    {id:"p18",name:"Max Klare",pos:"TE",age:23.2,college:"Ohio State",nflTeam:"PIT"},
    {id:"p19",name:"Emmett Johnson",pos:"RB",age:22.9,college:"Nebraska",nflTeam:"NO"},
    {id:"p20",name:"Chris Bell",pos:"WR",age:22.3,college:"Louisville",nflTeam:"MIA"},
    {id:"p21",name:"Chris Brazzell II",pos:"WR",age:22.3,college:"Tennessee",nflTeam:"CAR"},
    {id:"p22",name:"Nicholas Singleton",pos:"RB",age:22.7,college:"Penn State",nflTeam:"PHI"},
    {id:"p23",name:"Antonio Williams",pos:"WR",age:22.1,college:"Clemson",nflTeam:"WSH"},
    {id:"p24",name:"Germie Bernard",pos:"WR",age:22.8,college:"Alabama",nflTeam:"SEA"},
    {id:"p25",name:"Garrett Nussmeier",pos:"QB",age:24.5,college:"LSU",nflTeam:"DET"},
    {id:"p26",name:"Carson Beck",pos:"QB",age:23.8,college:"Miami",nflTeam:"ARI"},
    {id:"p27",name:"Eli Heidenreich",pos:"RB",age:22.5,college:"Navy",nflTeam:"UDFA"},
    {id:"p28",name:"Malachi Fields",pos:"WR",age:22.3,college:"Notre Dame",nflTeam:"NYG"},
    {id:"p29",name:"Drew Allar",pos:"QB",age:null,college:"Penn State",nflTeam:"PIT"},
    {id:"p30",name:"Justin Joly",pos:"TE",age:23.5,college:"NC State",nflTeam:"TBD"},
    {id:"p31",name:"Eric McCalister",pos:"WR",age:23,college:"TCU",nflTeam:"TBD"},
    {id:"p32",name:"Bryce Lance",pos:"WR",age:null,college:"N. Dakota St",nflTeam:"TBD"},
    {id:"p33",name:"CJ Daniels",pos:"WR",age:24.3,college:"Miami",nflTeam:"TBD"},
    {id:"p34",name:"Ja'Kobi Lane",pos:"WR",age:22.1,college:"USC",nflTeam:"BAL"},
    {id:"p35",name:"Ted Hurst",pos:"WR",age:null,college:"Georgia State",nflTeam:"TB"},
    {id:"p36",name:"Tanner Koziol",pos:"TE",age:null,college:"Houston",nflTeam:"TBD"},
    {id:"p37",name:"Kevin Coleman Jr.",pos:"WR",age:null,college:"Missouri",nflTeam:"TBD"},
    {id:"p38",name:"Seth McGowan",pos:"RB",age:null,college:"Kentucky",nflTeam:"TBD"},
    {id:"p39",name:"Barion Brown",pos:"WR",age:null,college:"LSU",nflTeam:"TBD"},
    {id:"p40",name:"Jadyn Ott",pos:"RB",age:null,college:"Oklahoma",nflTeam:"TBD"},
    {id:"p41",name:"Brenen Thompson",pos:"WR",age:23.1,college:"Miss St.",nflTeam:"TBD"},
    {id:"p42",name:"Rahsul Faison",pos:"RB",age:null,college:"S. Carolina",nflTeam:"TBD"},
    {id:"p43",name:"Jack Endries",pos:"TE",age:null,college:"Texas",nflTeam:"TBD"},
    {id:"p44",name:"Josh Cameron",pos:"WR",age:null,college:"Baylor",nflTeam:"TBD"},
    {id:"p45",name:"Skyler Bell",pos:"WR",age:24.2,college:"UCONN",nflTeam:"TBD"},
    {id:"p46",name:"J'Mari Taylor",pos:"RB",age:null,college:"Virginia",nflTeam:"TBD"},
    {id:"p47",name:"Demond Claiborne",pos:"RB",age:22.9,college:"Wake Forest",nflTeam:"TBD"},
    {id:"p48",name:"Desmond Reid",pos:"RB",age:null,college:"Pittsburgh",nflTeam:"TBD"},
    {id:"p49",name:"Oscar Delp",pos:"TE",age:null,college:"Georgia",nflTeam:"NO"},
    {id:"p50",name:"Adam Randall",pos:"RB",age:22.1,college:"Clemson",nflTeam:"TBD"},
    {id:"p51",name:"Deion Burks",pos:"WR",age:23.7,college:"Oklahoma",nflTeam:"TBD"},
    {id:"p52",name:"Le'Veon Moss",pos:"RB",age:null,college:"Texas A&M",nflTeam:"TBD"},
    {id:"p53",name:"Mike Washington",pos:"RB",age:24.5,college:"Arkansas",nflTeam:"TBD"},
    {id:"p54",name:"Jamarion Miller",pos:"RB",age:22.4,college:"Alabama",nflTeam:"TBD"},
    {id:"p55",name:"De'Zhaun Stribling",pos:"WR",age:null,college:"Mississippi",nflTeam:"SF"},
    {id:"p56",name:"Nate Boerkircher",pos:"TE",age:null,college:"Texas A&M",nflTeam:"JAC"},
    {id:"p57",name:"Marlin Klein",pos:"TE",age:null,college:"Michigan",nflTeam:"HOU"},
    {id:"p58",name:"Sam Roush",pos:"TE",age:null,college:"Stanford",nflTeam:"CHI"},
    {id:"p59",name:"Caleb Douglas",pos:"WR",age:null,college:"Texas Tech",nflTeam:"MIA"},
    {id:"p60",name:"Will Kacmarek",pos:"TE",age:null,college:"Ohio State",nflTeam:"MIA"},
    {id:"p61",name:"Zavion Thomas",pos:"WR",age:null,college:"LSU",nflTeam:"CHI"},
    {id:"p62",name:"Kaelon Black",pos:"RB",age:null,college:"Indiana",nflTeam:"SF"},
    {id:"p63",name:"Eli Raridon",pos:"TE",age:null,college:"Notre Dame",nflTeam:"NE"},
  ];
  const tierBreaks = {0:0,1:1,2:2,3:3,5:4,9:5,11:6,15:7,22:8,36:9};
  const list = [];
  players.forEach((p,i) => {
    if(tierBreaks[i]!==undefined) list.push({type:"tier",id:"t_"+INITIAL_TIERS[tierBreaks[i]],name:INITIAL_TIERS[tierBreaks[i]]});
    list.push({type:"player",...p});
  });
  return list;
};

const slotLabel = i => i>=48?"FAAB":((Math.floor(i/12)+1)+"."+String((i%12)+1).padStart(2,"0"));
const getTierColor = (name,list) => { const t=list.filter(x=>x.type==="tier"); const i=t.findIndex(x=>x.name===name); return TIER_COLORS[i%TIER_COLORS.length]||"#555"; };
const getPlayerTier = (pid,list) => { let cur="Unranked"; for(const x of list){if(x.type==="tier")cur=x.name;if(x.type==="player"&&x.id===pid)return cur;} return cur; };
const getPlayerIndex = (id,l) => { let c=0; for(const x of l){if(x.type==="player"){if(x.id===id)return c;c++;}} return c; };
const PFK_LIST = buildInitialList();

const loadStorage = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

const classifyTeam = (dPct, rPct) => {
  if (dPct >= 67 && rPct >= 67)  return {label:'Dynasty',        emoji:'👑', color:'#FFD700', desc:'Dominant now and built to stay that way'};
  if (rPct >= 67 && dPct < 40)   return {label:'Aging Contender', emoji:'⏰', color:'#ef4444', desc:'Championship window is closing fast'};
  if (dPct >= 67 && rPct < 40)   return {label:'Future Dynasty',  emoji:'🔮', color:'#3b82f6', desc:'Young and loaded — not competing yet'};
  if (dPct >= 50 && rPct >= 50)  return {label:'Contender',       emoji:'💪', color:'#FFC107', desc:'Real title threat with a solid future'};
  if (rPct >= 50)                return {label:'Win-Now',          emoji:'🏈', color:'#f59e0b', desc:'Competitive now, uncertain future'};
  if (dPct >= 40)                return {label:'Rebuilding',       emoji:'🔨', color:'#d97706', desc:'Accumulating assets for the future'};
  return                          {label:'Full Rebuild',           emoji:'🏗️', color:'#94a3b8', desc:'Tearing it down to build it right'};
};

// Team Analyzer thresholds — see project_team_analyzer_spec memory for derivation
const AGE_RISK_AGE = { RB: 29, WR: 29, TE: 27, QB: 31 };
const AGE_TIERS = [
  {max:25.0, label:'Young',  desc:'Dynasty upside',   color:'#3b82f6'},
  {max:26.5, label:'Prime',  desc:'Prime window',     color:'#10b981'},
  {max:27.5, label:'Mature', desc:'Contender window', color:'#FFD700'},
  {max:28.5, label:'Aging',  desc:'Window closing',   color:'#f59e0b'},
  {max:999,  label:'Old',    desc:'Rebuild risk',     color:'#ef4444'},
];
const ageTier = a => AGE_TIERS.find(t=>a<=t.max) || AGE_TIERS[AGE_TIERS.length-1];
// 2026 NFL Draft round 1 overlay (skill positions only). Keyed by normalized name.
// Sourced from nfl.com draft tracker; updated 2026-04-23.
const DRAFT_2026 = {
  'fernandomendoza': {team:'LV',  pick:'1.01'},
  'jeremiyahlove':   {team:'ARI', pick:'1.03'},
  'carnelltate':     {team:'TEN', pick:'1.04'},
  'jordyntyson':     {team:'NO',  pick:'1.08'},
  'tysimpson':       {team:'LAR', pick:'1.13'},
  'kenyonsadiq':     {team:'NYJ', pick:'1.16'},
  'makailemon':      {team:'PHI', pick:'1.20'},
  'kcconcepcion':    {team:'CLE', pick:'1.24'},
  'omarcooperjr':    {team:'NYJ', pick:'1.30'},
  'jadarianprice':   {team:'SEA', pick:'1.32'},
  'dezhaunstribling':{team:'SF',  pick:'2.01'},
  'denzelboston':    {team:'CLE', pick:'2.07'},
  'germiebernard':   {team:'PIT', pick:'2.15'},
  'elistowers':      {team:'PHI', pick:'2.22'},
  'nateboerkircher': {team:'JAC', pick:'2.24'},
  'marlinklein':     {team:'HOU', pick:'2.27'},
  'maxklare':        {team:'LAR', pick:'2.29'},
  'carsonbeck':      {team:'ARI', pick:'3.01'},
  'samroush':        {team:'CHI', pick:'3.05'},
  'antoniowilliams': {team:'WSH', pick:'3.07'},
  'oscardelp':       {team:'NO',  pick:'3.09'},
  'malachifields':   {team:'NYG', pick:'3.10'},
  'calebdouglas':    {team:'MIA', pick:'3.11'},
  'drewallar':       {team:'PIT', pick:'3.12'},
  'zachariahbranch': {team:'ATL', pick:'3.15'},
  'jakobilane':      {team:'BAL', pick:'3.16'},
  'chrisbrazzellii': {team:'CAR', pick:'3.19'},
  'tedhurst':        {team:'TB',  pick:'3.20'},
  'willkacmarek':    {team:'MIA', pick:'3.23'},
  'zavionthomas':    {team:'CHI', pick:'3.25'},
  'kaelonblack':     {team:'SF',  pick:'3.26'},
  'chrisbell':       {team:'MIA', pick:'3.30'},
  'eliraridon':      {team:'NE',  pick:'3.31'},
  // Round 4 (NFL.com 2026 draft tracker)
  'brenenthompson':  {team:'LAC', pick:'4.05'},
  'jonahcoleman':    {team:'DEN', pick:'4.08'},
  'cadeklubnik':     {team:'NYJ', pick:'4.10'},
  'elijahsarratt':   {team:'BAL', pick:'4.15'},
  'kadenwetjen':     {team:'PIT', pick:'4.21'},
  'mikewashington':  {team:'LV',  pick:'4.22'},
  'skylerbell':      {team:'BUF', pick:'4.25'},
  'matthewhibner':   {team:'BAL', pick:'4.33'},
  'brycelance':      {team:'NO',  pick:'4.36'},
  'colbieyoung':     {team:'CIN', pick:'4.40'},
  // Round 5 (final results — Denver traded up to 152 for Joly, sending picks 170 and 182 to Cleveland)
  'reggievirgil':    {team:'ARI', pick:'5.03'},
  'justinjoly':      {team:'DEN', pick:'5.12'},
  'emmettjohnson':   {team:'KC',  pick:'5.21'},
  'tannerkoziol':    {team:'JAC', pick:'5.24'},
  'nicholassingleton':{team:'TEN',pick:'5.25'},
  'kendricklaw':     {team:'DET', pick:'5.28'},
  'joeroyer':        {team:'CLE', pick:'5.30'},
  'adamrandall':     {team:'BAL', pick:'5.34'},
  'cyrusallen':      {team:'KC',  pick:'5.36'},
  'kevincolemanjr':  {team:'MIA', pick:'5.37'},
  'colepayton':      {team:'PHI', pick:'5.38'},
  // Round 6
  'taylengreen':     {team:'CLE', pick:'6.01'},
  'kaytronallen':    {team:'WSH', pick:'6.06'},
  'barionbrown':     {team:'NO',  pick:'6.09'},
  'joshcameron':     {team:'JAC', pick:'6.10'},
  'malikbenson':     {team:'LV',  pick:'6.14'},
  'cjdaniels':       {team:'LAR', pick:'6.16'},
  'demondclaiborne': {team:'MIN', pick:'6.17'},
  'emmanuelhendersonjr':{team:'SEA',pick:'6.18'},
  // Round 7
  'jackendries':     {team:'CIN', pick:'7.05'},
  'athankaliakmanis':{team:'WSH', pick:'7.07'},
  'eliheidenreich':  {team:'PIT', pick:'7.14'},
  'behrenmorton':    {team:'NE',  pick:'7.18'},
  'sethmcgowan':     {team:'IND', pick:'7.21'},
  'jammiller':       {team:'NE',  pick:'7.29'},
  'jamarionmiller':  {team:'NE',  pick:'7.29'},
  'carsenryan':      {team:'CLE', pick:'7.32'},
  'garrettnussmeier':{team:'KC',  pick:'7.33'},
  'deionburks':      {team:'IND', pick:'7.38'},
  'dallenbentley':   {team:'DEN', pick:'7.40'},
  // 2026 UDFA signings (CBS Sports tracker + team-specific reports)
  'michaeltrigg':         {team:'DAL', pick:'UDFA'},
  'johnmichaelgyllenborg':{team:'KC',  pick:'UDFA'},
  'romanhemby':           {team:'LV',  pick:'UDFA'},
  'jeffcaldwell':         {team:'KC',  pick:'UDFA'},
  'desmondreid':          {team:'BUF', pick:'UDFA'},
  'jadynott':             {team:'KC',  pick:'UDFA'},
  'aaronanderson':        {team:'CLE', pick:'UDFA'},
  'deamontetrayanum':     {team:'PHI', pick:'UDFA'},
  'jmaritaylor':          {team:'JAC', pick:'UDFA'},
  'terionstewart':        {team:'KC',  pick:'UDFA'},
  'roberthenryjr':        {team:'WSH', pick:'UDFA'},
  'leveonmoss':           {team:'MIA', pick:'UDFA'},
};
const normDraftName = s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
// Zoltan's 2026 dynasty rookie rankings + ADP. Static snapshot dated 2026-04-26.
// Used by the admin "PFK vs Zolty" tab to compare Evan's PFK rankings against Zolty's
// rankings + the consensus ADP that Zolty publishes alongside.
const ZOLTY_2026 = [{"name":"Jeremiyah Love","pos":"RB","rank":1,"adp":1},{"name":"Carnell Tate","pos":"WR","rank":2,"adp":2},{"name":"Makai Lemon","pos":"WR","rank":3,"adp":5},{"name":"KC Concepcion","pos":"WR","rank":4,"adp":8},{"name":"Fernando Mendoza","pos":"QB","rank":5,"adp":3},{"name":"Jordyn Tyson","pos":"WR","rank":6,"adp":4},{"name":"Omar Cooper","pos":"WR","rank":7,"adp":9},{"name":"Kenyon Sadiq","pos":"TE","rank":8,"adp":7},{"name":"Jadarian Price","pos":"RB","rank":9,"adp":6},{"name":"Ty Simpson","pos":"QB","rank":10,"adp":10},{"name":"Denzel Boston","pos":"WR","rank":11,"adp":12},{"name":"Eli Stowers","pos":"TE","rank":12,"adp":11},{"name":"Chris Brazzell","pos":"WR","rank":13,"adp":21},{"name":"Emmett Johnson","pos":"RB","rank":14,"adp":22},{"name":"Jonah Coleman","pos":"RB","rank":15,"adp":13},{"name":"Zachariah Branch","pos":"WR","rank":16,"adp":19},{"name":"Nicholas Singleton","pos":"RB","rank":17,"adp":15},{"name":"Antonio Williams","pos":"WR","rank":18,"adp":17},{"name":"Chris Bell","pos":"WR","rank":19,"adp":14},{"name":"Eli Raridon","pos":"TE","rank":20,"adp":37},{"name":"De'Zhaun Stribling","pos":"WR","rank":21,"adp":23},{"name":"Drew Allar","pos":"QB","rank":22,"adp":31},{"name":"Carson Beck","pos":"QB","rank":23,"adp":25},{"name":"Brenen Thompson","pos":"WR","rank":24,"adp":47},{"name":"Max Klare","pos":"TE","rank":25,"adp":28},{"name":"Germie Bernard","pos":"WR","rank":26,"adp":18},{"name":"Kaytron Allen","pos":"RB","rank":27,"adp":27},{"name":"Elijah Sarratt","pos":"WR","rank":28,"adp":24},{"name":"Ja'Kobi Lane","pos":"WR","rank":29,"adp":60},{"name":"Kevin Coleman","pos":"WR","rank":30,"adp":41},{"name":"Ted Hurst","pos":"WR","rank":31,"adp":30},{"name":"Oscar Delp","pos":"TE","rank":32,"adp":35},{"name":"Malachi Fields","pos":"WR","rank":33,"adp":20},{"name":"Cade Klubnik","pos":"QB","rank":34,"adp":34},{"name":"Bryce Lance","pos":"WR","rank":35,"adp":46},{"name":"Cyrus Allen","pos":"WR","rank":36,"adp":58},{"name":"Demond Claiborne","pos":"RB","rank":37,"adp":32},{"name":"Skyler Bell","pos":"WR","rank":38,"adp":29},{"name":"Mike Washington","pos":"RB","rank":39,"adp":16},{"name":"Adam Randall","pos":"RB","rank":40,"adp":45},{"name":"Michael Trigg","pos":"TE","rank":41,"adp":42},{"name":"Justin Joly","pos":"TE","rank":42,"adp":40},{"name":"Sam Roush","pos":"TE","rank":43,"adp":60},{"name":"Tanner Koziol","pos":"TE","rank":44,"adp":55},{"name":"Jack Endries","pos":"TE","rank":45,"adp":52},{"name":"Cole Payton","pos":"QB","rank":46,"adp":49},{"name":"Zavion Thomas","pos":"WR","rank":47,"adp":50},{"name":"Caleb Douglas","pos":"WR","rank":48,"adp":43},{"name":"Marlin Klein","pos":"TE","rank":49,"adp":56},{"name":"Kaelon Black","pos":"RB","rank":50,"adp":33},{"name":"Joe Royer","pos":"TE","rank":51,"adp":60},{"name":"Seth Mcgowan","pos":"RB","rank":52,"adp":48},{"name":"Eli Heidenreich","pos":"RB","rank":53,"adp":38},{"name":"CJ Daniels","pos":"WR","rank":54,"adp":60},{"name":"Deion Burks","pos":"WR","rank":55,"adp":60},{"name":"Taylen Green","pos":"QB","rank":56,"adp":60},{"name":"Malik Benson","pos":"WR","rank":57,"adp":53}];

// PFK Rookie Model — admin-only, dev-page tab.
// Composite score: 0.35*stats + 0.50*draftCapital + 0.15*film, all on 0-100 scale.
const PFK_WEIGHTS = { stats:0.35, dc:0.50, film:0.15 };
// Per-position draft capital tier anchors. abs = (round-1)*32 + slot (compensatory clamped to 32).
// Linear interpolation between adjacent anchors. udfa = score for undrafted players.
const DC_TIERS = {
  QB: { udfa:2, anchors:[
    {abs:1,score:100},{abs:6,score:85},{abs:16,score:70},
    {abs:33,score:45},{abs:65,score:25},{abs:97,score:18},
    {abs:129,score:12},{abs:161,score:8},{abs:193,score:5},
  ]},
  RB: { udfa:6, anchors:[
    {abs:1,score:100},{abs:11,score:92},{abs:21,score:82},
    {abs:33,score:70},{abs:49,score:60},{abs:65,score:52},
    {abs:81,score:42},{abs:97,score:30},{abs:129,score:20},
    {abs:161,score:14},{abs:193,score:9},
  ]},
  WR: { udfa:4, anchors:[
    {abs:1,score:100},{abs:6,score:92},{abs:11,score:82},
    {abs:21,score:72},{abs:33,score:60},{abs:49,score:52},
    {abs:65,score:40},{abs:81,score:32},{abs:97,score:18},
    {abs:129,score:13},{abs:161,score:9},{abs:193,score:6},
  ]},
  TE: { udfa:2, anchors:[
    {abs:1,score:100},{abs:16,score:88},{abs:33,score:52},
    {abs:49,score:42},{abs:65,score:35},{abs:81,score:27},
    {abs:97,score:17},{abs:129,score:12},{abs:161,score:8},{abs:193,score:5},
  ]},
};
const pickToAbs = pickStr => {
  if(!pickStr || pickStr==='UDFA') return null;
  const m = String(pickStr).match(/^(\d+)\.(\d+)/);
  if(!m) return null;
  const r = +m[1], s = Math.min(+m[2], 32);
  return (r-1)*32 + s;
};
// FF "hit rate" = % chance of a fantasy-startable season at SOME POINT in a player's career.
// Career-based, not first-3-years — aligns with the popular "only 6 WR busts in top-10 over
// 20 years" framing where "hit" means "ever became a fantasy starter," not "starter as a rookie."
// Pick-bracket anchors with linear interpolation between them — mirrors dcScoreFromPick.
// Sources: Fantasy Footballers (2000-2018 study, n=1349), fantasyclassroom.org (QB tiers),
// Yahoo/ESPN/PFF top-10-pick analyses, and a 20-year manual review of top-5 picks per position.
//   RB metric: any Top-24 RB (RB2) season — career
//   WR metric: any Top-24 WR (WR2) season — career
//   TE metric: any Top-12 TE season — career
//   QB metric: any Top-12 QB (QB1) season — career
const FF_HIT_RATE = {
  RB: { metric:'Career Top-24 RB (RB2) season', udfa:2, anchors:[
    {abs:1,rate:95}, {abs:5,rate:92}, {abs:10,rate:88}, {abs:20,rate:75}, {abs:32,rate:62},
    {abs:48,rate:45}, {abs:64,rate:38}, {abs:96,rate:22},
    {abs:128,rate:12}, {abs:160,rate:7}, {abs:192,rate:4}, {abs:224,rate:3},
  ]},
  WR: { metric:'Career Top-24 WR (WR2) season', udfa:1, anchors:[
    {abs:1,rate:92}, {abs:5,rate:88}, {abs:10,rate:80}, {abs:20,rate:60}, {abs:32,rate:45},
    {abs:48,rate:28}, {abs:64,rate:20}, {abs:96,rate:10},
    {abs:128,rate:5}, {abs:160,rate:3}, {abs:192,rate:2}, {abs:224,rate:1},
  ]},
  TE: { metric:'Career Top-12 TE season', udfa:1, anchors:[
    {abs:1,rate:75}, {abs:5,rate:70}, {abs:10,rate:65}, {abs:20,rate:48}, {abs:32,rate:35},
    {abs:64,rate:15}, {abs:96,rate:12},
    {abs:128,rate:6}, {abs:160,rate:4}, {abs:192,rate:3}, {abs:224,rate:2},
  ]},
  QB: { metric:'Career Top-12 QB (QB1) season', udfa:1, anchors:[
    {abs:1,rate:88}, {abs:5,rate:82}, {abs:10,rate:72}, {abs:20,rate:62}, {abs:32,rate:52},
    {abs:48,rate:28}, {abs:64,rate:18},     // R2 — Hurts/Kaepernick/Geno/Carr tier
    {abs:80,rate:13}, {abs:96,rate:8},      // R3 — Wilson/Schaub/Foles outliers, mostly busts
    {abs:128,rate:5}, {abs:160,rate:3}, {abs:192,rate:2}, {abs:224,rate:1},
  ]},
};
const ffHitRate = (pos, pickStr) => {
  const tier = FF_HIT_RATE[pos]; if(!tier) return null;
  const abs = pickToAbs(pickStr);
  if(abs===null) return tier.udfa;
  const a = tier.anchors;
  if(abs <= a[0].abs) return Math.round(a[0].rate);
  for(let i=0; i<a.length-1; i++){
    if(abs >= a[i].abs && abs < a[i+1].abs){
      const t = (abs - a[i].abs) / (a[i+1].abs - a[i].abs);
      return Math.round(a[i].rate + t*(a[i+1].rate - a[i].rate));
    }
  }
  return Math.round(a[a.length-1].rate);
};
const dcScoreFromPick = (pos, pickStr) => {
  const tier = DC_TIERS[pos]; if(!tier) return 0;
  const abs = pickToAbs(pickStr);
  if(abs===null) return tier.udfa;
  const a = tier.anchors;
  if(abs <= a[0].abs) return a[0].score;
  for(let i=0; i<a.length-1; i++){
    if(abs >= a[i].abs && abs < a[i+1].abs){
      const t = (abs - a[i].abs) / (a[i+1].abs - a[i].abs);
      return Math.round((a[i].score + t*(a[i+1].score - a[i].score))*10)/10;
    }
  }
  return a[a.length-1].score;
};
const pfkScore = (stats, dc, film) => {
  const s = +stats||0, d = +dc||0, f = +film||0;
  return Math.round((PFK_WEIGHTS.stats*s + PFK_WEIGHTS.dc*d + PFK_WEIGHTS.film*f)*10)/10;
};
// Per-combo position multipliers. Baseline = Superflex / TEP 0.5 / 6 PTD (DEFAULT_SETTINGS).
// Sourced from FantasyCalc API (1QB vs SF) + research on TEP/PTD impact (2026-04-25).
const FORMAT_MULT = {
  'Superflex': {QB:1.00, RB:1.00, WR:1.00, TE:1.00},
  '1QB':       {QB:0.54, RB:1.10, WR:1.01, TE:0.93},
};
// TEP only affects TE per Evan's preference (cross-position effects ignored despite research showing slight squeeze on RB/WR).
const TEP_MULT = {
  0.5:  {QB:1.00, RB:1.00, WR:1.00, TE:1.00},
  0.75: {QB:1.00, RB:1.00, WR:1.00, TE:1.025},
  1.0:  {QB:1.00, RB:1.00, WR:1.00, TE:1.06},
  1:    {QB:1.00, RB:1.00, WR:1.00, TE:1.06}, // alias for tep stored as integer 1
};
const PTD_MULT = {
  // Baseline 5 PTD = 1.00. 6 PTD bumps QBs by 5% (Evan-tuned 2026-04-25).
  4: {QB:0.95, RB:1.00, WR:1.00, TE:1.00},
  5: {QB:1.00, RB:1.00, WR:1.00, TE:1.00},
  6: {QB:1.05, RB:1.00, WR:1.00, TE:1.00},
};
const comboMultiplier = (pos, settings) => {
  if(!pos || !settings) return 1.00;
  const f = FORMAT_MULT[settings.format||'Superflex']?.[pos] ?? 1.00;
  const t = TEP_MULT[settings.tep]?.[pos] ?? 1.00;
  const p = PTD_MULT[settings.passTd]?.[pos] ?? 1.00;
  return f * t * p;
};
// Stable signature for a settings combo, matches sigOf() inside AdminApp for cross-component lookup.
const settingsSig = s => `${s?.format||'Superflex'}|${s?.tep}|${s?.ppr}|${s?.passTd}|${s?.ppc}`;
// Ranking Score system. Each tier gets a 10-point base score (tier 0 = top = 100, tier 1 = 90, ...).
// Within a tier, each rank decays by RANKING_SCORE_DECAY[tierIdx]. Top tiers have a steeper within-tier
// drop (rank matters more); bottom tiers nearly flat (decay 0.2). Doubled from the original spec
// per Evan's preference for stronger top-tier separation.
const RANKING_SCORE_DECAY = [2.0, 1.5, 1.0, 0.5, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2];
// Walk the master list (with tier markers in order) and find the player's tier index + rank within tier.
// Returns { tierIdx, rankInTier } or null if not found.
const findPlayerInMaster = (masterList, id) => {
  let tierIdx = -1; let rankInTier = 0;
  for(const it of (masterList||[])){
    if(it?.type === 'tier'){ tierIdx++; rankInTier = 0; }
    else if(it?.type === 'player'){
      rankInTier++;
      if(it.id === id) return { tierIdx: Math.max(0, tierIdx), rankInTier };
    }
  }
  return null;
};
// Auto ranking score from rank+tier per Evan's spec.
const getAutoRankingScore = (item, masterList) => {
  if(!item?.id) return null;
  const pos = findPlayerInMaster(masterList, item.id);
  if(!pos) return null;
  const { tierIdx, rankInTier } = pos;
  const tierBase = 100 - tierIdx * 10;
  const decay = RANKING_SCORE_DECAY[Math.min(tierIdx, RANKING_SCORE_DECAY.length-1)];
  return Math.round((tierBase - (rankInTier - 1) * decay) * 100) / 100; // 2 decimal precision
};
// Effective = override if set, else auto.
const getEffectiveRankingScore = (item, masterList) => {
  if(item?.rankingScoreOverride != null && !isNaN(+item.rankingScoreOverride)){
    return Math.round(+item.rankingScoreOverride * 100) / 100;
  }
  return getAutoRankingScore(item, masterList);
};
// Derive a per-combo list from the master list. WR/RB are ANCHORS — they keep their
// exact master order and tier placement regardless of combo. Only QB/TE move: each is
// re-inserted based on its adjusted score (ranking score × combo multiplier) relative
// to the nearest-lower WR/RB anchor. Empty tier markers (e.g. a master tier that held
// only QBs that all jumped out) are dropped.
const deriveListForCombo = (masterList, combo) => {
  if(!masterList || !masterList.length) return null;
  if(!masterList.some(it => it?.type === 'player')) return null;
  const adjFor = (p) => {
    const rs = getEffectiveRankingScore(p, masterList) ?? 0;
    return rs * comboMultiplier(p.pos, combo);
  };
  // Skeleton: tier markers + WR/RB players in original master order.
  const skeleton = [];
  const movables = [];
  for(const it of masterList){
    if(it?.type === 'tier'){ skeleton.push(it); }
    else if(it?.type === 'player'){
      if(it.pos === 'QB' || it.pos === 'TE'){ movables.push({p: it, adj: adjFor(it)}); }
      else { skeleton.push(it); }
    }
  }
  // Insert highest-adj movables first so their relative order is preserved within a tier.
  movables.sort((a,b) => b.adj - a.adj);
  const result = skeleton.slice();
  for(const m of movables){
    let insertAt = result.length;
    for(let i=0; i<result.length; i++){
      const it = result[i];
      if(it?.type === 'player' && (it.pos === 'WR' || it.pos === 'RB')){
        if(adjFor(it) < m.adj){ insertAt = i; break; }
      }
    }
    result.splice(insertAt, 0, m.p);
  }
  // Drop tier markers that have no following players before the next tier marker / end.
  const cleaned = [];
  for(let i=0; i<result.length; i++){
    const it = result[i];
    if(it?.type === 'tier'){
      let hasPlayer = false;
      for(let j=i+1; j<result.length; j++){
        if(result[j]?.type === 'tier') break;
        if(result[j]?.type === 'player'){ hasPlayer = true; break; }
      }
      if(hasPlayer) cleaned.push(it);
    } else {
      cleaned.push(it);
    }
  }
  return cleaned;
};
// Fetch the master list for derivation. Dev URL prefers the master combo's dev draft (most recent
// edits); prod URL goes straight to the published default combo. Returns the items array or null.
const fetchMasterListForDerivation = async () => {
  if(isDevHost()){
    const draft = await fetchDevDraftRankings(DEFAULT_SETTINGS);
    if(draft?.data && Array.isArray(draft.data)) return draft.data;
  }
  const pub = await fetchOfficialRankings(DEFAULT_SETTINGS);
  return (pub?.data && Array.isArray(pub.data)) ? pub.data : null;
};
// Build a per-combo PFK score for a model entry (with override + landing + combo multiplier).
const computeComboPfk = (m, settings) => {
  const pos = m.pos;
  const dc = m.dcOverride!=null ? +m.dcOverride : dcScoreFromPick(pos, m.pick);
  const film = filmAvgPct(m.filmScores);
  const base = pfkScore(m.stats, dc, film);
  const baseline = Math.round(base * landingMultiplier(m.landing) * 10) / 10;
  const sig = settingsSig(settings);
  const ov = m.comboOverrides?.[sig];
  if(ov!=null && !isNaN(+ov)) return Math.round(+ov*10)/10;
  return Math.round(baseline * comboMultiplier(pos, settings) * 10) / 10;
};
// Build a fully-seeded items array from the rookie model + settings + (optional) existing list.
// Returns null if model is empty. Used by both the admin RANKINGS auto-seed-on-first-load and the
// 🌱 Seed from Model button. Players sorted by combo-adjusted PFK desc, bucketed via the dynamic
// per-class auto-tier algorithm using tier names from the existing list (or INITIAL_TIERS).
// College/age preserved from existing list when names match.
const buildSeedFromModel = (modelByName, settings, existingList) => {
  const modelEntries = Object.values(modelByName||{}).filter(p=>['QB','RB','WR','TE'].includes(p.pos));
  if(!modelEntries.length) return null;
  const scored = modelEntries.map(p=>({p, pfk: computeComboPfk(p, settings)}));
  scored.sort((a,b)=>b.pfk - a.pfk);
  const existingTiers = (existingList||[]).filter(it=>it.type==='tier');
  const tierNames = existingTiers.length ? existingTiers.map(t=>t.name) : INITIAL_TIERS.slice();
  const usableNames = tierNames.slice(0, PFK_TIER_TARGETS.length+1);
  const existingByName = new Map((existingList||[]).filter(it=>it.type==='player').map(it=>[normDraftName(it.name), it]));
  const scores = scored.map(x=>x.pfk);
  const boundaries = autoTierBoundaries(scores, usableNames.length);
  const out = []; let cur = 0;
  const ts = Date.now();
  for(let i=0; i<usableNames.length; i++){
    const end = (i<boundaries.length) ? boundaries[i] : scored.length;
    const slice = scored.slice(cur, end);
    if(slice.length){
      out.push({type:'tier', id:'tier_seed_'+i+'_'+ts, name:usableNames[i]});
      for(const {p} of slice){
        const ex = existingByName.get(normDraftName(p.name));
        out.push({
          type:'player',
          id: p.id || ('p_'+ts+'_'+Math.random().toString(36).slice(2,6)),
          name: p.name, pos: p.pos,
          pick: p.pick || null,
          nflTeam: p.team || (ex?.nflTeam) || 'TBD',
          college: ex?.college || '',
          age: ex?.age ?? null,
        });
      }
    }
    cur = end;
  }
  return out;
};
// Pre-Draft percentile × 100 from 2026 Data Models (QB/RB/WR/TE xlsx, 2026 only).
const BAKED_STATS_PCT = {
  // QB
  fernandomendoza:70.0, carsonbeck:60.6, trinidadchambliss:64.3,
  drewallar:39.0, garrettnussmeier:37.1, tysimpson:30.5,
  // RB
  jeremiyahlove:99.4, nicholassingleton:87.6, jonahcoleman:80.1,
  kaytronallen:56.5, emmettjohnson:55.9, jadarianprice:39.8,
  demondclaiborne:27.3, adamrandall:7.5, mikewashington:5.0, jamarionmiller:3.7,
  // WR
  jordyntyson:96.5, makailemon:89.0, carnelltate:88.0, kcconcepcion:87.0,
  denzelboston:77.5, elijahsarratt:72.0, antoniowilliams:64.5, zachariahbranch:64.0,
  chrisbrazzellii:58.5, chrisbell:59.0, omarcooperjr:57.5, germiebernard:51.0,
  cjdaniels:46.5, malachifields:39.5, jakobilane:34.0, brenenthompson:22.0,
  deionburks:15.5, skylerbell:15.0,
  // TE
  maxklare:76.2, kenyonsadiq:74.3, jackendries:70.5, elistowers:69.5,
  joeroyer:47.6, dallenbentley:41.0, samroush:36.2, oscardelp:21.0,
};
// Film source registry — multi-source film grading. Each source defines:
//   weight    — relative weight in the composite Film score (any positive number; renormalized when sources missing)
//   kind      — 'numeric' or 'categorical' (drives UI editor)
//   scaleHint — human label for the raw scale
//   toPct     — converts raw value to 0-100 percentile
const FILM_SOURCES = {
  zoltan:   { label:'Zoltan',   weight:50, kind:'numeric',     scaleHint:'0-100',
              toPct: v => v==null?null:Math.max(0,Math.min(100,+v)) },
  evan:     { label:'You',      weight:30, kind:'categorical', scaleHint:'In/Neutral/Out',
              options:[{key:'in',label:'IN',pct:100,color:'#10b981'},
                       {key:'neutral',label:'NTL',pct:50,color:'#FFC107'},
                       {key:'out',label:'OUT',pct:0,color:'#ef4444'}],
              toPct: v => { if(v==null) return null; const o=FILM_SOURCES.evan.options.find(x=>x.key===v); return o?o.pct:null; } },
  zierlein: { label:'Zierlein', weight:20, kind:'numeric',     scaleHint:'5.0-7.5',
              toPct: v => v==null?null:Math.max(0,Math.min(100,(+v-5.0)/2.5*100)) },
};
// Landing-spot multiplier applied AFTER the weighted PFK score. Default unrated = 1.00 (no impact).
// 1=worst → 0.92×, 5=best → 1.08×. Symmetric ±8% max swing.
const LANDING_OPTIONS = [
  {key:5, label:'5', mult:1.08, color:'#10b981'},
  {key:4, label:'4', mult:1.04, color:'#84cc16'},
  {key:3, label:'3', mult:1.00, color:'#94a3b8'},
  {key:2, label:'2', mult:0.96, color:'#f59e0b'},
  {key:1, label:'1', mult:0.92, color:'#ef4444'},
];
const landingMultiplier = (v) => {
  if(v==null) return 1.00;
  const opt = LANDING_OPTIONS.find(o=>o.key===+v);
  return opt ? opt.mult : 1.00;
};
// Weighted average across populated sources; missing sources drop and weights re-normalize.
const filmAvgPct = (filmScores) => {
  if(!filmScores || typeof filmScores!=='object') return null;
  let totalW=0, totalV=0;
  for(const [k,src] of Object.entries(FILM_SOURCES)){
    const p = src.toPct(filmScores[k]);
    if(p==null || isNaN(p)) continue;
    totalW += src.weight;
    totalV += src.weight * p;
  }
  return totalW>0 ? Math.round(totalV/totalW*10)/10 : null;
};
// Film percentiles, baked seed values per source.
// Zoltan: Dynasty Zoltan Premium screenshots, 2026-04-25 (0-100 scale, raw value used directly).
// Zierlein: NFL.com prospect grade screenshots, 2026-04-25 (5.0-7.5 scale, converted via FILM_SOURCES.zierlein.toPct).
const BAKED_FILM_ZOLTAN = {
  jeremiyahlove:91, makailemon:91, kcconcepcion:93, carnelltate:88,
  omarcooperjr:92, fernandomendoza:57, jordyntyson:77, denzelboston:85,
  kenyonsadiq:91, emmettjohnson:88, chrisbrazzellii:75, elistowers:57,
  zachariahbranch:81, jonahcoleman:45, jadarianprice:28, tysimpson:43,
  kaytronallen:61, michaeltrigg:75, elijahsarratt:51, chrisbell:45,
  antoniowilliams:49, jakobilane:53, nicholassingleton:35, germiebernard:47,
  mikewashington:24, maxklare:40, brycelance:42, tedhurst:43,
  demondclaiborne:13, roberthenryjr:19, skylerbell:19,
};
// All Zierlein grades from nfl.com/draft/tracker/2026/prospects/{pos}_all (2026-04-25).
// Aliases included for known PFK-board name variants (e.g. "Jam Miller" → "Jamarion Miller").
const BAKED_FILM_ZIERLEIN = {
  // QB
  fernandomendoza:6.73, tysimpson:6.30, carsonbeck:6.14, garrettnussmeier:6.00,
  taylengreen:6.00, drewallar:5.98, cadeklubnik:5.96, diegopavia:5.95,
  joeyaguilar:5.95, colepayton:5.91, sawyerrobertson:5.85, haynesking:5.80,
  behrenmorton:5.68, lukealtmyer:5.68, jalondaniels:5.66, joefagnano:5.66,
  // RB
  jeremiyahlove:6.73, jadarianprice:6.38, mikewashington:6.24, mikewashingtonjr:6.24,
  adamrandall:6.13, demondclaiborne:6.10, leveonmoss:6.10, emmettjohnson:6.00,
  nicholassingleton:6.00, rahsulfaison:6.00, jmaritaylor:5.99, romanhemby:5.98,
  kaytronallen:5.97, sethmcgowan:5.97, jonahcoleman:5.94, desmondreid:5.92,
  eliheidenreich:5.86, chiptrayanum:5.85, deamontetrayanum:5.85, cjdonaldson:5.82,
  aljayhenderson:5.69, davonbooth:5.69, jammiller:5.69, jamarionmiller:5.69,
  jaydnott:5.69, jadynott:5.69, kaelonblack:5.69, noahwhittington:5.69, roberthenryjr:5.69,
  barikakpeenu:5.68, deanconnors:5.67, kentrelbullock:5.67, jamalhaynes:5.65, samscott:5.65,
  // WR
  carnelltate:6.71, makailemon:6.47, jordyntyson:6.43, kcconcepcion:6.42,
  denzelboston:6.40, omarcooperjr:6.39, chrisbrazzellii:6.36, zachariahbranch:6.32,
  skylerbell:6.31, germiebernard:6.29, dezhaunstribling:6.28, malachifields:6.27,
  antoniowilliams:6.26, chrisbell:6.24, jakobilane:6.20, elijahsarratt:6.19,
  tedhurst:6.19, cyrusallen:6.18, deionburks:6.18, brycelance:6.17,
  jmichaelsturdivant:6.10, jeffcaldwell:6.00, joshcameron:6.00, malikbenson:6.00,
  kevincolemanjr:5.99, reggievirgil:5.99, kadenwetjen:5.98,
  ericmcalister:5.97, ericmccalister:5.97,
  colbieyoung:5.96, calebdouglas:5.95, kendricklaw:5.95, dillonbell:5.94,
  brenenthompson:5.89, emmanuelhendersonjr:5.88, zavionthomas:5.87, barionbrown:5.86,
  ericrivers:5.86, harrisonwallaceiii:5.85, cjdaniels:5.84, jalenwalthall:5.83,
  jordanhudson:5.81, camdenbrown:5.80, chaseroberts:5.80, danielsobkowicz:5.80,
  dtsheffield:5.69, tyrenmontgomery:5.69, vinnyanthonyii:5.69,
  bradyboyd:5.68, caullinlacy:5.68, chrishiltonjr:5.68, aaronanderson:5.67,
  // TE
  kenyonsadiq:6.46, maxklare:6.30, samroush:6.26, elistowers:6.24,
  nateboerkircher:6.17, justinjoly:6.16, eliraridon:6.14, jackendries:6.13,
  oscardelp:6.13, joeroyer:6.12, willkacmarek:6.12, marlinklein:6.10,
  michaeltrigg:6.00, tannerkoziol:5.95, johnmichaelgyllenborg:5.90, carsenryan:5.84,
};
const POS_TIER_BANDS = [
  {max:5,   key:'Elite', color:'#FFD700'},
  {max:12,  key:'T1',    color:'#c084fc'},
  {max:24,  key:'T2',    color:'#3b82f6'},
  {max:36,  key:'Flex',  color:'#10b981'},
  {max:999, key:'Depth', color:'#666'},
];
const posTier = rank => rank ? (POS_TIER_BANDS.find(b=>rank<=b.max) || POS_TIER_BANDS[POS_TIER_BANDS.length-1]) : null;
const healthGrade = (pos, b) => {
  const e=b.Elite||0, t1=b.T1||0, t2=b.T2||0, fx=b.Flex||0;
  if (pos==='QB'){
    if ((e>=1 && (e+t1+t2)>=2) || t1>=2) return 'Strong';
    if (t1>=1 && t2>=1)                  return 'Adequate';
    if ((e+t1+t2)>=1 && fx>=1)           return 'Thin';
    return 'Critical';
  }
  if (pos==='RB'){
    if ((e+t1)>=2 || (e>=1 && t2>=2))    return 'Strong';
    if (t1>=1 && t2>=1 && fx>=1)         return 'Adequate';
    if ((e+t1+t2)>=1)                    return 'Thin';
    return 'Critical';
  }
  if (pos==='WR'){
    if ((e>=1 && (t1+t2)>=2) || t1>=3)   return 'Strong';
    if (t1>=2 || (t1>=1 && t2>=2))       return 'Adequate';
    if ((e+t1+t2)>=1)                    return 'Thin';
    return 'Critical';
  }
  if (pos==='TE'){
    if (e>=1 || t1>=2)                   return 'Strong';
    if (t1>=1)                           return 'Adequate';
    if (t2>=1)                           return 'Thin';
    return 'Critical';
  }
  return 'Critical';
};
const GRADE_COLOR = {Strong:'#10b981', Adequate:'#FFD700', Thin:'#f59e0b', Critical:'#ef4444'};
const pickTierFromStand = (standPos, n=12) => {
  const third = Math.max(1, Math.round(n/3));
  if (standPos <= third)   return {key:'Early', color:'#FFD700'};
  if (standPos <= third*2) return {key:'Mid',   color:'#3b82f6'};
  return                        {key:'Late',  color:'#666'};
};

const SLEEPER = 'https://api.sleeper.app/v1';
const FC      = 'https://api.fantasycalc.com';
const POS_ORDER = ['QB','RB','WR','TE'];
const ORDINALS  = ['1st','2nd','3rd','4th'];

const _fcCache = {};
const fetchFcCached = async (url) => {
  if(_fcCache[url]) return _fcCache[url];
  const p = fetch(url).then(r=>r.json()).catch(()=>[]);
  _fcCache[url] = p;
  return p;
};

const computeArcForLeague = async (lg, userId) => {
  try {
    const [rs, tp] = await Promise.all([
      fetch(`${SLEEPER}/league/${lg.league_id}/rosters`).then(r=>r.json()).catch(()=>[]),
      fetch(`${SLEEPER}/league/${lg.league_id}/traded_picks`).then(r=>r.json()).catch(()=>[])
    ]);
    if(!Array.isArray(rs) || !rs.length) return null;
    const teams = rs.length;
    const rp = lg.roster_positions||[];
    const numQbs = rp.includes('SUPER_FLEX') ? 2 : 1;
    const ppr = lg.scoring_settings?.rec ?? 1;
    const fcUrl = d=>`${FC}/values/current?isDynasty=${d}&numQbs=${numQbs}&ppr=${ppr}&numTeams=${teams}`;
    const [dyn, red] = await Promise.all([fetchFcCached(fcUrl(true)), fetchFcCached(fcUrl(false))]);
    if(!Array.isArray(dyn) || !dyn.length) return null;
    const rdftById = {};
    (Array.isArray(red)?red:[]).forEach(v=>{ const sid=v.player?.sleeperId; if(sid) rdftById[String(sid)]=v.redraftValue||v.value||0; });
    const fcMap = {}, pickRound = {}, pickFuture = {};
    dyn.forEach(v=>{
      const sid=v.player?.sleeperId; if(!sid) return;
      const merged={...v, redraftValue: rdftById[String(sid)] ?? v.redraftValue ?? 0};
      fcMap[String(sid)] = merged;
      if(v.player?.position==='PICK'){
        const dpM=sid.match(/^DP_(\d+)_(\d+)$/);
        if(dpM){ const rd=Number(dpM[1])+1, sl=Number(dpM[2])+1; pickRound[rd]=pickRound[rd]||{}; pickRound[rd][sl]=v.value||0; return; }
        const fpM=sid.match(/^FP_(\d{4})_(\d+)$/);
        if(fpM) pickFuture[`${fpM[1]}_${fpM[2]}`]=v.value||0;
      }
    });
    const now=new Date(); const startYr=now.getFullYear()+(now.getMonth()>=8?1:0);
    const yrs=[startYr,startYr+1,startYr+2];
    const standingsOrder=[...rs].sort((a,b)=>(a.settings?.wins||0)-(b.settings?.wins||0)||(b.settings?.losses||0)-(a.settings?.losses||0)||a.roster_id-b.roster_id).map(r=>r.roster_id);
    const own={};
    rs.forEach(r=>{ yrs.forEach(y=>{ [1,2,3,4].forEach(rd=>{ own[`${y}_${rd}_${r.roster_id}`]=r.roster_id; }); }); });
    (Array.isArray(tp)?tp:[]).forEach(t=>{ const y=Number(t.season); if(yrs.includes(y)) own[`${y}_${t.round}_${t.roster_id}`]=t.owner_id; });
    const avgRd = rd=>{ const vs=Object.values(pickRound[rd]||{}); return vs.length?Math.round(vs.reduce((s,v)=>s+v,0)/vs.length):0; };
    const pickDVal={};
    Object.entries(own).forEach(([k,o])=>{
      const [yr,rd,orig]=k.split('_').map(Number); if(rd>4) return;
      let val=0;
      if(yr===startYr){
        const slot=standingsOrder.indexOf(orig)+1||null;
        val=(slot && pickRound[rd]?.[slot]) || avgRd(rd);
      } else val=pickFuture[`${yr}_${rd}`]||0;
      pickDVal[o]=(pickDVal[o]||0)+val;
    });
    const stats = rs.map(r=>{
      const active=r.players||[]; const allP=[...active,...(r.taxi||[])];
      let dVal=0, rVal=0;
      allP.forEach(pid=>{ const v=fcMap[String(pid)]; if(v) dVal+=v.value||0; });
      dVal+=(pickDVal[r.roster_id]||0);
      active.forEach(pid=>{ const v=fcMap[String(pid)]; if(v) rVal+=v.redraftValue||0; });
      return {roster_id:r.roster_id, owner_id:r.owner_id, dVal, rVal};
    });
    const byD=[...stats].sort((a,b)=>b.dVal-a.dVal);
    const byR=[...stats].sort((a,b)=>b.rVal-a.rVal);
    const n=stats.length;
    const di=byD.findIndex(x=>x.owner_id===userId);
    const ri=byR.findIndex(x=>x.owner_id===userId);
    if(di<0||ri<0) return null;
    const dPct=n===1?100:((n-1-di)/(n-1))*100;
    const rPct=n===1?100:((n-1-ri)/(n-1))*100;
    return classifyTeam(dPct,rPct);
  } catch { return null; }
};

const fetchLeagueChampionships = async (lg) => {
  const history = [];
  try {
    const seasons = [];
    let cur = lg;
    for (let i = 0; i < 10; i++) {
      if (!cur.previous_league_id) break;
      cur = await fetch(`${SLEEPER}/league/${cur.previous_league_id}`).then(r=>r.json()).catch(()=>null);
      if (!cur) break;
      seasons.push(cur);
    }
    if (!seasons.length) return history;
    await Promise.all(seasons.map(async season => {
      try {
        const [bracket, pastRosters, pastUsers] = await Promise.all([
          fetch(`${SLEEPER}/league/${season.league_id}/winners_bracket`).then(r=>r.json()).catch(()=>[]),
          fetch(`${SLEEPER}/league/${season.league_id}/rosters`).then(r=>r.json()).catch(()=>[]),
          fetch(`${SLEEPER}/league/${season.league_id}/users`).then(r=>r.json()).catch(()=>[]),
        ]);
        if (!Array.isArray(bracket) || !bracket.length) return;
        const maxR = Math.max(...bracket.map(g=>g.r));
        const champGame = bracket.filter(g=>g.r===maxR).find(g=>g.p==null)
                       || bracket.filter(g=>g.r===maxR)[0];
        if (!champGame?.w) return;
        const winner = Array.isArray(pastRosters) && pastRosters.find(r=>r.roster_id===champGame.w);
        if (!winner?.owner_id) return;
        const uMap = {};
        if (Array.isArray(pastUsers)) pastUsers.forEach(u=>{ uMap[u.user_id]=u; });
        const owner = uMap[winner.owner_id];
        history.push({
          year: season.season||'?',
          ownerId: winner.owner_id,
          teamName: owner?.metadata?.team_name||owner?.display_name||`Team ${winner.roster_id}`,
          ownerName: owner?.display_name||'',
        });
      } catch {}
    }));
  } catch {}
  return history.sort((a,b)=>Number(b.year)-Number(a.year));
};

function TeamTab() {
  const [username, setUsername]           = useState(()=>loadStorage('pfk_sleeper_user',''));
  useEffect(()=>{
    if(username||!sb) return;
    sb.auth.getSession().then(({data})=>{
      const uid=data.session?.user?.id; if(!uid) return;
      sb.from('users').select('sleeper_username').eq('id',uid).maybeSingle().then(({data:u})=>{
        if(u?.sleeper_username) setUsername(u.sleeper_username);
      });
    });
  },[]);
  const [sleeperUser, setSleeperUser]     = useState(()=>loadStorage('pfk_sleeper_obj',null));
  const [leagues, setLeagues]             = useState([]);
  const [league, setLeague]               = useState(null);
  const [rosters, setRosters]             = useState([]);
  const [users, setUsers]                 = useState([]);
  const [fcValues, setFcValues]           = useState([]);
  const [tradedPicks, setTradedPicks]     = useState([]);
  const [championships, setChampionships] = useState([]);
  const champCounts = useMemo(()=>{
    const m={};
    championships.forEach(c=>{m[c.ownerId]=(m[c.ownerId]||0)+1;});
    return m;
  },[championships]);
  const [draftSlots, setDraftSlots]       = useState({}); // roster_id → draft slot# for current rookie draft
  const [loading, setLoading]             = useState('');
  const [error, setError]                 = useState('');
  const [fcError, setFcError]             = useState(false);
  const [lastFetched, setLastFetched]     = useState(null);
  const [viewMode, setViewMode]           = useState('dynasty');
  const [valueMode, setValueMode]         = useState(()=>localStorage.getItem('pfk_value_mode')||'starter');
  useEffect(()=>{ localStorage.setItem('pfk_value_mode', valueMode); },[valueMode]);
  const [selectedOtherRid, setSelectedOtherRid] = useState(null);
  const [leagueArcs, setLeagueArcs] = useState({});
  const [analyzerRid, setAnalyzerRid] = useState(null);
  const [suggestionMode, setSuggestionMode] = useState(null); // null = auto by arc
  const [pendingTrades, setPendingTrades] = useState(0);
  const inp2 = ex=>({padding:'7px 10px',background:'#0d0d0d',border:'1px solid #333',borderRadius:7,color:'#fff',fontSize:13,fontFamily:'inherit',...ex});

  const connectUser = async () => {
    if (!username.trim()) return;
    setLoading('user'); setError(''); setLeagues([]); setLeague(null); setRosters([]); setUsers([]);
    try {
      const u = await fetch(`${SLEEPER}/user/${encodeURIComponent(username.trim())}`).then(r=>{
        if(!r.ok) throw new Error('Username not found on Sleeper');
        return r.json();
      });
      if (!u?.user_id) throw new Error('Username not found on Sleeper');
      setSleeperUser(u);
      localStorage.setItem('pfk_sleeper_obj', JSON.stringify(u));
      localStorage.setItem('pfk_sleeper_user', username.trim());
      setLoading('leagues');
      // Try current year first, then fall back — dynasty leagues roll over each season
      const curYear = new Date().getFullYear();
      let ls = [];
      for (const yr of [curYear, curYear-1, curYear-2]) {
        const res = await fetch(`${SLEEPER}/user/${u.user_id}/leagues/nfl/${yr}`, {cache:'no-store'}).then(r=>r.json()).catch(()=>[]);
        if (Array.isArray(res) && res.length) { ls = res; break; }
      }
      setLeagues(ls);
      setLoading('');
    } catch(e){ setError(e.message); setLoading(''); }
  };

  useEffect(()=>{
    if(username) localStorage.setItem('pfk_sleeper_user', username);
  },[username]);

  const autoTriedRef = useRef(false);
  useEffect(()=>{
    if(autoTriedRef.current) return;
    if(username && !sleeperUser && !loading){
      autoTriedRef.current = true;
      connectUser();
    }
  },[username,sleeperUser,loading]);

  useEffect(()=>{
    if(!sleeperUser||!leagues.length) return;
    let cancelled=false;
    const uid=sleeperUser.user_id;
    (async()=>{
      for(const lg of leagues){
        if(cancelled) return;
        if(leagueArcs[lg.league_id]) continue;
        const arc = await computeArcForLeague(lg, uid);
        if(cancelled) return;
        if(arc) setLeagueArcs(prev=>({...prev,[lg.league_id]:arc}));
      }
    })();
    return ()=>{ cancelled=true; };
  },[leagues,sleeperUser]);

  const NO_CACHE = {cache:'no-store'};

  const selectLeague = async (lg) => {
    setLeague(lg); setLoading('data'); setError('');
    setRosters([]); setUsers([]); setFcValues([]); setTradedPicks([]); setChampionships([]); setDraftSlots({}); setFcError(false); setLastFetched(null); setPendingTrades(0);
    try {
      const [rs, us, tp, drafts] = await Promise.all([
        fetch(`${SLEEPER}/league/${lg.league_id}/rosters`, NO_CACHE).then(r=>r.json()).catch(()=>[]),
        fetch(`${SLEEPER}/league/${lg.league_id}/users`, NO_CACHE).then(r=>r.json()).catch(()=>[]),
        fetch(`${SLEEPER}/league/${lg.league_id}/traded_picks`, NO_CACHE).then(r=>r.json()).catch(()=>[]),
        fetch(`${SLEEPER}/league/${lg.league_id}/drafts`, NO_CACHE).then(r=>r.json()).catch(()=>[]),
      ]);
      setRosters(Array.isArray(rs)?rs:[]);
      setUsers(Array.isArray(us)?us:[]);
      setTradedPicks(Array.isArray(tp)?tp:[]);
      // Rookie-draft slot order: always pull from Sleeper.
      // Priority:
      //   1) Current startYr rookie draft's slot_to_roster_id (set by commish — source of truth).
      //   2) If that draft exists but slots not yet populated, try draft_order (user_id→slot).
      //   3) Final fallback: previous_league_id rosters sorted worst-first (pre-commish setup).
      const allDrafts = Array.isArray(drafts)?drafts:[];
      const nowDt=new Date(); const startYr=nowDt.getFullYear()+(nowDt.getMonth()>=8?1:0);
      const currentDraft = allDrafts
        .filter(d=>d.type!=='auction' && Number(d.season||0)===startYr)
        .sort((a,b)=>(b.created||0)-(a.created||0))[0];
      const rosterToSlot = {};
      const slotMap = currentDraft?.slot_to_roster_id;
      const orderMap = currentDraft?.draft_order; // user_id → slot
      if(slotMap && Object.keys(slotMap).length){
        Object.entries(slotMap).forEach(([slot,rid])=>{
          if(rid) rosterToSlot[Number(rid)]=Number(slot);
        });
      } else if(orderMap && Object.keys(orderMap).length && Array.isArray(rs)){
        rs.forEach(r=>{
          const slot = orderMap[r.owner_id];
          if(slot) rosterToSlot[r.roster_id]=Number(slot);
        });
      }
      if(!Object.keys(rosterToSlot).length){
        const prevId = lg.previous_league_id;
        const prevRosters = prevId
          ? await fetch(`${SLEEPER}/league/${prevId}/rosters`,NO_CACHE).then(r=>r.json()).catch(()=>[])
          : (Array.isArray(rs)?rs:[]);
        const source = Array.isArray(prevRosters)&&prevRosters.length ? prevRosters : (Array.isArray(rs)?rs:[]);
        [...source].sort((a,b)=>
          (a.settings?.wins||0)-(b.settings?.wins||0)||
          (a.settings?.fpts||0)-(b.settings?.fpts||0)||
          a.roster_id-b.roster_id
        ).forEach((r,i)=>{ rosterToSlot[r.roster_id]=i+1; });
      }
      setDraftSlots(rosterToSlot);
      fetchLeagueChampionships(lg).then(c=>setChampionships(c)).catch(()=>{});
      // Incoming trade request count — fetch transactions across recent NFL weeks and
      // count pending trades that involve the user's roster_id.
      (async()=>{
        try {
          const myRoster = (Array.isArray(rs)?rs:[]).find(r=>r.owner_id===sleeperUser?.user_id);
          if(!myRoster) return;
          // Sleeper stores trades under the current "leg" week; during offseason that's often 1.
          // We fan out across all possible legs so off-season and in-season both work.
          const weeks=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
          const results = await Promise.all(weeks.map(w=>
            fetch(`${SLEEPER}/league/${lg.league_id}/transactions/${w}`,NO_CACHE).then(r=>r.ok?r.json():[]).catch(()=>[])
          ));
          // De-dupe by transaction_id since the same trade can show in multiple leg queries
          const seen=new Set();
          const txns = results.flat().filter(t=>{
            if(!t||t.type!=='trade'||t.status!=='pending') return false;
            if(seen.has(t.transaction_id)) return false;
            seen.add(t.transaction_id); return true;
          });
          const mine = txns.filter(t=>Array.isArray(t.roster_ids)&&t.roster_ids.includes(myRoster.roster_id));
          setPendingTrades(mine.length);
        } catch {}
      })();
      setLoading('fc');
      const isSF  = lg.roster_positions?.includes('SUPER_FLEX')||false;
      const ppr   = (lg.scoring_settings?.rec??1)>=1?1:(lg.scoring_settings?.rec??1)>=0.5?0.5:0;
      const teams = lg.total_rosters||12;
      const numQbs= isSF?2:1;
      const ts    = Date.now();
      const fcUrl = (dyn) => `${FC}/values/current?isDynasty=${dyn}&numQbs=${numQbs}&ppr=${ppr}&numTeams=${teams}&_t=${ts}`;
      try {
        // Fetch dynasty + redraft in parallel so each uses its own context
        const [fcDyn, fcRdft] = await Promise.all([
          fetch(fcUrl('true'),  NO_CACHE).then(r=>{ if(!r.ok) throw new Error(); return r.json(); }),
          fetch(fcUrl('false'), NO_CACHE).then(r=>{ if(!r.ok) throw new Error(); return r.json(); }),
        ]);
        // Build redraft lookup by sleeperId (value + positionRank)
        const rdftById = {};
        (Array.isArray(fcRdft)?fcRdft:[]).forEach(v=>{
          const sid = v.player?.sleeperId||v.player?.maybeSleeperId;
          if(sid) rdftById[String(sid)] = {val:v.value||0, posRank:v.positionRank||null};
        });
        // Merge: use dynasty entries but override redraftValue + store redraft position rank
        const merged = (Array.isArray(fcDyn)?fcDyn:[]).map(v=>{
          const sid = v.player?.sleeperId||v.player?.maybeSleeperId;
          const rm  = sid ? rdftById[String(sid)] : null;
          return {
            ...v,
            redraftValue: rm ? rm.val : (v.redraftValue||0),
            redraftPositionRank: rm ? rm.posRank : null,
          };
        });
        setFcValues(merged);
        setLastFetched(new Date());
      } catch { setFcError(true); }
      setLoading('');
    } catch(e){ setError(e.message); setLoading(''); }
  };

  const refreshLeague = () => { if (league) selectLeague(league); };

  const fcMap = useMemo(()=>{
    const m={};
    fcValues.forEach(v=>{
      const sid = v.player?.sleeperId||v.player?.maybeSleeperId||v.player?.sleeperBotId;
      if(sid) m[String(sid)]=v;
    });
    return m;
  },[fcValues]);

  const fcPickMap = useMemo(()=>{
    // slotValues[round][slot] = value. Rounds and slots are 1-indexed.
    //   Source sleeperId: "DP_<roundIdx>_<slotIdx>" (both 0-based) for current-year rookie picks.
    const slotValues={};
    // futureValues["YYYY_R"] = generic pick value for future year YYYY, round R.
    //   Source sleeperId: "FP_YYYY_R".
    const futureValues={};
    fcValues.forEach(v=>{
      if(v.player?.position!=='PICK') return;
      const sid = v.player?.sleeperId||'';
      const val = v.value||0;
      const dpM = sid.match(/^DP_(\d+)_(\d+)$/);
      if(dpM){
        const round=Number(dpM[1])+1, slot=Number(dpM[2])+1;
        slotValues[round]=slotValues[round]||{};
        slotValues[round][slot]=val;
        return;
      }
      const fpM = sid.match(/^FP_(\d{4})_(\d+)$/);
      if(fpM){ futureValues[`${fpM[1]}_${fpM[2]}`]=val; }
    });
    return {slotValues, futureValues};
  },[fcValues]);

  const userMap = useMemo(()=>{
    const m={};
    users.forEach(u=>{ m[u.user_id]=u; });
    return m;
  },[users]);

  const rosterNameMap = useMemo(()=>{
    const m={};
    rosters.forEach(r=>{
      const o=userMap[r.owner_id];
      m[r.roster_id]=o?.metadata?.team_name||o?.display_name||`Team ${r.roster_id}`;
    });
    return m;
  },[rosters,userMap]);

  const ranked = useMemo(()=>{
    if(!rosters.length) return [];
    // Rookie draft year = current calendar year (drafts happen May/June; after August it's next year)
    const now=new Date(); const startYr=now.getFullYear()+(now.getMonth()>=8?1:0);
    const yrs=[startYr,startYr+1,startYr+2];
    // Build pick dynasty value per roster_id using FC slot/future values
    const pickDVal={};
    const {slotValues={},futureValues={}}=fcPickMap;
    const hasFcPicks=Object.keys(slotValues).length||Object.keys(futureValues).length;
    if(hasFcPicks){
      const own={};
      rosters.forEach(r=>{ yrs.forEach(y=>{ [1,2,3,4].forEach(rd=>{ own[`${y}_${rd}_${r.roster_id}`]=r.roster_id; }); }); });
      tradedPicks.forEach(tp=>{ const y=Number(tp.season); if(yrs.includes(y)) own[`${y}_${tp.round}_${tp.roster_id}`]=tp.owner_id; });
      const standingsOrder=[...rosters]
        .sort((a,b)=>(a.settings?.wins||0)-(b.settings?.wins||0)||(b.settings?.losses||0)-(a.settings?.losses||0)||a.roster_id-b.roster_id)
        .map(r=>r.roster_id);
      const avgRoundVal = rd => {
        const vals=Object.values(slotValues[rd]||{});
        return vals.length?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length):0;
      };
      Object.entries(own).forEach(([key,ownRid])=>{
        const [yr,rd,origRid]=key.split('_').map(Number);
        if(rd>4) return;
        let val=0;
        if(yr===startYr){
          const slot = draftSlots[origRid] || (standingsOrder.indexOf(origRid)+1) || null;
          val = (slot && slotValues[rd]?.[slot]) || avgRoundVal(rd);
        } else {
          val = futureValues[`${yr}_${rd}`] || 0;
        }
        pickDVal[ownRid]=(pickDVal[ownRid]||0)+val;
      });
    }
    const rp=league?.roster_positions||[];
    const tepBonus=league?.scoring_settings?.bonus_rec_te||0;
    const teMult=1+tepBonus*0.30;
    const BENCH_MULT=valueMode==='starter'?0:1;
    const slots=[];
    rp.forEach(s=>{
      if(s==='QB'||s==='RB'||s==='WR'||s==='TE') slots.push({strict:true,elig:[s]});
      else if(s==='SUPER_FLEX') slots.push({strict:false,elig:['QB','RB','WR','TE']});
      else if(s==='FLEX') slots.push({strict:false,elig:['RB','WR','TE']});
      else if(s==='REC_FLEX') slots.push({strict:false,elig:['WR','TE']});
      else if(s==='WRRB_FLEX'||s==='RB_WR_FLEX') slots.push({strict:false,elig:['RB','WR']});
    });
    slots.sort((a,b)=>(a.strict?0:1)-(b.strict?0:1));
    const lineupValue=(playerIds,valKey)=>{
      const pool=playerIds.map(pid=>{
        const fc=fcMap[pid]; if(!fc) return null;
        const pos=fc.player?.position; const base=fc[valKey]||0;
        const adj=pos==='TE'?base*teMult:base;
        return {pid,pos,val:adj};
      }).filter(x=>x&&x.val>0).sort((a,b)=>b.val-a.val);
      const used=new Set(); let starter=0;
      slots.forEach(slot=>{
        const pick=pool.find(p=>!used.has(p.pid)&&slot.elig.includes(p.pos));
        if(pick){ used.add(pick.pid); starter+=pick.val; }
      });
      let bench=0; pool.forEach(p=>{ if(!used.has(p.pid)) bench+=p.val; });
      return Math.round(starter+bench*BENCH_MULT);
    };
    const stats=rosters.map(r=>{
      const active=r.players||[];
      const allP=[...active,...(r.taxi||[])];
      // Dynasty: starter-usable lineup + discounted bench from full roster, plus picks (full)
      const dVal=lineupValue(allP,'value')+(pickDVal[r.roster_id]||0);
      // Redraft: starter-usable lineup + discounted bench from active only
      const rVal=lineupValue(active,'redraftValue');
      const owner=userMap[r.owner_id];
      return {...r,dVal,rVal,teamName:owner?.metadata?.team_name||owner?.display_name||`Team ${r.roster_id}`,username:owner?.display_name||`Team ${r.roster_id}`,allPlayers:allP};
    });
    const byD=[...stats].sort((a,b)=>b.dVal-a.dVal);
    const byR=[...stats].sort((a,b)=>b.rVal-a.rVal);
    const n=stats.length;
    return byD.map((t,di)=>{
      const ri=byR.findIndex(x=>x.roster_id===t.roster_id);
      const dPct=Math.round((1-di/(n-1||1))*100);
      const rPct=Math.round((1-ri/(n-1||1))*100);
      return {...t,dRank:di+1,rRank:ri+1,dPct,rPct,arc:classifyTeam(dPct,rPct)};
    });
  },[rosters,fcMap,userMap,tradedPicks,fcPickMap,draftSlots,league,valueMode]);

  const myTeam = ranked.find(r=>r.owner_id===sleeperUser?.user_id);

  useEffect(()=>{
    if(myTeam) setAnalyzerRid(myTeam.roster_id);
    setSuggestionMode(null);
  },[league?.league_id, myTeam?.roster_id]);

  const posRanks = useMemo(()=>{
    if(!ranked.length) return {};
    const totals = {};
    ranked.forEach(t=>{
      const row={}; POS_ORDER.forEach(p=>row[p]={d:0,r:0});
      t.allPlayers.forEach(pid=>{
        const fc=fcMap[pid]; const pos=fc?.player?.position;
        if(pos&&row[pos]){ row[pos].d+=fc.value||0; row[pos].r+=fc.redraftValue||0; }
      });
      totals[t.roster_id]=row;
    });
    const rankMap={};
    ranked.forEach(t=>{ rankMap[t.roster_id]={}; POS_ORDER.forEach(p=>rankMap[t.roster_id][p]={}); });
    POS_ORDER.forEach(p=>{
      const byD=[...ranked].sort((a,b)=>totals[b.roster_id][p].d-totals[a.roster_id][p].d);
      const byR=[...ranked].sort((a,b)=>totals[b.roster_id][p].r-totals[a.roster_id][p].r);
      byD.forEach((t,i)=>{ rankMap[t.roster_id][p].dRank=i+1; });
      byR.forEach((t,i)=>{ rankMap[t.roster_id][p].rRank=i+1; });
    });
    return rankMap;
  },[ranked,fcMap]);

  const picksByRoster = useMemo(()=>{
    if(!rosters.length) return {};
    const now2=new Date(); const startYr=now2.getFullYear()+(now2.getMonth()>=8?1:0);
    const yrs=[startYr,startYr+1,startYr+2];
    const own={};
    rosters.forEach(r=>{ yrs.forEach(y=>{ [1,2,3,4].forEach(rd=>{ own[`${y}_${rd}_${r.roster_id}`]=r.roster_id; }); }); });
    tradedPicks.forEach(tp=>{
      const y=Number(tp.season);
      if(!yrs.includes(y)) return;
      own[`${y}_${tp.round}_${tp.roster_id}`]=tp.owner_id;
    });
    const n=rosters.length||1;
    const standingsOrder=[...rosters]
      .sort((a,b)=>(a.settings?.wins||0)-(b.settings?.wins||0)||(b.settings?.losses||0)-(a.settings?.losses||0)||a.roster_id-b.roster_id)
      .map(r=>r.roster_id);
    const byRid={};
    rosters.forEach(r=>{ byRid[r.roster_id]=[]; });
    Object.entries(own).forEach(([key,ownRid])=>{
      const [year,round,origRid]=key.split('_').map(Number);
      const isCurrent=year===startYr;
      const slotNum=isCurrent?(draftSlots[origRid]||standingsOrder.indexOf(origRid)+1||null):null;
      const slotStr=slotNum?String(slotNum).padStart(2,'0'):null;
      const standPos=standingsOrder.indexOf(origRid)+1||Math.ceil(n/2);
      const tier=standPos<=Math.ceil(n/3)?'early':standPos<=Math.ceil(2*n/3)?'mid':'late';
      (byRid[ownRid]=byRid[ownRid]||[]).push({year,round,origRid,isOwn:origRid===ownRid,isCurrent,slotNum,slotStr,tier});
    });
    Object.values(byRid).forEach(arr=>arr.sort((a,b)=>a.year-b.year||a.round-b.round||(a.slotNum||99)-(b.slotNum||99)));
    return byRid;
  },[rosters,tradedPicks,draftSlots]);

  useEffect(()=>{
    if(ranked.length&&sleeperUser){
      const slim=ranked.map(({roster_id,owner_id,teamName,dVal,rVal,dRank,rRank,dPct,rPct,arc})=>({roster_id,owner_id,teamName,dVal,rVal,dRank,rRank,dPct,rPct,arc}));
      localStorage.setItem('pfk_ranked',JSON.stringify(slim));
      localStorage.setItem('pfk_league_name',league?.name||'');
    }
  },[ranked]);

  // ── Team Analyzer data builder ──
  const analyzeTeam = (team) => {
    if(!team) return null;
    const hasFc = fcValues.length>0;
    // Build per-position lists with tier info
    const byPos = {QB:[],RB:[],WR:[],TE:[]};
    team.allPlayers.forEach(pid=>{
      const fc=fcMap[pid]; if(!fc) return;
      const pos=fc.player?.position; if(!byPos[pos]) return;
      byPos[pos].push({
        pid, name:fc.player?.name||pid,
        age:fc.player?.maybeAge??null,
        value:fc.value||0,
        dynPosRank: fc.positionRank||null,
        rdftPosRank: fc.redraftPositionRank||null,
        isElite: (fc.positionRank&&fc.positionRank<=10)&&(fc.redraftPositionRank&&fc.redraftPositionRank<=10),
        tier:posTier(fc.positionRank)
      });
    });
    POS_ORDER.forEach(p=>byPos[p].sort((a,b)=>b.value-a.value));
    // Tier buckets per position for health grade
    const buckets = {};
    const grades = {};
    POS_ORDER.forEach(p=>{
      const b={Elite:0,T1:0,T2:0,Flex:0,Depth:0};
      byPos[p].forEach(x=>{ if(x.tier) b[x.tier.key]++; });
      buckets[p]=b;
      grades[p]=healthGrade(p,b);
    });
    // Starter lineup (re-run slot fill to get the starting ~9 players and their avg age)
    const rp=league?.roster_positions||[];
    const tepBonus=league?.scoring_settings?.bonus_rec_te||0;
    const teMult=1+tepBonus*0.30;
    const slots=[];
    rp.forEach(s=>{
      if(s==='QB'||s==='RB'||s==='WR'||s==='TE') slots.push({strict:true,elig:[s]});
      else if(s==='SUPER_FLEX') slots.push({strict:false,elig:['QB','RB','WR','TE']});
      else if(s==='FLEX') slots.push({strict:false,elig:['RB','WR','TE']});
      else if(s==='REC_FLEX') slots.push({strict:false,elig:['WR','TE']});
      else if(s==='WRRB_FLEX'||s==='RB_WR_FLEX') slots.push({strict:false,elig:['RB','WR']});
    });
    slots.sort((a,b)=>(a.strict?0:1)-(b.strict?0:1));
    const pool=team.allPlayers.map(pid=>{
      const fc=fcMap[pid]; if(!fc) return null;
      const pos=fc.player?.position;
      const base=fc.value||0;
      const adj=pos==='TE'?base*teMult:base;
      return {pid,pos,val:adj,age:fc.player?.maybeAge??null};
    }).filter(x=>x&&x.val>0).sort((a,b)=>b.val-a.val);
    const usedIds=new Set(); const starters=[];
    slots.forEach(slot=>{
      const pick=pool.find(p=>!usedIds.has(p.pid)&&slot.elig.includes(p.pos));
      if(pick){ usedIds.add(pick.pid); starters.push(pick); }
    });
    const agesWithValues=starters.filter(s=>s.age!=null);
    const avgAge = agesWithValues.length
      ? +(agesWithValues.reduce((s,x)=>s+x.age,0)/agesWithValues.length).toFixed(1)
      : null;
    const ageTierInfo = avgAge!=null ? ageTier(avgAge) : null;
    // Age-cliff red flags — per-position dyn rank cutoffs (WR/RB top 50, QB/TE top 28).
    // Sorted by dynasty value desc so biggest assets surface first.
    const AGE_FLAG_CUTOFF = { WR:50, RB:50, QB:28, TE:28 };
    const flags=[];
    POS_ORDER.forEach(p=>{
      byPos[p].forEach(x=>{
        if(x.age==null) return;
        const thr=AGE_RISK_AGE[p];
        if(!thr || x.age<thr) return;
        const cutoff = AGE_FLAG_CUTOFF[p];
        if(!x.dynPosRank || x.dynPosRank>cutoff) return;
        flags.push({...x, pos:p});
      });
    });
    flags.sort((a,b)=>b.value-a.value);
    // Pick capital
    const picks = picksByRoster[team.roster_id]||[];
    const now=new Date(); const startYr=now.getFullYear()+(now.getMonth()>=8?1:0);
    const futureFirsts = picks.filter(p=>p.round===1 && p.year>startYr).length;
    // Window assessment
    let windowText='';
    if(avgAge!=null){
      if(team.arc.label==='Dynasty') windowText='Built for sustained contention';
      else if(team.arc.label==='Aging Contender') windowText='Window closing fast — push now';
      else if(team.arc.label==='Future Dynasty') windowText='Young core still cooking';
      else if(team.arc.label==='Contender') windowText=avgAge>=27.5?'Contender window open but closing':'Contender with runway';
      else if(team.arc.label==='Win-Now') windowText='Win now, figure out tomorrow later';
      else if(team.arc.label==='Rebuilding') windowText='Stockpiling for the next push';
      else windowText='Full rebuild mode';
    }
    // Young talent detection for tanking advice
    const youngCore=[];
    POS_ORDER.forEach(p=>{
      byPos[p].forEach(x=>{
        if(x.age!=null && x.age<=24.5 && (x.tier?.key==='Elite'||x.tier?.key==='T1')){
          youngCore.push({...x, pos:p});
        }
      });
    });
    // CONTENDING suggestions
    const sugsContending=[];
    const isAging = team.arc.label==='Aging Contender';
    if(isAging){
      // Aging Contender: window is closing — don't push youth, push vets.
      // Identify likely-late future 1sts the team owns (their own picks where they're projected early in standings)
      const myFutureFirsts = picks.filter(p=>p.round===1 && p.year>startYr);
      sugsContending.push({type:'window',text:`Window is closing (avg age ${avgAge??'—'}). Don't chase youth — convert picks into proven win-now producers.`});
      if(myFutureFirsts.length>0)
        sugsContending.push({type:'trade',text:`Package future 1sts — especially any that project late in their year — for established starters at your weakest position.`});
      POS_ORDER.forEach(p=>{
        const g=grades[p];
        if(g==='Critical'||g==='Thin') sugsContending.push({type:'thin',text:`${p} is ${g.toLowerCase()} — target a proven veteran starter at ${p} using picks as currency.`});
      });
    } else {
      POS_ORDER.forEach(p=>{
        const g=grades[p], b=buckets[p];
        if(g==='Critical') sugsContending.push({type:'critical', text:`Your ${p} room is critical — 0 players inside the top 24. Prioritize a ${p} upgrade above all else.`});
        else if(g==='Thin') sugsContending.push({type:'thin', text:`${p} is thin — only ${b.Elite+b.T1+b.T2} ${p} inside the top 24. Consider consolidating depth into a ${p} upgrade.`});
        else if(b.Elite===0 && b.T1>=3 && (p==='WR'||p==='RB')){
          sugsContending.push({type:'consolidate', text:`You have ${b.T1}+ tier-1 ${p}s but no Elite — consider consolidating into a top-5 ${p}.`});
        }
      });
      const oldRBStarters = starters.filter(s=>s.pos==='RB' && s.age!=null && s.age>=AGE_RISK_AGE.RB).length;
      if(oldRBStarters>=2) sugsContending.push({type:'age',text:`${oldRBStarters} of your starting RBs are 29+ — target a young RB in the next rookie draft.`});
      const oldTEStarters = starters.filter(s=>s.pos==='TE' && s.age!=null && s.age>=AGE_RISK_AGE.TE).length;
      if(oldTEStarters>=1 && starters.filter(s=>s.pos==='TE').length>0) sugsContending.push({type:'age',text:`Your starting TE is 27+ — TE decline starts here. Look at young TEs if you're not already elite.`});
      if(avgAge!=null && avgAge>=28.5)
        sugsContending.push({type:'window',text:`Roster trends old (${avgAge} avg) — push now. Don't hoard picks while your window is open.`});
    }
    if(futureFirsts===0 && team.arc.label!=='Dynasty' && !isAging)
      sugsContending.push({type:'critical',text:`Zero future 1st-round picks. Red flag unless you're in true Dynasty status.`});
    if(sugsContending.length===0)
      sugsContending.push({type:'good',text:`Roster looks balanced for your arc. Stay patient and attack trade markets opportunistically.`});

    // TANKING suggestions
    const sugsTanking=[];
    // Old vets to move (defined up top so we can gate the 1.01 tip on sellable assets)
    const oldVets=[];
    POS_ORDER.forEach(p=>{
      byPos[p].forEach(x=>{
        if(x.age!=null && x.age>=AGE_RISK_AGE[p] && x.tier && ['Elite','T1','T2'].includes(x.tier.key)){
          oldVets.push({...x, pos:p});
        }
      });
    });
    // Only surface the 1.01 tidbit when moving a few vets would realistically flip the tank.
    // Gate: at least 2 sellable aging vets AND team isn't already a Full Rebuild (no one to sell there).
    const canFlipTank = oldVets.length>=2 && team.arc.label!=='Full Rebuild';
    if(canFlipTank)
      sugsTanking.push({type:'tank',text:`Selling a few vets could flip you into tank mode. The 1.01 is ~50% more valuable than the 1.02 — commit fully rather than land mid-draft.`});
    if(oldVets.length>0)
      sugsTanking.push({type:'tank',text:`Aging vets still holding value: ${oldVets.slice(0,4).map(v=>`${v.name} (${v.pos} ${v.age.toFixed(1)})`).join(', ')}${oldVets.length>4?'…':''}. Cash them in for picks while the market still pays.`});
    if(youngCore.length>0)
      sugsTanking.push({type:'build',text:`Young core to build around: ${youngCore.slice(0,4).map(v=>v.name).join(', ')}${youngCore.length>4?'…':''}. Don't trade these — they're your next contention window.`});
    POS_ORDER.forEach(p=>{
      const g=grades[p];
      if(g==='Critical') sugsTanking.push({type:'tank',text:`${p} is barren — that's fine for a tank. Target rookie ${p}s in the upcoming draft.`});
    });
    if(avgAge!=null && avgAge>=27.5)
      sugsTanking.push({type:'tank',text:`Roster is still old (${avgAge} avg). A true tank means turning these vets into youth + picks, not just losing.`});
    if(avgAge!=null && avgAge<=24.5 && youngCore.length>=3)
      sugsTanking.push({type:'build',text:`Young core is already strong (${avgAge} avg, ${youngCore.length} young studs). You may be closer to contending than you think — consider a 'soft tank' this year then push next.`});
    sugsTanking.push({type:'rule',text:`Do not trade future 1sts. Acquiring future 1sts is the best course of action.`});

    return {byPos, buckets, grades, starters, avgAge, ageTierInfo, flags, picks, futureFirsts, windowText, sugsContending, sugsTanking, youngCore, hasFc};
  };

  // ── Grouped roster renderer ──
  const RosterSection = ({ team }) => {
    const picks = picksByRoster[team?.roster_id]||[];
    if (!team) return null;
    const hasFc = fcValues.length > 0;
    const byPos = {};
    POS_ORDER.forEach(p=>{ byPos[p]=[]; });
    team.allPlayers.forEach(pid=>{
      const fc=fcMap[pid];
      const pos=fc?.player?.position;
      if(pos&&byPos[pos]) byPos[pos].push({pid,fc});
      else if(fc) byPos['WR']?.push({pid,fc}); // fallback for flex/unknown
    });
    // Sort each group by dynasty value desc (always — Evan wants best dynasty asset first)
    POS_ORDER.forEach(p=>{ byPos[p].sort((a,b)=>(b.fc?.value||0)-(a.fc?.value||0)); });

    const teamChamps = champCounts[team.owner_id]||0;

    return (
      <div>
        {/* Roster header */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
          <span style={{fontSize:13,fontWeight:700,color:'#555',letterSpacing:1}}>ROSTER · {team.allPlayers.length} PLAYERS</span>
          {teamChamps>0&&(
            <span style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',background:'#111',border:'1px solid #FFD700',borderRadius:20,fontSize:13,fontWeight:800,color:'#FFD700'}}>
              {'🏆'.repeat(Math.min(teamChamps,5))} {teamChamps} LEAGUE TITLE{teamChamps>1?'S':''}
            </span>
          )}
          {hasFc&&(
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',width:96,justifyContent:'flex-end'}}>
              <span style={{fontSize:11,color:'#FFD700',fontWeight:700,width:44,textAlign:'right',letterSpacing:0.5}}>DYN</span>
              <span style={{fontSize:11,color:'#3b82f6',fontWeight:700,width:44,textAlign:'right',letterSpacing:0.5}}>RDFT</span>
            </div>
          )}
        </div>

        {/* Positions */}
        {POS_ORDER.filter(p=>byPos[p].length>0).map(pos=>{
          const group=byPos[pos];
          const posTotalD=group.reduce((s,{fc})=>s+(fc?.value||0),0);
          const posTotalR=group.reduce((s,{fc})=>s+(fc?.redraftValue||0),0);
          const col=POS_COLORS[pos]||'#888';
          return (
            <div key={pos} style={{marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px',background:'#111',borderLeft:'3px solid '+col,borderRadius:'5px 5px 0 0',marginBottom:3}}>
                <span style={{fontWeight:900,color:col,fontSize:13,letterSpacing:1}}>{pos}</span>
                <span style={{fontSize:12,color:col}}>({group.length})</span>
                {hasFc&&posTotalD>0&&(()=>{
                  const pr=posRanks[team.roster_id]?.[pos];
                  const n=ranked.length;
                  if(!pr?.dRank) return null;
                  return (
                    <span style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                      <span style={{fontSize:13,color:'#FFD700',fontWeight:900,letterSpacing:0.5}}>DYN #{pr.dRank}/{n}</span>
                      <span style={{fontSize:13,color:'#3b82f6',fontWeight:900,letterSpacing:0.5}}>RDFT #{pr.rRank}/{n}</span>
                    </span>
                  );
                })()}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {group.map(({pid,fc})=>{
                  const dv=fc?.value||0;
                  const rv=fc?.redraftValue||0;
                  const dyn = fc?.positionRank||null;
                  const rdft = fc?.redraftPositionRank||null;
                  // Per-position tier config:
                  //   WR/RB: Elite both top 5, Stud 6-15, Starter 16-24, Flex Play 25-36
                  //   QB:    Elite both top 5, Stud 6-12, Starter 13-20, QB3 21-28
                  //   TE:    Elite both top 5, Stud 6-10, Starter 11-15, no green
                  const tierCfg =
                    pos==='QB' ? {eliteMax:5, purple:12, blue:20, green:28, greenBadge:{icon:'📋',label:'QB3',color:'#10b981'}} :
                    pos==='TE' ? {eliteMax:5, purple:10, blue:15, green:0,  greenBadge:null} :
                                 {eliteMax:5, purple:15, blue:24, green:36, greenBadge:{icon:'🔄',label:'FLEX PLAY',color:'#10b981'}};
                  const elite = dyn && dyn<=tierCfg.eliteMax && rdft && rdft<=tierCfg.eliteMax;
                  let borderCol = '#181818';
                  let bgCol = '#0a0a0a';
                  let tierBadge = null;
                  if (dyn===1) { borderCol = '#ff6a00'; bgCol = '#2a1400'; tierBadge = {icon:'🐐',label:'GOAT',color:'#ff6a00'}; }
                  else if (elite) { borderCol = '#FFD700'; bgCol = '#1a1400'; tierBadge = {icon:'⭐',label:'ELITE',color:'#FFD700'}; }
                  else if (dyn && dyn<=tierCfg.purple) { borderCol = '#c084fc'; tierBadge = {icon:'💎',label:'STUD',color:'#c084fc'}; }
                  else if (dyn && dyn<=tierCfg.blue)   { borderCol = '#3b82f6'; tierBadge = {icon:'💪',label:'STARTER',color:'#3b82f6'}; }
                  else if (dyn && dyn<=tierCfg.green)  { borderCol = '#10b981'; tierBadge = tierCfg.greenBadge; }
                  const ageNum = fc?.player?.maybeAge ?? fc?.player?.age ?? null;
                  const age = ageNum!=null ? Number(ageNum).toFixed(1) : null;
                  const ageCliff = ageNum!=null && AGE_RISK_AGE[pos]!=null && ageNum >= AGE_RISK_AGE[pos];
                  // Prime age tops (peak end) per position — at/below = prime or younger
                  const PRIME_MAX = {RB:28, WR:26, TE:26, QB:30};
                  const agePrime = !ageCliff && ageNum!=null && PRIME_MAX[pos]!=null && ageNum <= PRIME_MAX[pos];
                  const nflTeam = fc?.player?.team || null;
                  return (
                    <div key={pid} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 4px',minWidth:0}}>
                      <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 10px',background:bgCol,border:`1px solid ${borderCol}`,borderRadius:7,minWidth:0,flex:'0 1 auto'}}>
                        {tierBadge && <span style={{fontSize:12,fontWeight:900,color:tierBadge.color,letterSpacing:1,flexShrink:0}}>{tierBadge.icon} {tierBadge.label}</span>}
                        <span style={{fontSize:13,fontWeight:700,color:fc?'#f0f0f0':'#444',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>{fc?.player?.name||pid}</span>
                        {nflTeam && <span style={{fontSize:12,color:'#666',flexShrink:0,fontWeight:700}}>{nflTeam}</span>}
                      </div>
                      {age && <span style={{fontSize:12,color:ageCliff?'#ef4444':agePrime?'#10b981':'#888',fontWeight:ageCliff||agePrime?900:600,flexShrink:0,whiteSpace:'nowrap'}}>{ageCliff?'🚩 ':''}Age: {age}</span>}
                      {hasFc&&(
                        <div style={{display:'flex',gap:8,flexShrink:0,alignItems:'center'}}>
                          <span style={{fontSize:12,color:'#FFD700',fontWeight:700}}>Dyn {pos}#{dyn||'NR'}</span>
                          <span style={{fontSize:12,color:'#3b82f6',fontWeight:700}}>Rdft {pos}#{rdft||'NR'}</span>
                        </div>
                      )}
                      {hasFc&&(
                        <div style={{marginLeft:'auto',display:'flex',flexShrink:0,alignItems:'center',width:96,justifyContent:'flex-end'}}>
                          <span style={{fontSize:13,fontWeight:700,color:'#FFD700',width:44,textAlign:'right'}}>{dv>0?(dv/1000).toFixed(1)+'k':'—'}</span>
                          <span style={{fontSize:13,fontWeight:700,color:'#3b82f6',width:44,textAlign:'right'}}>{rv>0?(rv/1000).toFixed(1)+'k':'—'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Draft Capital */}
        {picks.length>0&&(
          <div style={{marginTop:4}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px',background:'#111',borderLeft:'3px solid #FFD700',borderRadius:'5px 5px 0 0',marginBottom:3}}>
              <span style={{fontWeight:900,color:'#FFD700',fontSize:13,letterSpacing:1}}>DRAFT CAPITAL</span>
              <span style={{fontSize:12,color:'#FFD700'}}>({picks.length} picks)</span>
            </div>
            {Object.entries(
              picks.reduce((acc,p)=>{ if(!acc[p.year])acc[p.year]=[]; acc[p.year].push(p); return acc; },{})
            ).map(([year,picks])=>(
              <div key={year}>
                <div style={{fontSize:12,color:'#444',fontWeight:700,letterSpacing:1,padding:'8px 12px 4px',background:'#0a0a0a',borderTop:'1px solid #181818'}}>{year} ROOKIE PICKS</div>
                {picks.map((p,i)=>{
                  const fromTeam = !p.isOwn ? rosterNameMap[p.origRid] : null;
                  const ord = ORDINALS[p.round-1]||`${p.round}th`;
                  const labelColor = p.round===1?'#FFD700':p.round===2?'#bbb':p.round===3?'#8B6914':'#555';
                  const {slotValues={},futureValues={}}=fcPickMap;
                  let fcVal=0;
                  if(p.isCurrent){
                    fcVal = (p.slotNum && slotValues[p.round]?.[p.slotNum]) || 0;
                  } else {
                    fcVal = futureValues[`${p.year}_${p.round}`] || 0;
                  }
                  const label = p.slotStr ? `${p.round}.${p.slotStr}` : ord;
                  return (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#0a0a0a',border:'1px solid #181818',borderTop:'none',borderRadius:i===picks.length-1?'0 0 6px 6px':'0'}}>
                      <span style={{fontSize:14,fontWeight:900,color:labelColor,minWidth:36,flexShrink:0}}>{label}</span>
                      <span style={{flex:1,fontSize:13,color:'#666'}}>{fromTeam?`via ${fromTeam}`:'Own pick'}</span>
                      <span style={{fontSize:13,fontWeight:700,color:labelColor,flexShrink:0}}>{fcVal>0?(fcVal/1000).toFixed(1)+'k':'—'}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>

      {/* Connect Sleeper */}
      <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
        <div style={{fontSize:13,fontWeight:900,color:'#FFD700',marginBottom:14,textTransform:'uppercase',letterSpacing:1}}>🔗 Sleeper Account</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input value={username} onChange={e=>setUsername(e.target.value)} onKeyDown={e=>e.key==='Enter'&&connectUser()}
            placeholder="Sleeper username" style={inp2({flex:1,minWidth:160})}/>
          <button onClick={connectUser} disabled={!!loading}
            style={{padding:'7px 18px',background:'#FFD700',border:'none',borderRadius:7,color:'#000',fontWeight:900,cursor:'pointer',fontSize:13}}>
            {loading==='user'||loading==='leagues'?'...':'Load Teams'}
          </button>
          {sleeperUser&&<span style={{fontSize:14,color:'#10b981',fontWeight:700}}>✓ {sleeperUser.display_name}</span>}
        </div>
        {error&&<div style={{marginTop:10,padding:'8px 12px',background:'#200000',border:'1px solid #ef4444',borderRadius:7,fontSize:14,color:'#ef4444'}}>{error}</div>}
      </div>

      {/* League Picker */}
      {sleeperUser&&leagues.length>0&&(
        <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
          <div style={{fontSize:13,fontWeight:900,color:'#FFD700',marginBottom:14,textTransform:'uppercase',letterSpacing:1}}>🏈 Your Leagues · 2025</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {leagues.map(lg=>{
              const active=league?.league_id===lg.league_id;
              const arc=leagueArcs[lg.league_id];
              return (
                <button key={lg.league_id} onClick={()=>selectLeague(lg)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:active?'#141414':'#080808',border:'1px solid '+(active?'#FFD700':'#222'),borderRadius:9,cursor:'pointer',textAlign:'left',width:'100%',flexWrap:'wrap'}}>
                  {arc&&<span style={{padding:'2px 8px',borderRadius:4,fontSize:12,fontWeight:800,background:'#111',color:arc.color,border:'1px solid '+arc.color,flexShrink:0}}>{arc.emoji} {arc.label}</span>}
                  <span style={{fontWeight:700,fontSize:13,color:active?'#FFD700':'#f0f0f0',flex:1,minWidth:120}}>{lg.name}</span>
                  <span style={{fontSize:13,color:'#555'}}>{lg.total_rosters} teams</span>
                  {active&&<span style={{fontSize:13,color:'#FFD700',fontWeight:700}}>●</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {sleeperUser&&!loading&&leagues.length===0&&(
        <div style={{padding:'20px',textAlign:'center',color:'#555',fontSize:13}}>No 2025 leagues found for this account.</div>
      )}

      {/* Loading */}
      {(loading==='data'||loading==='fc')&&(
        <div style={{padding:'24px',textAlign:'center',color:'#FFD700',fontSize:13,fontWeight:700,letterSpacing:1}}>
          {loading==='data'?'Loading roster data…':'Fetching player values…'}
        </div>
      )}

      {/* Pending-trade indicator */}
      {league && ranked.length>0 && pendingTrades>0 && (
        <a href={`https://sleeper.com/leagues/${league.league_id}/trade`} target="_blank" rel="noopener" style={{alignSelf:'flex-start',display:'inline-flex',alignItems:'center',gap:8,padding:'8px 14px',background:'#1a1400',border:'1px solid #FFD700',borderRadius:8,fontSize:14,fontWeight:800,color:'#FFD700',textDecoration:'none',letterSpacing:0.5,animation:'pfk-pulse 1.8s ease-in-out infinite'}}>
          🔔 {pendingTrades} pending trade{pendingTrades>1?'s':''}
        </a>
      )}

      {/* League Settings bar */}
      {league && (()=>{
        const rp  = league.roster_positions||[];
        const ss  = league.scoring_settings||{};
        const isSF= rp.includes('SUPER_FLEX');
        const starters = rp.filter(s=>s!=='BN' && s!=='IR' && s!=='TAXI').length;
        const ppr  = ss.rec ?? 0;
        const tep  = ss.bonus_rec_te ?? 0;
        const pTD  = ss.pass_td ?? 4;
        const recFD= ss.bonus_rec_fd ?? 0;
        const rushFD = ss.bonus_rush_fd ?? 0;
        const ppc  = ss.rush_att ?? 0;
        const pprLabel = ppr>=1?'Full PPR':ppr>=0.5?'Half PPR':ppr>0?`${ppr} PPR`:'Standard';
        const pills = [
          {l:'Format', v:isSF?'Superflex':'1-QB'},
          {l:'Starters', v:String(starters)},
          {l:'Pass TD', v:`${pTD} pts`},
          {l:'PPR', v:pprLabel},
        ];
        if(tep>0)           pills.push({l:'TE Premium', v:`+${tep}`});
        if(ppc>0)           pills.push({l:'PPC',        v:`+${ppc}`});
        if(recFD>0||rushFD>0){
          const parts=[];
          if(recFD>0)  parts.push(`+${recFD} rec`);
          if(rushFD>0) parts.push(`+${rushFD} rush`);
          pills.push({l:'PPFD', v:parts.join(' / ')});
        }
        return (
          <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:10,padding:'10px 14px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
              <span style={{fontSize:12,fontWeight:800,color:'#888',letterSpacing:2}}>LEAGUE SETTINGS</span>
              <span style={{fontSize:13,color:'#666'}}>· {league.name}</span>
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {pills.map(p=>(
                <div key={p.l} style={{background:'#111',border:'1px solid #1e1e1e',borderRadius:7,padding:'6px 10px',display:'flex',flexDirection:'column',minWidth:92}}>
                  <span style={{fontSize:11,color:'#666',fontWeight:700,letterSpacing:0.5}}>{p.l}</span>
                  <span style={{fontSize:14,fontWeight:800,color:'#f0f0f0',marginTop:1}}>{p.v}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Selected Team Card — analyze any team in the league */}
      {(()=>{
        const selTeam = ranked.find(t=>t.roster_id===analyzerRid) || myTeam;
        if(!selTeam) return null;
        const aSel = analyzeTeam(selTeam);
        const avgAge = aSel?.avgAge;
        const ageTierInfo = aSel?.ageTierInfo;
        const isMine = selTeam.owner_id===sleeperUser?.user_id;
        return (
          <div style={{background:'#0f0f0f',border:`2px solid ${selTeam.arc.color}`,borderRadius:14,padding:24}}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap',marginBottom:18}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <div style={{fontSize:13,color:'#666',fontWeight:700,letterSpacing:2}}>{isMine?'YOUR TEAM':'ANALYZING'}</div>
                  <button onClick={refreshLeague} disabled={!!loading} style={{marginLeft:'auto',padding:'3px 10px',background:'#111',border:'1px solid #333',borderRadius:6,color:loading?'#444':'#aaa',cursor:loading?'default':'pointer',fontSize:12,fontWeight:700,letterSpacing:0.5}}>{loading?'LOADING…':'↻ REFRESH'}</button>
                </div>
                <select value={selTeam.roster_id} onChange={e=>{setAnalyzerRid(Number(e.target.value));setSuggestionMode(null);}} style={{background:'#111',border:`1px solid ${selTeam.arc.color}`,borderRadius:7,color:'#f0f0f0',padding:'8px 12px',fontSize:17,fontWeight:900,minWidth:220,maxWidth:'100%'}}>
                  {[...ranked].sort((a,b)=>a.dRank-b.dRank).map(t=>(
                    <option key={t.roster_id} value={t.roster_id}>
                      #{t.dRank} · {t.teamName}{t.owner_id===sleeperUser?.user_id?' ★':''}
                    </option>
                  ))}
                </select>
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6,flexWrap:'wrap'}}>
                  <div style={{fontSize:13,color:'#666'}}>{league?.name}</div>
                  {lastFetched&&<div style={{fontSize:12,color:'#444'}}>· Updated {lastFetched.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>}
                </div>
              </div>
              <div style={{textAlign:'center',padding:'12px 18px',background:'#111',border:`2px solid ${selTeam.arc.color}`,borderRadius:10,flexShrink:0}}>
                <div style={{fontSize:26}}>{selTeam.arc.emoji}</div>
                <div style={{fontSize:15,fontWeight:900,color:selTeam.arc.color,marginTop:2,letterSpacing:1}}>{selTeam.arc.label.toUpperCase()}</div>
                <div style={{fontSize:12,color:'#888',marginTop:3,maxWidth:160}}>{selTeam.arc.desc}</div>
              </div>
              {avgAge!=null && ageTierInfo && (
                <div style={{textAlign:'center',padding:'12px 18px',background:'#111',border:`2px solid ${ageTierInfo.color}`,borderRadius:10,flexShrink:0}}>
                  <div style={{fontSize:22,fontWeight:900,color:ageTierInfo.color}}>{avgAge}</div>
                  <div style={{fontSize:14,fontWeight:900,color:ageTierInfo.color,marginTop:3,letterSpacing:1}}>{ageTierInfo.label.toUpperCase()}</div>
                  <div style={{fontSize:12,color:'#888',marginTop:3}}>team avg age</div>
                </div>
              )}
            </div>
            {/* Stat pills */}
            {fcValues.length>0&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:20}}>
                {[
                  {l:'Dynasty Rank', v:`#${selTeam.dRank} / ${ranked.length}`, c:selTeam.arc.color},
                  {l:'Redraft Rank',  v:`#${selTeam.rRank} / ${ranked.length}`, c:selTeam.rRank<=ranked.length/3?'#10b981':selTeam.rRank<=ranked.length*2/3?'#FFD700':'#ef4444'},
                  {l:'Dynasty Value', v:(selTeam.dVal/1000).toFixed(1)+'k',     c:'#FFD700'},
                  {l:'Redraft Value', v:(selTeam.rVal/1000).toFixed(1)+'k',     c:'#3b82f6'},
                ].map(({l,v,c})=>(
                  <div key={l} style={{background:'#0a0a0a',borderRadius:8,padding:'10px 12px',border:'1px solid #1e1e1e',textAlign:'center'}}>
                    <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
                    <div style={{fontSize:12,fontWeight:600,color:'#666',marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
            )}
            {fcError&&<div style={{padding:'8px 12px',background:'#1a0e00',border:'1px solid #f59e0b',borderRadius:7,fontSize:13,color:'#f59e0b',marginBottom:14}}>⚠️ Player values unavailable — showing Sleeper roster only.</div>}
            <div className="pfk-wide-scroll"><RosterSection team={selTeam}/></div>
            {aSel && (()=>{
              const {flags, picks, futureFirsts, windowText, sugsContending, sugsTanking} = aSel;
              const contenderArcs=['Dynasty','Contender','Win-Now','Aging Contender','Future Dynasty'];
              const defaultMode = contenderArcs.includes(selTeam.arc.label) ? 'contending' : 'tanking';
              const mode = suggestionMode || defaultMode;
              const activeSugs = mode==='tanking' ? sugsTanking : sugsContending;
              const n = rosters.length || 12;
              return (
                <div style={{display:'flex',flexDirection:'column',gap:16,marginTop:20}}>
                  <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
                    <div style={{fontSize:14,fontWeight:900,color:'#FFD700',letterSpacing:1,marginBottom:14,textTransform:'uppercase'}}>Age Cliff Red Flags</div>
                    {flags.length===0 && <div style={{fontSize:13,color:'#10b981'}}>✓ No startable players past their cliff threshold.</div>}
                    {flags.length>0 && (
                      <div style={{display:'flex',flexDirection:'column',gap:5}}>
                        {flags.map(f=>(
                          <div key={f.pid} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 14px',background:'#0f0f0f',border:'1px solid #2a1a00',borderRadius:7}}>
                            <span style={{fontSize:16,lineHeight:1}}>🚩</span>
                            <span style={{fontSize:14,fontWeight:700,color:'#f0f0f0',flex:1}}>{f.name}</span>
                            <span style={{fontSize:14,fontWeight:900,color:'#f59e0b',letterSpacing:0.5}}>{f.pos} · {f.age.toFixed(1)}y</span>
                            <span style={{fontSize:13,color:'#888'}}>Dyn {f.pos}#{f.dynPosRank||'NR'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
                      <span style={{fontSize:14,fontWeight:900,color:'#FFD700',letterSpacing:1,textTransform:'uppercase'}}>Team-Building Suggestions</span>
                      <div style={{display:'flex',gap:4,marginLeft:'auto',background:'#0f0f0f',border:'1px solid #222',borderRadius:8,padding:3}}>
                        {[['contending','🥇 Contending'],['tanking','🏗️ Tanking']].map(([k,l])=>(
                          <button key={k} onClick={()=>setSuggestionMode(k)} style={{padding:'6px 12px',background:mode===k?'#FFD700':'transparent',color:mode===k?'#000':'#888',border:'none',borderRadius:5,cursor:'pointer',fontSize:14,fontWeight:800,letterSpacing:0.5}}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:7}}>
                      {activeSugs.map((s,i)=>{
                        const col = s.type==='critical' ? '#ef4444' : s.type==='thin' ? '#f59e0b' : s.type==='age' ? '#d97706' : s.type==='window' ? '#3b82f6' : s.type==='tank' ? '#c084fc' : s.type==='build' ? '#10b981' : s.type==='rule' ? '#888' : '#FFD700';
                        return (
                          <div key={i} style={{display:'flex',gap:12,padding:'11px 14px',background:'#0f0f0f',borderLeft:`3px solid ${col}`,borderRadius:'0 7px 7px 0'}}>
                            <span style={{fontSize:14,color:'#f0f0f0',lineHeight:1.45}}>{s.text}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{fontSize:13,color:'#555',marginTop:12}}>Broad guidance — no specific trade offers. Never suggests trading future picks away.</div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* League Standings + Championship History — side-by-side on desktop */}
      <div className="pfk-pr-grid">
      {ranked.length>0&&(
        <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
            <span style={{fontSize:13,fontWeight:900,color:'#FFD700',textTransform:'uppercase',letterSpacing:1}}>📊 League Standings</span>
            <div style={{display:'flex',gap:6,marginLeft:'auto',alignItems:'center',flexWrap:'wrap'}}>
              <div style={{display:'flex',gap:2,background:'#0a0a0a',border:'1px solid #222',borderRadius:6,padding:2}} title="Starter = only usable lineup slots count · Total = all roster players count">
                {['starter','total'].map(m=>(
                  <button key={m} onClick={()=>setValueMode(m)} style={{padding:'4px 8px',background:valueMode===m?'#22c55e':'transparent',color:valueMode===m?'#000':'#888',border:'none',borderRadius:4,cursor:'pointer',fontSize:12,fontWeight:800,letterSpacing:1,textTransform:'uppercase'}}>{m}</button>
                ))}
              </div>
              <div style={{display:'flex',gap:2,background:'#0a0a0a',border:'1px solid #222',borderRadius:6,padding:2}}>
                {['dynasty','redraft'].map(m=>(
                  <button key={m} onClick={()=>setViewMode(m)} style={{padding:'4px 10px',background:viewMode===m?(m==='dynasty'?'#FFD700':'#3b82f6'):'transparent',color:viewMode===m?'#000':'#888',border:'none',borderRadius:4,cursor:'pointer',fontSize:12,fontWeight:800,letterSpacing:1,textTransform:'uppercase'}}>{m}</button>
                ))}
              </div>
            </div>
          </div>
          {fcError&&<div style={{padding:'8px 12px',background:'#1a0e00',border:'1px solid #f59e0b',borderRadius:7,fontSize:13,color:'#f59e0b',marginBottom:12}}>⚠️ Player values unavailable — showing Sleeper rosters only.</div>}
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {[...ranked].sort((a,b)=>viewMode==='redraft'?a.rRank-b.rRank:a.dRank-b.dRank).map((t,i)=>{
              const isMe=t.owner_id===sleeperUser?.user_id;
              const rings=champCounts[t.owner_id]||0;
              const isSelected=selectedOtherRid===t.roster_id;
              const clickable=!isMe;
              return (
                <div key={t.roster_id} className="pfk-standings-row" onClick={clickable?()=>setSelectedOtherRid(isSelected?null:t.roster_id):undefined} style={{display:'flex',flexDirection:'column',gap:6,padding:'10px 14px',background:isSelected?'#1a1a0a':isMe?'#141414':'#0a0a0a',border:'1px solid '+(isSelected?'#FFD700':isMe?t.arc.color:'#1e1e1e'),borderRadius:9,cursor:clickable?'pointer':'default'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:13,fontWeight:900,color:i<3?'#FFD700':'#555',width:28,flexShrink:0,textAlign:'center'}}>#{i+1}</span>
                    <span style={{flex:1,fontSize:14,fontWeight:isMe?900:700,color:isMe?'#FFD700':'#f0f0f0',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.username}{isMe?' ★':''}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span style={{padding:'2px 8px',fontSize:12,fontWeight:800,borderRadius:4,background:'#111',color:t.arc.color,border:'1px solid '+t.arc.color,flexShrink:0,whiteSpace:'nowrap'}}>{t.arc.emoji} {t.arc.label}</span>
                    {rings>0&&<span style={{fontSize:14,flexShrink:0,letterSpacing:1}} title={`${rings} league title${rings>1?'s':''}`}>{'🏆'.repeat(Math.min(rings,5))}</span>}
                    {fcValues.length>0&&(
                      <>
                        <span style={{fontSize:13,color:'#FFD700',fontWeight:700}}>D {(t.dVal/1000).toFixed(1)}k</span>
                        <span style={{fontSize:13,color:'#3b82f6',fontWeight:700}}>R {(t.rVal/1000).toFixed(1)}k</span>
                      </>
                    )}
                    <span style={{marginLeft:'auto',fontSize:12,color:'#666',fontWeight:700,flexShrink:0}}>#{i+1} of {ranked.length}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Championship History */}
      {championships.length>0&&(
        <div style={{background:'#0f0f0f',border:'2px solid #FFD700',borderRadius:14,padding:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,flexWrap:'wrap'}}>
            <span style={{fontSize:13,fontWeight:900,color:'#FFD700',textTransform:'uppercase',letterSpacing:1}}>🏆 Championship History</span>
            <span style={{fontSize:13,color:'#555'}}>{championships.length} season{championships.length!==1?'s':''} of data</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {championships.map((c,i)=>{
              const isMe=c.ownerId===sleeperUser?.user_id;
              const rings=champCounts[c.ownerId]||1;
              const isDefending=i===0;
              return(
                <div key={c.year+c.ownerId} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:isMe?'#141414':'#0a0a0a',border:'1px solid '+(isMe?'#FFD700':'#1e1e1e'),borderRadius:10}}>
                  <span style={{fontSize:13,fontWeight:900,color:'#FFD700',width:40,flexShrink:0}}>{c.year}</span>
                  <span style={{fontSize:24,flexShrink:0}}>🏆</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:800,color:isMe?'#FFD700':'#f0f0f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {c.teamName}{isMe?' ★':''}
                    </div>
                    {c.ownerName&&c.ownerName!==c.teamName&&(
                      <div style={{fontSize:13,color:'#555',marginTop:1}}>{c.ownerName}</div>
                    )}
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                    {rings>1&&<span style={{padding:'2px 8px',background:'#111',border:'1px solid #FFD700',borderRadius:10,fontSize:12,fontWeight:800,color:'#FFD700'}}>{rings}× Champ</span>}
                    {isDefending&&<span style={{padding:'2px 9px',background:'#FFD700',borderRadius:10,fontSize:12,fontWeight:900,color:'#000'}}>DEFENDING</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>{/* end pfk-pr-grid */}

      {/* Other team roster (click-to-view — toggles off on second click) */}
      {(()=>{
        const other = ranked.find(t=>t.roster_id===selectedOtherRid);
        if(!other || other.owner_id===sleeperUser?.user_id) return null;
        return (
          <div style={{background:'#0f0f0f',border:`2px solid ${other.arc.color}`,borderRadius:14,padding:24}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap',marginBottom:18}}>
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontSize:13,color:'#666',fontWeight:700,letterSpacing:2,marginBottom:4}}>VIEWING</div>
                <div style={{fontSize:20,fontWeight:900,color:'#f0f0f0'}}>{other.teamName}</div>
                <div style={{display:'flex',gap:10,marginTop:4,flexWrap:'wrap'}}>
                  <span style={{fontSize:13,color:'#FFD700',fontWeight:700}}>Dyn #{other.dRank} · {(other.dVal/1000).toFixed(1)}k</span>
                  <span style={{fontSize:13,color:'#3b82f6',fontWeight:700}}>Rdft #{other.rRank} · {(other.rVal/1000).toFixed(1)}k</span>
                </div>
              </div>
              <div style={{textAlign:'center',padding:'12px 18px',background:'#111',border:`2px solid ${other.arc.color}`,borderRadius:10,flexShrink:0}}>
                <div style={{fontSize:26}}>{other.arc.emoji}</div>
                <div style={{fontSize:15,fontWeight:900,color:other.arc.color,marginTop:2,letterSpacing:1}}>{other.arc.label.toUpperCase()}</div>
                <div style={{fontSize:12,color:'#888',marginTop:3,maxWidth:160}}>{other.arc.desc}</div>
              </div>
              <button onClick={()=>setSelectedOtherRid(null)} style={{padding:'6px 12px',background:'transparent',border:'1px solid #333',borderRadius:6,color:'#888',cursor:'pointer',fontSize:13,fontWeight:700}}>✕ Close</button>
            </div>
            <div className="pfk-wide-scroll"><RosterSection team={other}/></div>
          </div>
        );
      })()}

      {sleeperUser&&!league&&!loading&&leagues.length>0&&(
        <div style={{padding:'30px',textAlign:'center',color:'#555',fontSize:13}}>← Select a league above to see your team analysis</div>
      )}


    </div>
  );
}

function RenderList({src,allowEdit,autoTier,lockPlayers,lockReorder,onReorder,onMove,onEdit,onRemove,onRenameStart,onRenameCancel,onRenameSave,onDeleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer,onCancelEdit,posFilter,prospects,modelByName,pfkSettings,setRankingScoreOverride,showRankingScore,masterListForRS}){
  // autoTier defaults to !allowEdit. Pass autoTier={true} explicitly with allowEdit={true}
  // to get edit-capable rows that still group by PFK tiers (admin rankings preview).
  if(autoTier===undefined) autoTier = !allowEdit;
  // Drag-drop reorder is only meaningful when not auto-tiering.
  const allowDrag = allowEdit && !autoTier;
  // lockPlayers: hide ALL player-level edit affordances (✏️, ✕, ▲▼, drag handle).
  // Used in admin rankings (Option A): player roster comes from model tab.
  // Tier-level controls stay live.
  const allowPlayerEdit = allowEdit && !lockPlayers;
  // lockReorder: hide drag handles + ▲▼ but keep edit/remove. Used by the custom-tab
  // sort dropdown so users can still add/remove players while a sort is active.
  const allowPlayerDrag = allowDrag && !lockPlayers && !lockReorder;
  // Hide PFK Score on prod (main) — visible only on dev URL. Keeps the score private during
  // editing/preview but doesn't expose it to public prod visitors.
  const hidePfk = !isDevHost();
  const rowRefs = useRef({});
  const [draggingId,setDraggingId] = useState(null);
  const [insertBefore,setInsertBefore] = useState(null);
  const [ghostPos,setGhostPos] = useState({x:0,y:0});
  const [ghostOff,setGhostOff] = useState({x:0,y:0});
  const normName = s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const hoverCapable = useMemo(()=>typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(hover:hover)').matches,[]);
  const [popover,setPopover] = useState(null);
  // Compute the PFK model breakdown for a player (or null if no model entry).
  // Applies the per-combo multiplier (FORMAT × TEP × PTD) to the baseline PFK so the
  // public site's score reshuffles when settings chips change.
  // Per-player per-combo override: if m.comboOverrides[settingsSig] is set, use it directly.
  const modelBreakdown = (item) => {
    const m = modelByName && modelByName[normName(item.name)];
    if(!m) return null;
    const pos = m.pos || item.pos;
    const dc = m.dcOverride!=null ? +m.dcOverride : dcScoreFromPick(pos, m.pick);
    const film = filmAvgPct(m.filmScores);
    const base = pfkScore(m.stats, dc, film);
    const baseline = Math.round(base * landingMultiplier(m.landing) * 10) / 10;
    const sig = settingsSig(pfkSettings);
    const override = m.comboOverrides?.[sig];
    const pfk = override!=null && !isNaN(+override)
      ? Math.round(+override * 10) / 10
      : Math.round(baseline * comboMultiplier(pos, pfkSettings) * 10) / 10;
    return { name:item.name, stats:m.stats, dc, film, landing:m.landing, pfk, baseline, isOverride: override!=null };
  };
  // Auto-tier views: dynamic per-class auto-tiering by PFK gaps + position targets.
  // Tier names come from src in order; players bucket by autoTierBoundaries; empty tiers hidden.
  // Manual views (autoTier=false) keep the user's manual ordering & tiers.
  const sortedSrc = useMemo(()=>{
    if(!autoTier) return src;
    const tierItems = src.filter(x=>x.type==='tier').slice(0, PFK_TIER_TARGETS.length + 1);
    if(!tierItems.length) return src;
    const players = src.filter(x=>x.type!=='tier').slice();
    players.sort((a,b)=>{
      const ma=modelBreakdown(a), mb=modelBreakdown(b);
      const pa = ma && ma.pfk!=null ? ma.pfk : -1;
      const pb = mb && mb.pfk!=null ? mb.pfk : -1;
      return pb - pa;
    });
    const scores = players.map(p=>{ const m=modelBreakdown(p); return m && m.pfk!=null ? m.pfk : 0; });
    const boundaries = autoTierBoundaries(scores, tierItems.length);
    const buckets = tierItems.map(()=>[]);
    let cur = 0;
    for(let i = 0; i < tierItems.length; i++){
      const end = (i < boundaries.length) ? boundaries[i] : players.length;
      for(let j = cur; j < end && j < players.length; j++){
        buckets[i].push(players[j]);
      }
      cur = end;
    }
    const out = [];
    for(let i = 0; i < tierItems.length; i++){
      if(buckets[i].length){
        out.push(tierItems[i]);
        out.push(...buckets[i]);
      }
    }
    return out;
  },[src,autoTier,modelByName]);
  // Position filter, then drop tier headers that have no players following (per filter).
  // EXCEPT in edit mode — there we keep empty tiers visible so users can drop players into
  // them (otherwise clicking "+ Tier" looks broken because the new empty tier disappears).
  const flRaw = posFilter.size>=4 ? sortedSrc : sortedSrc.filter(x=>x.type==="tier"||posFilter.has(x.pos));
  const fl = (()=>{
    const out=[];
    for(let i=0; i<flRaw.length; i++){
      const x = flRaw[i];
      if(x.type==='tier'){
        const next = flRaw[i+1];
        if(allowEdit || (next && next.type!=='tier')) out.push(x);
      } else {
        out.push(x);
      }
    }
    return out;
  })();
  const showProspect = (e,item,prospect)=>{
    const r=e.currentTarget.getBoundingClientRect();
    const vw=window.innerWidth, vh=window.innerHeight;
    const W=240;
    const x=Math.max(8,Math.min(r.left, vw-W-8));
    // Estimated popover height: 180 photo + 240 text/sections + 24 padding ≈ 440.
    // Old 300 estimate was too low — flip-above wasn't triggering and the box got cut off.
    const H = 440;
    let y=r.bottom+6;
    if(y+H>vh) y=Math.max(8,r.top-H-6);
    setPopover({id:item.id, item, prospect, x, y});
  };
  const hideProspect = ()=>setPopover(null);

  useEffect(()=>{
    if(!popover) return;
    const close=()=>setPopover(null);
    window.addEventListener('scroll',close,true);
    let onDoc;
    if(!hoverCapable){
      onDoc=()=>setPopover(null);
      setTimeout(()=>document.addEventListener('click',onDoc),0);
    }
    return ()=>{
      window.removeEventListener('scroll',close,true);
      if(onDoc) document.removeEventListener('click',onDoc);
    };
  },[popover,hoverCapable]);

  useEffect(()=>{
    if(draggingId) document.body.classList.add('pfk-dragging');
    else document.body.classList.remove('pfk-dragging');
    return ()=>document.body.classList.remove('pfk-dragging');
  },[draggingId]);

  const calcInsert = useCallback((clientY,excludeId)=>{
    const rows=Object.entries(rowRefs.current)
      .filter(([id,el])=>el&&id!==excludeId)
      .map(([id,el])=>({id,mid:el.getBoundingClientRect().top+el.getBoundingClientRect().height/2}))
      .sort((a,b)=>a.mid-b.mid);
    for(const {id,mid} of rows){ if(clientY<mid)return id; }
    return null;
  },[]);

  // dragRef tracks pending/active drag without stale closure issues
  const dragRef = useRef({pending:null, dragging:null, insertBefore:null});

  const onPD=(e,id)=>{
    if(e.pointerType==="mouse"&&e.button!==0) return;
    const r=e.currentTarget.getBoundingClientRect();
    dragRef.current.pending={id, pointerId:e.pointerId, el:e.currentTarget,
      startX:e.clientX, startY:e.clientY,
      offX:e.clientX-r.left, offY:e.clientY-r.top};
  };

  const onPM=useCallback(e=>{
    const dr=dragRef.current;
    if(dr.dragging){
      // Already committed — update position
      const ib=calcInsert(e.clientY,dr.dragging);
      dr.insertBefore=ib;
      setGhostPos({x:e.clientX,y:e.clientY});
      setInsertBefore(ib);
      return;
    }
    if(!dr.pending) return;
    const dist=Math.hypot(e.clientX-dr.pending.startX, e.clientY-dr.pending.startY);
    if(dist<10) return; // not enough movement — let scroll happen
    // Commit to drag
    e.preventDefault();
    try{ dr.pending.el.setPointerCapture(dr.pending.pointerId); }catch{}
    setGhostOff({x:dr.pending.offX, y:dr.pending.offY});
    setGhostPos({x:e.clientX, y:e.clientY});
    dr.dragging=dr.pending.id;
    const ib=calcInsert(e.clientY,dr.pending.id);
    dr.insertBefore=ib;
    dr.pending=null;
    setDraggingId(dr.dragging);
    setInsertBefore(ib);
  },[calcInsert]);

  const onPU=useCallback(()=>{
    const dr=dragRef.current;
    if(dr.dragging) onReorder(dr.dragging,dr.insertBefore);
    dr.pending=null; dr.dragging=null; dr.insertBefore=null;
    setDraggingId(null); setInsertBefore(null);
  },[onReorder]);

  const draggingItem=draggingId?src.find(x=>x.id===draggingId):null;
  const DropLine=()=><div style={{height:3,background:"#FFD700",borderRadius:2,margin:"1px 2px",boxShadow:"0 0 10px #FFD700",flexShrink:0}}/>;

  const renderGhost=()=>{
    if(!draggingItem)return null;
    const gs={position:"fixed",left:ghostPos.x-ghostOff.x,top:ghostPos.y-ghostOff.y,pointerEvents:"none",zIndex:9999,opacity:0.93,transform:"rotate(1.2deg) scale(1.03)",width:"min(620px,calc(100vw - 32px))",boxShadow:"0 8px 32px rgba(0,0,0,0.85)"};
    if(draggingItem.type==="tier"){
      const col=getTierColor(draggingItem.name,src);
      return <div style={{...gs,borderLeft:"5px solid "+col,padding:"6px 14px",background:"#0f0f0f",borderRadius:6,border:"1px solid "+col}}><span style={{fontSize:18,fontWeight:900,color:col,textTransform:"uppercase",letterSpacing:2}}>{draggingItem.name}</span></div>;
    }
    const slot=slotLabel(getPlayerIndex(draggingItem.id,src)),col=getTierColor(getPlayerTier(draggingItem.id,src),src);
    return <div style={{...gs,background:"#0f0f0f",border:"2px solid "+col,borderRadius:10,padding:"10px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{width:44,textAlign:"center",fontSize:13,fontWeight:800,color:slot==="FAAB"?"#e0a800":col}}>{slot}</span>
        <span style={{padding:"2px 7px",borderRadius:5,fontSize:12,fontWeight:800,background:POS_COLORS[draggingItem.pos]+"22",color:POS_COLORS[draggingItem.pos],border:"1px solid "+POS_COLORS[draggingItem.pos]+"44"}}>{draggingItem.pos}</span>
        <span style={{fontWeight:700,fontSize:14,flex:1}}>{draggingItem.name}</span>
        <span style={{fontSize:13,color:"#555"}}>{draggingItem.college}</span>
      </div>
    </div>;
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:4,userSelect:"none"}}>
      {renderGhost()}
      {fl.map((item,vi)=>{
        const isDrag=draggingId===item.id;
        const showLine=draggingId&&draggingId!==item.id&&insertBefore===item.id;
        if(item.type==="tier"){
          const col=getTierColor(item.name,src), isRen=renamingTier===item.id;
          return(
            <React.Fragment key={item.id}>
              {showLine&&<DropLine/>}
              <div ref={el=>rowRefs.current[item.id]=el}
                onPointerDown={allowEdit?e=>onPD(e,item.id):undefined}
                onPointerMove={allowEdit?onPM:undefined} onPointerUp={allowEdit?onPU:undefined} onPointerCancel={allowEdit?onPU:undefined}
                style={{display:"flex",alignItems:"center",gap:10,borderLeft:"5px solid "+col,marginTop:vi===0?0:14,marginBottom:4,cursor:allowEdit?"grab":"default",opacity:isDrag?0.25:1,background:"transparent",borderRadius:4,padding:"4px 4px 4px 12px"}}>
                {allowEdit&&<span style={{color:"#555",fontSize:16,touchAction:"none",flexShrink:0}}>⠿</span>}
                {isRen?(
                  <><input value={tierNameDraft} onChange={e=>setTierNameDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onRenameSave()} autoFocus
                    style={{fontSize:16,fontWeight:900,background:"#0f0f0f",border:"1px solid "+col,borderRadius:6,color:col,padding:"4px 10px",width:180}}/>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={onRenameSave} style={{padding:"4px 12px",background:"#FFD700",border:"none",borderRadius:6,color:"#000",fontWeight:900,cursor:"pointer",fontSize:14}}>Save</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={onRenameCancel} style={{padding:"4px 8px",background:"transparent",border:"1px solid #333",borderRadius:6,color:"#777",cursor:"pointer",fontSize:14}}>✕</button></>
                ):(
                  <><span style={{fontSize:20,fontWeight:900,color:col,textTransform:"uppercase",letterSpacing:2,flex:1}}>{item.name}</span>
                  {allowEdit&&<>
                    <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onRenameStart(item.id,item.name)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#666",cursor:"pointer",fontSize:13,padding:"2px 8px"}}>✏️</button>
                    <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onDeleteTier(item.id)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#444",cursor:"pointer",fontSize:13,padding:"2px 8px"}}>🗑️</button>
                    {allowEdit&&<div style={{display:"flex",flexDirection:"column",gap:1}} title="Move tier up/down — controls which auto-tier bucket this name labels">
                      <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,-1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:3,color:"#555",cursor:"pointer",fontSize:12,padding:"1px 5px"}}>▲</button>
                      <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:3,color:"#555",cursor:"pointer",fontSize:12,padding:"1px 5px"}}>▼</button>
                    </div>}
                  </>}</>
                )}
              </div>
            </React.Fragment>
          );
        }
        const pidx=getPlayerIndex(item.id,sortedSrc),slot=slotLabel(pidx),tname=getPlayerTier(item.id,sortedSrc),col=getTierColor(tname,src),isEd=editingPlayer===item.id;
        const draftInfo = DRAFT_2026[normDraftName(item.name)] || null;
        if(isEd)return(
          <React.Fragment key={item.id}>
            {showLine&&<DropLine/>}
            <div style={{background:"#0f0f0f",border:"1px solid #FFD700",borderRadius:10,padding:"14px 16px"}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
                <div style={{display:"flex",flexDirection:"column",gap:3,flex:2,minWidth:120}}>
                  <label style={{fontSize:12,color:"#888"}}>NAME</label>
                  <input value={playerDraft.name||""} onChange={e=>setPlayerDraft({...playerDraft,name:e.target.value})} style={{padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:14,width:"100%"}}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{fontSize:12,color:"#888"}}>POS</label>
                  <select value={playerDraft.pos||"WR"} onChange={e=>setPlayerDraft({...playerDraft,pos:e.target.value})} style={{padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:14}}>
                    {["WR","RB","TE","QB"].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                {[["college","COLLEGE"]].map(([k,l])=>(
                  <div key={k} style={{display:"flex",flexDirection:"column",gap:3}}>
                    <label style={{fontSize:12,color:"#888"}}>{l}</label>
                    <input value={playerDraft[k]||""} onChange={e=>setPlayerDraft({...playerDraft,[k]:e.target.value})} style={{padding:"7px 8px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:14,width:k==="college"?90:58}}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={onSavePlayer} style={{padding:"7px 18px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:14}}>Save</button>
                <button onClick={onCancelEdit} style={{padding:"7px 12px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:14}}>Cancel</button>
              </div>
            </div>
          </React.Fragment>
        );
        return(
          <React.Fragment key={item.id}>
            {showLine&&<DropLine/>}
            <div ref={el=>rowRefs.current[item.id]=el} className="pfk-rookie-row"
              onPointerDown={allowPlayerDrag?e=>onPD(e,item.id):undefined}
              onPointerMove={allowPlayerDrag?onPM:undefined} onPointerUp={allowPlayerDrag?onPU:undefined} onPointerCancel={allowPlayerDrag?onPU:undefined}
              style={{background:"#0f0f0f",border:"2px solid #1e1e1e",borderRadius:10,padding:"10px 14px",cursor:allowPlayerDrag?"grab":"default",opacity:isDrag?0.25:1,transition:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {allowPlayerDrag&&<span style={{color:"#555",fontSize:18,flexShrink:0,touchAction:"none"}}>⠿</span>}
                <span className="pfk-rook-slot" style={{width:44,textAlign:"center",fontSize:13,fontWeight:800,flexShrink:0,color:slot==="FAAB"?"#e0a800":col,letterSpacing:0.5}}>{slot}</span>
                <span style={{padding:"2px 7px",borderRadius:5,fontSize:12,fontWeight:800,flexShrink:0,background:"#111",color:POS_COLORS[item.pos],border:"1px solid "+POS_COLORS[item.pos]}}>{item.pos}</span>
                {(()=>{
                  const p=prospects&&prospects[normName(item.name)];
                  // Popover always triggerable now — every player has a position, which is enough for FF hit rate.
                  const und={textDecorationLine:'underline',textDecorationStyle:'dotted',textUnderlineOffset:3,textDecorationColor:'#FFD70088',cursor:'help'};
                  const handlers=hoverCapable?{
                    onMouseEnter:e=>showProspect(e,item,p),
                    onMouseLeave:hideProspect
                  }:{
                    onClick:e=>{e.stopPropagation();if(popover&&popover.id===item.id)setPopover(null);else showProspect(e,item,p);},
                    onPointerDown:e=>e.stopPropagation()
                  };
                  return <span {...handlers} style={{fontWeight:700,fontSize:14,flexShrink:0,...und}}>{item.name}</span>;
                })()}
                <span className="pfk-rook-college" style={{fontSize:13,color:"#888",flexShrink:0,fontStyle:"italic"}}>{item.college}</span>
                {draftInfo&&(
                  <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 7px',background:'#0a0a0a',border:'1px solid #FFD70055',borderRadius:5,flexShrink:0}}>
                    <img src={`https://a.espncdn.com/i/teamlogos/nfl/500/${draftInfo.team.toLowerCase()}.png`} alt={draftInfo.team} style={{width:16,height:16,objectFit:'contain'}} onError={e=>{e.currentTarget.style.display='none';}}/>
                    <span style={{fontSize:12,fontWeight:800,color:'#FFD700',letterSpacing:0.5}}>{draftInfo.team} · {draftInfo.pick}</span>
                  </span>
                )}
                <span style={{flex:1}}/>
                {showRankingScore && (()=>{
                  // RS reflects the player's place in the MASTER list, not the derived view.
                  // This keeps WR/RB scores stable when TEP/PTD reshuffle TE/QB positions.
                  const rsRef = masterListForRS || src;
                  const auto = getAutoRankingScore(item, rsRef);
                  const eff = getEffectiveRankingScore(item, rsRef);
                  const isOverride = item.rankingScoreOverride != null && !isNaN(+item.rankingScoreOverride);
                  const onClick = () => {
                    const cur = isOverride ? item.rankingScoreOverride : (auto ?? '');
                    const v = prompt(`Ranking Score for ${item.name}\n(Auto: ${auto ?? '—'}, blank to clear override)`, cur);
                    if(v === null) return;
                    setRankingScoreOverride && setRankingScoreOverride(item.id, v.trim());
                  };
                  const labelColor = isOverride ? '#c084fc' : '#888';
                  const valColor   = isOverride ? '#c084fc' : (eff != null ? '#aaa' : '#444');
                  return (
                    <span onClick={onClick} title={`Ranking Score · click to edit · ${isOverride ? 'MANUALLY OVERRIDDEN — auto would be '+(auto ?? '—') : 'auto-derived from tier+rank'}`} style={{display:'inline-flex',alignItems:'baseline',gap:5,padding:'3px 9px',borderRadius:6,background:'#0a0a0a',border:'1px solid '+(isOverride ? '#c084fc' : '#222'),flexShrink:0,marginRight:6,cursor:'pointer'}}>
                      <span style={{fontSize:10,fontWeight:800,color:labelColor,letterSpacing:1}}>RS</span>
                      <span style={{color:valColor,fontWeight:900,fontSize:14,letterSpacing:0.3,minWidth:30,textAlign:'right'}}>{eff != null ? eff : '—'}</span>
                      {isOverride && <button onClick={e=>{e.stopPropagation(); setRankingScoreOverride && setRankingScoreOverride(item.id,'');}} style={{marginLeft:2,background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:11,padding:0}} title="Clear override">×</button>}
                    </span>
                  );
                })()}
                {!hidePfk && (()=>{ const m=modelBreakdown(item); return (
                  <span title={m?`PFK Score: ${m.pfk}`:'No PFK Score available'} style={{display:'inline-flex',alignItems:'baseline',gap:5,padding:'3px 9px',borderRadius:6,background:'#0a0a0a',border:'1px solid '+(m?'#FFD70066':'#222'),flexShrink:0,marginRight:6}}>
                    <span style={{fontSize:10,fontWeight:800,color:'#888',letterSpacing:1}}>PFK SCORE</span>
                    <span style={{color:m?'#FFD700':'#444',fontWeight:900,fontSize:14,letterSpacing:0.3,minWidth:30,textAlign:'right'}}>{m?m.pfk:'—'}</span>
                  </span>
                ); })()}
                {allowPlayerDrag&&<div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,-1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:4,color:"#666",cursor:"pointer",fontSize:12,padding:"1px 6px"}}>▲</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:4,color:"#666",cursor:"pointer",fontSize:12,padding:"1px 6px"}}>▼</button>
                </div>}
                {allowPlayerEdit&&<>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onEdit(item)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,color:"#666",cursor:"pointer",fontSize:14,padding:"4px 8px"}}>✏️</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onRemove(item.id)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,color:"#444",cursor:"pointer",fontSize:14,padding:"4px 8px"}}>✕</button>
                </>}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {draggingId&&insertBefore===null&&<DropLine/>}
      {popover&&(()=>{
        const it = popover.item;
        const draft = it ? DRAFT_2026[normName(it.name)] : null;
        const hr = it ? ffHitRate(it.pos, draft?.pick) : null;
        const draftLabel = draft?.pick ? (draft.pick==='UDFA' ? 'UDFA' : `${draft.team||'—'} · ${draft.pick}`) : 'Undrafted';
        const hrLabel = it?.pos && FF_HIT_RATE[it.pos] ? FF_HIT_RATE[it.pos].metric : 'Fantasy starter (first 3 yrs)';
        const hrColor = hr==null ? '#444' : (hr>=40 ? '#10b981' : hr>=20 ? '#FFD700' : hr>=10 ? '#f59e0b' : '#ef4444');
        return (
          <div style={{position:'fixed',left:popover.x,top:popover.y,zIndex:9998,background:'#0f0f0f',border:'1px solid #FFD700',borderRadius:10,padding:12,width:240,boxShadow:'0 8px 32px rgba(0,0,0,0.85)',pointerEvents:hoverCapable?'none':'auto'}}
            onClick={e=>e.stopPropagation()}>
            {popover.prospect&&(<>
              <img src={popover.prospect.headshot} alt="" style={{width:'100%',height:180,objectFit:'cover',borderRadius:8,background:'#000'}} onError={e=>{e.currentTarget.style.display='none';}}/>
            </>)}
            <div style={{fontWeight:900,fontSize:14,marginTop:popover.prospect?8:0,color:'#FFD700'}}>{it?.name||popover.prospect?.name||''}</div>
            <div style={{fontSize:13,color:'#888',marginTop:2}}>{(it?.pos||popover.prospect?.position||'')} · {(it?.college||popover.prospect?.college||'')}</div>
            {popover.prospect&&(
              <div style={{display:'flex',gap:14,marginTop:8,fontSize:14,flexWrap:'wrap'}}>
                <div><span style={{color:'#555'}}>HT </span><span style={{fontWeight:700}}>{popover.prospect.height||'—'}</span></div>
                <div><span style={{color:'#555'}}>WT </span><span style={{fontWeight:700}}>{popover.prospect.weight?popover.prospect.weight+' lbs':'—'}</span></div>
                <div><span style={{color:'#555'}}>AGE </span><span style={{fontWeight:700}}>{popover.prospect.age!=null?popover.prospect.age:'—'}</span></div>
              </div>
            )}
            <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #1a1a1a'}}>
              <div style={{fontSize:11,fontWeight:800,color:'#888',letterSpacing:1,marginBottom:4}}>NFL DRAFT CAPITAL</div>
              <div style={{fontSize:13,fontWeight:700,color:'#ddd'}}>{draftLabel}</div>
            </div>
            <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #1a1a1a'}}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
                <span style={{fontSize:11,fontWeight:800,color:'#888',letterSpacing:1}}>FF HIT RATE</span>
                <span style={{fontSize:22,fontWeight:900,color:hrColor,letterSpacing:0.5}}>{hr!=null?hr+'%':'—'}</span>
              </div>
              <div style={{fontSize:11,color:'#666',marginTop:4,lineHeight:1.4}}>{hrLabel}</div>
              <div style={{fontSize:10,color:'#444',marginTop:6,fontStyle:'italic'}}>Sources: Fantasy Footballers, fantasyclassroom.org, ESPN/Yahoo/PFF top-pick analyses</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function TradePollsTab({session,onRequestSignIn}){
  const [polls,setPolls]=useState([]);
  const [myVotes,setMyVotes]=useState({});
  const [loading,setLoading]=useState(true);
  const [showCreate,setShowCreate]=useState(false);
  const [newOpts,setNewOpts]=useState(['','']);
  const [newSettings,setNewSettings]=useState({teams:'12',format:'Superflex',ppr:'1.0',tep:'0.5',passTd:'6',ppc:'0',status:''});
  const [err,setErr]=useState('');

  const load=useCallback(async()=>{
    if(!sb){ setLoading(false); return; }
    setLoading(true);
    const { data:polls } = await sb.from('polls').select('id,title,options,settings,created_at,poll_votes(option_index,user_id)').order('created_at',{ascending:false}).limit(100);
    // 48-hour expiration: polls older than 48hrs are filtered from the public feed.
    // Computed client-side from created_at — no schema migration needed.
    const POLL_TTL_MS = 48 * 60 * 60 * 1000;
    const cutoff = Date.now() - POLL_TTL_MS;
    const fresh = (polls||[]).filter(p => new Date(p.created_at).getTime() > cutoff);
    const list=fresh.map(p=>{
      const counts=Array(p.options.length).fill(0);
      (p.poll_votes||[]).forEach(v=>{ if(counts[v.option_index]!==undefined) counts[v.option_index]++; });
      return {...p, counts, total:(p.poll_votes||[]).length};
    });
    setPolls(list);
    if(session){
      const mine={};
      (polls||[]).forEach(p=>{
        const v=(p.poll_votes||[]).find(x=>x.user_id===session.user.id);
        if(v) mine[p.id]=v.option_index;
      });
      setMyVotes(mine);
    }else{ setMyVotes({}); }
    setLoading(false);
  },[session]);

  useEffect(()=>{ load(); },[load]);

  const castVote=async(pollId,idx)=>{
    if(!session){ onRequestSignIn(); return; }
    setMyVotes(m=>({...m,[pollId]:idx}));
    setPolls(prev=>prev.map(p=>{
      if(p.id!==pollId) return p;
      const counts=[...p.counts];
      const prior=myVotes[pollId];
      if(prior!==undefined&&prior!==idx) counts[prior]=Math.max(0,counts[prior]-1);
      if(prior!==idx) counts[idx]++;
      return {...p,counts,total:prior===undefined?p.total+1:p.total};
    }));
    await sb.from('poll_votes').upsert({poll_id:pollId,user_id:session.user.id,option_index:idx,updated_at:new Date().toISOString()});
  };

  const createPoll=async()=>{
    setErr('');
    const opts=newOpts.map(o=>o.trim()).filter(Boolean);
    if(opts.length<2){ setErr('Need at least 2 options.'); return; }
    const settings={ teams:Number(newSettings.teams)||null, format:newSettings.format, ppr:Number(newSettings.ppr), tep:Number(newSettings.tep), passTd:Number(newSettings.passTd)||null, ppc:Number(newSettings.ppc)||0, status:newSettings.status||null };
    const { data, error } = await sb.from('polls').insert({created_by:session.user.id,title:'',options:opts,settings}).select().single();
    if(error){ setErr(error.message); return; }
    setNewOpts(['','']); setShowCreate(false);
    setPolls(prev=>[{...data,counts:Array(opts.length).fill(0),total:0,poll_votes:[]},...prev]);
  };

  const addOpt=()=>setNewOpts(o=>o.length>=10?o:[...o,'']);
  const setOpt=(i,v)=>setNewOpts(o=>o.map((x,j)=>j===i?v:x));
  const rmOpt=(i)=>setNewOpts(o=>o.length<=2?o:o.filter((_,j)=>j!==i));

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:10,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:20,fontWeight:900,color:'#FFD700',letterSpacing:1}}>TRADE POLLS</div>
          <div style={{fontSize:13,color:'#777',marginTop:2}}>Post a trade, vote anonymously. You can change your vote anytime.</div>
        </div>
        {session?(
          <button onClick={()=>setShowCreate(s=>!s)} style={{padding:'10px 18px',background:'#FFD700',color:'#000',border:'none',borderRadius:8,fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1}}>{showCreate?'✕ CANCEL':'+ NEW POLL'}</button>
        ):(
          <button onClick={onRequestSignIn} style={{padding:'10px 18px',background:'transparent',color:'#FFD700',border:'1px solid #FFD700',borderRadius:8,fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1}}>SIGN IN TO POST</button>
        )}
      </div>

      {showCreate&&(
        <div style={{background:'#0f0f0f',border:'1px solid #FFD700',borderRadius:10,padding:16,marginBottom:18}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:12}}>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:12,color:'#888',letterSpacing:1}}>TEAMS</label>
              <input value={newSettings.teams} onChange={e=>setNewSettings({...newSettings,teams:e.target.value})} placeholder="12" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:12,color:'#888',letterSpacing:1}}>FORMAT</label>
              <select value={newSettings.format} onChange={e=>setNewSettings({...newSettings,format:e.target.value})} style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}>
                <option>Superflex</option><option>1QB</option>
              </select>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:12,color:'#888',letterSpacing:1}}>PPR</label>
              <input value={newSettings.ppr} onChange={e=>setNewSettings({...newSettings,ppr:e.target.value})} placeholder="1.0" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:12,color:'#888',letterSpacing:1}}>TE PREMIUM</label>
              <input value={newSettings.tep} onChange={e=>setNewSettings({...newSettings,tep:e.target.value})} placeholder="1.0" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:12,color:'#888',letterSpacing:1}}>PASS TD</label>
              <input value={newSettings.passTd} onChange={e=>setNewSettings({...newSettings,passTd:e.target.value})} placeholder="6" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:12,color:'#888',letterSpacing:1}}>PPC</label>
              <input value={newSettings.ppc} onChange={e=>setNewSettings({...newSettings,ppc:e.target.value})} placeholder="0" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:12,color:'#888',letterSpacing:1}}>TEAM STATUS (optional)</label>
              <select value={newSettings.status} onChange={e=>setNewSettings({...newSettings,status:e.target.value})} style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}>
                <option value="">—</option>
                <option>Contender</option>
                <option>Rebuilding</option>
              </select>
            </div>
          </div>
          {newOpts.map((o,i)=>(
            <div key={i} style={{display:'flex',gap:6,marginBottom:6}}>
              <input value={o} onChange={e=>setOpt(i,e.target.value)} placeholder={`Option ${i+1} (e.g., 'Accept', 'Decline', 'Counter')`} style={{flex:1,padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
              {newOpts.length>2&&<button onClick={()=>rmOpt(i)} style={{padding:'0 10px',background:'transparent',border:'1px solid #333',borderRadius:6,color:'#666',cursor:'pointer'}}>✕</button>}
            </div>
          ))}
          <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
            {newOpts.length<10&&<button onClick={addOpt} style={{padding:'7px 12px',background:'transparent',border:'1px solid #333',borderRadius:6,color:'#aaa',cursor:'pointer',fontSize:14}}>+ Option</button>}
            <button onClick={createPoll} style={{padding:'7px 18px',background:'#FFD700',color:'#000',border:'none',borderRadius:6,fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1,marginLeft:'auto'}}>POST POLL</button>
          </div>
          {err&&<div style={{color:'#ef4444',fontSize:14,marginTop:8}}>{err}</div>}
        </div>
      )}

      {loading?(
        <div style={{padding:40,color:'#555',textAlign:'center',fontSize:13}}>Loading polls...</div>
      ):polls.length===0?(
        <div style={{padding:40,color:'#555',textAlign:'center',fontSize:13,background:'#0a0a0a',border:'1px solid #1a1a1a',borderRadius:10}}>No polls yet. Be the first to post one!</div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {polls.map(p=>{
            const myIdx=myVotes[p.id];
            const voted=myIdx!==undefined;
            return (
              <div key={p.id} style={{background:'#0f0f0f',border:'1px solid #222',borderRadius:10,padding:16}}>
                {p.title&&<div style={{fontWeight:700,fontSize:14,marginBottom:8,color:'#eee'}}>{p.title}</div>}
                {p.settings&&(
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                    {p.settings.teams&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:13,color:'#FFD700',fontWeight:700}}>{p.settings.teams}-team</span>}
                    {p.settings.format&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:13,color:'#FFD700',fontWeight:700}}>{p.settings.format}</span>}
                    {(p.settings.ppr||p.settings.ppr===0)&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:13,color:'#FFD700',fontWeight:700}}>{p.settings.ppr} PPR</span>}
                    {(p.settings.tep||p.settings.tep===0)&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:13,color:'#FFD700',fontWeight:700}}>{p.settings.tep} TEP</span>}
                    {p.settings.passTd&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:13,color:'#FFD700',fontWeight:700}}>{p.settings.passTd} pt pass TD</span>}
                    {p.settings.ppc>0&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:13,color:'#FFD700',fontWeight:700}}>{p.settings.ppc} PPC</span>}
                    {p.settings.status&&<span style={{padding:'4px 10px',background:'#FFD700',border:'1px solid #FFD700',borderRadius:12,fontSize:13,color:'#000',fontWeight:800}}>{p.settings.status}</span>}
                  </div>
                )}
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {p.options.map((opt,i)=>{
                    const pct=p.total>0?Math.round((p.counts[i]/p.total)*100):0;
                    const isMine=myIdx===i;
                    return (
                      <button key={i} onClick={()=>castVote(p.id,i)} style={{position:'relative',textAlign:'left',padding:'10px 14px',background:'#0a0a0a',border:isMine?'2px solid #FFD700':'1px solid #2a2a2a',borderRadius:8,color:'#eee',cursor:'pointer',overflow:'hidden',fontSize:13,fontWeight:isMine?700:500}}>
                        <div style={{position:'absolute',left:0,top:0,bottom:0,width:pct+'%',background:isMine?'rgba(255,215,0,0.18)':'rgba(255,255,255,0.06)',transition:'width 0.25s'}}/>
                        <div style={{position:'relative',display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
                          <span>{isMine&&'✓ '}{opt}</span>
                          <span style={{fontSize:13,color:'#999',fontWeight:700,flexShrink:0}}>{p.counts[i]} · {pct}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{marginTop:10,display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:13,color:'#555'}}>
                  <span>{p.total} vote{p.total===1?'':'s'} · anonymous</span>
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
                {!session&&<div style={{marginTop:6,fontSize:12,color:'#666'}}>Sign in to vote</div>}
                {voted&&<div style={{marginTop:6,fontSize:12,color:'#666'}}>You can change your vote by tapping another option.</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OutlookTab() {
  const ranked      = loadStorage('pfk_ranked', []);
  const leagueName  = loadStorage('pfk_league_name', '');
  const sleeperUser = loadStorage('pfk_sleeper_obj', null);
  const myTeam      = ranked.find(r => r.owner_id === sleeperUser?.user_id);

  if (!sleeperUser || !ranked.length || !myTeam) {
    return (
      <div style={{textAlign:'center',padding:'60px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
        <div style={{fontSize:52}}>🔮</div>
        <div style={{fontSize:16,fontWeight:700,color:'#fff'}}>No team data yet</div>
        <div style={{fontSize:13,color:'#555',maxWidth:360,lineHeight:1.7}}>Connect your Sleeper account on the Power Rankings tab and select a league to see your team outlook and league comparison.</div>
      </div>
    );
  }

  const {arc,dRank,rRank,dVal,rVal,teamName} = myTeam;
  const n = ranked.length;
  const maxVal = ranked[0]?.dVal || 1;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>

      {/* Archetype hero */}
      <div style={{background:'#0a0a0a',border:`2px solid ${arc.color}`,borderRadius:16,padding:'32px 24px',textAlign:'center'}}>
        <div style={{fontSize:52,marginBottom:6}}>{arc.emoji}</div>
        <div style={{fontSize:32,fontWeight:900,color:arc.color,letterSpacing:3,lineHeight:1}}>{arc.label.toUpperCase()}</div>
        <div style={{fontSize:15,fontWeight:700,color:'#f0f0f0',marginTop:10}}>{teamName}</div>
        <div style={{fontSize:13,color:'#666',marginTop:3,letterSpacing:1}}>{leagueName}</div>
        <div style={{fontSize:13,color:arc.color,marginTop:14,fontStyle:'italic'}}>{arc.desc}</div>
      </div>

      {/* Dynasty vs Redraft rank cards */}
      {dVal > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {[
            {label:'Dynasty Rank', rank:dRank, color:'#FFD700', barColor:'#FFD700'},
            {label:'Redraft Rank', rank:rRank, color:'#3b82f6', barColor:'#3b82f6'},
          ].map(({label,rank,color,barColor})=>(
            <div key={label} style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:20,textAlign:'center'}}>
              <div style={{fontSize:12,color:'#555',fontWeight:700,letterSpacing:2,marginBottom:8}}>{label.toUpperCase()}</div>
              <div style={{fontSize:44,fontWeight:900,color,lineHeight:1}}>#{rank}</div>
              <div style={{fontSize:13,color:'#444',marginTop:4}}>of {n} teams</div>
              <div style={{marginTop:12,height:6,background:'#1a1a1a',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${Math.max(4,Math.round((1-(rank-1)/(n-1||1))*100))}%`,background:barColor,borderRadius:3}}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* League bar chart */}
      {dVal > 0 && (
        <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
          <div style={{fontSize:14,fontWeight:900,color:'#FFD700',marginBottom:18,textTransform:'uppercase',letterSpacing:1}}>📊 Dynasty Value · Full League</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {ranked.map(t => {
              const isMe = t.owner_id === sleeperUser?.user_id;
              const barW  = Math.max(4, Math.round((t.dVal/maxVal)*100));
              return (
                <div key={t.roster_id}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:isMe?800:500,color:isMe?t.arc.color:'#888',maxWidth:'60%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {isMe?'★ ':''}{t.teamName}
                    </span>
                    <span style={{fontSize:12,color:isMe?t.arc.color:'#555',flexShrink:0}}>{t.arc.emoji} {t.arc.label}</span>
                  </div>
                  <div style={{height:isMe?10:6,background:'#1a1a1a',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${barW}%`,background:isMe?t.arc.color:'#2a2a2a',borderRadius:3}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Archetype glossary */}
      <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
        <div style={{fontSize:14,fontWeight:900,color:'#FFD700',marginBottom:14,textTransform:'uppercase',letterSpacing:1}}>📖 Archetype Guide</div>
        {[classifyTeam(80,80),classifyTeam(20,80),classifyTeam(80,20),classifyTeam(65,65),classifyTeam(55,35),classifyTeam(45,30),classifyTeam(20,20)]
          .filter((v,i,a)=>a.findIndex(x=>x.label===v.label)===i)
          .map(a=>(
            <div key={a.label} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'10px 0',borderBottom:'1px solid #151515'}}>
              <span style={{fontSize:22,width:30,flexShrink:0,textAlign:'center'}}>{a.emoji}</span>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:a.color}}>{a.label}</div>
                <div style={{fontSize:13,color:'#555',marginTop:2}}>{a.desc}</div>
              </div>
            </div>
          ))
        }
      </div>

    </div>
  );
}

// Dev URL access gate: shown when isDevHost() and the visitor isn't Evan.
function DevAuthGate({mode, doAuth, authEmail, setAuthEmail, authPassword, setAuthPassword, authMsg, doLogout, signedInAs}){
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:'#080808',color:'#f0f0f0',fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <div style={{width:'100%',maxWidth:380,background:'#111',border:'1px solid #FFD700',borderRadius:12,padding:28}}>
        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{fontWeight:900,fontSize:22,letterSpacing:3,color:'#FFD700'}}>PFK DEV</div>
          <div style={{fontSize:13,color:'#888',marginTop:6}}>This is a private preview. Only the site owner can access it.</div>
        </div>
        {mode==='signin' && (
          <>
            <input placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} style={{width:'100%',padding:10,marginBottom:10,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff'}}/>
            <input type="password" placeholder="Password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doAuth()} style={{width:'100%',padding:10,marginBottom:14,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff'}}/>
            <button onClick={doAuth} style={{width:'100%',padding:12,background:'#FFD700',color:'#000',border:'none',borderRadius:6,fontWeight:900,cursor:'pointer',letterSpacing:1}}>SIGN IN</button>
            {authMsg&&<div style={{color:'#ef4444',fontSize:14,marginTop:10,textAlign:'center'}}>{authMsg}</div>}
          </>
        )}
        {mode==='denied' && (
          <>
            <div style={{padding:14,background:'#3a1010',border:'1px solid #ef4444',borderRadius:8,color:'#ef4444',fontSize:14,textAlign:'center',marginBottom:14}}>
              Access denied. Signed in as <strong>{signedInAs}</strong>.
            </div>
            <button onClick={doLogout} style={{width:'100%',padding:12,background:'#FFD700',color:'#000',border:'none',borderRadius:6,fontWeight:900,cursor:'pointer',letterSpacing:1}}>SIGN OUT</button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// useSleeperUser — shared hook for the linked Sleeper account.
// Backed by localStorage (key: pfk_sleeper_user). Any component can call
// useSleeperUser() and it stays in sync with every other instance: when one
// component links/unlinks, all the others re-render via the 'pfk:sleeper-changed'
// custom event (same-tab updates) and the native 'storage' event (cross-tab).
// This is what makes the Sleeper link in MasterToolbar instantly reflect in
// Trade Finder (and future Lookup/Dispersal integrations) on the same page.
// ============================================================================
const SLEEPER_STORAGE_KEY = 'pfk_sleeper_user';
const SLEEPER_CHANGE_EVENT = 'pfk:sleeper-changed';
function useSleeperUser(){
  const read = () => {
    try{ return JSON.parse(localStorage.getItem(SLEEPER_STORAGE_KEY) || 'null'); }catch(e){ return null; }
  };
  const [user, setUserState] = useState(read);
  useEffect(() => {
    const refresh = () => setUserState(read());
    window.addEventListener(SLEEPER_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SLEEPER_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  },[]);
  const setUser = (next) => {
    if(next) localStorage.setItem(SLEEPER_STORAGE_KEY, JSON.stringify(next));
    else { localStorage.removeItem(SLEEPER_STORAGE_KEY); localStorage.removeItem('pfk_sleeper_league'); }
    setUserState(next);
    window.dispatchEvent(new Event(SLEEPER_CHANGE_EVENT));
  };
  return [user, setUser];
}

// ============================================================================
// SleeperLink — the "Link Sleeper" button + linked chip used inside MasterToolbar.
// Pulled out so the toolbar's own state stays focused on session/tabs.
// ============================================================================
function SleeperLink(){
  const [user, setUser] = useSleeperUser();
  const [linking, setLinking] = useState(false);
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr('');
    const q = (val||'').trim();
    if(!q){ setErr('Enter your Sleeper username'); return; }
    setBusy(true);
    try{
      const u = await lookupResolveUser(q);
      setUser({ user_id: u.user_id, username: u.username, display_name: u.display_name || u.username, avatar: u.avatar || null });
      setLinking(false);
      setVal('');
    }catch(e){
      setErr(e.message || 'Could not find that Sleeper user');
    }finally{
      setBusy(false);
    }
  };
  if(user){
    const avatar = user.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null;
    return (
      <div data-tooltip="Your linked Sleeper account — click × to unlink"
           style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 6px 3px 3px",background:"#0a0a0a",border:"1px solid #FFD70066",borderRadius:18}}>
        {avatar
          ? <img src={avatar} alt="" style={{width:22,height:22,borderRadius:'50%',objectFit:'cover',background:'#1a1a1a'}} onError={e=>e.currentTarget.style.display='none'}/>
          : <div style={{width:22,height:22,borderRadius:'50%',background:'#1a1a1a',display:'flex',alignItems:'center',justifyContent:'center',color:'#FFD700',fontWeight:900,fontSize:11}}>{(user.username||'?')[0].toUpperCase()}</div>
        }
        <span style={{color:'#FFD700',fontWeight:800,fontSize:11,letterSpacing:0.3,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>@{user.username}</span>
        <button onClick={()=>{ if(confirm('Unlink your Sleeper account?')) setUser(null); }}
                title="Unlink Sleeper"
                style={{background:'transparent',border:'none',color:'#666',fontSize:12,fontWeight:900,cursor:'pointer',padding:'0 4px',lineHeight:1}}>×</button>
      </div>
    );
  }
  if(linking){
    return (
      <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
        <input autoFocus value={val} onChange={e=>{setVal(e.target.value); setErr('');}}
               onKeyDown={e=>e.key==='Enter'&&submit()}
               placeholder="Sleeper username"
               disabled={busy}
               style={{padding:'4px 8px',background:'#0a0a0a',border:'1px solid #FFD70066',borderRadius:6,color:'#fff',fontSize:11,fontFamily:'inherit',width:130}}/>
        <button onClick={submit} disabled={busy}
                style={{padding:'4px 8px',background:'#FFD700',border:'none',borderRadius:6,color:'#000',fontWeight:900,fontSize:10,cursor:busy?'wait':'pointer',letterSpacing:0.5}}>{busy?'…':'GO'}</button>
        <button onClick={()=>{setLinking(false); setVal(''); setErr('');}}
                style={{background:'transparent',border:'none',color:'#888',fontSize:14,cursor:'pointer',padding:'0 4px'}}>×</button>
        {err && <span style={{color:'#ef4444',fontSize:10,marginLeft:4}}>{err}</span>}
      </span>
    );
  }
  return (
    <button onClick={()=>{setLinking(true); setErr('');}}
            data-tooltip="Link your Sleeper account once — Trade Finder, Lookup, and other tools will use it automatically"
            style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",background:"#0a0a0a",border:"1px solid #FFD70055",borderRadius:16,color:"#FFD700",fontWeight:700,fontSize:11,letterSpacing:0.3,cursor:'pointer'}}>
      🔗 Link Sleeper
    </button>
  );
}

// ============================================================================
// MasterToolbar — shared header across every PFK page (App, DispersalApp, LookupApp).
// Above the yellow line: brand + all 5 nav tabs (left) + X + Email Support + Sign in/out (right).
// Used so users can jump between tools from any page without going home first.
//
// Props:
//   currentTab      — only set on the main App; one of 'pfk'|'team'|'polls' to highlight tab
//   onSetTab        — only set on the main App; intercepts in-page tab clicks (no navigation)
//   onSignInClick   — only set on the main App; opens its full auth modal
//                     when not provided, "Sign In" navigates to /?signin=1 instead
// ============================================================================
function MasterToolbar({ currentTab, onSetTab, onSignInClick, userSleeperName }){
  const [session, setSession] = useState(null);
  // Read the linked Sleeper user so the Sleeper Snapshot tab can deep-link to
  // YOUR OWN profile instead of the empty search page when you're linked.
  const [sleeperLinked] = useSleeperUser();
  useEffect(()=>{
    if(!sb) return;
    sb.auth.getSession().then(({data}) => setSession(data?.session || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  },[]);
  const doLogout = async () => { if(sb) await sb.auth.signOut(); };
  const doSignIn = (e) => {
    if(onSignInClick){ e.preventDefault(); onSignInClick(); }
    // else let the link navigate to /?signin=1
  };
  // Sleeper Snapshot tab gets a smart href: linked → land on YOUR snapshot
  // (with the in-page search bar below the yellow line for looking up others);
  // not linked → go to the regular search page.
  const lookupHref = sleeperLinked?.username ? `/lookup/${encodeURIComponent(sleeperLinked.username)}` : '/lookup';
  // Tab definitions — Power Rankings has been moved out of the public nav
  // and into the admin panel; we'll work on it there until it's ready to ship.
  // Each tab: [id, label, descriptionForTooltip, href, isInPageOnMainPage]
  // Order locked by Evan 2026-04-30: Trade Finder → Sleeper Snapshot → Dispersal → Trade Polls → Rookie Ranks
  const tabs = [
    ["trade","⚖️ Trade Finder","Type a rookie pick or player and see every equivalent-value asset grouped by position — find trade ideas in one click","/trade-finder",false],
    ["lookup","🔍 Sleeper Snapshot",sleeperLinked?.username?"Open your own Sleeper Snapshot — search any other username from inside":"Type any Sleeper username and see their account age, dynasty leagues, trade activity, orphan history, and roster strength — vet new leaguemates before letting them in",lookupHref,false],
    ["dispersal","🎲 Dispersal Draft","Pool teams from a Sleeper league, share a link, and draft live with mobile-friendly real-time picks","/dispersal",false],
    ["polls","🗳️ Trade Polls","Create a dynasty trade poll, share the link, and get votes from the community","/?tab=polls",true],
    ["pfk","👑 Rookie Ranks","PFK's official 2026 dynasty rookie rankings — view the staff tier list or build your own","/?tab=pfk",true],
  ];
  const handleTabClick = (e, id, isInPage) => {
    if(isInPage && onSetTab){
      e.preventDefault();
      onSetTab(id);
    }
    // else: let it navigate
  };
  const isActiveTab = (id) => {
    if(id === 'pfk') return currentTab === 'pfk' || currentTab === 'custom';
    return currentTab === id;
  };
  return (
    <div className="pfk-sticky-header" style={{background:"#0a0a0a",borderBottom:"2px solid #FFD700",padding:"12px 20px",position:"sticky",top:0,zIndex:100}}>
      <div style={{maxWidth:1140,margin:"0 auto",display:"flex",flexDirection:"column",gap:10}}>
        {/* Top row: brand on left, account controls on right */}
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <a href="/" style={{display:"flex",alignItems:"center",gap:14,textDecoration:"none"}}>
            <img className="pfk-logo-img" src="https://i.imgur.com/ftHKrQX.png" alt="PFK" style={{width:88,height:88,objectFit:"contain",flexShrink:0}} onError={e=>e.target.style.display="none"}/>
            <div>
              <div className="pfk-header-title" style={{fontSize:26,fontWeight:900,color:"#FFD700",letterSpacing:3,textShadow:"0 0 20px #FFD700"}}>PLAY FOR KEEPS</div>
              <div className="pfk-header-subtitle" style={{fontSize:12,color:"#8B6914",letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Dynasty Fantasy Football Tools</div>
            </div>
          </a>
          <div style={{flex:1}}/>
          <a href="https://x.com/PlayForKeepsFF" target="_blank" rel="noopener noreferrer"
             aria-label="Follow @PlayForKeepsFF on X" data-tooltip="Follow @PlayforkeepsFF on X"
             style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 9px",background:"#0a0a0a",border:"1px solid #FFD70055",borderRadius:16,color:"#FFD700",textDecoration:"none",fontWeight:800,fontSize:11,letterSpacing:0.3,transition:"all .15s"}}
             onMouseEnter={e=>{e.currentTarget.style.background='#FFD700';e.currentTarget.style.color='#000';e.currentTarget.querySelector('svg').setAttribute('fill','#000');}}
             onMouseLeave={e=>{e.currentTarget.style.background='#0a0a0a';e.currentTarget.style.color='#FFD700';e.currentTarget.querySelector('svg').setAttribute('fill','#FFD700');}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFD700" aria-hidden="true"><path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.36-6.72L4.5 22H1.244l8.04-9.187L1 2h7.016l4.844 6.12L18.244 2zm-1.2 18h1.9L7.048 4H5.05l12 16z"/></svg>
            <span>@PlayforkeepsFF</span>
          </a>
          <a href="mailto:ej@playforkeepsdynasty.com?subject=PFK%20Support"
             aria-label="Email PFK support with feedback or bug reports"
             data-tooltip="Email PFK support with feedback, bug reports, or partnership inquiries"
             style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",background:"#0a0a0a",border:"1px solid #FFD70055",borderRadius:16,color:"#FFD700",textDecoration:"none",fontWeight:700,fontSize:11,letterSpacing:0.3}}>
            📧 Email Support
          </a>
          <SleeperLink/>
          {session ? (
            <button onClick={doLogout} style={{padding:"4px 10px",background:"transparent",border:"1px solid #555",borderRadius:6,color:"#888",cursor:"pointer",fontSize:11,fontWeight:700,letterSpacing:0.3}}>Sign Out</button>
          ) : (
            <a href="/?signin=1" onClick={doSignIn} style={{padding:"6px 14px",background:"#FFD700",border:"none",borderRadius:6,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12,letterSpacing:1,textDecoration:"none"}}>SIGN IN</a>
          )}
        </div>
        {/* Bottom row: nav tabs LEFT-aligned, just above the yellow border line */}
        <div className="pfk-top-tabs" style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-start"}}>
          {tabs.map(([id,label,desc,href,isInPage])=>{
            const active = isActiveTab(id);
            return (
              <a key={id} href={href} onClick={e=>handleTabClick(e,id,isInPage)} aria-label={desc} data-tooltip={desc}
                 style={{padding:"5px 10px",borderRadius:6,border:active?"1.5px solid #FFD700":"1.5px solid #1e1e1e",background:active?"#FFD700":"transparent",color:active?"#000":"#aaa",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:0.6,textDecoration:"none",display:"inline-flex",alignItems:"center",lineHeight:1.4,transition:"all .15s"}}>{label}</a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function App(){
  const [tab,setTab]=useState(()=>{
    // Read ?tab=xxx from URL on mount so cross-page nav lands on the right tab
    if(typeof window === 'undefined') return 'pfk';
    const p = new URLSearchParams(window.location.search).get('tab');
    return (p && ['pfk','custom','team','polls'].includes(p)) ? p : 'pfk';
  });
  // Dev-only: count of completed dispersal drafts (live query on mount).
  // Hidden on production (gated by the existing global isDevHost() helper).
  // Cheap query — moves slowly.
  const [completedDispersalCount,setCompletedDispersalCount] = useState(null);
  useEffect(()=>{
    if(!isDevHost() || !sb) return;
    let cancelled = false;
    (async () => {
      try{
        const { count } = await sb.from('dispersal_drafts').select('*', { count: 'exact', head: true }).eq('status', 'complete');
        if(!cancelled && typeof count === 'number') setCompletedDispersalCount(count);
      }catch(e){}
    })();
    return ()=>{ cancelled = true; };
  },[]);
  const [savedLists,setSavedLists]=useState(()=>{
    const saved=loadStorage('pfk_saved_lists',null);
    if(saved&&saved.length) return saved;
    const old=loadStorage('pfk_list',null);
    return [{id:'list_1',name:'My Rankings',items:old||buildInitialList()}];
  });
  const [activeListId,setActiveListId]=useState(()=>{
    const saved=loadStorage('pfk_saved_lists',null);
    if(saved&&saved.length) return loadStorage('pfk_active_list_id',saved[0].id);
    return 'list_1';
  });
  const [history,setHistory]=useState([]);
  const [editingPlayer,setEditingPlayer]=useState(null);
  const [playerDraft,setPlayerDraft]=useState({});
  const [showAdd,setShowAdd]=useState(false);
  const [newPlayer,setNewPlayer]=useState({name:"",pos:"WR",college:""});
  const [renamingTier,setRenamingTier]=useState(null);
  const [tierNameDraft,setTierNameDraft]=useState("");
  const [renamingListId,setRenamingListId]=useState(null);
  const [listNameDraft,setListNameDraft]=useState("");
  const [showAddTier,setShowAddTier]=useState(false);
  const [newTierName,setNewTierName]=useState("");
  const [posFilter,setPosFilter]=useState(()=>new Set(["WR","RB","TE","QB"]));
  const togglePos=(p)=>setPosFilter(prev=>{const n=new Set(prev);n.has(p)?n.delete(p):n.add(p);return n.size?n:new Set(["WR","RB","TE","QB"]);});
  const [teamRoster,setTeamRoster]=useState(()=>loadStorage("pfk_roster",[]));
  const [picks,setPicks]=useState(()=>loadStorage("pfk_picks",[]));
  const [newTeamPlayer,setNewTeamPlayer]=useState({name:"",pos:"WR",age:""});
  const [saved,setSaved]=useState(false);
  const [officialUpdated,setOfficialUpdated]=useState(null);
  const [officialList,setOfficialList]=useState(null);
  const [pfkSettings,setPfkSettings]=useState(DEFAULT_SETTINGS);
  const [pfkMissing,setPfkMissing]=useState(false);
  const [prospects,setProspects]=useState({});
  const [modelByName,setModelByName]=useState({});
  const [masterList,setMasterList]=useState(null);

  useEffect(()=>{
    fetch('js/prospects-2026.json').then(r=>r.json()).then(arr=>{
      const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
      const m={}; arr.forEach(p=>{m[norm(p.name)]=p;}); setProspects(m);
    }).catch(()=>{});
  },[]);

  // Load PFK rookie model data once and index by normalized name for fast lookup.
  useEffect(()=>{
    fetchModelData().then(row=>{
      if(!row?.data || !Array.isArray(row.data)) return;
      const m={};
      row.data.forEach(it=>{ if(it?.name) m[normDraftName(it.name)] = it; });
      setModelByName(m);
    }).catch(()=>{});
  },[]);
  // Keep masterList in sync. On default combo it mirrors officialList (no extra fetch).
  // On non-default combo, fetch the master separately so RS lookups have a stable reference.
  useEffect(()=>{
    if(sameSettings(pfkSettings, DEFAULT_SETTINGS)){
      setMasterList(null); // unused; effectiveMaster falls back to officialList
      return;
    }
    fetchMasterListForDerivation().then(m => setMasterList(m));
  },[pfkSettings]);
  const [session,setSession]=useState(null);
  const [userRow,setUserRow]=useState(null);
  const [authOpen,setAuthOpen]=useState(false);
  const [authMode,setAuthMode]=useState('signin');
  const [authEmail,setAuthEmail]=useState('');
  const [authPassword,setAuthPassword]=useState('');
  const [authSleeper,setAuthSleeper]=useState('');
  const [authMsg,setAuthMsg]=useState('');
  // Dev-only edit mode for the PFK Rookies tab. Becomes available when Evan signs in on dev URL.
  const [editMode,setEditMode]=useState(false);
  const [draftMsg,setDraftMsg]=useState('');
  const isEvanOnDev = isDevHost() && session?.user?.email === EVAN_EMAIL;

  useEffect(()=>{
    if(!sb) return;
    sb.auth.getSession().then(({data})=>setSession(data.session));
    const { data:sub } = sb.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>sub?.subscription?.unsubscribe?.();
  },[]);

  // Open sign-in modal automatically when arriving from /?signin=1 (sent by
  // MasterToolbar Sign In links on Dispersal/Lookup pages).
  useEffect(()=>{
    if(typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if(p.get('signin') === '1'){
      setAuthMode('signin');
      setAuthOpen(true);
    }
  },[]);

  useEffect(()=>{
    if(!session||!sb){ setUserRow(null); return; }
    (async()=>{
      const { data } = await sb.from('users').select('*').eq('id',session.user.id).maybeSingle();
      if(data){ setUserRow(data); return; }
      const { data:inserted } = await sb.from('users').insert({id:session.user.id,email:session.user.email}).select().maybeSingle();
      if(inserted) setUserRow(inserted);
    })();
  },[session]);

  const doAuth=async()=>{
    setAuthMsg('');
    if(!sb){ setAuthMsg('Backend not loaded'); return; }
    if(authMode==='signup'){
      const { data, error } = await sb.auth.signUp({email:authEmail,password:authPassword});
      if(error){ setAuthMsg(error.message); return; }
      const uid = data.user?.id;
      if(uid){
        await sb.from('users').upsert({ id:uid, email:authEmail, sleeper_username:authSleeper||null });
      }
      setAuthMsg('Account created! Check your email to verify, then log in.');
      setAuthMode('signin');
    }else{
      const { error } = await sb.auth.signInWithPassword({email:authEmail,password:authPassword});
      if(error){ setAuthMsg(error.message); return; }
      setAuthOpen(false);
      setAuthEmail(''); setAuthPassword(''); setAuthSleeper('');
    }
  };

  const doLogout=async()=>{ if(sb) await sb.auth.signOut(); };

  useEffect(()=>{
    // Fetch order:
    //   DEV URL:  dev draft for combo → published for combo → DERIVED FROM MASTER (if non-default)
    //   PROD URL: published for combo →                       DERIVED FROM MASTER (if non-default)
    // Default combo never derives (it IS the master).
    (async () => {
      const isDefault = sameSettings(pfkSettings, DEFAULT_SETTINGS);
      let row = null;
      if(isDevHost()) row = await fetchDevDraftRankings(pfkSettings);
      if(!row) row = await fetchOfficialRankings(pfkSettings);
      if(!row && !isDefault){
        const master = await fetchMasterListForDerivation();
        if(master){
          const derived = deriveListForCombo(master, pfkSettings);
          if(derived) row = { data: derived, settings: pfkSettings, updated_at: null, _isDerived: true };
        }
      }
      if(!row?.data||!Array.isArray(row.data)){
        setPfkMissing(true); setOfficialList(null); setOfficialUpdated(null); return;
      }
      setPfkMissing(!sameSettings(row.settings,pfkSettings) && !row._isDerived);
      setOfficialUpdated(row.updated_at);
      setOfficialList(row.data);
      const hadSaved=loadStorage('pfk_saved_lists',null);
      if(!hadSaved){
        // Seed three pre-made custom lists on first ever visit. Each starts as a copy
        // of PFK Official rankings — user can drag freely to customize each one.
        setSavedLists([
          {id:'list_1',name:'Custom1',items:row.data},
          {id:'list_2',name:'Custom2',items:row.data},
          {id:'list_3',name:'Custom3',items:row.data},
        ]);
      }
    })();
  },[pfkSettings,modelByName]);

  const list=useMemo(()=>savedLists.find(l=>l.id===activeListId)?.items||buildInitialList(),[savedLists,activeListId]);
  // Dirty tracking for the custom rankings tab. Any setList call from a user action
  // marks dirty; applying a sort or clicking Save clears it.
  const [isDirty,setIsDirty]=useState(false);
  // Last-applied "starting point" sort. Default is PFK Official, matching what the
  // initial list state actually reflects (lists seed from row.data = published rankings).
  const [sortBy,setSortBy]=useState('pfk');
  const setList=useCallback(updater=>{
    setSavedLists(prev=>prev.map(l=>l.id===activeListId?{...l,items:typeof updater==='function'?updater(l.items):updater}:l));
    setIsDirty(true);
  },[activeListId]);
  // Compute a sorted version of the user's current list. Used as a one-time
  // "starting point" — applied by applySort, then the user is free to drag freely.
  const computeSortedList=useCallback((sortKey)=>{
    if(!list) return list;
    const players=list.filter(it=>it?.type==='player');
    if(!players.length) return list;
    const officialIdx=new Map();
    if(officialList){
      let idx=0;
      for(const it of officialList){ if(it?.type==='player'){ officialIdx.set(normDraftName(it.name),idx++); } }
    }
    const officialRank=(it)=>officialIdx.get(normDraftName(it.name)) ?? Number.POSITIVE_INFINITY;
    if(sortKey==='pfk'){
      if(!officialList) return list;
      const userByKey=new Map();
      for(const p of players){ userByKey.set(normDraftName(p.name), p); }
      const out=[]; const seenKeys=new Set();
      for(const it of officialList){
        if(it?.type==='tier'){ out.push(it); continue; }
        if(it?.type==='player'){
          const k=normDraftName(it.name);
          if(userByKey.has(k)){ out.push(userByKey.get(k)); seenKeys.add(k); }
        }
      }
      const cleaned=[];
      for(let i=0;i<out.length;i++){
        const it=out[i];
        if(it?.type==='tier'){
          let hasPlayer=false;
          for(let j=i+1;j<out.length;j++){
            if(out[j]?.type==='tier') break;
            if(out[j]?.type==='player'){ hasPlayer=true; break; }
          }
          if(hasPlayer) cleaned.push(it);
        } else cleaned.push(it);
      }
      const extras=players.filter(p=>!seenKeys.has(normDraftName(p.name)));
      if(extras.length){
        cleaned.push({type:'tier',id:'tier_custom_extras_'+Date.now(),name:'Other'});
        for(const p of extras) cleaned.push(p);
      }
      return cleaned;
    }
    const draftAbs=(it)=>{
      const d=DRAFT_2026[normDraftName(it.name)];
      if(!d || !d.pick || d.pick==='UDFA') return Number.POSITIVE_INFINITY;
      const abs=pickToAbs(d.pick);
      return abs==null ? Number.POSITIVE_INFINITY : abs;
    };
    const modelPfk=(it)=>{
      const m=modelByName?.[normDraftName(it.name)];
      if(!m) return Number.NEGATIVE_INFINITY;
      const pos=m.pos || it.pos;
      const dc=m.dcOverride!=null ? +m.dcOverride : dcScoreFromPick(pos, m.pick);
      const film=filmAvgPct(m.filmScores);
      const base=pfkScore(m.stats, dc, film);
      const baseline=base * landingMultiplier(m.landing);
      return baseline * comboMultiplier(pos, pfkSettings);
    };
    return players.slice().sort((a,b)=>{
      if(sortKey==='draftcapital'){
        const da=draftAbs(a), db=draftAbs(b);
        if(da!==db) return da-db;
        return officialRank(a)-officialRank(b);
      }
      const ma=modelPfk(a), mb=modelPfk(b);
      if(mb!==ma) return mb-ma;
      return officialRank(a)-officialRank(b);
    });
  },[list,officialList,modelByName,pfkSettings]);
  // Apply a sort once as a starting point, then user drags freely from there.
  const applySort=(sortKey)=>{
    if(!sortKey) return;
    if(isDirty){
      if(!confirm('You have unsaved changes. Applying this sort will overwrite your current order. Continue?')) return;
    }
    const sorted=computeSortedList(sortKey);
    if(!sorted) return;
    setSavedLists(prev=>prev.map(l=>l.id===activeListId?{...l,items:sorted}:l));
    setSortBy(sortKey);
    setIsDirty(false);
    flash();
  };
  // Save = clear dirty + flash success. The list is already auto-persisted to
  // localStorage and Supabase on every change; this is a UX checkpoint.
  const saveList=()=>{ setIsDirty(false); flash(); };

  useEffect(()=>{ localStorage.setItem("pfk_saved_lists",JSON.stringify(savedLists)); },[savedLists]);

  // One-time migration: replace any pre-existing local OR cloud lists with three
  // fresh Custom1/2/3. Gated by a localStorage flag so it only runs once per browser.
  // Triggers when officialList is loaded so the seed reflects current PFK rankings.
  // Each list gets a DEEP-CLONED copy of officialList so they're fully independent.
  useEffect(()=>{
    if(!officialList) return;
    if(localStorage.getItem('pfk_lists_seeded_v6')) return;
    const seedFresh=()=>{
      const clone=()=>JSON.parse(JSON.stringify(officialList));
      setSavedLists([
        {id:'list_1',name:'Custom1',items:clone()},
        {id:'list_2',name:'Custom2',items:clone()},
        {id:'list_3',name:'Custom3',items:clone()},
      ]);
      setActiveListId('list_1');
      setIsDirty(false);
      localStorage.removeItem('pfk_lists_seeded_v3'); // clear any prior flag
      localStorage.setItem('pfk_lists_seeded_v6','1');
    };
    if(session && sb){
      sb.from('user_rankings').delete().eq('user_id',session.user.id).then(seedFresh);
    } else {
      seedFresh();
    }
  },[officialList,session]);

  useEffect(()=>{
    if(!session||!sb) return;
    if(!localStorage.getItem('pfk_lists_seeded_v6')) return; // wait for migration
    // Order by id so the lists appear in the order they were inserted (Custom1, Custom2,
    // Custom3...) instead of arbitrary Supabase row order. The schema has no created_at
    // column — id is auto-increment so it preserves insertion order.
    sb.from('user_rankings').select('*').eq('user_id',session.user.id).order('id',{ascending:true}).then(({data})=>{
      if(data&&data.length){
        setSavedLists(data.map(r=>({id:'cloud_'+r.id,cloudId:r.id,name:r.name,items:r.items})));
        setActiveListId('cloud_'+data[0].id);
        setIsDirty(false);
      }
    });
  },[session]);

  useEffect(()=>{
    if(!session||!sb) return;
    const t=setTimeout(()=>{
      savedLists.forEach(l=>{
        if(l.cloudId){
          sb.from('user_rankings').update({name:l.name,items:l.items,updated_at:new Date().toISOString()}).eq('id',l.cloudId);
        }else{
          sb.from('user_rankings').insert({user_id:session.user.id,name:l.name,items:l.items}).select().single().then(({data})=>{
            if(data){
              setSavedLists(prev=>prev.map(x=>x.id===l.id?{...x,id:'cloud_'+data.id,cloudId:data.id}:x));
              // Keep activeListId in sync — otherwise the list lookup goes stale and renders an empty fallback.
              setActiveListId(prev=>prev===l.id?'cloud_'+data.id:prev);
            }
          });
        }
      });
    },1000);
    return ()=>clearTimeout(t);
  },[savedLists,session]);
  useEffect(()=>{ localStorage.setItem("pfk_active_list_id",activeListId); },[activeListId]);
  // Safety net: if activeListId points at a list that doesn't exist (e.g. after migration
  // replaces savedLists or after cloud-save changes a list's id), fall back to the first list.
  // Without this, list useMemo returns the empty buildInitialList() fallback and the page
  // renders blank until the user clicks a tab.
  useEffect(()=>{
    if(!savedLists.length) return;
    if(!savedLists.find(l=>l.id===activeListId)){
      setActiveListId(savedLists[0].id);
    }
  },[savedLists,activeListId]);
  useEffect(()=>{ localStorage.setItem("pfk_roster",JSON.stringify(teamRoster)); },[teamRoster]);
  useEffect(()=>{ localStorage.setItem("pfk_picks",JSON.stringify(picks)); },[picks]);

  const flash=()=>{ setSaved(true); setTimeout(()=>setSaved(false),1500); };

  const switchList=id=>{setActiveListId(id);setHistory([]);setIsDirty(false);};
  const createList=()=>{
    const id='list_'+Date.now();
    const n=savedLists.length+1;
    setSavedLists(prev=>[...prev,{id,name:`Custom${n}`,items:officialList||buildInitialList()}]);
    setActiveListId(id);
    setHistory([]);
  };
  const deleteList=id=>{
    if(savedLists.length<=1) return;
    setSavedLists(prev=>{
      const next=prev.filter(l=>l.id!==id);
      if(id===activeListId) setActiveListId(next[0].id);
      return next;
    });
    setHistory([]);
  };
  const renameList=(id,name)=>{
    if(!name.trim()) return;
    setSavedLists(prev=>prev.map(l=>l.id===id?{...l,name:name.trim()}:l));
  };

  const push=l=>setHistory(h=>[...h.slice(-39),l]);
  const reorder=(fromId,beforeId)=>{push(list);setList(prev=>{const l=[...prev],fi=l.findIndex(x=>x.id===fromId);const[item]=l.splice(fi,1);if(beforeId===null){l.push(item);}else{const ti=l.findIndex(x=>x.id===beforeId);l.splice(ti!==-1?ti:l.length,0,item);}return l;});};
  const moveItem=(id,dir)=>{push(list);setList(prev=>{const l=[...prev],i=l.findIndex(x=>x.id===id),sw=i+dir;if(sw<0||sw>=l.length)return l;[l[i],l[sw]]=[l[sw],l[i]];return l;});};
  const undo=()=>{if(!history.length)return;setList(history[history.length-1]);setHistory(h=>h.slice(0,-1));};

  // ----- Edit Mode handlers for the OFFICIAL rankings (dev-only Edit Mode on PFK Rookies tab) -----
  // These mutate officialList directly so dev-page edits write to the dev draft Supabase row on Save.
  const officialOps = {
    onReorder: (fromId,beforeId) => setOfficialList(prev => {
      const l=[...(prev||[])]; const fi=l.findIndex(x=>x.id===fromId);
      if(fi<0) return prev; const [item]=l.splice(fi,1);
      if(beforeId===null) l.push(item);
      else { const ti=l.findIndex(x=>x.id===beforeId); l.splice(ti!==-1?ti:l.length,0,item); }
      return l;
    }),
    onMove: (id,dir) => setOfficialList(prev => {
      const l=[...(prev||[])]; const i=l.findIndex(x=>x.id===id); const sw=i+dir;
      if(sw<0||sw>=l.length) return l; [l[i],l[sw]]=[l[sw],l[i]]; return l;
    }),
    onEdit: (p) => { setEditingPlayer(p.id); setPlayerDraft({...p}); },
    onRemove: (id) => setOfficialList(prev => (prev||[]).filter(x=>x.id!==id)),
    onSavePlayer: () => {
      setOfficialList(prev => (prev||[]).map(x => x.id===editingPlayer ? {...x,...playerDraft} : x));
      setEditingPlayer(null);
    },
    setRankingScoreOverride: (id, val) => setOfficialList(prev => (prev||[]).map(x => {
      if(x.id !== id) return x;
      if(val === '' || val == null) { const {rankingScoreOverride, ...rest} = x; return rest; }
      return { ...x, rankingScoreOverride: Math.round(+val * 100) / 100 };
    })),
    onCancelEdit: () => setEditingPlayer(null),
    onRenameStart: (id,name) => { setRenamingTier(id); setTierNameDraft(name); },
    onRenameCancel: () => setRenamingTier(null),
    onRenameSave: () => {
      setOfficialList(prev => (prev||[]).map(x => x.id===renamingTier ? {...x, name:tierNameDraft} : x));
      setRenamingTier(null);
    },
    onDeleteTier: (id) => {
      if(!confirm('Delete this tier?')) return;
      setOfficialList(prev => (prev||[]).filter(x=>x.id!==id));
    },
  };
  const officialAddTier = () => {
    const name = prompt('Tier name:'); if(!name) return;
    setOfficialList(prev => [...(prev||[]), {id:'tier_'+Date.now(), type:'tier', name}]);
  };
  const saveDraft = async () => {
    if(!officialList?.length){ setDraftMsg('Nothing to save.'); setTimeout(()=>setDraftMsg(''),2000); return; }
    setDraftMsg('Saving...');
    const { error } = await saveDevDraftRankings(officialList, pfkSettings);
    if(error){ setDraftMsg('Save error: '+(error.message||error)); }
    else { setDraftMsg('Draft saved ✓ (dev URL only)'); setTimeout(()=>setDraftMsg(''),3000); }
  };
  // 🌱 Seed from Model — manually pulls the model's auto-tier output into officialList.
  // Only fires when Evan clicks it. Replaces whatever's currently shown. He can edit and SAVE DRAFT after.
  const seedOfficialFromModel = () => {
    if(!Object.keys(modelByName).length){ setDraftMsg('Model not loaded yet.'); setTimeout(()=>setDraftMsg(''),2500); return; }
    const seeded = buildSeedFromModel(modelByName, pfkSettings, officialList);
    if(!seeded?.length){ setDraftMsg('Could not build from model.'); setTimeout(()=>setDraftMsg(''),2500); return; }
    if(!confirm(`Replace current dev rankings with the model's auto-tier output (${seeded.filter(x=>x.type==='player').length} players)? Click 💾 SAVE DRAFT after to persist.`)) return;
    setOfficialList(seeded);
    setDraftMsg('Seeded from model — edit and SAVE DRAFT to persist.');
    setTimeout(()=>setDraftMsg(''),4000);
  };
  // 🔄 Derive from Master — only meaningful on non-default combos. Pulls the master combo's
  // current state, applies position multipliers for THIS combo, re-buckets into tiers. Replaces
  // the current officialList. Use it after editing master, or to reset a combo override back to
  // the derived view. Click 💾 SAVE DRAFT to persist as combo-specific override; otherwise just
  // click EXIT and the next reload will re-derive.
  const deriveFromMaster = async () => {
    const master = await fetchMasterListForDerivation();
    if(!master?.length){ setDraftMsg('Master list not found.'); setTimeout(()=>setDraftMsg(''),3000); return; }
    const derived = deriveListForCombo(master, pfkSettings);
    if(!derived?.length){ setDraftMsg('Could not derive.'); setTimeout(()=>setDraftMsg(''),3000); return; }
    if(!confirm(`Rebuild this combo's rankings by deriving from your master list (${derived.filter(x=>x.type==='player').length} players, position multipliers applied for ${pfkSettings.format}/${pfkSettings.tep}TEP/${pfkSettings.passTd}PTD)? Existing edits to this combo will be replaced.`)) return;
    setOfficialList(derived);
    setDraftMsg('Derived from master — edit and 💾 SAVE DRAFT to persist as combo override, or just exit and the page will re-derive next load.');
    setTimeout(()=>setDraftMsg(''),5500);
  };
  const publishToProd = async () => {
    if(!officialList?.length){ setDraftMsg('Nothing to publish.'); setTimeout(()=>setDraftMsg(''),2000); return; }
    if(!confirm('Publish current rankings to PRODUCTION? This pushes the live public site (playforkeepsdynasty.com) to match what you see on dev.')) return;
    setDraftMsg('Publishing to prod...');
    const { error } = await publishToProdRankings(officialList, pfkSettings);
    if(error){ setDraftMsg('Publish error: '+(error.message||error)); }
    else { setDraftMsg('🚀 Published to prod ✓'); setTimeout(()=>setDraftMsg(''),3500); }
  };
  const deleteTier=id=>{push(list);setList(prev=>prev.filter(x=>x.id!==id));};
  const saveRename=()=>{if(!renamingTier)return;const name=tierNameDraft.trim()||renamingTier;push(list);setList(prev=>prev.map(x=>x.type==="tier"&&x.id===renamingTier?{...x,name}:x));setRenamingTier(null);};
  const addTier=()=>{if(!newTierName.trim())return;const id="t_"+newTierName+"_"+Date.now();push(list);setList(prev=>[{type:"tier",id,name:newTierName.trim()},...prev]);setNewTierName("");setShowAddTier(false);};
  const savePlayer=()=>{push(list);setList(prev=>prev.map(x=>x.type==="player"&&x.id===editingPlayer?{...x,...playerDraft,id:x.id,type:"player"}:x));setEditingPlayer(null);flash();};
  const removePlayer=id=>{push(list);setList(prev=>prev.filter(x=>x.id!==id));};
  const addNew=()=>{if(!newPlayer.name)return;push(list);const id="p_"+Date.now();setList(prev=>[...prev,{type:"player",id,...newPlayer}]);setNewPlayer({name:"",pos:"WR",college:""});setShowAdd(false);};

  const inp=ex=>({padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:14,...ex});
  const avgAge=teamRoster.length?(teamRoster.reduce((s,p)=>s+Number(p.age||25),0)/teamRoster.length).toFixed(1):"—";
  const grade=(()=>{let s=Math.min(picks.length*5,20)+(Number(avgAge)<=24?15:Number(avgAge)<=26?8:0);if(s>=30)return{g:"A",l:"Championship Window",c:"#FFD700"};if(s>=20)return{g:"B+",l:"Contender",c:"#FFC107"};return{g:"B",l:"Building",c:"#e0a800"};})();

  const FilterBar=()=>(
    <div className="pfk-filter-bar" style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{color:"#666",fontSize:14,fontWeight:700}}>POS:</span>
      {["WR","RB","TE","QB"].map(p=>{
        const on=posFilter.has(p);
        return <button key={p} onClick={()=>togglePos(p)} style={{padding:"5px 11px",borderRadius:20,fontSize:13,fontWeight:700,cursor:"pointer",border:on?"2px solid "+POS_COLORS[p]:"2px solid #2a2a2a",background:on?POS_COLORS[p]+"22":"transparent",color:on?POS_COLORS[p]:"#555",transition:"all .15s"}}>{p}</button>;
      })}
      {posFilter.size<4&&<button onClick={()=>setPosFilter(new Set(["WR","RB","TE","QB"]))} style={{padding:"5px 10px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",border:"2px solid #333",background:"transparent",color:"#555"}}>ALL</button>}
    </div>
  );

  // For RS calculation: when on default combo, master === officialList. When on derived combo,
  // use the separately-fetched masterList so RS stays constant per player regardless of combo.
  const effectiveMasterList = sameSettings(pfkSettings, DEFAULT_SETTINGS) ? officialList : masterList;
  const commonProps={onReorder:reorder,onMove:moveItem,onEdit:r=>{setEditingPlayer(r.id);setPlayerDraft({...r});},onRemove:removePlayer,onRenameStart:(id,name)=>{setRenamingTier(id);setTierNameDraft(name);},onRenameCancel:()=>setRenamingTier(null),onRenameSave:saveRename,onDeleteTier:deleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer:savePlayer,onCancelEdit:()=>setEditingPlayer(null),posFilter,modelByName,pfkSettings,masterListForRS:effectiveMasterList};

  // Dev URL gate: only Evan can access dev preview. Anyone else sees a login or access denied screen.
  if(isDevHost()){
    if(!session) return <DevAuthGate doAuth={doAuth} authEmail={authEmail} setAuthEmail={setAuthEmail} authPassword={authPassword} setAuthPassword={setAuthPassword} authMsg={authMsg} mode="signin"/>;
    if(session?.user?.email !== EVAN_EMAIL) return <DevAuthGate doLogout={doLogout} signedInAs={session.user.email} mode="denied"/>;
  }

  return(
    <div style={{background:"#080808",minHeight:"100vh",color:"#f0f0f0",fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      {authOpen&&(
        <div onClick={()=>setAuthOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,background:"#111",border:"1px solid #FFD700",borderRadius:12,padding:24}}>
            <div style={{display:"flex",gap:4,marginBottom:18,background:"#0a0a0a",borderRadius:8,padding:4}}>
              <button onClick={()=>setAuthMode('signin')} style={{flex:1,padding:"8px",background:authMode==='signin'?"#FFD700":"transparent",color:authMode==='signin'?"#000":"#888",border:"none",borderRadius:6,fontWeight:900,cursor:"pointer",fontSize:14,letterSpacing:1}}>SIGN IN</button>
              <button onClick={()=>setAuthMode('signup')} style={{flex:1,padding:"8px",background:authMode==='signup'?"#FFD700":"transparent",color:authMode==='signup'?"#000":"#888",border:"none",borderRadius:6,fontWeight:900,cursor:"pointer",fontSize:14,letterSpacing:1}}>SIGN UP</button>
            </div>
            <input placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} style={{width:"100%",padding:10,marginBottom:10,background:"#000",border:"1px solid #333",borderRadius:6,color:"#fff",fontSize:13}}/>
            <input type="password" placeholder="Password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doAuth()} style={{width:"100%",padding:10,marginBottom:10,background:"#000",border:"1px solid #333",borderRadius:6,color:"#fff",fontSize:13}}/>
            {authMode==='signup'&&<input placeholder="Sleeper username (optional)" value={authSleeper} onChange={e=>setAuthSleeper(e.target.value)} style={{width:"100%",padding:10,marginBottom:10,background:"#000",border:"1px solid #333",borderRadius:6,color:"#fff",fontSize:13}}/>}
            <button onClick={doAuth} style={{width:"100%",padding:12,background:"#FFD700",color:"#000",border:"none",borderRadius:6,fontWeight:900,cursor:"pointer",letterSpacing:1,fontSize:14}}>{authMode==='signup'?'CREATE ACCOUNT':'SIGN IN'}</button>
            {authMsg&&<div style={{color:authMsg.includes('created')?"#10b981":"#ef4444",fontSize:13,marginTop:10,textAlign:"center"}}>{authMsg}</div>}
            <div style={{textAlign:"center",marginTop:14}}><button onClick={()=>setAuthOpen(false)} style={{background:"none",border:"none",color:"#666",fontSize:13,cursor:"pointer"}}>Close</button></div>
          </div>
        </div>
      )}
      <MasterToolbar currentTab={tab} onSetTab={setTab} onSignInClick={()=>{setAuthMode('signin');setAuthOpen(true);}} userSleeperName={userRow?.sleeper_username}/>
      {saved && <div style={{position:'fixed',top:14,right:14,zIndex:200,padding:"6px 14px",background:"#0a2a1a",border:"1px solid #10b981",borderRadius:20,fontSize:13,color:"#10b981",fontWeight:700,boxShadow:"0 4px 12px rgba(0,0,0,0.5)"}}>✓ Saved</div>}
      <div className="pfk-content" style={{maxWidth:1140,margin:"0 auto",padding:"20px 14px"}}>
        {/* Dispersal hero CTA — only on Rookie Ranks (the landing tab).
            Other tabs reach Dispersal via the master toolbar nav above the yellow line. */}
        {(tab==="pfk"||tab==="custom") && (
          <a href="/dispersal" style={{display:"block",textDecoration:"none",marginBottom:18,background:"linear-gradient(135deg,#1a1400 0%,#0f0f0f 100%)",border:"2px solid #FFD700",borderRadius:14,padding:"18px 22px",boxShadow:"0 0 24px #FFD70022",transition:"all .15s"}}
             onMouseEnter={e=>{e.currentTarget.style.background="linear-gradient(135deg,#251c00 0%,#1a1a1a 100%)";e.currentTarget.style.boxShadow="0 0 32px #FFD70044";}}
             onMouseLeave={e=>{e.currentTarget.style.background="linear-gradient(135deg,#1a1400 0%,#0f0f0f 100%)";e.currentTarget.style.boxShadow="0 0 24px #FFD70022";}}>
            <div style={{display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
              <div style={{fontSize:38,flexShrink:0}}>🎲</div>
              <div style={{flex:1,minWidth:240}}>
                <div style={{fontSize:18,fontWeight:900,color:"#FFD700",letterSpacing:1.5,marginBottom:3}}>PFK DISPERSAL DRAFT</div>
                <div style={{fontSize:13,color:"#bbb",lineHeight:1.5}}>Real-time picks, mobile-friendly, auto-pulls rosters from your Sleeper league.</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <div style={{padding:"10px 18px",background:"#FFD700",borderRadius:8,color:"#000",fontWeight:900,fontSize:13,letterSpacing:1.5,whiteSpace:"nowrap"}}>OPEN TOOL →</div>
                {/* Dev-only: completed-drafts counter — live query, hidden on prod */}
                {isDevHost() && completedDispersalCount !== null && (
                  <div style={{fontSize:11,color:"#FFD700",fontWeight:800,letterSpacing:0.5,whiteSpace:"nowrap"}}>{completedDispersalCount.toLocaleString()} completed drafts</div>
                )}
              </div>
            </div>
          </a>
        )}

        {(tab==="pfk"||tab==="custom") && (
          <div style={{display:"inline-flex",gap:4,padding:4,background:"#0a0a0a",border:"1px solid #1e1e1e",borderRadius:8,marginBottom:14}}>
            <button onClick={()=>setTab("pfk")} style={{padding:"6px 14px",borderRadius:5,border:"none",background:tab==="pfk"?"#FFD700":"transparent",color:tab==="pfk"?"#000":"#888",fontWeight:800,fontSize:12,cursor:"pointer",letterSpacing:0.5}}>👑 View Official</button>
            <button onClick={()=>setTab("custom")} style={{padding:"6px 14px",borderRadius:5,border:"none",background:tab==="custom"?"#FFD700":"transparent",color:tab==="custom"?"#000":"#888",fontWeight:800,fontSize:12,cursor:"pointer",letterSpacing:0.5}}>✏️ Customize My Own</button>
          </div>
        )}
        {tab==="pfk"&&(
          <div>
            <div style={{background:"#0f0f0f",border:"1px solid #FFD700",borderRadius:12,padding:"14px 20px",marginBottom:18,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:240}}><div style={{fontSize:14,fontWeight:900,color:"#FFD700",letterSpacing:1}}>PLAY FOR KEEPS OFFICIAL ROOKIE RANKINGS</div><div style={{fontSize:13,color:"#666",marginTop:2}}>2026 Dynasty Rookie Class{officialUpdated?" · Last updated by PFK Staff · "+new Date(officialUpdated).toLocaleString():" · PFK Staff Rankings"}</div></div>
              {isEvanOnDev && (
                <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                  {!editMode && <button onClick={()=>setEditMode(true)} style={{padding:'8px 14px',background:'transparent',border:'2px solid #10b981',borderRadius:7,color:'#10b981',fontWeight:900,cursor:'pointer',fontSize:13,letterSpacing:1}}>✏️ EDIT MODE</button>}
                  {editMode && <>
                    <button onClick={officialAddTier} style={{padding:'7px 12px',background:'transparent',border:'1px solid #FFD700',borderRadius:6,color:'#FFD700',cursor:'pointer',fontSize:13,fontWeight:700}}>+ Tier</button>
                    {sameSettings(pfkSettings, DEFAULT_SETTINGS) ? (
                      <button onClick={seedOfficialFromModel} style={{padding:'7px 12px',background:'transparent',border:'1px solid #c084fc',borderRadius:6,color:'#c084fc',cursor:'pointer',fontSize:13,fontWeight:700}} title="Replace current list with the model's auto-tier output">🌱 Seed from Model</button>
                    ) : (
                      <button onClick={deriveFromMaster} style={{padding:'7px 12px',background:'transparent',border:'1px solid #06b6d4',borderRadius:6,color:'#06b6d4',cursor:'pointer',fontSize:13,fontWeight:700}} title="Rebuild this combo from the master list with position multipliers applied">🔄 Derive from Master</button>
                    )}
                    <button onClick={saveDraft} style={{padding:'7px 14px',background:'#10b981',border:'none',borderRadius:6,color:'#000',fontWeight:900,cursor:'pointer',fontSize:13,letterSpacing:1}}>💾 SAVE DRAFT</button>
                    <button onClick={publishToProd} style={{padding:'7px 14px',background:'#FFD700',border:'none',borderRadius:6,color:'#000',fontWeight:900,cursor:'pointer',fontSize:13,letterSpacing:1}}>🚀 PUBLISH TO PROD</button>
                    <button onClick={()=>setEditMode(false)} style={{padding:'7px 12px',background:'transparent',border:'1px solid #555',borderRadius:6,color:'#888',cursor:'pointer',fontSize:13}}>Exit</button>
                  </>}
                </div>
              )}
            </div>
            {isEvanOnDev && draftMsg && <div style={{marginBottom:12,padding:'8px 12px',background:draftMsg.startsWith('Save error')||draftMsg.startsWith('Publish error')?'#3a1010':'#0a2a1a',border:'1px solid '+(draftMsg.startsWith('Save error')||draftMsg.startsWith('Publish error')?'#ef4444':'#10b981'),borderRadius:8,color:draftMsg.startsWith('Save error')||draftMsg.startsWith('Publish error')?'#ef4444':'#10b981',fontSize:13,fontWeight:700}}>{draftMsg}</div>}
            <div style={{marginBottom:14,padding:'10px 12px',background:'#0a0a0a',border:'1px solid #222',borderRadius:10}}>
              <SettingsToggleBar value={pfkSettings} onChange={setPfkSettings}/>
              {pfkMissing&&<div style={{fontSize:12,color:'#d97706',marginTop:8}}>No ranking published yet for this combo — showing most recent.</div>}
            </div>
            <FilterBar/>
            <div className="pfk-rookie-list">
              <RenderList src={officialList||PFK_LIST} allowEdit={editMode} autoTier={false} prospects={prospects} {...commonProps} {...(editMode ? officialOps : {})} showRankingScore={editMode && isEvanOnDev}/>
            </div>
          </div>
        )}
        {tab==="custom"&&(
          <div>
            {/* Saved lists selector */}
            <div style={{background:"#0a0a0a",border:"1px solid #1e1e1e",borderRadius:12,padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:13,fontWeight:700,color:"#555",letterSpacing:1,flexShrink:0}}>MY LISTS</span>
                <button onClick={createList} disabled={savedLists.length>=10} style={{marginLeft:"auto",padding:"4px 12px",background:savedLists.length>=10?"#111":"#FFD700",border:"none",borderRadius:6,color:savedLists.length>=10?"#444":"#000",fontWeight:900,cursor:savedLists.length>=10?"default":"pointer",fontSize:13,flexShrink:0}}>+ New List</button>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {savedLists.map(sl=>{
                  const active=sl.id===activeListId;
                  const isRen=renamingListId===sl.id;
                  return(
                    <div key={sl.id} style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
                      {isRen?(
                        <input autoFocus value={listNameDraft} onChange={e=>setListNameDraft(e.target.value)}
                          onKeyDown={e=>{if(e.key==="Enter"){renameList(sl.id,listNameDraft);setRenamingListId(null);}if(e.key==="Escape")setRenamingListId(null);}}
                          onBlur={()=>{renameList(sl.id,listNameDraft);setRenamingListId(null);}}
                          style={{padding:"5px 10px",background:"#0d0d0d",border:"1px solid #FFD700",borderRadius:7,color:"#FFD700",fontSize:14,fontWeight:700,width:130}}/>
                      ):(
                        <button onClick={()=>switchList(sl.id)}
                          style={{padding:"5px 12px",borderRadius:20,border:active?"2px solid #FFD700":"2px solid #2a2a2a",background:active?"#1a1400":"transparent",color:active?"#FFD700":"#666",fontWeight:700,fontSize:14,cursor:"pointer",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {sl.name}
                        </button>
                      )}
                      {!isRen&&active&&(
                        <button onClick={()=>{setRenamingListId(sl.id);setListNameDraft(sl.name);}} title="Rename"
                          style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#555",cursor:"pointer",fontSize:12,padding:"2px 6px",flexShrink:0}}>✏️</button>
                      )}
                      {!isRen&&savedLists.length>1&&(
                        <button onClick={()=>deleteList(sl.id)} title="Delete list"
                          style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#444",cursor:"pointer",fontSize:12,padding:"2px 6px",flexShrink:0}}>✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Toolbar */}
            <div style={{background:"#111",border:"1px solid #FFD700",borderRadius:12,padding:"12px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:800,color:"#FFD700"}}>✏️ {savedLists.find(l=>l.id===activeListId)?.name||"My Rankings"}</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,fontWeight:800,color:"#888",letterSpacing:1}}>STARTING POINT</span>
                <select value={sortBy} onChange={e=>applySort(e.target.value)} title="Pick a starting order — you can drag freely from there. Re-pick any time to start over."
                  style={{padding:"5px 8px",background:"#0d0d0d",border:"1px solid #333",borderRadius:6,color:"#FFD700",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  <option value="pfk">PFK Official Rankings</option>
                  <option value="draftcapital">NFL Draft Capital</option>
                  <option value="pfkmodel">PFK Rookie Model</option>
                </select>
              </div>
              {isDirty
                ? <span style={{fontSize:12,color:"#ef4444",fontWeight:800,letterSpacing:0.5}}>● Unsaved changes</span>
                : saved
                  ? <span style={{fontSize:12,color:"#10b981",fontWeight:800,letterSpacing:0.5}}>✓ Saved</span>
                  : <span style={{fontSize:12,color:"#555"}}>All changes saved</span>}
              <span style={{flex:1}}/>
              <button onClick={()=>setShowAddTier(v=>!v)} style={{padding:"6px 12px",background:"#0f0f0f",border:"1px solid #FFD700",borderRadius:7,color:"#FFD700",fontWeight:700,cursor:"pointer",fontSize:14}}>+ Tier</button>
              <button onClick={()=>setShowAdd(v=>!v)} style={{padding:"6px 12px",background:"#222",border:"1px solid #444",borderRadius:7,color:"#ccc",fontWeight:700,cursor:"pointer",fontSize:14}}>+ Player</button>
              <button onClick={undo} disabled={!history.length} style={{padding:"6px 12px",background:"transparent",border:"1px solid "+(history.length?"#FFD700":"#333"),borderRadius:7,color:history.length?"#FFD700":"#444",fontWeight:700,cursor:history.length?"pointer":"default",fontSize:14}}>↩ Undo</button>
              <button onClick={()=>{if(!confirm('Reset to the latest published PFK rankings? Your edits to this list will be lost.')) return; setHistory([]);setList(officialList||buildInitialList()); setIsDirty(false);}} style={{padding:"6px 12px",background:"transparent",border:"1px solid #555",borderRadius:7,color:"#888",fontWeight:700,cursor:"pointer",fontSize:14}}>↺ Reset</button>
              <button onClick={saveList} disabled={!isDirty} style={{padding:"6px 14px",background:isDirty?"#FFD700":"#1a1a1a",border:"none",borderRadius:7,color:isDirty?"#000":"#444",fontWeight:900,cursor:isDirty?"pointer":"default",fontSize:14,letterSpacing:0.5}}>💾 Save</button>
            </div>
            {showAddTier&&(<div style={{background:"#111",border:"1px solid #FFD700",borderRadius:10,padding:14,marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
              <input value={newTierName} onChange={e=>setNewTierName(e.target.value)} placeholder="Tier name" onKeyDown={e=>e.key==="Enter"&&addTier()} style={{flex:1,padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:13}}/>
              <button onClick={addTier} style={{padding:"7px 16px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:14}}>Add</button>
              <button onClick={()=>setShowAddTier(false)} style={{padding:"7px 10px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:14}}>✕</button>
            </div>)}
            {showAdd&&(<div style={{background:"#111",border:"1px solid #FFD700",borderRadius:10,padding:14,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{display:"flex",flexDirection:"column",gap:3,flex:2,minWidth:110}}><label style={{fontSize:12,color:"#666"}}>NAME</label><input value={newPlayer.name} onChange={e=>setNewPlayer({...newPlayer,name:e.target.value})} placeholder="Player name" style={inp({width:"100%"})}/></div>
              <div style={{display:"flex",flexDirection:"column",gap:3}}><label style={{fontSize:12,color:"#666"}}>POS</label><select value={newPlayer.pos} onChange={e=>setNewPlayer({...newPlayer,pos:e.target.value})} style={inp({})}>{["WR","RB","TE","QB"].map(o=><option key={o}>{o}</option>)}</select></div>
              {[["college","SCHOOL","School"]].map(([k,l,ph])=>(<div key={k} style={{display:"flex",flexDirection:"column",gap:3}}><label style={{fontSize:12,color:"#666"}}>{l}</label><input value={newPlayer[k]||""} onChange={e=>setNewPlayer({...newPlayer,[k]:e.target.value})} placeholder={ph} style={inp({width:120})}/></div>))}
              <button onClick={addNew} style={{padding:"7px 16px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:14}}>Add</button>
              <button onClick={()=>setShowAdd(false)} style={{padding:"7px 10px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:14}}>✕</button>
            </div>)}
            <FilterBar/>
            <div className="pfk-rookie-list">
              <RenderList src={list} allowEdit={true} {...commonProps}/>
            </div>
          </div>
        )}
        <div style={{display:tab==="team"?"block":"none"}}><TeamTab/></div>
        {tab==="polls"&&<TradePollsTab session={session} onRequestSignIn={()=>{setAuthMode('signin');setAuthOpen(true);}}/>}
      </div>
    </div>
  );
}

// PFK Rookie Model — admin-only tab. One sortable table across all positions.
// Each row: name, pos, stats% (editable), draft capital (auto from pick / overridable), film% (editable), PFK score (computed).
// Admin "PFK vs Zolty" tab — side-by-side comparison of Evan's PFK rankings against
// Zoltan's static rankings + ADP. Shows only players present in BOTH lists.
function PFKvsZoltyTab({officialList:livOfficialList}){
  // If AdminApp passes its live list (the in-memory rankings being edited), use that —
  // updates instantly as you drag/edit. Falls back to its own fetch if no prop given.
  const [fetchedList,setFetchedList]=useState(null);
  const [loading,setLoading]=useState(livOfficialList ? false : true);
  useEffect(()=>{
    if(livOfficialList) return;
    fetchOfficialRankings(DEFAULT_SETTINGS).then(row=>{
      setFetchedList(row?.data || []);
      setLoading(false);
    });
  },[livOfficialList]);
  const officialList = livOfficialList || fetchedList;
  // Strip trailing suffixes (Jr, Sr, II, III, IV) before matching, so "Omar Cooper Jr."
  // matches Zolty's "Omar Cooper" and "Chris Brazzell II" matches "Chris Brazzell".
  const compareKey = (s)=>normDraftName(s).replace(/(jr|sr|ii|iii|iv|v)$/, '');
  const rows = useMemo(()=>{
    if(!officialList) return [];
    const pfkRank = new Map();
    let r = 0;
    for(const it of officialList){
      if(it?.type === 'player'){
        r++;
        pfkRank.set(compareKey(it.name), { rank:r, name:it.name, pos:it.pos });
      }
    }
    const zByKey = new Map();
    for(const z of ZOLTY_2026){ zByKey.set(compareKey(z.name), z); }
    const out = [];
    for(const [key, p] of pfkRank.entries()){
      const z = zByKey.get(key);
      if(!z) continue;
      out.push({
        name: p.name, pos: p.pos,
        pfk: p.rank, zolty: z.rank, adp: z.adp,
        vsZolty: z.rank - p.rank,
        vsAdp:   z.adp  - p.rank,
      });
    }
    out.sort((a,b)=>a.pfk - b.pfk);
    return out;
  },[officialList]);

  const onlyPfk = useMemo(()=>{
    if(!officialList) return [];
    const zKeys = new Set(ZOLTY_2026.map(z=>compareKey(z.name)));
    const out = []; let r = 0;
    for(const it of officialList){
      if(it?.type === 'player'){
        r++;
        if(!zKeys.has(compareKey(it.name))) out.push({name:it.name,pos:it.pos,pfk:r});
      }
    }
    return out;
  },[officialList]);

  const onlyZolty = useMemo(()=>{
    if(!officialList) return [];
    const pfkKeys = new Set();
    for(const it of officialList){ if(it?.type==='player') pfkKeys.add(compareKey(it.name)); }
    return ZOLTY_2026.filter(z=>!pfkKeys.has(compareKey(z.name)));
  },[officialList]);

  if(loading) return <div style={{padding:20,color:'#888'}}>Loading rankings…</div>;

  const POS_COLORS = {QB:'#a855f7', RB:'#22d3ee', WR:'#fbbf24', TE:'#f87171'};
  const Diff = ({n}) => {
    if(n===0) return <span style={{color:'#888',fontWeight:800}}>±0</span>;
    const color = n>0 ? '#10b981' : '#ef4444';
    const sign = n>0 ? '+' : '';
    return <span style={{color,fontWeight:900}}>{sign}{n}</span>;
  };
  const th = {padding:'8px 10px',textAlign:'left',fontSize:11,letterSpacing:1,color:'#888',fontWeight:800,borderBottom:'1px solid #222',background:'#0a0a0a',position:'sticky',top:0};
  const td = {padding:'8px 10px',fontSize:13,borderBottom:'1px solid #161616'};

  return (
    <div style={{padding:'16px 20px',color:'#eee'}}>
      <div style={{marginBottom:14,display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
        <div style={{fontSize:18,fontWeight:900,color:'#FFD700',letterSpacing:1}}>PFK vs ZOLTY</div>
        <div style={{fontSize:12,color:'#888'}}>{rows.length} players in both lists · sorted by PFK rank · green = PFK higher · red = PFK lower</div>
      </div>
      <div className="pfk-wide-scroll" style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:10}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:560}}>
          <thead>
            <tr>
              <th style={{...th,width:60,textAlign:'right'}}>PFK</th>
              <th style={th}>PLAYER</th>
              <th style={{...th,width:50}}>POS</th>
              <th style={{...th,width:80,textAlign:'right'}}>ZOLTY</th>
              <th style={{...th,width:80,textAlign:'right'}}>ADP</th>
              <th style={{...th,width:110,textAlign:'right'}}>VS ZOLTY</th>
              <th style={{...th,width:110,textAlign:'right'}}>VS ADP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.name} style={{background:i%2?'#0d0d0d':'#0f0f0f'}}>
                <td style={{...td,textAlign:'right',fontWeight:900,color:'#FFD700'}}>{r.pfk}</td>
                <td style={{...td,fontWeight:700}}>{r.name}</td>
                <td style={td}><span style={{padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:800,background:'#111',color:POS_COLORS[r.pos]||'#888',border:'1px solid '+(POS_COLORS[r.pos]||'#333')}}>{r.pos}</span></td>
                <td style={{...td,textAlign:'right',color:'#aaa'}}>{r.zolty}</td>
                <td style={{...td,textAlign:'right',color:'#aaa'}}>{r.adp}</td>
                <td style={{...td,textAlign:'right'}}><Diff n={r.vsZolty}/></td>
                <td style={{...td,textAlign:'right'}}><Diff n={r.vsAdp}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(onlyPfk.length>0 || onlyZolty.length>0) && (
        <div className="pfk-pr-grid" style={{marginTop:18,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:10,padding:'12px 14px'}}>
            <div style={{fontSize:11,fontWeight:800,letterSpacing:1,color:'#888',marginBottom:6}}>ONLY ON PFK ({onlyPfk.length})</div>
            <div style={{fontSize:12,color:'#aaa',lineHeight:1.7}}>
              {onlyPfk.map(p=><div key={p.name}><span style={{color:'#FFD700',fontWeight:700,display:'inline-block',width:30}}>{p.pfk}</span> {p.name} <span style={{color:'#666'}}>({p.pos})</span></div>)}
            </div>
          </div>
          <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:10,padding:'12px 14px'}}>
            <div style={{fontSize:11,fontWeight:800,letterSpacing:1,color:'#888',marginBottom:6}}>ONLY ON ZOLTY ({onlyZolty.length})</div>
            <div style={{fontSize:12,color:'#aaa',lineHeight:1.7}}>
              {onlyZolty.map(p=><div key={p.name}><span style={{color:'#aaa',fontWeight:700,display:'inline-block',width:30}}>{p.rank}</span> {p.name} <span style={{color:'#666'}}>({p.pos})</span></div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RookieModelTab(){
  const [items,setItems]=useState(null); // null = loading
  const [savedJson,setSavedJson]=useState('');
  const [posFilter,setPosFilter]=useState('ALL');
  const [showAdd,setShowAdd]=useState(false);
  const [newP,setNewP]=useState({name:'',pos:'WR',pick:''});
  const [msg,setMsg]=useState('');
  const [editing,setEditing]=useState(null); // {id, field}
  const [editVal,setEditVal]=useState('');
  // Combo selector for the model tab — drives the per-combo PFK column and override editing.
  const [modelSettings,setModelSettings]=useState(DEFAULT_SETTINGS);

  // Build initial model from current default-combo roster + DRAFT_2026 + baked maps.
  const buildFromRoster = useCallback(async()=>{
    const row = await fetchOfficialRankings(DEFAULT_SETTINGS);
    const roster = (row?.data||[]).filter(it=>it.type==='player');
    return roster.filter(p=>['QB','RB','WR','TE'].includes(p.pos)).map(p=>{
      const k = normDraftName(p.name);
      const draft = DRAFT_2026[k] || null;
      const filmScores = {};
      if(BAKED_FILM_ZOLTAN[k]   != null) filmScores.zoltan   = BAKED_FILM_ZOLTAN[k];
      if(BAKED_FILM_ZIERLEIN[k] != null) filmScores.zierlein = BAKED_FILM_ZIERLEIN[k];
      return {
        id: p.id || ('m_'+Date.now()+Math.random().toString(36).slice(2,6)),
        name: p.name, pos: p.pos,
        pick: draft?.pick || null,
        team: draft?.team || null,
        stats: BAKED_STATS_PCT[k] ?? null,
        filmScores,
        dcOverride: null,
      };
    });
  },[]);

  // Migrate legacy items + always-on backfill of any missing baked film source values.
  // Runs every load so newly-added baked values reach existing players without manual backfill.
  const migrate = (arr) => (arr||[]).map(it=>{
    const fs = (it.filmScores && typeof it.filmScores==='object') ? {...it.filmScores} : {};
    if(typeof it.film === 'number' && fs.zoltan==null) fs.zoltan = it.film;
    const k = normDraftName(it.name);
    if(fs.zoltan==null   && BAKED_FILM_ZOLTAN[k]   != null) fs.zoltan   = BAKED_FILM_ZOLTAN[k];
    if(fs.zierlein==null && BAKED_FILM_ZIERLEIN[k] != null) fs.zierlein = BAKED_FILM_ZIERLEIN[k];
    const {film, ...rest} = it;
    return {...rest, filmScores: fs};
  });

  useEffect(()=>{
    (async()=>{
      // Admin always reads draft (with fallback to published if draft missing).
      const row = await fetchModelDraft();
      if(row && Array.isArray(row.data) && row.data.length){
        const migrated = migrate(row.data);
        setItems(migrated);
        setSavedJson(JSON.stringify(migrated));
        if(JSON.stringify(migrated) !== JSON.stringify(row.data)){
          await saveModelData(migrated);
          setSavedJson(JSON.stringify(migrated));
        }
      }else{
        const seeded = await buildFromRoster();
        setItems(seeded);
        const { error } = await saveModelData(seeded);
        if(!error) setSavedJson(JSON.stringify(seeded));
      }
    })();
  },[buildFromRoster]);

  // Debounced auto-save
  useEffect(()=>{
    if(items===null) return;
    const cur = JSON.stringify(items);
    if(cur===savedJson) return;
    const t = setTimeout(async()=>{
      setMsg('Saving...');
      const { error } = await saveModelData(items);
      if(error){ setMsg('Save error: '+(error.message||error)); }
      else{ setSavedJson(cur); setMsg('Saved ✓'); setTimeout(()=>setMsg(''),1200); }
    },800);
    return ()=>clearTimeout(t);
  },[items,savedJson]);

  const computeDc = (it) => it.dcOverride!=null ? +it.dcOverride : dcScoreFromPick(it.pos, it.pick);
  const computeFilm = (it) => filmAvgPct(it.filmScores);
  // Baseline PFK = before per-combo multiplier and per-combo override.
  const computeBaselinePfk = (it) => {
    const base = pfkScore(it.stats, computeDc(it), computeFilm(it));
    return Math.round(base * landingMultiplier(it.landing) * 10) / 10;
  };
  // Combo-adjusted PFK = baseline × FORMAT × TEP × PTD multiplier; per-player override wins if present.
  const computePfk = (it) => {
    const sig = settingsSig(modelSettings);
    const ov = it.comboOverrides?.[sig];
    if(ov!=null && !isNaN(+ov)) return Math.round(+ov*10)/10;
    return Math.round(computeBaselinePfk(it) * comboMultiplier(it.pos, modelSettings) * 10) / 10;
  };

  const filtered = (items||[]).filter(it=>posFilter==='ALL' || it.pos===posFilter);
  const sorted = [...filtered].sort((a,b)=>computePfk(b)-computePfk(a));

  const updateField = (id,field,val) => setItems(prev=>prev.map(it=>{
    if(it.id!==id) return it;
    // Film source field: 'film:<source>' e.g. 'film:zoltan', 'film:evan', 'film:zierlein'
    if(field.startsWith('film:')){
      const source = field.slice(5);
      const src = FILM_SOURCES[source];
      const fs = {...(it.filmScores||{})};
      if(val===''||val===null||val===undefined){ delete fs[source]; }
      else if(src && src.kind==='categorical'){ fs[source] = String(val); }
      else { fs[source] = +val; }
      return {...it, filmScores: fs};
    }
    // Per-combo override: 'override' = current modelSettings combo's override value.
    if(field==='override'){
      const sig = settingsSig(modelSettings);
      const co = {...(it.comboOverrides||{})};
      if(val===''||val===null||val===undefined) delete co[sig];
      else co[sig] = Math.max(0, +val);
      return {...it, comboOverrides: co};
    }
    if(field==='dc') return {...it, dcOverride: val===''||val===null ? null : Math.max(0,Math.min(100,+val))};
    if(field==='stats') return {...it, stats: val===''||val===null ? null : Math.max(0,Math.min(100,+val))};
    if(field==='landing') return {...it, landing: val===''||val===null||val===undefined ? null : +val};
    if(field==='pick') return {...it, pick: val||null};
    return {...it, [field]: val};
  }));

  // Cycle a categorical film source: unrated → option[0] → option[1] → ... → unrated.
  const cycleCategorical = (id, sourceKey) => {
    const src = FILM_SOURCES[sourceKey]; if(!src || src.kind!=='categorical') return;
    setItems(prev=>prev.map(it=>{
      if(it.id!==id) return it;
      const cur = it.filmScores?.[sourceKey];
      const opts = src.options;
      const idx = cur==null ? -1 : opts.findIndex(o=>o.key===cur);
      const nextIdx = idx + 1; // -1 → 0, last → opts.length (which becomes "unrated")
      const fs = {...(it.filmScores||{})};
      if(nextIdx >= opts.length){ delete fs[sourceKey]; }
      else { fs[sourceKey] = opts[nextIdx].key; }
      return {...it, filmScores: fs};
    }));
  };

  const removeRow = (id) => { if(!confirm('Remove this player from the model?')) return; setItems(prev=>prev.filter(it=>it.id!==id)); };

  // PUBLISH MODEL — copies current (auto-saved) draft into the published row that prod reads.
  const [publishingModel,setPublishingModel] = useState(false);
  const [publishedSig,setPublishedSig] = useState(null);
  // Load the currently-published row signature so the button can show diff/no-diff state.
  useEffect(()=>{
    (async()=>{
      if(!sb) return;
      const { data } = await sb.from('pfk_rankings').select('id,data,settings').order('updated_at',{ascending:false});
      const pub = (data||[]).find(r=>r.settings && r.settings.kind==='rookie_model');
      if(pub) setPublishedSig(JSON.stringify(pub.data));
    })();
  },[]);
  const draftDiffersFromPub = items!==null && publishedSig !== JSON.stringify(items);
  const onPublishModel = async () => {
    if(!items?.length) { setMsg('Nothing to publish.'); setTimeout(()=>setMsg(''),2000); return; }
    if(!confirm('Publish current model state to PRODUCTION? This pushes every player\'s scores, overrides, and edits live to the public site.')) return;
    setPublishingModel(true); setMsg('Publishing model...');
    const { error } = await publishModel(items);
    setPublishingModel(false);
    if(error){ setMsg('Publish error: '+(error.message||error)); }
    else{ setPublishedSig(JSON.stringify(items)); setMsg('✓ Model published to production'); setTimeout(()=>setMsg(''),3500); }
  };

  const addRow = () => {
    if(!newP.name.trim()) return;
    const k = normDraftName(newP.name);
    const draft = newP.pick ? null : (DRAFT_2026[k]||null);
    const filmScores = {};
    if(BAKED_FILM_ZOLTAN[k]   != null) filmScores.zoltan   = BAKED_FILM_ZOLTAN[k];
    if(BAKED_FILM_ZIERLEIN[k] != null) filmScores.zierlein = BAKED_FILM_ZIERLEIN[k];
    const it = {
      id:'m_'+Date.now(),
      name:newP.name.trim(), pos:newP.pos,
      pick: newP.pick || draft?.pick || null,
      team: draft?.team || null,
      stats: BAKED_STATS_PCT[k] ?? null,
      filmScores,
      dcOverride: null,
    };
    setItems(prev=>[...(prev||[]), it]);
    setNewP({name:'',pos:'WR',pick:''});
    setShowAdd(false);
  };

  const reseed = async() => {
    if(!confirm('Rebuild the model from the current rookie roster? Edits to existing players will be kept; new players will be added with baked stats/film if available.')) return;
    const seeded = await buildFromRoster();
    setItems(prev=>{
      const byKey = new Map((prev||[]).map(it=>[normDraftName(it.name), it]));
      return seeded.map(s=>{
        const existing = byKey.get(normDraftName(s.name));
        return existing ? {...s, stats:existing.stats, filmScores:existing.filmScores, dcOverride:existing.dcOverride, id:existing.id} : s;
      });
    });
  };

  if(items===null) return <div style={{padding:40,color:'#FFD700',textAlign:'center'}}>Loading model...</div>;

  const cellStyle = {padding:'8px 10px', borderBottom:'1px solid #1a1a1a', fontSize:13, color:'#ddd'};
  const headStyle = {padding:'10px 10px', background:'#0c0c0c', borderBottom:'2px solid #FFD700', fontSize:11, color:'#FFD700', fontWeight:800, letterSpacing:1, textAlign:'left', position:'sticky', top:0};
  const numCellStyle = {...cellStyle, textAlign:'right', cursor:'pointer'};
  const editInputStyle = {width:60, padding:'4px 6px', background:'#000', border:'1px solid #FFD700', borderRadius:4, color:'#fff', fontSize:13, textAlign:'right'};
  const POS_COLOR = {QB:'#ef4444', RB:'#10b981', WR:'#3b82f6', TE:'#f59e0b'};

  // Returns true if a field's current value differs from its baked/default state.
  // For fields with no baked default (Evan in/out, Landing, per-combo Override): true if any value set.
  // Used to color manually-edited cells purple so Evan can see what he's overridden at a glance.
  const isManuallyEdited = (it, field) => {
    if(!it) return false;
    const k = normDraftName(it.name||'');
    switch(field){
      case 'stats':         { const b = BAKED_STATS_PCT[k]; return it.stats != null && (b == null || +it.stats !== +b); }
      case 'dc':            return it.dcOverride != null;
      case 'film:zoltan':   { const b = BAKED_FILM_ZOLTAN[k];   const v = it.filmScores?.zoltan;   return v != null && (b == null || +v !== +b); }
      case 'film:zierlein': { const b = BAKED_FILM_ZIERLEIN[k]; const v = it.filmScores?.zierlein; return v != null && (b == null || +v !== +b); }
      case 'film:evan':     return it.filmScores?.evan != null;
      case 'landing':       return it.landing != null;
      case 'override':      return it.comboOverrides?.[settingsSig(modelSettings)] != null;
      default: return false;
    }
  };
  const EDITED_COLOR = '#c084fc';

  const startEdit = (id,field,cur) => { setEditing({id,field}); setEditVal(cur==null?'':String(cur)); };
  const commitEdit = () => {
    if(!editing) return;
    updateField(editing.id, editing.field, editVal);
    setEditing(null); setEditVal('');
  };
  const cancelEdit = () => { setEditing(null); setEditVal(''); };

  const renderNum = (it,field,val,suffix='') => {
    const isEdit = editing && editing.id===it.id && editing.field===field;
    if(isEdit) return (
      <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter')commitEdit(); else if(e.key==='Escape')cancelEdit();}}
        onBlur={commitEdit} style={editInputStyle}/>
    );
    return <span onClick={()=>startEdit(it.id,field,val)} style={{display:'inline-block',minWidth:36,padding:'2px 4px',borderRadius:3}} title="Click to edit">{val==null?'—':val+suffix}</span>;
  };

  return (
    <div style={{padding:'12px 16px'}}>
      <div style={{padding:'10px 12px',background:'#0a0a0a',border:'1px solid #1a1a1a',borderRadius:10,marginBottom:12,display:'flex',alignItems:'flex-start',gap:14,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:280}}>
          <div style={{fontSize:11,color:'#FFD700',fontWeight:800,letterSpacing:2,marginBottom:8}}>VIEWING COMBO — settings drive PFK column & per-combo override edits</div>
          <SettingsToggleBar value={modelSettings} onChange={setModelSettings}/>
          <div style={{fontSize:11,color:'#555',marginTop:6}}>Stats / DC / Film / Landing are baseline inputs and stay the same across combos. PFK column and Override apply only to the selected combo.</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6,minWidth:180}}>
          <div style={{fontSize:11,color:'#FFD700',fontWeight:800,letterSpacing:2}}>PUBLISH MODEL</div>
          <button onClick={onPublishModel} disabled={publishingModel || !draftDiffersFromPub} style={{
            padding:'10px 14px',
            background: (publishingModel || !draftDiffersFromPub) ? '#222' : '#FFD700',
            color: (publishingModel || !draftDiffersFromPub) ? '#666' : '#000',
            border:'none', borderRadius:8, fontWeight:900, letterSpacing:1, fontSize:13,
            cursor: (publishingModel || !draftDiffersFromPub) ? 'not-allowed' : 'pointer'
          }}>{publishingModel ? 'PUBLISHING...' : draftDiffersFromPub ? '🚀 PUBLISH TO PROD' : '✓ IN SYNC'}</button>
          <div style={{fontSize:10,color:'#555',lineHeight:1.4}}>{draftDiffersFromPub ? 'Draft differs from published. Click to push current scores live to playforkeeps-web.pages.dev.' : 'Draft and published are identical.'}</div>
        </div>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <span style={{fontSize:12,color:'#888',marginRight:6}}>FILTER</span>
        {['ALL','QB','RB','WR','TE'].map(p=>(
          <button key={p} onClick={()=>setPosFilter(p)} style={{
            padding:'5px 12px', borderRadius:14, fontSize:12, fontWeight:800, cursor:'pointer',
            background: posFilter===p ? '#FFD700' : 'transparent',
            color: posFilter===p ? '#000' : '#888',
            border: '1px solid '+(posFilter===p ? '#FFD700' : '#333'),
          }}>{p}</button>
        ))}
        <span style={{flex:1}}/>
        <button onClick={()=>setShowAdd(s=>!s)} style={{padding:'6px 12px',background:'transparent',border:'1px solid #FFD700',borderRadius:6,color:'#FFD700',cursor:'pointer',fontSize:13,fontWeight:700}}>+ Player</button>
        <button onClick={reseed} style={{padding:'6px 12px',background:'transparent',border:'1px solid #555',borderRadius:6,color:'#888',cursor:'pointer',fontSize:13,fontWeight:700}} title="Pull any new rookies from the roster into the model">↻ Sync roster</button>
        {msg && <span style={{fontSize:12,color: msg.startsWith('Save error')?'#ef4444':'#10b981',marginLeft:8}}>{msg}</span>}
      </div>
      {showAdd && (
        <div style={{padding:'10px 12px',background:'#0f0f0f',border:'1px solid #222',borderRadius:8,marginBottom:12,display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{display:'flex',flexDirection:'column',gap:3,minWidth:160}}>
            <label style={{fontSize:11,color:'#888'}}>NAME</label>
            <input autoFocus value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})} onKeyDown={e=>e.key==='Enter'&&addRow()} placeholder="Player name" style={{padding:'7px 9px',background:'#000',border:'1px solid #333',borderRadius:5,color:'#fff',fontSize:13}}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <label style={{fontSize:11,color:'#888'}}>POS</label>
            <select value={newP.pos} onChange={e=>setNewP({...newP,pos:e.target.value})} style={{padding:'7px 9px',background:'#000',border:'1px solid #333',borderRadius:5,color:'#fff',fontSize:13}}>{['QB','RB','WR','TE'].map(o=><option key={o}>{o}</option>)}</select>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <label style={{fontSize:11,color:'#888'}}>PICK (optional, e.g. 3.05)</label>
            <input value={newP.pick} onChange={e=>setNewP({...newP,pick:e.target.value})} onKeyDown={e=>e.key==='Enter'&&addRow()} placeholder="leave blank for UDFA" style={{padding:'7px 9px',background:'#000',border:'1px solid #333',borderRadius:5,color:'#fff',fontSize:13,width:160}}/>
          </div>
          <button onClick={addRow} style={{padding:'8px 14px',background:'#FFD700',color:'#000',border:'none',borderRadius:5,fontWeight:900,cursor:'pointer',fontSize:13}}>Add</button>
          <button onClick={()=>setShowAdd(false)} style={{padding:'8px 10px',background:'transparent',border:'1px solid #333',borderRadius:5,color:'#888',cursor:'pointer',fontSize:13}}>Cancel</button>
        </div>
      )}
      <div style={{overflowX:'auto',border:'1px solid #1a1a1a',borderRadius:8}}>
        <table style={{width:'100%',borderCollapse:'collapse',background:'#0a0a0a'}}>
          <thead>
            <tr>
              <th style={{...headStyle,width:50,textAlign:'center'}}>#</th>
              <th style={headStyle}>Player</th>
              <th style={{...headStyle,width:50,textAlign:'center'}}>Pos</th>
              <th style={{...headStyle,width:80}}>Pick</th>
              <th style={{...headStyle,width:75,textAlign:'right'}}>Stats%</th>
              <th style={{...headStyle,width:75,textAlign:'right'}}>DC</th>
              {Object.entries(FILM_SOURCES).map(([k,src])=>(
                <th key={k} style={{...headStyle,width:75,textAlign: src.kind==='categorical'?'center':'right'}} title={`${src.label} (weight ${src.weight}%, raw scale ${src.scaleHint})`}>{src.label}<span style={{color:'#666',fontWeight:600,marginLeft:4}}>{src.weight}%</span></th>
              ))}
              <th style={{...headStyle,width:75,textAlign:'right',color:'#aaa'}} title="Average of all populated film sources, normalized to 0-100">Film%</th>
              <th style={{...headStyle,width:75,textAlign:'center'}} title="Landing spot multiplier — 5=best (×1.08), 4 (×1.04), 3=neutral (×1.00), 2 (×0.96), 1=worst (×0.92). Default — = ×1.00 (no impact).">Landing</th>
              <th style={{...headStyle,width:75,textAlign:'right'}} title="Per-combo manual override of PFK score. Empty = use formula. Only applies to the currently-selected combo.">Override</th>
              <th style={{...headStyle,width:75,textAlign:'right',color:'#FFD700'}} title="PFK = baseline × FORMAT × TEP × PTD multiplier (or override if set)">PFK</th>
              <th style={{...headStyle,width:40}}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((it,i)=>{
              const dc = computeDc(it);
              const filmPct = computeFilm(it);
              const pfk = computePfk(it);
              const dcOverridden = it.dcOverride!=null;
              return (
                <tr key={it.id} style={{background:i%2?'#0d0d0d':'#0a0a0a'}}>
                  <td style={{...cellStyle,textAlign:'center',color:'#666',fontWeight:700}}>{i+1}</td>
                  <td style={cellStyle}>{it.name}{it.team?<span style={{color:'#666',fontWeight:600,marginLeft:6,fontSize:11}}>{it.team}</span>:null}</td>
                  <td style={{...cellStyle,textAlign:'center'}}><span style={{display:'inline-block',padding:'2px 6px',borderRadius:4,background:POS_COLOR[it.pos]+'33',color:POS_COLOR[it.pos],fontWeight:800,fontSize:11}}>{it.pos}</span></td>
                  <td style={cellStyle}>{it.pick||'UDFA'}</td>
                  <td style={{...numCellStyle, color: isManuallyEdited(it,'stats') ? EDITED_COLOR : '#ddd'}} title={isManuallyEdited(it,'stats') ? 'Manually edited' : 'Click to edit'}>{renderNum(it,'stats',it.stats)}</td>
                  <td style={{...numCellStyle,color: dcOverridden?'#c084fc':'#ddd'}} title={dcOverridden?'Manual override (click to edit / clear)':'Auto from pick (click to override)'}>
                    {renderNum(it,'dc', dcOverridden?it.dcOverride:dc)}
                    {dcOverridden && <button onClick={(e)=>{e.stopPropagation(); updateField(it.id,'dc','');}} style={{marginLeft:4,background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:11}} title="Clear override">×</button>}
                  </td>
                  {Object.keys(FILM_SOURCES).map(srcKey=>{
                    const src = FILM_SOURCES[srcKey];
                    const cur = it.filmScores?.[srcKey];
                    const fieldKey = 'film:'+srcKey;
                    const edited = isManuallyEdited(it, fieldKey);
                    const tooltip = `${src.label} · weight ${src.weight}% · scale ${src.scaleHint}${edited ? ' · MANUALLY EDITED' : ''}`;
                    if(src.kind==='categorical'){
                      const opt = cur==null ? null : src.options.find(o=>o.key===cur);
                      return (
                        <td key={srcKey} style={{...cellStyle, textAlign:'center', boxShadow: edited ? `inset 0 0 0 2px ${EDITED_COLOR}` : 'none'}} title={tooltip}>
                          <select
                            value={cur||''}
                            onChange={e=>updateField(it.id,'film:'+srcKey, e.target.value||null)}
                            style={{
                              minWidth:60, padding:'3px 6px', borderRadius:4, cursor:'pointer',
                              fontSize:11, fontWeight:900, letterSpacing:0.5, textAlign:'center',
                              background: opt ? opt.color+'33' : '#0a0a0a',
                              color: opt ? opt.color : '#666',
                              border: '1px solid '+(opt ? opt.color : '#222'),
                              appearance:'none', WebkitAppearance:'none', MozAppearance:'none',
                            }}
                          >
                            <option value="">—</option>
                            {src.options.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        </td>
                      );
                    }
                    return (
                      <td key={srcKey} style={{...numCellStyle, color: edited ? EDITED_COLOR : '#ddd'}} title={tooltip}>
                        {renderNum(it,'film:'+srcKey, cur)}
                      </td>
                    );
                  })}
                  <td style={{...cellStyle,textAlign:'right',color:filmPct==null?'#444':'#aaa',fontWeight:700}} title="Average of populated sources">{filmPct==null?'—':filmPct}</td>
                  {(() => {
                    const lopt = it.landing==null ? null : LANDING_OPTIONS.find(o=>o.key===+it.landing);
                    const lEdited = isManuallyEdited(it, 'landing');
                    return (
                      <td style={{...cellStyle, textAlign:'center', boxShadow: lEdited ? `inset 0 0 0 2px ${EDITED_COLOR}` : 'none'}} title={`Landing multiplier ×${landingMultiplier(it.landing).toFixed(2)}${lEdited ? ' · MANUALLY EDITED' : ''}`}>
                        <select
                          value={it.landing==null?'':String(it.landing)}
                          onChange={e=>updateField(it.id,'landing',e.target.value||null)}
                          style={{
                            minWidth:50, padding:'3px 6px', borderRadius:4, cursor:'pointer',
                            fontSize:11, fontWeight:900, letterSpacing:0.5, textAlign:'center',
                            background: lopt ? lopt.color+'33' : '#0a0a0a',
                            color: lopt ? lopt.color : '#666',
                            border: '1px solid '+(lopt ? lopt.color : '#222'),
                            appearance:'none', WebkitAppearance:'none', MozAppearance:'none',
                          }}
                        >
                          <option value="">—</option>
                          {LANDING_OPTIONS.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                      </td>
                    );
                  })()}
                  {(() => {
                    const sig = settingsSig(modelSettings);
                    const ov = it.comboOverrides?.[sig];
                    const isOv = ov!=null && !isNaN(+ov);
                    return (
                      <td style={{...numCellStyle,color: isOv?'#c084fc':'#666'}} title={isOv?`Override for this combo (×${comboMultiplier(it.pos,modelSettings).toFixed(2)} bypassed). Click to edit / clear.`:`No override — using formula × ${comboMultiplier(it.pos,modelSettings).toFixed(2)} multiplier`}>
                        {renderNum(it,'override', isOv?ov:null)}
                        {isOv && <button onClick={(e)=>{e.stopPropagation(); updateField(it.id,'override','');}} style={{marginLeft:4,background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:11}} title="Clear override">×</button>}
                      </td>
                    );
                  })()}
                  {(() => {
                    const sig = settingsSig(modelSettings);
                    const isOv = it.comboOverrides?.[sig]!=null;
                    return <td style={{...cellStyle,textAlign:'right',fontWeight:900,color: isOv?'#c084fc':'#FFD700',fontSize:14}} title={isOv?'Override active for this combo':`Auto: baseline × ${comboMultiplier(it.pos,modelSettings).toFixed(2)} combo multiplier`}>{pfk}</td>;
                  })()}
                  <td style={{...cellStyle,textAlign:'center'}}><button onClick={()=>removeRow(it.id)} style={{background:'transparent',border:'none',color:'#444',cursor:'pointer',fontSize:16}} title="Remove from model">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:10,fontSize:11,color:'#555',lineHeight:1.6}}>
        <div>PFK = (35% Stats + 50% Draft Capital + 15% Film) × Landing multiplier × per-combo multiplier (FORMAT × TEP × PTD).</div>
        <div>Film% = weighted average of populated sources (Zoltan 50% · You 30% · Zierlein 20%); missing sources drop and weights re-normalize.</div>
        <div>Landing: 5=best (×1.08) ... 1=worst (×0.92), — = ×1.00 (no impact). Override (per-combo) bypasses the formula entirely for the selected combo only — other combos unaffected.</div>
        <div>Click any number to edit. DC and Override cells turn purple when manually set; × clears.</div>
      </div>
    </div>
  );
}

function AdminApp(){
  const [session,setSession]=useState(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [loginErr,setLoginErr]=useState('');
  const [loading,setLoading]=useState(true);
  const [sets,setSets]=useState({});
  const [editingPlayer,setEditingPlayer]=useState(null);
  const [playerDraft,setPlayerDraft]=useState({});
  const [renamingTier,setRenamingTier]=useState(null);
  const [tierNameDraft,setTierNameDraft]=useState("");
  const [posFilter,setPosFilter]=useState(()=>new Set(["WR","RB","TE","QB"]));
  const [publishMsg,setPublishMsg]=useState('');
  const [adminSettings,setAdminSettings]=useState(DEFAULT_SETTINGS);
  const [showAddPlayer,setShowAddPlayer]=useState(false);
  const [newP,setNewP]=useState({name:'',pos:'WR',college:''});
  const [adminTab,setAdminTab]=useState('rankings'); // 'rankings' | 'model'
  // Mirror the public site's modelByName so admin rankings auto-tier from the same data.
  // Pulls the DRAFT row (so admin previews match dev URL).
  const [modelByName,setModelByName]=useState({});
  useEffect(()=>{
    fetchModelDraft().then(row=>{
      if(!row?.data || !Array.isArray(row.data)) return;
      const m={}; row.data.forEach(it=>{ if(it?.name) m[normDraftName(it.name)] = it; });
      setModelByName(m);
    }).catch(()=>{});
  },[]);

  const sigOf=s=>`${s.format||'Superflex'}|${s.tep}|${s.ppr}|${s.passTd}|${s.ppc}`;
  const currentSig=sigOf(adminSettings);
  const bucket=sets[currentSig];
  const list=bucket?.items||[];
  const history=bucket?.history||[];
  const lastUpdated=bucket?.updatedAt||null;
  const adminMissing=bucket?.missing||false;
  const isDirty=s=>JSON.stringify(s.items)!==(s.saved||'');
  const dirtyCount=Object.values(sets).filter(isDirty).length;

  useEffect(()=>{
    if(!sb){ setLoading(false); return; }
    sb.auth.getSession().then(({data})=>{ setSession(data.session); setLoading(false); });
    const { data:sub } = sb.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>sub?.subscription?.unsubscribe?.();
  },[]);

  useEffect(()=>{
    if(!session) return;
    if(sets[currentSig]) return;
    // Wait for the model so first-time combos can auto-seed from PFK order
    // (with the agreed-upon dynamic per-class tiers and the per-combo position multiplier).
    if(!Object.keys(modelByName).length) return;
    const snapshotSettings={...adminSettings};
    fetchOfficialRankings(snapshotSettings).then(row=>{
      const hasMatch=row&&row.data&&Array.isArray(row.data)&&sameSettings(row.settings,snapshotSettings);
      let items;
      if(hasMatch){
        items = row.data;
      } else {
        // No published row for this combo → seed from current model in this combo's order
        items = buildSeedFromModel(modelByName, snapshotSettings, row?.data || null) || buildInitialList();
      }
      setSets(prev=>prev[currentSig]?prev:{...prev,[currentSig]:{
        items, saved: hasMatch?JSON.stringify(items):null,
        updatedAt: hasMatch?row.updated_at:null,
        missing: !hasMatch, history:[], settings:snapshotSettings
      }});
    });
  },[session,currentSig,modelByName]);

  const login=async()=>{
    setLoginErr('');
    if(!sb){ setLoginErr('Supabase not loaded'); return; }
    const { error } = await sb.auth.signInWithPassword({email,password});
    if(error) setLoginErr(error.message);
  };
  const logout=async()=>{ await sb.auth.signOut(); };

  const publish=async()=>{
    const dirty=Object.entries(sets).filter(([,s])=>isDirty(s));
    if(!dirty.length){ setPublishMsg('Nothing to publish.'); setTimeout(()=>setPublishMsg(''),2500); return; }
    setPublishMsg(`Publishing ${dirty.length} combo${dirty.length>1?'s':''}...`);
    const errors=[];
    const nowIso=new Date().toISOString();
    for(const [sig,s] of dirty){
      const { error } = await publishOfficialRankings(s.items, s.settings);
      if(error) errors.push(error.message||String(error));
      else {
        const snap=JSON.stringify(s.items);
        setSets(prev=>prev[sig]?{...prev,[sig]:{...prev[sig],saved:snap,updatedAt:nowIso,missing:false}}:prev);
      }
    }
    if(errors.length) setPublishMsg('Error: '+errors.join('; '));
    else setPublishMsg(`Published ${dirty.length} combo${dirty.length>1?'s':''}! Live on the site.`);
    setTimeout(()=>setPublishMsg(''),3500);
  };

  const mutate=(fn)=>setSets(prev=>{
    const cur=prev[currentSig]; if(!cur) return prev;
    const next=fn(cur.items);
    return {...prev,[currentSig]:{...cur,items:next,history:[...cur.history.slice(-20),cur.items]}};
  });
  const undo=()=>setSets(prev=>{
    const cur=prev[currentSig]; if(!cur||!cur.history.length) return prev;
    return {...prev,[currentSig]:{...cur,items:cur.history[cur.history.length-1],history:cur.history.slice(0,-1)}};
  });

  const onReorder=(fromId,beforeId)=>mutate(prev=>{ const l=[...prev], fi=l.findIndex(x=>x.id===fromId); if(fi<0) return prev; const [item]=l.splice(fi,1); if(beforeId===null){ l.push(item); }else{ const ti=l.findIndex(x=>x.id===beforeId); l.splice(ti!==-1?ti:l.length,0,item); } return l; });
  const onMove=(id,dir)=>mutate(prev=>{ const l=[...prev], i=l.findIndex(x=>x.id===id), sw=i+dir; if(sw<0||sw>=l.length) return l; [l[i],l[sw]]=[l[sw],l[i]]; return l; });
  const onEdit=(p)=>{ setEditingPlayer(p.id); setPlayerDraft({...p}); };
  const onRemove=(id)=>mutate(prev=>prev.filter(x=>x.id!==id));
  const onSavePlayer=()=>{ mutate(prev=>prev.map(x=>x.id===editingPlayer?{...x,...playerDraft}:x)); setEditingPlayer(null); };
  const onCancelEdit=()=>setEditingPlayer(null);
  const onRenameStart=(id,name)=>{ setRenamingTier(id); setTierNameDraft(name); };
  const onRenameCancel=()=>setRenamingTier(null);
  const onRenameSave=()=>{ mutate(prev=>prev.map(x=>x.id===renamingTier?{...x,name:tierNameDraft}:x)); setRenamingTier(null); };
  const onDeleteTier=(id)=>{ if(!confirm('Delete this tier? Players inside will fall into the tier above.')) return; mutate(prev=>prev.filter(x=>x.id!==id)); };
  const addTier=()=>{ const name=prompt('Tier name:'); if(!name) return; mutate(prev=>[...prev,{id:'tier_'+Date.now(),type:'tier',name}]); };
  // 🌱 Seed from Model — replaces the current combo's list with the model's auto-tier output
  // for the currently-selected adminSettings. Wraps the shared buildSeedFromModel helper.
  const seedFromModel=()=>{
    if(!Object.keys(modelByName).length){ alert('Model data not loaded yet — try again in a moment.'); return; }
    const seeded = buildSeedFromModel(modelByName, adminSettings, list);
    if(!seeded){ alert('Could not build from model.'); return; }
    if(!confirm(`Replace the current combo's rankings with the model's auto-tier output (${seeded.filter(x=>x.type==='player').length} players)? Your manual edits to this combo will be lost. Other combos are unaffected.`)) return;
    mutate(prev=>seeded);
    setPublishMsg(`Seeded from model — ${seeded.filter(x=>x.type==='player').length} players in ${seeded.filter(x=>x.type==='tier').length} tiers. Hit PUBLISH to push live.`);
    setTimeout(()=>setPublishMsg(''),5000);
  };
  const copyToAllCombos=()=>{
    if(!list.length){ alert('Current list is empty — nothing to copy.'); return; }
    const total=FORMAT_CHOICES.length*TEP_CHOICES.length*PPR_CHOICES.length*PTD_CHOICES.length*PPC_CHOICES.length;
    if(!confirm(`Overwrite this list into all ${total} settings combos? You can still tweak individual combos after. Hit PUBLISH to commit.`)) return;
    const itemsJson=JSON.stringify(list);
    const items=JSON.parse(itemsJson);
    setSets(prev=>{
      const next={...prev};
      for(const format of FORMAT_CHOICES)
      for(const tep of TEP_CHOICES)
      for(const ppr of PPR_CHOICES)
      for(const passTd of PTD_CHOICES)
      for(const ppc of PPC_CHOICES){
        const settings={format,tep,ppr,passTd,ppc};
        const sig=sigOf(settings);
        const cur=next[sig];
        next[sig]={
          items: JSON.parse(itemsJson),
          saved: cur?.saved ?? null,
          updatedAt: cur?.updatedAt ?? null,
          missing: cur?.missing ?? true,
          history: cur?(cur.history||[]).concat([cur.items]).slice(-20):[],
          settings
        };
      }
      return next;
    });
    setPublishMsg(`Staged list into ${total} combos — hit PUBLISH to commit.`);
    setTimeout(()=>setPublishMsg(''),4000);
  };
  const addPlayer=async()=>{
    if(!newP.name.trim()) return;
    const player={type:'player',id:'p_'+Date.now(),name:newP.name.trim(),pos:newP.pos,college:newP.college.trim()};
    setNewP({name:'',pos:'WR',college:''}); setShowAddPlayer(false);
    const allCombos=[];
    for(const format of FORMAT_CHOICES)
    for(const tep of TEP_CHOICES)
    for(const ppr of PPR_CHOICES)
    for(const passTd of PTD_CHOICES)
    for(const ppc of PPC_CHOICES) allCombos.push({format,tep,ppr,passTd,ppc});
    setPublishMsg(`Adding ${player.name} to all ${allCombos.length} combos...`);
    const missing=allCombos.filter(s=>!sets[sigOf(s)]);
    const fetched=await Promise.all(missing.map(async s=>{
      const row=await fetchOfficialRankings(s);
      const hasMatch=row&&row.data&&Array.isArray(row.data)&&sameSettings(row.settings,s);
      const items=(row?.data&&Array.isArray(row.data))?row.data:buildInitialList();
      return {s,items,saved:hasMatch?JSON.stringify(items):null,updatedAt:hasMatch?row.updated_at:null,missing:!hasMatch};
    }));
    setSets(prev=>{
      const next={...prev};
      for(const f of fetched){
        const sig=sigOf(f.s);
        if(!next[sig]) next[sig]={items:f.items,saved:f.saved,updatedAt:f.updatedAt,missing:f.missing,history:[],settings:f.s};
      }
      for(const s of allCombos){
        const sig=sigOf(s);
        const cur=next[sig];
        if(cur) next[sig]={...cur,items:[...cur.items,player],history:[...(cur.history||[]).slice(-20),cur.items]};
      }
      return next;
    });
    setPublishMsg(`Added ${player.name} to all ${allCombos.length} combos — hit PUBLISH to commit.`);
    setTimeout(()=>setPublishMsg(''),4000);
  };

  if(loading) return <div style={{padding:40,color:'#FFD700',textAlign:'center'}}>Loading...</div>;

  if(!session){
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
        <div style={{width:'100%',maxWidth:380,background:'#111',border:'1px solid #333',borderRadius:12,padding:28}}>
          <div style={{textAlign:'center',marginBottom:20}}>
            <div style={{fontWeight:900,fontSize:22,letterSpacing:3,color:'#FFD700'}}>PFK ADMIN</div>
            <div style={{fontSize:13,color:'#888',marginTop:4}}>Staff login</div>
          </div>
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:10,marginBottom:10,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff'}}/>
          <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} style={{width:'100%',padding:10,marginBottom:14,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff'}}/>
          <button onClick={login} style={{width:'100%',padding:12,background:'#FFD700',color:'#000',border:'none',borderRadius:6,fontWeight:900,cursor:'pointer',letterSpacing:1}}>SIGN IN</button>
          {loginErr&&<div style={{color:'#ef4444',fontSize:14,marginTop:10,textAlign:'center'}}>{loginErr}</div>}
          <div style={{textAlign:'center',marginTop:16}}><a href="/" style={{fontSize:13,color:'#666',textDecoration:'none'}}>← Back to site</a></div>
        </div>
      </div>
    );
  }

  const commonProps={ onReorder,onMove,onEdit,onRemove,onRenameStart,onRenameCancel,onRenameSave,onDeleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer,onCancelEdit,posFilter, modelByName, pfkSettings: adminSettings };

  return (
    <div style={{minHeight:'100vh',paddingBottom:40}}>
      <div className="pfk-admin-topbar" style={{position:'sticky',top:0,zIndex:100,background:'#080808',borderBottom:'2px solid #FFD700',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <div>
          <div style={{fontWeight:900,fontSize:16,letterSpacing:2,color:'#FFD700'}}>PFK ADMIN</div>
          <div style={{fontSize:12,color:'#888'}}>{session.user.email}{lastUpdated&&' · last published '+new Date(lastUpdated).toLocaleString()}</div>
        </div>
        <div className="pfk-admin-actions" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {adminTab==='rankings' && <a href={(window.location.hostname.includes('dev.')?'':'https://dev.playforkeeps-web.pages.dev')+'/'} target={window.location.hostname.includes('dev.')?'_self':'_blank'} rel="noopener" style={{padding:'8px 14px',background:'transparent',border:'2px solid #10b981',borderRadius:6,color:'#10b981',cursor:'pointer',fontSize:13,fontWeight:900,textDecoration:'none',letterSpacing:1}}>✏️ EDIT ON DEV</a>}
          <button onClick={logout} style={{padding:'8px 12px',background:'transparent',border:'1px solid #555',borderRadius:6,color:'#888',cursor:'pointer',fontSize:14}}>Sign out</button>
        </div>
      </div>
      {publishMsg&&<div style={{padding:'8px 16px',background:publishMsg.startsWith('Error')?'#3a1010':'#103a10',color:publishMsg.startsWith('Error')?'#ef4444':'#10b981',fontSize:14,fontWeight:700}}>{publishMsg}</div>}
      <div style={{display:'flex',gap:0,background:'#080808',borderBottom:'1px solid #222',padding:'0 16px'}}>
        {[['rankings','RANKINGS'],['model','ROOKIE MODEL'],['compare','PFK vs ZOLTY'],['power','POWER RANKINGS']].map(([k,label])=>(
          <button key={k} onClick={()=>setAdminTab(k)} style={{
            padding:'10px 18px', background:'transparent', border:'none',
            borderBottom: adminTab===k ? '2px solid #FFD700' : '2px solid transparent',
            color: adminTab===k ? '#FFD700' : '#666', fontWeight:800, fontSize:13, letterSpacing:1.5, cursor:'pointer',
          }}>{label}</button>
        ))}
      </div>
      {adminTab==='model' ? <RookieModelTab/> : adminTab==='compare' ? <PFKvsZoltyTab officialList={list}/> : adminTab==='power' ? <div style={{padding:'16px'}}><TeamTab/></div> : (<>
      <div style={{padding:'12px 16px',background:'#0a0a0a',borderBottom:'1px solid #222'}}>
        <div style={{fontSize:12,color:'#FFD700',fontWeight:800,letterSpacing:2,marginBottom:8}}>RANKING SET — PICK SETTINGS, EDIT, PUBLISH</div>
        <SettingsToggleBar value={adminSettings} onChange={setAdminSettings}/>
        {adminMissing&&<div style={{fontSize:13,color:'#d97706',marginTop:8}}>⚠ No ranking published for this combo yet. Editing will start from the most recent ranking — hit PUBLISH to create a new set for these settings.</div>}
      </div>
      {showAddPlayer&&(
        <div style={{padding:'12px 16px',background:'#0f0f0f',borderBottom:'1px solid #222',display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 200px',minWidth:140}}>
            <label style={{fontSize:12,color:'#888'}}>NAME</label>
            <input autoFocus value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})} onKeyDown={e=>e.key==='Enter'&&addPlayer()} placeholder="Player name" style={{padding:'8px 10px',background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <label style={{fontSize:12,color:'#888'}}>POS</label>
            <select value={newP.pos} onChange={e=>setNewP({...newP,pos:e.target.value})} style={{padding:'8px 10px',background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}>{['WR','RB','TE','QB'].map(o=><option key={o}>{o}</option>)}</select>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 160px',minWidth:120}}>
            <label style={{fontSize:12,color:'#888'}}>SCHOOL</label>
            <input value={newP.college} onChange={e=>setNewP({...newP,college:e.target.value})} onKeyDown={e=>e.key==='Enter'&&addPlayer()} placeholder="School" style={{padding:'8px 10px',background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
          </div>
          <button onClick={addPlayer} style={{padding:'9px 16px',background:'#FFD700',color:'#000',border:'none',borderRadius:6,fontWeight:900,cursor:'pointer',fontSize:14}}>Add</button>
          <button onClick={()=>setShowAddPlayer(false)} style={{padding:'9px 12px',background:'transparent',border:'1px solid #333',borderRadius:6,color:'#888',cursor:'pointer',fontSize:14}}>Cancel</button>
        </div>
      )}
      <div className="pfk-admin-list pfk-rookie-list" style={{padding:'16px'}}>
        <div style={{padding:'10px 12px',background:'#0f0a00',border:'1px solid #FFD70033',borderRadius:8,marginBottom:12,fontSize:12,color:'#888',lineHeight:1.6}}>
          <span style={{color:'#FFD700',fontWeight:800,letterSpacing:1,marginRight:6}}>READ-ONLY PREVIEW</span>
          This shows the model's auto-tier output for the selected combo — what the dev URL displays before any of your edits.
          <div style={{marginTop:6}}>
            <span style={{color:'#aaa',fontWeight:700}}>To edit & publish:</span> click <span style={{color:'#10b981',fontWeight:800}}>✏️ EDIT ON DEV</span> above. You'll go to the dev URL where you can drag/move/edit and then push to prod.
          </div>
          <div style={{marginTop:4}}>
            <span style={{color:'#aaa',fontWeight:700}}>To change a player's PFK score:</span> use the <span style={{color:'#FFD700',fontWeight:800}}>ROOKIE MODEL</span> tab.
          </div>
        </div>
        <RenderList src={list} allowEdit={false} autoTier={true} {...commonProps}/>
      </div>
      </>)}
    </div>
  );
}

// ============================================================
// DISPERSAL DRAFT — multi-user snake draft for orphaned dynasty teams
// Route: /dispersal (commish setup) | /dispersal/[id] (live draft)
// Storage: dispersal_drafts table in Supabase. Polling-based refresh
// (every 3s while live). Manager identity persisted to localStorage
// per draft (no account needed; passcode-based slot claim).
// ============================================================

const DISP_POOL_TYPES = { PLAYER:'player', PICK:'pick' };
const dispGenPasscode = () => String(Math.floor(1000 + Math.random()*9000));
const dispGenItemId = () => 'i_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

// Snake-aware: given pickIdx + numTeams + pick_order, return the team slot whose turn it is.
const dispSlotForPick = (pickIdx, numTeams, snake, pickOrder) => {
  if(!numTeams || numTeams<1) return null;
  const round = Math.floor(pickIdx / numTeams);
  const posInRound = pickIdx % numTeams;
  const idx = (snake && round % 2 === 1) ? (numTeams - 1 - posInRound) : posInRound;
  return pickOrder[idx];
};

const dispFetch = async (id) => {
  if(!sb) return null;
  const { data, error } = await sb.from('dispersal_drafts').select('*').eq('id', id).maybeSingle();
  if(error){ console.error(error); return null; }
  return data;
};
const dispCreate = async (payload) => {
  if(!sb) return { error:'Supabase not loaded' };
  const { data, error } = await sb.from('dispersal_drafts').insert(payload).select().single();
  return { data, error };
};
const dispUpdate = async (id, patch) => {
  if(!sb) return { error:'Supabase not loaded' };
  const { error } = await sb.from('dispersal_drafts').update({...patch, updated_at:new Date().toISOString()}).eq('id', id);
  return { error };
};

// Sleeper API helpers — public API, no auth needed.
// players/nfl is ~10MB; cached in module scope so repeated imports during one
// session don't re-fetch.
let _sleeperPlayersCache = null;
const sleeperLeague = async (id) => {
  const [league, users, rosters] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${id}`).then(r=>{ if(!r.ok) throw new Error('Sleeper league not found'); return r.json(); }),
    fetch(`https://api.sleeper.app/v1/league/${id}/users`).then(r=>r.json()),
    fetch(`https://api.sleeper.app/v1/league/${id}/rosters`).then(r=>r.json()),
  ]);
  return { league, users, rosters };
};
const sleeperPlayers = async () => {
  if(_sleeperPlayersCache) return _sleeperPlayersCache;
  const data = await fetch('https://api.sleeper.app/v1/players/nfl').then(r=>r.json());
  _sleeperPlayersCache = data;
  return data;
};

// FantasyCalc dynasty values — used to silently sort the dispersal pool by trade value.
// Cached in module scope so the fetch only happens once per page load.
// Returns a map: { bySleeperId: {sleeperId -> value}, byName: {normName -> value} }
let _fcValuesCache = null;
const fetchFcValues = async () => {
  if(_fcValuesCache) return _fcValuesCache;
  try{
    const arr = await fetch('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1').then(r=>r.json());
    const bySleeperId = {}, byName = {};
    (arr||[]).forEach(row => {
      const v = row?.value ?? 0;
      const sid = row?.player?.sleeperId;
      const nm = row?.player?.name;
      if(sid != null) bySleeperId[String(sid)] = v;
      if(nm) byName[normDraftName(nm)] = v;
    });
    _fcValuesCache = { bySleeperId, byName };
  }catch(e){
    _fcValuesCache = { bySleeperId:{}, byName:{} }; // fail silently — pool just falls back to insertion order
  }
  return _fcValuesCache;
};

// ---------- Setup (commish creates a new draft) ----------
function DispersalSetup(){
  const [name,setName] = useState('');
  const [poolText,setPoolText] = useState('');
  const [picksText,setPicksText] = useState('');
  const [teamsText,setTeamsText] = useState('');
  const [snake,setSnake] = useState(true);
  const [timer,setTimer] = useState('off'); // 'off' | '1h' | '2h' | '4h' | '8h'
  const [autoPick,setAutoPick] = useState(false);
  const [creating,setCreating] = useState(false);
  const [createdDraft,setCreatedDraft] = useState(null);
  const [err,setErr] = useState('');
  // Setup mode: 'sleeper' = guided flow that pulls pool + managers from a Sleeper league;
  //              'custom'  = manual paste of pool + managers
  const [setupMode,setSetupMode] = useState('sleeper');
  // Sleeper-flow state
  const [sleeperOpen,setSleeperOpen] = useState(false); // legacy modal (custom-mode shortcut)
  const [sleeperId,setSleeperId] = useState('');
  const [sleeperLoading,setSleeperLoading] = useState(false);
  const [sleeperData,setSleeperData] = useState(null); // {users, rosters}
  const [sleeperSelected,setSleeperSelected] = useState(()=>new Set()); // roster_id values
  const [sleeperUsernames,setSleeperUsernames] = useState({}); // roster_id -> username override
  const [sleeperErr,setSleeperErr] = useState('');
  const [sleeperPlayersLoading,setSleeperPlayersLoading] = useState(false);
  const [sleeperBuilding,setSleeperBuilding] = useState(false);
  const [showTeamsHelp,setShowTeamsHelp] = useState(false);
  const [showModeHelp,setShowModeHelp] = useState(false);
  const [showPicksHelp,setShowPicksHelp] = useState(false);
  // Bulk-add picks ("all managers have own picks" shortcut). When checked, the year
  // toggle pills appear; clicking ADD appends N managers × 4 rounds × |selected years|
  // generic pick lines to the picks textarea.
  const [allHavePicks,setAllHavePicks] = useState(false);
  const [bulkPicksYears,setBulkPicksYears] = useState(()=>new Set([2026,2027,2028,2029]));
  // Share-pool state — for the 📸 SHARE POOL button (commish previews + shares
  // a PFK-branded image of the pool BEFORE creating the draft, to advertise it).
  const poolCardRef = useRef(null);
  const [poolShareBusy,setPoolShareBusy] = useState(false);
  const [previewData,setPreviewData] = useState(null);
  // Desktop share modal — appears after image generation on desktop (mobile uses native share sheet).
  // Holds {blob, filename}; null = modal hidden. Three actions: download / copy to clipboard / share to X.
  const [desktopShare,setDesktopShare] = useState(null);
  const [shareToast,setShareToast] = useState(''); // transient feedback in modal ("Copied!" etc.)
  // League-meta state — surfaced on the share card. Auto-detected from Sleeper in
  // sleeper mode; manually entered in custom mode. Buy-in is always manual.
  const [buyIn,setBuyIn] = useState('');
  const [leagueType,setLeagueType] = useState('Dynasty');         // Dynasty | Redraft
  const [leagueQB,setLeagueQB] = useState('Superflex');           // Superflex | 1QB
  const [leaguePPR,setLeaguePPR] = useState('1.0');               // 0 | 0.5 | 1.0
  const [leagueTEP,setLeagueTEP] = useState('0.5');               // 0 | 0.5 | 0.75 | 1.0
  const [leagueStarters,setLeagueStarters] = useState('');        // free text — "10", "11", etc.
  const [leaguePPC,setLeaguePPC] = useState('');                  // point-per-carry (rare); blank → hide

  const fetchSleeperLeague = async () => {
    setSleeperErr(''); setSleeperData(null);
    if(!sleeperId.trim()){ setSleeperErr('Enter a league ID'); return; }
    setSleeperLoading(true);
    try{
      const data = await sleeperLeague(sleeperId.trim());
      setSleeperData(data);
      // Auto-select rosters with no owner (orphaned)
      const auto = new Set();
      (data.rosters||[]).forEach(r => { if(!r.owner_id) auto.add(r.roster_id); });
      setSleeperSelected(auto);
      // Pre-fill default usernames per roster (display_name or "Team N")
      const usersById = {}; (data.users||[]).forEach(u=>{ usersById[u.user_id]=u; });
      const defaults = {};
      (data.rosters||[]).forEach(r => {
        const u = r.owner_id ? usersById[r.owner_id] : null;
        defaults[r.roster_id] = u?.display_name || u?.username || `Team ${r.roster_id}`;
      });
      setSleeperUsernames(defaults);
      // Auto-populate the draft name from the Sleeper league name (only if commish hasn't typed one yet)
      if(data.league?.name && !name.trim()) setName(`${data.league.name} Dispersal`);
      // Auto-detect league settings for the share card (commish can override via UI).
      // IMPORTANT: dropdown <option> values use "1.0" / "0.5" string format. Sleeper
      // returns scoring values as JS numbers — JSON.parse turns 1.0 into 1 (integer)
      // since they're numerically equal. So String(1) === "1" wouldn't match the
      // "1.0" option → dropdown silently falls back to first option ("0 PPR").
      // normalizeNumStr forces integer values to render as "X.0" so they match.
      const normalizeNumStr = (n) => {
        const num = parseFloat(n);
        if(isNaN(num)) return '0';
        if(num === 0) return '0';
        if(Number.isInteger(num)) return num + '.0';
        return String(num);
      };
      const lg = data.league || {};
      const ss = lg.scoring_settings || {};
      const rp = lg.roster_positions || [];
      const settings = lg.settings || {};
      // type: 0=redraft, 1=keeper, 2=dynasty
      setLeagueType(settings.type === 2 ? 'Dynasty' : settings.type === 1 ? 'Keeper' : 'Redraft');
      setLeagueQB(rp.includes('SUPER_FLEX') ? 'Superflex' : '1QB');
      setLeaguePPR(normalizeNumStr(ss.rec ?? 0));
      setLeagueTEP(normalizeNumStr(ss.bonus_rec_te ?? 0));
      // Starters = roster slots not in BN/IR/TAXI
      const skip = new Set(['BN','IR','TAXI']);
      const starters = rp.filter(p => !skip.has(p)).length;
      if(starters > 0) setLeagueStarters(String(starters));
      // Point per carry: rush_att in scoring_settings (rare scoring rule)
      const ppc = ss.rush_att ?? 0;
      setLeaguePPC(ppc ? String(ppc) : '');
    }catch(e){ setSleeperErr(e.message || 'Fetch failed'); }
    finally{ setSleeperLoading(false); }
  };

  // Sleeper-mode draft creation: builds pool + teams in one shot from selected rosters.
  const createFromSleeper = async () => {
    setErr('');
    if(!name.trim()){ setErr('Draft name required'); return; }
    if(!sleeperData){ setErr('Fetch a Sleeper league first'); return; }
    if(sleeperSelected.size < 2){ setErr('Select at least 2 teams'); return; }
    setSleeperBuilding(true);
    try{
      const players = await sleeperPlayers();
      const selectedRosters = (sleeperData.rosters||[]).filter(r=>sleeperSelected.has(r.roster_id));
      // Build pool from selected rosters' player IDs
      const poolItems = [];
      const seenPlayerIds = new Set();
      selectedRosters.forEach(r => {
        (r.players||[]).forEach(pid => {
          if(seenPlayerIds.has(pid)) return; seenPlayerIds.add(pid);
          const p = players[pid];
          if(!p) return;
          const fullName = p.full_name || `${p.first_name||''} ${p.last_name||''}`.trim() || pid;
          const pos = p.position || '';
          poolItems.push({ id:dispGenItemId(), type:DISP_POOL_TYPES.PLAYER, name: pos ? `${fullName} (${pos})` : fullName, sleeperId:String(pid) });
        });
      });
      // Append manual future picks
      const futurePicks = picksText.split('\n').map(s=>s.trim()).filter(Boolean);
      futurePicks.forEach(n => poolItems.push({ id:dispGenItemId(), type:DISP_POOL_TYPES.PICK, name:n }));
      if(!poolItems.length){ setErr('No players found in selected rosters'); setSleeperBuilding(false); return; }
      // Build managers list — preserve roster order from selectedRosters
      const teams = selectedRosters.map((r,i)=>({
        slot:i,
        username:(sleeperUsernames[r.roster_id] || `Team ${r.roster_id}`).trim(),
        passcode:'',
        joined:false,
      }));
      const order = teams.map((_,i)=>i);
      const timerSeconds = timer==='30m' ? 30*60 : timer==='1h' ? 3600 : timer==='2h' ? 2*3600 : timer==='4h' ? 4*3600 : timer==='8h' ? 8*3600 : null;
      setCreating(true);
      const { data, error } = await dispCreate({
        name:name.trim(), snake, timer_seconds:timerSeconds, auto_pick:autoPick,
        pool:poolItems, teams, pick_order:order, picks:[],
        current_pick_idx:0, status:'ready',
      });
      setCreating(false);
      if(error){ setErr(error.message || 'Create failed'); return; }
      try{ localStorage.setItem('pfk_disp_creator_'+data.id, '1'); }catch(e){}
      window.location.href = '/dispersal/' + data.id;
    }catch(e){ setErr(e.message || 'Build failed'); }
    finally{ setSleeperBuilding(false); }
  };

  const importSelected = async () => {
    if(!sleeperData || sleeperSelected.size===0){ setSleeperErr('Pick at least one team'); return; }
    setSleeperPlayersLoading(true);
    try{
      const players = await sleeperPlayers();
      // Pull player IDs from selected rosters
      const playerIds = new Set();
      (sleeperData.rosters||[]).forEach(r => {
        if(!sleeperSelected.has(r.roster_id)) return;
        (r.players||[]).forEach(pid => playerIds.add(pid));
      });
      // Resolve to "First Last (POS)" — sortable, readable
      const lines = [];
      playerIds.forEach(pid => {
        const p = players[pid];
        if(!p) return;
        const fullName = p.full_name || `${p.first_name||''} ${p.last_name||''}`.trim() || pid;
        const pos = p.position || '';
        lines.push(pos ? `${fullName} (${pos})` : fullName);
      });
      lines.sort();
      // Append (de-duped) to existing pool textarea
      const existing = new Set(poolText.split('\n').map(s=>s.trim()).filter(Boolean));
      const merged = [...existing, ...lines.filter(l=>!existing.has(l))];
      setPoolText(merged.join('\n'));
      setSleeperOpen(false);
    }catch(e){ setSleeperErr(e.message || 'Player lookup failed'); }
    finally{ setSleeperPlayersLoading(false); }
  };

  const create = async () => {
    setErr('');
    if(!name.trim()){ setErr('Name required'); return; }
    const players = poolText.split('\n').map(s=>s.trim()).filter(Boolean);
    const futurePicks = picksText.split('\n').map(s=>s.trim()).filter(Boolean);
    const usernames = teamsText.split('\n').map(s=>s.trim()).filter(Boolean);
    if(players.length === 0 && futurePicks.length === 0){ setErr('Pool is empty — paste players and/or future picks'); return; }
    if(usernames.length < 2){ setErr('Need at least 2 teams'); return; }
    const pool = [
      ...players.map(n => ({ id:dispGenItemId(), type:DISP_POOL_TYPES.PLAYER, name:n })),
      ...futurePicks.map(n => ({ id:dispGenItemId(), type:DISP_POOL_TYPES.PICK, name:n })),
    ];
    // Pick order = order in the textarea (commish controls this — see Randomize button).
    const order = usernames.map((_,i)=>i);
    const teams = usernames.map((u,i)=>({ slot:i, username:u, passcode:'', joined:false }));
    const timerSeconds = timer==='30m' ? 30*60 : timer==='1h' ? 3600 : timer==='2h' ? 2*3600 : timer==='4h' ? 4*3600 : timer==='8h' ? 8*3600 : null;
    setCreating(true);
    const { data, error } = await dispCreate({
      name:name.trim(), snake, timer_seconds:timerSeconds,
      pool, teams, pick_order:order, picks:[],
      current_pick_idx:0, status:'ready',
    });
    setCreating(false);
    if(error){ setErr(error.message || 'Create failed'); return; }
    // Mark creator as commish in localStorage and drop them into the draft room
    try{ localStorage.setItem('pfk_disp_creator_'+data.id, '1'); }catch(e){}
    window.location.href = '/dispersal/' + data.id;
  };

  // (success screen removed — commish is redirected straight to /dispersal/[id] after create)

  // Build the pool data needed for the share-card from current setup state.
  // Returns { players, picks, teamCount, draftName, snake } or null if there's nothing to render.
  // Used by the 📸 SHARE POOL preview/share flow on this setup page.
  const buildPreviewPool = async () => {
    const draftName = name.trim() || 'Dispersal Draft';
    const pickLines = picksText.split('\n').map(s=>s.trim()).filter(Boolean);
    let players = [];
    // managersNeeded = how many of the selected rosters actually need a new manager.
    // Sleeper mode: count of selected rosters where original owner_id is null/undefined
    //   (same orphan signal we use for auto-selection on FETCH).
    // Custom mode: total team count — there's no orphan distinction so all are "needed".
    let managersNeeded = 0;
    if(setupMode === 'sleeper'){
      if(!sleeperData || sleeperSelected.size === 0) return null;
      const playersDb = await sleeperPlayers();
      const selectedRosters = (sleeperData.rosters||[]).filter(r=>sleeperSelected.has(r.roster_id));
      const seen = new Set();
      selectedRosters.forEach(r => {
        (r.players||[]).forEach(pid => {
          if(seen.has(pid)) return; seen.add(pid);
          const p = playersDb[pid];
          if(!p) return;
          const fullName = p.full_name || `${p.first_name||''} ${p.last_name||''}`.trim() || pid;
          const pos = (p.position || '').toUpperCase();
          players.push({ id:'p_'+pid, name: pos ? `${fullName} (${pos})` : fullName, sleeperId:String(pid), pos });
        });
      });
      managersNeeded = selectedRosters.filter(r => !r.owner_id).length;
    } else {
      const lines = poolText.split('\n').map(s=>s.trim()).filter(Boolean);
      players = lines.map((n,i) => {
        const m = n.match(/\(([^)]+)\)\s*$/);
        const pos = m ? m[1].toUpperCase() : '';
        return { id:'p_c_'+i, name:n, pos };
      });
      managersNeeded = teamsText.split('\n').map(s=>s.trim()).filter(Boolean).length;
    }
    if(players.length === 0 && pickLines.length === 0) return null;
    // Sort players by FantasyCalc value within position
    const fc = await fetchFcValues();
    const valOf = (it) => {
      if(it.sleeperId && fc.bySleeperId[it.sleeperId] != null) return fc.bySleeperId[it.sleeperId];
      const stripped = (it.name || '').replace(/\s*\([^)]*\)\s*$/, '');
      const k = normDraftName(stripped);
      return fc.byName[k] != null ? fc.byName[k] : 0;
    };
    const POS_ORDER = ['QB','RB','WR','TE','K','DEF'];
    const playersByPos = {};
    POS_ORDER.forEach(p => { playersByPos[p] = []; });
    playersByPos.OTHER = [];
    players.forEach(it => {
      const bucket = POS_ORDER.includes(it.pos) ? it.pos : 'OTHER';
      playersByPos[bucket].push(it);
    });
    Object.keys(playersByPos).forEach(p => playersByPos[p].sort((a,b)=>valOf(b)-valOf(a)));
    // Sort picks by year, then round
    const picks = pickLines.map((n,i) => ({ id:'pk_'+i, name:n }));
    const parsePick = (n) => {
      const yM = (n||'').match(/(\d{4})/);
      const rM = (n||'').match(/(\d)(st|nd|rd|th)/i);
      return { year: yM?+yM[1]:9999, round: rM?+rM[1]:9 };
    };
    picks.sort((a,b)=>{
      const pa = parsePick(a.name), pb = parsePick(b.name);
      return pa.year - pb.year || pa.round - pb.round;
    });
    // Build the settings string for the share card. Format example:
    //   "DYNASTY · SUPERFLEX · 1.0 PPR · 0.5 TEP · START 10"
    // PPC is appended only when present (rare scoring rule).
    const settingsParts = [
      (leagueType||'').toUpperCase(),
      (leagueQB||'').toUpperCase(),
      `${leaguePPR||0} PPR`,
      `${leagueTEP||0} TEP`,
    ];
    if(leagueStarters && leagueStarters.trim()) settingsParts.push(`START ${leagueStarters.trim()}`);
    if(leaguePPC && parseFloat(leaguePPC) > 0) settingsParts.push(`${leaguePPC} PPC`);
    const settingsLine = settingsParts.filter(Boolean).join(' · ');
    return {
      draftName, players, playersByPos, picks, managersNeeded, posOrder: POS_ORDER,
      buyIn: (buyIn||'').trim(), settingsLine,
    };
  };

  const stripPosFromName = (n) => (n || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

  // 📸 SHARE POOL — builds preview data, renders the off-screen card, then captures
  // and saves/shares via Web Share API on mobile / download fallback on desktop.
  const sharePoolImage = async () => {
    if(!window.html2canvas){ alert('Screenshot library not loaded yet — refresh and try again.'); return; }
    setPoolShareBusy(true);
    try{
      const data = await buildPreviewPool();
      if(!data){
        alert(setupMode==='sleeper'
          ? 'Fetch a Sleeper league and select at least one team first.'
          : 'Add players and/or future picks to the pool first.');
        return;
      }
      setPreviewData(data);
      // Wait two animation frames so React commits the offscreen card before we capture.
      await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));
      const el = poolCardRef.current;
      if(!el){ alert('Preview card not ready — try again.'); return; }
      const canvas = await window.html2canvas(el, { backgroundColor:'#080808', scale:2, useCORS:true });
      const filename = `${data.draftName.replace(/[^a-z0-9]/gi,'_')}_pool.png`;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      // Mobile: native share sheet (Photos, Messages, X, Discord, etc.) — works perfectly.
      // Desktop: pop a small modal with three options (download / copy / share to X).
      const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
      if(isMobile && blob && navigator.canShare){
        const file = new File([blob], filename, { type:'image/png' });
        if(navigator.canShare({ files:[file] })){
          try{
            await navigator.share({ files:[file], title:`${data.draftName} — pool` });
            return;
          }catch(e){ if(e && e.name==='AbortError') return; }
        }
      }
      // Mobile fallback (no Web Share API): download via anchor.
      if(isMobile){
        const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if(blob) setTimeout(()=>URL.revokeObjectURL(url), 1000);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if(isIOS && !navigator.canShare){
          window.open(canvas.toDataURL('image/png'), '_blank');
        }
        return;
      }
      // Desktop: stash blob + filename and show the share modal so user picks an action.
      if(blob){
        setShareToast('');
        setDesktopShare({ blob, filename, draftName: data.draftName });
      }
    }catch(e){ alert('Share pool failed: ' + (e.message||e)); }
    finally{ setPoolShareBusy(false); }
  };

  const inputStyle = {width:'100%',padding:'10px 12px',background:'#0a0a0a',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:14,fontFamily:'inherit'};
  const labelStyle = {fontSize:11,color:'#888',fontWeight:800,letterSpacing:1.5,marginBottom:6,display:'block'};
  const selectStyle = {flex:'1 1 110px',padding:'8px 10px',background:'#0a0a0a',border:'1px solid #333',borderRadius:6,color:'#FFD700',fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer'};

  // Shared "league info on share image" block — shown in both Sleeper and Custom modes.
  // Defined as a JSX value (NOT a child component) so React reconciles it instead of
  // remounting on every parent render — that remount was unmounting the buy-in input
  // mid-keystroke and stealing focus after every character.
  const leagueInfoInputs = (
    <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:10,padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{fontSize:11,color:'#FFD700',fontWeight:800,letterSpacing:1.5}}>📸 SHOWN ON THE "SHARE DISPERSAL" IMAGE</div>
      <div>
        <label style={{...labelStyle,marginBottom:5}}>LEAGUE BUY-IN</label>
        <input value={buyIn} onChange={e=>setBuyIn(e.target.value)} placeholder="e.g. 250  /  FREE  /  $50 + entry trade" style={inputStyle}/>
      </div>
      <div>
        <label style={{...labelStyle,marginBottom:5}}>LEAGUE SETTINGS{setupMode==='sleeper' && sleeperData && <span style={{color:'#10b981',fontWeight:700,marginLeft:8,letterSpacing:0.5,textTransform:'none'}}>· auto-filled, edit if needed</span>}</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          <select value={leagueType} onChange={e=>setLeagueType(e.target.value)} style={selectStyle}>
            <option value="Dynasty">Dynasty</option>
            <option value="Keeper">Keeper</option>
            <option value="Redraft">Redraft</option>
          </select>
          <select value={leagueQB} onChange={e=>setLeagueQB(e.target.value)} style={selectStyle}>
            <option value="Superflex">Superflex</option>
            <option value="1QB">1QB</option>
          </select>
          <select value={leaguePPR} onChange={e=>setLeaguePPR(e.target.value)} style={selectStyle}>
            <option value="0">0 PPR</option>
            <option value="0.5">0.5 PPR</option>
            <option value="1.0">1.0 PPR</option>
          </select>
          <select value={leagueTEP} onChange={e=>setLeagueTEP(e.target.value)} style={selectStyle}>
            <option value="0">0 TEP</option>
            <option value="0.5">0.5 TEP</option>
            <option value="0.75">0.75 TEP</option>
            <option value="1.0">1.0 TEP</option>
            <option value="1.5">1.5 TEP</option>
          </select>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>
          <div style={{flex:'1 1 130px'}}>
            <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginBottom:4}}>STARTING LINEUP SIZE</div>
            <input value={leagueStarters} onChange={e=>setLeagueStarters(e.target.value)} placeholder="e.g. 10" style={inputStyle}/>
          </div>
          <div style={{flex:'1 1 130px'}}>
            <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginBottom:4}}>POINT PER CARRY</div>
            <input value={leaguePPC} onChange={e=>setLeaguePPC(e.target.value)} placeholder="leave blank if none" style={inputStyle}/>
          </div>
        </div>
      </div>
    </div>
  );

  // Year-pick dropdowns above the future picks textarea. In Sleeper mode the
  // options include "via {username}" for every Sleeper user; in Custom mode the
  // option is "via" (no username) and commish types it after.
  const PICK_YEARS = [2026, 2027, 2028, 2029];
  const PICK_ROUNDS = [['1st','1st'],['2nd','2nd'],['3rd','3rd'],['4th','4th']];
  const usernamesForDropdowns = (() => {
    if(setupMode==='sleeper'){
      return (sleeperData?.users||[]).map(u => (u.display_name || u.username || '').trim()).filter(Boolean);
    }
    return teamsText.split('\n').map(s=>s.trim()).filter(Boolean);
  })();
  const addPickFromDropdown = (line) => {
    setPicksText(prev => (prev ? prev.replace(/\n+$/,'') + '\n' : '') + line);
  };
  // Manager count for the "all managers have own picks" bulk-add. Sleeper mode uses
  // the count of selected rosters; custom mode uses the count of typed usernames.
  const managerCountForBulk = setupMode === 'sleeper'
    ? sleeperSelected.size
    : teamsText.split('\n').map(s=>s.trim()).filter(Boolean).length;
  const bulkPicksTotal = managerCountForBulk * 4 * bulkPicksYears.size;
  const toggleBulkYear = (y) => {
    setBulkPicksYears(prev => {
      const next = new Set(prev);
      if(next.has(y)) next.delete(y); else next.add(y);
      return next;
    });
  };
  const applyBulkPicks = () => {
    if(managerCountForBulk === 0 || bulkPicksYears.size === 0) return;
    const lines = [];
    const years = Array.from(bulkPicksYears).sort();
    years.forEach(y => {
      PICK_ROUNDS.forEach(([rk,rl]) => {
        for(let i=0;i<managerCountForBulk;i++){
          lines.push(`${y} ${rl}`);
        }
      });
    });
    setPicksText(prev => (prev ? prev.replace(/\n+$/,'') + '\n' : '') + lines.join('\n'));
    setAllHavePicks(false); // collapse the controls so commish doesn't double-fire
  };
  // Bulk-picks controls UI — defined as a JSX value (not a Component) so React
  // reconciles in place. (Same lesson as the leagueInfoInputs focus-loss fix.)
  const bulkPicksControls = (
    <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,padding:'10px 12px',marginBottom:8}}>
      <label style={{display:'flex',alignItems:'center',gap:9,cursor:'pointer',fontSize:13,color:'#ddd',fontWeight:700}}>
        <input type="checkbox" checked={allHavePicks} onChange={e=>setAllHavePicks(e.target.checked)} style={{width:16,height:16,accentColor:'#FFD700',cursor:'pointer'}}/>
        🪄 All managers have their own future picks
      </label>
      {allHavePicks && (
        <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #1e1e1e'}}>
          <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginBottom:6}}>SELECT YEARS · {bulkPicksYears.size} of {PICK_YEARS.length}</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
            {PICK_YEARS.map(y => {
              const sel = bulkPicksYears.has(y);
              return (
                <button key={y} type="button" onClick={()=>toggleBulkYear(y)} style={{padding:'6px 14px',background:sel?'#FFD700':'#0a0a0a',color:sel?'#000':'#888',border:'1px solid '+(sel?'#FFD700':'#333'),borderRadius:14,fontWeight:800,cursor:'pointer',fontSize:13,letterSpacing:0.5}}>{sel?'✓ ':''}{y}</button>
              );
            })}
          </div>
          <button type="button" onClick={applyBulkPicks} disabled={managerCountForBulk===0 || bulkPicksYears.size===0}
            style={{width:'100%',padding:'10px 14px',background:(managerCountForBulk===0||bulkPicksYears.size===0)?'#222':'#10b981',border:'none',borderRadius:6,color:(managerCountForBulk===0||bulkPicksYears.size===0)?'#666':'#000',fontWeight:900,cursor:(managerCountForBulk===0||bulkPicksYears.size===0)?'default':'pointer',fontSize:13,letterSpacing:1}}>
            {managerCountForBulk===0
              ? (setupMode==='sleeper' ? 'SELECT MANAGERS FIRST' : 'TYPE MANAGER USERNAMES FIRST')
              : bulkPicksYears.size===0
                ? 'PICK AT LEAST ONE YEAR'
                : `🪄 ADD ${bulkPicksTotal} PICKS  ·  ${managerCountForBulk} mgrs × 4 rounds × ${bulkPicksYears.size} ${bulkPicksYears.size===1?'year':'years'}`}
          </button>
          <div style={{fontSize:11,color:'#666',marginTop:6,textAlign:'center'}}>Picks are appended to the textarea below — your existing entries stay.</div>
        </div>
      )}
    </div>
  );
  const PickYearDropdowns = () => (
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
      {PICK_YEARS.map(y => (
        <select key={y} value="" onChange={e=>{ if(e.target.value){ addPickFromDropdown(e.target.value); e.target.value=''; } }}
          style={{flex:'1 1 130px',padding:'7px 9px',background:'#0a0a0a',border:'1px solid #333',borderRadius:6,color:'#FFD700',fontSize:12,fontWeight:700,cursor:'pointer'}}>
          <option value="">+ Add {y} pick</option>
          {setupMode==='sleeper'
            ? PICK_ROUNDS.flatMap(([rk,rl]) => [
                <option key={`${rk}-generic`} value={`${y} ${rl}`}>{y} {rl}</option>,
                ...usernamesForDropdowns.map(u => (
                  <option key={`${rk}-${u}`} value={`${y} ${rl} via ${u}`}>{rl} via {u}</option>
                ))
              ])
            : PICK_ROUNDS.flatMap(([rk,rl]) => [
                <option key={`${rk}-generic`} value={`${y} ${rl}`}>{y} {rl}</option>,
                <option key={rk} value={`${y} ${rl} via `}>{rl} via</option>
              ])
          }
        </select>
      ))}
    </div>
  );

  return (
    <div style={{maxWidth:760,margin:'24px auto',padding:'20px',color:'#eee'}}>
      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}>
        <div style={{fontSize:24,fontWeight:900,color:'#FFD700',letterSpacing:2}}>🎲 DISPERSAL DRAFT</div>
      </div>
      <div style={{fontSize:13,color:'#888',marginBottom:18,lineHeight:1.6}}>Set up a snake dispersal draft. Pool the rosters and picks of the teams that are re-drafting, share the link with the new managers, and they each draft on their own device.</div>

      {/* Mode selector */}
      <div style={{marginBottom:18}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,gap:8,flexWrap:'wrap'}}>
          <div style={{fontSize:11,color:'#888',fontWeight:800,letterSpacing:1.5}}>HOW DO YOU WANT TO BUILD THE POOL?</div>
          <button type="button" onClick={()=>setShowModeHelp(v=>!v)} style={{padding:'2px 8px',background:'transparent',border:'1px solid #FFD70055',borderRadius:12,color:'#FFD700',cursor:'pointer',fontSize:11,fontWeight:800}}>ⓘ {showModeHelp?'hide':'which mode should I pick?'}</button>
        </div>
        {showModeHelp && (
          <div style={{background:'#0f0a00',border:'1px solid #FFD70055',borderRadius:8,padding:'12px 14px',marginBottom:10,fontSize:12,color:'#ddd',lineHeight:1.6}}>
            <div style={{marginBottom:6}}><strong style={{color:'#FFD700'}}>📥 SLEEPER LEAGUE ID</strong> — Fastest. Paste your Sleeper league ID and we'll auto-pull every team's roster + manager name. Pick the new managers to disperse and you're done. Best for active Sleeper leagues.</div>
            <div><strong style={{color:'#FFD700'}}>✏️ CUSTOM</strong> — For non-Sleeper leagues (ESPN, Yahoo, MFL, etc.) or custom scenarios. Paste your player pool and manager usernames yourself. More work but works for any league.</div>
          </div>
        )}
        <div style={{display:'flex',gap:8,padding:6,background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:10}}>
          <button onClick={()=>setSetupMode('sleeper')} style={{flex:1,padding:'10px 14px',background:setupMode==='sleeper'?'#FFD700':'transparent',border:'none',borderRadius:7,color:setupMode==='sleeper'?'#000':'#888',fontWeight:900,cursor:'pointer',fontSize:13,letterSpacing:1}}>📥 SLEEPER LEAGUE ID</button>
          <button onClick={()=>setSetupMode('custom')} style={{flex:1,padding:'10px 14px',background:setupMode==='custom'?'#FFD700':'transparent',border:'none',borderRadius:7,color:setupMode==='custom'?'#000':'#888',fontWeight:900,cursor:'pointer',fontSize:13,letterSpacing:1}}>✏️ CUSTOM</button>
        </div>
      </div>

      {setupMode==='sleeper' && (
        <div style={{display:'flex',flexDirection:'column',gap:18,background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:'22px 24px'}}>
          {leagueInfoInputs}
          {/* SHARE DISPERSAL button — sits between league info and Sleeper League ID so
              the commish can advertise the dispersal BEFORE creating the draft. */}
          <button onClick={sharePoolImage} disabled={poolShareBusy||!sleeperData||sleeperSelected.size===0} title="Save a PFK-branded image of the pool to advertise the league on Twitter/Discord BEFORE creating the draft" style={{padding:'14px 20px',background:(poolShareBusy||!sleeperData||sleeperSelected.size===0)?'#222':'transparent',border:'1.5px solid '+((poolShareBusy||!sleeperData||sleeperSelected.size===0)?'#444':'#FFD700'),borderRadius:8,color:(poolShareBusy||!sleeperData||sleeperSelected.size===0)?'#666':'#FFD700',fontWeight:900,cursor:(poolShareBusy||!sleeperData||sleeperSelected.size===0)?'default':'pointer',fontSize:13,letterSpacing:1.5}}>{poolShareBusy?'BUILDING IMAGE…':'📸 SHARE DISPERSAL'}</button>
          <div>
            <label style={labelStyle}>SLEEPER LEAGUE ID</label>
            <div style={{display:'flex',gap:8}}>
              <input value={sleeperId} onChange={e=>setSleeperId(e.target.value)} onKeyDown={e=>e.key==='Enter'&&fetchSleeperLeague()} placeholder="e.g. 1042739852394871234" style={{...inputStyle,fontFamily:'monospace'}}/>
              <button type="button" onClick={fetchSleeperLeague} disabled={sleeperLoading} style={{padding:'10px 18px',background:sleeperLoading?'#444':'#FFD700',border:'none',borderRadius:6,color:'#000',fontWeight:900,cursor:sleeperLoading?'default':'pointer',fontSize:13,letterSpacing:1,whiteSpace:'nowrap'}}>{sleeperLoading?'…':'FETCH'}</button>
            </div>
            <div style={{fontSize:11,color:'#666',marginTop:5}}>Long number from <code style={{color:'#FFD700'}}>sleeper.com/leagues/&lt;id&gt;</code></div>
          </div>
          <div>
            <label style={labelStyle}>DRAFT NAME</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Big Money League — Spring 2026 Disperse" style={inputStyle}/>
          </div>
          {sleeperErr && <div style={{padding:'10px 14px',background:'#3a1010',border:'1px solid #ef4444',borderRadius:6,color:'#ef4444',fontSize:13}}>{sleeperErr}</div>}
          {sleeperData && (()=>{
            const usersById = {}; (sleeperData.users||[]).forEach(u=>{ usersById[u.user_id]=u; });
            return (
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
                  <label style={{...labelStyle,marginBottom:0}}>CHOOSE TEAMS & ROSTERS TO INCLUDE · {sleeperSelected.size} of {(sleeperData.rosters||[]).length} selected</label>
                  <button type="button" onClick={()=>setShowTeamsHelp(v=>!v)} title="What does this do?" style={{padding:'2px 8px',background:'transparent',border:'1px solid #FFD70055',borderRadius:12,color:'#FFD700',cursor:'pointer',fontSize:11,fontWeight:800}}>ⓘ {showTeamsHelp?'hide':'what is this?'}</button>
                </div>
                {showTeamsHelp && (
                  <div style={{background:'#0f0a00',border:'1px solid #FFD70055',borderRadius:8,padding:'12px 14px',marginBottom:8,fontSize:12,color:'#ddd',lineHeight:1.6}}>
                    Every team you check below will be part of the dispersal. Their entire current roster goes into the draft pool. After you create the draft, share the link with the league and each manager clicks CLAIM next to their team.
                  </div>
                )}
                <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:340,overflowY:'auto',border:'1px solid #222',borderRadius:8,padding:8}}>
                  {(sleeperData.rosters||[]).map(r=>{
                    const owner = r.owner_id ? usersById[r.owner_id] : null;
                    const sel = sleeperSelected.has(r.roster_id);
                    const orphan = !r.owner_id;
                    const playerCount = (r.players||[]).length;
                    return (
                      <div key={r.roster_id} style={{padding:'8px 10px',background:sel?'#0a2a1a':'#0a0a0a',border:'1px solid '+(sel?'#10b981':'#222'),borderRadius:6,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                        <span onClick={()=>{
                          const next = new Set(sleeperSelected);
                          if(sel) next.delete(r.roster_id); else next.add(r.roster_id);
                          setSleeperSelected(next);
                        }} style={{color:sel?'#10b981':'#666',fontSize:18,cursor:'pointer',userSelect:'none'}}>{sel?'☑':'☐'}</span>
                        <div style={{flex:'1 1 130px',minWidth:120}}>
                          <input value={sleeperUsernames[r.roster_id]||''} onChange={e=>setSleeperUsernames({...sleeperUsernames,[r.roster_id]:e.target.value})} disabled={!sel} placeholder="manager username" style={{width:'100%',padding:'5px 8px',background:'#000',border:'1px solid '+(sel?'#FFD700':'#222'),borderRadius:5,color:sel?'#FFD700':'#666',fontSize:13,fontWeight:700}}/>
                          <div style={{fontSize:10,color:'#666',marginTop:3}}>{playerCount} players · roster #{r.roster_id} {orphan && <span style={{color:'#f59e0b',fontWeight:800,marginLeft:4}}>· ORPHAN</span>} {owner && <span>· originally {owner.display_name||owner.username}</span>}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{fontSize:11,color:'#666',marginTop:6}}>Tip: edit the username next to any team before creating — that's what shows up in the draft.</div>
              </div>
            );
          })()}
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,gap:8,flexWrap:'wrap'}}>
              <label style={{...labelStyle,marginBottom:0}}>FUTURE PICKS (optional)</label>
              <button type="button" onClick={()=>setShowPicksHelp(v=>!v)} style={{padding:'2px 8px',background:'transparent',border:'1px solid #FFD70055',borderRadius:12,color:'#FFD700',cursor:'pointer',fontSize:11,fontWeight:800}}>ⓘ {showPicksHelp?'hide':'what goes here?'}</button>
            </div>
            {showPicksHelp && (
              <div style={{background:'#0f0a00',border:'1px solid #FFD70055',borderRadius:8,padding:'12px 14px',marginBottom:8,fontSize:12,color:'#ddd',lineHeight:1.6}}>
                Sleeper doesn't track future picks reliably, so add them here manually. These get pooled alongside the players and can be drafted just like any other asset.
                <div style={{marginTop:6,color:'#aaa'}}>Use the year dropdowns to add draft picks fast.</div>
              </div>
            )}
            {bulkPicksControls}
            <PickYearDropdowns/>
            <textarea value={picksText} onChange={e=>setPicksText(e.target.value)} placeholder={`Click a year dropdown above to add a pick`} rows={4} style={{...inputStyle,fontFamily:'monospace',resize:'vertical'}}/>
          </div>
          <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
            <div>
              <label style={labelStyle}>FORMAT</label>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>setSnake(true)} style={{padding:'8px 14px',background:snake?'#FFD700':'#0a0a0a',color:snake?'#000':'#888',border:'1px solid '+(snake?'#FFD700':'#333'),borderRadius:6,fontWeight:800,cursor:'pointer',fontSize:13}}>🐍 Snake</button>
                <button onClick={()=>setSnake(false)} style={{padding:'8px 14px',background:!snake?'#FFD700':'#0a0a0a',color:!snake?'#000':'#888',border:'1px solid '+(!snake?'#FFD700':'#333'),borderRadius:6,fontWeight:800,cursor:'pointer',fontSize:13}}>↓ Linear</button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>TIMER PER PICK</label>
              <select value={timer} onChange={e=>setTimer(e.target.value)} style={{padding:'8px 12px',background:'#0a0a0a',border:'1px solid #333',borderRadius:6,color:'#FFD700',fontSize:13,fontWeight:800,cursor:'pointer',minWidth:160}}>
                <option value="off">None (no clock)</option>
                <option value="30m">30 minutes</option>
                <option value="1h">1 hour</option>
                <option value="2h">2 hours</option>
                <option value="4h">4 hours</option>
                <option value="8h">8 hours</option>
              </select>
              {timer !== 'off' && (
                <label style={{display:'flex',alignItems:'center',gap:8,marginTop:8,fontSize:12,color:'#aaa',cursor:'pointer'}}>
                  <input type="checkbox" checked={autoPick} onChange={e=>setAutoPick(e.target.checked)} style={{width:16,height:16,accentColor:'#10b981'}}/>
                  Auto-pick best available if a manager misses their pick
                </label>
              )}
              {timer !== 'off' && !autoPick && <div style={{fontSize:11,color:'#666',marginTop:5}}>When a pick clock expires, the draft pauses for the commish to advance.</div>}
            </div>
          </div>
          {err && <div style={{padding:'10px 14px',background:'#3a1010',border:'1px solid #ef4444',borderRadius:6,color:'#ef4444',fontSize:13}}>{err}</div>}
          <button onClick={createFromSleeper} disabled={creating||sleeperBuilding||!sleeperData||sleeperSelected.size<2} style={{padding:'14px 24px',background:(creating||sleeperBuilding||!sleeperData||sleeperSelected.size<2)?'#444':'#10b981',border:'none',borderRadius:8,color:'#000',fontWeight:900,cursor:(creating||sleeperBuilding||!sleeperData||sleeperSelected.size<2)?'default':'pointer',fontSize:14,letterSpacing:1.5}}>{sleeperBuilding?'BUILDING POOL FROM SLEEPER…':creating?'CREATING…':'CREATE DRAFT'}</button>
        </div>
      )}

      {setupMode==='custom' && (
      <div style={{display:'flex',flexDirection:'column',gap:18,background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:'22px 24px'}}>
        {leagueInfoInputs}
        {/* SHARE DISPERSAL button — sits between league info and the rest of the form
            so the commish can advertise the dispersal BEFORE creating the draft. */}
        <button onClick={sharePoolImage} disabled={poolShareBusy||(!poolText.trim()&&!picksText.trim())} title="Save a PFK-branded image of the pool to advertise the league on Twitter/Discord BEFORE creating the draft" style={{padding:'14px 20px',background:(poolShareBusy||(!poolText.trim()&&!picksText.trim()))?'#222':'transparent',border:'1.5px solid '+((poolShareBusy||(!poolText.trim()&&!picksText.trim()))?'#444':'#FFD700'),borderRadius:8,color:(poolShareBusy||(!poolText.trim()&&!picksText.trim()))?'#666':'#FFD700',fontWeight:900,cursor:(poolShareBusy||(!poolText.trim()&&!picksText.trim()))?'default':'pointer',fontSize:13,letterSpacing:1.5}}>{poolShareBusy?'BUILDING IMAGE…':'📸 SHARE DISPERSAL'}</button>
        <div>
          <label style={labelStyle}>DRAFT NAME</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Big Money League — Spring 2026 Disperse" style={inputStyle}/>
        </div>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,flexWrap:'wrap',gap:8}}>
            <label style={{...labelStyle,marginBottom:0}}>PLAYER POOL (one player per line)</label>
            <button onClick={()=>setSleeperOpen(true)} type="button" style={{padding:'5px 11px',background:'#0f0f0f',border:'1px solid #FFD700',borderRadius:6,color:'#FFD700',fontSize:11,fontWeight:800,cursor:'pointer',letterSpacing:0.5}}>📥 IMPORT FROM SLEEPER</button>
          </div>
          <textarea value={poolText} onChange={e=>setPoolText(e.target.value)} placeholder={`Justin Jefferson\nBijan Robinson\n...`} rows={8} style={{...inputStyle,fontFamily:'monospace',resize:'vertical'}}/>
        </div>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,gap:8,flexWrap:'wrap'}}>
            <label style={{...labelStyle,marginBottom:0}}>FUTURE PICKS (optional)</label>
            <button type="button" onClick={()=>setShowPicksHelp(v=>!v)} style={{padding:'2px 8px',background:'transparent',border:'1px solid #FFD70055',borderRadius:12,color:'#FFD700',cursor:'pointer',fontSize:11,fontWeight:800}}>ⓘ {showPicksHelp?'hide':'what goes here?'}</button>
          </div>
          {showPicksHelp && (
            <div style={{background:'#0f0a00',border:'1px solid #FFD70055',borderRadius:8,padding:'12px 14px',marginBottom:8,fontSize:12,color:'#ddd',lineHeight:1.6}}>
              Sleeper doesn't track future picks reliably, so add them here manually. These get pooled alongside the players and can be drafted just like any other asset.
              <div style={{marginTop:6,color:'#aaa'}}>Use the year dropdowns to add draft picks fast.</div>
            </div>
          )}
          {bulkPicksControls}
            <PickYearDropdowns/>
          <textarea value={picksText} onChange={e=>setPicksText(e.target.value)} placeholder={`Click a year dropdown above to add a pick, then type the original owner's username after "via"`} rows={4} style={{...inputStyle,fontFamily:'monospace',resize:'vertical'}}/>
        </div>
        <div>
          <label style={labelStyle}>NEW MANAGER USERNAMES (one per line)</label>
          <textarea value={teamsText} onChange={e=>setTeamsText(e.target.value)} placeholder={`user1\nuser2\nuser3`} rows={5} style={{...inputStyle,fontFamily:'monospace',resize:'vertical'}}/>
          <div style={{fontSize:11,color:'#666',marginTop:5}}>After creating the draft, share the link with your league. Each manager clicks CLAIM next to their team. Pick order can be randomized in the lobby.</div>
        </div>
        <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
          <div>
            <label style={labelStyle}>FORMAT</label>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>setSnake(true)} style={{padding:'8px 14px',background:snake?'#FFD700':'#0a0a0a',color:snake?'#000':'#888',border:'1px solid '+(snake?'#FFD700':'#333'),borderRadius:6,fontWeight:800,cursor:'pointer',fontSize:13}}>🐍 Snake</button>
              <button onClick={()=>setSnake(false)} style={{padding:'8px 14px',background:!snake?'#FFD700':'#0a0a0a',color:!snake?'#000':'#888',border:'1px solid '+(!snake?'#FFD700':'#333'),borderRadius:6,fontWeight:800,cursor:'pointer',fontSize:13}}>↓ Linear</button>
            </div>
          </div>
          <div>
            <label style={labelStyle}>TIMER PER PICK</label>
            <div style={{display:'flex',gap:6}}>
              {[['off','None'],['4h','4 hrs'],['8h','8 hrs']].map(([k,l])=>(
                <button key={k} onClick={()=>setTimer(k)} style={{padding:'8px 14px',background:timer===k?'#FFD700':'#0a0a0a',color:timer===k?'#000':'#888',border:'1px solid '+(timer===k?'#FFD700':'#333'),borderRadius:6,fontWeight:800,cursor:'pointer',fontSize:13}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:11,color:'#666',marginTop:5}}>When a pick clock expires, the draft pauses for the commish to advance.</div>
          </div>
        </div>
        {err && <div style={{padding:'10px 14px',background:'#3a1010',border:'1px solid #ef4444',borderRadius:6,color:'#ef4444',fontSize:13}}>{err}</div>}
        <button onClick={create} disabled={creating} style={{padding:'14px 24px',background:creating?'#444':'#10b981',border:'none',borderRadius:8,color:'#000',fontWeight:900,cursor:creating?'default':'pointer',fontSize:14,letterSpacing:1.5}}>{creating?'CREATING…':'CREATE DRAFT'}</button>
      </div>
      )}

      {/* Sleeper import modal (custom-mode shortcut button) */}
      {sleeperOpen && (()=>{
        const usersById = {}; (sleeperData?.users||[]).forEach(u=>{ usersById[u.user_id]=u; });
        return (
          <div onClick={()=>setSleeperOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
            <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:540,maxHeight:'90vh',overflowY:'auto',background:'#0f0f0f',border:'1px solid #FFD700',borderRadius:12,padding:'18px 22px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontWeight:900,fontSize:16,letterSpacing:1.5,color:'#FFD700'}}>📥 IMPORT FROM SLEEPER</div>
                <button onClick={()=>setSleeperOpen(false)} style={{background:'none',border:'none',color:'#888',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{fontSize:12,color:'#888',marginBottom:10,lineHeight:1.5}}>Paste your Sleeper league ID (the long number from <code style={{color:'#FFD700'}}>sleeper.com/leagues/&lt;id&gt;</code>). We'll pull the team list. Pick the orphaned teams to import their rosters into the pool.</div>
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                <input value={sleeperId} onChange={e=>setSleeperId(e.target.value)} onKeyDown={e=>e.key==='Enter'&&fetchSleeperLeague()} placeholder="Sleeper league ID" style={{flex:1,padding:'10px 12px',background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:14,fontFamily:'monospace'}}/>
                <button onClick={fetchSleeperLeague} disabled={sleeperLoading} style={{padding:'10px 16px',background:sleeperLoading?'#444':'#FFD700',border:'none',borderRadius:6,color:'#000',fontWeight:900,cursor:sleeperLoading?'default':'pointer',fontSize:13,letterSpacing:1}}>{sleeperLoading?'…':'FETCH'}</button>
              </div>
              {sleeperErr && <div style={{padding:'8px 12px',background:'#3a1010',border:'1px solid #ef4444',borderRadius:6,color:'#ef4444',fontSize:12,marginBottom:12}}>{sleeperErr}</div>}
              {sleeperData && (
                <>
                  <div style={{fontSize:11,color:'#888',fontWeight:800,letterSpacing:1.5,marginBottom:8}}>SELECT ORPHANED TEAMS · {sleeperSelected.size} of {(sleeperData.rosters||[]).length} selected</div>
                  <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:14,maxHeight:280,overflowY:'auto'}}>
                    {(sleeperData.rosters||[]).map(r=>{
                      const owner = r.owner_id ? usersById[r.owner_id] : null;
                      const sel = sleeperSelected.has(r.roster_id);
                      const orphan = !r.owner_id;
                      const playerCount = (r.players||[]).length;
                      return (
                        <div key={r.roster_id} onClick={()=>{
                          const next = new Set(sleeperSelected);
                          if(sel) next.delete(r.roster_id); else next.add(r.roster_id);
                          setSleeperSelected(next);
                        }} style={{padding:'8px 12px',background:sel?'#0a2a1a':'#0a0a0a',border:'1px solid '+(sel?'#10b981':'#222'),borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
                          <span style={{color:sel?'#10b981':'#666',fontSize:18}}>{sel?'☑':'☐'}</span>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:14}}>{owner?.display_name || owner?.username || `Team #${r.roster_id}`}</div>
                            <div style={{fontSize:11,color:'#666'}}>{playerCount} players · roster #{r.roster_id} {orphan && <span style={{color:'#f59e0b',fontWeight:800,marginLeft:6}}>· ORPHAN</span>}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={importSelected} disabled={sleeperPlayersLoading || sleeperSelected.size===0} style={{width:'100%',padding:'12px',background:sleeperPlayersLoading||sleeperSelected.size===0?'#444':'#10b981',border:'none',borderRadius:7,color:'#000',fontWeight:900,cursor:sleeperPlayersLoading||sleeperSelected.size===0?'default':'pointer',fontSize:14,letterSpacing:1}}>
                    {sleeperPlayersLoading ? 'LOADING PLAYER NAMES (~10MB, one-time)…' : 'ADD PLAYERS TO POOL →'}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Desktop share modal — shown after image is generated on PC.
          Three actions: download / copy to clipboard / share to X (with image already copied). */}
      {desktopShare && (() => {
        const closeModal = () => { setDesktopShare(null); setShareToast(''); setPreviewData(null); };
        const doDownload = () => {
          const url = URL.createObjectURL(desktopShare.blob);
          const link = document.createElement('a');
          link.download = desktopShare.filename;
          link.href = url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(()=>URL.revokeObjectURL(url), 1000);
          setShareToast('Downloaded ✓');
          setTimeout(closeModal, 900);
        };
        const doCopy = async () => {
          try{
            // ClipboardItem is supported in modern Chrome/Edge/Firefox 127+/Safari 13.1+.
            // Writes the PNG to the system clipboard so the user can paste in iMessage,
            // Slack, X compose box, Photos, etc.
            if(!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write){
              setShareToast('Copy not supported in this browser — use Download instead');
              return;
            }
            const item = new window.ClipboardItem({ 'image/png': desktopShare.blob });
            await navigator.clipboard.write([item]);
            setShareToast('Copied to clipboard ✓ — paste anywhere');
            setTimeout(closeModal, 1400);
          }catch(e){ setShareToast('Copy failed: ' + (e.message||e)); }
        };
        const doShareToX = async () => {
          // Twitter web intents don't accept image attachments via URL — best we can do is
          // copy the image to the clipboard, then open the X compose window with prefilled
          // text. The user pastes the image into the tweet (Cmd/Ctrl+V).
          let copied = false;
          try{
            if(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write){
              const item = new window.ClipboardItem({ 'image/png': desktopShare.blob });
              await navigator.clipboard.write([item]);
              copied = true;
            }
          }catch(e){}
          const tweetText = `Dispersal draft alert ⚠️ — ${desktopShare.draftName}. Looking for new managers. DM me to join. (built with @PlayforkeepsFF)`;
          const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
          window.open(intentUrl, '_blank');
          setShareToast(copied ? 'Image copied — paste it into the tweet (Cmd/Ctrl+V)' : 'Tweet opened — image not auto-copied (use Copy first)');
          setTimeout(closeModal, 2400);
        };
        return (
          <div onClick={closeModal} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
            <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:440,background:'#0f0f0f',border:'2px solid #FFD700',borderRadius:12,padding:'22px 24px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontWeight:900,fontSize:15,letterSpacing:1.5,color:'#FFD700'}}>📸 SHARE DISPERSAL</div>
                <button onClick={closeModal} style={{background:'none',border:'none',color:'#888',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{fontSize:13,color:'#aaa',marginBottom:14,lineHeight:1.5}}>Image is ready. Pick what to do with it:</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <button onClick={doDownload} style={{padding:'12px 16px',background:'#0a1f10',border:'1.5px solid #10b981',borderRadius:7,color:'#10b981',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1,textAlign:'left'}}>📥 &nbsp;DOWNLOAD &nbsp;<span style={{fontWeight:600,color:'#888',fontSize:12,letterSpacing:0.3}}>· save .png to your computer</span></button>
                <button onClick={doCopy} style={{padding:'12px 16px',background:'transparent',border:'1.5px solid #FFD700',borderRadius:7,color:'#FFD700',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1,textAlign:'left'}}>📋 &nbsp;COPY TO CLIPBOARD &nbsp;<span style={{fontWeight:600,color:'#888',fontSize:12,letterSpacing:0.3}}>· paste into iMessage, Slack, etc.</span></button>
                <button onClick={doShareToX} style={{padding:'12px 16px',background:'#000',border:'1.5px solid #fff',borderRadius:7,color:'#fff',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1,textAlign:'left',display:'flex',alignItems:'center',gap:8}}>
                  <svg viewBox="0 0 24 24" style={{width:16,height:16}}>
                    <path fill="#fff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  &nbsp;SHARE TO X &nbsp;<span style={{fontWeight:600,color:'#888',fontSize:12,letterSpacing:0.3}}>· copies image + opens tweet</span>
                </button>
              </div>
              {shareToast && <div style={{marginTop:14,padding:'10px 12px',background:'#0a2a1a',border:'1px solid #10b981',borderRadius:7,color:'#10b981',fontSize:12,fontWeight:700,textAlign:'center'}}>{shareToast}</div>}
            </div>
          </div>
        );
      })()}

      {/* Off-screen share-card — populated by sharePoolImage() then captured via html2canvas.
          Painted at -99999px so the card renders correctly without ever being visible. */}
      {previewData && (
        <div style={{position:'fixed',left:'-99999px',top:0,pointerEvents:'none'}} aria-hidden="true">
          <div ref={poolCardRef} style={{width:900,background:'#080808',padding:'32px 36px',color:'#f0f0f0',fontFamily:"'Inter','Segoe UI',sans-serif",border:'3px solid #FFD700',borderRadius:14,boxSizing:'border-box'}}>
            <div style={{display:'flex',alignItems:'center',gap:18,marginBottom:18,paddingBottom:18,borderBottom:'2px solid #FFD70044'}}>
              {/* Local logo (1500x500 actual) — display at fixed height respecting aspect ratio.
                  Hosted on the same origin so html2canvas captures it cleanly (no CORS). */}
              <img src="/img/pfk-logo.jpg" alt="PFK" style={{height:60,width:'auto',objectFit:'contain',flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:800,color:'#FFD700',letterSpacing:2.5,marginBottom:4}}>🎲 DISPERSAL DRAFT POOL</div>
                <div style={{fontSize:26,fontWeight:900,color:'#fff',letterSpacing:0.5,lineHeight:1.15,wordBreak:'break-word'}}>{previewData.draftName}</div>
              </div>
            </div>
            {/* Stats row — 3 cards: TOTAL ASSETS (players+picks), NEW MANAGERS, BUY-IN. */}
            <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
              <div style={{flex:'1 1 0',padding:'10px 14px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:900,color:'#FFD700',lineHeight:1}}>{previewData.players.length + previewData.picks.length}</div>
                <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>TOTAL ASSETS</div>
              </div>
              <div style={{flex:'1 1 0',padding:'10px 14px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:900,color:'#FFD700',lineHeight:1}}>{previewData.managersNeeded||0}</div>
                <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>NEW MANAGERS NEEDED</div>
              </div>
              <div style={{flex:'1 1 0',padding:'10px 14px',background:'#0a1f10',border:'1px solid #10b981',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:22,fontWeight:900,color:'#10b981',lineHeight:1}}>{(() => {
                  const raw = (previewData.buyIn||'').trim();
                  if(!raw) return 'TBD';
                  // Auto-prepend $ if buy-in starts with a digit (e.g., "250" → "$250").
                  // Leave alone if already has $ or starts with text (e.g., "FREE", "$50 + trade").
                  return /^\d/.test(raw) ? '$' + raw : raw;
                })()}</div>
                <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>BUY-IN</div>
              </div>
            </div>
            {/* Settings strip — auto-detected from Sleeper or commish-entered for Custom mode. */}
            {previewData.settingsLine && (
              <div style={{padding:'10px 14px',background:'#0f0a00',border:'1px solid #FFD70033',borderRadius:8,marginBottom:18,textAlign:'center',fontSize:13,fontWeight:800,color:'#FFD700',letterSpacing:1.5}}>
                {previewData.settingsLine}
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns: previewData.picks.length ? '1.6fr 1fr' : '1fr',gap:20}}>
              <div>
                <div style={{fontSize:12,fontWeight:900,color:'#FFD700',letterSpacing:2,marginBottom:10,paddingBottom:6,borderBottom:'1px solid #FFD70033'}}>📋 PLAYER POOL</div>
                {[...previewData.posOrder, 'OTHER'].filter(p => previewData.playersByPos[p]?.length).map(pos => (
                  <div key={pos} style={{marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:900,color:'#a78bfa',letterSpacing:1.5,marginBottom:6}}>{pos === 'OTHER' ? 'OTHER' : pos} <span style={{color:'#666',fontWeight:700}}>· {previewData.playersByPos[pos].length}</span></div>
                    <div style={{display:'grid',gridTemplateColumns: previewData.playersByPos[pos].length > 8 ? '1fr 1fr' : '1fr',gap:'2px 14px'}}>
                      {previewData.playersByPos[pos].map(it => (
                        <div key={it.id} style={{fontSize:13,color:'#ddd',lineHeight:1.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                          {stripPosFromName(it.name)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {previewData.picks.length > 0 && (
                <div>
                  <div style={{fontSize:12,fontWeight:900,color:'#FFD700',letterSpacing:2,marginBottom:10,paddingBottom:6,borderBottom:'1px solid #FFD70033'}}>🎟 ROOKIE PICKS</div>
                  {(() => {
                    const byYear = {};
                    previewData.picks.forEach(p => {
                      const yM = (p.name||'').match(/(\d{4})/);
                      const y = yM ? yM[1] : '????';
                      if(!byYear[y]) byYear[y] = [];
                      byYear[y].push(p);
                    });
                    return Object.keys(byYear).sort().map(y => (
                      <div key={y} style={{marginBottom:14}}>
                        <div style={{fontSize:11,fontWeight:900,color:'#a78bfa',letterSpacing:1.5,marginBottom:6}}>{y} <span style={{color:'#666',fontWeight:700}}>· {byYear[y].length}</span></div>
                        <div style={{display:'flex',flexDirection:'column',gap:2}}>
                          {byYear[y].map(p => (
                            <div key={p.id} style={{fontSize:12,color:'#ddd',lineHeight:1.5}}>
                              {p.name.replace(/^\d{4}\s*/, '')}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            <div style={{marginTop:22,paddingTop:16,borderTop:'2px solid #FFD70044',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,color:'#888',fontWeight:800,letterSpacing:1.5,marginBottom:3}}>CREATE YOUR OWN DISPERSAL DRAFT AT</div>
                <div style={{fontSize:18,fontWeight:900,color:'#FFD700',letterSpacing:0.5}}>playforkeepsdynasty.com</div>
              </div>
              {/* X (Twitter) icon + handle. Inline SVG so html2canvas captures it cleanly. */}
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <svg viewBox="0 0 24 24" style={{width:22,height:22,flexShrink:0}}>
                  <path fill="#FFD700" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <div style={{fontSize:18,fontWeight:900,color:'#FFD700',letterSpacing:0.5}}>@PlayforkeepsFF</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Active draft view (lobby / live / complete) ----------
function DispersalDraft({draftId}){
  const [draft,setDraft] = useState(null);
  const [loading,setLoading] = useState(true);
  // Spectator mode: ?spectate=1 in URL hides claim/pick UI; the user can watch
  // but never interact. Useful for league mates not in the disperse pool.
  const isSpectator = typeof window!=='undefined' && new URLSearchParams(window.location.search).get('spectate')==='1';
  // Commissioner = the browser that created the draft (flagged in localStorage on create) OR
  // anyone who clicked "I AM THE COMMISSIONER" in the lobby. Stored in localStorage so the
  // flag survives reloads. Held in state so toggling re-renders immediately.
  const [commishFlag,setCommishFlag] = useState(()=>{
    try{ return localStorage.getItem('pfk_disp_creator_'+draftId)==='1'; }catch(e){ return false; }
  });
  const isCommish = !isSpectator && commishFlag;
  const declareCommish = () => {
    try{ localStorage.setItem('pfk_disp_creator_'+draftId, '1'); }catch(e){}
    setCommishFlag(true);
  };
  const [me,setMe] = useState(()=>{
    if(isSpectator) return null;
    try{ return JSON.parse(localStorage.getItem('pfk_disp_'+draftId) || 'null'); }catch(e){ return null; }
  });
  const [claimUser,setClaimUser] = useState('');
  const [claimPass,setClaimPass] = useState('');
  const [claimErr,setClaimErr] = useState('');
  const [pickErr,setPickErr] = useState('');
  const [poolFilter,setPoolFilter] = useState('');
  const [poolTab,setPoolTab] = useState('players'); // 'players' | 'picks'
  const [pickConfirm,setPickConfirm] = useState(null); // pool item awaiting Yes/No
  const [linkCopied,setLinkCopied] = useState(false);
  const [fcValues,setFcValues] = useState(null); // {bySleeperId, byName} from FantasyCalc — silent sort
  useEffect(()=>{ fetchFcValues().then(setFcValues); },[]);
  // Track in-flight auto-pick attempts so we don't double-fire on the same pick index.
  const autoPickAttempted = useRef(new Set());
  // 1-second tick for the live timer countdown (only ticks when live + deadline set)
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{
    const t = setInterval(()=>setNow(Date.now()), 1000);
    return ()=>clearInterval(t);
  },[]);
  // Refs must be at top of component (before any conditional returns) per React Rules of Hooks.
  const rosterRefs = useRef({});

  // Initial load + Supabase realtime subscription. Falls back to polling every
  // 15s as a safety net in case the websocket drops.
  useEffect(()=>{
    let cancelled = false;
    const load = async () => {
      const d = await dispFetch(draftId);
      if(!cancelled){ setDraft(d); setLoading(false); }
    };
    load();
    let channel = null;
    if(sb && sb.channel){
      channel = sb.channel('dispersal_'+draftId)
        .on('postgres_changes', {event:'UPDATE', schema:'public', table:'dispersal_drafts', filter:`id=eq.${draftId}`}, (payload)=>{
          if(cancelled) return;
          // Use payload.new only if it actually contains parsed JSONB arrays — Supabase
          // realtime sometimes truncates large rows or returns JSONB columns as strings.
          // In any partial / suspect case, fall back to a fresh fetch so we never render
          // picks that can't find their pool item ("(missing)" for ~10s until polling).
          const n = payload?.new;
          const ok = n && Array.isArray(n.pool) && Array.isArray(n.picks) && Array.isArray(n.teams);
          if(ok) setDraft(n);
          else load();
        })
        .subscribe();
    }
    const t = setInterval(load, 15000);
    return ()=>{ cancelled = true; clearInterval(t); if(channel && sb?.removeChannel) sb.removeChannel(channel); };
  },[draftId]);

  const claimSlot = async (slot) => {
    setClaimErr('');
    const team = draft.teams.find(t => t.slot===slot);
    if(!team){ setClaimErr('Team not found'); return; }
    if(team.joined){ setClaimErr('Already claimed — pick another team'); return; }
    const newTeams = draft.teams.map(t => t.slot===slot ? {...t, joined:true} : t);
    const meNew = { slot:team.slot, username:team.username };
    setDraft(d => d ? {...d, teams:newTeams} : d); // optimistic
    try{ localStorage.setItem('pfk_disp_'+draftId, JSON.stringify(meNew)); }catch(e){}
    setMe(meNew);
    const { error } = await dispUpdate(draftId, { teams:newTeams });
    if(error){ setClaimErr(error.message || 'Claim failed'); return; }
  };
  const releaseSlot = async (slot) => {
    if(!confirm('Release this team so someone else can claim it?')) return;
    const newTeams = draft.teams.map(t => t.slot===slot ? {...t, joined:false} : t);
    setDraft(d => d ? {...d, teams:newTeams} : d); // optimistic
    if(me && me.slot === slot){
      try{ localStorage.removeItem('pfk_disp_'+draftId); }catch(e){}
      setMe(null);
    }
    await dispUpdate(draftId, { teams:newTeams });
  };

  // Two-step start: lobby → ready (commish + everyone now in the draft view) → live (picks begin)
  const goToDraft = async () => {
    if(draft.teams.some(t=>!t.joined)){
      if(!confirm('Some managers haven\'t joined yet. Move to draft anyway?')) return;
    }
    await dispUpdate(draftId, { status:'ready' });
  };
  const startDraft = async () => {
    const deadline = draft.timer_seconds ? new Date(Date.now() + draft.timer_seconds*1000).toISOString() : null;
    setDraft(d => d ? {...d, status:'live', pick_deadline:deadline} : d); // optimistic
    await dispUpdate(draftId, { status:'live', pick_deadline:deadline });
  };

  const makePick = async (poolItemId) => {
    setPickErr('');
    if(!me){ setPickErr('You must claim a team first'); return; }
    const onClockSlot = dispSlotForPick(draft.current_pick_idx, teams.length, draft.snake, draft.pick_order);
    if(onClockSlot !== me.slot){ setPickErr('Not your turn'); return; }
    const item = draft.pool.find(p => p.id === poolItemId);
    if(!item || item.drafted){ setPickErr('Already drafted'); return; }
    const newPool = draft.pool.map(p => p.id===poolItemId ? {...p, drafted:true} : p);
    const newPicks = [...draft.picks, { pickIdx:draft.current_pick_idx, slot:me.slot, poolItemId, ts:new Date().toISOString() }];
    const newIdx = draft.current_pick_idx + 1;
    const totalPicks = draft.pool.length;
    const newStatus = newIdx >= totalPicks ? 'complete' : 'live';
    const newDeadline = (newStatus==='live' && draft.timer_seconds) ? new Date(Date.now() + draft.timer_seconds*1000).toISOString() : null;
    setDraft(d => d ? {...d, pool:newPool, picks:newPicks, current_pick_idx:newIdx, status:newStatus, pick_deadline:newDeadline} : d); // optimistic
    const { error } = await dispUpdate(draftId, {
      pool:newPool, picks:newPicks, current_pick_idx:newIdx,
      status:newStatus, pick_deadline:newDeadline,
    });
    if(error){ setPickErr(error.message || 'Pick failed'); return; }
  };

  const signOut = () => {
    localStorage.removeItem('pfk_disp_'+draftId);
    setMe(null);
  };

  // Auto-pick when the timer expires (only if draft.auto_pick is true). Any client viewing
  // the draft can fire this; we use eq('current_pick_idx', expectedIdx) on the update so
  // only the first to land wins — the rest become no-ops.
  useEffect(()=>{
    if(!draft || draft.status !== 'live' || !draft.auto_pick) return;
    if(!draft.pick_deadline) return;
    const deadlineMs = new Date(draft.pick_deadline).getTime();
    if(now < deadlineMs) return;
    const idx = draft.current_pick_idx || 0;
    if(autoPickAttempted.current.has(idx)) return;
    autoPickAttempted.current.add(idx);
    // Slight random delay to spread contention across clients
    const delay = 200 + Math.floor(Math.random()*800);
    const t = setTimeout(async () => {
      // Find best available player by FC value (skip future picks — auto-pick only does players)
      const available = (draft.pool||[]).filter(p => !p.drafted && p.type !== 'pick');
      if(!available.length) return;
      const valueOf = (it) => {
        if(!fcValues) return 0;
        if(it.sleeperId && fcValues.bySleeperId[it.sleeperId] != null) return fcValues.bySleeperId[it.sleeperId];
        const stripped = (it.name || '').replace(/\s*\([^)]*\)\s*$/, '');
        const k = normDraftName(stripped);
        return fcValues.byName[k] != null ? fcValues.byName[k] : -1;
      };
      const best = available.slice().sort((a,b)=>valueOf(b)-valueOf(a))[0];
      if(!best) return;
      const onClock = dispSlotForPick(idx, (draft.teams||[]).length, draft.snake, draft.pick_order||[]);
      if(onClock == null) return;
      const newPool = (draft.pool||[]).map(p => p.id===best.id ? {...p, drafted:true} : p);
      const newPicks = [...(draft.picks||[]), { pickIdx:idx, slot:onClock, poolItemId:best.id, ts:new Date().toISOString(), auto:true }];
      const newIdx = idx + 1;
      const totalSlots = (draft.pool||[]).length;
      const newStatus = newIdx >= totalSlots ? 'complete' : 'live';
      const newDeadline = (newStatus==='live' && draft.timer_seconds) ? new Date(Date.now() + draft.timer_seconds*1000).toISOString() : null;
      // Conditional update: only succeed if current_pick_idx still matches what we expected
      await sb.from('dispersal_drafts').update({
        pool:newPool, picks:newPicks, current_pick_idx:newIdx,
        status:newStatus, pick_deadline:newDeadline, updated_at:new Date().toISOString(),
      }).eq('id', draftId).eq('current_pick_idx', idx);
    }, delay);
    return ()=>clearTimeout(t);
  },[draft, now, fcValues, draftId]);

  // Commish controls — anyone with the (non-spectator) link can use these.
  // Trade off some security for "any league mate can rescue a stuck draft."
  const undoLastPick = async () => {
    if(!draft.picks?.length){ alert('No picks to undo.'); return; }
    if(!confirm('Undo the last pick?')) return;
    const last = draft.picks[draft.picks.length-1];
    const newPicks = draft.picks.slice(0,-1);
    const newPool = (draft.pool||[]).map(p => p.id===last.poolItemId ? {...p, drafted:false} : p);
    const newIdx = Math.max(0, (draft.current_pick_idx||0) - 1);
    const newDeadline = draft.timer_seconds ? new Date(Date.now() + draft.timer_seconds*1000).toISOString() : null;
    await dispUpdate(draftId, { pool:newPool, picks:newPicks, current_pick_idx:newIdx, status:'live', pick_deadline:newDeadline });
  };
  const forceSkip = async () => {
    if((draft.status||'lobby')!=='live'){ alert('Draft not live.'); return; }
    if(!confirm('Skip the on-clock manager? Their pick is forfeited.')) return;
    const newIdx = (draft.current_pick_idx||0) + 1;
    const totalSlots = (draft.pool||[]).length;
    const newStatus = newIdx >= totalSlots ? 'complete' : 'live';
    const newDeadline = (newStatus==='live' && draft.timer_seconds) ? new Date(Date.now() + draft.timer_seconds*1000).toISOString() : null;
    await dispUpdate(draftId, { current_pick_idx:newIdx, status:newStatus, pick_deadline:newDeadline });
  };
  const endDraft = async () => {
    if(!confirm('Force the draft to complete now? Remaining pool items stay undrafted.')) return;
    await dispUpdate(draftId, { status:'complete', pick_deadline:null });
  };
  const reopenDraft = async () => {
    if(!confirm('Reopen the draft? Anyone whose turn it is can resume picking.')) return;
    const newDeadline = draft.timer_seconds ? new Date(Date.now() + draft.timer_seconds*1000).toISOString() : null;
    await dispUpdate(draftId, { status:'live', pick_deadline:newDeadline });
  };
  // Pause = drop back to 'ready' phase. The existing START DRAFT button in that
  // banner becomes the resume button. Clears the pick deadline so the timer doesn't
  // tick down while paused.
  const pauseDraft = async () => {
    if((draft.status||'lobby')!=='live'){ alert('Draft not live.'); return; }
    if(!confirm('Pause the draft? The clock stops and the on-clock manager waits until you resume.')) return;
    await dispUpdate(draftId, { status:'ready', pick_deadline:null });
  };
  const randomizeOrder = async () => {
    if(!confirm('Randomize the pick order?')) return;
    const order = (draft.pick_order||[]).slice();
    for(let i=order.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
    setDraft(d => d ? {...d, pick_order:order} : d); // optimistic
    await dispUpdate(draftId, { pick_order:order });
  };

  if(loading) return <div style={{padding:40,textAlign:'center',color:'#888'}}>Loading draft… <span style={{fontSize:11,color:'#444'}}>(id: {draftId})</span></div>;
  if(!draft) return <div style={{padding:40,textAlign:'center',color:'#ef4444'}}>Draft not found. <div style={{fontSize:11,color:'#666',marginTop:6}}>id: {draftId}</div></div>;

  // Defensive defaults — if Supabase returns nulls or missing fields we still render.
  const teams = Array.isArray(draft.teams) ? draft.teams : [];
  const picks = Array.isArray(draft.picks) ? draft.picks : [];
  const pool  = Array.isArray(draft.pool)  ? draft.pool  : [];
  const pickOrder = Array.isArray(draft.pick_order) ? draft.pick_order : teams.map((_,i)=>i);
  const status = draft.status || 'lobby';

  // Compute roster per team. If "me" is claimed, push their team to the front so they
  // always see their own roster first.
  const rostersUnsorted = teams.map(t => ({
    ...t,
    picks: picks.filter(p => p.slot===t.slot).map(p => ({...p, item:pool.find(it=>it.id===p.poolItemId)}))
  }));
  const rosters = me
    ? [...rostersUnsorted.filter(r=>r.slot===me.slot), ...rostersUnsorted.filter(r=>r.slot!==me.slot)]
    : rostersUnsorted;

  const onClockSlot = status==='live' ? dispSlotForPick(draft.current_pick_idx||0, teams.length, draft.snake, pickOrder) : null;
  const onClockTeam = onClockSlot != null ? teams.find(t => t.slot === onClockSlot) : null;
  const myTurn = me && onClockSlot === me.slot;
  const round = Math.floor(draft.current_pick_idx / Math.max(1,teams.length)) + 1;
  const posInRound = (draft.current_pick_idx % Math.max(1,teams.length)) + 1;

  const screenshotRoster = async (slot, username) => {
    const el = rosterRefs.current[slot];
    if(!el || !window.html2canvas){ alert('Screenshot library not loaded yet — refresh and try again.'); return; }
    try{
      const canvas = await window.html2canvas(el, { backgroundColor:'#080808', scale:2 });
      const filename = `${draft.name.replace(/[^a-z0-9]/gi,'_')}_${username}.png`;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      // Mobile: try Web Share API (opens native share sheet → Save to Photos / Files / Messages)
      if(blob && navigator.canShare){
        const file = new File([blob], filename, { type:'image/png' });
        if(navigator.canShare({ files:[file] })){
          try{
            await navigator.share({ files:[file], title:`${username} — ${draft.name}` });
            return;
          }catch(e){ if(e && e.name==='AbortError') return; /* fall through to download */ }
        }
      }
      // Desktop: download via anchor
      const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if(blob) setTimeout(()=>URL.revokeObjectURL(url), 1000);
      // iOS Safari fallback: if download attr was ignored, open in new tab so user can long-press → Save Image
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if(isIOS && !navigator.canShare){
        window.open(canvas.toDataURL('image/png'), '_blank');
      }
    }catch(e){ alert('Screenshot failed: ' + (e.message||e)); }
  };

  // status==='lobby' has no sticky rosters bar so no extra bottom padding needed.
  const stickyRostersActive = status==='live' || status==='complete';
  return (
    <div style={{padding:'14px 16px',color:'#eee',maxWidth:1240,margin:'0 auto',paddingBottom:stickyRostersActive?'46vh':14}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14,flexWrap:'wrap'}}>
        <div style={{fontSize:20,fontWeight:900,color:'#FFD700',letterSpacing:1.5}}>🎲 {draft.name}</div>
        <div style={{padding:'4px 10px',background:status==='live'?'#0a2a1a':status==='complete'?'#1a1a3a':'#2a1a0a',border:'1px solid '+(status==='live'?'#10b981':status==='complete'?'#a78bfa':'#FFD700'),borderRadius:20,fontSize:11,fontWeight:800,letterSpacing:1.5,color:status==='live'?'#10b981':status==='complete'?'#a78bfa':'#FFD700'}}>{status.toUpperCase()}</div>
        <button onClick={()=>{
          try{ navigator.clipboard.writeText(window.location.origin + '/dispersal/' + draftId); }catch(e){}
          setLinkCopied(true);
          setTimeout(()=>setLinkCopied(false), 2000);
        }} style={{padding:'5px 11px',background:linkCopied?'#10b981':'#FFD700',border:'none',borderRadius:6,color:'#000',fontWeight:900,cursor:'pointer',fontSize:12,letterSpacing:1}}>{linkCopied?'✓ COPIED!':'🔗 COPY LINK'}</button>
        <div style={{flex:1}}/>
        {isSpectator && <div style={{padding:'4px 10px',background:'#1a1a3a',border:'1px solid #a78bfa',borderRadius:20,fontSize:11,fontWeight:800,letterSpacing:1.5,color:'#a78bfa'}}>👀 SPECTATING</div>}
        {!isSpectator && me && <div style={{fontSize:13,color:'#888'}}>You: <span style={{color:'#FFD700',fontWeight:800}}>{me.username}</span> <button onClick={signOut} style={{marginLeft:8,padding:'3px 9px',background:'transparent',border:'1px solid #444',borderRadius:5,color:'#666',cursor:'pointer',fontSize:11}}>switch</button></div>}
      </div>

      {/* Lobby phase */}
      {status === 'lobby' && (
        <>
          <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:10,padding:'16px 18px',marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
              <div style={{fontSize:11,fontWeight:800,color:'#888',letterSpacing:1.5}}>WAITING FOR MANAGERS · {teams.filter(t=>t.joined).length} of {teams.length} joined · DRAFT ORDER:</div>
              {isCommish && <button onClick={randomizeOrder} style={{marginLeft:'auto',padding:'5px 11px',background:'transparent',border:'1px solid #FFD700',borderRadius:6,color:'#FFD700',fontSize:11,fontWeight:800,cursor:'pointer',letterSpacing:0.5}}>🎲 RANDOMIZE ORDER</button>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}}>
              {pickOrder.map((slotIdx,i)=>{
                const t = teams.find(x=>x.slot===slotIdx);
                if(!t) return null;
                const isMine = me && me.slot===t.slot;
                const canClaim = !t.joined && !me && !isSpectator;
                return (
                  <div key={t.slot} style={{padding:'10px 12px',background:t.joined?'#0a2a1a':'#0a0a0a',border:'1px solid '+(t.joined?'#10b981':'#222'),borderRadius:8,display:'flex',alignItems:'center',gap:8}}>
                    <span style={{color:t.joined?'#10b981':'#666',fontSize:18,flexShrink:0}}>{t.joined?'✓':'○'}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:14,wordBreak:'break-word'}}>{t.username}{isMine && <span style={{color:'#10b981',marginLeft:6,fontSize:11}}>(you)</span>}</div>
                      <div style={{fontSize:11,color:'#666'}}>Pick #{i+1}</div>
                    </div>
                    {canClaim && <button onClick={()=>claimSlot(t.slot)} style={{padding:'5px 11px',background:'#FFD700',border:'none',borderRadius:5,color:'#000',fontWeight:900,cursor:'pointer',fontSize:11,letterSpacing:1,flexShrink:0}}>CLAIM</button>}
                    {t.joined && isCommish && !isMine && <button onClick={()=>releaseSlot(t.slot)} title="Release this claim" style={{padding:'3px 7px',background:'transparent',border:'1px solid #444',borderRadius:5,color:'#666',cursor:'pointer',fontSize:11,flexShrink:0}}>✕</button>}
                  </div>
                );
              })}
            </div>
            {claimErr && <div style={{marginTop:8,color:'#ef4444',fontSize:12}}>{claimErr}</div>}
            <button onClick={goToDraft} style={{marginTop:14,padding:'12px 24px',background:'#10b981',border:'none',borderRadius:7,color:'#000',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1.5}}>▶ GO TO DRAFT</button>
          </div>
          {!me && !isSpectator && !isCommish && (
            <div style={{background:'#0f0a00',border:'2px solid #FFD700',borderRadius:10,padding:'18px 22px',marginBottom:12,display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:14,fontWeight:900,color:'#FFD700',letterSpacing:1,marginBottom:4}}>👑 RUNNING THIS DRAFT?</div>
                <div style={{fontSize:13,color:'#aaa'}}>If you set this draft up and aren't drafting, click here to enter as commissioner. No passcode needed — you'll get start/randomize/undo controls.</div>
              </div>
              <button onClick={declareCommish} style={{padding:'12px 20px',background:'#FFD700',border:'none',borderRadius:7,color:'#000',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1.5}}>I AM THE COMMISSIONER</button>
            </div>
          )}
          {!me && isCommish && (
            <div style={{background:'#0f0a00',border:'1px solid #FFD700',borderRadius:10,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontSize:13,fontWeight:900,color:'#FFD700',letterSpacing:1}}>👑 COMMISSIONER MODE</span>
              <span style={{fontSize:12,color:'#888'}}>You're not drafting — you'll run the lobby + start the draft. Claim a team below if you do want to draft.</span>
            </div>
          )}
          {!me && !isSpectator && !isCommish && (
            <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:10,padding:'12px 16px',fontSize:13,color:'#aaa'}}>
              👆 Click <strong style={{color:'#FFD700'}}>CLAIM</strong> next to your username above. If your team isn't listed, you're a spectator (view-only).
            </div>
          )}
        </>
      )}

      {/* Ready / Live / Complete all share the draft view (pool + rosters). 'ready' adds a
          pre-start banner with START DRAFT + RANDOMIZE; 'live' has the on-clock card + timer;
          'complete' has the trophy banner. */}
      {(status === 'ready' || status === 'live' || status === 'complete') && (
        <>
          {status === 'ready' && (
            <div style={{marginBottom:14}}>
              <div style={{background:'#0f0a00',border:'2px solid #FFD700',borderRadius:'10px 10px 0 0',padding:'14px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',borderBottom:'none'}}>
                <div>
                  <div style={{fontSize:11,fontWeight:800,color:'#FFD700',letterSpacing:1.5}}>READY TO DRAFT</div>
                  <div style={{fontSize:13,color:'#aaa',marginTop:2}}>Review the draft order. Hit START DRAFT when everyone's ready.</div>
                </div>
                <span style={{flex:1}}/>
                <button onClick={randomizeOrder} style={{padding:'10px 16px',background:'transparent',border:'1px solid #FFD700',borderRadius:7,color:'#FFD700',fontWeight:800,cursor:'pointer',fontSize:13,letterSpacing:1}}>🎲 RANDOMIZE ORDER</button>
                <button onClick={startDraft} style={{padding:'12px 20px',background:'#10b981',border:'none',borderRadius:7,color:'#000',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1.5}}>▶ START DRAFT</button>
              </div>
              {/* Pick order strip — visible right under the READY banner so RANDOMIZE shows the reorder live */}
              <div style={{background:'#0a0a0a',border:'2px solid #FFD700',borderTop:'none',borderRadius:'0 0 10px 10px',padding:'8px 12px',display:'flex',gap:6,overflowX:'auto'}}>
                {pickOrder.map((slotIdx,i)=>{
                  const team = teams.find(t=>t.slot===slotIdx);
                  const isMine = me && slotIdx === me.slot;
                  return (
                    <div key={i} style={{flexShrink:0,padding:'4px 10px',borderRadius:14,fontSize:11,fontWeight:800,letterSpacing:0.5,background:isMine?'#0a2a1a':'#111',color:isMine?'#10b981':'#888',border:'1px solid '+(isMine?'#10b981':'#222')}}>
                      <span style={{opacity:0.65,marginRight:5}}>{i+1}.</span>{team?.username||'?'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {status === 'live' && onClockTeam && (()=>{
            const deadlineMs = draft.pick_deadline ? new Date(draft.pick_deadline).getTime() : null;
            const remaining = deadlineMs ? Math.max(0, deadlineMs - now) : null;
            const mins = remaining!=null ? Math.floor(remaining/60000) : null;
            const secs = remaining!=null ? Math.floor((remaining%60000)/1000) : null;
            const expired = remaining===0;
            const lowTime = remaining!=null && remaining < 60000 && !expired;
            const timerColor = expired ? '#ef4444' : lowTime ? '#f59e0b' : myTurn ? '#10b981' : '#FFD700';
            const borderColor = expired ? '#ef4444' : myTurn ? '#10b981' : '#FFD700';
            return (
              <div style={{marginBottom:14}}>
                <div style={{background:myTurn?'#0a2a1a':'#0a0a0a',border:'2px solid '+borderColor,borderRadius:'10px 10px 0 0',padding:'14px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',borderBottom:'none'}}>
                  <div style={{fontSize:11,fontWeight:800,color:expired?'#ef4444':myTurn?'#10b981':'#FFD700',letterSpacing:1.5}}>{expired?'TIME EXPIRED':myTurn?'🚨 YOU ARE OTC!':'ON THE CLOCK'}</div>
                  <div style={{fontSize:18,fontWeight:900}}>{onClockTeam.username}</div>
                  <div style={{fontSize:13,color:'#888'}}>Round {round} · Pick {posInRound} (overall #{draft.current_pick_idx+1})</div>
                  {remaining!=null && (
                    <div style={{marginLeft:'auto',fontSize:22,fontWeight:900,color:timerColor,fontFamily:'monospace',letterSpacing:2}}>
                      {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
                    </div>
                  )}
                </div>
                {/* Pick order strip — all teams in order, current highlighted */}
                <div style={{background:'#0a0a0a',border:'2px solid '+borderColor,borderTop:'none',borderRadius:'0 0 10px 10px',padding:'8px 12px',display:'flex',gap:6,overflowX:'auto'}}>
                  {pickOrder.map((slotIdx,i)=>{
                    const team = teams.find(t=>t.slot===slotIdx);
                    const isCurrent = slotIdx === onClockSlot;
                    const isMe = me && slotIdx === me.slot;
                    return (
                      <div key={i} style={{flexShrink:0,padding:'4px 10px',borderRadius:14,fontSize:11,fontWeight:800,letterSpacing:0.5,background:isCurrent?'#FFD700':isMe?'#0a2a1a':'#111',color:isCurrent?'#000':isMe?'#10b981':'#888',border:'1px solid '+(isCurrent?'#FFD700':isMe?'#10b981':'#222')}}>
                        <span style={{opacity:0.65,marginRight:5}}>{i+1}.</span>{team?.username||'?'}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {status === 'complete' && (
            <div style={{background:'linear-gradient(135deg,#1a1a3a 0%, #0f0a00 100%)',border:'2px solid #FFD700',borderRadius:10,padding:'18px 22px',marginBottom:14,textAlign:'center'}}>
              <div style={{fontSize:16,fontWeight:900,color:'#FFD700',letterSpacing:2,marginBottom:6}}>🏆 DRAFT COMPLETE</div>
              <div style={{fontSize:13,color:'#a78bfa',marginBottom:14,letterSpacing:1}}>{picks.length} picks made · 📸 download each roster from the bar below</div>
              <div style={{fontSize:14,color:'#eee',marginBottom:6,fontWeight:700}}>Thanks for drafting with Play For Keeps!</div>
              <div style={{fontSize:12,color:'#aaa',marginBottom:14,maxWidth:460,marginLeft:'auto',marginRight:'auto',lineHeight:1.5}}>If this saved you time please follow @PlayForKeepsFF on twitter. Check out playforkeepsdynasty.com for more free dynasty tools and content.</div>
              <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
                <a href="https://x.com/PlayForKeepsFF" target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:8,padding:'12px 22px',background:'#FFD700',color:'#000',textDecoration:'none',borderRadius:8,fontWeight:900,fontSize:14,letterSpacing:1}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#000" aria-hidden="true"><path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.36-6.72L4.5 22H1.244l8.04-9.187L1 2h7.016l4.844 6.12L18.244 2zm-1.2 18h1.9L7.048 4H5.05l12 16z"/></svg>
                  FOLLOW @PlayForKeepsFF
                </a>
                <a href="https://playforkeepsdynasty.com/" target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:8,padding:'12px 22px',background:'transparent',color:'#FFD700',textDecoration:'none',borderRadius:8,fontWeight:900,fontSize:14,letterSpacing:1,border:'2px solid #FFD700'}}>
                  <span style={{fontSize:16}}>👑</span>
                  PLAYFORKEEPSDYNASTY.COM
                </a>
              </div>
            </div>
          )}
          {pickErr && <div style={{padding:'10px 14px',background:'#3a1010',border:'1px solid #ef4444',borderRadius:6,color:'#ef4444',fontSize:13,marginBottom:14}}>{pickErr}</div>}

          {isCommish && (
            <div style={{background:'#0a0a0a',border:'1px solid #222',borderRadius:8,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <div style={{fontSize:11,fontWeight:800,color:'#888',letterSpacing:1.5,marginRight:6}}>COMMISH:</div>
              <button onClick={undoLastPick} disabled={!picks.length} style={{padding:'6px 12px',background:'transparent',border:'1px solid '+(picks.length?'#FFD700':'#333'),borderRadius:6,color:picks.length?'#FFD700':'#444',fontSize:12,fontWeight:800,cursor:picks.length?'pointer':'default'}}>↩ Undo last pick</button>
              {status==='live' && <button onClick={pauseDraft} style={{padding:'6px 12px',background:'transparent',border:'1px solid #a78bfa',borderRadius:6,color:'#a78bfa',fontSize:12,fontWeight:800,cursor:'pointer'}}>⏸ Pause draft</button>}
              {status==='live' && <button onClick={forceSkip} style={{padding:'6px 12px',background:'transparent',border:'1px solid #f59e0b',borderRadius:6,color:'#f59e0b',fontSize:12,fontWeight:800,cursor:'pointer'}}>⏭ Force skip</button>}
              {status==='live' && <button onClick={endDraft} style={{padding:'6px 12px',background:'transparent',border:'1px solid #ef4444',borderRadius:6,color:'#ef4444',fontSize:12,fontWeight:800,cursor:'pointer'}}>⏹ End draft</button>}
              {status==='complete' && <button onClick={reopenDraft} style={{padding:'6px 12px',background:'transparent',border:'1px solid #10b981',borderRadius:6,color:'#10b981',fontSize:12,fontWeight:800,cursor:'pointer'}}>▶ Reopen draft</button>}
            </div>
          )}

          {/* Pool — flows in normal page scroll, has padding-bottom so it isn't hidden by the sticky-bottom rosters bar */}
          <div className="pfk-disp-pool-block" style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:10,padding:'14px 16px',marginBottom:14,paddingBottom:14}}>
            {(()=>{
              const playersAvail = pool.filter(p=>!p.drafted && p.type!=='pick').length;
              const picksAvail = pool.filter(p=>!p.drafted && p.type==='pick').length;
              return (
                <div style={{display:'flex',gap:6,marginBottom:10,padding:4,background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8}}>
                  <button onClick={()=>setPoolTab('players')} style={{flex:1,padding:'9px 12px',background:poolTab==='players'?'#FFD700':'transparent',border:'none',borderRadius:6,color:poolTab==='players'?'#000':'#888',fontWeight:900,cursor:'pointer',fontSize:13,letterSpacing:1}}>👥 PLAYERS · {playersAvail}</button>
                  <button onClick={()=>setPoolTab('picks')} style={{flex:1,padding:'9px 12px',background:poolTab==='picks'?'#a78bfa':'transparent',border:'none',borderRadius:6,color:poolTab==='picks'?'#000':'#888',fontWeight:900,cursor:'pointer',fontSize:13,letterSpacing:1}}>🎟 DRAFT PICKS · {picksAvail}</button>
                </div>
              );
            })()}
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
              <div style={{fontSize:11,fontWeight:800,color:'#888',letterSpacing:1.5}}>AVAILABLE · {pool.filter(p=>!p.drafted && (poolTab==='picks'?p.type==='pick':p.type!=='pick')).length}</div>
              <input value={poolFilter} onChange={e=>setPoolFilter(e.target.value)} placeholder={poolTab==='picks'?'Search picks…':'Search players…'} style={{flex:'1 1 140px',minWidth:120,padding:'7px 10px',background:'#0a0a0a',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
              {poolFilter && <button onClick={()=>setPoolFilter('')} style={{padding:'5px 9px',background:'transparent',border:'1px solid #333',borderRadius:5,color:'#888',cursor:'pointer',fontSize:11}}>✕</button>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {(()=>{
                // Sort player tab by FantasyCalc dynasty value (silent — no value shown).
                // Match by sleeperId first, fall back to normalized name; missing values sort to bottom.
                let items = pool.filter(p=>!p.drafted).filter(p=>poolTab==='picks'?p.type==='pick':p.type!=='pick').filter(p=>!poolFilter || p.name.toLowerCase().includes(poolFilter.toLowerCase()));
                if(poolTab !== 'picks' && fcValues){
                  const valueOf = (it) => {
                    if(it.sleeperId && fcValues.bySleeperId[it.sleeperId] != null) return fcValues.bySleeperId[it.sleeperId];
                    // Strip "(POS)" suffix from name before normalizing
                    const stripped = (it.name || '').replace(/\s*\([^)]*\)\s*$/, '');
                    const k = normDraftName(stripped);
                    return fcValues.byName[k] != null ? fcValues.byName[k] : -1;
                  };
                  items = items.slice().sort((a,b) => valueOf(b) - valueOf(a));
                }
                return items;
              })().map(item=>{
                const clickable = myTurn && status==='live';
                return (
                  <div key={item.id} className="pfk-disp-pool-item"
                    style={{padding:'8px 12px',background:'#0a0a0a',border:'1px solid '+(clickable?'#10b981':'#222'),borderRadius:6,display:'flex',alignItems:'center',gap:8,transition:'all .1s'}}>
                    <span className="pfk-disp-pool-badge" style={{padding:'2px 6px',borderRadius:4,fontSize:10,fontWeight:800,background:'#111',color:item.type==='pick'?'#a78bfa':'#FFD700',border:'1px solid '+(item.type==='pick'?'#a78bfa55':'#FFD70055')}}>{item.type==='pick'?'PICK':'PLAYER'}</span>
                    <span className="pfk-disp-pool-name" style={{flex:1,fontSize:14,fontWeight:700}}>{item.name}</span>
                    {clickable && <button onClick={()=>setPickConfirm(item)} className="pfk-disp-pool-action" style={{fontSize:11,color:'#000',background:'#10b981',fontWeight:900,letterSpacing:1,border:'none',borderRadius:5,padding:'6px 12px',cursor:'pointer'}}>DRAFT →</button>}
                  </div>
                );
              })}
              {pool.filter(p=>!p.drafted).filter(p=>poolTab==='picks'?p.type==='pick':p.type!=='pick').length===0 && <div style={{color:'#666',fontSize:13,padding:14,textAlign:'center'}}>{poolTab==='picks' ? 'No draft picks left.' : 'No players left.'}</div>}
            </div>
          </div>

          {/* Pick confirmation modal */}
          {pickConfirm && (
            <div onClick={()=>setPickConfirm(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
              <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:380,background:'#0f0f0f',border:'2px solid #10b981',borderRadius:12,padding:'22px 24px',textAlign:'center'}}>
                <div style={{fontSize:11,fontWeight:800,color:'#888',letterSpacing:1.5,marginBottom:8}}>CONFIRM PICK</div>
                <div style={{fontSize:14,color:'#aaa',marginBottom:6}}>Draft</div>
                <div style={{fontSize:22,fontWeight:900,color:'#FFD700',marginBottom:6,wordBreak:'break-word'}}>{pickConfirm.name}</div>
                <div style={{fontSize:12,color:'#666',marginBottom:18}}>This pick is final once confirmed.</div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setPickConfirm(null)} style={{flex:1,padding:'12px',background:'transparent',border:'1px solid #555',borderRadius:7,color:'#aaa',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1}}>NO, BACK</button>
                  <button onClick={()=>{ const id=pickConfirm.id; setPickConfirm(null); makePick(id); }} style={{flex:1,padding:'12px',background:'#10b981',border:'none',borderRadius:7,color:'#000',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1}}>YES, DRAFT</button>
                </div>
              </div>
            </div>
          )}

          {/* Rosters — sticky-bottom on viewport so they're always in view as you scroll the pool */}
          <div className="pfk-disp-rosters" style={{position:'fixed',left:0,right:0,bottom:0,background:'#080808',borderTop:'2px solid #FFD700',padding:'10px 14px',maxHeight:'42vh',overflowY:'auto',zIndex:50,boxShadow:'0 -8px 24px rgba(0,0,0,0.7)'}}>
            <div style={{maxWidth:1240,margin:'0 auto'}}>
              <div style={{fontSize:11,fontWeight:800,color:'#888',letterSpacing:1.5,marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
                <span>ROSTERS · {rosters.length} teams</span>
                {status==='complete' && <span style={{color:'#a78bfa'}}>· tap 📸 on any roster to download</span>}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}}>
                {rosters.map(t=>{
                  const isOnClock = onClockSlot === t.slot;
                  const isMine = me && me.slot === t.slot;
                  const canClaim = !t.joined && !me && !isSpectator;
                  return (
                    <div key={t.slot} ref={el=>{ if(el) rosterRefs.current[t.slot]=el; }} style={{background:'#0a0a0a',border:'1px solid '+(isOnClock?'#10b981':isMine?'#FFD70066':'#222'),borderRadius:8,padding:'10px 12px',overflow:'hidden'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6,flexWrap:'wrap'}}>
                        <span style={{fontSize:11,color:'#666',fontWeight:800,minWidth:24,flexShrink:0}}>#{pickOrder.indexOf(t.slot)+1}</span>
                        <span style={{fontWeight:800,fontSize:14,wordBreak:'break-word',flex:'1 1 auto',minWidth:0,color:t.joined?'#eee':'#888'}}>{t.username}{isMine && <span style={{color:'#10b981',marginLeft:6,fontSize:11,fontWeight:700}}>(you)</span>}</span>
                        {isOnClock && <span style={{fontSize:9,color:'#10b981',fontWeight:800,padding:'2px 5px',background:'#0a2a1a',borderRadius:3,letterSpacing:0.5,flexShrink:0}}>ON CLOCK</span>}
                        {canClaim && <button onClick={()=>claimSlot(t.slot)} style={{padding:'4px 9px',background:'#FFD700',border:'none',borderRadius:5,color:'#000',fontWeight:900,cursor:'pointer',fontSize:10,letterSpacing:1,flexShrink:0}}>CLAIM</button>}
                        {t.joined && isCommish && !isMine && <button onClick={()=>releaseSlot(t.slot)} title="Release this claim" style={{padding:'2px 6px',background:'transparent',border:'1px solid #444',borderRadius:5,color:'#666',cursor:'pointer',fontSize:11,flexShrink:0}}>✕</button>}
                        <span style={{fontSize:11,color:'#666',flexShrink:0}}>{t.picks.length}p</span>
                        {status==='complete' && <button onClick={()=>screenshotRoster(t.slot, t.username)} title={`Download ${t.username}'s roster as PNG`} style={{padding:'2px 6px',background:'transparent',border:'1px solid #a78bfa',borderRadius:5,color:'#a78bfa',cursor:'pointer',fontSize:11,flexShrink:0}}>📸</button>}
                      </div>
                      {t.picks.length>0 && (
                        <div style={{fontSize:12,color:'#aaa',lineHeight:1.6,paddingLeft:0}}>
                          {t.picks.map(p=>(
                            <div key={p.pickIdx}><span style={{color:'#666',display:'inline-block',width:28}}>{p.pickIdx+1}.</span> {p.item?.name || '(missing)'}{p.auto && <span style={{color:'#f59e0b',fontStyle:'italic',marginLeft:6,fontSize:10}}>(auto)</span>}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Top-level Dispersal page (route: /dispersal[/id]) ----------
function DispersalApp({draftId}){
  return (
    <div style={{background:'#080808',minHeight:'100vh',color:'#f0f0f0',fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <MasterToolbar currentTab="dispersal"/>
      {draftId ? <DispersalDraft draftId={draftId}/> : <DispersalSetup/>}
    </div>
  );
}

// ============================================================================
// 🔍 LOOKUP — Phase 0 of the PFK Trust Layer
// "Type a Sleeper username, see public-data facts that would've taken you an
// hour to gather manually." Origin doc + spec live in ~/pfk_research/.
// Facts only — never judgments. Carfax model, not "snitch site."
// ============================================================================

// Seasons to scan are computed at page load — the current NFL season is the
// current calendar year (dynasty leagues roll over to the next year in offseason).
// Same approach the Power Rankings tool uses, which has been proven correct.
const LOOKUP_CURRENT_YEAR = new Date().getFullYear();
const SEASONS_TO_SCAN = [
  String(LOOKUP_CURRENT_YEAR),
  String(LOOKUP_CURRENT_YEAR-1),
  String(LOOKUP_CURRENT_YEAR-2),
  String(LOOKUP_CURRENT_YEAR-3),
  String(LOOKUP_CURRENT_YEAR-4),
];

// Resolve a Sleeper user (accepts username OR numeric user_id)
const lookupResolveUser = async (input) => {
  const q = (input||'').trim();
  if(!q) throw new Error('Enter a Sleeper username or user ID');
  const r = await fetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(q)}`);
  if(!r.ok) throw new Error('No Sleeper user found with that name');
  const u = await r.json();
  if(!u || !u.user_id) throw new Error('No Sleeper user found with that name');
  return u;
};

// Pull all leagues for a user across the seasons we scan. Used for activity +
// orphan history. Each league row carries ._season so we can walk back.
// cache:'no-store' bypasses HTTP caching — same approach Power Rankings uses,
// since stale league lists were one source of the undercount bug.
const lookupAllLeagues = async (userId) => {
  const all = [];
  await Promise.all(SEASONS_TO_SCAN.map(async (s) => {
    try{
      const lgs = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${s}`, {cache:'no-store'}).then(r=>r.json());
      (lgs||[]).forEach(lg => all.push({...lg, _season:s}));
    }catch(e){}
  }));
  return all;
};

// Orphan check: walk DYNASTY leagues only and see if the user was in a league
// during a prior season but is NOT in it (or its descendant) the next season.
// Redraft leagues (settings.type !== 2) are never counted as orphans — they
// inherently end after one season, so missing in season N+1 is normal, not a
// red flag. Same logic for keeper leagues.
//
// Conversion-year leniency: if a dynasty league's immediate predecessor was
// REDRAFT (settings.type === 0), the user's first dynasty year was forced on
// them by a commish converting the league. Leaving after that conversion year
// isn't really "abandoning a dynasty team" — they signed up for redraft.
// (Reported by whiskeyyankee 2026-04-29: his "Lets Go Brandon" league was
// redraft in 2022, commish converted it to dynasty in 2023, he left after.)
const lookupOrphanHistory = async (userId, allLeagues) => {
  // Restrict to dynasty leagues only (settings.type === 2)
  const dynastyOnly = (allLeagues||[]).filter(lg => (lg.settings||{}).type === 2);
  // Map of ALL leagues (any type) by id — used to detect redraft→dynasty
  // conversions when a dynasty league's previous_league_id points to a
  // redraft league we have visibility into.
  const allById = {};
  (allLeagues||[]).forEach(lg => { allById[String(lg.league_id)] = lg; });
  const wasConvertedFromRedraft = (lg) => {
    const prevId = lg.previous_league_id;
    if(!prevId || String(prevId) === '0') return false;
    const prev = allById[String(prevId)];
    if(!prev) return false;
    return (prev.settings||{}).type === 0;
  };
  const heldBySeason = {};
  dynastyOnly.forEach(lg => {
    if(!heldBySeason[lg._season]) heldBySeason[lg._season] = new Set();
    heldBySeason[lg._season].add(String(lg.league_id));
  });
  const details = [];
  const sortedSeasons = SEASONS_TO_SCAN.slice().sort();
  for(let i=0;i<sortedSeasons.length-1;i++){
    const sCur = sortedSeasons[i], sNext = sortedSeasons[i+1];
    const cur = heldBySeason[sCur] || new Set();
    if(!heldBySeason[sNext]) continue;
    const next = heldBySeason[sNext];
    cur.forEach(lid => {
      const lg = dynastyOnly.find(x => String(x.league_id) === lid && x._season === sCur);
      if(!lg) return;
      // Conversion-year leniency: if THIS dynasty year was forced by a
      // redraft→dynasty conversion, don't flag the user for leaving after it.
      if(wasConvertedFromRedraft(lg)) return;
      const descendants = dynastyOnly.filter(x => x._season === sNext && String(x.previous_league_id||'') === lid);
      if(descendants.length === 0 && !next.has(lid)){
        details.push({ league_name: lg.name || `League #${lid}`, league_id: lid, season_left: sCur });
      }
    });
  }
  const nowYear = new Date().getFullYear();
  const last12 = details.filter(d => +d.season_left >= nowYear - 1).length;
  const last24 = details.filter(d => +d.season_left >= nowYear - 2).length;

  // Total UNIQUE dynasty leagues this user has joined (chain-root deduped).
  // Each dynasty league gets a new league_id per season chained via
  // previous_league_id. Walk the chain back to find the root for each league;
  // distinct roots = unique leagues for the orphan-rate denominator.
  const allIds = new Set(dynastyOnly.map(l => String(l.league_id)));
  const roots = new Set();
  dynastyOnly.forEach(lg => {
    let cur = lg, depth = 0;
    while(cur && depth < 10){
      const prev = cur.previous_league_id;
      // If prev isn't in our scanned data, treat current as the root we have visibility into.
      if(!prev || String(prev) === '0' || !allIds.has(String(prev))){
        roots.add(String(cur.league_id));
        break;
      }
      cur = dynastyOnly.find(d => String(d.league_id) === String(prev));
      depth++;
    }
  });
  const uniqueLeagues = roots.size;
  const orphanRatePct = uniqueLeagues > 0 ? (details.length / uniqueLeagues) * 100 : 0;

  return {
    last12mo: last12,
    last24mo: last24,
    all: details.length,
    uniqueLeagues,
    orphanRatePct,
    details,
  };
};

// Compute trade stats for a single season's dynasty leagues. Helper used by
// lookupTradeActivity to compute current + prior seasons in parallel.
//
// IMPORTANT: dynasty trades happen YEAR-ROUND, but Sleeper stores them under
// whichever league_id is active for that season. In April 2026 (now), most
// active trading lives in 2026 league_ids. The 2025 league_id holds end-of-
// playoffs trades from Jan/Feb 2026 + the in-season weeks of 2025 itself.
const lookupTradesForSeason = async (userId, allLeagues, season) => {
  const dynastyTarget = (allLeagues||[]).filter(lg =>
    (lg.settings||{}).type === 2 && lg._season === season
  );
  if(dynastyTarget.length === 0){
    return { season, leaguesCount: 0, totalTrades: 0, avgPerLeague: 0, lastTradeDate: null };
  }
  let totalTrades = 0;
  let lastTradeDate = null;
  let leaguesWithUser = 0;
  await Promise.all(dynastyTarget.map(async (lg) => {
    try{
      const rosters = await fetch(`https://api.sleeper.app/v1/league/${lg.league_id}/rosters`, {cache:'no-store'}).then(r=>r.json());
      const userRoster = (rosters||[]).find(r => r.owner_id === userId || (r.co_owners||[]).includes(userId));
      if(!userRoster) return;
      leaguesWithUser++;
      const userRosterId = userRoster.roster_id;
      const weeks = Array.from({length: 17}, (_, i) => i + 1);
      const txArrays = await Promise.all(weeks.map(w =>
        fetch(`https://api.sleeper.app/v1/league/${lg.league_id}/transactions/${w}`, {cache:'no-store'})
          .then(r=>r.json()).catch(()=>[])
      ));
      txArrays.flat().forEach(tx => {
        if(tx.type !== 'trade') return;
        if(tx.status !== 'complete') return;
        if(!(tx.roster_ids||[]).includes(userRosterId)) return;
        totalTrades++;
        const ts = tx.status_updated || tx.created;
        if(ts){
          const d = new Date(ts);
          if(!lastTradeDate || d > lastTradeDate) lastTradeDate = d;
        }
      });
    }catch(e){}
  }));
  return {
    season,
    leaguesCount: leaguesWithUser,
    totalTrades,
    avgPerLeague: leaguesWithUser > 0 ? (totalTrades / leaguesWithUser) : 0,
    lastTradeDate,
  };
};

// Trade activity snapshot — fetches CURRENT + 2 PRIOR seasons in parallel.
// Showing 3 years gives commish a fuller picture early in a season. Heavy
// (~600 API calls for a 12-league user) — runs in background so page doesn't
// feel slow.
const lookupTradeActivity = async (userId, allLeagues) => {
  const seasons = [
    String(LOOKUP_CURRENT_YEAR),
    String(LOOKUP_CURRENT_YEAR - 1),
    String(LOOKUP_CURRENT_YEAR - 2),
  ];
  const [current, prior, prior2] = await Promise.all(
    seasons.map(s => lookupTradesForSeason(userId, allLeagues, s))
  );
  return { current, prior, prior2 };
};

// FantasyCalc value cache, keyed by format string. Each format = different value set
// (TEP, PPR, SF, league size all change player rankings). We cache per-page-load
// to avoid re-fetching the same format twice.
const _fcByFormat = {};
// Translate a Sleeper league into the FantasyCalc API parameters.
// Sleeper bonus_rec_te → FC tepLevel: 0 = none, 1 = 0.5, 2 = 1.0
// Sleeper roster_positions includes "SUPER_FLEX" → numQbs=2, else 1
const fcFormatForLeague = (lg) => {
  const ss = lg.scoring_settings || {};
  const rp = lg.roster_positions || [];
  const numQbs = rp.includes('SUPER_FLEX') ? 2 : 1;
  const recVal = parseFloat(ss.rec ?? 0);
  const ppr = recVal === 1 ? 1 : recVal === 0.5 ? 0.5 : 0;
  const tepRaw = parseFloat(ss.bonus_rec_te ?? 0);
  // FantasyCalc tepLevel only supports 0 / 0.5 / 1.0 — round 0.75 to 1, 0.25 to 0.5
  const tepLevel = tepRaw >= 0.75 ? 2 : tepRaw >= 0.25 ? 1 : 0;
  const numTeams = lg.total_rosters || 12;
  return { numQbs, ppr, tepLevel, numTeams, key: `${numQbs}q-${ppr}p-${tepLevel}t-${numTeams}n` };
};
// Picks ARE in the main FC /values/current response — listed by name (e.g.
// "2026 1st", "2027 2nd", "2026 Pick 1.05"). Players are looked up by sleeperId,
// picks are looked up by name. Both maps are built from one fetch per format.
const _fcPicksByFormat = {};
const fetchFcForFormat = async (fmt) => {
  if(_fcByFormat[fmt.key]) return _fcByFormat[fmt.key];
  const url = `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${fmt.numQbs}&numTeams=${fmt.numTeams}&ppr=${fmt.ppr}&tepLevel=${fmt.tepLevel}`;
  try{
    const arr = await fetch(url).then(r=>r.json());
    const playerMap = {};
    const pickMap = {};
    (arr||[]).forEach(row => {
      const sid = row?.player?.sleeperId;
      const nm = row?.player?.name || '';
      const v = row?.value ?? 0;
      if(sid != null){
        playerMap[String(sid)] = v;
      }
      // Generic picks ("2026 1st") and specific picks ("2026 Pick 1.05") both keyed by name
      if(/^\d{4}\s+(1st|2nd|3rd|4th|5th)$/.test(nm) || /^\d{4}\s+Pick\s/.test(nm)){
        pickMap[nm] = v;
      }
    });
    _fcByFormat[fmt.key] = playerMap;
    _fcPicksByFormat[fmt.key] = pickMap;
    return playerMap;
  }catch(e){
    _fcByFormat[fmt.key] = {};
    _fcPicksByFormat[fmt.key] = {};
    return {};
  }
};
// Look up a GENERIC future pick value (e.g. fcPickValue("...", 2026, 1) → "2026 1st" → $3214).
// Used as the fallback when we can't determine the slot.
const fcPickValue = (formatKey, year, round) => {
  const map = _fcPicksByFormat[formatKey] || {};
  const suffix = round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : `${round}th`;
  return map[`${year} ${suffix}`] || 0;
};
// Look up a SLOT-SPECIFIC pick value (e.g. fcPickSlotValue("...", 2026, 1, 5) → "2026 Pick 1.05" → $3811).
// Slot is the position WITHIN the round (snake-aware computation done by caller).
// Falls back to the generic value if FC doesn't have the specific slot.
const fcPickSlotValue = (formatKey, year, round, slotInRound) => {
  const map = _fcPicksByFormat[formatKey] || {};
  const padded = String(slotInRound).padStart(2, '0');
  const specific = map[`${year} Pick ${round}.${padded}`];
  if(specific != null) return specific;
  return fcPickValue(formatKey, year, round);
};
// Compute the slot a pick lands at WITHIN its round, given the original owner's
// R1 slot. Snake reverses every other round; linear stays the same.
const slotInRoundFor = (originalR1Slot, round, draftType, leagueSize) => {
  if(draftType === 'snake'){
    // R1 = slot, R2 = N-slot+1, R3 = slot, R4 = N-slot+1, ...
    return round % 2 === 1 ? originalR1Slot : (leagueSize - originalR1Slot + 1);
  }
  // 'linear' or anything else: slot stays the same every round
  return originalR1Slot;
};
// Build map: roster_id → R1 slot for this league's CURRENT-season rookie draft.
// Returns null if we can't determine slots (no draft, auction draft, etc.).
// Tries draft.slot_to_roster_id first (post-draft), falls back to draft.draft_order
// (which is keyed by user_id and needs roster mapping).
const lookupDraftSlots = async (lid, rosters) => {
  let drafts;
  try{ drafts = await fetch(`https://api.sleeper.app/v1/league/${lid}/drafts`, {cache:'no-store'}).then(r=>r.json()); }
  catch(e){ return null; }
  if(!Array.isArray(drafts) || drafts.length === 0) return null;
  // Pick the most recent rookie-style draft: typically rounds 4-6 for dynasty.
  // (Startup drafts have 15+ rounds; we don't want those for slot inference.)
  const rookieDrafts = drafts.filter(d => {
    const rounds = (d.settings || {}).rounds || 0;
    return rounds > 0 && rounds <= 6;
  });
  if(rookieDrafts.length === 0) return null;
  rookieDrafts.sort((a,b) => (b.start_time || 0) - (a.start_time || 0));
  const draft = rookieDrafts[0];
  const draftType = draft.type; // 'snake' | 'linear' | 'auction'
  if(draftType === 'auction') return null;
  const slotByRoster = {};
  // Path 1: slot_to_roster_id is populated (after draft is set up)
  const sToR = draft.slot_to_roster_id || {};
  if(Object.keys(sToR).length > 0){
    Object.entries(sToR).forEach(([slot, rid]) => {
      if(rid != null) slotByRoster[rid] = parseInt(slot);
    });
    return { slotByRoster, draftType, leagueSize: (rosters||[]).length };
  }
  // Path 2: fallback to draft_order (user_id → slot). Map via roster.owner_id.
  const draftOrder = draft.draft_order || {};
  if(Object.keys(draftOrder).length === 0) return null;
  const usedSlots = new Set();
  (rosters||[]).forEach(r => {
    if(r.owner_id && draftOrder[r.owner_id] != null){
      const s = parseInt(draftOrder[r.owner_id]);
      slotByRoster[r.roster_id] = s;
      usedSlots.add(s);
    }
  });
  // For orphaned rosters (no owner_id, so no draft_order entry), assign the
  // remaining slot(s). If exactly one orphan + one missing slot, easy match.
  const N = (rosters||[]).length;
  const unmapped = (rosters||[]).filter(r => slotByRoster[r.roster_id] == null);
  const missingSlots = [];
  for(let s=1; s<=N; s++) if(!usedSlots.has(s)) missingSlots.push(s);
  if(unmapped.length === missingSlots.length){
    unmapped.forEach((r, i) => { slotByRoster[r.roster_id] = missingSlots[i]; });
  }
  return { slotByRoster, draftType, leagueSize: N };
};

// Team strength snapshot: for each CURRENT-season dynasty league the user is in,
// fetch rosters, sum each team's FantasyCalc dynasty value (using the FC value set
// matched to THAT LEAGUE'S format — SF/1QB, PPR, TEP, league size), rank teams
// within the league, and find where the user lands. Then average those ranks
// across leagues.
//
// Per Evan: framed as a "matching signal" not a judgment — commissioners can use
// this both to find competitive players AND to find casual managers, depending on
// what they want for their league. Same data, two markets.
const lookupTeamStrength = async (userId, allLeagues) => {
  const targetSeason = String(LOOKUP_CURRENT_YEAR);
  let dynastyTarget = (allLeagues||[]).filter(lg =>
    (lg.settings||{}).type === 2 && lg._season === targetSeason
  );
  if(dynastyTarget.length === 0){
    const prior = String(LOOKUP_CURRENT_YEAR - 1);
    dynastyTarget = (allLeagues||[]).filter(lg =>
      (lg.settings||{}).type === 2 && lg._season === prior
    );
  }
  if(dynastyTarget.length === 0){
    return { leaguesCount: 0, avgRank: null, avgTeams: 0, ranks: [] };
  }
  const ranks = [];
  // Pick years/rounds we value (matches FantasyCalc's published generic-pick range)
  const PICK_YEARS = [LOOKUP_CURRENT_YEAR, LOOKUP_CURRENT_YEAR+1, LOOKUP_CURRENT_YEAR+2];
  const PICK_ROUNDS = [1, 2, 3, 4];
  await Promise.all(dynastyTarget.map(async (lg) => {
    try{
      const fmt = fcFormatForLeague(lg);
      const fcMap = await fetchFcForFormat(fmt);
      const valueOfPlayer = (pid) => fcMap[String(pid)] || 0;
      // Fetch rosters AND traded picks in parallel — picks add significant value
      // to dynasty rosters (a 2026 1st can be worth $3K+, a 2027 1st $3K+).
      // Without picks, contender teams that hold lots of picks get undervalued.
      const [rosters, tradedPicks] = await Promise.all([
        fetch(`https://api.sleeper.app/v1/league/${lg.league_id}/rosters`, {cache:'no-store'}).then(r=>r.json()),
        fetch(`https://api.sleeper.app/v1/league/${lg.league_id}/traded_picks`, {cache:'no-store'}).then(r=>r.json()).catch(()=>[]),
      ]);
      // Now that we have rosters, fetch draft slots for the current-year rookie
      // draft. This lets us use SLOT-SPECIFIC FC pick values for 2026 picks
      // ("2026 Pick 1.05" = $3,811 vs generic "2026 1st" = $3,214). Closes the
      // accuracy gap with FantasyCalc's website rankings for current-year picks.
      // For 2027/2028 we don't know slot order yet → use generic.
      const draftSlots = await lookupDraftSlots(lg.league_id, rosters);
      // Build pick ownership map: each roster starts owning their own picks for
      // PICK_YEARS × PICK_ROUNDS. Then apply traded_picks to redirect ownership.
      // Sleeper traded_picks entries: roster_id = original owner, owner_id = current owner.
      const rosterCount = (rosters||[]).length;
      const pickOwner = {}; // "year-round-origRid" → currentOwnerRid
      for(let r = 1; r <= rosterCount; r++){
        for(const y of PICK_YEARS){
          for(const round of PICK_ROUNDS){
            pickOwner[`${y}-${round}-${r}`] = r;
          }
        }
      }
      (tradedPicks||[]).forEach(tp => {
        const y = parseInt(tp.season);
        const round = tp.round;
        const orig = tp.roster_id;
        const cur = tp.owner_id;
        if(PICK_YEARS.includes(y) && PICK_ROUNDS.includes(round) && orig != null && cur != null){
          pickOwner[`${y}-${round}-${orig}`] = cur;
        }
      });
      // Aggregate pick value per current-owner roster
      const pickValByRoster = {};
      Object.keys(pickOwner).forEach(key => {
        const [yStr, roundStr, origStr] = key.split('-');
        const y = parseInt(yStr);
        const round = parseInt(roundStr);
        const origRosterId = parseInt(origStr);
        const owner = pickOwner[key];
        // Slot-specific value for current year, generic for future years
        let val;
        if(y === LOOKUP_CURRENT_YEAR && draftSlots && draftSlots.slotByRoster[origRosterId]){
          const r1Slot = draftSlots.slotByRoster[origRosterId];
          const slotInRound = slotInRoundFor(r1Slot, round, draftSlots.draftType, draftSlots.leagueSize);
          val = fcPickSlotValue(fmt.key, y, round, slotInRound);
        } else {
          val = fcPickValue(fmt.key, y, round);
        }
        pickValByRoster[owner] = (pickValByRoster[owner] || 0) + val;
      });
      const rosterValues = (rosters||[]).map(r => {
        const playerVal = (r.players||[]).reduce((sum, pid) => sum + valueOfPlayer(pid), 0);
        const pickVal = pickValByRoster[r.roster_id] || 0;
        return {
          roster_id: r.roster_id,
          owner_id: r.owner_id,
          co_owners: r.co_owners || [],
          totalValue: playerVal + pickVal,
        };
      });
      rosterValues.sort((a,b) => b.totalValue - a.totalValue);
      const userIndex = rosterValues.findIndex(r =>
        r.owner_id === userId || r.co_owners.includes(userId)
      );
      if(userIndex >= 0){
        ranks.push({
          league_name: lg.name,
          rank: userIndex + 1,
          total_teams: rosterValues.length,
        });
      }
    }catch(e){}
  }));
  if(ranks.length === 0){
    return { leaguesCount: 0, avgRank: null, avgTeams: 0, ranks: [] };
  }
  const avgRank = ranks.reduce((s, r) => s + r.rank, 0) / ranks.length;
  const avgTeams = ranks.reduce((s, r) => s + r.total_teams, 0) / ranks.length;
  return { leaguesCount: ranks.length, avgRank, avgTeams, ranks };
};

// Format a date as "X time ago" (e.g. "2 hours ago", "3 days ago", "5 yrs ago")
const lookupTimeAgo = (date) => {
  if(!date) return null;
  const d = (date instanceof Date) ? date : new Date(date);
  if(isNaN(d.getTime())) return null;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if(sec < 60) return `${sec} sec ago`;
  if(sec < 3600) return `${Math.floor(sec/60)} min ago`;
  if(sec < 86400) return `${Math.floor(sec/3600)} hours ago`;
  if(sec < 86400*30) return `${Math.floor(sec/86400)} days ago`;
  if(sec < 86400*365) return `${Math.floor(sec/(86400*30))} months ago`;
  const yrs = Math.floor(sec/(86400*365));
  return `${yrs} ${yrs===1?'yr':'yrs'} ago`;
};

// ---------- Lookup search page ----------
function LookupSearch(){
  const [query,setQuery] = useState('');
  const [err,setErr] = useState('');
  const submit = (e) => {
    if(e) e.preventDefault();
    const q = query.trim();
    if(!q){ setErr('Enter a Sleeper username or user ID'); return; }
    window.location.href = '/lookup/' + encodeURIComponent(q);
  };
  return (
    <div style={{maxWidth:680,margin:'80px auto',padding:'0 20px',color:'#eee',textAlign:'center'}}>
      <div style={{fontSize:32,fontWeight:900,color:'#FFD700',letterSpacing:3,marginBottom:10}}>🔍 SLEEPER SNAPSHOT</div>
      <div style={{fontSize:14,color:'#bbb',marginBottom:30,letterSpacing:0.3,lineHeight:1.6,maxWidth:540,margin:'0 auto 30px'}}>Type any Sleeper username to instantly see their account age, total dynasty leagues, trade activity, orphan history, and roster average dynasty value. Vet new leaguemates in seconds.</div>
      <form onSubmit={submit} style={{display:'flex',gap:8,marginBottom:14}}>
        <input
          value={query} onChange={e=>{setQuery(e.target.value); setErr('');}}
          placeholder="Sleeper username (e.g. ej97)"
          style={{flex:1,padding:'14px 18px',background:'#0a0a0a',border:'1.5px solid #FFD70066',borderRadius:8,color:'#fff',fontSize:16,fontFamily:'inherit'}}/>
        <button type="submit" style={{padding:'14px 24px',background:'#FFD700',border:'none',borderRadius:8,color:'#000',fontWeight:900,fontSize:14,letterSpacing:1.5,cursor:'pointer',whiteSpace:'nowrap'}}>LOOKUP →</button>
      </form>
      {err && <div style={{padding:'10px 14px',background:'#3a1010',border:'1px solid #ef4444',borderRadius:6,color:'#ef4444',fontSize:13,marginBottom:14}}>{err}</div>}
    </div>
  );
}

// ---------- Lookup profile page ----------
function LookupProfile({ identifier }){
  const [user,setUser] = useState(null);
  const [leagues,setLeagues] = useState(null);
  const [orphan,setOrphan] = useState(null);
  const [loading,setLoading] = useState(true);
  const [err,setErr] = useState('');
  const [linkCopied,setLinkCopied] = useState(false);
  // Trade activity loads in the background after the rest of the profile renders
  // (it's heavy — ~200 API calls for an active user). null = not yet loaded.
  const [tradeActivity,setTradeActivity] = useState(null);
  const [tradeLoading,setTradeLoading] = useState(false);
  // Recent trades modal (shared with Trade Finder). Open when the commish wants
  // to scout a user's actual trade history for collusion patterns. Stays simple
  // — passes the looked-up user, lets the modal scan + render.
  const [tradesModalOpen,setTradesModalOpen] = useState(false);
  const [fcAssetIndex,setFcAssetIndex] = useState(null); // for player name resolution
  useEffect(() => {
    // Lazy-load FC's rich asset list (with names) so the trades modal can render
    // "Bijan Robinson" instead of "Player #4866". One-time module-cached fetch.
    fetchTradeFinderAssets().then(setFcAssetIndex);
  },[]);
  const lookupResolvePlayerName = (pid) => {
    if(!fcAssetIndex || !pid) return `Player #${pid}`;
    const hit = fcAssetIndex.find(a => a.sleeperId && String(a.sleeperId) === String(pid));
    return hit ? hit.name : `Player #${pid}`;
  };
  // Team strength (avg power-rank across current dynasty leagues) — also background.
  const [teamStrength,setTeamStrength] = useState(null);
  const [strengthLoading,setStrengthLoading] = useState(false);
  // Snapshot share state — same pattern as the dispersal share-pool feature.
  const profileCardRef = useRef(null);
  const [profileShareBusy,setProfileShareBusy] = useState(false);
  const [desktopShare,setDesktopShare] = useState(null);
  const [shareToast,setShareToast] = useState('');

  useEffect(()=>{
    let cancelled = false;
    (async () => {
      setLoading(true); setErr('');
      try{
        const u = await lookupResolveUser(identifier);
        if(cancelled) return;
        setUser(u);
        const lgs = await lookupAllLeagues(u.user_id);
        if(cancelled) return;
        setLeagues(lgs);
        const o = await lookupOrphanHistory(u.user_id, lgs);
        if(cancelled) return;
        setOrphan(o);
      }catch(e){ if(!cancelled) setErr(e.message || 'Lookup failed'); }
      finally{ if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled = true; };
  },[identifier]);

  // Background load: trade activity. Fires after main profile data lands.
  useEffect(()=>{
    if(!user || !leagues) return;
    let cancelled = false;
    (async () => {
      setTradeLoading(true);
      try{
        const ta = await lookupTradeActivity(user.user_id, leagues);
        if(!cancelled) setTradeActivity(ta);
      }catch(e){}
      finally{ if(!cancelled) setTradeLoading(false); }
    })();
    return ()=>{ cancelled = true; };
  },[user, leagues]);

  // Background load: team strength (avg power rank). Runs in parallel with trade activity.
  useEffect(()=>{
    if(!user || !leagues) return;
    let cancelled = false;
    (async () => {
      setStrengthLoading(true);
      try{
        const ts = await lookupTeamStrength(user.user_id, leagues);
        if(!cancelled) setTeamStrength(ts);
      }catch(e){}
      finally{ if(!cancelled) setStrengthLoading(false); }
    })();
    return ()=>{ cancelled = true; };
  },[user, leagues]);

  const copyLink = () => {
    try{ navigator.clipboard.writeText(window.location.href); }catch(e){}
    setLinkCopied(true);
    setTimeout(()=>setLinkCopied(false), 2000);
  };

  // 📸 SHARE PROFILE — captures the off-screen profile card and:
  //   mobile: native share sheet (Photos / iMessage / X / Discord)
  //   desktop: pops a modal with Download / Copy / Share to X
  // Same pattern as the dispersal share-pool feature.
  const shareProfileImage = async () => {
    if(!window.html2canvas){ alert('Screenshot library not loaded yet — refresh and try again.'); return; }
    if(!profileCardRef.current){ alert('Profile card not ready — try again in a sec.'); return; }
    setProfileShareBusy(true);
    try{
      const canvas = await window.html2canvas(profileCardRef.current, { backgroundColor:'#080808', scale:2, useCORS:true });
      const filename = `pfk_${(user?.username||user?.user_id||'profile').replace(/[^a-z0-9]/gi,'_')}.png`;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
      if(isMobile && blob && navigator.canShare){
        const file = new File([blob], filename, { type:'image/png' });
        if(navigator.canShare({ files:[file] })){
          try{
            await navigator.share({ files:[file], title:`PFK profile — ${user?.display_name || user?.username || ''}` });
            return;
          }catch(e){ if(e && e.name==='AbortError') return; }
        }
      }
      if(isMobile){
        // Mobile fallback when Web Share isn't supported
        const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename; link.href = url;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        if(blob) setTimeout(()=>URL.revokeObjectURL(url), 1000);
        return;
      }
      // Desktop: pop the share modal so user picks an action
      if(blob){
        setShareToast('');
        setDesktopShare({ blob, filename });
      }
    }catch(e){ alert('Share failed: ' + (e.message||e)); }
    finally{ setProfileShareBusy(false); }
  };

  if(loading){
    return <div style={{maxWidth:680,margin:'80px auto',textAlign:'center',color:'#aaa',fontSize:14}}>Looking up <span style={{color:'#FFD700',fontFamily:'monospace'}}>{identifier}</span>…</div>;
  }
  if(err){
    return (
      <div style={{maxWidth:680,margin:'80px auto',padding:'0 20px',textAlign:'center',color:'#eee'}}>
        <div style={{padding:'20px 24px',background:'#3a1010',border:'1px solid #ef4444',borderRadius:8,color:'#ef4444',fontSize:14,marginBottom:18}}>{err}</div>
        <a href="/lookup" style={{color:'#FFD700',textDecoration:'none',fontWeight:800}}>← Try another lookup</a>
      </div>
    );
  }

  // Stats — dynasty-focused since that's PFK's audience.
  // Sleeper league.settings.type: 0=redraft, 1=keeper, 2=dynasty
  // Use dynamic current year (we're in 2026 now — not all leagues have 2025 listings).
  const lgs = leagues || [];
  const activeYear = String(LOOKUP_CURRENT_YEAR);
  let activeLeagues = lgs.filter(l => l._season === activeYear);
  let displayedActiveYear = activeYear;
  // Fallback: if current year has no leagues at all (very early offseason before
  // anyone's rolled over), show prior year so we still display something useful.
  if(activeLeagues.length === 0){
    const prior = String(LOOKUP_CURRENT_YEAR - 1);
    const priorLeagues = lgs.filter(l => l._season === prior);
    if(priorLeagues.length > 0){
      activeLeagues = priorLeagues;
      displayedActiveYear = prior;
    }
  }
  const dynastyActive = activeLeagues.filter(l => (l.settings||{}).type === 2);
  // Sleeper user object: created may be a unix ms timestamp
  const createdMs = user.metadata?.created || user.created;
  const createdDate = createdMs ? new Date(Number(createdMs)) : null;

  const sectionHdr = {fontSize:11,color:'#FFD700',fontWeight:800,letterSpacing:1.5,marginBottom:10};
  const card = {background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:10,padding:'18px 22px',marginBottom:14};

  return (
    <div style={{maxWidth:680,margin:'40px auto',padding:'0 20px',color:'#eee'}}>
      {/* Profile header */}
      <div style={{...card,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        {user.avatar && <img src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} alt="" style={{width:64,height:64,borderRadius:'50%',objectFit:'cover',background:'#0a0a0a',border:'1px solid #1e1e1e'}} onError={e=>e.target.style.display='none'}/>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:24,fontWeight:900,color:'#FFD700',letterSpacing:0.5,wordBreak:'break-word'}}>{user.display_name || user.username}</div>
          <div style={{fontSize:12,color:'#666',marginTop:2}}>{user.username && user.username !== user.display_name ? `@${user.username} · ` : ''}user_id <code style={{color:'#888'}}>{user.user_id}</code></div>
          {createdDate && <div style={{fontSize:13,color:'#aaa',marginTop:6}}>Account created: <span style={{color:'#fff'}}>{createdDate.toISOString().slice(0,10)}</span> ({lookupTimeAgo(createdDate)})</div>}
        </div>
        <button onClick={shareProfileImage} disabled={profileShareBusy} title="Share a PFK-branded snapshot of this profile" style={{padding:'10px 14px',background:profileShareBusy?'#222':'transparent',border:'1.5px solid '+(profileShareBusy?'#444':'#FFD700'),borderRadius:7,color:profileShareBusy?'#888':'#FFD700',fontWeight:900,cursor:profileShareBusy?'default':'pointer',fontSize:12,letterSpacing:1.2,whiteSpace:'nowrap'}}>{profileShareBusy?'BUILDING…':'📸 SHARE'}</button>
      </div>

      {/* Activity snapshot — dynasty-focused */}
      <div style={card}>
        <div style={sectionHdr}>📊 ACTIVITY SNAPSHOT</div>
        <div style={{padding:'14px 16px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
          <div style={{fontSize:32,fontWeight:900,color:'#FFD700'}}>{dynastyActive.length}</div>
          <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>DYNASTY LEAGUES ({displayedActiveYear})</div>
        </div>
      </div>

      {/* Trade activity — current + prior season. Both load in background.
          Showing both gives commish more data points early in a new season. */}
      <div style={card}>
        <div style={sectionHdr}>🤝 TRADE ACTIVITY</div>
        {tradeLoading && !tradeActivity && (
          <div style={{padding:'14px',color:'#666',fontSize:13,textAlign:'center'}}>Counting trades across leagues…</div>
        )}
        {tradeActivity && (() => {
          // Inline sub-section renderer. Current year shows TOTAL / AVG / LAST TRADE
          // (LAST TRADE is the live "is this person trading now" signal).
          // Prior years drop LAST TRADE since it's always "X months ago" by definition
          // (always end-of-playoffs-ish) — useless info per Evan.
          const renderSeason = (data, label, showLastTrade) => {
            if(!data || data.leaguesCount === 0){
              return (
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:'#a78bfa',fontWeight:800,letterSpacing:1.5,marginBottom:6}}>{label}</div>
                  <div style={{padding:'10px 14px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,fontSize:12,color:'#888',textAlign:'center'}}>No dynasty leagues found for this season.</div>
                </div>
              );
            }
            return (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'#a78bfa',fontWeight:800,letterSpacing:1.5,marginBottom:6}}>{label}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8}}>
                  <div style={{padding:'10px 12px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                    <div style={{fontSize:22,fontWeight:900,color:'#FFD700'}}>{data.totalTrades}</div>
                    <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:3}}>TOTAL TRADES</div>
                  </div>
                  <div style={{padding:'10px 12px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                    <div style={{fontSize:22,fontWeight:900,color:'#FFD700'}}>{data.avgPerLeague.toFixed(1)}</div>
                    <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:3}}>AVG PER LEAGUE</div>
                  </div>
                  {showLastTrade && (
                    <div style={{padding:'10px 12px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                      <div style={{fontSize:16,fontWeight:900,color:'#FFD700',lineHeight:1.2}}>{data.lastTradeDate ? lookupTimeAgo(data.lastTradeDate) : 'none'}</div>
                      <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:3}}>LAST TRADE</div>
                    </div>
                  )}
                </div>
                <div style={{fontSize:11,color:'#555',marginTop:6,fontStyle:'italic'}}>Across {data.leaguesCount} dynasty {data.leaguesCount===1?'league':'leagues'}.</div>
              </div>
            );
          };
          return (
            <>
              {renderSeason(tradeActivity.current, `${tradeActivity.current?.season || LOOKUP_CURRENT_YEAR} (CURRENT)`, true)}
              {renderSeason(tradeActivity.prior, `${tradeActivity.prior?.season || LOOKUP_CURRENT_YEAR-1} SEASON`, false)}
              {renderSeason(tradeActivity.prior2, `${tradeActivity.prior2?.season || LOOKUP_CURRENT_YEAR-2} SEASON`, false)}
            </>
          );
        })()}
        {/* Recent trades CTA — opens the same modal Trade Finder uses, scoped
            to this user across all their dynasty leagues. Useful for commish
            collusion scouting (facts only — they draw their own conclusions). */}
        {user && (
          <button onClick={() => setTradesModalOpen(true)}
                  style={{marginTop:8,width:'100%',padding:'12px 14px',background:'#0a0a0a',border:'1.5px solid #FFD70066',borderRadius:8,color:'#FFD700',fontWeight:800,fontSize:13,letterSpacing:0.5,cursor:'pointer'}}>
            🔍 View Recent Trades →
          </button>
        )}
        <div style={{fontSize:11,color:'#666',marginTop:6,lineHeight:1.5}}>See up to 25 of this user's most recent dynasty trades across every league they're in. Useful for spotting unusual patterns (commish collusion checks).</div>
      </div>

      {/* Team strength — avg power-rank by FantasyCalc value across current dynasty leagues */}
      <div style={card}>
        <div style={sectionHdr}>💪 AVG DYNASTY VALUE STANDINGS</div>
        <div style={{fontSize:12,color:'#aaa',marginTop:-4,marginBottom:12,lineHeight:1.5}}>Where you rank in dynasty value on avg across all your leagues. <span style={{color:'#666'}}>Values via fantasycalc.com.</span></div>
        {strengthLoading && !teamStrength && (
          <div style={{padding:'14px',color:'#666',fontSize:13,textAlign:'center'}}>Calculating roster ranks across leagues…</div>
        )}
        {teamStrength && teamStrength.leaguesCount === 0 && (
          <div style={{padding:'14px',color:'#888',fontSize:13,textAlign:'center'}}>No current dynasty leagues to rank.</div>
        )}
        {teamStrength && teamStrength.leaguesCount > 0 && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12}}>
              <div style={{padding:'12px 14px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:900,color:'#FFD700'}}>{teamStrength.avgRank.toFixed(1)}</div>
                <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>AVG RANK</div>
              </div>
              <div style={{padding:'12px 14px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:900,color:'#FFD700'}}>{teamStrength.avgTeams.toFixed(0)}</div>
                <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>TYPICAL LEAGUE SIZE</div>
              </div>
              <div style={{padding:'12px 14px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:900,color:'#FFD700'}}>{teamStrength.leaguesCount}</div>
                <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>LEAGUES</div>
              </div>
            </div>
            <div style={{fontSize:11,color:'#555',marginTop:10,fontStyle:'italic',lineHeight:1.6}}>Co-managed leagues where this user isn't the primary manager aren't factored in.</div>
          </>
        )}
      </div>

      {/* Orphan history — dynasty leagues only */}
      <div style={card}>
        <div style={sectionHdr}>🪦 DYNASTY ORPHAN HISTORY</div>
        <div style={{fontSize:13,color:'#aaa',lineHeight:1.7}}>Past <strong style={{color:'#fff'}}>dynasty</strong> leagues this user appears to have left between seasons. Redraft / keeper leagues that ended naturally are not counted.</div>
        <div style={{display:'flex',gap:14,marginTop:10,flexWrap:'wrap'}}>
          <div style={{padding:'8px 14px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:6,fontSize:13}}>Last 12 months: <strong style={{color:'#FFD700',fontSize:16,marginLeft:6}}>{orphan?.last12mo ?? 0}</strong></div>
          <div style={{padding:'8px 14px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:6,fontSize:13}}>Last 24 months: <strong style={{color:'#FFD700',fontSize:16,marginLeft:6}}>{orphan?.last24mo ?? 0}</strong></div>
          {orphan && orphan.uniqueLeagues > 0 && (
            <div style={{padding:'8px 14px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:6,fontSize:13}}>Orphan rate: <strong style={{color:'#FFD700',fontSize:16,marginLeft:6}}>{orphan.orphanRatePct.toFixed(1)}%</strong> <span style={{color:'#666',marginLeft:4,fontSize:11}}>({orphan.all} of {orphan.uniqueLeagues})</span></div>
          )}
        </div>
        {orphan?.details && orphan.details.length > 0 && (
          <details style={{marginTop:12}}>
            <summary style={{cursor:'pointer',color:'#aaa',fontSize:12}}>Show details</summary>
            <div style={{marginTop:8,fontSize:12,color:'#bbb',lineHeight:1.7}}>
              {orphan.details.map((d,i)=>(<div key={i}>• {d.league_name} ({d.season_left})</div>))}
            </div>
          </details>
        )}
      </div>

      {/* Share + opt-out */}
      <div style={card}>
        <div style={sectionHdr}>🔗 PROFILE LINK</div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <code style={{flex:1,minWidth:200,padding:'8px 12px',background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:6,color:'#FFD700',fontSize:12,wordBreak:'break-all'}}>{window.location.href}</code>
          <button onClick={copyLink} style={{padding:'8px 14px',background:linkCopied?'#10b981':'#FFD700',border:'none',borderRadius:6,color:'#000',fontWeight:900,fontSize:12,letterSpacing:1,cursor:'pointer',whiteSpace:'nowrap'}}>{linkCopied?'✓ COPIED':'📋 COPY'}</button>
        </div>
      </div>

      <div style={{textAlign:'center',marginTop:24,marginBottom:40,fontSize:12,color:'#666'}}>
        <div style={{marginBottom:8}}>Is this you and you'd rather not be searchable?</div>
        <a href={`mailto:ej@playforkeepsdynasty.com?subject=PFK%20Lookup%20opt-out%20request&body=Please%20remove%20my%20PFK%20Lookup%20profile.%0A%0ASleeper%20username%3A%20${encodeURIComponent(user.username||'')}%0ASleeper%20user_id%3A%20${encodeURIComponent(user.user_id||'')}`}
           style={{color:'#FFD700',textDecoration:'underline'}}>Email us to opt out →</a>
        <div style={{marginTop:18}}>
          <a href="/lookup" style={{color:'#888',textDecoration:'none',fontWeight:700}}>← Search another user</a>
        </div>
      </div>

      {/* Desktop share modal — same 3-action pattern as the dispersal share-pool flow */}
      {desktopShare && (() => {
        const closeModal = () => { setDesktopShare(null); setShareToast(''); };
        const doDownload = () => {
          const url = URL.createObjectURL(desktopShare.blob);
          const link = document.createElement('a');
          link.download = desktopShare.filename; link.href = url;
          document.body.appendChild(link); link.click(); document.body.removeChild(link);
          setTimeout(()=>URL.revokeObjectURL(url), 1000);
          setShareToast('Downloaded ✓'); setTimeout(closeModal, 900);
        };
        const doCopy = async () => {
          try{
            if(!window.ClipboardItem || !navigator.clipboard?.write){
              setShareToast('Copy not supported in this browser — use Download instead'); return;
            }
            await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': desktopShare.blob })]);
            setShareToast('Copied to clipboard ✓ — paste anywhere');
            setTimeout(closeModal, 1400);
          }catch(e){ setShareToast('Copy failed: ' + (e.message||e)); }
        };
        const doShareToX = async () => {
          let copied = false;
          try{
            if(window.ClipboardItem && navigator.clipboard?.write){
              await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': desktopShare.blob })]);
              copied = true;
            }
          }catch(e){}
          const tweetText = `Sleeper background check on @${user?.username || user?.display_name || 'this manager'} — built with @PlayforkeepsFF\n${window.location.href}`;
          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
          setShareToast(copied ? 'Image copied — paste it into the tweet (Cmd/Ctrl+V)' : 'Tweet opened — image not auto-copied (use Copy first)');
          setTimeout(closeModal, 2400);
        };
        return (
          <div onClick={closeModal} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
            <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:440,background:'#0f0f0f',border:'2px solid #FFD700',borderRadius:12,padding:'22px 24px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontWeight:900,fontSize:15,letterSpacing:1.5,color:'#FFD700'}}>📸 SHARE PROFILE</div>
                <button onClick={closeModal} style={{background:'none',border:'none',color:'#888',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{fontSize:13,color:'#aaa',marginBottom:14,lineHeight:1.5}}>Image is ready. Pick what to do with it:</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <button onClick={doDownload} style={{padding:'12px 16px',background:'#0a1f10',border:'1.5px solid #10b981',borderRadius:7,color:'#10b981',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1,textAlign:'left'}}>📥 &nbsp;DOWNLOAD &nbsp;<span style={{fontWeight:600,color:'#888',fontSize:12,letterSpacing:0.3}}>· save .png to your computer</span></button>
                <button onClick={doCopy} style={{padding:'12px 16px',background:'transparent',border:'1.5px solid #FFD700',borderRadius:7,color:'#FFD700',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1,textAlign:'left'}}>📋 &nbsp;COPY TO CLIPBOARD &nbsp;<span style={{fontWeight:600,color:'#888',fontSize:12,letterSpacing:0.3}}>· paste into iMessage, Slack, etc.</span></button>
                <button onClick={doShareToX} style={{padding:'12px 16px',background:'#000',border:'1.5px solid #fff',borderRadius:7,color:'#fff',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:1,textAlign:'left',display:'flex',alignItems:'center',gap:8}}>
                  <svg viewBox="0 0 24 24" style={{width:16,height:16}}>
                    <path fill="#fff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  &nbsp;SHARE TO X &nbsp;<span style={{fontWeight:600,color:'#888',fontSize:12,letterSpacing:0.3}}>· copies image + opens tweet</span>
                </button>
              </div>
              {shareToast && <div style={{marginTop:14,padding:'10px 12px',background:'#0a2a1a',border:'1px solid #10b981',borderRadius:7,color:'#10b981',fontSize:12,fontWeight:700,textAlign:'center'}}>{shareToast}</div>}
            </div>
          </div>
        );
      })()}

      {/* Off-screen share card — captured via html2canvas. Painted at -99999px so
          the layout is correct without ever being visible to the user. */}
      <div style={{position:'fixed',left:'-99999px',top:0,pointerEvents:'none'}} aria-hidden="true">
        <div ref={profileCardRef} style={{width:780,background:'#080808',padding:'30px 34px',color:'#f0f0f0',fontFamily:"'Inter','Segoe UI',sans-serif",border:'3px solid #FFD700',borderRadius:14,boxSizing:'border-box'}}>
          {/* Card header — PFK brand + logo centered on top, user info below */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14,marginBottom:14,paddingBottom:14,borderBottom:'2px solid #FFD70044'}}>
            <img src="/img/pfk-logo.jpg" alt="PFK" style={{height:48,width:'auto',objectFit:'contain',flexShrink:0}}/>
            <div style={{fontSize:22,fontWeight:900,color:'#FFD700',letterSpacing:2.5}}>PLAY FOR KEEPS</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}>
            {/* Real Sleeper avatar — proxied through /api/avatar/{id} so it's
                same-origin (sleepercdn.com doesn't send CORS headers; html2canvas
                couldn't read the pixels otherwise). Falls back to an initial-
                letter placeholder if the proxy fetch fails for any reason. */}
            {user.avatar
              ? <img src={`/api/avatar/${user.avatar}`} alt="" style={{width:54,height:54,borderRadius:'50%',objectFit:'cover',background:'#0a0a0a',border:'1px solid #1e1e1e',flexShrink:0}} onError={e=>{e.target.style.display='none'; const fb = e.target.nextElementSibling; if(fb) fb.style.display='flex';}}/>
              : null}
            <div style={{width:54,height:54,borderRadius:'50%',background:'#FFD700',display: user.avatar ? 'none' : 'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:24,fontWeight:900,color:'#000',letterSpacing:0,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
              {((user.display_name || user.username || '?')[0] || '?').toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:24,fontWeight:900,color:'#fff',letterSpacing:0.5,wordBreak:'break-word'}}>{user.display_name || user.username}</div>
              {createdDate && <div style={{fontSize:12,color:'#888',marginTop:2}}>Account {lookupTimeAgo(createdDate)}</div>}
            </div>
          </div>

          {/* Avg dynasty value standings */}
          {teamStrength && teamStrength.leaguesCount > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:900,color:'#FFD700',letterSpacing:2,marginBottom:8}}>💪 AVG DYNASTY VALUE STANDINGS</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                <div style={{padding:'12px 14px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                  <div style={{fontSize:24,fontWeight:900,color:'#FFD700',lineHeight:1}}>{teamStrength.avgRank.toFixed(1)}</div>
                  <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>AVG RANK</div>
                </div>
                <div style={{padding:'12px 14px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                  <div style={{fontSize:24,fontWeight:900,color:'#FFD700',lineHeight:1}}>{teamStrength.avgTeams.toFixed(0)}</div>
                  <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>TYPICAL LEAGUE SIZE</div>
                </div>
                <div style={{padding:'12px 14px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                  <div style={{fontSize:24,fontWeight:900,color:'#FFD700',lineHeight:1}}>{teamStrength.leaguesCount}</div>
                  <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>LEAGUES</div>
                </div>
              </div>
            </div>
          )}

          {/* Trade activity — current shows LAST TRADE; prior years drop it (always stale) */}
          {tradeActivity && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:900,color:'#FFD700',letterSpacing:2,marginBottom:8}}>🤝 TRADE ACTIVITY</div>
              {[
                { label: `${tradeActivity.current?.season || LOOKUP_CURRENT_YEAR} (CURRENT)`, data: tradeActivity.current, showLast: true },
                { label: `${tradeActivity.prior?.season || LOOKUP_CURRENT_YEAR-1} SEASON`, data: tradeActivity.prior, showLast: false },
                { label: `${tradeActivity.prior2?.season || LOOKUP_CURRENT_YEAR-2} SEASON`, data: tradeActivity.prior2, showLast: false },
              ].map((s, idx) => s.data && s.data.leaguesCount > 0 && (
                <div key={idx} style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:'#a78bfa',fontWeight:800,letterSpacing:1.5,marginBottom:5}}>{s.label}</div>
                  <div style={{display:'grid',gridTemplateColumns: s.showLast ? '1fr 1fr 1fr' : '1fr 1fr',gap:8}}>
                    <div style={{padding:'10px 12px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                      <div style={{fontSize:20,fontWeight:900,color:'#FFD700'}}>{s.data.totalTrades}</div>
                      <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:3}}>TOTAL TRADES</div>
                    </div>
                    <div style={{padding:'10px 12px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                      <div style={{fontSize:20,fontWeight:900,color:'#FFD700'}}>{s.data.avgPerLeague.toFixed(1)}</div>
                      <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:3}}>AVG / LEAGUE</div>
                    </div>
                    {s.showLast && (
                      <div style={{padding:'10px 12px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                        <div style={{fontSize:14,fontWeight:900,color:'#FFD700',lineHeight:1.3}}>{s.data.lastTradeDate ? lookupTimeAgo(s.data.lastTradeDate) : 'none'}</div>
                        <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:3}}>LAST TRADE</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Orphan history — last 12mo / 24mo + overall orphan rate % */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:900,color:'#FFD700',letterSpacing:2,marginBottom:8}}>🪦 DYNASTY ORPHAN HISTORY</div>
            <div style={{display:'flex',gap:10}}>
              <div style={{flex:1,padding:'12px 14px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:900,color:'#FFD700',lineHeight:1}}>{orphan?.last12mo ?? 0}</div>
                <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>LAST 12 MONTHS</div>
              </div>
              <div style={{flex:1,padding:'12px 14px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:900,color:'#FFD700',lineHeight:1}}>{orphan?.last24mo ?? 0}</div>
                <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>LAST 24 MONTHS</div>
              </div>
              {orphan && orphan.uniqueLeagues > 0 && (
                <div style={{flex:1,padding:'12px 14px',background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:8,textAlign:'center'}}>
                  <div style={{fontSize:24,fontWeight:900,color:'#FFD700',lineHeight:1}}>{orphan.orphanRatePct.toFixed(1)}%</div>
                  <div style={{fontSize:9,color:'#888',fontWeight:800,letterSpacing:1.5,marginTop:4}}>ORPHAN RATE</div>
                  <div style={{fontSize:9,color:'#666',fontWeight:700,marginTop:2}}>{orphan.all} of {orphan.uniqueLeagues}</div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{paddingTop:16,borderTop:'2px solid #FFD70044',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,color:'#888',fontWeight:800,letterSpacing:1.5,marginBottom:3}}>LOOK UP ANY SLEEPER USER AT</div>
              <div style={{fontSize:16,fontWeight:900,color:'#FFD700',letterSpacing:0.5}}>playforkeepsdynasty.com/lookup</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <svg viewBox="0 0 24 24" style={{width:18,height:18,flexShrink:0}}>
                <path fill="#FFD700" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <div style={{fontSize:14,fontWeight:900,color:'#FFD700',letterSpacing:0.5}}>@PlayforkeepsFF</div>
            </div>
          </div>
        </div>
      </div>
      {/* Recent trades modal — opens from the Trade Activity card's CTA. No
          relevantContext (we're not in a Trade Finder flow), so the ★ Relevant
          tab doesn't render — modal just shows All trades. */}
      {tradesModalOpen && user && (
        <RecentTradesModal
          userInfo={{
            user_id: user.user_id,
            username: user.username,
            display_name: user.display_name || user.username,
            avatar: user.avatar,
          }}
          onClose={() => setTradesModalOpen(false)}
          resolvePlayerName={lookupResolvePlayerName}
        />
      )}
    </div>
  );
}

// ---------- Top-level Lookup page (route: /lookup[/identifier]) ----------
// Quick search input for the header — only renders on profile pages so users
// can run a new lookup without navigating back to /lookup.
function LookupHeaderSearch(){
  const [q,setQ] = useState('');
  const submit = (e) => {
    if(e) e.preventDefault();
    const v = (q||'').trim();
    if(!v) return;
    window.location.href = '/lookup/' + encodeURIComponent(v);
  };
  return (
    <form onSubmit={submit} style={{display:'flex',gap:6,alignItems:'center'}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 New lookup…"
        style={{padding:'6px 10px',background:'#0a0a0a',border:'1px solid #FFD70055',borderRadius:6,color:'#fff',fontSize:13,fontFamily:'inherit',width:160}}/>
      <button type="submit" style={{padding:'6px 11px',background:'#FFD700',border:'none',borderRadius:6,color:'#000',fontWeight:900,fontSize:11,letterSpacing:1,cursor:'pointer'}}>GO</button>
    </form>
  );
}

function LookupApp({ identifier }){
  // Safety-net redirect: if someone hits /lookup directly (typed URL, bookmark,
  // old browser back) AND has a Sleeper account linked, send them straight to
  // their own snapshot. The toolbar's smart href handles the click case; this
  // catches everything else. Use replace() so back-button doesn't bounce them
  // back into a redirect loop.
  const [linkedUser] = useSleeperUser();
  useEffect(() => {
    if(!identifier && linkedUser?.username){
      window.location.replace('/lookup/' + encodeURIComponent(linkedUser.username));
    }
  },[identifier, linkedUser?.username]);
  return (
    <div style={{background:'#080808',minHeight:'100vh',color:'#f0f0f0',fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <MasterToolbar currentTab="lookup"/>
      {/* Quick lookup bar lives BELOW the yellow line on profile pages so it sits in
          the page-specific area, not in the master toolbar. Search page omits it
          since it already has the big input. */}
      {identifier && (
        <div style={{maxWidth:1240,margin:'0 auto',padding:'12px 16px 0'}}>
          <LookupHeaderSearch/>
        </div>
      )}
      {identifier ? <LookupProfile identifier={identifier}/> : <LookupSearch/>}
    </div>
  );
}

// ============================================================================
// ⚖️ TRADE FINDER
// "Type 1.03 → see every veteran (and pick) within ±X% of its value, grouped
// by position." Fills a gap that KTC, FantasyCalc, and DynastyProcess all
// share: every existing calculator forces a two-sided trade entry, so users
// have to already know what to type. Trade Finder reverses the flow.
// Default format: Superflex 1.0 PPR (PFK's standard everywhere else).
// ============================================================================

// Cache rich asset arrays per FC format key so swapping leagues only re-fetches
// once per unique format combo (most users have 2-4 distinct formats max).
const _tfRichByFormat = {};
// Default format when no league is linked, per Evan: Superflex / 1.0 PPR / 0.5 TEP / 12 teams.
// Pass TD baseline (5pt) is implicit — ptdAdjust treats 5 as no-op, and the chip
// shows "5pt PT" via formatLabel's pass-TD fallback.
const TF_DEFAULT_FORMAT = { numQbs: 2, ppr: 1, tepLevel: 1, numTeams: 12, key: '2q-1p-1t-12n' };
const fetchTradeFinderAssets = async (fmt = TF_DEFAULT_FORMAT) => {
  if(_tfRichByFormat[fmt.key]) return _tfRichByFormat[fmt.key];
  try{
    const url = `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${fmt.numQbs}&numTeams=${fmt.numTeams}&ppr=${fmt.ppr}&tepLevel=${fmt.tepLevel}`;
    const arr = await fetch(url).then(r=>r.json());
    const assets = (arr||[]).map(row => {
      const p = row?.player || {};
      const name = p.name || '';
      const pos = (p.position || '').toUpperCase();
      const value = row?.value ?? 0;
      const isPick = /^\d{4}\s+(1st|2nd|3rd|4th|5th)$/.test(name) || /^\d{4}\s+Pick\s/.test(name);
      const isSlotPick = /^\d{4}\s+Pick\s/.test(name);
      // Generic round picks ("2026 1st") clutter results next to slot picks ("2026 Pick 1.03")
      // and confuse users — slot picks are more accurate so we hide the generic ones.
      if(isPick && !isSlotPick) return null;
      return {
        name,
        normName: (name||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim(),
        pos: isPick ? 'PICK' : (pos || 'OTHER'),
        age: p.maturedYear ? null : (p.age ?? null),
        value,
        isPick,
        sleeperId: p.sleeperId || null,
      };
    }).filter(Boolean).filter(a => a.value > 0);
    _tfRichByFormat[fmt.key] = assets;
  }catch(e){
    _tfRichByFormat[fmt.key] = [];
  }
  return _tfRichByFormat[fmt.key];
};

// Per-position pass-TD multiplier. FC's API doesn't differentiate values by
// pass TD scoring, so we apply our own multiplier on top of FC values — same
// table the rookie rankings use (PTD_MULT). Baseline is 5pt = 1.00.
// 4pt PT: QB tax 5%. 6pt PT: QB bump 5%. RB/WR/TE never affected.
// Picks unaffected (no position).
const ptdAdjust = (value, pos, passTd) => {
  if(!passTd || passTd === 5) return value;
  const m = ({4:0.95, 6:1.05}[passTd]) ?? 1;
  return pos === 'QB' ? value * m : value;
};

// PPC (per-carry) and PPFD (per-first-down) multipliers — not in FC's API.
// Calibrated against 3-yr nflverse data (2022-2024) for top fantasy producers
// per position, scaled to PFK convention (~⅓ pass-through of raw point bumps
// to match existing TEP_MULT / PTD_MULT scale).
//
// RB multipliers are TIERED by FC value. Workhorse RBs (Bijan/Gibbs tier) get
// 2-3x the carries of fringe starters and 5-10x the carries of FAAB depth, so
// the per-carry / per-first-down value bump is much bigger at the top of the
// position. Brackets calibrated from analyst pick-value tier sheets (2026-04-29).
//
// QB/WR/TE stay flat — receptions don't fall off as steeply by FC value rank.
//
// PPC 0.25:  RBs nearly the only gainer (+23% raw → +10-15% mult tiered).
// PPFD 1.0:  RB > TE > WR > QB; RB rec_fd ratio confirmed at 34% (not 50%).
//            Full derivation in ~/pfk_research/PROJECT_STATUS.md.
//
// Calibrated for PPC=0.25 and PPFD=1; for other values we scale linearly.

// Tier brackets (descending min FC value → multiplier).
//
// RB tiering is the biggest impact — workhorses get ~5x the carries of FAAB
// depth. QB tiering matters too because elite mobile QBs (Hurts/Jackson/Allen/
// Daniels) get ~5x the carries and ~9x the rush 1D of pocket-leaning starters.
// Validated against 72 player-seasons of nflverse data, 2022-2024.
//
// Per Evan: "the further from the top of the list, the less the multiplier
// matters" — low-value QBs aren't long-term dynasty assets even if they run,
// so bottom-tier multiplier returns 1.00.
const RB_PPC_TIERS = [
  { min: 6500, mult: 1.15 },  // Elite young workhorse (Bijan/Gibbs tier)
  { min: 4000, mult: 1.10 },  // Solid RB1/RB2 starter
  { min: 2000, mult: 1.06 },  // Low-end starter / committee back
  { min: 800,  mult: 1.03 },  // Depth / handcuff with role
  { min: 0,    mult: 1.00 },  // Pure FAAB
];
const RB_PPFD_TIERS = [
  { min: 6500, mult: 1.13 },
  { min: 4000, mult: 1.09 },
  { min: 2000, mult: 1.05 },
  { min: 800,  mult: 1.02 },
  { min: 0,    mult: 1.00 },
];
const QB_PPC_TIERS = [
  { min: 7500, mult: 1.04 },  // Elite mobile (Hurts/Jackson/Allen/Daniels)
  { min: 4500, mult: 1.02 },  // Solid mobile starter
  { min: 2000, mult: 1.01 },  // Mostly pocket starter
  { min: 0,    mult: 1.00 },  // Fringe / backup — multiplier doesn't matter
];
const QB_PPFD_TIERS = [
  { min: 7500, mult: 1.06 },  // Elite mobile QB rush 1D conversion is ~0.41 (high)
  { min: 4500, mult: 1.03 },
  { min: 2000, mult: 1.02 },
  { min: 0,    mult: 1.00 },
];
const lookupTierMult = (tiers, baseValue) => {
  for(const t of tiers) if(baseValue >= t.min) return t.mult;
  return 1.0;
};

// Per-position multiplier resolvers. RB and QB consult tier brackets using the
// player's BASE FC value (pre-adjustment); WR and TE are flat (receptions
// don't drop as steeply by FC value rank as carries / rush first downs do).
const ppcMultiplier = (pos, baseValue) => {
  if(pos === 'RB') return lookupTierMult(RB_PPC_TIERS, baseValue);
  if(pos === 'QB') return lookupTierMult(QB_PPC_TIERS, baseValue);
  return ({WR:1.00, TE:1.00}[pos]) ?? 1.00;
};
const ppfdMultiplier = (pos, baseValue) => {
  if(pos === 'RB') return lookupTierMult(RB_PPFD_TIERS, baseValue);
  if(pos === 'QB') return lookupTierMult(QB_PPFD_TIERS, baseValue);
  return ({WR:1.06, TE:1.07}[pos]) ?? 1.00;
};

const ppcAdjust = (value, pos, ppcLevel, baseValue) => {
  if(!ppcLevel || ppcLevel === 0) return value;
  const m = ppcMultiplier(pos, baseValue ?? value);
  if(m === 1) return value;
  return value * (1 + (m - 1) * (ppcLevel / 0.25));
};
const ppfdAdjust = (value, pos, ppfdLevel, baseValue) => {
  if(!ppfdLevel || ppfdLevel === 0) return value;
  const m = ppfdMultiplier(pos, baseValue ?? value);
  if(m === 1) return value;
  return value * (1 + (m - 1) * ppfdLevel);
};

// Extract PPC and PPFD levels from a Sleeper league.
// PPFD: most leagues set rush_fd === rec_fd; if they differ we take the max
// (small approximation — multipliers are calibrated for both = 1).
const ppcLevelForLeague = (lg) => parseFloat(lg?.scoring_settings?.rush_att) || 0;
const ppfdLevelForLeague = (lg) => {
  const rush = parseFloat(lg?.scoring_settings?.rush_fd) || 0;
  const rec  = parseFloat(lg?.scoring_settings?.rec_fd) || 0;
  return Math.max(rush, rec);
};

// Pretty-print a format for the chip ("SF · 1.0 PPR · 0.5 TEP · 5pt PT · 12-team").
// Optional `league` arg surfaces scoring fields FC doesn't take as params
// (pass TD, PPC, PPFD — all applied via PFK multipliers). When no league is
// provided we fall back to PFK's baseline pass TD (5pt) so the default chip
// is fully transparent about what's being shown.
const formatLabel = (fmt, league = null) => {
  const qb = fmt.numQbs === 2 ? 'SF' : '1QB';
  const ppr = fmt.ppr === 1 ? '1.0 PPR' : fmt.ppr === 0.5 ? '0.5 PPR' : '0 PPR';
  // tepLevel uses FC's int convention: 0=none, 1=0.5 TEP, 2=1.0 TEP
  const tep = fmt.tepLevel === 2 ? ' · 1.0 TEP' : fmt.tepLevel === 1 ? ' · 0.5 TEP' : '';
  const ptd = league?.scoring_settings?.pass_td ?? 5;
  const ppc = ppcLevelForLeague(league);
  const ppfd = ppfdLevelForLeague(league);
  const ppcStr  = ppc  > 0 ? ` · ${ppc} PPC` : '';
  const ppfdStr = ppfd > 0 ? ` · ${ppfd} PPFD` : '';
  return `${qb} · ${ppr}${tep} · ${ptd}pt PT${ppcStr}${ppfdStr} · ${fmt.numTeams}-team`;
};

// Normalize free-text pick input. Accepts "1.03", "2026 1.03", "1.3", "26 1.03"
// and returns a canonical "2026 Pick 1.03" string for matching against FC names.
const normalizePickQuery = (q) => {
  const trimmed = (q||'').trim();
  // Already canonical?
  if(/^\d{4}\s+Pick\s+\d+\.\d+$/i.test(trimmed)) return trimmed;
  // Pure "R.PP" form (e.g. "1.03")
  const bare = trimmed.match(/^(\d+)\.(\d+)$/);
  if(bare){
    const yr = new Date().getFullYear();
    const round = bare[1];
    const slot = bare[2].padStart(2,'0');
    return `${yr} Pick ${round}.${slot}`;
  }
  // "YYYY R.PP" or "YY R.PP"
  const withYr = trimmed.match(/^(\d{2}|\d{4})\s+(\d+)\.(\d+)$/);
  if(withYr){
    let yr = withYr[1];
    if(yr.length === 2) yr = '20' + yr;
    return `${yr} Pick ${withYr[2]}.${withYr[3].padStart(2,'0')}`;
  }
  return null;
};

// ============================================================================
// RecentTradesModal — shared "last N trades for this Sleeper user" modal.
// Used by Trade Finder (with Trade Finder context for ★ Relevant highlighting)
// and Sleeper Snapshot (no context — just the raw trade history).
//
// Props:
//   userInfo          { user_id, username, display_name, avatar }
//   onClose           () => void
//   resolvePlayerName (sleeperId) => string  — falls back to "Player #id" if omitted
//   relevantContext   optional { playerIds: Set, pickKeys: Set } for highlighting
//   tradeCap          optional number (default 25)
// ============================================================================
function RecentTradesModal({ userInfo, onClose, resolvePlayerName, relevantContext, tradeCap }){
  const cap = tradeCap || 25;
  const nameOf = resolvePlayerName || (pid => `Player #${pid}`);
  const [status, setStatus] = useState('loading');
  const [trades, setTrades] = useState([]);
  const [leagueCount, setLeagueCount] = useState(0);
  const [filterMode, setFilterMode] = useState('all');

  const tradeIsRelevant = (tx) => {
    if(!relevantContext) return false;
    const allPlayerIds = new Set([
      ...Object.keys(tx.adds || {}),
      ...Object.keys(tx.drops || {}),
    ]);
    for(const pid of allPlayerIds){
      if(relevantContext.playerIds.has(String(pid))) return true;
    }
    for(const p of (tx.draft_picks || [])){
      if(relevantContext.pickKeys.has(`${p.season}-${p.round}`)) return true;
    }
    return false;
  };
  const isRelevantPlayer = (pid) => relevantContext?.playerIds?.has(String(pid));
  const isRelevantPick = (p) => relevantContext?.pickKeys?.has(`${p.season}-${p.round}`);

  // Resolve picks to their slot when we have league-specific draft order
  // ("2026 Pick 1.03" instead of generic "2026 1st"). Only for current draft year.
  const formatPick = (p, slotByRosterId, draftSeason) => {
    const round = p.round === 1 ? '1st' : p.round === 2 ? '2nd' : p.round === 3 ? '3rd' : `${p.round}th`;
    const generic = `${p.season} ${round}`;
    if(!slotByRosterId || String(p.season) !== draftSeason) return generic;
    const slot = slotByRosterId[p.roster_id];
    if(!slot) return generic;
    return `${p.season} Pick ${p.round}.${String(slot).padStart(2,'0')}`;
  };

  useEffect(() => {
    if(!userInfo?.user_id) return;
    let cancelled = false;
    setStatus('loading');
    setTrades([]);
    (async () => {
      try{
        const yrCur = String(new Date().getFullYear());
        const yrPrev = String(new Date().getFullYear() - 1);
        const [lgsCur, lgsPrev] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/user/${userInfo.user_id}/leagues/nfl/${yrCur}`, {cache:'no-store'}).then(r=>r.ok?r.json():[]).catch(()=>[]),
          fetch(`https://api.sleeper.app/v1/user/${userInfo.user_id}/leagues/nfl/${yrPrev}`, {cache:'no-store'}).then(r=>r.ok?r.json():[]).catch(()=>[]),
        ]);
        const dynasty = [...lgsCur, ...lgsPrev].filter(l => l?.settings?.type === 2);
        const tradesNested = await Promise.all(dynasty.map(async (lg) => {
          try{
            const rosters = await fetch(`https://api.sleeper.app/v1/league/${lg.league_id}/rosters`, {cache:'no-store'}).then(r=>r.json());
            const myRoster = (rosters||[]).find(r => r.owner_id === userInfo.user_id || (r.co_owners||[]).includes(userInfo.user_id));
            if(!myRoster) return [];
            const myRosterId = myRoster.roster_id;
            const weeks = Array.from({length: 18}, (_, i) => i + 1);
            const [draftSlots, ...txArrays] = await Promise.all([
              lookupDraftSlots(lg.league_id, rosters),
              ...weeks.map(w =>
                fetch(`https://api.sleeper.app/v1/league/${lg.league_id}/transactions/${w}`, {cache:'no-store'})
                  .then(r => r.ok ? r.json() : []).catch(() => [])
              ),
            ]);
            const slotByRosterId = {};
            if(draftSlots?.slotByRoster){
              Object.entries(draftSlots.slotByRoster).forEach(([rid, slot]) => {
                slotByRosterId[parseInt(rid)] = parseInt(slot);
              });
            }
            return txArrays.flat()
              .filter(tx => tx.type === 'trade' && tx.status === 'complete' && (tx.roster_ids||[]).includes(myRosterId))
              .map(tx => ({ ...tx, _leagueName: lg.name, _myRosterId: myRosterId, _slotByRosterId: slotByRosterId, _draftSeason: String(lg.season) }));
          }catch(e){ return []; }
        }));
        if(cancelled) return;
        const all = tradesNested.flat()
          .sort((a,b) => (b.status_updated || b.created || 0) - (a.status_updated || a.created || 0))
          .slice(0, cap);
        setTrades(all);
        setLeagueCount(dynasty.length);
        // Default to ★ Relevant tab if any matches (only when context provided)
        if(relevantContext && all.some(tradeIsRelevant)) setFilterMode('relevant');
        else setFilterMode('all');
        setStatus('ready');
      }catch(e){
        if(!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  },[userInfo?.user_id]);

  const avatarUrl = userInfo?.avatar ? `https://sleepercdn.com/avatars/thumbs/${userInfo.avatar}` : null;

  return (
    <div onClick={onClose}
         style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()}
           style={{background:'#0a0a0a',border:'2px solid #FFD700',borderRadius:14,padding:20,maxWidth:560,width:'100%',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,paddingBottom:12,borderBottom:'1px solid #1e1e1e'}}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover',background:'#1a1a1a'}} onError={e=>e.currentTarget.style.display='none'}/>
            : <div style={{width:36,height:36,borderRadius:'50%',background:'#1a1a1a',display:'flex',alignItems:'center',justifyContent:'center',color:'#FFD700',fontWeight:900}}>{(userInfo?.display_name||'?')[0].toUpperCase()}</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:900,color:'#fff'}}>@{userInfo?.username || userInfo?.display_name}</div>
            <div style={{fontSize:11,color:'#888'}}>{status === 'ready' ? `${trades.length} most recent trade${trades.length===1?'':'s'}` : 'Recent trades'}{leagueCount ? ` · scanned ${leagueCount} dynasty league${leagueCount===1?'':'s'}` : ''}</div>
          </div>
          <button onClick={onClose}
                  style={{background:'transparent',border:'1px solid #333',borderRadius:6,color:'#888',padding:'4px 10px',cursor:'pointer',fontSize:14,fontWeight:700}}>×</button>
        </div>
        {status === 'loading' && <div style={{padding:20,textAlign:'center',color:'#888',fontSize:13}}>Scanning league transactions…</div>}
        {status === 'error' && <div style={{padding:20,textAlign:'center',color:'#ef4444',fontSize:13}}>Couldn't load trades — try again.</div>}
        {status === 'ready' && trades.length === 0 && (
          <div style={{padding:20,textAlign:'center',color:'#888',fontSize:13}}>No completed trades found across this user's dynasty leagues.</div>
        )}
        {status === 'ready' && trades.length > 0 && (() => {
          const relevantTrades = relevantContext ? trades.filter(tradeIsRelevant) : [];
          const visibleTrades = filterMode === 'relevant' ? relevantTrades : trades;
          const hasRelevant = relevantTrades.length > 0;
          const tabBtn = (key, label, count, disabled) => (
            <button onClick={()=>!disabled && setFilterMode(key)} disabled={disabled}
                    style={{flex:1,padding:'8px 10px',borderRadius:6,
                            border: filterMode===key ? '1.5px solid #FFD700' : '1.5px solid #1e1e1e',
                            background: filterMode===key ? '#FFD700' : 'transparent',
                            color: filterMode===key ? '#000' : (disabled?'#444':'#aaa'),
                            fontWeight:800,fontSize:12,letterSpacing:0.4,cursor:disabled?'not-allowed':'pointer'}}>
              {label} <span style={{opacity:0.7,fontWeight:700}}>({count})</span>
            </button>
          );
          return (
            <>
              {relevantContext && (
                <div style={{display:'flex',gap:6,marginBottom:14}}>
                  {tabBtn('relevant', '★ Relevant', relevantTrades.length, !hasRelevant)}
                  {tabBtn('all', 'All trades', trades.length, false)}
                </div>
              )}
              {filterMode === 'relevant' && relevantTrades.length === 0 && (
                <div style={{padding:20,textAlign:'center',color:'#888',fontSize:13}}>No trades involve any player or pick from your current Trade Finder results.</div>
              )}
              {visibleTrades.map((tx,i) => {
                const myRosterId = tx._myRosterId;
                const received = Object.entries(tx.adds || {}).filter(([_,rid]) => rid === myRosterId).map(([pid]) => pid);
                const sent     = Object.entries(tx.drops || {}).filter(([_,rid]) => rid === myRosterId).map(([pid]) => pid);
                const picksReceived = (tx.draft_picks || []).filter(p => p.owner_id === myRosterId && p.previous_owner_id !== myRosterId);
                const picksSent     = (tx.draft_picks || []).filter(p => p.previous_owner_id === myRosterId && p.owner_id !== myRosterId);
                const date = tx.status_updated || tx.created;
                const dateStr = date ? new Date(date).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : '';
                const txRelevant = relevantContext && tradeIsRelevant(tx);
                const renderItems = (playerIds, picks, kind) => {
                  const items = [
                    ...playerIds.map(pid => ({key:`${kind}-p-${pid}`, label:nameOf(pid), relevant:isRelevantPlayer(pid)})),
                    ...picks.map(p => ({key:`${kind}-d-${p.season}-${p.round}-${p.roster_id}`, label:formatPick(p, tx._slotByRosterId, tx._draftSeason), relevant:isRelevantPick(p)})),
                  ];
                  if(items.length === 0) return <span style={{color:'#666'}}>nothing</span>;
                  return items.map((it, idx) => (
                    <React.Fragment key={it.key}>
                      {idx > 0 && <span style={{color:'#444'}}> · </span>}
                      <span style={it.relevant ? {color:'#FFD700',fontWeight:800} : null}>
                        {it.relevant && '★ '}{it.label}
                      </span>
                    </React.Fragment>
                  ));
                };
                return (
                  <div key={tx.transaction_id || i}
                       style={{padding:'12px 14px',
                               background: txRelevant ? '#1a1400' : '#0f0f0f',
                               border: txRelevant ? '1px solid #FFD70066' : '1px solid #1e1e1e',
                               borderRadius:8,marginBottom:10,fontSize:13}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:8,flexWrap:'wrap'}}>
                      <div style={{fontSize:11,color:'#FFD700',fontWeight:700,letterSpacing:0.3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'70%'}}>{tx._leagueName}</div>
                      <div style={{fontSize:11,color:'#666',fontWeight:700,letterSpacing:0.5}}>{dateStr}</div>
                    </div>
                    <div style={{marginBottom:6}}>
                      <span style={{color:'#10b981',fontWeight:800,fontSize:11,letterSpacing:0.5}}>RECEIVED:</span>
                      <div style={{color:'#eee',marginTop:2,lineHeight:1.5}}>{renderItems(received, picksReceived, 'rec')}</div>
                    </div>
                    <div>
                      <span style={{color:'#ef4444',fontWeight:800,fontSize:11,letterSpacing:0.5}}>SENT:</span>
                      <div style={{color:'#eee',marginTop:2,lineHeight:1.5}}>{renderItems(sent, picksSent, 'snt')}</div>
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}
        <div style={{fontSize:10,color:'#555',marginTop:8,textAlign:'center'}}>{relevantContext ? '★ = involves a player/pick from your Trade Finder results · ' : ''}player names via FantasyCalc index</div>
      </div>
    </div>
  );
}

function TradeFinderApp(){
  const [assets, setAssets] = useState(null); // null=loading, []=failed, [...]=loaded
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState(null);
  // Tolerance persists across visits — once a user finds their preferred range
  // they shouldn't have to re-set it every time. Clamp on read so stale or
  // tampered values can't break the slider.
  // Default 10% — tighter defaults like 3% returned zero matches for many anchors
  // and made the tool feel broken. The red delta color on lower-value results
  // already discourages overpaying.
  const [tolerance, setTolerance] = useState(() => {
    const saved = parseInt(localStorage.getItem('pfk_tf_tolerance') || '', 10);
    return (saved >= 3 && saved <= 25) ? saved : 10;
  });
  useEffect(() => { localStorage.setItem('pfk_tf_tolerance', String(tolerance)); }, [tolerance]);
  const [filter, setFilter] = useState('all'); // 'all' | 'players' | 'picks'
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  // ---- Sleeper account + league-aware values (Phase 1) ----
  // sleeperUser is now globally shared via useSleeperUser — linking happens in
  // the master toolbar (or anywhere else that uses the hook), and Trade Finder
  // re-renders automatically when the linked account changes.
  const [sleeperUser] = useSleeperUser();
  const [leagues, setLeagues] = useState(null);   // null=not-yet-fetched, []=fetched-empty, [...]=fetched
  const [leagueId, setLeagueId] = useState(() => localStorage.getItem('pfk_sleeper_league') || '');
  const selectedLeague = useMemo(() => (leagues||[]).find(l => l.league_id === leagueId) || null, [leagues, leagueId]);
  const activeFormat = useMemo(() => selectedLeague ? fcFormatForLeague(selectedLeague) : TF_DEFAULT_FORMAT, [selectedLeague]);

  // Re-fetch FC values whenever the active format changes (league switch or first load).
  // Anchor is intentionally preserved — the same player/pick is still a valid anchor,
  // we just refresh the value table around them.
  useEffect(() => {
    setAssets(null);
    fetchTradeFinderAssets(activeFormat).then(setAssets);
  },[activeFormat.key]);

  // Refetch leagues whenever the linked user changes (toolbar link/unlink).
  useEffect(() => {
    if(!sleeperUser?.user_id){
      setLeagues(null);
      setLeagueId('');
      return;
    }
    (async () => {
      try{
        const yr = String(new Date().getFullYear());
        const lgs = await fetch(`https://api.sleeper.app/v1/user/${sleeperUser.user_id}/leagues/nfl/${yr}`, {cache:'no-store'}).then(r=>r.json());
        // Dynasty only — settings.type === 2 (redraft = different mindset, intentionally excluded)
        const dynasty = (lgs||[]).filter(l => l?.settings?.type === 2).sort((a,b) => (a.name||'').localeCompare(b.name||''));
        setLeagues(dynasty);
        // If the previously-saved leagueId isn't in the current set, clear it.
        if(leagueId && !dynasty.find(l => l.league_id === leagueId)) setLeagueId('');
      }catch(e){ setLeagues([]); }
    })();
  },[sleeperUser?.user_id]);

  const pickLeague = (id) => {
    setLeagueId(id);
    if(id) localStorage.setItem('pfk_sleeper_league', id);
    else localStorage.removeItem('pfk_sleeper_league');
  };

  // ---- Phase 2: leaguemate ownership + trade history ----
  // ownership = {
  //   byPlayerId:  {sleeperId -> rosterId}        — current rostered player owners
  //   byRosterId:  {rosterId  -> userInfo}        — roster → user profile
  //   byPickName:  {fcPickName -> rosterId}       — current owner of slot-specific picks
  //                                                  (CURRENT-year rookie draft only;
  //                                                   future picks have no slot yet)
  // }
  // Fetched eagerly when a league is selected so result rows show owner tags
  // the moment a user anchors on something. Trade history is fetched lazily
  // (on click) since most users won't open the modal.
  const [ownership, setOwnership] = useState(null);
  useEffect(() => {
    if(!selectedLeague?.league_id){
      setOwnership(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try{
        const lid = selectedLeague.league_id;
        // Fetch rosters first since lookupDraftSlots needs them; the rest in parallel.
        const rosters = await fetch(`https://api.sleeper.app/v1/league/${lid}/rosters`, {cache:'no-store'}).then(r=>r.json());
        if(cancelled) return;
        const [users, draftSlots, tradedPicks] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${lid}/users`, {cache:'no-store'}).then(r=>r.json()),
          // Reuse the same draft-slot resolver Power Rankings uses (slot_to_roster_id
          // first, draft_order fallback). Returns null for auction drafts or leagues
          // with no rookie draft yet.
          lookupDraftSlots(lid, rosters),
          fetch(`https://api.sleeper.app/v1/league/${lid}/traded_picks`, {cache:'no-store'}).then(r=>r.ok?r.json():[]).catch(()=>[]),
        ]);
        if(cancelled) return;
        const byUserId = {};
        (users||[]).forEach(u => { byUserId[u.user_id] = u; });
        const byRosterId = {};
        const byPlayerId = {};
        (rosters||[]).forEach(r => {
          const u = byUserId[r.owner_id];
          byRosterId[r.roster_id] = {
            roster_id: r.roster_id,
            user_id: r.owner_id,
            username: u?.username || null,
            display_name: u?.display_name || u?.username || `Roster ${r.roster_id}`,
            avatar: u?.avatar || null,
          };
          (r.players || []).forEach(pid => { byPlayerId[String(pid)] = r.roster_id; });
        });
        // Build slot-specific pick → current owner map. CURRENT-year picks only —
        // future-year slots aren't determined yet (no draft order set), and FC's
        // pick names are slot-specific so we'd be guessing for 2027+.
        const byPickName = {};
        if(draftSlots?.slotByRoster){
          // Reverse: slot → original-owner roster_id
          const rosterBySlot = {};
          Object.entries(draftSlots.slotByRoster).forEach(([rid, slot]) => {
            rosterBySlot[parseInt(slot)] = parseInt(rid);
          });
          const seasonStr = String(selectedLeague.season || new Date().getFullYear());
          const N = (rosters||[]).length;
          // Walk every rookie-draft slot × every plausible round (1-5).
          // FC names are formatted "YYYY Pick R.PP" with zero-padded slot.
          for(let round = 1; round <= 5; round++){
            for(let slot = 1; slot <= N; slot++){
              const originalRid = rosterBySlot[slot];
              if(!originalRid) continue;
              const tp = (tradedPicks||[]).find(t =>
                String(t.season) === seasonStr && t.round === round && t.roster_id === originalRid
              );
              const currentOwnerRid = tp ? tp.owner_id : originalRid;
              const slotPad = String(slot).padStart(2, '0');
              byPickName[`${seasonStr} Pick ${round}.${slotPad}`] = currentOwnerRid;
            }
          }
        }
        setOwnership({ byPlayerId, byRosterId, byPickName });
      }catch(e){
        if(!cancelled) setOwnership(null);
      }
    })();
    return () => { cancelled = true; };
  },[selectedLeague?.league_id]);

  // Trade history modal — entirely self-contained in <RecentTradesModal>.
  // We just track which user we're viewing; the modal handles scanning + render.
  const [tradeModalUser, setTradeModalUser] = useState(null);
  const openTradeHistory = (rosterInfo) => setTradeModalUser(rosterInfo);
  // Resolve a Sleeper player_id → readable name using the loaded FC asset list.
  // Used by RecentTradesModal so trade rows show "Bijan Robinson" not "Player #4866".
  const resolvePlayerName = (pid) => {
    if(!assets || !pid) return `Player #${pid}`;
    const hit = assets.find(a => a.sleeperId && String(a.sleeperId) === String(pid));
    return hit ? hit.name : `Player #${pid}`;
  };

  // displayAssets = FC values with PFK's per-position multipliers applied for
  // scoring fields FC doesn't take as params: pass TD, PPC, PPFD. All three
  // are independent and multiply through. When no league is linked (or none
  // of the fields are set / non-baseline), this is a pass-through.
  const displayAssets = useMemo(() => {
    if(!assets) return null;
    const ptd  = selectedLeague?.scoring_settings?.pass_td;
    const ppc  = ppcLevelForLeague(selectedLeague);
    const ppfd = ppfdLevelForLeague(selectedLeague);
    const ptdActive = ptd && ptd !== 5;
    if(!ptdActive && !ppc && !ppfd) return assets;
    return assets.map(a => {
      const baseValue = a.value;
      let v = baseValue;
      if(ptdActive) v = ptdAdjust(v, a.pos, ptd);
      // PPC/PPFD bracket the multiplier off the BASE FC value (not the
      // post-PTD value) so RB tier lookup is stable.
      if(ppc)       v = ppcAdjust(v, a.pos, ppc, baseValue);
      if(ppfd)      v = ppfdAdjust(v, a.pos, ppfd, baseValue);
      return { ...a, value: v };
    });
  },[assets, selectedLeague]);

  // Anchor is stored as the asset object captured at selection time; if the league
  // changes after that, look up the current displayAssets entry by name so the
  // anchor's value stays in sync with whichever PTD multiplier is active now.
  const liveAnchor = useMemo(() => {
    if(!anchor || !displayAssets) return anchor;
    return displayAssets.find(a => a.name === anchor.name) || anchor;
  },[anchor, displayAssets]);

  // Suggestions: fuzzy on player names + canonical pick names. Boost exact pick matches.
  // Query gets the SAME normalization as asset names so apostrophes/punctuation
  // never break matching ("jamar" or "ja'marr" both find "Ja'Marr Chase").
  const suggestions = useMemo(() => {
    if(!displayAssets || !query.trim()) return [];
    const q = query.trim().toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
    if(!q) return [];
    const pickCanonical = normalizePickQuery(query);
    const out = [];
    displayAssets.forEach(a => {
      let score = 0;
      if(pickCanonical && a.name === pickCanonical) score = 1000;
      else if(a.normName === q) score = 900;
      else if(a.normName.startsWith(q)) score = 500;
      else if(a.normName.includes(q)) score = 200;
      else if(a.isPick && a.name.toLowerCase().includes(q)) score = 100;
      if(score > 0) out.push({ ...a, _score: score });
    });
    return out.sort((x,y) => y._score - x._score || y.value - x.value).slice(0, 10);
  },[displayAssets, query]);

  // Set of sleeperIds + pick keys ("YYYY-R") for the anchor + every equivalent
  // currently visible. Used by the trade history modal to flag which trades
  // involve players/picks the user is actively considering — that's the most
  // useful context for "what does this leaguemate value these assets at?"
  const relevantContext = useMemo(() => {
    const playerIds = new Set();
    const pickKeys = new Set();
    const addAsset = (a) => {
      if(!a) return;
      if(a.isPick){
        // Match by season+round; FC's slot-specific pick name "2026 Pick 1.03"
        // and Sleeper's traded-pick "2026 1st" both reduce to "2026-1".
        const m = a.name.match(/^(\d{4})\s+(?:Pick\s+)?(\d+)/);
        if(m) pickKeys.add(`${m[1]}-${m[2]}`);
      } else if(a.sleeperId){
        playerIds.add(String(a.sleeperId));
      }
    };
    addAsset(liveAnchor);
    if(displayAssets && liveAnchor){
      const lo = liveAnchor.value * (1 - tolerance/100);
      const hi = liveAnchor.value * (1 + tolerance/100);
      displayAssets.forEach(a => {
        if(a.name === liveAnchor.name) return;
        if(a.value >= lo && a.value <= hi) addAsset(a);
      });
    }
    return { playerIds, pickKeys };
  },[liveAnchor, displayAssets, tolerance]);

  const tradeIsRelevant = (tx) => {
    if(!relevantContext) return false;
    // Players in the trade (adds + drops keys are sleeperIds)
    const allPlayerIds = new Set([
      ...Object.keys(tx.adds || {}),
      ...Object.keys(tx.drops || {}),
    ]);
    for(const pid of allPlayerIds){
      if(relevantContext.playerIds.has(String(pid))) return true;
    }
    // Picks in the trade (each has season + round)
    for(const p of (tx.draft_picks || [])){
      if(relevantContext.pickKeys.has(`${p.season}-${p.round}`)) return true;
    }
    return false;
  };
  const isRelevantPlayer = (pid) => relevantContext?.playerIds?.has(String(pid));
  const isRelevantPick = (p) => relevantContext?.pickKeys?.has(`${p.season}-${p.round}`);

  const equivalents = useMemo(() => {
    if(!liveAnchor || !displayAssets) return null;
    const lo = liveAnchor.value * (1 - tolerance/100);
    const hi = liveAnchor.value * (1 + tolerance/100);
    const matches = displayAssets.filter(a => a.name !== liveAnchor.name && a.value >= lo && a.value <= hi);
    // When anchoring on a pick, suppress other picks — users want vets, not "1.09 → 1.08".
    // The filter row also hides in this case so the UI doesn't offer a useless "Picks Only".
    const filtered = matches.filter(a => {
      if(liveAnchor.isPick) return !a.isPick;
      if(filter === 'players') return !a.isPick;
      if(filter === 'picks') return a.isPick;
      return true;
    });
    const groups = { QB:[], RB:[], WR:[], TE:[], PICK:[], OTHER:[] };
    filtered.forEach(a => {
      const k = groups[a.pos] ? a.pos : 'OTHER';
      groups[k].push(a);
    });
    Object.keys(groups).forEach(k => groups[k].sort((x,y) => y.value - x.value));
    return { groups, total: filtered.length };
  },[liveAnchor, displayAssets, tolerance, filter]);

  const selectAsset = (a) => {
    setAnchor(a);
    setQuery(a.name);
    setShowSuggestions(false);
    if(inputRef.current) inputRef.current.blur();
  };

  const reset = () => {
    setAnchor(null);
    setQuery('');
    setShowSuggestions(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const posColor = (pos) => ({
    QB:'#a78bfa', RB:'#34d399', WR:'#60a5fa', TE:'#fb923c', PICK:'#FFD700', OTHER:'#9ca3af'
  }[pos] || '#9ca3af');

  return (
    <div style={{background:'#080808',minHeight:'100vh',color:'#f0f0f0',fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <MasterToolbar currentTab="trade"/>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'24px 16px 60px'}}>

        {/* League dropdown — Sleeper link itself lives in the master toolbar now,
            so all we need here is the per-tool league picker (one league at a time
            in Trade Finder, even if the user's in many). */}
        <div style={{marginBottom:20,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:8}}>
          {!sleeperUser && (
            <div style={{padding:'10px 14px',background:'#0a0a0a',border:'1px dashed #FFD70044',borderRadius:8,color:'#aaa',fontSize:12,maxWidth:480}}>
              💡 Link your Sleeper account in the toolbar above — Trade Finder will then auto-adjust values to your specific league's scoring settings.
            </div>
          )}
          {sleeperUser && (
            <>
              {leagues === null && <div style={{fontSize:12,color:'#888'}}>Loading your dynasty leagues…</div>}
              {leagues && leagues.length === 0 && <div style={{fontSize:12,color:'#888'}}>No dynasty leagues found for {new Date().getFullYear()}.</div>}
              {leagues && leagues.length > 0 && (
                <select value={leagueId} onChange={e=>pickLeague(e.target.value)}
                        style={{padding:'8px 12px',background:'#0a0a0a',border:'1.5px solid #FFD70066',borderRadius:6,color:'#fff',fontSize:13,fontFamily:'inherit',minWidth:240,maxWidth:'100%',cursor:'pointer'}}>
                  <option value="">— Pick a league —</option>
                  {leagues.map(l => <option key={l.league_id} value={l.league_id}>{l.name}</option>)}
                </select>
              )}
            </>
          )}
        </div>

        <div style={{textAlign:'center',marginBottom:18}}>
          <div style={{fontSize:28,fontWeight:900,color:'#FFD700',letterSpacing:2.5,marginBottom:6}}>⚖️ TRADE FINDER</div>
          <div style={{fontSize:13,color:'#bbb',maxWidth:600,margin:'0 auto',lineHeight:1.5}}>
            Type a rookie pick (e.g. <code style={{color:'#FFD700',background:'#1a1400',padding:'1px 6px',borderRadius:4}}>1.03</code>) or any player name to see every equivalent-value asset grouped by position. <strong style={{color:'#eee'}}>Link your Sleeper account in the toolbar</strong> and pick a league — values auto-adjust to that league's exact scoring settings.
          </div>
          {/* Format chip — tells the user exactly which value table is in use right now. */}
          <div style={{marginTop:10,display:'inline-flex',alignItems:'center',gap:8,padding:'5px 12px',background:'#0a0a0a',border:'1px solid '+(selectedLeague?'#10b98166':'#1e1e1e'),borderRadius:16,fontSize:11,fontWeight:700,letterSpacing:0.5,color:selectedLeague?'#10b981':'#888'}}>
            <span style={{fontSize:9}}>●</span>
            {selectedLeague
              ? <>Values for: <span style={{color:'#fff'}}>{selectedLeague.name}</span> · {formatLabel(activeFormat, selectedLeague)}</>
              : <>Values: Default {formatLabel(TF_DEFAULT_FORMAT)} (link Sleeper for league-specific values)</>
            }
          </div>
        </div>

        <div style={{position:'relative',marginBottom:18}}>
          <div style={{display:'flex',gap:8}}>
            <input
              ref={inputRef}
              value={query}
              onChange={e=>{ setQuery(e.target.value); setShowSuggestions(true); if(anchor) setAnchor(null); }}
              onFocus={()=>setShowSuggestions(true)}
              onBlur={()=>setTimeout(()=>setShowSuggestions(false), 150)}
              onKeyDown={e=>{ if(e.key==='Enter' && suggestions.length>0){ e.preventDefault(); selectAsset(suggestions[0]); } }}
              placeholder={assets===null ? 'Loading values…' : 'Try "1.03" or "Ja\'Marr Chase"'}
              disabled={assets===null}
              style={{flex:1,padding:'14px 18px',background:'#0a0a0a',border:'1.5px solid #FFD70066',borderRadius:8,color:'#fff',fontSize:16,fontFamily:'inherit'}}/>
            {anchor && <button onClick={reset} style={{padding:'14px 18px',background:'transparent',border:'1px solid #555',borderRadius:8,color:'#888',fontWeight:700,fontSize:13,cursor:'pointer',letterSpacing:0.5}}>CLEAR</button>}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div style={{position:'absolute',top:'100%',left:0,right:anchor?72:0,marginTop:4,background:'#0f0f0f',border:'1px solid #FFD70044',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,0.6)',zIndex:50,maxHeight:320,overflowY:'auto'}}>
              {suggestions.map(s => (
                <div key={s.name} onMouseDown={()=>selectAsset(s)}
                     style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #1a1a1a',display:'flex',alignItems:'center',gap:10,fontSize:14}}
                     onMouseEnter={e=>e.currentTarget.style.background='#1a1400'}
                     onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{padding:'2px 7px',background:posColor(s.pos)+'22',color:posColor(s.pos),borderRadius:4,fontSize:10,fontWeight:900,letterSpacing:0.5,minWidth:38,textAlign:'center'}}>{s.pos}</span>
                  <span style={{flex:1,color:'#fff'}}>{s.name}</span>
                  <span style={{color:'#FFD700',fontWeight:800,fontSize:13}}>{s.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {liveAnchor && (
          <>
            {(() => {
              // Resolve owner of the anchor itself — players via sleeperId,
              // current-year picks via byPickName. Same pattern as equivalents.
              const anchorRosterId = ownership ? (
                liveAnchor.isPick
                  ? ownership.byPickName?.[liveAnchor.name]
                  : (liveAnchor.sleeperId ? ownership.byPlayerId[String(liveAnchor.sleeperId)] : null)
              ) : null;
              const anchorOwner = anchorRosterId ? ownership.byRosterId[anchorRosterId] : null;
              return (
                <div style={{background:'linear-gradient(135deg,#1a1400 0%,#0f0f0f 100%)',border:'2px solid #FFD700',borderRadius:12,padding:'16px 20px',marginBottom:18,display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                  <span style={{padding:'4px 10px',background:posColor(liveAnchor.pos),color:'#000',borderRadius:6,fontSize:11,fontWeight:900,letterSpacing:0.5}}>{liveAnchor.pos}</span>
                  <div style={{flex:1,minWidth:160}}>
                    <div style={{fontSize:18,fontWeight:900,color:'#fff'}}>{liveAnchor.name}</div>
                    <div style={{fontSize:12,color:'#888',marginTop:2}}>Anchor value</div>
                  </div>
                  <div style={{fontSize:24,fontWeight:900,color:'#FFD700',letterSpacing:1}}>{liveAnchor.value.toLocaleString()}</div>
                  {anchorOwner && (
                    <button onClick={()=>openTradeHistory(anchorOwner)}
                            data-tooltip={`Click to see ${anchorOwner.display_name}'s recent trades`}
                            style={{flexBasis:'100%',marginTop:6,padding:'8px 12px',background:'#0a0a0a',border:'1px solid #10b98166',borderRadius:8,color:'#10b981',fontSize:13,fontWeight:800,cursor:'pointer',letterSpacing:0.3,textAlign:'left'}}>
                      👤 owned by @{anchorOwner.username || anchorOwner.display_name} <span style={{color:'#666',fontWeight:700,fontSize:11}}>· tap to see their recent trades →</span>
                    </button>
                  )}
                  {!anchorOwner && ownership && !liveAnchor.isPick && (
                    <div style={{flexBasis:'100%',marginTop:4,fontSize:11,color:'#666'}}>👤 not currently rostered in {selectedLeague?.name}</div>
                  )}
                </div>
              );
            })()}

            <div style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:10,padding:'14px 16px',marginBottom:18,display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{flex:'1 1 280px',display:'flex',flexDirection:'column',gap:6}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#888',fontWeight:700,letterSpacing:0.5}}>
                  <span>VALUE TOLERANCE</span>
                  <span style={{color:'#FFD700'}}>±{tolerance}%</span>
                </div>
                <input type="range" min="3" max="25" step="1" value={tolerance} onChange={e=>setTolerance(Number(e.target.value))}
                       style={{width:'100%',accentColor:'#FFD700'}}/>
                <div style={{fontSize:11,color:'#666'}}>Range: {Math.round(liveAnchor.value*(1-tolerance/100)).toLocaleString()} – {Math.round(liveAnchor.value*(1+tolerance/100)).toLocaleString()}</div>
                <div style={{fontSize:11,color:'#aaa',marginTop:2}}>💾 Your tolerance preference saves automatically for future visits.</div>
              </div>
              {!liveAnchor.isPick && (
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  {[['all','All'],['players','Players'],['picks','Picks']].map(([k,label])=>(
                    <button key={k} onClick={()=>setFilter(k)} style={{padding:'7px 14px',borderRadius:6,border:filter===k?'1.5px solid #FFD700':'1.5px solid #1e1e1e',background:filter===k?'#FFD700':'transparent',color:filter===k?'#000':'#aaa',fontWeight:800,fontSize:12,cursor:'pointer',letterSpacing:0.5}}>{label}</button>
                  ))}
                </div>
              )}
            </div>

            {equivalents && equivalents.total === 0 && (
              <div style={{textAlign:'center',padding:40,color:'#666',fontSize:14}}>
                No equivalent assets in this range. Widen the tolerance with the slider above.
              </div>
            )}

            {/* Hint that owner badges are clickable. Only renders when owner
                data is actually populated so we don't dangle a tip pointing
                at nothing. Mobile-first sizing (compact). */}
            {equivalents && equivalents.total > 0 && ownership && (
              <div style={{padding:'10px 14px',marginBottom:10,background:'#0a0a0a',border:'1px solid #FFD70033',borderRadius:6,fontSize:12,color:'#aaa',lineHeight:1.55}}>
                <div style={{marginBottom:6}}>
                  💡 <strong style={{color:'#FFD700'}}>How leaguemate trade history works:</strong>
                </div>
                <div style={{marginBottom:5}}>
                  • The <span style={{color:'#10b981',fontWeight:700}}>👤 owned by @username</span> button under each result shows which person in <strong style={{color:'#fff'}}>{selectedLeague?.name || 'your league'}</strong> currently rosters that asset (pulled live from Sleeper rosters + traded picks).
                </div>
                <div style={{marginBottom:5}}>
                  • Tap a username to open their <strong style={{color:'#fff'}}>last 25 dynasty trades</strong> — scanned across <em>every</em> dynasty league they're in (current + prior season), not just this one. Each trade card shows the league name, what they sent, and what they received, with current-year picks resolved to slot (e.g. <code style={{color:'#FFD700'}}>2026 Pick 1.03</code>).
                </div>
                <div>
                  • The <span style={{color:'#FFD700',fontWeight:800}}>★ Relevant</span> tab inside the modal filters to trades that involved any player or pick from your current Trade Finder results — the most useful "what has this person paid for assets like the one I'm working with?" context.
                </div>
              </div>
            )}
            {equivalents && equivalents.total > 0 && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
                {['QB','RB','WR','TE','PICK','OTHER'].filter(k => equivalents.groups[k].length > 0).map(k => (
                  <div key={k} style={{background:'#0a0a0a',border:'1px solid #1e1e1e',borderRadius:10,overflow:'hidden'}}>
                    <div style={{padding:'10px 14px',background:posColor(k)+'18',borderBottom:'1px solid '+posColor(k)+'44',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{color:posColor(k),fontWeight:900,fontSize:13,letterSpacing:1}}>{k === 'PICK' ? 'PICKS' : k}</span>
                      <span style={{color:'#666',fontSize:11,fontWeight:700}}>{equivalents.groups[k].length}</span>
                    </div>
                    <div>
                      {equivalents.groups[k].map(a => {
                        const delta = ((a.value - liveAnchor.value) / liveAnchor.value) * 100;
                        const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
                        // Green = the equivalent is worth MORE than the anchor (good return for the seller)
                        // Red = worth LESS (you'd be giving up value)
                        // Neutral gray for a near-perfect match (within 0.1%).
                        const deltaColor = Math.abs(delta) < 0.1 ? '#888' : delta > 0 ? '#10b981' : '#ef4444';
                        // Phase 2: leaguemate ownership tag. Players resolve via
                        // sleeperId → roster map. CURRENT-year picks (e.g. "2026
                        // Pick 1.03") resolve via the slot-specific byPickName map
                        // built from this league's draft order + traded_picks.
                        // Future-year picks (2027+) have no slot mapping yet, so
                        // they silently fall through to "no badge".
                        const ownerRosterId = ownership ? (
                          a.isPick
                            ? ownership.byPickName?.[a.name]
                            : (a.sleeperId ? ownership.byPlayerId[String(a.sleeperId)] : null)
                        ) : null;
                        const ownerInfo = ownerRosterId ? ownership.byRosterId[ownerRosterId] : null;
                        return (
                          <div key={a.name} style={{padding:'9px 14px',borderBottom:'1px solid #131313',display:'flex',alignItems:'center',gap:8,fontSize:13,flexWrap:'wrap'}}>
                            <span style={{flex:1,minWidth:120,color:'#eee',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.name}</span>
                            <span style={{color:'#FFD700',fontWeight:800,minWidth:48,textAlign:'right'}}>{a.value.toLocaleString()}</span>
                            <span style={{color:deltaColor,fontSize:11,fontWeight:700,minWidth:48,textAlign:'right'}}>{deltaStr}</span>
                            {ownerInfo && (
                              <button onClick={()=>openTradeHistory(ownerInfo)}
                                      data-tooltip={`Click to see ${ownerInfo.display_name}'s recent trades in this league`}
                                      style={{flexBasis:'100%',marginTop:2,textAlign:'left',padding:'3px 8px',background:'transparent',border:'1px solid #1e1e1e',borderRadius:6,color:'#10b981',fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:0.3}}>
                                👤 owned by @{ownerInfo.username || ownerInfo.display_name} →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!anchor && assets && assets.length > 0 && (
          <div style={{textAlign:'center',padding:'40px 20px 20px',color:'#666',fontSize:14,lineHeight:1.7}}>
            <div style={{fontSize:34,marginBottom:8}}>💡</div>
            Pick anything to anchor on — we'll show every player and pick within ±10% of its value by default.<br/>
            <span style={{fontSize:12,color:'#555'}}>Use the slider to tighten the range down to ±3% or widen up to ±25%.</span>
            <div style={{maxWidth:560,margin:'24px auto 0',padding:'14px 16px',background:'#0a0a0a',border:'1px solid #FFD70033',borderRadius:8,textAlign:'left',color:'#aaa',fontSize:12,lineHeight:1.6}}>
              <div style={{color:'#FFD700',fontWeight:800,letterSpacing:0.5,fontSize:11,marginBottom:8}}>👥 ABOUT LEAGUEMATE OWNERSHIP &amp; TRADE HISTORY</div>
              <div style={{marginBottom:6}}>
                Once you link your Sleeper account in the toolbar and pick a league, every result will show <span style={{color:'#10b981',fontWeight:700}}>👤 owned by @username</span> — the leaguemate in your league who currently rosters that player or pick (pulled live from Sleeper rosters and traded picks).
              </div>
              <div style={{marginBottom:6}}>
                Tap any username to open a popup with their <strong style={{color:'#fff'}}>last 25 dynasty trades</strong> — scanned across <em>every</em> dynasty league they're in (current + prior season), not just yours. Each trade card shows the league name, what they sent, what they received, with current-year picks resolved to slot (e.g. <code style={{color:'#FFD700'}}>2026 Pick 1.03</code>).
              </div>
              <div>
                Inside the popup, the <span style={{color:'#FFD700',fontWeight:800}}>★ Relevant</span> tab filters to trades involving any player or pick from your current Trade Finder results — the most actionable "what has this person paid for assets like the one I'm working with?" context.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trade history modal — handed off to the shared RecentTradesModal so
          Trade Finder + Sleeper Snapshot stay in sync. We pass the current
          Trade Finder context (anchor + equivalents) so the ★ Relevant tab
          can highlight trades involving assets the user is actively
          considering. */}
      {tradeModalUser && (
        <RecentTradesModal
          userInfo={tradeModalUser}
          onClose={() => setTradeModalUser(null)}
          resolvePlayerName={resolvePlayerName}
          relevantContext={relevantContext}
        />
      )}
    </div>
  );
}

const path = window.location.pathname.replace(/\/$/,'');
const isAdminRoute = path.endsWith('/admin');
const dispersalMatch = path.match(/^\/dispersal(?:\/([0-9a-f-]+))?$/i);
const lookupMatch = path.match(/^\/lookup(?:\/([^/]+))?$/i);
const isTradeFinderRoute = path === '/trade-finder';
const isDeadRoute = path === '/zolty' || path === '/compare';
// Root path defaults to Trade Finder (PFK's most-used tool). The legacy App
// (Rookie Ranks / Trade Polls) still renders at root if a relevant query
// param is present — `?tab=pfk`, `?tab=polls`, etc. for direct nav, or
// `?signin=1` for cross-page sign-in links.
const _rootParams = new URLSearchParams(window.location.search);
const rootGoesToApp = path === '' && (_rootParams.has('tab') || _rootParams.has('signin'));
const rootGoesToTradeFinder = path === '' && !rootGoesToApp;
function NotFoundPage(){
  return (
    <div style={{background:'#080808',minHeight:'100vh',color:'#f0f0f0',fontFamily:"'Inter','Segoe UI',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{textAlign:'center',maxWidth:480}}>
        <div style={{fontSize:96,fontWeight:900,color:'#FFD700',letterSpacing:6,textShadow:'0 0 30px #FFD70066'}}>404</div>
        <div style={{fontSize:18,color:'#888',marginTop:8,letterSpacing:1}}>PAGE NOT FOUND</div>
        <a href="/" style={{display:'inline-block',marginTop:24,padding:'10px 24px',background:'#FFD700',color:'#000',textDecoration:'none',borderRadius:8,fontWeight:900,letterSpacing:1.5,fontSize:14}}>Back to Play For Keeps</a>
      </div>
    </div>
  );
}
ReactDOM.render(
  isAdminRoute ? <AdminApp/>
  : dispersalMatch ? <DispersalApp draftId={dispersalMatch[1] || null}/>
  : lookupMatch ? <LookupApp identifier={lookupMatch[1] ? decodeURIComponent(lookupMatch[1]) : null}/>
  : isTradeFinderRoute ? <TradeFinderApp/>
  : rootGoesToTradeFinder ? <TradeFinderApp/>
  : isDeadRoute ? <NotFoundPage/>
  : <App/>,
  document.getElementById("root")
);
