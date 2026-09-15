import { useState, useRef } from "react";
import { ChevronLeft, Upload, X, ArrowUp, ArrowDown } from "lucide-react";
import type {
  AppView, Player, DoublesTeam, MatchConfig, FrameDef,
  GameType, BillMode, MatchMode,
} from "./types";
import { DEFAULT_SNOOKER_FRAME, DEFAULT_BILLIARDS_FRAME } from "./types";
import { uid, loadTables } from "./sync";

interface Props {
  tableId: string;
  onNavigate: (v: AppView, ctx?: Record<string, string>) => void;
  onBegin: (cfg: MatchConfig) => void;
}

const TIME_OPTS = [
  { l:"15m",s:900 },{ l:"30m",s:1800 },{ l:"45m",s:2700 },
  { l:"1h",s:3600 },{ l:"1½h",s:5400 },{ l:"2h",s:7200 },
  { l:"3h",s:10800 },{ l:"4h",s:14400 },{ l:"6h",s:21600 },
];
const BILL_TARGETS = [100,150,200,300,400,500,800,1000,];
const SHOT_OPTS    = [0,10,15,20,25,30,40];

function clamp(v:number,lo:number,hi:number){return Math.max(lo,Math.min(hi,v));}

function ImgBox({value,onChange,circle=false,label}:{value:string|null;onChange:(v:string|null)=>void;circle?:boolean;label:string}){
  const ref=useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
      <div onClick={()=>ref.current?.click()}
        className={`relative bg-card border border-border cursor-pointer hover:border-primary/50 transition-all group overflow-hidden flex items-center justify-center
          ${circle?"rounded-full w-16 h-16":"rounded-lg w-full h-14"}`}>
        {value ? (
          <>
            <img src={value} className="w-full h-full object-cover"/>
            <button onClick={e=>{e.stopPropagation();onChange(null);}}
              className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={11}/></button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-0.5 text-muted-foreground/40"><Upload size={15}/><span className="font-mono text-xs">Upload</span></div>
        )}
        <input ref={ref} type="file" accept="image/*" className="hidden"
          onChange={e=>{const f=e.target.files?.[0];if(f)onChange(URL.createObjectURL(f));}}/>
      </div>
    </div>
  );
}

function newPlayer(i:number):Player{return{id:uid(),name:"",photo:null};}

