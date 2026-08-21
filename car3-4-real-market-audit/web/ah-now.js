const DEFAULT_WORKER='https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev';
let workerUrl=DEFAULT_WORKER;
let latestMatches=[];

const num=value=>{const n=Number(value);return Number.isFinite(n)?n:null;};
const fmtLine=value=>{const n=num(value);if(n===null)return'—';return `${n>0?'+':''}${Number.isInteger(n)?n:n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}`;};
const fmtOdds=value=>{const n=num(value);return n===null?'—':n.toFixed(2);};
const liveAge=ah=>{const t=Date.parse(ah?.updatedAt||'');return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/1000)):num(ah?.marketAgeSeconds);};
const ageText=value=>{
  const n=num(value);
  if(n===null)return'updated —';
  if(n<5)return'updated just now';
  if(n<60)return`updated ${Math.round(n)}s ago`;
  return`updated ${Math.floor(n/60)}m ago`;
};
function state(match){
  const d=String(match?.engine?.decision||'WATCH').toUpperCase();
  if(d.includes('SIGNAL'))return'SIGNAL';
  if(d==='NEAR'||Number(match?.engine?.streak||0)>0)return'CLOSE';
  return'WATCHING';
}
function rank(match){const s=state(match);return s==='SIGNAL'?3:s==='CLOSE'?2:1;}
function visible(match){
  return match?.realMarket?.status==='MATCH'||match?.engine?.decision==='NEAR'||String(match?.engine?.decision||'').toUpperCase().includes('SIGNAL')||Number(match?.engine?.streak||0)>0;
}
function statusLabel(status){
  const s=String(status||'WAITING').toUpperCase();
  if(s==='NO_AH'||s==='NOT_FOUND')return'AH UNAVAILABLE';
  if(s==='KEY_MISSING')return'AH KEY MISSING';
  if(s==='ERROR')return'AH ERROR';
  return'AH WAIT';
}
function decorate(match,card){
  let strip=card.querySelector('.ah-now-strip');
  if(!strip){
    strip=document.createElement('div');
    strip.className='ah-now-strip';
    const sub=card.querySelector('.match-sub');
    if(sub)sub.insertAdjacentElement('afterend',strip); else card.append(strip);
  }
  const ah=match?.currentAh||null;
  const line=num(ah?.line),home=num(ah?.homeOdds),away=num(ah?.awayOdds);
  const ready=String(ah?.status||'').toUpperCase()==='MATCH'&&line!==null&&home!==null&&away!==null;
  const provider=String(ah?.provider||match?.realMarket?.source||'1xbet').toUpperCase();
  const detectorLine=num(match?.engine?.selectedLine??match?.engine?.line),detectorOdds=num(match?.engine?.odds);
  const detectorSide=String(match?.engine?.side||'').toUpperCase();
  const detectorMeta=detectorLine!==null&&detectorOdds!==null?` · detector ${detectorSide||'SIDE'} ${fmtLine(detectorLine)} @ ${fmtOdds(detectorOdds)}`:'';
  strip.innerHTML=ready
    ? `<small>AH NOW · ${provider}</small><strong>HOME ${fmtLine(line)} @ ${fmtOdds(home)} <span>· AWAY ${fmtLine(-line)} @ ${fmtOdds(away)}</span></strong><em>${ageText(liveAge(ah))}${detectorMeta}</em>`
    : `<small>AH NOW · ${provider}</small><strong>${statusLabel(ah?.status)}</strong><em>Current live AH price is not available for this match.</em>`;
}
function decorateCurrent(){
  const holder=document.querySelector('#candidateCards');
  if(!holder)return;
  const cards=[...holder.querySelectorAll('.match-card')];
  latestMatches.forEach((match,index)=>{if(cards[index])decorate(match,cards[index]);});
}
async function loadRuntime(){
  try{
    const response=await fetch('./runtime.json',{cache:'no-store'});
    if(response.ok){
      const runtime=await response.json();
      workerUrl=runtime.workerUrl||DEFAULT_WORKER;
    }
  }catch{}
}
async function refresh(){
  try{
    const response=await fetch(`${workerUrl}/live`,{cache:'no-store'});
    if(!response.ok)return;
    const payload=await response.json();
    latestMatches=(Array.isArray(payload?.matches)?payload.matches:[])
      .filter(visible)
      .sort((a,b)=>rank(b)-rank(a)||(num(b?.engine?.momentum)||0)-(num(a?.engine?.momentum)||0))
      .slice(0,16);
    decorateCurrent();
  }catch{}
}
const style=document.createElement('style');
style.textContent=`
.ah-now-strip{margin:0 16px 10px;padding:8px 10px;border-radius:9px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);display:grid;gap:2px}
.ah-now-strip small{font-size:8px;font-weight:900;letter-spacing:.06em;color:#98a091}
.ah-now-strip strong{font-size:11px;color:#f2f4ef}
.ah-now-strip strong span{color:#c5ccc5;font-weight:800}
.ah-now-strip em{font-size:8px;color:#7f887f;font-style:normal}
@media(max-width:700px){.ah-now-strip{margin:0 10px 8px;padding:7px 8px}.ah-now-strip strong{font-size:10px}}
`;
document.head.append(style);
const holder=document.querySelector('#candidateCards');
if(holder)new MutationObserver(()=>decorateCurrent()).observe(holder,{childList:true});
await loadRuntime();
await refresh();
setInterval(refresh,15000);
