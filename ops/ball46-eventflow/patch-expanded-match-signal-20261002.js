const fs=require('fs');
const input=process.argv[2];
const output=process.argv[3]||input;
if(!input)throw Error('INPUT_REQUIRED');
let s=fs.readFileSync(input,'utf8');
if(s.includes('B46_EVENTFLOW_SIGNAL_ENTRY_20261002'))throw Error('ALREADY_PATCHED');
function once(from,to,label){const n=s.split(from).length-1;if(n!==1)throw Error(`${label}_ANCHOR_COUNT_${n}`);s=s.replace(from,to)}
once("const VERSION='343-expanded-match-v4-stable-lifecycle';","const VERSION='343-expanded-match-v4-stable-lifecycle-signal-entry-20261002';\nconst B46_EVENTFLOW_SIGNAL_ENTRY_20261002=true;",'VERSION');
once('let lastAnchorTop=null;','let lastAnchorTop=null;\nlet signalRows=[];','STATE');
const helpers=String.raw`function matchMinute(v){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  const t=String(v).trim();
  let m=t.match(/^(\d{1,3})\s*\+\s*(\d{1,2})(?::(\d{1,2}))?$/);if(m)return Number(m[1])+Number(m[2])+(Number(m[3]||0)/60);
  m=t.match(/^(\d{1,3}):(\d{1,2})$/);if(m)return Number(m[1])+(Number(m[2])/60);
  const n=Number(t.replace(/['’]/g,''));return Number.isFinite(n)?n:null;
}
function signalMinute(s){return matchMinute(s?.matchTime??s?.entryClock??s?.entryMinute??s?.minute)}
function signalMarket(s){const x=String(s?.marketLabel||s?.market||s?.providerMarket||'SIGNAL').toLowerCase();if(/corner/.test(x))return'CORNERS';if(/card/.test(x))return'CARDS';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1X2';if(/asian|handicap|(^|[^a-z])ah([^a-z]|$)/.test(x))return'AH';if(/over|under|o\/u|goal[_ -]?line|total/.test(x))return'O/U';return'SIGNAL'}
function signalLineText(s){const line=num(s?.line??s?.selectionLine??s?.providerLine);return line===null?'':(line>0?'+':'')+(Number.isInteger(line)?String(line):line.toFixed(2).replace(/0+$/,'').replace(/\.$/,''))}
function signalTitle(s){const m=signalMinute(s),market=signalMarket(s),pick=String(s?.selection||s?.providerLineSide||'').trim().toUpperCase(),line=signalLineText(s),odds=num(s?.odds),book=String(s?.bookmaker||'').trim();return [(m===null?'—':m.toFixed(m%1?1:0))+"'",market,[pick,line].filter(Boolean).join(' '),odds===null?'':'@'+odds.toFixed(2),book].filter(Boolean).join(' · ')}
function signalsForFixture(id){const key=String(id||'');return signalRows.filter(s=>String(s?.fixtureId??'')===key&&signalMinute(s)!==null).sort((a,b)=>(signalMinute(a)??0)-(signalMinute(b)??0)||Number(a?.createdAt||0)-Number(b?.createdAt||0))}
function pressureAt(points,minute){if(!points.length)return{home:50,away:50};let a=points[0],b=points[points.length-1];for(let i=0;i<points.length;i++){if(points[i].minute<=minute)a=points[i];if(points[i].minute>=minute){b=points[i];break}}if(a===b||Math.abs(b.minute-a.minute)<.001)return{home:a.home,away:a.away};const t=clamp((minute-a.minute)/(b.minute-a.minute),0,1);return{home:a.home+(b.home-a.home)*t,away:a.away+(b.away-a.away)*t}}
function signalSide(s){const x=String(s?.selection??s?.providerLineSide??'').trim().toLowerCase();if(x==='home'||x.includes('home'))return'home';if(x==='away'||x.includes('away'))return'away';return null}
function signalMarkers(rows,points,current,w,h,pad){
  const grouped=new Map();for(const s of Array.isArray(rows)?rows:[]){const m=signalMinute(s);if(m===null||m<0||m>current+.75)continue;const key=(Math.round(m*10)/10).toFixed(1);if(!grouped.has(key))grouped.set(key,{minute:m,rows:[]});grouped.get(key).rows.push(s)}
  let i=0,out='';for(const g of grouped.values()){
    const x=xFor(g.minute,w,pad,current),p=pressureAt(points,g.minute),ys=g.rows.map(s=>{const side=signalSide(s);return yFor(side?p[side]:(p.home+p.away)/2,h,pad)}),y=ys.reduce((a,v)=>a+v,0)/Math.max(1,ys.length),count=g.rows.length,label=count>1?'SIGNAL×'+count:'SIGNAL',labelY=clamp(y-(i%2?24:13),pad.top+10,h-pad.bottom-8),details=g.rows.map(signalTitle).join(' | '),fresh=g.rows.some(s=>{const t=num(s?.createdAt);return t!==null&&Date.now()-t>=0&&Date.now()-t<12000});
    out+='<g class="b46-eventflow-signal-entry" data-signal-minute="'+g.minute.toFixed(2)+'"><title>'+esc(details)+'</title><line x1="'+x.toFixed(1)+'" y1="'+pad.top+'" x2="'+x.toFixed(1)+'" y2="'+(h-pad.bottom)+'" stroke="#0aa86e" stroke-width="1" stroke-dasharray="4 5" opacity=".30" vector-effect="non-scaling-stroke"/><circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="5.4" fill="#0acb7c" stroke="#ffffff" stroke-width="2.2" vector-effect="non-scaling-stroke"/>'+(fresh?'<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="7" fill="none" stroke="#0acb7c" stroke-width="1.5" opacity=".65" vector-effect="non-scaling-stroke"><animate attributeName="r" values="7;12;7" dur="1.2s" repeatCount="4"/><animate attributeName="opacity" values=".65;.08;.65" dur="1.2s" repeatCount="4"/></circle>':'')+'<text x="'+x.toFixed(1)+'" y="'+labelY.toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="800" fill="#087a4d" stroke="#ffffff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">'+label+' '+Math.round(g.minute)+"'</text></g>";i++
  }return out
}
function renderFlow(f,history,signals=[]){
`;
once('function renderFlow(f,history){\n',helpers,'RENDER_FUNCTION');
const stateLine="const w=1000,h=232,pad={left:42,right:18,top:14,bottom:30},last=points[points.length-1],hx=xFor(last.minute,w,pad,current),hy=yFor(last.home,h,pad),ay=yFor(last.away,h,pad),safe=norm(fixtureId(f))||'flow';";
once(stateLine,stateLine+"\n  const signalMarks=signalMarkers(signals,points,current,w,h,pad),signalCount=Array.isArray(signals)?signals.filter(x=>{const m=signalMinute(x);return m!==null&&m<=current+.75}).length:0;",'FLOW_STATE');
once('<small>${points.length} points · missing early history stays blank</small>','<small>${points.length} points · missing early history stays blank${signalCount?` · ${signalCount} signal entr${signalCount===1?\'y\':\'ies\'}`:\'\'}</small>','LEGEND');
once('<circle cx="${hx}" cy="${hy}" r="2.4" class="expand-flow-end home"/><circle cx="${hx}" cy="${ay}" r="2.4" class="expand-flow-end away"/></svg></div>`;','<circle cx="${hx}" cy="${hy}" r="2.4" class="expand-flow-end home"/><circle cx="${hx}" cy="${ay}" r="2.4" class="expand-flow-end away"/>${signalMarks}</svg></div>`;','SVG_MARKER');
once('setHtmlIfChanged(flow,renderFlow(fixture,histRes.value));','setHtmlIfChanged(flow,renderFlow(fixture,histRes.value,signalsForFixture(id)));','FLOW_CALL');
const setHtml="function setHtmlIfChanged(node,html){if(node&&node.innerHTML!==html)node.innerHTML=html}\n";
once(setHtml,setHtml+"function rerenderSignalEntries(){if(!expandedId||!expandedEl)return;const fixture=boardCache.data?findFixture(boardCache.data,expandedId):null,history=historyCache.get(expandedId)?.data,flow=expandedEl.querySelector('.expand-flow-card');if(fixture&&history&&flow)setHtmlIfChanged(flow,renderFlow(fixture,history,signalsForFixture(expandedId)))}\nfunction takeSignalRows(rows){signalRows=Array.isArray(rows)?rows.slice():[];requestAnimationFrame(rerenderSignalEntries)}\nwindow.addEventListener('ball46:signals-snapshot',e=>takeSignalRows(e.detail?.signals));\n",'SIGNAL_SYNC');
once("function init(){\n  const board=$('[data-board-sections]');if(!board)return;","function init(){\n  try{takeSignalRows(window.NOMAD343_DASHBOARD_V2?.getSignals?.())}catch{}\n  const board=$('[data-board-sections]');if(!board)return;",'INIT');
const beforeFetch=(fs.readFileSync(input,'utf8').match(/\bfetch\(/g)||[]).length;
const afterFetch=(s.match(/\bfetch\(/g)||[]).length;
if(beforeFetch!==afterFetch)throw Error(`FETCH_COUNT_CHANGED_${beforeFetch}_${afterFetch}`);
for(const marker of ['B46_EVENTFLOW_SIGNAL_ENTRY_20261002','ball46:signals-snapshot','signalMarkers','signalsForFixture'])if(!s.includes(marker))throw Error('PATCH_MARKER_MISSING_'+marker);
fs.writeFileSync(output,s);
console.log(JSON.stringify({ok:true,beforeFetch,afterFetch,bytes:s.length}));