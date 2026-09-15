import { useState, useEffect } from "react";
import type { LiveMatchState } from "./types";
import { loadMatchState, listenBroadcast } from "./sync";

function fmtTime(s: number) {
  const m=Math.floor(s/60),sec=s%60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

interface Props { tableId: string }

export default function PlayerView({ tableId }: Props) {
  const [state, setState] = useState<LiveMatchState | null>(() => loadMatchState(tableId));

  useEffect(() => {
    const poll = setInterval(() => setState(loadMatchState(tableId)), 1000);
    const unsub = listenBroadcast((tid, s) => { if(tid===tableId) setState(s); });
    return () => { clearInterval(poll); unsub(); };
  }, [tableId]);

  if (!state) return (
    <div className="h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="font-display text-2xl text-foreground">Waiting for match...</p>
        <p className="font-mono text-xs text-muted-foreground/40 mt-2">{tableId}</p>
      </div>
    </div>
  );

  const { config, matchPts, framePts, bScores, striker, bStriker, brk, reds, colorsIdx, nextColor, frameElapsed, shotTimeLeft, shotActive, currentSeqIdx } = state;
  const needed = Math.ceil(config.bestOf / 2);
  const isDoubles = config.matchMode === "doubles";
  const p = (i:0|1) => isDoubles ? config.teams![i].name : config.players[i].name;
  const ph = (i:0|1) => isDoubles ? null : config.players[i].photo;

  const fd = config.customSequence[currentSeqIdx % Math.max(1,config.customSequence.length)];
  const effectiveGame = fd?.type ?? "snooker";
  const scores = effectiveGame==="billiards" ? bScores : framePts;
  const curStriker = effectiveGame==="billiards" ? bStriker : striker;

  const phaseLabel = colorsIdx!==null
    ? ["Yellow","Green","Brown","Blue","Pink","Black"][colorsIdx]+" next"
    : nextColor?"Any colour":reds>0?`${reds} reds`:"Colours";

  const shotWarn = shotActive && shotTimeLeft <= 10;
  const shotCaution = shotActive && shotTimeLeft > 10 && shotTimeLeft <= Math.ceil((config.shotSecs||30)*0.35);

  return (
    <div className="h-screen bg-background flex flex-col select-none" style={{maxWidth:"480px",margin:"0 auto"}}>
      {/* Table + game info */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0" style={{background:"rgba(0,0,0,0.4)"}}>
        {config.clubLogo&&<img src={config.clubLogo} className="h-7 w-7 object-contain"/>}
        <span className="font-mono text-xs text-muted-foreground flex-1 truncate">{config.tableName}</span>
        <span className="font-mono text-xs text-muted-foreground/40">{fd?.type==="billiards"?"Billiards":`Snooker ${fd?.reds??15}r`}</span>
      </div>

      {/* Player panels – very large */}
      <div className="grid grid-cols-2 border-b border-border flex-shrink-0">
        {([0,1] as const).map(i=>(
          <div key={i} className={`py-4 px-3 flex flex-col items-center gap-2 transition-colors
            ${i===0?"border-r border-border":""} ${curStriker===i?"bg-primary/10":""}`}>
            {ph(i)?<img src={ph(i)!} className="w-14 h-14 rounded-full object-cover border-2" style={{borderColor:curStriker===i?"rgba(196,136,46,0.8)":"transparent"}}/>
              :<div className="w-14 h-14 rounded-full bg-primary/20 border-2 flex items-center justify-center" style={{borderColor:curStriker===i?"rgba(196,136,46,0.8)":"transparent"}}>
                <span className="font-display text-3xl text-primary">{p(i)[0]}</span>
              </div>
            }
            <p className="font-mono text-xs text-muted-foreground text-center truncate w-full">{p(i)}</p>
            <p className="font-mono text-6xl text-foreground leading-none">{scores[i]}</p>
            {curStriker===i&&<div className="w-2 h-2 rounded-full bg-accent animate-pulse"/>}
            <div className="flex gap-1 mt-1">
              {Array.from({length:Math.min(needed,9)}).map((_,j)=>(
                <div key={j} className={`w-2 h-2 rounded-full ${j<matchPts[i]?"bg-accent":"border border-border"}`}/>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Phase info */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0" style={{background:"rgba(0,0,0,0.2)"}}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Phase</p>
            <p className="font-display text-lg text-foreground">{phaseLabel}</p>
          </div>
          {effectiveGame==="snooker"&&brk>0&&(
            <div className="text-right">
              <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Break</p>
              <p className="font-mono text-2xl text-accent">{brk}</p>
            </div>
          )}
          <div className="text-right">
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Frame</p>
            <p className="font-mono text-lg text-muted-foreground/70">{fmtTime(frameElapsed)}</p>
          </div>
        </div>
      </div>

      {/* Shot clock – very prominent */}
      {config.shotSecs>0&&(
        <div className="flex-shrink-0 mx-4 mt-4">
          <div className={`rounded-2xl border p-5 flex items-center gap-4 transition-colors ${shotWarn?"border-destructive bg-destructive/10":shotCaution?"border-accent/50 bg-accent/5":"border-border bg-card"}`}>
            <div className="flex-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Shot Clock</p>
              <p className={`font-mono text-5xl font-bold mt-1 ${shotWarn?"text-destructive":shotCaution?"text-accent":"text-foreground"}`}>
                {shotActive ? shotTimeLeft : "--"}
              </p>
            </div>
            {/* Ring progress */}
            {shotActive&&config.shotSecs>0&&(()=>{
              const r=32,circ=2*Math.PI*r,pct=shotTimeLeft/config.shotSecs;
              const stroke=shotWarn?"#b83030":shotCaution?"#c4882e":"#2a7048";
              return (
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(223,214,188,0.07)" strokeWidth="6"/>
                    <circle cx="36" cy="36" r={r} fill="none" stroke={stroke} strokeWidth="6"
                      strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
                      style={{transition:"stroke-dashoffset 0.9s linear"}}/>
                  </svg>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* "Now playing" indicator */}
      <div className="flex-1 flex flex-col items-center justify-end pb-10 px-4">
        <div className="text-center">
          <p className="font-mono text-xs text-muted-foreground/40 uppercase tracking-widest mb-1">Now at the table</p>
          <p className="font-display text-3xl text-foreground">{p(curStriker)}</p>
          {isDoubles&&config.teams&&<p className="font-mono text-sm text-muted-foreground/60 mt-1">({config.teams[curStriker].name})</p>}
        </div>
      </div>
    </div>
  );
}
