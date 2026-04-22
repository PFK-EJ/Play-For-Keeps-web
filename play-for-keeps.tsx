import { useState, useRef, useCallback } from "react";

// ── Color palette for tiers ──
const TIER_COLORS = [
  "#FFD700","#FFC107","#FFAA00","#E09000",
  "#B8860B","#8B6914","#6B5010","#4a3a0a","#555","#444"
];

const POS_COLORS = { WR:"#3b82f6", RB:"#10b981", TE:"#f59e0b", QB:"#ef4444" };

// Initial tiers as dividers (by name only; color assigned by index)
const INITIAL_TIERS = [
  "Untouchable","X-Factor","Super-Star","Star",
  "Starter","Good Depth","Bench Player","Roster Clogger","Taxi Squad","Waivers"
];

// Each item in the unified list is either type:"player" or type:"tier"
const buildInitialList = () => {
  const players = [
    { id:"p1",  name:"Jeremiyah Love",    pos:"RB", age:21.3, college:"Notre Dame",     nflTeam:"NO"   },
    { id:"p2",  name:"Fernando Mendoza",  pos:"QB", age:22.9, college:"Indiana",        nflTeam:"CHI"  },
    { id:"p3",  name:"Carnell Tate",      pos:"WR", age:21.6, college:"Ohio State",     nflTeam:"CHI"  },
    { id:"p4",  name:"Makai Lemon",       pos:"WR", age:22.3, college:"USC",            nflTeam:"NE"   },
    { id:"p5",  name:"KC Concepcion",     pos:"WR", age:21.9, college:"Texas A&M",      nflTeam:"PHI"  },
    { id:"p6",  name:"Kenyon Sadiq",      pos:"TE", age:21.5, college:"Oregon",         nflTeam:"LAR"  },
    { id:"p7",  name:"Denzel Boston",     pos:"WR", age:22.7, college:"Washington",     nflTeam:"NYG"  },
    { id:"p8",  name:"Jordyn Tyson",      pos:"WR", age:22.1, college:"Arizona State",  nflTeam:"CLE"  },
    { id:"p9",  name:"Omar Cooper Jr.",   pos:"WR", age:22.7, college:"Indiana",        nflTeam:"HOU"  },
    { id:"p10", name:"Jadarian Price",    pos:"RB", age:22.9, college:"Notre Dame",     nflTeam:"DAL"  },
    { id:"p11", name:"Zachariah Branch",  pos:"WR", age:22.4, college:"Georgia",        nflTeam:"LAR"  },
    { id:"p12", name:"Jonah Coleman",     pos:"RB", age:22.9, college:"Washington",     nflTeam:"DEN"  },
    { id:"p13", name:"Kaytron Allen",     pos:"RB", age:23.7, college:"Penn State",     nflTeam:"IND"  },
    { id:"p14", name:"Ty Simpson",        pos:"QB", age:23.0, college:"Alabama",        nflTeam:"TEN"  },
    { id:"p15", name:"Elijah Sarratt",    pos:"WR", age:23.3, college:"Indiana",        nflTeam:"IND"  },
    { id:"p16", name:"Michael Trigg",     pos:"TE", age:24.2, college:"Baylor",         nflTeam:"MIN"  },
    { id:"p17", name:"Eli Stowers",       pos:"TE", age:23.3, college:"Vanderbilt",     nflTeam:"ATL"  },
    { id:"p18", name:"Max Klare",         pos:"TE", age:23.2, college:"Ohio State",     nflTeam:"PIT"  },
    { id:"p19", name:"Emmett Johnson",    pos:"RB", age:22.9, college:"Nebraska",       nflTeam:"NO"   },
    { id:"p20", name:"Chris Bell",        pos:"WR", age:22.3, college:"Louisville",     nflTeam:"BUF"  },
    { id:"p21", name:"Chris Brazzell II", pos:"WR", age:22.3, college:"Tennessee",      nflTeam:"ARI"  },
    { id:"p22", name:"Nicholas Singleton",pos:"RB", age:22.7, college:"Penn State",     nflTeam:"PHI"  },
    { id:"p23", name:"Antonio Williams",  pos:"WR", age:22.1, college:"Clemson",        nflTeam:"TB"   },
    { id:"p24", name:"Germie Bernard",    pos:"WR", age:22.8, college:"Alabama",        nflTeam:"SEA"  },
    { id:"p25", name:"Garrett Nussmeier", pos:"QB", age:24.5, college:"LSU",            nflTeam:"DET"  },
    { id:"p26", name:"Carson Beck",       pos:"QB", age:23.8, college:"Miami",          nflTeam:"MIA"  },
    { id:"p27", name:"Eli Heidenreich",   pos:"RB", age:22.5, college:"Navy",           nflTeam:"UDFA" },
    { id:"p28", name:"Malachi Fields",    pos:"WR", age:22.3, college:"Notre Dame",     nflTeam:"GB"   },
    { id:"p29", name:"Drew Allar",        pos:"QB", age:null,  college:"Penn State",    nflTeam:"TBD"  },
    { id:"p30", name:"Justin Joly",       pos:"TE", age:23.5, college:"NC State",       nflTeam:"TBD"  },
    { id:"p31", name:"Eric McCalister",   pos:"WR", age:23,   college:"TCU",            nflTeam:"TBD"  },
    { id:"p32", name:"Bryce Lance",       pos:"WR", age:null,  college:"N. Dakota St",  nflTeam:"TBD"  },
    { id:"p33", name:"CJ Daniels",        pos:"WR", age:24.3, college:"Miami",          nflTeam:"TBD"  },
    { id:"p34", name:"Ja'Kobi Lane",      pos:"WR", age:22.1, college:"USC",            nflTeam:"TBD"  },
    { id:"p35", name:"Ted Hurst",         pos:"WR", age:null,  college:"Georgia State", nflTeam:"TBD"  },
    { id:"p36", name:"Tanner Koziol",     pos:"TE", age:null,  college:"Houston",       nflTeam:"TBD"  },
    { id:"p37", name:"Kevin Coleman Jr.", pos:"WR", age:null,  college:"Missouri",      nflTeam:"TBD"  },
    { id:"p38", name:"Seth McGowan",      pos:"RB", age:null,  college:"Kentucky",      nflTeam:"TBD"  },
    { id:"p39", name:"Barion Brown",      pos:"WR", age:null,  college:"LSU",           nflTeam:"TBD"  },
    { id:"p40", name:"Jadyn Ott",         pos:"RB", age:null,  college:"Oklahoma",      nflTeam:"TBD"  },
    { id:"p41", name:"Brenen Thompson",   pos:"WR", age:23.1, college:"Miss St.",       nflTeam:"TBD"  },
    { id:"p42", name:"Rahsul Faison",     pos:"RB", age:null,  college:"S. Carolina",   nflTeam:"TBD"  },
    { id:"p43", name:"Jack Endries",      pos:"TE", age:null,  college:"Texas",         nflTeam:"TBD"  },
    { id:"p44", name:"Josh Cameron",      pos:"WR", age:null,  college:"Baylor",        nflTeam:"TBD"  },
    { id:"p45", name:"Skyler Bell",       pos:"WR", age:24.2, college:"UCONN",          nflTeam:"TBD"  },
    { id:"p46", name:"J'Mari Taylor",     pos:"RB", age:null,  college:"Virginia",      nflTeam:"TBD"  },
    { id:"p47", name:"Demond Claiborne",  pos:"RB", age:22.9, college:"Wake Forest",    nflTeam:"TBD"  },
    { id:"p48", name:"Desmond Reid",      pos:"RB", age:null,  college:"Pittsburgh",    nflTeam:"TBD"  },
    { id:"p49", name:"Oscar Delp",        pos:"TE", age:null,  college:"Georgia",       nflTeam:"TBD"  },
    { id:"p50", name:"Adam Randall",      pos:"RB", age:22.1, college:"Clemson",        nflTeam:"TBD"  },
    { id:"p51", name:"Deion Burks",       pos:"WR", age:23.7, college:"Oklahoma",       nflTeam:"TBD"  },
    { id:"p52", name:"Le'Veon Moss",      pos:"RB", age:null,  college:"Texas A&M",     nflTeam:"TBD"  },
    { id:"p53", name:"Mike Washington",   pos:"RB", age:24.5, college:"Arkansas",       nflTeam:"TBD"  },
    { id:"p54", name:"Jamarion Miller",   pos:"RB", age:22.4, college:"Alabama",        nflTeam:"TBD"  },
  ];

  // Interleave tier dividers at fixed positions
  const tierBreaks = { 0:0, 1:1, 2:2, 3:3, 5:4, 9:5, 11:6, 15:7, 22:8, 36:9 };
  const list = [];
  players.forEach((p, i) => {
    if (tierBreaks[i] !== undefined) {
      list.push({ type:"tier", id:`t_${INITIAL_TIERS[tierBreaks[i]]}`, name: INITIAL_TIERS[tierBreaks[i]] });
    }
    list.push({ type:"player", ...p });
  });
  return list;
};

