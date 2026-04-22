const { useState, useRef, useCallback, useEffect, useMemo } = React;

const SUPABASE_URL = 'https://ymwoabgesjqrojurdxmv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8z6jTCr6BPKmltRnNvEVzA_do7BmXKe';
const sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const DEFAULT_SETTINGS = { format:'Superflex', tep:0.5, ppr:1.0, passTd:6, ppc:0 };
const FORMAT_CHOICES=['1QB','Superflex'];
const TEP_CHOICES=[0,0.5,0.75,1.0], PPR_CHOICES=[0,0.5,1.0], PTD_CHOICES=[4,5,6], PPC_CHOICES=[0,0.25,0.5];

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
    <div style={{display:'flex',flexDirection:'column',gap:3}}>
      <div style={{fontSize:9,color:'#777',letterSpacing:1,fontWeight:700}}>{label}</div>
      <div style={{display:'flex',gap:2,background:'#0a0a0a',border:'1px solid #222',borderRadius:6,padding:2}}>
        {choices.map(c=>(
          <button key={c} onClick={()=>onChange({...value,[field]:c})} style={{padding:compact?'3px 8px':'5px 10px',background:current===c?'#FFD700':'transparent',color:current===c?'#000':'#888',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700}}>{c}{suffix}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
      <Group label="FORMAT" choices={FORMAT_CHOICES} suffix="" current={value.format||'Superflex'} field="format"/>
      <Group label="TEP" choices={TEP_CHOICES} suffix="" current={value.tep} field="tep"/>
      <Group label="PPR" choices={PPR_CHOICES} suffix="" current={value.ppr} field="ppr"/>
      <Group label="PASS TD" choices={PTD_CHOICES} suffix="pt" current={value.passTd} field="passTd"/>
      <Group label="PPC" choices={PPC_CHOICES} suffix="" current={value.ppc} field="ppc"/>
    </div>
  );
}

const TIER_COLORS = ["#FFD700","#FFC107","#FFAA00","#E09000","#d97706","#c2840a","#a37820","#8B6914","#a3a3a3","#7c8896"];
const POS_COLORS = { WR:"#3b82f6", RB:"#10b981", TE:"#f59e0b", QB:"#ef4444" };
const INITIAL_TIERS = ["Untouchable","X-Factor","Super-Star","Star","Starter","Good Depth","Bench Player","Roster Clogger","Taxi Squad","Waivers"];

const buildInitialList = () => {
  const players = [
    {id:"p1",name:"Jeremiyah Love",pos:"RB",age:21.3,college:"Notre Dame",nflTeam:"NO"},
    {id:"p2",name:"Fernando Mendoza",pos:"QB",age:22.9,college:"Indiana",nflTeam:"CHI"},
    {id:"p3",name:"Carnell Tate",pos:"WR",age:21.6,college:"Ohio State",nflTeam:"CHI"},
    {id:"p4",name:"Makai Lemon",pos:"WR",age:22.3,college:"USC",nflTeam:"NE"},
    {id:"p5",name:"KC Concepcion",pos:"WR",age:21.9,college:"Texas A&M",nflTeam:"PHI"},
    {id:"p6",name:"Kenyon Sadiq",pos:"TE",age:21.5,college:"Oregon",nflTeam:"LAR"},
    {id:"p7",name:"Denzel Boston",pos:"WR",age:22.7,college:"Washington",nflTeam:"NYG"},
    {id:"p8",name:"Jordyn Tyson",pos:"WR",age:22.1,college:"Arizona State",nflTeam:"CLE"},
    {id:"p9",name:"Omar Cooper Jr.",pos:"WR",age:22.7,college:"Indiana",nflTeam:"HOU"},
    {id:"p10",name:"Jadarian Price",pos:"RB",age:22.9,college:"Notre Dame",nflTeam:"DAL"},
    {id:"p11",name:"Zachariah Branch",pos:"WR",age:22.4,college:"Georgia",nflTeam:"LAR"},
    {id:"p12",name:"Jonah Coleman",pos:"RB",age:22.9,college:"Washington",nflTeam:"DEN"},
    {id:"p13",name:"Kaytron Allen",pos:"RB",age:23.7,college:"Penn State",nflTeam:"IND"},
    {id:"p14",name:"Ty Simpson",pos:"QB",age:23.0,college:"Alabama",nflTeam:"TEN"},
    {id:"p15",name:"Elijah Sarratt",pos:"WR",age:23.3,college:"Indiana",nflTeam:"IND"},
    {id:"p16",name:"Michael Trigg",pos:"TE",age:24.2,college:"Baylor",nflTeam:"MIN"},
    {id:"p17",name:"Eli Stowers",pos:"TE",age:23.3,college:"Vanderbilt",nflTeam:"ATL"},
    {id:"p18",name:"Max Klare",pos:"TE",age:23.2,college:"Ohio State",nflTeam:"PIT"},
    {id:"p19",name:"Emmett Johnson",pos:"RB",age:22.9,college:"Nebraska",nflTeam:"NO"},
    {id:"p20",name:"Chris Bell",pos:"WR",age:22.3,college:"Louisville",nflTeam:"BUF"},
    {id:"p21",name:"Chris Brazzell II",pos:"WR",age:22.3,college:"Tennessee",nflTeam:"ARI"},
    {id:"p22",name:"Nicholas Singleton",pos:"RB",age:22.7,college:"Penn State",nflTeam:"PHI"},
    {id:"p23",name:"Antonio Williams",pos:"WR",age:22.1,college:"Clemson",nflTeam:"TB"},
    {id:"p24",name:"Germie Bernard",pos:"WR",age:22.8,college:"Alabama",nflTeam:"SEA"},
    {id:"p25",name:"Garrett Nussmeier",pos:"QB",age:24.5,college:"LSU",nflTeam:"DET"},
    {id:"p26",name:"Carson Beck",pos:"QB",age:23.8,college:"Miami",nflTeam:"MIA"},
    {id:"p27",name:"Eli Heidenreich",pos:"RB",age:22.5,college:"Navy",nflTeam:"UDFA"},
    {id:"p28",name:"Malachi Fields",pos:"WR",age:22.3,college:"Notre Dame",nflTeam:"GB"},
    {id:"p29",name:"Drew Allar",pos:"QB",age:null,college:"Penn State",nflTeam:"TBD"},
    {id:"p30",name:"Justin Joly",pos:"TE",age:23.5,college:"NC State",nflTeam:"TBD"},
    {id:"p31",name:"Eric McCalister",pos:"WR",age:23,college:"TCU",nflTeam:"TBD"},
    {id:"p32",name:"Bryce Lance",pos:"WR",age:null,college:"N. Dakota St",nflTeam:"TBD"},
    {id:"p33",name:"CJ Daniels",pos:"WR",age:24.3,college:"Miami",nflTeam:"TBD"},
    {id:"p34",name:"Ja'Kobi Lane",pos:"WR",age:22.1,college:"USC",nflTeam:"TBD"},
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
    {id:"p49",name:"Oscar Delp",pos:"TE",age:null,college:"Georgia",nflTeam:"TBD"},
    {id:"p50",name:"Adam Randall",pos:"RB",age:22.1,college:"Clemson",nflTeam:"TBD"},
    {id:"p51",name:"Deion Burks",pos:"WR",age:23.7,college:"Oklahoma",nflTeam:"TBD"},
    {id:"p52",name:"Le'Veon Moss",pos:"RB",age:null,college:"Texas A&M",nflTeam:"TBD"},
    {id:"p53",name:"Mike Washington",pos:"RB",age:24.5,college:"Arkansas",nflTeam:"TBD"},
    {id:"p54",name:"Jamarion Miller",pos:"RB",age:22.4,college:"Alabama",nflTeam:"TBD"},
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

const SLEEPER = 'https://api.sleeper.app/v1';
const FC      = 'https://api.fantasycalc.com';
const POS_ORDER = ['QB','RB','WR','TE'];
const ORDINALS  = ['1st','2nd','3rd','4th'];

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

  const NO_CACHE = {cache:'no-store'};

  const selectLeague = async (lg) => {
    setLeague(lg); setLoading('data'); setError('');
    setRosters([]); setUsers([]); setFcValues([]); setTradedPicks([]); setChampionships([]); setDraftSlots({}); setFcError(false); setLastFetched(null);
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
      // Build draft slot order: use Sleeper draft's slot_to_roster_id (most accurate)
      const allDrafts = Array.isArray(drafts)?drafts:[];
      // Find the upcoming rookie draft: not auction, prefer pre_draft status, latest season
      const rookieDraft = allDrafts
        .filter(d=>d.type!=='auction')
        .sort((a,b)=>Number(b.season||0)-Number(a.season||0)||(a.status==='pre_draft'?-1:1))[0];
      const slotMap = rookieDraft?.slot_to_roster_id||{};
      const rosterToSlot = {};
      if(Object.keys(slotMap).length){
        Object.entries(slotMap).forEach(([slot,rid])=>{ rosterToSlot[Number(rid)]=Number(slot); });
      } else {
        // Fallback: fetch previous season's final standings since current season hasn't played yet
        const prevId = lg.previous_league_id;
        const prevRosters = prevId
          ? await fetch(`${SLEEPER}/league/${prevId}/rosters`,NO_CACHE).then(r=>r.json()).catch(()=>[])
          : (Array.isArray(rs)?rs:[]);
        [...(Array.isArray(prevRosters)?prevRosters:[])].sort((a,b)=>
          (a.settings?.wins||0)-(b.settings?.wins||0)||
          (b.settings?.losses||0)-(a.settings?.losses||0)||
          a.roster_id-b.roster_id
        ).forEach((r,i)=>{ rosterToSlot[r.roster_id]=i+1; });
      }
      setDraftSlots(rosterToSlot);
      fetchLeagueChampionships(lg).then(c=>setChampionships(c)).catch(()=>{});
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
        // Build redraft lookup by sleeperId
        const rdftById = {};
        (Array.isArray(fcRdft)?fcRdft:[]).forEach(v=>{
          const sid = v.player?.sleeperId||v.player?.maybeSleeperId;
          if(sid) rdftById[String(sid)] = v.value||0;
        });
        // Merge: use dynasty entries but override redraftValue from pure-redraft fetch
        const merged = (Array.isArray(fcDyn)?fcDyn:[]).map(v=>{
          const sid = v.player?.sleeperId||v.player?.maybeSleeperId;
          const rv  = sid ? (rdftById[String(sid)] ?? v.redraftValue ?? 0) : (v.redraftValue||0);
          return {...v, redraftValue: rv};
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
    // slotValues: {1→6665, 2→4118, ...} for 2026 specific pick slots (DP_0_N → slot N+1)
    const slotValues={};
    // futureValues: {"2027_1"→2938, "2028_1"→2108} for generic future 1st round picks
    const futureValues={};
    fcValues.forEach(v=>{
      if(v.player?.position!=='PICK') return;
      const sid = v.player?.sleeperId||'';
      const val = v.value||0;
      // 2026 specific slots: sleeperId = "DP_0_N" where N is 0-based slot index
      const dpM = sid.match(/^DP_0_(\d+)$/);
      if(dpM){ slotValues[Number(dpM[1])+1]=val; return; }
      // Future generic 1st round: sleeperId = "FP_YYYY_R"
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
      // Avg slot value for 2026 fallback when draftSlots unknown
      const avgSlot2026=Object.keys(slotValues).length?Math.round(Object.values(slotValues).reduce((s,v)=>s+v,0)/Object.keys(slotValues).length):0;
      Object.entries(own).forEach(([key,ownRid])=>{
        const [yr,rd,origRid]=key.split('_').map(Number);
        if(rd!==1) return; // FC only values 1st round picks
        let val=0;
        if(yr===startYr){ // 2026: use specific slot if known
          const slot=draftSlots[origRid];
          val=slot?(slotValues[slot]||0):avgSlot2026;
        } else {
          val=futureValues[`${yr}_1`]||0;
        }
        pickDVal[ownRid]=(pickDVal[ownRid]||0)+val;
      });
    }
    const stats=rosters.map(r=>{
      const active=r.players||[];
      const allP=[...active,...(r.taxi||[])];
      let dVal=0,rVal=0;
      // Dynasty: active + taxi players + picks
      allP.forEach(pid=>{ const v=fcMap[pid]; if(v) dVal+=v.value||0; });
      dVal+=(pickDVal[r.roster_id]||0);
      // Redraft: active players only (no taxi, no picks — matches FC methodology)
      active.forEach(pid=>{ const v=fcMap[pid]; if(v) rVal+=v.redraftValue||0; });
      const owner=userMap[r.owner_id];
      return {...r,dVal,rVal,teamName:owner?.metadata?.team_name||owner?.display_name||`Team ${r.roster_id}`,allPlayers:allP};
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
  },[rosters,fcMap,userMap,tradedPicks,fcPickMap,draftSlots,league]);

  const myTeam = ranked.find(r=>r.owner_id===sleeperUser?.user_id);

  const myPicks = useMemo(()=>{
    if(!myTeam||!rosters.length) return [];
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
    // Standings-based order for projecting tier of future picks (worst record = pick 1)
    const standingsOrder=[...rosters]
      .sort((a,b)=>(a.settings?.wins||0)-(b.settings?.wins||0)||(b.settings?.losses||0)-(a.settings?.losses||0)||a.roster_id-b.roster_id)
      .map(r=>r.roster_id);
    return Object.entries(own)
      .filter(([,oid])=>oid===myTeam.roster_id)
      .map(([key])=>{
        const [year,round,origRid]=key.split('_').map(Number);
        const isCurrent = year===startYr;
        // 2026: use real Sleeper draft order if available, else standings
        // 2027+: use current standings to project tier
        const slotNum = isCurrent
          ? (draftSlots[origRid] || standingsOrder.indexOf(origRid)+1 || null)
          : null; // no specific slot for future years
        const slotStr = slotNum ? String(slotNum).padStart(2,'0') : null;
        // Tier from standings for FC lookup (all years)
        const standPos = standingsOrder.indexOf(origRid)+1 || Math.ceil(n/2);
        const tier = standPos<=Math.ceil(n/3)?'early':standPos<=Math.ceil(2*n/3)?'mid':'late';
        return{year,round,origRid,isOwn:origRid===myTeam.roster_id,isCurrent,slotNum,slotStr,tier};
      })
      .sort((a,b)=>a.year-b.year||a.round-b.round||(a.slotNum||99)-(b.slotNum||99));
  },[myTeam,rosters,tradedPicks,draftSlots]);

  useEffect(()=>{
    if(ranked.length&&sleeperUser){
      const slim=ranked.map(({roster_id,owner_id,teamName,dVal,rVal,dRank,rRank,dPct,rPct,arc})=>({roster_id,owner_id,teamName,dVal,rVal,dRank,rRank,dPct,rPct,arc}));
      localStorage.setItem('pfk_ranked',JSON.stringify(slim));
      localStorage.setItem('pfk_league_name',league?.name||'');
    }
  },[ranked]);

  // ── Grouped roster renderer ──
  const RosterSection = () => {
    if (!myTeam) return null;
    const hasFc = fcValues.length > 0;
    const byPos = {};
    POS_ORDER.forEach(p=>{ byPos[p]=[]; });
    myTeam.allPlayers.forEach(pid=>{
      const fc=fcMap[pid];
      const pos=fc?.player?.position;
      if(pos&&byPos[pos]) byPos[pos].push({pid,fc});
      else if(fc) byPos['WR']?.push({pid,fc}); // fallback for flex/unknown
    });
    // Sort each group by dynasty value desc
    POS_ORDER.forEach(p=>{ byPos[p].sort((a,b)=>(b.fc?.value||0)-(a.fc?.value||0)); });

    const myChamps = champCounts[sleeperUser?.user_id]||0;

    return (
      <div>
        {/* Roster header */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
          <span style={{fontSize:11,fontWeight:700,color:'#555',letterSpacing:1}}>ROSTER · {myTeam.allPlayers.length} PLAYERS</span>
          {myChamps>0&&(
            <span style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',background:'#111',border:'1px solid #FFD700',borderRadius:20,fontSize:11,fontWeight:800,color:'#FFD700'}}>
              {'🏆'.repeat(Math.min(myChamps,5))} {myChamps} LEAGUE TITLE{myChamps>1?'S':''}
            </span>
          )}
          {hasFc&&(
            <span style={{marginLeft:'auto',fontSize:10,color:'#555'}}>
              Dynasty · Redraft
            </span>
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
                <span style={{fontWeight:900,color:col,fontSize:11,letterSpacing:1}}>{pos}</span>
                <span style={{fontSize:10,color:col}}>({group.length})</span>
                {hasFc&&posTotalD>0&&(
                  <span style={{marginLeft:'auto',display:'flex',gap:8}}>
                    <span style={{fontSize:10,color:'#FFD700',fontWeight:700}}>{(posTotalD/1000).toFixed(1)}k</span>
                    <span style={{fontSize:10,color:'#3b82f6',fontWeight:700}}>{(posTotalR/1000).toFixed(1)}k</span>
                  </span>
                )}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {group.map(({pid,fc})=>{
                  const dv=fc?.value||0;
                  const rv=fc?.redraftValue||0;
                  return (
                    <div key={pid} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#0a0a0a',border:'1px solid #181818',borderRadius:6}}>
                      <span style={{flex:1,fontSize:13,fontWeight:600,color:fc?'#f0f0f0':'#444',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fc?.player?.name||pid}</span>
                      {fc?.player?.age&&<span style={{fontSize:10,color:'#555',flexShrink:0,whiteSpace:'nowrap'}}>Age {Number(fc.player.age).toFixed(1)}</span>}
                      {fc?.player?.team&&<span style={{fontSize:10,color:'#444',flexShrink:0,minWidth:30,textAlign:'center'}}>{fc.player.team}</span>}
                      {hasFc&&(
                        <div style={{display:'flex',gap:8,flexShrink:0}}>
                          <span style={{fontSize:11,fontWeight:700,color:'#FFD700',minWidth:34,textAlign:'right'}}>{dv>0?(dv/1000).toFixed(1)+'k':'—'}</span>
                          <span style={{fontSize:11,fontWeight:600,color:'#3b82f6',minWidth:34,textAlign:'right'}}>{rv>0?(rv/1000).toFixed(1)+'k':'—'}</span>
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
        {myPicks.length>0&&(
          <div style={{marginTop:4}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px',background:'#111',borderLeft:'3px solid #FFD700',borderRadius:'5px 5px 0 0',marginBottom:3}}>
              <span style={{fontWeight:900,color:'#FFD700',fontSize:11,letterSpacing:1}}>DRAFT CAPITAL</span>
              <span style={{fontSize:10,color:'#FFD700'}}>({myPicks.length} picks)</span>
            </div>
            {Object.entries(
              myPicks.reduce((acc,p)=>{ if(!acc[p.year])acc[p.year]=[]; acc[p.year].push(p); return acc; },{})
            ).map(([year,picks])=>(
              <div key={year}>
                <div style={{fontSize:10,color:'#444',fontWeight:700,letterSpacing:1,padding:'8px 12px 4px',background:'#0a0a0a',borderTop:'1px solid #181818'}}>{year} ROOKIE PICKS</div>
                {picks.map((p,i)=>{
                  const fromTeam = !p.isOwn ? rosterNameMap[p.origRid] : null;
                  const ord = ORDINALS[p.round-1]||`${p.round}th`;
                  const labelColor = p.round===1?'#FFD700':p.round===2?'#bbb':'#888';
                  const {slotValues={},futureValues={}}=fcPickMap;
                  let fcVal=0;
                  if(p.isCurrent && p.round===1){
                    // 2026: exact slot value from FC (DP_0_N)
                    fcVal = p.slotNum ? (slotValues[p.slotNum]||0) : 0;
                  } else if(!p.isCurrent && p.round===1){
                    // 2027/2028: generic 1st round value from FC (FP_YYYY_1)
                    fcVal = futureValues[`${p.year}_1`]||0;
                  }
                  // FC only values 1st round picks; 2nd/3rd/4th show no value
                  const label = p.slotStr ? `${p.round}.${p.slotStr}` : ord;
                  return (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#0a0a0a',border:'1px solid #181818',borderTop:'none',borderRadius:i===picks.length-1?'0 0 6px 6px':'0'}}>
                      <span style={{fontSize:12,fontWeight:900,color:labelColor,minWidth:36,flexShrink:0}}>{label}</span>
                      <span style={{flex:1,fontSize:11,color:'#666'}}>{fromTeam?`via ${fromTeam}`:'Own pick'}</span>
                      {p.round===1
                        ? <span style={{fontSize:11,fontWeight:700,color:'#FFD700',flexShrink:0}}>{fcVal>0?(fcVal/1000).toFixed(1)+'k':'—'}</span>
                        : null
                      }
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
          {sleeperUser&&<span style={{fontSize:12,color:'#10b981',fontWeight:700}}>✓ {sleeperUser.display_name}</span>}
        </div>
        {error&&<div style={{marginTop:10,padding:'8px 12px',background:'#200000',border:'1px solid #ef4444',borderRadius:7,fontSize:12,color:'#ef4444'}}>{error}</div>}
      </div>

      {/* League Picker */}
      {sleeperUser&&leagues.length>0&&(
        <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
          <div style={{fontSize:13,fontWeight:900,color:'#FFD700',marginBottom:14,textTransform:'uppercase',letterSpacing:1}}>🏈 Your Leagues · 2025</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {leagues.map(lg=>{
              const type=lg.settings?.type===2?'Dynasty':lg.settings?.type===1?'Keeper':'Redraft';
              const active=league?.league_id===lg.league_id;
              return (
                <button key={lg.league_id} onClick={()=>selectLeague(lg)}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:active?'#141414':'#080808',border:'1px solid '+(active?'#FFD700':'#222'),borderRadius:9,cursor:'pointer',textAlign:'left',width:'100%'}}>
                  <span style={{padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:800,background:'#111',color:type==='Dynasty'?'#FFD700':type==='Keeper'?'#3b82f6':'#aaa',border:'1px solid '+(type==='Dynasty'?'#FFD700':type==='Keeper'?'#3b82f6':'#555'),flexShrink:0}}>{type}</span>
                  <span style={{fontWeight:700,fontSize:13,color:active?'#FFD700':'#f0f0f0',flex:1}}>{lg.name}</span>
                  <span style={{fontSize:11,color:'#555'}}>{lg.total_rosters} teams</span>
                  {active&&<span style={{fontSize:11,color:'#FFD700',fontWeight:700}}>●</span>}
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
          {loading==='data'?'Loading roster data…':'Fetching player values from FantasyCalc…'}
        </div>
      )}

      {/* My Team Card */}
      {myTeam&&(
        <div style={{background:'#0f0f0f',border:`2px solid ${myTeam.arc.color}`,borderRadius:14,padding:24}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap',marginBottom:18}}>
            <div style={{flex:1,minWidth:180}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <div style={{fontSize:11,color:'#666',fontWeight:700,letterSpacing:2}}>YOUR TEAM</div>
                <button onClick={refreshLeague} disabled={!!loading} style={{marginLeft:'auto',padding:'3px 10px',background:'#111',border:'1px solid #333',borderRadius:6,color:loading?'#444':'#aaa',cursor:loading?'default':'pointer',fontSize:10,fontWeight:700,letterSpacing:0.5}}>{loading?'LOADING…':'↻ REFRESH'}</button>
              </div>
              <div style={{fontSize:20,fontWeight:900,color:'#f0f0f0'}}>{myTeam.teamName}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2,flexWrap:'wrap'}}>
                <div style={{fontSize:11,color:'#666'}}>{league?.name}</div>
                {lastFetched&&<div style={{fontSize:10,color:'#444'}}>· Updated {lastFetched.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>}
              </div>
            </div>
            <div style={{textAlign:'center',padding:'12px 18px',background:'#111',border:`2px solid ${myTeam.arc.color}`,borderRadius:10,flexShrink:0}}>
              <div style={{fontSize:26}}>{myTeam.arc.emoji}</div>
              <div style={{fontSize:15,fontWeight:900,color:myTeam.arc.color,marginTop:2,letterSpacing:1}}>{myTeam.arc.label.toUpperCase()}</div>
              <div style={{fontSize:10,color:'#888',marginTop:3,maxWidth:160}}>{myTeam.arc.desc}</div>
            </div>
          </div>
          {/* Stat pills */}
          {fcValues.length>0&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:20}}>
              {[
                {l:'Dynasty Rank', v:`#${myTeam.dRank} / ${ranked.length}`, c:myTeam.arc.color},
                {l:'Redraft Rank',  v:`#${myTeam.rRank} / ${ranked.length}`, c:myTeam.rRank<=ranked.length/3?'#10b981':myTeam.rRank<=ranked.length*2/3?'#FFD700':'#ef4444'},
                {l:'Dynasty Value', v:(myTeam.dVal/1000).toFixed(1)+'k',     c:'#FFD700'},
                {l:'Redraft Value', v:(myTeam.rVal/1000).toFixed(1)+'k',     c:'#3b82f6'},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:'#0a0a0a',borderRadius:8,padding:'10px 12px',border:'1px solid #1e1e1e',textAlign:'center'}}>
                  <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
                  <div style={{fontSize:10,fontWeight:600,color:'#666',marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          )}
          {fcError&&<div style={{padding:'8px 12px',background:'#1a0e00',border:'1px solid #f59e0b',borderRadius:7,fontSize:11,color:'#f59e0b',marginBottom:14}}>⚠️ FantasyCalc values unavailable — showing Sleeper roster only.</div>}
          <RosterSection/>
        </div>
      )}

      {/* League Standings + Championship History — side-by-side on desktop */}
      <div className="pfk-pr-grid">
      {ranked.length>0&&(
        <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:12,padding:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
            <span style={{fontSize:13,fontWeight:900,color:'#FFD700',textTransform:'uppercase',letterSpacing:1}}>📊 League Standings</span>
            {championships.length>0&&<span style={{fontSize:10,color:'#555',marginLeft:4}}>🏆 = league titles</span>}
          </div>
          {fcError&&<div style={{padding:'8px 12px',background:'#1a0e00',border:'1px solid #f59e0b',borderRadius:7,fontSize:11,color:'#f59e0b',marginBottom:12}}>⚠️ FantasyCalc unavailable — showing Sleeper rosters only.</div>}
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {ranked.map((t,i)=>{
              const isMe=t.owner_id===sleeperUser?.user_id;
              const rings=champCounts[t.owner_id]||0;
              return (
                <div key={t.roster_id} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:isMe?'#141414':'#0a0a0a',border:'1px solid '+(isMe?t.arc.color:'#1e1e1e'),borderRadius:9,flexWrap:'wrap'}}>
                  <span style={{fontSize:13,fontWeight:900,color:i<3?'#FFD700':'#555',width:24,flexShrink:0,textAlign:'center'}}>#{i+1}</span>
                  <span style={{padding:'2px 8px',fontSize:10,fontWeight:800,borderRadius:4,background:'#111',color:t.arc.color,border:'1px solid '+t.arc.color,flexShrink:0,whiteSpace:'nowrap'}}>{t.arc.emoji} {t.arc.label}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:isMe?900:600,color:isMe?'#FFD700':'#f0f0f0',minWidth:100}}>{t.teamName}{isMe?' ★':''}</span>
                  {rings>0&&<span style={{fontSize:12,flexShrink:0,letterSpacing:1}} title={`${rings} league title${rings>1?'s':''}`}>{'🏆'.repeat(Math.min(rings,5))}</span>}
                  {fcValues.length>0&&(
                    <div style={{display:'flex',gap:10,flexShrink:0,alignItems:'center'}}>
                      <span style={{fontSize:11,color:'#FFD700',fontWeight:700}}>D {(t.dVal/1000).toFixed(1)}k</span>
                      <span style={{fontSize:11,color:'#3b82f6',fontWeight:700}}>R {(t.rVal/1000).toFixed(1)}k</span>
                      <span style={{fontSize:10,color:'#555'}}>Rdft #{t.rRank}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:14,display:'flex',flexWrap:'wrap',gap:7}}>
            {[classifyTeam(80,80),classifyTeam(20,80),classifyTeam(80,20),classifyTeam(60,60),classifyTeam(55,35),classifyTeam(45,30),classifyTeam(20,20)]
              .filter((v,i,a)=>a.findIndex(x=>x.label===v.label)===i)
              .map(a=>(
                <span key={a.label} style={{padding:'3px 9px',borderRadius:12,fontSize:10,fontWeight:700,background:'#111',color:a.color,border:'1px solid '+a.color}}>{a.emoji} {a.label}</span>
              ))}
          </div>
        </div>
      )}

      {/* Championship History */}
      {championships.length>0&&(
        <div style={{background:'#0f0f0f',border:'2px solid #FFD700',borderRadius:14,padding:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,flexWrap:'wrap'}}>
            <span style={{fontSize:13,fontWeight:900,color:'#FFD700',textTransform:'uppercase',letterSpacing:1}}>🏆 Championship History</span>
            <span style={{fontSize:11,color:'#555'}}>{championships.length} season{championships.length!==1?'s':''} of data</span>
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
                      <div style={{fontSize:11,color:'#555',marginTop:1}}>{c.ownerName}</div>
                    )}
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                    {rings>1&&<span style={{padding:'2px 8px',background:'#111',border:'1px solid #FFD700',borderRadius:10,fontSize:10,fontWeight:800,color:'#FFD700'}}>{rings}× Champ</span>}
                    {isDefending&&<span style={{padding:'2px 9px',background:'#FFD700',borderRadius:10,fontSize:10,fontWeight:900,color:'#000'}}>DEFENDING</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>{/* end pfk-pr-grid */}

      {sleeperUser&&!league&&!loading&&leagues.length>0&&(
        <div style={{padding:'30px',textAlign:'center',color:'#555',fontSize:13}}>← Select a league above to see your team analysis</div>
      )}
    </div>
  );
}

function RenderList({src,allowEdit,onReorder,onMove,onEdit,onRemove,onRenameStart,onRenameCancel,onRenameSave,onDeleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer,onCancelEdit,posFilter}){
  const rowRefs = useRef({});
  const [draggingId,setDraggingId] = useState(null);
  const [insertBefore,setInsertBefore] = useState(null);
  const [ghostPos,setGhostPos] = useState({x:0,y:0});
  const [ghostOff,setGhostOff] = useState({x:0,y:0});
  const fl = posFilter.size>=4?src:src.filter(x=>x.type==="tier"||posFilter.has(x.pos));

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
        <span style={{width:44,textAlign:"center",fontSize:11,fontWeight:800,color:slot==="FAAB"?"#e0a800":col}}>{slot}</span>
        <span style={{padding:"2px 7px",borderRadius:5,fontSize:10,fontWeight:800,background:POS_COLORS[draggingItem.pos]+"22",color:POS_COLORS[draggingItem.pos],border:"1px solid "+POS_COLORS[draggingItem.pos]+"44"}}>{draggingItem.pos}</span>
        <span style={{fontWeight:700,fontSize:14,flex:1}}>{draggingItem.name}</span>
        <span style={{fontSize:11,color:"#555"}}>{draggingItem.college}</span>
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
                  <button onPointerDown={e=>e.stopPropagation()} onClick={onRenameSave} style={{padding:"4px 12px",background:"#FFD700",border:"none",borderRadius:6,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>Save</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={onRenameCancel} style={{padding:"4px 8px",background:"transparent",border:"1px solid #333",borderRadius:6,color:"#777",cursor:"pointer",fontSize:12}}>✕</button></>
                ):(
                  <><span style={{fontSize:20,fontWeight:900,color:col,textTransform:"uppercase",letterSpacing:2,flex:1}}>{item.name}</span>
                  {allowEdit&&<>
                    <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onRenameStart(item.id,item.name)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#666",cursor:"pointer",fontSize:11,padding:"2px 8px"}}>✏️</button>
                    <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onDeleteTier(item.id)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#444",cursor:"pointer",fontSize:11,padding:"2px 8px"}}>🗑️</button>
                    <div style={{display:"flex",flexDirection:"column",gap:1}}>
                      <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,-1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:3,color:"#555",cursor:"pointer",fontSize:10,padding:"1px 5px"}}>▲</button>
                      <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:3,color:"#555",cursor:"pointer",fontSize:10,padding:"1px 5px"}}>▼</button>
                    </div>
                  </>}</>
                )}
              </div>
            </React.Fragment>
          );
        }
        const pidx=getPlayerIndex(item.id,src),slot=slotLabel(pidx),tname=getPlayerTier(item.id,src),col=getTierColor(tname,src),isEd=editingPlayer===item.id;
        if(isEd)return(
          <React.Fragment key={item.id}>
            {showLine&&<DropLine/>}
            <div style={{background:"#0f0f0f",border:"1px solid #FFD700",borderRadius:10,padding:"14px 16px"}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
                <div style={{display:"flex",flexDirection:"column",gap:3,flex:2,minWidth:120}}>
                  <label style={{fontSize:10,color:"#888"}}>NAME</label>
                  <input value={playerDraft.name||""} onChange={e=>setPlayerDraft({...playerDraft,name:e.target.value})} style={{padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12,width:"100%"}}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{fontSize:10,color:"#888"}}>POS</label>
                  <select value={playerDraft.pos||"WR"} onChange={e=>setPlayerDraft({...playerDraft,pos:e.target.value})} style={{padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12}}>
                    {["WR","RB","TE","QB"].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                {[["college","COLLEGE"]].map(([k,l])=>(
                  <div key={k} style={{display:"flex",flexDirection:"column",gap:3}}>
                    <label style={{fontSize:10,color:"#888"}}>{l}</label>
                    <input value={playerDraft[k]||""} onChange={e=>setPlayerDraft({...playerDraft,[k]:e.target.value})} style={{padding:"7px 8px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12,width:k==="college"?90:58}}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={onSavePlayer} style={{padding:"7px 18px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>Save</button>
                <button onClick={onCancelEdit} style={{padding:"7px 12px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:12}}>Cancel</button>
              </div>
            </div>
          </React.Fragment>
        );
        return(
          <React.Fragment key={item.id}>
            {showLine&&<DropLine/>}
            <div ref={el=>rowRefs.current[item.id]=el}
              onPointerDown={allowEdit?e=>onPD(e,item.id):undefined}
              onPointerMove={allowEdit?onPM:undefined} onPointerUp={allowEdit?onPU:undefined} onPointerCancel={allowEdit?onPU:undefined}
              style={{background:"#0f0f0f",border:"2px solid #1e1e1e",borderRadius:10,padding:"10px 14px",cursor:allowEdit?"grab":"default",opacity:isDrag?0.25:1,transition:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {allowEdit&&<span style={{color:"#555",fontSize:18,flexShrink:0,touchAction:"none"}}>⠿</span>}
                <span style={{width:44,textAlign:"center",fontSize:11,fontWeight:800,flexShrink:0,color:slot==="FAAB"?"#e0a800":col,letterSpacing:0.5}}>{slot}</span>
                <span style={{padding:"2px 7px",borderRadius:5,fontSize:10,fontWeight:800,flexShrink:0,background:"#111",color:POS_COLORS[item.pos],border:"1px solid "+POS_COLORS[item.pos]}}>{item.pos}</span>
                <span style={{fontWeight:700,fontSize:14,flexShrink:0}}>{item.name}</span>
                <span style={{fontSize:11,color:"#888",flexShrink:0,fontStyle:"italic"}}>{item.college}</span>
                <span style={{flex:1}}/>
                {allowEdit&&<div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,-1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:4,color:"#666",cursor:"pointer",fontSize:10,padding:"1px 6px"}}>▲</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onMove(item.id,1)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:4,color:"#666",cursor:"pointer",fontSize:10,padding:"1px 6px"}}>▼</button>
                </div>}
                {allowEdit&&<>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onEdit(item)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,color:"#666",cursor:"pointer",fontSize:12,padding:"4px 8px"}}>✏️</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>onRemove(item.id)} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,color:"#444",cursor:"pointer",fontSize:12,padding:"4px 8px"}}>✕</button>
                </>}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {draggingId&&insertBefore===null&&<DropLine/>}
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
          <div style={{fontSize:11,color:'#777',marginTop:2}}>Post a trade, vote anonymously. You can change your vote anytime.</div>
        </div>
        {session?(
          <button onClick={()=>setShowCreate(s=>!s)} style={{padding:'10px 18px',background:'#FFD700',color:'#000',border:'none',borderRadius:8,fontWeight:900,cursor:'pointer',fontSize:12,letterSpacing:1}}>{showCreate?'✕ CANCEL':'+ NEW POLL'}</button>
        ):(
          <button onClick={onRequestSignIn} style={{padding:'10px 18px',background:'transparent',color:'#FFD700',border:'1px solid #FFD700',borderRadius:8,fontWeight:900,cursor:'pointer',fontSize:12,letterSpacing:1}}>SIGN IN TO POST</button>
        )}
      </div>

      {showCreate&&(
        <div style={{background:'#0f0f0f',border:'1px solid #FFD700',borderRadius:10,padding:16,marginBottom:18}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:12}}>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:10,color:'#888',letterSpacing:1}}>TEAMS</label>
              <input value={newSettings.teams} onChange={e=>setNewSettings({...newSettings,teams:e.target.value})} placeholder="12" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:10,color:'#888',letterSpacing:1}}>FORMAT</label>
              <select value={newSettings.format} onChange={e=>setNewSettings({...newSettings,format:e.target.value})} style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}>
                <option>Superflex</option><option>1QB</option>
              </select>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:10,color:'#888',letterSpacing:1}}>PPR</label>
              <input value={newSettings.ppr} onChange={e=>setNewSettings({...newSettings,ppr:e.target.value})} placeholder="1.0" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:10,color:'#888',letterSpacing:1}}>TE PREMIUM</label>
              <input value={newSettings.tep} onChange={e=>setNewSettings({...newSettings,tep:e.target.value})} placeholder="1.0" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:10,color:'#888',letterSpacing:1}}>PASS TD</label>
              <input value={newSettings.passTd} onChange={e=>setNewSettings({...newSettings,passTd:e.target.value})} placeholder="6" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:10,color:'#888',letterSpacing:1}}>PPC</label>
              <input value={newSettings.ppc} onChange={e=>setNewSettings({...newSettings,ppc:e.target.value})} placeholder="0" style={{padding:9,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <label style={{fontSize:10,color:'#888',letterSpacing:1}}>TEAM STATUS (optional)</label>
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
            {newOpts.length<10&&<button onClick={addOpt} style={{padding:'7px 12px',background:'transparent',border:'1px solid #333',borderRadius:6,color:'#aaa',cursor:'pointer',fontSize:12}}>+ Option</button>}
            <button onClick={createPoll} style={{padding:'7px 18px',background:'#FFD700',color:'#000',border:'none',borderRadius:6,fontWeight:900,cursor:'pointer',fontSize:12,letterSpacing:1,marginLeft:'auto'}}>POST POLL</button>
          </div>
          {err&&<div style={{color:'#ef4444',fontSize:12,marginTop:8}}>{err}</div>}
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
                    {p.settings.teams&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:11,color:'#FFD700',fontWeight:700}}>{p.settings.teams}-team</span>}
                    {p.settings.format&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:11,color:'#FFD700',fontWeight:700}}>{p.settings.format}</span>}
                    {(p.settings.ppr||p.settings.ppr===0)&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:11,color:'#FFD700',fontWeight:700}}>{p.settings.ppr} PPR</span>}
                    {(p.settings.tep||p.settings.tep===0)&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:11,color:'#FFD700',fontWeight:700}}>{p.settings.tep} TEP</span>}
                    {p.settings.passTd&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:11,color:'#FFD700',fontWeight:700}}>{p.settings.passTd} pt pass TD</span>}
                    {p.settings.ppc>0&&<span style={{padding:'4px 10px',background:'#1a1a1a',border:'1px solid #FFD700',borderRadius:12,fontSize:11,color:'#FFD700',fontWeight:700}}>{p.settings.ppc} PPC</span>}
                    {p.settings.status&&<span style={{padding:'4px 10px',background:'#FFD700',border:'1px solid #FFD700',borderRadius:12,fontSize:11,color:'#000',fontWeight:800}}>{p.settings.status}</span>}
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
                          <span style={{fontSize:11,color:'#999',fontWeight:700,flexShrink:0}}>{p.counts[i]} · {pct}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{marginTop:10,display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:'#555'}}>
                  <span>{p.total} vote{p.total===1?'':'s'} · anonymous</span>
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
                {!session&&<div style={{marginTop:6,fontSize:10,color:'#666'}}>Sign in to vote</div>}
                {voted&&<div style={{marginTop:6,fontSize:10,color:'#666'}}>You can change your vote by tapping another option.</div>}
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
        <div style={{fontSize:11,color:'#666',marginTop:3,letterSpacing:1}}>{leagueName}</div>
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
              <div style={{fontSize:10,color:'#555',fontWeight:700,letterSpacing:2,marginBottom:8}}>{label.toUpperCase()}</div>
              <div style={{fontSize:44,fontWeight:900,color,lineHeight:1}}>#{rank}</div>
              <div style={{fontSize:11,color:'#444',marginTop:4}}>of {n} teams</div>
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
          <div style={{fontSize:12,fontWeight:900,color:'#FFD700',marginBottom:18,textTransform:'uppercase',letterSpacing:1}}>📊 Dynasty Value · Full League</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {ranked.map(t => {
              const isMe = t.owner_id === sleeperUser?.user_id;
              const barW  = Math.max(4, Math.round((t.dVal/maxVal)*100));
              return (
                <div key={t.roster_id}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <span style={{fontSize:11,fontWeight:isMe?800:500,color:isMe?t.arc.color:'#888',maxWidth:'60%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {isMe?'★ ':''}{t.teamName}
                    </span>
                    <span style={{fontSize:10,color:isMe?t.arc.color:'#555',flexShrink:0}}>{t.arc.emoji} {t.arc.label}</span>
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
        <div style={{fontSize:12,fontWeight:900,color:'#FFD700',marginBottom:14,textTransform:'uppercase',letterSpacing:1}}>📖 Archetype Guide</div>
        {[classifyTeam(80,80),classifyTeam(20,80),classifyTeam(80,20),classifyTeam(65,65),classifyTeam(55,35),classifyTeam(45,30),classifyTeam(20,20)]
          .filter((v,i,a)=>a.findIndex(x=>x.label===v.label)===i)
          .map(a=>(
            <div key={a.label} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'10px 0',borderBottom:'1px solid #151515'}}>
              <span style={{fontSize:22,width:30,flexShrink:0,textAlign:'center'}}>{a.emoji}</span>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:a.color}}>{a.label}</div>
                <div style={{fontSize:11,color:'#555',marginTop:2}}>{a.desc}</div>
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
  const deleteTier=id=>{push(list);setList(prev=>prev.filter(x=>x.id!==id));};
  const saveRename=()=>{if(!renamingTier)return;const name=tierNameDraft.trim()||renamingTier;push(list);setList(prev=>prev.map(x=>x.type==="tier"&&x.id===renamingTier?{...x,name}:x));setRenamingTier(null);};
  const addTier=()=>{if(!newTierName.trim())return;const id="t_"+newTierName+"_"+Date.now();push(list);setList(prev=>[{type:"tier",id,name:newTierName.trim()},...prev]);setNewTierName("");setShowAddTier(false);};
  const savePlayer=()=>{push(list);setList(prev=>prev.map(x=>x.type==="player"&&x.id===editingPlayer?{...x,...playerDraft,id:x.id,type:"player"}:x));setEditingPlayer(null);flash();};
  const removePlayer=id=>{push(list);setList(prev=>prev.filter(x=>x.id!==id));};
  const addNew=()=>{if(!newPlayer.name)return;push(list);const id="p_"+Date.now();setList(prev=>[...prev,{type:"player",id,...newPlayer}]);setNewPlayer({name:"",pos:"WR",college:""});setShowAdd(false);};

  const inp=ex=>({padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12,...ex});
  const avgAge=teamRoster.length?(teamRoster.reduce((s,p)=>s+Number(p.age||25),0)/teamRoster.length).toFixed(1):"—";
  const grade=(()=>{let s=Math.min(picks.length*5,20)+(Number(avgAge)<=24?15:Number(avgAge)<=26?8:0);if(s>=30)return{g:"A",l:"Championship Window",c:"#FFD700"};if(s>=20)return{g:"B+",l:"Contender",c:"#FFC107"};return{g:"B",l:"Building",c:"#e0a800"};})();

  const FilterBar=()=>(
    <div className="pfk-filter-bar" style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{color:"#666",fontSize:12,fontWeight:700}}>POS:</span>
      {["WR","RB","TE","QB"].map(p=>{
        const on=posFilter.has(p);
        return <button key={p} onClick={()=>togglePos(p)} style={{padding:"5px 11px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",border:on?"2px solid "+POS_COLORS[p]:"2px solid #2a2a2a",background:on?POS_COLORS[p]+"22":"transparent",color:on?POS_COLORS[p]:"#555",transition:"all .15s"}}>{p}</button>;
      })}
      {posFilter.size<4&&<button onClick={()=>setPosFilter(new Set(["WR","RB","TE","QB"]))} style={{padding:"5px 10px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",border:"2px solid #333",background:"transparent",color:"#555"}}>ALL</button>}
    </div>
  );

  const commonProps={onReorder:reorder,onMove:moveItem,onEdit:r=>{setEditingPlayer(r.id);setPlayerDraft({...r});},onRemove:removePlayer,onRenameStart:(id,name)=>{setRenamingTier(id);setTierNameDraft(name);},onRenameCancel:()=>setRenamingTier(null),onRenameSave:saveRename,onDeleteTier:deleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer:savePlayer,onCancelEdit:()=>setEditingPlayer(null),posFilter};

  return(
    <div style={{background:"#080808",minHeight:"100vh",color:"#f0f0f0",fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      {authOpen&&(
        <div onClick={()=>setAuthOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,background:"#111",border:"1px solid #FFD700",borderRadius:12,padding:24}}>
            <div style={{display:"flex",gap:4,marginBottom:18,background:"#0a0a0a",borderRadius:8,padding:4}}>
              <button onClick={()=>setAuthMode('signin')} style={{flex:1,padding:"8px",background:authMode==='signin'?"#FFD700":"transparent",color:authMode==='signin'?"#000":"#888",border:"none",borderRadius:6,fontWeight:900,cursor:"pointer",fontSize:12,letterSpacing:1}}>SIGN IN</button>
              <button onClick={()=>setAuthMode('signup')} style={{flex:1,padding:"8px",background:authMode==='signup'?"#FFD700":"transparent",color:authMode==='signup'?"#000":"#888",border:"none",borderRadius:6,fontWeight:900,cursor:"pointer",fontSize:12,letterSpacing:1}}>SIGN UP</button>
            </div>
            <input placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} style={{width:"100%",padding:10,marginBottom:10,background:"#000",border:"1px solid #333",borderRadius:6,color:"#fff",fontSize:13}}/>
            <input type="password" placeholder="Password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doAuth()} style={{width:"100%",padding:10,marginBottom:10,background:"#000",border:"1px solid #333",borderRadius:6,color:"#fff",fontSize:13}}/>
            {authMode==='signup'&&<input placeholder="Sleeper username (optional)" value={authSleeper} onChange={e=>setAuthSleeper(e.target.value)} style={{width:"100%",padding:10,marginBottom:10,background:"#000",border:"1px solid #333",borderRadius:6,color:"#fff",fontSize:13}}/>}
            <button onClick={doAuth} style={{width:"100%",padding:12,background:"#FFD700",color:"#000",border:"none",borderRadius:6,fontWeight:900,cursor:"pointer",letterSpacing:1,fontSize:12}}>{authMode==='signup'?'CREATE ACCOUNT':'SIGN IN'}</button>
            {authMsg&&<div style={{color:authMsg.includes('created')?"#10b981":"#ef4444",fontSize:11,marginTop:10,textAlign:"center"}}>{authMsg}</div>}
            <div style={{textAlign:"center",marginTop:14}}><button onClick={()=>setAuthOpen(false)} style={{background:"none",border:"none",color:"#666",fontSize:11,cursor:"pointer"}}>Close</button></div>
          </div>
        </div>
      )}
      <div className="pfk-sticky-header" style={{background:"#0a0a0a",borderBottom:"2px solid #FFD700",padding:"12px 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1140,margin:"0 auto",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <img className="pfk-logo-img" src="https://i.imgur.com/ftHKrQX.png" alt="PFK" style={{width:54,height:54,objectFit:"contain",flexShrink:0}} onError={e=>e.target.style.display="none"}/>
          <div>
            <div className="pfk-header-title" style={{fontSize:21,fontWeight:900,color:"#FFD700",letterSpacing:3,textShadow:"0 0 20px #FFD700"}}>PLAY FOR KEEPS</div>
            <div className="pfk-header-subtitle" style={{fontSize:10,color:"#8B6914",letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Fantasy Football · Dynasty Analyzer</div>
          </div>
          {saved&&<div style={{marginLeft:8,padding:"4px 12px",background:"#0a2a1a",border:"1px solid #10b981",borderRadius:20,fontSize:11,color:"#10b981",fontWeight:700}}>✓ Saved</div>}
          <div className="pfk-top-tabs" style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["pfk","👑 PFK 2026 Rookies"],["custom","✏️ My 2026 Rookies"],["team","📊 Power Rankings"],["polls","🗳️ Trade Polls"]].map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 14px",borderRadius:8,border:tab===t?"2px solid #FFD700":"2px solid #2a2a2a",background:tab===t?"#FFD700":"transparent",color:tab===t?"#000":"#999",fontWeight:700,fontSize:12,cursor:"pointer",textTransform:"uppercase",letterSpacing:1}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {session?(
              <>
                <div style={{fontSize:11,color:"#FFD700",fontWeight:700,textAlign:"right"}}>
                  <div style={{fontSize:10}}>{session.user.email}</div>
                  {userRow?.sleeper_username&&<div style={{fontSize:9,color:"#888"}}>Sleeper: {userRow.sleeper_username}</div>}
                </div>
                <button onClick={doLogout} style={{padding:"6px 10px",background:"transparent",border:"1px solid #555",borderRadius:6,color:"#888",cursor:"pointer",fontSize:11}}>Sign out</button>
              </>
            ):(
              <button onClick={()=>{setAuthMode('signin');setAuthOpen(true);}} style={{padding:"8px 16px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:11,letterSpacing:1}}>SIGN IN</button>
            )}
          </div>
        </div>
      </div>
      <div className="pfk-content" style={{maxWidth:1140,margin:"0 auto",padding:"20px 14px"}}>
        {tab==="pfk"&&(
          <div>
            <div style={{background:"#0f0f0f",border:"1px solid #FFD700",borderRadius:12,padding:"14px 20px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:18}}>👑</span>
              <div><div style={{fontSize:14,fontWeight:900,color:"#FFD700",letterSpacing:1}}>PLAY FOR KEEPS OFFICIAL RANKINGS</div><div style={{fontSize:11,color:"#666",marginTop:2}}>2026 Dynasty Rookie Class{officialUpdated?" · Last updated by PFK Staff · "+new Date(officialUpdated).toLocaleString():" · PFK Staff Rankings"}</div></div>
            </div>
            <div style={{marginBottom:14,padding:'10px 12px',background:'#0a0a0a',border:'1px solid #222',borderRadius:10}}>
              <SettingsToggleBar value={pfkSettings} onChange={setPfkSettings}/>
              {pfkMissing&&<div style={{fontSize:10,color:'#d97706',marginTop:8}}>No ranking published yet for this combo — showing most recent.</div>}
            </div>
            <FilterBar/>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch',margin:'0 -2px'}}>
              <RenderList src={officialList||PFK_LIST} allowEdit={false} {...commonProps}/>
            </div>
          </div>
        )}
        {tab==="custom"&&(
          <div>
            {/* Saved lists selector */}
            <div style={{background:"#0a0a0a",border:"1px solid #1e1e1e",borderRadius:12,padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:11,fontWeight:700,color:"#555",letterSpacing:1,flexShrink:0}}>MY LISTS</span>
                <button onClick={createList} disabled={savedLists.length>=10} style={{marginLeft:"auto",padding:"4px 12px",background:savedLists.length>=10?"#111":"#FFD700",border:"none",borderRadius:6,color:savedLists.length>=10?"#444":"#000",fontWeight:900,cursor:savedLists.length>=10?"default":"pointer",fontSize:11,flexShrink:0}}>+ New List</button>
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
                          style={{padding:"5px 10px",background:"#0d0d0d",border:"1px solid #FFD700",borderRadius:7,color:"#FFD700",fontSize:12,fontWeight:700,width:130}}/>
                      ):(
                        <button onClick={()=>switchList(sl.id)}
                          style={{padding:"5px 12px",borderRadius:20,border:active?"2px solid #FFD700":"2px solid #2a2a2a",background:active?"#1a1400":"transparent",color:active?"#FFD700":"#666",fontWeight:700,fontSize:12,cursor:"pointer",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {sl.name}
                        </button>
                      )}
                      {!isRen&&active&&(
                        <button onClick={()=>{setRenamingListId(sl.id);setListNameDraft(sl.name);}} title="Rename"
                          style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#555",cursor:"pointer",fontSize:10,padding:"2px 6px",flexShrink:0}}>✏️</button>
                      )}
                      {!isRen&&savedLists.length>1&&(
                        <button onClick={()=>deleteList(sl.id)} title="Delete list"
                          style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#444",cursor:"pointer",fontSize:10,padding:"2px 6px",flexShrink:0}}>✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Toolbar */}
            <div style={{background:"#111",border:"1px solid #FFD700",borderRadius:12,padding:"12px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:800,color:"#FFD700"}}>✏️ {savedLists.find(l=>l.id===activeListId)?.name||"My Rankings"}</span>
              <span style={{fontSize:11,color:"#666",flex:1}}>Hold ⠿ to drag · ▲▼ nudge · saves automatically</span>
              <button onClick={()=>setShowAddTier(v=>!v)} style={{padding:"6px 12px",background:"#0f0f0f",border:"1px solid #FFD700",borderRadius:7,color:"#FFD700",fontWeight:700,cursor:"pointer",fontSize:12}}>+ Tier</button>
              <button onClick={()=>setShowAdd(v=>!v)} style={{padding:"6px 12px",background:"#222",border:"1px solid #444",borderRadius:7,color:"#ccc",fontWeight:700,cursor:"pointer",fontSize:12}}>+ Player</button>
              <button onClick={undo} disabled={!history.length} style={{padding:"6px 12px",background:"transparent",border:"1px solid "+(history.length?"#FFD700":"#333"),borderRadius:7,color:history.length?"#FFD700":"#444",fontWeight:700,cursor:history.length?"pointer":"default",fontSize:12}}>↩ Undo</button>
              <button onClick={()=>{setHistory([]);setList(buildInitialList());}} style={{padding:"6px 12px",background:"transparent",border:"1px solid #555",borderRadius:7,color:"#888",fontWeight:700,cursor:"pointer",fontSize:12}}>↺ Reset</button>
            </div>
            {showAddTier&&(<div style={{background:"#111",border:"1px solid #FFD700",borderRadius:10,padding:14,marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
              <input value={newTierName} onChange={e=>setNewTierName(e.target.value)} placeholder="Tier name" onKeyDown={e=>e.key==="Enter"&&addTier()} style={{flex:1,padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:13}}/>
              <button onClick={addTier} style={{padding:"7px 16px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>Add</button>
              <button onClick={()=>setShowAddTier(false)} style={{padding:"7px 10px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:12}}>✕</button>
            </div>)}
            {showAdd&&(<div style={{background:"#111",border:"1px solid #FFD700",borderRadius:10,padding:14,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{display:"flex",flexDirection:"column",gap:3,flex:2,minWidth:110}}><label style={{fontSize:10,color:"#666"}}>NAME</label><input value={newPlayer.name} onChange={e=>setNewPlayer({...newPlayer,name:e.target.value})} placeholder="Player name" style={inp({width:"100%"})}/></div>
              <div style={{display:"flex",flexDirection:"column",gap:3}}><label style={{fontSize:10,color:"#666"}}>POS</label><select value={newPlayer.pos} onChange={e=>setNewPlayer({...newPlayer,pos:e.target.value})} style={inp({})}>{["WR","RB","TE","QB"].map(o=><option key={o}>{o}</option>)}</select></div>
              {[["college","SCHOOL","School"]].map(([k,l,ph])=>(<div key={k} style={{display:"flex",flexDirection:"column",gap:3}}><label style={{fontSize:10,color:"#666"}}>{l}</label><input value={newPlayer[k]||""} onChange={e=>setNewPlayer({...newPlayer,[k]:e.target.value})} placeholder={ph} style={inp({width:120})}/></div>))}
              <button onClick={addNew} style={{padding:"7px 16px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>Add</button>
              <button onClick={()=>setShowAdd(false)} style={{padding:"7px 10px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:12}}>✕</button>
            </div>)}
            <FilterBar/>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch',margin:'0 -2px'}}>
              <RenderList src={list} allowEdit={true} {...commonProps}/>
            </div>
          </div>
        )}
        {tab==="team"&&<TeamTab/>}
        {tab==="polls"&&<TradePollsTab session={session} onRequestSignIn={()=>{setAuthMode('signin');setAuthOpen(true);}}/>}
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
  const addPlayer=()=>{ if(!newP.name.trim()) return; mutate(prev=>[...prev,{type:'player',id:'p_'+Date.now(),name:newP.name.trim(),pos:newP.pos,college:newP.college.trim()}]); setNewP({name:'',pos:'WR',college:''}); setShowAddPlayer(false); };

  if(loading) return <div style={{padding:40,color:'#FFD700',textAlign:'center'}}>Loading...</div>;

  if(!session){
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
        <div style={{width:'100%',maxWidth:380,background:'#111',border:'1px solid #333',borderRadius:12,padding:28}}>
          <div style={{textAlign:'center',marginBottom:20}}>
            <div style={{fontWeight:900,fontSize:22,letterSpacing:3,color:'#FFD700'}}>PFK ADMIN</div>
            <div style={{fontSize:11,color:'#888',marginTop:4}}>Staff login</div>
          </div>
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:10,marginBottom:10,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff'}}/>
          <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} style={{width:'100%',padding:10,marginBottom:14,background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff'}}/>
          <button onClick={login} style={{width:'100%',padding:12,background:'#FFD700',color:'#000',border:'none',borderRadius:6,fontWeight:900,cursor:'pointer',letterSpacing:1}}>SIGN IN</button>
          {loginErr&&<div style={{color:'#ef4444',fontSize:12,marginTop:10,textAlign:'center'}}>{loginErr}</div>}
          <div style={{textAlign:'center',marginTop:16}}><a href="/" style={{fontSize:11,color:'#666',textDecoration:'none'}}>← Back to site</a></div>
        </div>
      </div>
    );
  }

  const commonProps={ onReorder,onMove,onEdit,onRemove,onRenameStart,onRenameCancel,onRenameSave,onDeleteTier,renamingTier,tierNameDraft,setTierNameDraft,editingPlayer,playerDraft,setPlayerDraft,onSavePlayer,onCancelEdit,posFilter };

  return (
    <div style={{minHeight:'100vh',paddingBottom:40}}>
      <div style={{position:'sticky',top:0,zIndex:100,background:'#080808',borderBottom:'2px solid #FFD700',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <div>
          <div style={{fontWeight:900,fontSize:16,letterSpacing:2,color:'#FFD700'}}>PFK ADMIN</div>
          <div style={{fontSize:10,color:'#888'}}>{session.user.email}{lastUpdated&&' · last published '+new Date(lastUpdated).toLocaleString()}</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={()=>setShowAddPlayer(s=>!s)} style={{padding:'8px 12px',background:'transparent',border:'1px solid #FFD700',borderRadius:6,color:'#FFD700',cursor:'pointer',fontSize:12,fontWeight:700}}>+ Player</button>
          <button onClick={addTier} style={{padding:'8px 12px',background:'transparent',border:'1px solid #FFD700',borderRadius:6,color:'#FFD700',cursor:'pointer',fontSize:12,fontWeight:700}}>+ Tier</button>
          <button onClick={undo} disabled={!history.length} style={{padding:'8px 12px',background:'transparent',border:'1px solid #555',borderRadius:6,color:'#aaa',cursor:history.length?'pointer':'not-allowed',fontSize:12}}>↶ Undo</button>
          <button onClick={publish} disabled={!dirtyCount} style={{padding:'8px 16px',background:dirtyCount?'#FFD700':'#333',color:dirtyCount?'#000':'#888',border:'none',borderRadius:6,fontWeight:900,cursor:dirtyCount?'pointer':'not-allowed',fontSize:12,letterSpacing:1}}>{`PUBLISH${dirtyCount?` (${dirtyCount})`:''}`}</button>
          <button onClick={logout} style={{padding:'8px 12px',background:'transparent',border:'1px solid #555',borderRadius:6,color:'#888',cursor:'pointer',fontSize:12}}>Sign out</button>
        </div>
      </div>
      {publishMsg&&<div style={{padding:'8px 16px',background:publishMsg.startsWith('Error')?'#3a1010':'#103a10',color:publishMsg.startsWith('Error')?'#ef4444':'#10b981',fontSize:12,fontWeight:700}}>{publishMsg}</div>}
      <div style={{padding:'12px 16px',background:'#0a0a0a',borderBottom:'1px solid #222'}}>
        <div style={{fontSize:10,color:'#FFD700',fontWeight:800,letterSpacing:2,marginBottom:8}}>RANKING SET — PICK SETTINGS, EDIT, PUBLISH</div>
        <SettingsToggleBar value={adminSettings} onChange={setAdminSettings}/>
        {adminMissing&&<div style={{fontSize:11,color:'#d97706',marginTop:8}}>⚠ No ranking published for this combo yet. Editing will start from the most recent ranking — hit PUBLISH to create a new set for these settings.</div>}
      </div>
      {showAddPlayer&&(
        <div style={{padding:'12px 16px',background:'#0f0f0f',borderBottom:'1px solid #222',display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 200px',minWidth:140}}>
            <label style={{fontSize:10,color:'#888'}}>NAME</label>
            <input autoFocus value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})} onKeyDown={e=>e.key==='Enter'&&addPlayer()} placeholder="Player name" style={{padding:'8px 10px',background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <label style={{fontSize:10,color:'#888'}}>POS</label>
            <select value={newP.pos} onChange={e=>setNewP({...newP,pos:e.target.value})} style={{padding:'8px 10px',background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}>{['WR','RB','TE','QB'].map(o=><option key={o}>{o}</option>)}</select>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3,flex:'1 1 160px',minWidth:120}}>
            <label style={{fontSize:10,color:'#888'}}>SCHOOL</label>
            <input value={newP.college} onChange={e=>setNewP({...newP,college:e.target.value})} onKeyDown={e=>e.key==='Enter'&&addPlayer()} placeholder="School" style={{padding:'8px 10px',background:'#000',border:'1px solid #333',borderRadius:6,color:'#fff',fontSize:13}}/>
          </div>
          <button onClick={addPlayer} style={{padding:'9px 16px',background:'#FFD700',color:'#000',border:'none',borderRadius:6,fontWeight:900,cursor:'pointer',fontSize:12}}>Add</button>
          <button onClick={()=>setShowAddPlayer(false)} style={{padding:'9px 12px',background:'transparent',border:'1px solid #333',borderRadius:6,color:'#888',cursor:'pointer',fontSize:12}}>Cancel</button>
        </div>
      )}
      <div style={{padding:'16px',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
        <RenderList src={list} allowEdit={true} {...commonProps}/>
      </div>
    </div>
  );
}

const isAdminRoute = window.location.pathname.replace(/\/$/,'').endsWith('/admin');
ReactDOM.render(isAdminRoute ? <AdminApp/> : <App/>, document.getElementById("root"));
