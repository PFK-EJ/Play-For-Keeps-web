const { useState, useRef, useCallback, useEffect, useMemo } = React;

const SUPABASE_URL = 'https://ymwoabgesjqrojurdxmv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8z6jTCr6BPKmltRnNvEVzA_do7BmXKe';
const sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const DEFAULT_SETTINGS = { format:'Superflex', tep:0.5, ppr:1.0, passTd:6, ppc:0 };
const FORMAT_CHOICES=['1QB','Superflex'];
const TEP_CHOICES=[0.5,0.75,1.0], PPR_CHOICES=[1.0], PTD_CHOICES=[4,5,6], PPC_CHOICES=[0];

const sameSettings = (a,b)=> a && b && (a.format||'Superflex')===(b.format||'Superflex') && a.tep===b.tep && a.ppr===b.ppr && a.passTd===b.passTd && a.ppc===b.ppc;

const fetchOfficialRankings = async (wanted) => {
  if(!sb) return null;
  try{
    const { data, error } = await sb.from('pfk_rankings').select('*').order('updated_at',{ascending:false});
    if(error||!data?.length) return null;
    if(wanted){
      const exact = data.find(r=>sameSettings(r.settings,wanted));
      if(exact) return exact;
    }
    return data[0];
  }catch{ return null; }
};

const publishOfficialRankings = async (items, settings) => {
  if(!sb) return { error: 'Supabase not loaded' };
  const { data:userData } = await sb.auth.getUser();
  const email = userData?.user?.email || 'PFK Staff';
  const { data:existing } = await sb.from('pfk_rankings').select('id,settings').order('updated_at',{ascending:false});
  const match = (existing||[]).find(r=>sameSettings(r.settings,settings));
  if(match){
    const { error } = await sb.from('pfk_rankings').update({ data:items, updated_by:email, updated_at:new Date().toISOString(), settings }).eq('id',match.id);
    return { error };
  }
  const { error } = await sb.from('pfk_rankings').insert({ data:items, updated_by:email, settings });
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
      <Group label="FORMAT" choices={FORMAT_CHOICES} suffix="" current={value.format||'Superflex'} field="format"/>
      <Group label="TEP" choices={TEP_CHOICES} suffix="" current={value.tep} field="tep"/>
      <Group label="PASS TD" choices={PTD_CHOICES} suffix="pt" current={value.passTd} field="passTd"/>
    </div>
  );
}

const TIER_COLORS = ["#FFD700","#FFC107","#FFAA00","#E09000","#d97706","#c2840a","#a37820","#8B6914","#a3a3a3","#7c8896"];
const POS_COLORS = { WR:"#3b82f6", RB:"#10b981", TE:"#f59e0b", QB:"#ef4444" };
const INITIAL_TIERS = ["Untouchable","X-Factor","Super-Star","Star","Starter","Good Depth","Bench Player","Roster Clogger","Taxi Squad","Waivers"];

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
    {id:"p20",name:"Chris Bell",pos:"WR",age:22.3,college:"Louisville",nflTeam:"BUF"},
    {id:"p21",name:"Chris Brazzell II",pos:"WR",age:22.3,college:"Tennessee",nflTeam:"ARI"},
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
    {id:"p35",name:"Ted Hurst",pos:"WR",age:null,college:"Georgia State",nflTeam:"TBD"},
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
  'maxklare':        {team:'LAR', pick:'2.29'},
  'carsonbeck':      {team:'ARI', pick:'3.01'},
  'antoniowilliams': {team:'WSH', pick:'3.07'},
  'oscardelp':       {team:'NO',  pick:'3.09'},
  'malachifields':   {team:'NYG', pick:'3.10'},
  'drewallar':       {team:'PIT', pick:'3.12'},
  'zachariahbranch': {team:'ATL', pick:'3.15'},
  'jakobilane':      {team:'BAL', pick:'3.16'},
};
const normDraftName = s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
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