const slotLabel = (playerIndex) => {
  if (playerIndex >= 48) return "FAAB";
  const r = Math.floor(playerIndex/12)+1, p = (playerIndex%12)+1;
  return `${r}.${String(p).padStart(2,"0")}`;
};

// Compute tier color based on order of appearance
const getTierColor = (tierName, list) => {
  const tierItems = list.filter(x=>x.type==="tier");
  const idx = tierItems.findIndex(t=>t.name===tierName);
  return TIER_COLORS[idx % TIER_COLORS.length] || "#555";
};

const getTierBg = (color) => color + "22";

// Given a list, find what tier a player is in
const getPlayerTier = (playerId, list) => {
  let currentTier = "Unranked";
  for (const item of list) {
    if (item.type === "tier") currentTier = item.name;
    if (item.type === "player" && item.id === playerId) return currentTier;
  }
  return currentTier;
};

// Read-only version of the list (PFK tab)
const PFK_LIST = buildInitialList();

export default function App() {
  const [tab, setTab] = useState("pfk");
  const [list, setList] = useState(buildInitialList);
  const [history, setHistory] = useState([]);
  const [draggingId, setDraggingId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [playerDraft, setPlayerDraft] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [newPlayer, setNewPlayer] = useState({name:"",pos:"WR",age:"",college:"",nflTeam:""});
  const [renamingTier, setRenamingTier] = useState(null);
  const [tierNameDraft, setTierNameDraft] = useState("");
  const [showAddTier, setShowAddTier] = useState(false);
  const [newTierName, setNewTierName] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const rowRefs = useRef({});
  const [teamRoster, setTeamRoster] = useState([]);
  const [picks, setPicks] = useState([]);
  const [newTeamPlayer, setNewTeamPlayer] = useState({name:"",pos:"WR",age:"",tier:""});

  const push = useCallback(l => setHistory(h=>[...h.slice(-39), l]), []);

  // ── Pointer drag ──
  const onPointerDown = (e, id) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(id);
    setOverId(id);
  };

  const onPointerMove = useCallback((e) => {
    if (!draggingId) return;
    const y = e.clientY;
    let closest = null, dist = Infinity;
    Object.entries(rowRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const d = Math.abs(y - mid);
      if (d < dist) { dist = d; closest = id; }
    });
    if (closest) setOverId(closest);
  }, [draggingId]);

  const onPointerUp = useCallback(() => {
    if (draggingId && overId && draggingId !== overId) {
      push(list);
      setList(prev => {
        const l = [...prev];
        const fi = l.findIndex(x=>x.id===draggingId);
        const ti = l.findIndex(x=>x.id===overId);
        const [m] = l.splice(fi, 1);
        l.splice(ti, 0, m);
        return l;
      });
    }
    setDraggingId(null);
    setOverId(null);
  }, [draggingId, overId, list, push]);

  const moveItem = (id, dir) => {
    push(list);
    setList(prev => {
      const l = [...prev];
      const i = l.findIndex(x=>x.id===id);
      const sw = i + dir;
      if (sw < 0 || sw >= l.length) return l;
      [l[i], l[sw]] = [l[sw], l[i]];
      return l;
    });
  };

  const undo = () => {
    if (!history.length) return;
    setList(history[history.length-1]);
    setHistory(h=>h.slice(0,-1));
  };

  const deleteTier = (tierId) => {
    push(list);
    setList(prev => prev.filter(x=>x.id!==tierId));
  };

  const saveRename = () => {
    if (!renamingTier) return;
    const name = tierNameDraft.trim() || renamingTier;
    push(list);
    setList(prev => prev.map(x => x.type==="tier" && x.id===renamingTier ? {...x, name} : x));
    setRenamingTier(null);
  };

  const addTier = () => {
    if (!newTierName.trim()) return;
    const id = `t_${newTierName}_${Date.now()}`;
    push(list);
    setList(prev => [{ type:"tier", id, name: newTierName.trim() }, ...prev]);
    setNewTierName("");
    setShowAddTier(false);
  };

  const savePlayer = () => {
    push(list);
    setList(prev => prev.map(x => x.type==="player" && x.id===editingPlayer ? {...x,...playerDraft,id:x.id,type:"player"} : x));
    setEditingPlayer(null);
  };

  const removePlayer = (id) => {
    push(list);
    setList(prev => prev.filter(x=>x.id!==id));
  };

  const addNewPlayer = () => {
    if (!newPlayer.name) return;
    push(list);
    const id = `p_${Date.now()}`;
    setList(prev => [...prev, { type:"player", id, ...newPlayer, age: Number(newPlayer.age)||null }]);
    setNewPlayer({name:"",pos:"WR",age:"",college:"",nflTeam:""});
    setShowAdd(false);
  };

  const inp = (ex={}) => ({padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12,...ex});

  // Compute player slot numbers (only count players)
  const getPlayerIndex = (id, l) => {
    let c = 0;
    for (const x of l) {
      if (x.type==="player") {
        if (x.id===id) return c;
        c++;
      }
    }
    return c;
  };

  // Filter list (for pos filter — keep all tiers, filter players)
  const filteredList = (l) => posFilter === "ALL" ? l
    : l.filter(x => x.type==="tier" || x.pos===posFilter);

  // ── Render a unified list (custom mode) ──
  const RenderList = ({ src, allowEdit }) => {
    const fl = filteredList(src);
    // remove consecutive/leading tier dividers with nothing between them (cosmetic)
    return (
      <div style={{display:"flex",flexDirection:"column",gap:4,touchAction:"none"}}>
        {fl.map((item, visIdx) => {
          const isDragging = draggingId===item.id;
          const isOver = overId===item.id && draggingId && draggingId!==item.id;

          if (item.type==="tier") {
            const color = getTierColor(item.name, src);
            const isRenaming = renamingTier===item.id;
            return (
              <div key={item.id} ref={el=>rowRefs.current[item.id]=el}
                onPointerDown={allowEdit ? e=>onPointerDown(e,item.id) : undefined}
                onPointerMove={allowEdit ? onPointerMove : undefined}
                onPointerUp={allowEdit ? onPointerUp : undefined}
                onPointerCancel={allowEdit ? onPointerUp : undefined}
                style={{
                  display:"flex", alignItems:"center", gap:10,
                  borderLeft:`5px solid ${color}`, paddingLeft:12,
                  marginTop: visIdx===0?0:14, marginBottom:4,
                  cursor: allowEdit?"grab":"default",
                  opacity: isDragging ? 0.4 : 1,
                  background: isOver ? color+"11" : "transparent",
                  borderRadius:4, paddingTop:4, paddingBottom:4,
                  userSelect:"none",
                }}>
                {allowEdit && <span style={{color:"#555",fontSize:16}}>⠿</span>}
                {isRenaming ? (
                  <>
                    <input value={tierNameDraft} onChange={e=>setTierNameDraft(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&saveRename()} autoFocus
                      style={{fontSize:16,fontWeight:900,background:"#1a1200",border:`1px solid ${color}`,borderRadius:6,color:color,padding:"4px 10px",width:180}}/>
                    <button onPointerDown={e=>e.stopPropagation()} onClick={saveRename}
                      style={{padding:"4px 12px",background:"#FFD700",border:"none",borderRadius:6,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>Save</button>
                    <button onPointerDown={e=>e.stopPropagation()} onClick={()=>setRenamingTier(null)}
                      style={{padding:"4px 8px",background:"transparent",border:"1px solid #333",borderRadius:6,color:"#777",cursor:"pointer",fontSize:12}}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{fontSize:20,fontWeight:900,color,textTransform:"uppercase",letterSpacing:2,flex:1}}>{item.name}</span>
                    {allowEdit && (
                      <>
                        <button onPointerDown={e=>e.stopPropagation()}
                          onClick={()=>{setRenamingTier(item.id);setTierNameDraft(item.name);}}
                          style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#666",cursor:"pointer",fontSize:11,padding:"2px 8px"}}>✏️</button>
                        <button onPointerDown={e=>e.stopPropagation()} onClick={()=>deleteTier(item.id)}
                          style={{background:"none",border:"1px solid #2a2a2a",borderRadius:5,color:"#444",cursor:"pointer",fontSize:11,padding:"2px 8px"}}>🗑️</button>
                        <div style={{display:"flex",flexDirection:"column",gap:1}}>
                          <button onPointerDown={e=>e.stopPropagation()} onClick={()=>moveItem(item.id,-1)}
                            style={{background:"none",border:"1px solid #2a2a2a",borderRadius:3,color:"#555",cursor:"pointer",fontSize:10,padding:"1px 5px"}}>▲</button>
                          <button onPointerDown={e=>e.stopPropagation()} onClick={()=>moveItem(item.id,1)}
                            style={{background:"none",border:"1px solid #2a2a2a",borderRadius:3,color:"#555",cursor:"pointer",fontSize:10,padding:"1px 5px"}}>▼</button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          }

          // Player row
          const playerIdx = getPlayerIndex(item.id, src);
          const slot = slotLabel(playerIdx);
          const tierName = getPlayerTier(item.id, src);
          const color = getTierColor(tierName, src);
          const isEd = editingPlayer===item.id;

          if (isEd) return (
            <div key={item.id} style={{background:"#1a1200",border:"1px solid #FFD700",borderRadius:10,padding:"14px 16px"}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
                <div style={{display:"flex",flexDirection:"column",gap:3,flex:2,minWidth:120}}>
                  <label style={{fontSize:10,color:"#888"}}>NAME</label>
                  <input value={playerDraft.name||""} onChange={e=>setPlayerDraft({...playerDraft,name:e.target.value})} style={inp({width:"100%"})}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{fontSize:10,color:"#888"}}>POS</label>
                  <select value={playerDraft.pos||"WR"} onChange={e=>setPlayerDraft({...playerDraft,pos:e.target.value})} style={inp()}>
                    {["WR","RB","TE","QB"].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                {[["age","AGE"],["college","COLLEGE"],["nflTeam","NFL"]].map(([k,l])=>(
                  <div key={k} style={{display:"flex",flexDirection:"column",gap:3}}>
                    <label style={{fontSize:10,color:"#888"}}>{l}</label>
                    <input value={playerDraft[k]||""} onChange={e=>setPlayerDraft({...playerDraft,[k]:e.target.value})} style={inp({width:k==="college"?90:58})}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={savePlayer} style={{padding:"7px 18px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>Save</button>
                <button onClick={()=>setEditingPlayer(null)} style={{padding:"7px 12px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:12}}>Cancel</button>
              </div>
            </div>
          );

          return (
            <div key={item.id} ref={el=>rowRefs.current[item.id]=el}
              onPointerDown={allowEdit ? e=>onPointerDown(e,item.id) : undefined}
              onPointerMove={allowEdit ? onPointerMove : undefined}
              onPointerUp={allowEdit ? onPointerUp : undefined}
              onPointerCancel={allowEdit ? onPointerUp : undefined}
              style={{
                background: isDragging ? color+"22" : isOver ? "#1a1a0a" : "#0f0f0f",
                border:`2px solid ${isDragging ? color : isOver ? "#FFD70077" : "#1e1e1e"}`,
                borderRadius:10, padding:"10px 14px",
                cursor: allowEdit?"grab":"default",
                userSelect:"none",
                opacity: isDragging ? 0.45 : 1,
                transform: isOver ? "translateY(-2px)" : "none",
                transition:"border-color 0.1s,transform 0.1s,opacity 0.1s",
                boxShadow: isOver?"0 4px 14px #FFD70022":"none",
              }}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {allowEdit && <span style={{color:"#555",fontSize:18,flexShrink:0,lineHeight:1}}>⠿</span>}
                <span style={{width:44,textAlign:"center",fontSize:11,fontWeight:800,flexShrink:0,
                  color:slot==="FAAB"?"#e0a800":color,letterSpacing:0.5}}>{slot}</span>
                <span style={{padding:"2px 7px",borderRadius:5,fontSize:10,fontWeight:800,flexShrink:0,
                  background:POS_COLORS[item.pos]+"22",color:POS_COLORS[item.pos],
                  border:`1px solid ${POS_COLORS[item.pos]}44`}}>{item.pos}</span>
                <span style={{fontWeight:700,fontSize:14,flex:1}}>{item.name}</span>
                <span style={{fontSize:11,color:"#555",flexShrink:0,minWidth:36,textAlign:"center"}}>{item.nflTeam}</span>
                {allowEdit && (
                  <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                    <button onPointerDown={e=>e.stopPropagation()} onClick={()=>moveItem(item.id,-1)}
                      style={{background:"none",border:"1px solid #2a2a2a",borderRadius:4,color:"#666",cursor:"pointer",fontSize:10,padding:"1px 6px"}}>▲</button>
                    <button onPointerDown={e=>e.stopPropagation()} onClick={()=>moveItem(item.id,1)}
                      style={{background:"none",border:"1px solid #2a2a2a",borderRadius:4,color:"#666",cursor:"pointer",fontSize:10,padding:"1px 6px"}}>▼</button>
                  </div>
                )}
                {allowEdit && <>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>{setEditingPlayer(item.id);setPlayerDraft({...item});}}
                    style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,color:"#666",cursor:"pointer",fontSize:12,padding:"4px 8px"}}>✏️</button>
                  <button onPointerDown={e=>e.stopPropagation()} onClick={()=>removePlayer(item.id)}
                    style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,color:"#444",cursor:"pointer",fontSize:12,padding:"4px 8px"}}>✕</button>
                </>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const FilterBar = () => (
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{color:"#666",fontSize:12,fontWeight:700}}>POS:</span>
      {["ALL","WR","RB","TE","QB"].map(p=>(
        <button key={p} onClick={()=>setPosFilter(p)} style={{
          padding:"5px 11px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
          border:posFilter===p?`2px solid ${POS_COLORS[p]||"#FFD700"}`:"2px solid #2a2a2a",
          background:posFilter===p?(POS_COLORS[p]||"#FFD700")+"22":"transparent",
          color:posFilter===p?(POS_COLORS[p]||"#FFD700"):"#777"
        }}>{p}</button>
      ))}
    </div>
  );

  // team grade
  const avgAge=teamRoster.length?(teamRoster.reduce((s,p)=>s+Number(p.age||25),0)/teamRoster.length).toFixed(1):"—";
  const eliteCount=teamRoster.filter(r=>r.tier&&["Untouchable","X-Factor","Super-Star"].some(t=>r.tier.includes(t))).length;
  const grade=(()=>{let s=0;s+=Math.min(eliteCount*15,45);s+=Math.min(teamRoster.filter(r=>Number(r.age||99)<=24).length*5,20);s+=Math.min(picks.length*5,20);s+=Number(avgAge)<=24?15:Number(avgAge)<=26?8:0;if(s>=75)return{g:"A",l:"Championship Window",c:"#FFD700"};if(s>=60)return{g:"B+",l:"Contender",c:"#FFC107"};if(s>=45)return{g:"B",l:"Rising",c:"#e0a800"};if(s>=30)return{g:"C+",l:"Transitioning",c:"#b8860b"};return{g:"C",l:"Rebuild",c:"#777"};})();

  return (
    <div style={{background:"#080808",minHeight:"100vh",color:"#f0f0f0",fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#0a0a0a,#1a1200,#0a0a0a)",borderBottom:"2px solid #FFD700",padding:"12px 20px"}}>
        <div style={{maxWidth:1140,margin:"0 auto",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <img src="https://i.imgur.com/ftHKrQX.png" alt="PFK" style={{width:54,height:54,objectFit:"contain",flexShrink:0}} onError={e=>e.target.style.display="none"}/>
          <div>
            <div style={{fontSize:21,fontWeight:900,color:"#FFD700",letterSpacing:3,textShadow:"0 0 20px #FFD70055"}}>PLAY FOR KEEPS</div>
            <div style={{fontSize:10,color:"#8B6914",letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Fantasy Football · Dynasty Analyzer</div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["pfk","👑 PFK Ranks"],["custom","✏️ My Rankings"],["team","📋 My Team"],["outlook","🔮 Outlook"]].map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 14px",borderRadius:8,border:tab===t?"2px solid #FFD700":"2px solid #2a2a2a",background:tab===t?"#FFD700":"transparent",color:tab===t?"#000":"#999",fontWeight:700,fontSize:12,cursor:"pointer",textTransform:"uppercase",letterSpacing:1}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1140,margin:"0 auto",padding:"20px 14px"}}>

        {tab==="pfk" && (
          <div>
            <div style={{background:"linear-gradient(90deg,#1a1200,#0a0a0a)",border:"1px solid #FFD70033",borderRadius:12,padding:"14px 20px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:18}}>👑</span>
              <div>
                <div style={{fontSize:14,fontWeight:900,color:"#FFD700",letterSpacing:1}}>PLAY FOR KEEPS OFFICIAL RANKINGS</div>
                <div style={{fontSize:11,color:"#666",marginTop:2}}>2026 Dynasty Rookie Class · PFK Staff Rankings</div>
              </div>
            </div>
            <FilterBar/>
            <RenderList src={PFK_LIST} allowEdit={false}/>
          </div>
        )}

        {tab==="custom" && (
          <div>
            <div style={{background:"#111",border:"1px solid #FFD70055",borderRadius:12,padding:"12px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:800,color:"#FFD700"}}>✏️ My Rankings</span>
              <span style={{fontSize:11,color:"#666",flex:1}}>Drag ⠿ to move players or tier banners freely · tiers auto-assign</span>
              <button onClick={()=>setShowAddTier(v=>!v)} style={{padding:"6px 12px",background:"#1a1200",border:"1px solid #FFD700",borderRadius:7,color:"#FFD700",fontWeight:700,cursor:"pointer",fontSize:12}}>+ Tier</button>
              <button onClick={()=>setShowAdd(v=>!v)} style={{padding:"6px 12px",background:"#222",border:"1px solid #444",borderRadius:7,color:"#ccc",fontWeight:700,cursor:"pointer",fontSize:12}}>+ Player</button>
              <button onClick={undo} disabled={!history.length} style={{padding:"6px 12px",background:"transparent",border:`1px solid ${history.length?"#FFD700":"#333"}`,borderRadius:7,color:history.length?"#FFD700":"#444",fontWeight:700,cursor:history.length?"pointer":"default",fontSize:12}}>↩ Undo</button>
              <button onClick={()=>{setHistory([]);setList(buildInitialList());}} style={{padding:"6px 12px",background:"transparent",border:"1px solid #555",borderRadius:7,color:"#888",fontWeight:700,cursor:"pointer",fontSize:12}}>↺ Reset</button>
            </div>

            {showAddTier && (
              <div style={{background:"#111",border:"1px solid #FFD700",borderRadius:10,padding:14,marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
                <input value={newTierName} onChange={e=>setNewTierName(e.target.value)} placeholder="Tier name (e.g. Elite)"
                  onKeyDown={e=>e.key==="Enter"&&addTier()}
                  style={{flex:1,padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:13}}/>
                <button onClick={addTier} style={{padding:"7px 16px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>Add Tier</button>
                <button onClick={()=>setShowAddTier(false)} style={{padding:"7px 10px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:12}}>✕</button>
              </div>
            )}

            {showAdd && (
              <div style={{background:"#111",border:"1px solid #FFD700",borderRadius:10,padding:14,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{display:"flex",flexDirection:"column",gap:3,flex:2,minWidth:110}}>
                  <label style={{fontSize:10,color:"#666"}}>NAME</label>
                  <input value={newPlayer.name} onChange={e=>setNewPlayer({...newPlayer,name:e.target.value})} placeholder="Player name"
                    style={{padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12,width:"100%"}}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{fontSize:10,color:"#666"}}>POS</label>
                  <select value={newPlayer.pos} onChange={e=>setNewPlayer({...newPlayer,pos:e.target.value})}
                    style={{padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12}}>
                    {["WR","RB","TE","QB"].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                {[["age","AGE","22"],["college","SCHOOL","School"],["nflTeam","NFL","TBD"]].map(([k,l,ph])=>(
                  <div key={k} style={{display:"flex",flexDirection:"column",gap:3}}>
                    <label style={{fontSize:10,color:"#666"}}>{l}</label>
                    <input value={newPlayer[k]||""} onChange={e=>setNewPlayer({...newPlayer,[k]:e.target.value})} placeholder={ph}
                      style={{padding:"7px 8px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12,width:k==="college"?90:58}}/>
                  </div>
                ))}
                <button onClick={addNewPlayer} style={{padding:"7px 16px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>Add</button>
                <button onClick={()=>setShowAdd(false)} style={{padding:"7px 10px",background:"transparent",border:"1px solid #333",borderRadius:7,color:"#888",cursor:"pointer",fontSize:12}}>✕</button>
              </div>
            )}

            <FilterBar/>
            <RenderList src={list} allowEdit={true}/>
          </div>
        )}

        {tab==="team" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:20}}>
            <div style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:12,padding:20}}>
              <div style={{fontSize:13,fontWeight:900,color:"#FFD700",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>📋 Roster</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                {teamRoster.length===0&&<div style={{color:"#444",fontSize:13}}>No players yet.</div>}
                {teamRoster.map((p,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#080808",borderRadius:7,border:"1px solid #181818"}}>
                    <span style={{padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:800,background:POS_COLORS[p.pos]+"22",color:POS_COLORS[p.pos]}}>{p.pos}</span>
                    <span style={{flex:1,fontSize:13,fontWeight:600}}>{p.name}</span>
                    {p.age&&<span style={{fontSize:11,color:"#555"}}>Age {p.age}</span>}
                    <button onClick={()=>setTeamRoster(teamRoster.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#333",cursor:"pointer"}}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <input value={newTeamPlayer.name} onChange={e=>setNewTeamPlayer({...newTeamPlayer,name:e.target.value})} placeholder="Player name"
                  style={{flex:2,minWidth:100,padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12}}/>
                <select value={newTeamPlayer.pos} onChange={e=>setNewTeamPlayer({...newTeamPlayer,pos:e.target.value})}
                  style={{padding:"7px 10px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12}}>
                  {["WR","RB","TE","QB"].map(p=><option key={p}>{p}</option>)}
                </select>
                <input value={newTeamPlayer.age||""} onChange={e=>setNewTeamPlayer({...newTeamPlayer,age:e.target.value})} placeholder="Age"
                  style={{width:48,padding:"7px 8px",background:"#0d0d0d",border:"1px solid #333",borderRadius:7,color:"#fff",fontSize:12}}/>
                <button onClick={()=>{if(!newTeamPlayer.name)return;setTeamRoster([...teamRoster,{...newTeamPlayer}]);setNewTeamPlayer({name:"",pos:"WR",age:"",tier:""});}}
                  style={{padding:"7px 13px",background:"#FFD700",border:"none",borderRadius:7,color:"#000",fontWeight:900,cursor:"pointer",fontSize:12}}>+ Add</button>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:12,padding:20}}>
                <div style={{fontSize:13,fontWeight:900,color:"#FFD700",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>🎯 Draft Capital</div>
                {picks.length===0&&<div style={{color:"#444",fontSize:13,marginBottom:12}}>No picks logged.</div>}
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                  {picks.map((p,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:"#080808",borderRadius:7,border:"1px solid #181818"}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#FFD700"}}>{p.year}</span>
                      <span style={{fontSize:13,flex:1}}>{p.round} Round</span>
                      <span style={{fontSize:11,color:"#666"}}>{p.est}</span>
                      <button onClick={()=>setPicks(picks.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#333",cursor:"pointer"}}>✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={()=>setPicks([...picks,{year:2027,round:"1st",est:"Mid"}])}
                  style={{padding:"7px 13px",background:"transparent",border:"1px solid #FFD700",borderRadius:7,color:"#FFD700",fontWeight:700,cursor:"pointer",fontSize:12}}>+ Add Pick</button>
              </div>
              <div style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:12,padding:20}}>
                <div style={{fontSize:13,fontWeight:900,color:"#FFD700",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>📊 Team Grades</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
                  {[{l:"Grade",v:grade.g,c:grade.c,s:grade.l},{l:"Avg Age",v:avgAge,c:Number(avgAge)<=24?"#10b981":Number(avgAge)<=26?"#FFD700":"#ef4444",s:"of roster"},{l:"Elite Assets",v:eliteCount,c:"#FFD700",s:"Top tiers"},{l:"Draft Picks",v:picks.length,c:"#3b82f6",s:"banked"}].map(({l,v,c,s})=>(
                    <div key={l} style={{background:"#080808",borderRadius:8,padding:12,border:"1px solid #181818",textAlign:"center"}}>
                      <div style={{fontSize:26,fontWeight:900,color:c}}>{v}</div>
                      <div style={{fontSize:10,fontWeight:700,color:"#888",marginTop:2}}>{l}</div>
                      <div style={{fontSize:9,color:"#444"}}>{s}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="outlook" && (
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <div style={{background:"linear-gradient(135deg,#111,#1a1200)",border:`2px solid ${grade.c}`,borderRadius:16,padding:32,textAlign:"center"}}>
              <div style={{fontSize:64,fontWeight:900,color:grade.c,lineHeight:1}}>{grade.g}</div>
              <div style={{fontSize:18,fontWeight:700,color:"#fff",marginTop:8}}>{grade.l}</div>
              <div style={{fontSize:12,color:"#666",marginTop:4}}>Dynasty Team Rating</div>
            </div>
            <div style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:12,padding:22}}>
              <div style={{fontSize:12,fontWeight:900,color:"#FFD700",marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>📈 Position Breakdown</div>
              {["WR","RB","TE","QB"].map(pos=>{
                const ps=teamRoster.filter(p=>p.pos===pos);
                const v=ps.length===0?{t:"⚠️ No players",c:"#ef4444"}:ps.length>=3?{t:"✅ Good depth",c:"#10b981"}:ps.length>=1?{t:"🟡 Thin — need depth",c:"#FFD700"}:{t:"🔴 Missing",c:"#ef4444"};
                return(
                  <div key={pos} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 0",borderBottom:"1px solid #181818"}}>
                    <span style={{width:34,height:34,borderRadius:7,background:POS_COLORS[pos]+"22",border:`1px solid ${POS_COLORS[pos]}`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,color:POS_COLORS[pos]}}>{pos}</span>
                    <span style={{width:60,fontSize:12,color:"#666"}}>{ps.length} player{ps.length!==1?"s":""}</span>
                    <span style={{flex:1,fontSize:13,color:v.c}}>{v.t}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
