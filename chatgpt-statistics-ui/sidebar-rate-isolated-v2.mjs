// Staging only. Existing materialized graph already stores win_rate on every settlement.
export const markets=['all','1X2','AH','O/U','BTTS','Corners','Cards','Other'];
const replaceOnce=(s,a,b)=>{if(s.split(a).length!==2)throw Error('ISOLATED_ANCHOR_DRIFT_'+a.slice(0,80));return s.replace(a,()=>b)};
export function storedRates(graphs){
 try{
  const out={};
  for(const m of markets){
   const g=graphs[m],c=g?.counts,w=c?.WIN+c?.HALF_WIN,l=c?.LOSS+c?.HALF_LOSS;
   if(!c||!['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)||w+l+c.PUSH!==g.summary.rows)return null;
   const v=g.win_rate;
   if(!Number.isFinite(v)||v<0||v>100)return null;
   out[m]=w+l===0?null:v;
  }
  return out;
 }catch{return null}
}
export function sanitizeRates(v){
 try{if(!v||!markets.every(m=>Object.hasOwn(v,m)&&(v[m]===null||typeof v[m]==='number'&&Number.isFinite(v[m])&&v[m]>=0&&v[m]<=100)))return null;return Object.fromEntries(markets.map(k=>[k,v[k]]))}catch{return null}
}
// The optional field is sourced from the graph map already read by the Receiver.
// No projection mutation, raw row scan, journal, storage put or new service call.
export function patchProjection(s){
 const a="return json({...g,generation:s.generation,sequence:s.sequence,readOnly:true});";
 return replaceOnce(s,a,"return json({...g,generation:s.generation,sequence:s.sequence,readOnly:true,sidebar_win_rate:storedRates(graphs)});")+"\n"+storedRates.toString()+"\nconst markets="+JSON.stringify(markets)+";\n";
}
export function patchProxy(s){
 const a="summary:s,counts:c,series:d.series},200,'RECEIVER')";
 return replaceOnce(s,a,"summary:s,counts:c,series:d.series,...((()=>{const v=sanitizeRates(d.sidebar_win_rate);return v?{sidebar_win_rate:v}:{}})())},200,'RECEIVER')")+"\n"+sanitizeRates.toString().replaceAll("markets.every","rateMarkets.every").replaceAll("markets.map","rateMarkets.map")+"\nconst rateMarkets="+JSON.stringify(markets)+";\n";
}
// Bridge runs asynchronously AFTER the native graph rendered successfully.
// Failure never reaches chart's try/catch. No dependency on Sidebar availability.
export function patchGraphBridge(s){
 const a="b46GraphKey=key;b46Last=Date.now();b46FailedAt=0;renderFromStats(b46GraphData,'receiver');";
 return replaceOnce(s,a,a+"\n  try{queueMicrotask(()=>{try{document.dispatchEvent(new CustomEvent('b46:isolated-sidebar-rate',{detail:{rates:g.sidebar_win_rate,sequence:g.sequence}}))}catch{}})}catch{}\n");
}
// Append a separate display layer. Native b nodes, count logic, click handlers,
// navigation, graph code and history code are NOT replaced. No fetch or observer.
export function appendSidebar(s){
 return s+"\n;("+sidebarDisplay.toString()+")();\n";
}
function sidebarDisplay(){
 try{
  const alias={all:'all','1x2':'1X2',ah:'AH',ou:'O/U',corners:'Corners',btts:'BTTS',cards:'Cards',other:'Other'};
  const selector='[data-stat-market]';
  let applied=-1;
  const cls='b46-isolated-rate-v2';
  const style=document.createElement('style');
  style.textContent='[data-stat-market][data-isolated-rate-ready] b{display:none!important} [data-stat-market] .'+cls+'{font-family:inherit;font-size:10px;font-weight:800;line-height:1.2;white-space:nowrap;margin-left:auto;flex-shrink:0;font-variant-numeric:tabular-nums} @media(max-width:850px){[data-stat-market] .'+cls+'{font-size:8px}}';
  document.head.append(style);
  function fallback(){for(const b of document.querySelectorAll(selector)){b.removeAttribute('data-isolated-rate-ready');b.querySelector('.'+cls)?.remove()}}
  document.addEventListener('b46:isolated-sidebar-rate',event=>{
   try{
    const d=event.detail,v=d?.rates;
    if(!Number.isSafeInteger(d?.sequence)||d.sequence<applied)return;
    applied=d.sequence;
    if(!v||!Object.values(alias).every(k=>Object.hasOwn(v,k)&&(v[k]===null||typeof v[k]==='number'&&Number.isFinite(v[k])&&v[k]>=0&&v[k]<=100))){fallback();return}
    for(const b of document.querySelectorAll(selector)){
     const k=alias[b.dataset.statMarket],original=b.querySelector('b');
     if(!k||!original)continue;
     const value=v[k],rounded=value===null?null:Number(value.toFixed(2));
     let el=b.querySelector('.'+cls);
     if(!el){el=document.createElement('span');el.className=cls;original.insertAdjacentElement('afterend',el)}
     el.textContent=value===null?'—':value.toFixed(2)+'%';
     el.title='All-time Win Rate · excludes PUSH';
     el.style.color=rounded===null?'#91aa9b':rounded>50?'#22c55e':rounded<50?'#f87171':'#facc15';
     b.setAttribute('data-isolated-rate-ready','1');
    }
   }catch{try{fallback()}catch{}}
  });
 }catch{}
}