function RenderList({src,allowEdit,onReorder,onMove,onEdit,onRemove,onRenameStart,onRenameCancel,onRenameSave,onDeleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer,onCancelEdit,posFilter,prospects}){
  const rowRefs = useRef({});
  const [draggingId,setDraggingId] = useState(null);
  const [insertBefore,setInsertBefore] = useState(null);
  const [ghostPos,setGhostPos] = useState({x:0,y:0});
  const [ghostOff,setGhostOff] = useState({x:0,y:0});
  const fl = posFilter.size>=4?src:src.filter(x=>x.type==="tier"||posFilter.has(x.pos));

  const normName = s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const hoverCapable = useMemo(()=>typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(hover:hover)').matches,[]);
  const [popover,setPopover] = useState(null);
  const showProspect = (e,id,prospect)=>{
    if(!prospect) return;
    const r=e.currentTarget.getBoundingClientRect();
    const vw=window.innerWidth, vh=window.innerHeight;
    const W=240;
    const x=Math.max(8,Math.min(r.left, vw-W-8));
    let y=r.bottom+6;
    if(y+300>vh) y=Math.max(8,r.top-306);
    setPopover({id, prospect, x, y});
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
                    <div style={{display:"flex",flexDirection:"column",gap:1}}>
                      <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,-1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:3,color:"#555",cursor:"pointer",fontSize:12,padding:"1px 5px"}}>▲</button>
                      <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:3,color:"#555",cursor:"pointer",fontSize:12,padding:"1px 5px"}}>▼</button>
                    </div>
                  </>}</>
                )}
              </div>
            </React.Fragment>
          );
        }
        const pidx=getPlayerIndex(item.id,src),slot=slotLabel(pidx),tname=getPlayerTier(item.id,src),col=getTierColor(tname,src),isEd=editingPlayer===item.id;
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
              onPointerDown={allowEdit?e=>onPD(e,item.id):undefined}
              onPointerMove={allowEdit?onPM:undefined} onPointerUp={allowEdit?onPU:undefined} onPointerCancel={allowEdit?onPU:undefined}
              style={{background:"#0f0f0f",border:"2px solid #1e1e1e",borderRadius:10,padding:"10px 14px",cursor:allowEdit?"grab":"default",opacity:isDrag?0.25:1,transition:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {allowEdit&&<span style={{color:"#555",fontSize:18,flexShrink:0,touchAction:"none"}}>⠿</span>}
                <span className="pfk-rook-slot" style={{width:44,textAlign:"center",fontSize:13,fontWeight:800,flexShrink:0,color:slot==="FAAB"?"#e0a800":col,letterSpacing:0.5}}>{slot}</span>
                <span style={{padding:"2px 7px",borderRadius:5,fontSize:12,fontWeight:800,flexShrink:0,background:"#111",color:POS_COLORS[item.pos],border:"1px solid "+POS_COLORS[item.pos]}}>{item.pos}</span>
                {(()=>{
                  const p=prospects&&prospects[normName(item.name)];
                  const und=p?{textDecorationLine:'underline',textDecorationStyle:'dotted',textUnderlineOffset:3,textDecorationColor:'#FFD70088',cursor:'help'}:{};
                  const handlers=p?(hoverCapable?{
                    onMouseEnter:e=>showProspect(e,item.id,p),
                    onMouseLeave:hideProspect
                  }:{
                    onClick:e=>{e.stopPropagation();if(popover&&popover.id===item.id)setPopover(null);else showProspect(e,item.id,p);},
                    onPointerDown:e=>e.stopPropagation()
                  }):{};
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
                {allowEdit&&<div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,-1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:4,color:"#666",cursor:"pointer",fontSize:12,padding:"1px 6px"}}>▲</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:4,color:"#666",cursor:"pointer",fontSize:12,padding:"1px 6px"}}>▼</button>
                </div>}
                {allowEdit&&<>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onEdit(item)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,color:"#666",cursor:"pointer",fontSize:14,padding:"4px 8px"}}>✏️</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onRemove(item.id)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,color:"#444",cursor:"pointer",fontSize:14,padding:"4px 8px"}}>✕</button>
                </>}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {draggingId&&insertBefore===null&&<DropLine/>}
      {popover&&(
        <div style={{position:'fixed',left:popover.x,top:popover.y,zIndex:9998,background:'#0f0f0f',border:'1px solid #FFD700',borderRadius:10,padding:12,width:240,boxShadow:'0 8px 32px rgba(0,0,0,0.85)',pointerEvents:hoverCapable?'none':'auto'}}
          onClick={e=>e.stopPropagation()}>
          <img src={popover.prospect.headshot} alt="" style={{width:'100%',height:180,objectFit:'cover',borderRadius:8,background:'#000'}} onError={e=>{e.currentTarget.style.display='none';}}/>
          <div style={{fontWeight:900,fontSize:14,marginTop:8,color:'#FFD700'}}>{popover.prospect.name}</div>
          <div style={{fontSize:13,color:'#888',marginTop:2}}>{popover.prospect.position} · {popover.prospect.college}</div>
          <div style={{display:'flex',gap:14,marginTop:8,fontSize:14,flexWrap:'wrap'}}>
            <div><span style={{color:'#555'}}>HT </span><span style={{fontWeight:700}}>{popover.prospect.height||'—'}</span></div>
            <div><span style={{color:'#555'}}>WT </span><span style={{fontWeight:700}}>{popover.prospect.weight?popover.prospect.weight+' lbs':'—'}</span></div>
            <div><span style={{color:'#555'}}>AGE </span><span style={{fontWeight:700}}>{popover.prospect.age!=null?popover.prospect.age:'—'}</span></div>
          </div>
        </div>
      )}
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
    const list=(polls||[]).map(p=>{
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

function App(){
  const [tab,setTab]=useState("pfk");
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
  const [shareOpen,setShareOpen]=useState(false);
  const [shareText,setShareText]=useState('');
  const [shareCopied,setShareCopied]=useState(false);
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

  useEffect(()=>{
    fetch('js/prospects-2026.json').then(r=>r.json()).then(arr=>{
      const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
      const m={}; arr.forEach(p=>{m[norm(p.name)]=p;}); setProspects(m);
    }).catch(()=>{});
  },[]);
  const [session,setSession]=useState(null);
  const [userRow,setUserRow]=useState(null);
  const [authOpen,setAuthOpen]=useState(false);
  const [authMode,setAuthMode]=useState('signin');
  const [authEmail,setAuthEmail]=useState('');
  const [authPassword,setAuthPassword]=useState('');
  const [authSleeper,setAuthSleeper]=useState('');
  const [authMsg,setAuthMsg]=useState('');

  useEffect(()=>{
    if(!sb) return;
    sb.auth.getSession().then(({data})=>setSession(data.session));
    const { data:sub } = sb.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>sub?.subscription?.unsubscribe?.();
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
    fetchOfficialRankings(pfkSettings).then(row=>{
      if(!row?.data||!Array.isArray(row.data)){ setPfkMissing(true); setOfficialList(null); setOfficialUpdated(null); return; }
      setPfkMissing(!sameSettings(row.settings,pfkSettings));
      setOfficialUpdated(row.updated_at);
      setOfficialList(row.data);
      const hadSaved=loadStorage('pfk_saved_lists',null);
      if(!hadSaved){
        setSavedLists([{id:'list_1',name:'My Rankings',items:row.data}]);
      }
    });
  },[pfkSettings]);

  const list=useMemo(()=>savedLists.find(l=>l.id===activeListId)?.items||buildInitialList(),[savedLists,activeListId]);
  const setList=useCallback(updater=>{
    setSavedLists(prev=>prev.map(l=>l.id===activeListId?{...l,items:typeof updater==='function'?updater(l.items):updater}:l));
  },[activeListId]);

  useEffect(()=>{ localStorage.setItem("pfk_saved_lists",JSON.stringify(savedLists)); },[savedLists]);

  useEffect(()=>{
    if(!session||!sb) return;
    sb.from('user_rankings').select('*').eq('user_id',session.user.id).then(({data})=>{
      if(data&&data.length){
        setSavedLists(data.map(r=>({id:'cloud_'+r.id,cloudId:r.id,name:r.name,items:r.items})));
        setActiveListId('cloud_'+data[0].id);
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
            if(data) setSavedLists(prev=>prev.map(x=>x.id===l.id?{...x,id:'cloud_'+data.id,cloudId:data.id}:x));
          });
        }
      });
    },1000);
    return ()=>clearTimeout(t);
  },[savedLists,session]);
  useEffect(()=>{ localStorage.setItem("pfk_active_list_id",activeListId); },[activeListId]);
  useEffect(()=>{ localStorage.setItem("pfk_roster",JSON.stringify(teamRoster)); },[teamRoster]);
  useEffect(()=>{ localStorage.setItem("pfk_picks",JSON.stringify(picks)); },[picks]);

  const flash=()=>{ setSaved(true); setTimeout(()=>setSaved(false),1500); };

  const switchList=id=>{setActiveListId(id);setHistory([]);};
  const createList=()=>{
    const id='list_'+Date.now();
    const n=savedLists.length+1;
    setSavedLists(prev=>[...prev,{id,name:`List ${n}`,items:officialList||buildInitialList()}]);
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
  const buildShareText=()=>{
    const out=[]; let count=0, pendingTier=false;
    for(const it of list){
      if(count>=12) break;
      if(it.type==='tier'){ if(count>0) pendingTier=true; continue; }
      if(it.type==='player'){
        if(pendingTier){ out.push('-TIER-'); pendingTier=false; }
        count++;
        out.push(`${count}. ${it.name} (${it.pos})`);
      }
    }
    const fmt=(pfkSettings.format||'Superflex');
    return `My 2026 ${fmt} Dynasty Rookie 1st Round 🏆\n\n${out.join('\n')}\n\nvia @PlayForKeepsFF\nplayforkeeps-web.pages.dev`;
  };
  const shareTop12=async()=>{
    const players=list.filter(x=>x.type==='player');
    if(players.length<12){ alert(`You only have ${players.length} players in this list — add at least 12 before sharing your 1st Round.`); return; }
    const text=buildShareText();
    setShareText(text);
    setShareCopied(false);
    if(navigator.share){
      try{ await navigator.share({text,title:'My 2026 Dynasty Rookie 1st Round'}); return; }catch(e){ if(e?.name==='AbortError') return; }
    }
    setShareOpen(true);
  };
  const copyShareText=async()=>{
    try{ await navigator.clipboard.writeText(shareText); setShareCopied(true); setTimeout(()=>setShareCopied(false),2200); }catch(e){ alert('Copy failed — select and copy manually.'); }
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

  const commonProps={onReorder:reorder,onMove:moveItem,onEdit:r=>{setEditingPlayer(r.id);setPlayerDraft({...r});},onRemove:removePlayer,onRenameStart:(id,name)=>{setRenamingTier(id);setTierNameDraft(name);},onRenameCancel:()=>setRenamingTier(null),onRenameSave:saveRename,onDeleteTier:deleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer:savePlayer,onCancelEdit:()=>setEditingPlayer(null),posFilter};

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
      <div className="pfk-sticky-header" style={{background:"#0a0a0a",borderBottom:"2px solid #FFD700",padding:"12px 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1140,margin:"0 auto",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <img className="pfk-logo-img" src="https://i.imgur.com/ftHKrQX.png" alt="PFK" style={{width:88,height:88,objectFit:"contain",flexShrink:0}} onError={e=>e.target.style.display="none"}/>
          <div>
            <div className="pfk-header-title" style={{fontSize:26,fontWeight:900,color:"#FFD700",letterSpacing:3,textShadow:"0 0 20px #FFD700"}}>PLAY FOR KEEPS</div>
            <div className="pfk-header-subtitle" style={{fontSize:12,color:"#8B6914",letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Dynasty Rookie Draft Ranks</div>
          </div>
          {saved&&<div style={{marginLeft:8,padding:"4px 12px",background:"#0a2a1a",border:"1px solid #10b981",borderRadius:20,fontSize:13,color:"#10b981",fontWeight:700}}>✓ Saved</div>}
          <div className="pfk-top-tabs" style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["pfk","👑 PFK 2026 Rookies"],["custom","✏️ My 2026 Rookies"],["team","📊 Power Rankings"],["polls","🗳️ Trade Polls"]].filter(([t])=>t!=="team"||/^(dev\.|localhost|127\.)/.test(location.hostname)).map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 14px",borderRadius:8,border:tab===t?"2px solid #FFD700":"2px solid #2a2a2a",background:tab===t?"#FFD700":"transparent",color:tab===t?"#000":"#999",fontWeight:700,fontSize:14,cursor:"pointer",textTransform:"uppercase",letterSpacing:1}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {session?(
              <>
                <div style={{fontSize:13,color:"#FFD700",fontWeight:700,textAlign:"right"}}>
                  <div style={{fontSize:12}}><a href="https://x.com/PlayForKeepsFF" target="_blank" rel="noopener noreferrer" style={{color:"#FFD700",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:5}}><svg width="11" height="11" viewBox="0 0 24 24" fill="#FFD700" aria-hidden="true"><path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.36-6.72L4.5 22H1.244l8.04-9.187L1 2h7.016l4.844 6.12L18.244 2zm-1.2 18h1.9L7.048 4H5.05l12 16z"/></svg>@PlayForKeepsFF</a></div>
                  {userRow?.sleeper_username&&<div style={{fontSize:11,color:"#888"}}>Sleeper: {userRow.sleeper_username}</div>}
                </div>
                <button onClick={doLogout} style={{padding:"6px 10px",background:"transparent",border:"1px solid #555",borderRadius:6,color:"#888",cursor:"pointer",fontSize:13}}>Sign out</button>
              </>
            ):(
              <button onClick={()=>{setAuthMode('signin');setAuthOpen(true);}} style={{padding:"8px 16px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:13,letterSpacing:1}}>SIGN IN</button>
            )}
          </div>
        </div>
      </div>
      <div className="pfk-content" style={{maxWidth:1140,margin:"0 auto",padding:"20px 14px"}}>
        {tab==="pfk"&&(
          <div>
            <div style={{background:"#0f0f0f",border:"1px solid #FFD700",borderRadius:12,padding:"14px 20px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
              <div><div style={{fontSize:14,fontWeight:900,color:"#FFD700",letterSpacing:1}}>PLAY FOR KEEPS OFFICIAL ROOKIE RANKINGS</div><div style={{fontSize:13,color:"#666",marginTop:2}}>2026 Dynasty Rookie Class{officialUpdated?" · Last updated by PFK Staff · "+new Date(officialUpdated).toLocaleString():" · PFK Staff Rankings"}</div></div>
            </div>
            <div style={{marginBottom:14,padding:'10px 12px',background:'#0a0a0a',border:'1px solid #222',borderRadius:10}}>
              <SettingsToggleBar value={pfkSettings} onChange={setPfkSettings}/>
              {pfkMissing&&<div style={{fontSize:12,color:'#d97706',marginTop:8}}>No ranking published yet for this combo — showing most recent.</div>}
            </div>
            <FilterBar/>
            <div className="pfk-rookie-list">
              <RenderList src={officialList||PFK_LIST} allowEdit={false} prospects={prospects} {...commonProps}/>
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
              <span style={{fontSize:13,color:"#666",flex:1}}>Hold ⠿ to drag · ▲▼ nudge · saves automatically</span>
              <button onClick={()=>setShowAddTier(v=>!v)} style={{padding:"6px 12px",background:"#0f0f0f",border:"1px solid #FFD700",borderRadius:7,color:"#FFD700",fontWeight:700,cursor:"pointer",fontSize:14}}>+ Tier</button>
              <button onClick={()=>setShowAdd(v=>!v)} style={{padding:"6px 12px",background:"#222",border:"1px solid #444",borderRadius:7,color:"#ccc",fontWeight:700,cursor:"pointer",fontSize:14}}>+ Player</button>
              <button onClick={undo} disabled={!history.length} style={{padding:"6px 12px",background:"transparent",border:"1px solid "+(history.length?"#FFD700":"#333"),borderRadius:7,color:history.length?"#FFD700":"#444",fontWeight:700,cursor:history.length?"pointer":"default",fontSize:14}}>↩ Undo</button>
              <button onClick={()=>{if(!confirm('Reset to the latest published PFK rankings? Your edits to this list will be lost.')) return; setHistory([]);setList(officialList||buildInitialList());}} style={{padding:"6px 12px",background:"transparent",border:"1px solid #555",borderRadius:7,color:"#888",fontWeight:700,cursor:"pointer",fontSize:14}}>↺ Reset</button>
              <button onClick={shareTop12} style={{padding:"6px 12px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:14,letterSpacing:0.5}}>📤 Share 1st Round</button>
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
      {shareOpen&&(
        <div onClick={()=>setShareOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:460,background:'#0f0f0f',border:'1px solid #FFD700',borderRadius:12,padding:20}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontWeight:900,fontSize:16,letterSpacing:1.5,color:'#FFD700'}}>SHARE YOUR 1ST ROUND</div>
              <button onClick={()=>setShareOpen(false)} style={{background:'none',border:'none',color:'#888',fontSize:20,cursor:'pointer'}}>✕</button>
            </div>
            <textarea readOnly value={shareText} onFocus={e=>e.target.select()} style={{width:'100%',height:200,background:'#000',border:'1px solid #333',borderRadius:8,color:'#eee',padding:10,fontSize:13,fontFamily:'inherit',resize:'vertical',marginBottom:12}}/>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" style={{flex:'1 1 140px',padding:'10px 14px',background:'#FFD700',border:'none',borderRadius:7,color:'#000',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:0.5,textAlign:'center',textDecoration:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}><svg width="14" height="14" viewBox="0 0 24 24" fill="#000" aria-hidden="true"><path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.36-6.72L4.5 22H1.244l8.04-9.187L1 2h7.016l4.844 6.12L18.244 2zm-1.2 18h1.9L7.048 4H5.05l12 16z"/></svg>Share to X</a>
              <button onClick={copyShareText} style={{flex:'1 1 140px',padding:'10px 14px',background:shareCopied?'#10b981':'transparent',border:'1px solid '+(shareCopied?'#10b981':'#FFD700'),borderRadius:7,color:shareCopied?'#000':'#FFD700',fontWeight:900,cursor:'pointer',fontSize:14,letterSpacing:0.5}}>{shareCopied?'✓ Copied!':'Copy text'}</button>
            </div>
          </div>
        </div>
      )}
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
    const snapshotSettings={...adminSettings};
    fetchOfficialRankings(snapshotSettings).then(row=>{
      const hasMatch=row&&row.data&&Array.isArray(row.data)&&sameSettings(row.settings,snapshotSettings);
      const items=(row?.data&&Array.isArray(row.data))?row.data:buildInitialList();
      setSets(prev=>prev[currentSig]?prev:{...prev,[currentSig]:{
        items, saved: hasMatch?JSON.stringify(items):null,
        updatedAt: hasMatch?row.updated_at:null,
        missing: !hasMatch, history:[], settings:snapshotSettings
      }});
    });
  },[session,currentSig]);

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

  const commonProps={ onReorder,onMove,onEdit,onRemove,onRenameStart,onRenameCancel,onRenameSave,onDeleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer,onCancelEdit,posFilter };

  return (
    <div style={{minHeight:'100vh',paddingBottom:40}}>
      <div className="pfk-admin-topbar" style={{position:'sticky',top:0,zIndex:100,background:'#080808',borderBottom:'2px solid #FFD700',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <div>
          <div style={{fontWeight:900,fontSize:16,letterSpacing:2,color:'#FFD700'}}>PFK ADMIN</div>
          <div style={{fontSize:12,color:'#888'}}>{session.user.email}{lastUpdated&&' · last published '+new Date(lastUpdated).toLocaleString()}</div>
        </div>
        <div className="pfk-admin-actions" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={()=>setShowAddPlayer(s=>!s)} style={{padding:'8px 12px',background:'transparent',border:'1px solid #FFD700',borderRadius:6,color:'#FFD700',cursor:'pointer',fontSize:14,fontWeight:700}}>+ Player</button>
          <button onClick={addTier} style={{padding:'8px 12px',background:'transparent',border:'1px solid #FFD700',borderRadius:6,color:'#FFD700',cursor:'pointer',fontSize:14,fontWeight:700}}>+ Tier</button>
          <button onClick={copyToAllCombos} style={{padding:'8px 12px',background:'transparent',border:'1px solid #c084fc',borderRadius:6,color:'#c084fc',cursor:'pointer',fontSize:14,fontWeight:700}} title="Overwrite this list into every settings combo">⇢ Copy to all combos</button>
          <button onClick={undo} disabled={!history.length} style={{padding:'8px 12px',background:'transparent',border:'1px solid #555',borderRadius:6,color:'#aaa',cursor:history.length?'pointer':'not-allowed',fontSize:14}}>↶ Undo</button>
          <button onClick={publish} disabled={!dirtyCount} style={{padding:'8px 16px',background:dirtyCount?'#FFD700':'#333',color:dirtyCount?'#000':'#888',border:'none',borderRadius:6,fontWeight:900,cursor:dirtyCount?'pointer':'not-allowed',fontSize:14,letterSpacing:1}}>{`PUBLISH${dirtyCount?` (${dirtyCount})`:''}`}</button>
          <button onClick={logout} style={{padding:'8px 12px',background:'transparent',border:'1px solid #555',borderRadius:6,color:'#888',cursor:'pointer',fontSize:14}}>Sign out</button>
        </div>
      </div>
      {publishMsg&&<div style={{padding:'8px 16px',background:publishMsg.startsWith('Error')?'#3a1010':'#103a10',color:publishMsg.startsWith('Error')?'#ef4444':'#10b981',fontSize:14,fontWeight:700}}>{publishMsg}</div>}
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
        <RenderList src={list} allowEdit={true} {...commonProps}/>
      </div>
    </div>
  );
}

const isAdminRoute = window.location.pathname.replace(/\/$/,'').endsWith('/admin');
ReactDOM.render(isAdminRoute ? <AdminApp/> : <App/>, document.getElementById("root"));