export default function MatchSetup({tableId,onNavigate,onBegin}:Props){
  const tables = loadTables();
  const tableName = tables.find(t=>t.id===tableId)?.name ?? tableId;

  // Branding
  const [eventTitle,setEventTitle]=useState("");
  const [matchTitle,setMatchTitle]=useState("");
  const [matchStatus,setMatchStatus]=useState("League Match");
  const [clubLogo,setClubLogo]=useState<string|null>(null);
  const [sponsors,setSponsors]=useState<string[]>([]);

  // Mode
  const [matchMode,setMatchMode]=useState<MatchMode>("singles");
  const [gameType,setGameType]=useState<GameType>("snooker");

  // Singles players
  const [players,setPlayers]=useState<[Player,Player]>([newPlayer(0),newPlayer(1)]);
  const [photos,setPhotos]=useState<[string|null,string|null]>([null,null]);
  const [handicaps,setHandicaps]=useState<[number,number]>([0,0]);

  // Doubles teams
  const [teams,setTeams]=useState<[DoublesTeam,DoublesTeam]>([
    {name:"Team A",players:[newPlayer(0),newPlayer(1)]},
    {name:"Team B",players:[newPlayer(2),newPlayer(3)]},
  ]);
  const [teamHandicaps,setTeamHandicaps]=useState<[number,number]>([0,0]);

  // Format
  const [bestOf,setBestOf]=useState(7);
  const [shotSecs,setShotSecs]=useState(0);
  const [customReds,setCustomReds]=useState(15);

  // Billiards
  const [billMode,setBillMode]=useState<BillMode>("points");
  const [billTarget,setBillTarget]=useState(300);
  const [billDuration,setBillDuration]=useState(3600);

  // PL-Mix sequence
  const [sequence,setSequence]=useState<FrameDef[]>([
    {...DEFAULT_SNOOKER_FRAME},{...DEFAULT_BILLIARDS_FRAME},
    {...DEFAULT_SNOOKER_FRAME},{...DEFAULT_BILLIARDS_FRAME},
  ]);

  const needed=Math.ceil(bestOf/2);

  function updPlayer(i:0|1,patch:Partial<Player>){
    setPlayers(prev=>{const n:[Player,Player]=[...prev] as [Player,Player];n[i]={...n[i],...patch};return n;});
  }
  function updPhoto(i:0|1,v:string|null){setPhotos(prev=>{const n:[string|null,string|null]=[...prev] as [string|null,string|null];n[i]=v;return n;});}
  function adjHc(i:0|1,d:number){setHandicaps(prev=>{const n:[number,number]=[...prev] as [number,number];n[i]=clamp(n[i]+d,-200,200);return n;});}
  function adjTeamHc(i:0|1,d:number){setTeamHandicaps(prev=>{const n:[number,number]=[...prev] as [number,number];n[i]=clamp(n[i]+d,-200,200);return n;});}

  function seqAdd(type:"snooker"|"billiards"){
    setSequence(s=>[...s,type==="snooker"?{...DEFAULT_SNOOKER_FRAME}:{...DEFAULT_BILLIARDS_FRAME}]);
  }
  function seqRemove(i:number){setSequence(s=>s.filter((_,j)=>j!==i));}
  function seqMove(i:number,dir:-1|1){
    setSequence(s=>{const n=[...s],j=i+dir;if(j<0||j>=n.length)return s;[n[i],n[j]]=[n[j],n[i]];return n;});
  }
  function seqPatch(i:number,patch:Partial<FrameDef>){
    setSequence(s=>s.map((fd,j)=>j===i?{...fd,...patch}:fd));
  }

  function buildConfig():MatchConfig{
    const p1:Player={...players[0],photo:photos[0]};
    const p2:Player={...players[1],photo:photos[1]};
    const cfg:MatchConfig={
      id:uid(), tableId, tableName, eventTitle, matchTitle, matchStatus, clubLogo, sponsors,
      bestOf, shotSecs, gameType, matchMode,
      customSequence: gameType==="pl-mix" ? sequence : [{
        type: gameType==="snooker"?"snooker":"billiards",
        reds: customReds,
        billMode, billTarget, billDuration,
      }],
      players:[p1,p2], handicaps,
    };
    if(matchMode==="doubles") cfg.teams=teams;
    return cfg;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-10" style={{background:"rgba(13,24,17,0.98)"}}>
        <button onClick={()=>onNavigate("orgHub")} className="text-muted-foreground hover:text-foreground"><ChevronLeft size={20}/></button>
        <div className="flex-1">
          <h1 className="font-display text-xl text-foreground">Match Setup</h1>
          <p className="font-mono text-xs text-muted-foreground/50">{tableName}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-12 max-w-sm mx-auto w-full space-y-7">

        {/* ── Event branding ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <Label>Event Branding</Label>
          <input value={eventTitle} onChange={e=>setEventTitle(e.target.value)} placeholder="Tournament / Event Title"
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 font-display text-base text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"/>
          <div className="grid grid-cols-2 gap-3">
            <input value={matchTitle} onChange={e=>setMatchTitle(e.target.value)} placeholder="Match Title (e.g. Semi Final)"
              className="bg-card border border-border rounded-lg px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"/>
            <input value={matchStatus} onChange={e=>setMatchStatus(e.target.value)} placeholder="Status (e.g. Final)"
              className="bg-card border border-border rounded-lg px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ImgBox value={clubLogo} onChange={setClubLogo} label="Club Logo"/>
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1.5">Sponsors</p>
              <div className="flex gap-2 flex-wrap">
                {sponsors.map((s,i)=>(
                  <div key={i} className="relative w-14 h-14 rounded-lg border border-border overflow-hidden group">
                    <img src={s} className="w-full h-full object-contain bg-card p-1"/>
                    <button onClick={()=>setSponsors(sp=>sp.filter((_,j)=>j!==i))}
                      className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-background/70"><X size={13}/></button>
                  </div>
                ))}
                {sponsors.length<3&&<label className="w-14 h-14 rounded-lg border border-border bg-card flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 text-muted-foreground/40 gap-0.5">
                  <Upload size={13}/><span className="font-mono text-xs">Add</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)setSponsors(sp=>[...sp,URL.createObjectURL(f)]);}}/>
                </label>}
              </div>
            </div>
          </div>
        </section>

        {/* ── Match mode ──────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <Label>Match Mode</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["singles","doubles"] as MatchMode[]).map(m=>(
              <button key={m} onClick={()=>setMatchMode(m)}
                className={`py-3 rounded-xl border font-display text-lg transition-all ${matchMode===m?"bg-primary border-primary text-primary-foreground":"bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                {m==="singles"?"Singles":"Doubles"}
              </button>
            ))}
          </div>
        </section>

        {/* ── Players / Teams ──────────────────────────────────────────────── */}
        {matchMode==="singles" ? (
          <section className="space-y-3">
            <Label>Players</Label>
            {([0,1] as const).map(i=>(
              <div key={i} className="flex items-end gap-3">
                <div className="flex-shrink-0">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1.5">Photo</p>
                  <div onClick={()=>{}} className="relative w-16 h-16 rounded-full bg-card border border-border cursor-pointer hover:border-primary/50 transition-all group overflow-hidden flex items-center justify-center">
                    {photos[i]?<img src={photos[i]!} className="w-full h-full object-cover"/>:<Upload size={15} className="text-muted-foreground/40"/>}
                    <label className="absolute inset-0 cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)updPhoto(i,URL.createObjectURL(f));}}/>
                    </label>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1.5">Player {i+1}</label>
                  <input value={players[i].name} onChange={e=>updPlayer(i,{name:e.target.value})}
                    placeholder={`Player ${i+1}`}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2.5 font-display text-lg text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"/>
                </div>
              </div>
            ))}
            {/* Handicaps */}
            <div className="bg-card border border-border rounded-xl p-3 space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Handicaps</p>
              {([0,1] as const).map(i=>(
                <div key={i} className="flex items-center gap-1.5">
                  <span className="font-display text-sm text-foreground flex-1 truncate">{players[i].name||`Player ${i+1}`}</span>
                  <div className="flex items-center gap-1">
                    {[-10,-5,-1].map(d=><button key={d} onClick={()=>adjHc(i,d)} className="w-7 h-7 border border-border rounded bg-background font-mono text-xs text-muted-foreground hover:text-foreground transition-all">{d}</button>)}
                    <span className="font-mono text-sm text-foreground w-10 text-center">{handicaps[i]>=0?`+${handicaps[i]}`:handicaps[i]}</span>
                    {[1,5,10].map(d=><button key={d} onClick={()=>adjHc(i,d)} className="w-7 h-7 border border-border rounded bg-background font-mono text-xs text-muted-foreground hover:text-foreground transition-all">+{d}</button>)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            <Label>Teams</Label>
            {([0,1] as const).map(ti=>(
              <div key={ti} className="bg-card border border-border rounded-xl p-3 space-y-2">
                <input value={teams[ti].name} onChange={e=>setTeams(prev=>{const n:[DoublesTeam,DoublesTeam]=[...prev] as [DoublesTeam,DoublesTeam];n[ti]={...n[ti],name:e.target.value};return n;})}
                  placeholder={`Team ${ti+1} Name`}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 font-display text-base text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"/>
                {([0,1] as const).map(pi=>(
                  <input key={pi} value={teams[ti].players[pi].name}
                    onChange={e=>setTeams(prev=>{const n:[DoublesTeam,DoublesTeam]=[...prev] as [DoublesTeam,DoublesTeam];n[ti]={...n[ti],players:[...n[ti].players] as [Player,Player]};n[ti].players[pi]={...n[ti].players[pi],name:e.target.value};return n;})}
                    placeholder={`Player ${pi+1}`}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-display text-base text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"/>
                ))}
                {/* Team handicap */}
                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <span className="font-mono text-xs text-muted-foreground flex-1">Handicap</span>
                  <div className="flex items-center gap-1">
                    {[-10,-5,-1].map(d=><button key={d} onClick={()=>adjTeamHc(ti,d)} className="w-7 h-7 border border-border rounded bg-background font-mono text-xs text-muted-foreground hover:text-foreground">{d}</button>)}
                    <span className="font-mono text-sm text-foreground w-10 text-center">{teamHandicaps[ti]>=0?`+${teamHandicaps[ti]}`:teamHandicaps[ti]}</span>
                    {[1,5,10].map(d=><button key={d} onClick={()=>adjTeamHc(ti,d)} className="w-7 h-7 border border-border rounded bg-background font-mono text-xs text-muted-foreground hover:text-foreground">+{d}</button>)}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── Game type ────────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <Label>Game Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {([["snooker","Snooker"],["billiards","Billiards"],["pl-mix","PL Mix"]] as [GameType,string][]).map(([g,l])=>(
              <button key={g} onClick={()=>setGameType(g)}
                className={`py-3 rounded-xl border font-display text-base transition-all ${gameType===g?"bg-primary border-primary text-primary-foreground":"bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Snooker reds */}
          {gameType==="snooker" && (
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">Reds</p>
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {[1,3,6,10,15].map(n=>(
                  <button key={n} onClick={()=>setCustomReds(n)}
                    className={`py-2 rounded-lg border font-mono text-sm transition-all ${customReds===n?"bg-primary border-primary text-primary-foreground":"bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                    {n}r
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-2.5">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Custom</span>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setCustomReds(r=>clamp(r-1,1,15))} className="w-8 h-8 border border-border rounded-lg font-mono text-lg text-muted-foreground hover:text-foreground disabled:opacity-20 flex items-center justify-center" disabled={customReds<=1}>−</button>
                  <span className="font-mono text-xl text-foreground w-8 text-center">{customReds}</span>
                  <button onClick={()=>setCustomReds(r=>clamp(r+1,1,15))} className="w-8 h-8 border border-border rounded-lg font-mono text-lg text-muted-foreground hover:text-foreground disabled:opacity-20 flex items-center justify-center" disabled={customReds>=15}>+</button>
                </div>
              </div>
            </div>
          )}

          {/* Billiards options */}
          {gameType==="billiards" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["points","time"] as BillMode[]).map(m=>(
                  <button key={m} onClick={()=>setBillMode(m)}
                    className={`py-3 rounded-xl border transition-all ${billMode===m?"bg-primary border-primary text-primary-foreground":"bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                    <span className="font-display text-base block">{m==="points"?"Points":"Timed"}</span>
                    <span className="font-mono text-xs opacity-70">{m==="points"?"First to target":"Most at time"}</span>
                  </button>
                ))}
              </div>
              {billMode==="points" ? (
                <div className="grid grid-cols-3 gap-2">
                  {BILL_TARGETS.map(n=>(
                    <button key={n} onClick={()=>setBillTarget(n)}
                      className={`py-2.5 rounded-lg border font-mono text-sm transition-all ${billTarget===n?"bg-primary border-primary text-primary-foreground":"bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {TIME_OPTS.slice(0,8).map(opt=>(
                    <button key={opt.s} onClick={()=>setBillDuration(opt.s)}
                      className={`py-2 rounded-lg border font-mono text-xs transition-all ${billDuration===opt.s?"bg-primary border-primary text-primary-foreground":"bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PL Mix sequence */}
          {gameType==="pl-mix" && (
            <div className="space-y-2">
              {sequence.map((fd,i)=>(
                <div key={i} className="bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 p-2.5">
                    <span className="font-mono text-xs text-muted-foreground w-4">{i+1}.</span>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:fd.type==="billiards"?"#1A4DA8":fd.reds<=6?"#C9960A":"#BE1E1E"}}/>
                    <span className="font-display text-sm text-foreground flex-1">{fd.type==="billiards"?"English Billiards":`Snooker (${fd.reds}r)`}</span>
                    <button onClick={()=>seqMove(i,-1)} disabled={i===0} className="w-6 h-6 border border-border rounded flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20"><ArrowUp size={10}/></button>
                    <button onClick={()=>seqMove(i,1)} disabled={i===sequence.length-1} className="w-6 h-6 border border-border rounded flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20"><ArrowDown size={10}/></button>
                    <button onClick={()=>seqRemove(i)} className="w-6 h-6 border border-border rounded flex items-center justify-center text-muted-foreground hover:text-destructive"><X size={10}/></button>
                  </div>
                  {fd.type==="snooker" && (
                    <div className="border-t border-border/50 px-3 pb-2 pt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground/50">Reds:</span>
                      {[1,3,6,10,15].map(n=><button key={n} onClick={()=>seqPatch(i,{reds:n})} className={`px-2 py-0.5 rounded font-mono text-xs transition-all ${fd.reds===n?"bg-primary text-primary-foreground":"border border-border text-muted-foreground hover:text-foreground"}`}>{n}r</button>)}
                    </div>
                  )}
                  {fd.type==="billiards" && (
                    <div className="border-t border-border/50 px-3 pb-2 pt-1.5 space-y-1.5">
                      <div className="flex gap-1.5">
                        {(["points","time"] as BillMode[]).map(m=><button key={m} onClick={()=>seqPatch(i,{billMode:m})} className={`px-2.5 py-1 rounded border font-mono text-xs transition-all ${fd.billMode===m?"bg-primary border-primary text-primary-foreground":"border-border text-muted-foreground hover:border-primary/40"}`}>{m==="points"?"Points":"Timed"}</button>)}
                      </div>
                      {fd.billMode==="points" ? (
                        <div className="flex gap-1 flex-wrap">
                          {[100,200,300,500].map(n=><button key={n} onClick={()=>seqPatch(i,{billTarget:n})} className={`px-2 py-0.5 rounded font-mono text-xs transition-all ${fd.billTarget===n?"bg-primary text-primary-foreground":"border border-border text-muted-foreground hover:text-foreground"}`}>{n}</button>)}
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {TIME_OPTS.slice(0,5).map(opt=><button key={opt.s} onClick={()=>seqPatch(i,{billDuration:opt.s})} className={`px-2 py-0.5 rounded font-mono text-xs transition-all ${fd.billDuration===opt.s?"bg-primary text-primary-foreground":"border border-border text-muted-foreground hover:text-foreground"}`}>{opt.l}</button>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={()=>seqAdd("snooker")} className="flex-1 py-2.5 border border-border rounded-xl bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all flex flex-col items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#BE1E1E]"/><span className="font-mono text-xs">+ Snooker</span>
                </button>
                <button onClick={()=>seqAdd("billiards")} className="flex-1 py-2.5 border border-border rounded-xl bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all flex flex-col items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#1A4DA8]"/><span className="font-mono text-xs">+ Billiards</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Best of / Shot clock ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <Label>Best Of</Label>
            <div className="grid grid-cols-5 gap-2 mt-2 mb-1.5">
              {[3,5,7,9,11].map(n=>(
                <button key={n} onClick={()=>setBestOf(n)}
                  className={`py-2.5 rounded-lg border font-mono text-sm transition-all ${bestOf===n?"bg-primary border-primary text-primary-foreground":"bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                  {n}
                </button>
              ))}
            </div>
            <p className="font-mono text-xs text-muted-foreground/40">First to {needed} · Bo{bestOf}</p>
          </div>
          <div>
            <Label>Shot Clock</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {SHOT_OPTS.map(n=>(
                <button key={n} onClick={()=>setShotSecs(n)}
                  className={`py-2.5 rounded-lg border font-mono text-sm transition-all ${shotSecs===n?"bg-primary border-primary text-primary-foreground":"bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
                  {n===0?"Off":`${n}s`}
                </button>
              ))}
            </div>
          </div>
        </section>

        <button onClick={()=>onBegin(buildConfig())}
          className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-display text-xl hover:opacity-90 active:opacity-80 transition-opacity">
          Begin Match
        </button>
      </div>
    </div>
  );
}

function Label({children}:{children:React.ReactNode}){
  return <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-1.5">{children}</p>;
}
